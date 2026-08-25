// v0.24 E2E：HTML5 拖拽全链路（Input.dispatchDragEvent 原生输入通道模拟）
const PORT = "9223";
const TEST_DIR = process.env.LOCALAPPDATA + "\\Temp\\ffmt-test";
const INPUT = TEST_DIR + "\\input.mp4";
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
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
  const evaljs = (expression) => send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }).then((r) => r.exceptionDetails ? "ERR:" + (r.exceptionDetails.exception?.description ?? "").slice(0, 160) : r.result?.value);

  // 导航到视频转换页
  await evaljs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('视频转换'))?.click()`);
  await SLEEP(500);
  console.log("H1:", await evaljs(`document.querySelector('h1')?.textContent`));

  // === T1: 版本号 ===
  console.log("\n=== T1: 版本号 ===");
  await evaljs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('设置'))?.click()`);
  await SLEEP(400);
  const ver = await evaljs(`document.body.innerText.match(/v0\\.\\d+/)?.[0] ?? 'none'`);
  console.log("Version:", ver);
  if (ver !== "v0.24") throw new Error("T1 FAILED");

  // 回到视频转换页
  await evaljs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('视频转换'))?.click()`);
  await SLEEP(500);

  // === T2: dragenter 高亮 ===
  console.log("\n=== T2: dragenter 高亮 ===");
  await send("Input.dispatchDragEvent", {
    type: "dragEnter",
    x: 640, y: 300,
    data: { items: [{ mimeType: "video/mp4", data: "x" }], files: [], dragOperationsMask: 1 },
  });
  await SLEEP(200);
  const overlay = await evaljs(`document.body.innerText.includes('松开鼠标导入文件') || document.body.innerText.includes('Release to import file')`);
  console.log("Overlay:", overlay);
  if (!overlay) throw new Error("T2 FAILED: 拖拽高亮未出现");

  // === T3: Tauri drop 事件 → 导入（真实拖拽走 onDragDropEvent，数据格式等同 emit 模拟） ===
  console.log("\n=== T3: Tauri drop 导入 ===");
  console.log("DropReady:", await evaljs(`window.__ffmtDropReady`));
  const emitR = await evaljs(`(async () => {
    try {
      const { getCurrentWebview } = await import('/node_modules/.vite/deps/@tauri-apps_api_webview.js');
      await getCurrentWebview().emit('tauri://drag-drop', { type: 'drop', paths: [${JSON.stringify(INPUT)}], position: { x: 640, y: 300 } });
      return 'emitted';
    } catch (e) { return 'ERR:' + e.message; }
  })()`);
  console.log("Emit:", emitR);
  await SLEEP(1500);
  const inputVal = await evaljs(`[...document.querySelectorAll('input')].find(i => i.readOnly)?.value?.slice(0, 80) ?? 'none'`);
  console.log("Input after drop:", inputVal);
  if (!inputVal.includes("input.mp4")) throw new Error("T3 FAILED: 文件未导入: " + inputVal);
  const probeOk = await evaljs(`document.body.innerText.includes('16:9') || document.body.innerText.includes('8.0') || document.body.innerText.includes('00:08')`);
  console.log("Probe info:", probeOk);
  if (!probeOk) throw new Error("T3 FAILED: 媒体信息未加载");

  // === T4: 格式校验（Tauri 事件通道） ===
  console.log("\n=== T4: 格式校验 ===");
  await evaljs(`(async () => {
    const { getCurrentWebview } = await import('/node_modules/.vite/deps/@tauri-apps_api_webview.js');
    await getCurrentWebview().emit('tauri://drag-drop', { type: 'drop', paths: [${JSON.stringify(TEST_DIR + "\\note.txt")}], position: { x: 640, y: 300 } });
  })()`);
  await SLEEP(800);
  const errShown = await evaljs(`document.body.innerText.includes('仅支持视频') || document.body.innerText.includes('Only video') || document.body.innerText.includes('不支持的文件格式') || document.body.innerText.includes('Unsupported format')`);
  console.log("Error toast:", errShown);
  if (!errShown) throw new Error("T4 FAILED: 不支持格式未提示");

  console.log("\n=== ALL v0.24 E2E TESTS PASSED ===");
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });