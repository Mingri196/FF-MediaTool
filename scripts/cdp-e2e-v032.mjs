// v0.32 E2E: 版本号 + 导航 + 添加文件夹按钮 + 自定义分辨率 + 重名处理修复
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
  console.log("=== T1: 版本号 v0.32 ===");
  await evaljs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('设置'))?.click()`);
  await SLEEP(400);
  const ver = await evaljs(`document.body.innerText.match(/v0\\.\\d+/)?.[0] ?? 'none'`);
  console.log("Version:", ver);
  if (ver !== "v0.32") throw new Error("T1 FAILED");

  // === T2: 导航到图片转换 ===
  console.log("\n=== T2: 图片转换导航 ===");
  await evaljs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('图片转换'))?.click()`);
  await SLEEP(500);
  const h1 = await evaljs(`document.querySelector('h1')?.textContent ?? 'none'`);
  console.log("Page:", h1);
  if (!h1.includes("图片转换")) throw new Error("T2 FAILED");

  // === T3: 添加文件夹按钮存在 ===
  console.log("\n=== T3: 添加文件夹按钮 ===");
  const hasFolderBtn = await evaljs(`document.body.innerText.includes('添加文件夹') || document.body.innerText.includes('Add Folder')`);
  console.log("Add Folder btn:", hasFolderBtn);
  if (!hasFolderBtn) throw new Error("T3 FAILED");

  // === T4: 自定义分辨率选项存在 ===
  console.log("\n=== T4: 自定义分辨率 ===");
  // 点击所有 Select 触发 portal 渲染
  await evaljs(`(async () => {
    const cbs = document.querySelectorAll('[role=combobox]');
    for (const cb of cbs) { cb.click(); await new Promise(r => setTimeout(r, 100)); }
  })()`);
  await SLEEP(300);
  const hasCustom = await evaljs(`document.body.innerText.includes('自定义分辨率') || document.body.innerText.includes('Custom Resolution')`);
  console.log("Custom resolution:", hasCustom);
  if (!hasCustom) throw new Error("T4 FAILED");

  // === T5: 重名处理显示中文 ===
  console.log("\n=== T5: 重名处理显示 ===");
  // "覆盖" 中文选项在 Select 下拉中
  const hasConflictLabels = await evaljs(`document.body.innerText.includes('重名处理') || document.body.innerText.includes('File conflict')`);
  console.log("Conflict section:", hasConflictLabels);
  if (!hasConflictLabels) throw new Error("T5 FAILED");
  // 检查不显示内部值（ask 不应该裸显示在 Select 触发器里）
  const rawValueVisible = await evaljs(`(function() {
    const triggers = document.querySelectorAll('[role=combobox]');
    for (const t of triggers) {
      if (t.textContent === 'ask' || t.textContent === 'overwrite' || t.textContent === 'autoNumber') return true;
    }
    return false;
  })()`);
  console.log("Raw value exposed:", rawValueVisible);
  if (rawValueVisible) throw new Error("T5 FAILED: 内部值外露");

  // === T6: Rust scan_directory 命令可用 ===
  console.log("\n=== T6: scan_directory 命令 ===");
  const invoke = async (cmd, args) => {
    const r = await evaljs(`window.__TAURI_INTERNALS__.invoke('${cmd}', ${JSON.stringify(args ?? {})}).then(v => JSON.stringify({ok:true, v})).catch(e => JSON.stringify({ok:false, e:String(e)}))`);
    const parsed = JSON.parse(r);
    if (!parsed.ok) throw new Error(cmd + ': ' + parsed.e);
    return parsed.v;
  };
  const result = await invoke("scan_directory", { path: "C:/Users/Mingri/AppData/Local/Temp/ffmt-test" });
  const hasFiles = Array.isArray(result) && result.length > 0;
  console.log("Scan result:", result.length, "files");
  if (!hasFiles) throw new Error("T6 FAILED: 扫描无结果");

  console.log("\n=== ALL v0.32 E2E TESTS PASSED ===");
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });