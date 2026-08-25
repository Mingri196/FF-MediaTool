const PORT = "9223";
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const pgs = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const pg = pgs.find((p) => p.type === "page");
  const ws = new WebSocket(pg.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (m, p2 = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p2 })); });
  ws.onmessage = (ev) => { const msg = JSON.parse(ev.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); } };
  await new Promise((r) => (ws.onopen = r));
  const ev = (exp) => send("Runtime.evaluate", { expression: exp, returnByValue: true, awaitPromise: true }).then((r) => r.result?.value);
  const clickNav = async (txt) => { await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('${txt}'))?.click()`); await SLEEP(500); };
  const getH1 = () => ev("document.querySelector('h1')?.textContent ?? ''");
  const check = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); console.log("  PASS:", msg); };
  const S = (ms) => new Promise((r) => setTimeout(r, ms));

  // T1: Version
  await clickNav("设置"); await S(400);
  const v = await ev("document.body.innerText.match(/v0\\.\\d+/)?.[0] ?? ''");
  check(v === "v0.49", "Version: " + v);

  // T2: hasCompletedFirstRun is true (FFmpeg was detected on first launch)
  const hcfr = await ev('window.__TAURI_INTERNALS__.invoke("get_settings").then(s => s.hasCompletedFirstRun).catch(() => null)'); await S(500);
  check(hcfr === true, "hasCompletedFirstRun: " + hcfr);

  // T3: FFmpeg path saved
  const fp = await ev('window.__TAURI_INTERNALS__.invoke("get_settings").then(s => s.ffmpegPath).catch(() => null)'); await S(500);
  check(fp !== null && fp !== undefined, "FFmpeg path saved: " + (fp || "null"));

  // T4: lastOutputDir is null (no task completed yet)
  const lod = await ev('window.__TAURI_INTERNALS__.invoke("get_settings").then(s => JSON.stringify(s.lastOutputDir)).catch(() => "ERR")'); await S(500);
  check(lod === "null" || lod === '""', "lastOutputDir empty: " + lod);

  // T5: Navigate to video convert
  await clickNav("视频转换"); await S(400);
  const h1 = await getH1();
  check(h1.includes("视频转换"), "Video nav");

  // T6: Check lastOutputDir in settings page
  await clickNav("设置"); await S(400);
  const hasEmpty = await ev('document.body.innerText.includes("暂无记录") || document.body.innerText.includes("No records")');
  check(hasEmpty, "lastOutputDir shows empty");

  console.log("\n=== ALL v0.49 TESTS PASSED ===");
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });