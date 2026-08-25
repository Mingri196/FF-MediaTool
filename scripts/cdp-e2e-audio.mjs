// 模块四 E2E：音频 builder → 真实 ffmpeg 全链路
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const PORT = "9223";
const TEST_DIR = process.env.LOCALAPPDATA + "\\Temp\\ffmt-test";
const INPUT = TEST_DIR + "\\input.mp4"; // 8s 测试视频（含 AAC 音轨）
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json`);
  const pages = await res.json();
  const page = pages.find((p) => p.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    }
  };
  await new Promise((r) => (ws.onopen = r));
  const evaljs = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return "EVAL-ERR: " + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result?.value;
  };
  await evaljs(`(async () => {
    if (!window.__evts) {
      window.__evts = [];
      const m = await import('/node_modules/.vite/deps/@tauri-apps_api_event.js');
      window.__unlisten4 = await m.listen('task://event', (e) => window.__evts.push(e.payload));
    }
    return 'ok';
  })()`);
  const invoke = async (cmd, args) => {
    const r = await evaljs(
      `window.__TAURI_INTERNALS__.invoke('${cmd}', ${JSON.stringify(args ?? {})}).then(v => JSON.stringify({ok:true, v})).catch(e => JSON.stringify({ok:false, e:String(e)}))`,
    );
    const parsed = JSON.parse(r);
    if (!parsed.ok) throw new Error(`invoke ${cmd} failed: ${parsed.e}`);
    return parsed.v;
  };
  const countEvts = () => evaljs(`window.__evts.length`);
  const drainEvts = (n) => evaljs(`window.__evts.splice(0, ${n}).map(e => e.type === 'taskUpdated' ? ({t:'taskUpdated', status:e.task.status}) : ({t:e.type}))`);
  const waitDone = async (timeoutMs = 60000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const n = await countEvts();
      if (n > 0) {
        const batch = await drainEvts(n);
        const done = batch.find((e) => e.t === "taskUpdated" && ["completed", "failed", "cancelled"].includes(e.status));
        if (done) return done.status;
      }
      await SLEEP(300);
    }
    return "timeout";
  };
  const ffprobe = (file, entry) => {
    try {
      return execSync(`ffprobe -v error -show_entries ${entry} -of default=noprint_wrappers=1:nokey=1 "${file}"`, { encoding: "utf8" }).trim();
    } catch { return "ERR"; }
  };
  const buildAudio = (overrides) => evaljs(`(async () => {
    const { buildAudioArgs } = await import('/src/audio/builder.ts');
    const { defaultAudioParams } = await import('/src/audio/types.ts');
    const a = Object.assign(defaultAudioParams(), ${JSON.stringify(overrides ?? {})});
    return buildAudioArgs({ input: ${JSON.stringify(INPUT)}, output: ${JSON.stringify(TEST_DIR + "\\A.mp3")}, audio: a }).join(' ');
  })()`);

  // ============ A1: MP3 CBR 转换（从视频提取音频） ============
  console.log("\n=== TEST A1: MP3 CBR ===");
  const cmd1 = await buildAudio({ acodec: "libmp3lame", mode: "cbr", bitrateK: 128 });
  console.log("CMD:", cmd1);
  const out1 = TEST_DIR + "\\a1.mp3";
  await invoke("task_add", { task: { name: "A1 mp3", args: cmd1.replace(/A\.mp3/g, "a1.mp3").split(" "), inputPath: INPUT, outputPath: out1 } });
  const st1 = await waitDone();
  const codec1 = ffprobe(out1, "stream=codec_name");
  const br1 = ffprobe(out1, "stream=bit_rate");
  console.log("status:", st1, "| codec:", codec1, "| bitrate:", br1, "bps");
  if (st1 !== "completed" || codec1 !== "mp3") throw new Error("A1 FAILED");
  if (br1 !== "ERR" && parseInt(br1) > 200000) throw new Error("A1 FAILED: 码率超限 " + br1);

  // ============ A2: FLAC 无损（再转回 wav） ============
  console.log("\n=== TEST A2: FLAC 无损 ===");
  const out2 = TEST_DIR + "\\a2.mp3";
  await invoke("task_add", {
    task: { name: "A2 flac", args: (await buildAudio({ acodec: "flac", mode: "lossless", sampleRate: 44100 })).replace(/A\.mp3/g, "a2.flac").split(" "), inputPath: INPUT, outputPath: TEST_DIR + "\\a2.flac" },
  });
  const st2 = await waitDone();
  const codec2 = ffprobe(TEST_DIR + "\\a2.flac", "stream=codec_name");
  console.log("status:", st2, "| codec:", codec2);
  if (st2 !== "completed" || codec2 !== "flac") throw new Error("A2 FAILED");
  void out2;

  // ============ A3: 流复制 copy（同格式重封装）+ 滤镜忽略 ============
  console.log("\n=== TEST A3: copy + 滤镜忽略 ===");
  const a3 = await evaljs(`(async () => {
    const { buildAudioArgs } = await import('/src/audio/builder.ts');
    const { defaultAudioParams } = await import('/src/audio/types.ts');
    const a = defaultAudioParams();
    a.acodec = 'copy'; a.denoise = true; a.gainDb = -3; a.tempo = 1.5;
    const raw = buildAudioArgs({ input: ${JSON.stringify(TEST_DIR + "\\a2.flac")}, output: ${JSON.stringify(TEST_DIR + "\\a3-copy.flac")}, audio: a });
    return JSON.stringify({ raw, hasAf: raw.includes('-af'), hasB: raw.includes('-b:a') });
  })()`);
  const p3 = JSON.parse(a3);
  console.log("hasAf:", p3.hasAf, "cmd:", p3.raw.join(" "));
  if (p3.hasAf) throw new Error("A3 FAILED: copy 不应有 -af");
  await invoke("task_add", { task: { name: "A3 copy", args: p3.raw, inputPath: TEST_DIR + "\\a2.flac", outputPath: TEST_DIR + "\\a3-copy.flac" } });
  const st3 = await waitDone();
  if (st3 !== "completed") throw new Error("A3 FAILED");
  console.log("status:", st3);

  // ============ A4: 音轨提取 -map 0:a:0（从视频） ============
  console.log("\n=== TEST A4: 音轨提取 ===");
  const cmd4 = await evaljs(`(async () => {
    const { buildAudioArgs } = await import('/src/audio/builder.ts');
    const { defaultAudioParams } = await import('/src/audio/types.ts');
    return buildAudioArgs({ input: ${JSON.stringify(INPUT)}, output: ${JSON.stringify(TEST_DIR + "\\a4-track.m4a")}, audio: { ...defaultAudioParams(), acodec: 'aac', mode: 'cbr', bitrateK: 96 }, extract: { trackIndex: 0 } }).join(' ');
  })()`);
  console.log("CMD:", cmd4);
  await invoke("task_add", { task: { name: "A4 extract", args: cmd4.split(" "), inputPath: INPUT, outputPath: TEST_DIR + "\\a4-track.m4a" } });
  const st4 = await waitDone();
  const str4 = ffprobe(TEST_DIR + "\\a4-track.m4a", "stream=codec_type");
  console.log("status:", st4, "| streams:", str4);
  if (st4 !== "completed" || str4 !== "audio") throw new Error("A4 FAILED: 应只有音频流");

  // ============ A5: 滤镜全开（增益/淡入淡出/变速/消人声/EQ/混响） ============
  console.log("\n=== TEST A5: 滤镜链 ===");
  const cmd5 = await buildAudio({ acodec: "libmp3lame", mode: "vbr", vbrQuality: 5, gainDb: -6, fadeInSec: 1, fadeOutSec: 2, tempo: 1.25, vocalRemoval: true, reverb: true, eqBass: 3, eqTreble: -3, denoise: true });
  console.log("CMD:", cmd5);
  const out5 = TEST_DIR + "\\a5.mp3";
  await invoke("task_add", { task: { name: "A5 fx", args: cmd5.replace(/A\.mp3/g, "a5.mp3").split(" "), inputPath: INPUT, outputPath: out5 } });
  const st5 = await waitDone();
  console.log("status:", st5);
  if (st5 !== "completed") throw new Error("A5 FAILED");

  // ============ A6: 多段拼接（音频 concat） ============
  console.log("\n=== TEST A6: 音频拼接 ===");
  const cmd6 = await evaljs(`(async () => {
    const { buildAudioArgs } = await import('/src/audio/builder.ts');
    const { defaultAudioParams } = await import('/src/audio/types.ts');
    return buildAudioArgs({ input: ${JSON.stringify(INPUT)}, output: ${JSON.stringify(TEST_DIR + "\\a6-join.m4a")}, audio: { ...defaultAudioParams(), acodec: 'aac', mode: 'cbr', bitrateK: 96 }, concat: [ {startSec:0,endSec:3}, {startSec:5,endSec:8} ] }).join(' ');
  })()`);
  console.log("CMD:", cmd6);
  await invoke("task_add", { task: { name: "A6 concat", args: cmd6.split(" "), inputPath: INPUT, outputPath: TEST_DIR + "\\a6-join.m4a" } });
  const st6 = await waitDone();
  const dur6 = parseFloat(ffprobe(TEST_DIR + "\\a6-join.m4a", "format=duration"));
  console.log("status:", st6, "| duration:", dur6);
  if (st6 !== "completed" || Math.abs(dur6 - 6) > 0.8) throw new Error("A6 FAILED: 时长=" + dur6);

  // ============ A7: 分割（按 3 秒一段 → 3 个任务） ============
  console.log("\n=== TEST A7: 分割为多段 ===");
  const splitCmds = [];
  for (let i = 0; i < 3; i++) {
    const start = i * 3;
    const end = i === 2 ? 8 : (i + 1) * 3;
    const out = TEST_DIR + `\\a7-part${i + 1}.m4a`;
    const c = await evaljs(`(async () => {
      const { buildAudioArgs } = await import('/src/audio/builder.ts');
      const { defaultAudioParams } = await import('/src/audio/types.ts');
      return buildAudioArgs({ input: ${JSON.stringify(INPUT)}, output: ${JSON.stringify(out)}, audio: { ...defaultAudioParams(), acodec: 'aac', mode: 'cbr', bitrateK: 96 }, clip: { startSec: ${start}, endSec: ${end} } }).join(' ');
    })()`);
    splitCmds.push({ c, out });
  }
  for (const { c, out } of splitCmds) {
    await invoke("task_add", { task: { name: "A7 split", args: c.split(" "), inputPath: INPUT, outputPath: out } });
  }
  // 轮询快照直至 3 个分割任务全部完成（避免事件消费竞态）
  let allDone = false;
  const started7 = Date.now();
  while (Date.now() - started7 < 60000) {
    const snap = await invoke("tasks_snapshot", {});
    const finished = snap.history.filter((t) => t.name.startsWith("A7") && t.status === "completed").length;
    if (finished >= 3 && snap.queue.length === 0 && !snap.current) { allDone = true; break; }
    await SLEEP(400);
  }
  const exists = [1, 2, 3].every((i) => existsSync(TEST_DIR + `\\a7-part${i}.m4a`));
  console.log("all completed:", allDone, "| files exist:", exists);
  if (!allDone || !exists) throw new Error("A7 FAILED");

  console.log("\n=== ALL MODULE-4 E2E TESTS PASSED ===");
  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error("E2E FAILED:", e.message); process.exit(1); });