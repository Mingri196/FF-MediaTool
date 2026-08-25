// 模块六 E2E：check_output_file + validate_task_args + 错误匹配
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

  // === T1: check_output_file ===
  console.log("\n=== T1: check_output_file ===");
  const exists = await invoke("check_output_file", { path: INPUT });
  console.log("exists:", exists.exists, "| size:", exists.size);
  if (!exists.exists || exists.size <= 0) throw new Error("T1 FAILED: 存在文件应返回 true");

  const nonexist = await invoke("check_output_file", { path: TEST_DIR + "\\nonexistent.mkv" });
  console.log("nonexistent:", nonexist.exists);
  if (nonexist.exists) throw new Error("T1 FAILED: 不存在文件应返回 false");
  console.log("T1 PASSED");

  // === T2: validate_task_args ===
  console.log("\n=== T2: validate_task_args ===");
  const valid = await invoke("validate_task_args", { input: INPUT, output: TEST_DIR + "\\out.mp4", vcodec: "libx264", acodec: null, hasVf: false, hasAf: false });
  console.log("valid args:", JSON.stringify(valid));
  if (valid.errors.length > 0) throw new Error("T2 FAILED: 有效参数不应有 error: " + valid.errors.join(", "));

  const invalidInput = await invoke("validate_task_args", { input: "Z:\\notexist.mp4", output: TEST_DIR + "\\out.mp4", vcodec: null, acodec: null, hasVf: false, hasAf: false });
  console.log("invalid input:", JSON.stringify(invalidInput));
  if (invalidInput.errors.length === 0) throw new Error("T2 FAILED: 无效输入应报错");

  const copyWithVf = await invoke("validate_task_args", { input: INPUT, output: TEST_DIR + "\\out.mp4", vcodec: "copy", acodec: null, hasVf: true, hasAf: false });
  console.log("copy+vf:", JSON.stringify(copyWithVf));
  if (copyWithVf.warnings.length === 0) throw new Error("T2 FAILED: copy+vf 应有 warning");
  console.log("T2 PASSED");

  // === T3: 错误匹配库（前端） ===
  console.log("\n=== T3: ffmpeg 错误匹配 ===");
  const errors = await evaljs(`(async () => {
    const { analyzeFfmpegError } = await import('/src/lib/ffmpegErrors.ts');
    const r1 = analyzeFfmpegError('[ERROR] Unknown encoder \'libx265_foo\'');
    const r2 = analyzeFfmpegError('Permission denied: output.mp4');
    const r3 = analyzeFfmpegError('');
    const r4 = analyzeFfmpegError('some normal log line with no errors');
    return JSON.stringify({ unknownEncoder: r1.length, permissionDenied: r2.length, empty: r3.length, normal: r4.length });
  })()`);
  const parsed = JSON.parse(errors);
  console.log("match counts:", JSON.stringify(parsed));
  if (parsed.unknownEncoder === 0 || parsed.permissionDenied === 0) throw new Error("T3 FAILED: 应匹配到错误");
  if (parsed.empty > 0 || parsed.normal > 0) throw new Error("T3 FAILED: 不应该匹配空行");
  console.log("T3 PASSED");

  console.log("\n=== ALL MODULE-6 E2E TESTS PASSED ===");
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error("E2E FAILED:", e.message); process.exit(1); });