// v0.30 E2E: 图片转换模块 + 导航 + 回归
const PORT = "9223";
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const page = pages.find((p) => p.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (m, params={}) => new Promise((res, rej) => { const i = ++id; pending.set(i, {res, rej}); ws.send(JSON.stringify({id:i, method:m, params})); });
  ws.onmessage = (ev) => { const msg = JSON.parse(ev.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); } };
  await new Promise((r) => (ws.onopen = r));
  const evaljs = (expression) => send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }).then((r) => r.exceptionDetails ? "ERR:" + (r.exceptionDetails.exception?.description ?? "").slice(0, 140) : r.result?.value);

  // === T1: 版本号 ===
  console.log("=== T1: 版本号 v0.30 ===");
  await evaljs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('设置'))?.click()`);
  await SLEEP(400);
  const ver = await evaljs(`document.body.innerText.match(/v0\\.\\d+/)?.[0] ?? 'none'`);
  console.log("Version:", ver);
  if (ver !== "v0.30") throw new Error("T1 FAILED");

  // === T2: 导航栏图片转换入口 ===
  console.log("\n=== T2: 图片转换导航 ===");
  const navBtn = await evaljs(`(() => {
    const btns = [...document.querySelectorAll('button')];
    const btn = btns.find(b => b.textContent.includes('图片转换') || b.textContent.includes('Image Convert'));
    return btn ? 'found' : 'not found';
  })()`);
  console.log("Nav button:", navBtn);
  if (navBtn !== "found") throw new Error("T2 FAILED: 导航栏无图片转换入口");
  const navClick = await evaljs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('图片转换') || b.textContent.includes('Image Convert'))?.click()`);
  await SLEEP(500);
  const h1 = await evaljs(`document.querySelector('h1')?.textContent ?? 'none'`);
  console.log("Page title:", h1);
  if (!h1.includes("图片转换") && !h1.includes("Image Convert")) throw new Error("T2 FAILED: 页面未切换: " + h1);

  // === T3: 页面元素检查 ===
  console.log("\n=== T3: 页面元素 ===");
  const hasFileList = await evaljs(`document.body.innerText.includes('文件列表') || document.body.innerText.includes('File list')`);
  const hasFormat = await evaljs(`document.body.innerText.includes('JPEG') || document.body.innerText.includes('输出格式') || document.body.innerText.includes('Output format')`);
  const hasStart = await evaljs(`document.body.innerText.includes('批量转换') || document.body.innerText.includes('Batch convert')`);
  console.log("File list:", hasFileList, "| Format:", hasFormat, "| Start:", hasStart);
  if (!hasFileList || !hasFormat || !hasStart) throw new Error("T3 FAILED: 页面元素缺失");

  // === T4: 图片转码（真实 ffmpeg） ===
  console.log("\n=== T4: 图片转码 ===");
  const invoke = async (cmd, args) => {
    const r = await evaljs(`window.__TAURI_INTERNALS__.invoke('${cmd}', ${JSON.stringify(args ?? {})}).then(v => JSON.stringify({ok:true, v})).catch(e => JSON.stringify({ok:false, e:String(e)}))`);
    const parsed = JSON.parse(r);
    if (!parsed.ok) throw new Error(cmd + ': ' + parsed.e);
    return parsed.v;
  };
  const INPUT = 'C:/Users/Mingri/AppData/Local/Temp/ffmt-test/input.mp4';
  // 用 builder 生成图片转码命令（从视频提取第一帧 → JPEG）
  const args = await evaljs(`(async () => {
    const { buildImageArgs } = await import('/src/image/builder.ts');
    const { defaultImageParams } = await import('/src/image/types.ts');
    const p = defaultImageParams();
    p.format = 'jpg';
    p.quality = 85;
    return buildImageArgs(p, '${INPUT}', 'C:/Users/Mingri/AppData/Local/Temp/ffmt-test/img-test.jpg').join(' ');
  })()`);
  console.log("CMD:", args.slice(0, 80));
  await invoke('task_add', { task: { name: 'v0.30 img', args: args.split(' '), inputPath: INPUT, outputPath: 'C:/Users/Mingri/AppData/Local/Temp/ffmt-test/img-test.jpg' } });
  let done = false;
  for (let i = 0; i < 60; i++) {
    await SLEEP(1000);
    const snap = await invoke('tasks_snapshot', {});
    const t = snap.current ?? snap.history[0];
    if (t && (t.status === 'completed' || t.status === 'failed')) { console.log('Task:', t.status, t.error ?? ''); done = true; break; }
  }
  if (!done) throw new Error('T4 FAILED: timeout');
  // 验证输出文件存在
  const exists = await invoke('check_output_file', { path: 'C:/Users/Mingri/AppData/Local/Temp/ffmt-test/img-test.jpg' });
  console.log("Output exists:", exists.exists);
  if (!exists.exists) throw new Error('T4 FAILED: 输出文件不存在');

  console.log("\n=== ALL v0.30 E2E TESTS PASSED ===");
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });