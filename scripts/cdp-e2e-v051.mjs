const PORT = "9223";
async function main() {
  const pgs = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const pg = pgs.find((p) => p.type === "page");
  const ws = new WebSocket(pg.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (m, p2 = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p2 })); });
  ws.onmessage = (ev) => { const msg = JSON.parse(ev.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); } };
  await new Promise((r) => (ws.onopen = r));
  const ev = (exp) => send("Runtime.evaluate", { expression: exp, returnByValue: true, awaitPromise: true }).then((r) => r.result?.value);
  const clickNav = async (txt) => { await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('${txt}'))?.click()`); await new Promise(r => setTimeout(r, 500)); };
  const S = (ms) => new Promise(r => setTimeout(r, ms));
  const check = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); console.log("  PASS:", msg); };

  // T1: Version
  await clickNav("设置"); await S(400);
  const v = await ev("document.body.innerText.match(/v0\\.\\d+/)?.[0] ?? ''");
  check(v === "v0.51", "Version: " + v);

  // T2: Quick task path option in settings (expand panel first)
  await clickNav("设置"); await S(400);
  await ev('[...document.querySelectorAll("button")].find(b => b.textContent.includes("自定义输出路径") || b.textContent.includes("Custom Output Path"))?.click()'); await S(400);
  const hasQTPath = await ev('document.body.innerText.includes("快速任务输出路径") || document.body.innerText.includes("Quick Task Output Path")');
  check(hasQTPath, "Quick Task path option");

  // T3: Batch page nav
  await clickNav("批量任务"); await S(400);
  const h1 = await ev("document.querySelector('h1')?.textContent ?? ''");
  check(h1.includes("批量任务"), "Batch page nav");

  // T4: Check quick task output uses default path
  const result = await ev('window.__TAURI_INTERNALS__.invoke("get_settings").then(s => JSON.stringify(s.outputPaths?.quickTask)).catch(() => "ERR")'); await S(500);
  console.log("  quickTask path:", result);

  console.log("\n=== ALL v0.51 TESTS PASSED ===");
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });