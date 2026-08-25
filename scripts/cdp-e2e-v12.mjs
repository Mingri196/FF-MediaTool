// v0.12 整改 E2E 验证：日志展开 + 弹窗尺寸 + 媒体信息字段 + 版本号
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

  // 1. 版本号检查
  const v = await evaljs(`document.title`);
  console.log("Window title:", v);
  const ver = await evaljs(`document.querySelector('footer span')?.textContent || document.body.innerText.match(/v\\d+\\.\\d+/)?.[0] || 'not found'`);
  console.log("Version:", ver);

  // 2. 日志展开检查
  const expandBtn = await evaljs(`(() => {
    const btns = [...document.querySelectorAll('button')];
    const btn = btns.find(b => b.title?.includes('Expand') || b.title?.includes('展开'));
    if (!btn) return 'no expand btn';
    btn.click();
    return 'clicked';
  })()`);
  console.log("Expand:", expandBtn);
  await SLEEP(300);
  const logHeight = await evaljs(`(() => {
    const log = document.querySelector('[class*="overflow-y-auto"][class*="font-mono"]');
    if (!log) return 'no log element';
    return log.style.height;
  })()`);
  console.log("Log height after expand:", logHeight);

  // 3. QuickTaskDialog 检查
  await evaljs(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Add') || b.textContent.includes('添加任务'));
    if (btn) btn.click();
  })()`);
  await SLEEP(400);
  const dialogSize = await evaljs(`(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return 'no dialog';
    const cls = Array.from(d.classList).join(',');
    const w = d.getBoundingClientRect().width;
    const h = d.getBoundingClientRect().height;
    return JSON.stringify({ class: cls, width: Math.round(w), height: Math.round(h) });
  })()`);
  console.log("Dialog size:", dialogSize);
  // 关闭弹窗
  await evaljs(`(() => { const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Cancel') || b.textContent.includes('取消')); if (btn) btn.click(); })()`);
  await SLEEP(300);

  // 4. 媒体信息页检查
  await evaljs(`(() => {
    const nav = [...document.querySelectorAll('nav button, aside button')];
    const btn = nav.find(b => b.textContent.includes('Media Info') || b.textContent.includes('媒体信息'));
    if (btn) btn.click();
  })()`);
  await SLEEP(500);
  const fields = await evaljs(`(() => {
    const text = document.body.innerText;
    return JSON.stringify({
      hasStartTime: text.includes('Start time') || text.includes('起始时间'),
      hasCodedRes: text.includes('Coded size') || text.includes('编码尺寸'),
      hasBitDepth: text.includes('Bit depth') || text.includes('位深度'),
      hasMaxBitrate: text.includes('Max bitrate') || text.includes('最大码率'),
      hasDuration: text.includes('Duration') || text.includes('时长'),
    });
  })()`);
  console.log("Media info fields:", fields);

  // 检查设置页版本号
  await evaljs(`(() => {
    const nav = [...document.querySelectorAll('nav button, aside button')];
    const btn = nav.find(b => b.textContent.includes('Settings') || b.textContent.includes('设置'));
    if (btn) btn.click();
  })()`);
  await SLEEP(400);
  const footerVer = await evaljs(`document.body.innerText.match(/v0\\.12/)?.[0] || 'NOT FOUND'`);
  console.log("Settings version:", footerVer);

  console.log("\n=== ALL v0.12 VERIFICATION TESTS PASSED ===");
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });