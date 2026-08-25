// 调试：拖拽高亮为什么没出现
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

  // 1. 当前在什么页面？
  console.log("URL:", await evaljs(`location.href`));
  console.log("H1:", await evaljs(`[...document.querySelectorAll('h1')].map(h => h.textContent).join('|')`));
  // 2. 是否有 DropZone（找 textContent 含视频转换的 div 层级）
  const mock = await evaljs(`(() => {
    const dzs = [...document.querySelectorAll('div')].filter(d => d.querySelector('h1'));
    const info = dzs.slice(0, 8).map(d => ({ cls: (d.className||'').toString().slice(0,60), h1: d.querySelector('h1')?.textContent, w: d.querySelector('h1')?.getBoundingClientRect().width }));
    return JSON.stringify(info);
  })()`);
  console.log("H1 divs:", mock);
  // 3. 检查是否有 DragEvent/DataTransfer 支持
  console.log("DragEvent ok:", await evaljs(`(() => { try { const ev = new DragEvent('dragenter', { bubbles: true, cancelable: true }); return 'ok'; } catch(e) { return 'ERR:' + e.message; } })()`));
  console.log("DataTransfer ok:", await evaljs(`(() => { try { const dt = new DataTransfer(); return 'ok:' + typeof dt; } catch(e) { return 'ERR:' + e.message; } })()`));
  // 4. 在含 h1 的最外层 div 上派发 dragenter（带 dataTransfer），检查 overlay
  const r = await evaljs(`(async () => {
    const dz = [...document.querySelectorAll('div')].find(d => d.querySelector('h1')?.textContent.includes('视频转换') || d.querySelector('h1')?.textContent.includes('Video Convert'));
    if (!dz) return 'no dz';
    try {
      const ev = new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
      dz.dispatchEvent(ev);
    } catch(e) { return 'dispatch ERR:' + e.message; }
    await new Promise(r => setTimeout(r, 300));
    return document.body.innerText.includes('松开鼠标导入文件') ? 'OVERLAY SHOWN' : 'overlay absent; last url=' + location.href;
  })()`);
  console.log("Result:", r);
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });