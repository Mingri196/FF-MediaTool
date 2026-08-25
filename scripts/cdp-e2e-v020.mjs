// v0.20 E2E：日志展开布局 + 拖拽反馈 + 版本号 + 任务回归
const PORT = "9223";
const TEST_DIR = process.env.LOCALAPPDATA + "\\Temp\\ffmt-test";
const INPUT = TEST_DIR + "\\input.mp4";
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
  const invoke = async (cmd, args) => {
    const r = await evaljs(`window.__TAURI_INTERNALS__.invoke('${cmd}', ${JSON.stringify(args ?? {})}).then(v => JSON.stringify({ok:true, v})).catch(e => JSON.stringify({ok:false, e:String(e)}))`);
    const parsed = JSON.parse(r);
    if (!parsed.ok) throw new Error(`invoke ${cmd} failed: ${parsed.e}`);
    return parsed.v;
  };

  // === T1: 版本号 ===
  console.log("\n=== T1: 版本号 v0.20 ===");
  await evaljs(`(() => {
    const btns = [...document.querySelectorAll('button')];
    const btn = btns.find(b => b.textContent.includes('设置'));
    if (btn) btn.click();
  })()`);
  await SLEEP(400);
  const ver = await evaljs(`document.body.innerText.match(/v0\\.\\d+/)?.[0] ?? 'none'`);
  console.log("Version found:", ver);
  if (ver !== "v0.20") throw new Error("T1 FAILED: 版本号应为 v0.20");

  // === T2: 日志展开布局（45vh 高度 + 右侧列） ===
  console.log("\n=== T2: 日志展开布局 ===");
  const before = await evaljs(`(() => {
    const bar = [...document.querySelectorAll('div')].find(d => d.className.includes('border-t') && d.className.includes('h-[200px]'));
    return bar ? bar.getBoundingClientRect().height : 'no bar';
  })()`);
  console.log("Collapsed bar height:", before);
  // 点击展开（工具栏最右按钮）
  const expandR = await evaljs(`(() => {
    const btns = [...document.querySelectorAll('button')];
    const btn = btns.find(b => b.title === '展开' || b.title === 'Expand');
    if (!btn) return 'no expand btn';
    btn.click(); return 'clicked';
  })()`);
  console.log("Expand clicked:", expandR);
  await SLEEP(300);
  const expandedState = await evaljs(`(() => {
    const bar = [...document.querySelectorAll('div')].find(d => d.className.includes('border-t') && d.style.height && parseInt(d.style.height) > 200);
    const h = bar ? Math.round(bar.getBoundingClientRect().height) : 0;
    const logPanel = [...document.querySelectorAll('div')].find(d => d.style.width && parseInt(d.style.width) > 200 && d.querySelector('[class*="font-mono"]'));
    const w = logPanel ? Math.round(logPanel.getBoundingClientRect().width) : 0;
    return JSON.stringify({ barH: h, logW: w });
  })()`);
  console.log("Expanded:", expandedState);
  const { barH, logW } = JSON.parse(expandedState);
  if (barH < 300) throw new Error("T2 FAILED: 展开高度应 ≈45vh (>300px): " + barH);
  if (logW < 200) throw new Error("T2 FAILED: 日志列宽度应 ≥200px: " + logW);

  // === T3: 拖拽高亮反馈（HTML5 事件模拟） ===
  console.log("\n=== T3: 拖拽高亮反馈 ===");
  await evaljs(`(() => {
    const nav = [...document.querySelectorAll('button')];
    const btn = nav.find(b => b.textContent.includes('视频转换'));
    if (btn) btn.click();
  })()`);
  await SLEEP(400);
  const dropZone = await evaljs(`(() => {
    const dzEl = document.querySelector('.relative.h-full');
    if (!dzEl) return 'no dz';
    const ev = new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
    dzEl.dispatchEvent(ev);
    return 'dispatched';
  })()`);
  console.log("DragEnter:", dropZone);
  await SLEEP(200);
  const overlay = await evaljs(`document.body.innerText.includes('松开鼠标导入文件') || document.body.innerText.includes('Release to import file')`);
  console.log("Overlay visible:", overlay);
  if (!overlay) throw new Error("T3 FAILED: 拖拽高亮 overlay 未出现");
  await evaljs(`(() => {
    const dzEl = document.querySelector('.relative.h-full');
    const ev = new DragEvent('dragleave', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
    dzEl.dispatchEvent(ev);
  })()`);
  await SLEEP(200);
  const overlayGone = await evaljs(`!(document.body.innerText.includes('松开鼠标导入文件') || document.body.innerText.includes('Release to import file'))`);
  console.log("Overlay gone after leave:", overlayGone);

  // === T4: 任务回归（真实转码） ===
  console.log("\n=== T4: 真实转码回归 ===");
  const out = TEST_DIR + "\\v020-regression.mp4";
  const task = { name: "v020 regression", args: ["-i", INPUT, "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-c:a", "copy", out], inputPath: INPUT, outputPath: out };
  await invoke("task_add", { task });
  await evaljs(`new Promise(r => setTimeout(r, 200))`);
  const status1 = await invoke("tasks_snapshot", {});
  console.log("Task queued, status:", status1.current?.name ?? status1.queue[0]?.name ?? "?");
  // 等待完成（轮询：current 或 history 首条）
  let done = false;
  for (let i = 0; i < 60; i++) {
    await SLEEP(1000);
    const snap = await invoke("tasks_snapshot", {});
    const t = snap.current ?? snap.history[0];
    if (t && (t.status === "completed" || t.status === "failed")) { console.log("Final status:", t.status, "| error:", t.error ?? "none"); done = true; break; }
  }
  if (!done) throw new Error("T4 FAILED: 任务超时");
  const snap2 = await invoke("tasks_snapshot", {});
  const final = snap2.current ?? snap2.history[0];
  if (final?.status !== "completed") throw new Error("T4 FAILED: 转码未完成: " + final?.status);

  console.log("\n=== ALL v0.20 E2E TESTS PASSED ===");
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });