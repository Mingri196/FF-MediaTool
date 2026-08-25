// 调试2：原生 dragenter 是否到达 #root（React 委托点）
const PORT = "9223";
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json`);
  const pages = await res.json();
  const page = pages.find((p) => p.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = ++id; pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
  };
  await new Promise((r) => (ws.onopen = r));
  const evaljs = (expression) => send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }).then((r) => r.exceptionDetails ? "ERR:" + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text) : r.result?.value);

  const r = await evaljs(`(async () => {
    const log = [];
    // 全局原生监听
    document.addEventListener('dragenter', () => log.push('doc:dragenter'), true);
    document.addEventListener('dragenter', () => log.push('doc:dragenter-bubble'), false);
    const root = document.getElementById('root');
    root.addEventListener('dragenter', () => log.push('root:dragenter'), true);

    const dz = [...document.querySelectorAll('div')].find(d => d.className === 'relative h-full');
    if (!dz) return 'no DropZone root';
    log.push('dz found: ' + (dz.className));

    const ev = new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
    dz.dispatchEvent(ev);
    await new Promise(r => setTimeout(r, 200));

    const overlay = [...document.querySelectorAll('div')].filter(d => (d.className||'').includes('border-2 border-dashed'));
    return JSON.stringify({ log, overlayCount: overlay.length, overlayCls: overlay[0]?.className?.slice(0,80) });
  })()`);
  console.log("Result:", r);
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });