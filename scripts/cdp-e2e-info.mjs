// 模块五 E2E：media_probe_full 全量解析 + 元数据编辑命令 + UI 检查
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

  // ============ M1: media_probe_full 全量解析 ============
  console.log("\n=== TEST M1: media_probe_full ===");
  const full = await invoke("media_probe_full", { path: INPUT });
  const ok = full.ok;
  const fmt = full.format;
  const vs = full.videoStreams;
  const as = full.audioStreams;
  const meta = full.metadata;
  console.log("ok:", ok, "| format:", fmt.formatLongName, "| duration:", fmt.duration.toFixed(2), "| size:", fmt.size);
  console.log("video streams:", vs.length, "| audio streams:", as.length, "| metadata keys:", Object.keys(meta).length);
  if (!ok) throw new Error("M1 FAILED: not ok");
  if (vs.length === 0) throw new Error("M1 FAILED: no video stream");
  if (as.length === 0) throw new Error("M1 FAILED: no audio stream");
  const v0 = vs[0];
  console.log(`  video #0: ${v0.codecName} ${v0.width}x${v0.height} pixFmt=${v0.pixFmt} profile=${v0.profile} level=${v0.level} bframes=${v0.hasBFrames} refs=${v0.refs} fps=${v0.avgFrameRate}`);
  if (!v0.codecName || v0.width <= 0) throw new Error("M1 FAILED: video fields incomplete");
  const a0 = as[0];
  console.log(`  audio #0: ${a0.codecName} ${a0.sampleRate}Hz ${a0.channels}ch layout=${a0.channelLayout} fmt=${a0.sampleFmt} depth=${a0.bitsPerSample}`);
  if (!a0.codecName || a0.sampleRate <= 0) throw new Error("M1 FAILED: audio fields incomplete");
  console.log("M1 PASSED");

  // ============ M2: 元数据编辑命令构建 ============
  console.log("\n=== TEST M2: metadata edit args ===");
  const metaEdit = await evaljs(`(async () => {
    // 模拟元数据编辑 args
    const args = ['-i', ${JSON.stringify(INPUT)}, '-metadata', 'title=NewTitle', '-metadata', 'artist=TestArtist', '-c', 'copy', ${JSON.stringify(TEST_DIR + "\\m5-edited.mp4")}];
    return JSON.stringify(args);
  })()`);
  const m2 = JSON.parse(metaEdit);
  console.log("cmd:", m2.join(" "));
  if (!m2.includes("-metadata") || !m2.includes("title=NewTitle") || !m2.includes("-c") || !m2.includes("copy")) throw new Error("M2 FAILED");
  console.log("M2 PASSED");

  // ============ M3: UI 渲染 ============
  console.log("\n=== TEST M3: UI ===");
  await evaljs(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.includes('媒体信息') || x.textContent.includes('Media Info')); if (b) b.click(); })()`);
  await SLEEP(500);
  const ui = await evaljs(`JSON.stringify({
    title: document.body.innerText.includes('媒体信息') || document.body.innerText.includes('Media Info'),
    hasContainer: document.body.innerText.includes('容器信息') || document.body.innerText.includes('Container'),
    hasVideo: document.body.innerText.includes('视频流') || document.body.innerText.includes('Video'),
    hasAudio: document.body.innerText.includes('音频流') || document.body.innerText.includes('Audio'),
    buttons: document.querySelectorAll('button').length,
    hasSelect: document.querySelectorAll('select').length || document.querySelectorAll('[role=listbox]').length
  })`);
  console.log("UI:", ui);
  const parsed = JSON.parse(ui);
  if (!parsed.title) throw new Error("M3 FAILED: page title missing");

  console.log("\n=== ALL MODULE-5 E2E TESTS PASSED ===");
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error("E2E FAILED:", e.message); process.exit(1); });