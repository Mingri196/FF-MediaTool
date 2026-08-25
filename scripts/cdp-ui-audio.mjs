// 模块四 UI 检查
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
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    }
  };
  await new Promise((r) => (ws.onopen = r));
  const evaljs = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return r.exceptionDetails ? "ERR" : r.result?.value;
  };
  await evaljs(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.includes('音频转换')); if (b) b.click(); })()`);
  await SLEEP(400);
  const r = await evaljs(`JSON.stringify({
    title: document.body.innerText.includes('音频转换'),
    hasFormats: document.body.innerText.includes('FLAC') && document.body.innerText.includes('Opus'),
    hasModes: document.body.innerText.includes('CBR') && document.body.innerText.includes('VBR') && document.body.innerText.includes('无损压缩'),
    hasChannels: document.body.innerText.includes('5.1'),
    hasFx: document.body.innerText.includes('消人声') && document.body.innerText.includes('均衡器'),
    hasSplit: document.body.innerText.includes('分割为多段'),
    buttons: document.querySelectorAll('button').length
  })`);
  console.log("AUDIO CONVERT PAGE:", r);
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });