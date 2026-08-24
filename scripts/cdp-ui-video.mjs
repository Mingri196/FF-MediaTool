// 模块三 UI 检查：视频转换页 / 剪辑页渲染
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

  const clickNav = async (label) => {
    await evaljs(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.includes(${JSON.stringify(label)})); if (b) { b.click(); return true; } return false; })()`);
    await SLEEP(400);
  };

  // 视频转换页
  await clickNav("视频转换");
  const v = await evaljs(`JSON.stringify({
    title: document.body.innerText.includes('视频转换'),
    hasCodec: document.body.innerText.includes('视频编码器'),
    hasQuality: document.body.innerText.includes('CRF'),
    hasFilter: document.body.innerText.includes('滤镜与增强'),
    hasPreview: document.body.innerText.includes('命令预览'),
    hasStart: document.body.innerText.includes('开始处理'),
    buttons: document.querySelectorAll('button').length
  })`);
  console.log("VIDEO CONVERT PAGE:", v);

  // 剪辑页
  await clickNav("视频剪辑");
  const c = await evaljs(`JSON.stringify({
    title: document.body.innerText.includes('视频剪辑'),
    hasTrim: document.body.innerText.includes('时间裁剪'),
    hasConcat: document.body.innerText.includes('多片段拼接'),
    hasEncode: document.body.innerText.includes('编码设置'),
    buttons: document.querySelectorAll('button').length
  })`);
  console.log("VIDEO CLIP PAGE:", c);

  // 批量页
  await clickNav("批量任务");
  const b = await evaljs(`document.body.innerText.includes('排队队列')`);
  console.log("BATCH PAGE:", b);

  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });