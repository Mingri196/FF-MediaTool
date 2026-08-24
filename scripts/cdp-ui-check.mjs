// UI 渲染验证：底部任务栏 + 批量任务页导航
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

  // 1. 当前页面（默认设置页）底部栏检查
  const bar = await evaljs(`JSON.stringify({
    hasIdle: document.body.innerText.includes('添加任务'),
    buttons: document.querySelectorAll('button').length,
    text: document.body.innerText.slice(0, 120)
  })`);
  console.log("SETTINGS PAGE:", bar);

  // 2. 点击"批量任务"导航
  await evaljs(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('批量任务'));
    if (btn) { btn.click(); return true; }
    return false;
  })()`);
  await SLEEP(500);
  const batch = await evaljs(`JSON.stringify({
    title: document.body.innerText.split('\\n').slice(0,3).join(' | '),
    hasQueueSection: document.body.innerText.includes('排队队列'),
    hasHistorySection: document.body.innerText.includes('历史记录'),
    hasAdd: document.body.innerText.includes('添加任务'),
    historyRows: document.body.innerText.split('\\n').filter(l => l.includes('.mp4') || l.includes('.mkv')).length
  })`);
  console.log("BATCH PAGE:", batch);

  // 3. 清空已结束（测试遗留清理）
  await evaljs(`window.__TAURI_INTERNALS__.invoke('task_clear_finished').then(() => 'cleared')`);
  const snap = await evaljs(`window.__TAURI_INTERNALS__.invoke('tasks_snapshot').then(s => JSON.stringify({q: s.queue.length, h: s.history.length}))`);
  console.log("AFTER CLEAR:", snap);

  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });