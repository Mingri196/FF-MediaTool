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
  const clickNav = async (txt) => { await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('${txt}'))?.click()`); await SLEEP(400); };
  const getH1 = () => ev("document.querySelector('h1')?.textContent ?? ''");
  const check = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); console.log("  PASS:", msg); };

  // T1: Version
  await clickNav("设置"); const v = await ev("document.body.innerText.match(/v0\\.\\d+/)?.[0] ?? ''");
  check(v === "v0.43", "Version: " + v);

  // T2-T7: Navigation
  const navPages = [["视频转换","视频转换"],["音频转换","音频转换"],["图片转换","图片转换"],["视频剪辑","视频剪辑"],["媒体信息","媒体信息"],["设置","设置"]];
  for (const [btn, expected] of navPages) { await clickNav(btn); const h = await getH1(); check(h.includes(expected), btn + " nav: " + h); }

  // T8: Settings output path module
  await clickNav("设置"); await SLEEP(300);
  const hasOP = await ev("document.body.innerText.includes('默认输出路径') || document.body.innerText.includes('Default Output Path')");
  check(hasOP, "Output path module");

  // T9: Language switch
  await ev("document.querySelector('[role=combobox]')?.click()"); await SLEEP(200);
  await ev("[...document.querySelectorAll('[role=option]')].find(o => o.textContent === 'English')?.click()"); await SLEEP(400);
  const enVer = await ev("document.body.innerText.match(/v0\\.\\d+/)?.[0] ?? ''");
  check(enVer === "v0.43", "EN version: " + enVer);
  await ev("document.querySelector('[role=combobox]')?.click()"); await SLEEP(200);
  await ev("[...document.querySelectorAll('[role=option]')].find(o => o.textContent.includes('中文'))?.click()"); await SLEEP(400);

  // T10: Image convert - check custom resolution
  await clickNav("图片转换");
  const hasCustom = await ev("document.body.innerText.includes('自定义分辨率') || document.body.innerText.includes('Custom Resolution')");
  check(hasCustom, "Custom resolution option");

  // T11: Video convert output input
  await clickNav("视频转换");
  const hasOut = await ev("document.querySelectorAll('input[type=text]').length > 0");
  check(hasOut, "Video output input exists");

  console.log("\n=== ALL v0.43 REGRESSION TESTS PASSED ===");
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });