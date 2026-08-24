// 诊断：查看最近任务状态 + 验证事件监听
const PORT = "9223";
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json`);
  const pages = await res.json();
  const page = pages.find((p) => p.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    }
  };
  await new Promise((r) => (ws.onopen = r));
  const evaljs = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return "ERR: " + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result?.value;
  };

  // 1. 任务快照详情
  const snap = await evaljs(`window.__TAURI_INTERNALS__.invoke('tasks_snapshot').then(s => JSON.stringify(s, null, 1))`);
  console.log("SNAPSHOT:");
  console.log(snap);

  // 2. 重新安装事件监听并验证
  const ins = await evaljs(`(async () => {
    try {
      const m = await import('@tauri-apps/api/event');
      if (typeof m.listen !== 'function') return 'listen NOT a function: ' + Object.keys(m).join(',');
      if (window.__evts) window.__evts.length = 0;
      else window.__evts = [];
      window.__unlisten2 = await m.listen('task://event', (e) => window.__evts.push(e.payload));
      return 'listener OK';
    } catch (e) { return 'IMPORT FAIL: ' + e.message; }
  })()`);
  console.log("LISTENER:", ins);

  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });