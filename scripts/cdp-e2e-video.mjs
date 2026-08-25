// 模块三 E2E：通过真实页面里的 builder 生成命令 → 驱动真实 ffmpeg 任务
// 覆盖：滤镜链转码 / 时间裁剪 / 多片段拼接 / copy 流复制 / media_probe_basic / detect_crop
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const PORT = "9223";
const TEST_DIR = process.env.LOCALAPPDATA + "\\Temp\\ffmt-test";
const INPUT = TEST_DIR + "\\input.mp4";
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json`);
  const pages = await res.json();
  const page = pages.find((p) => p.type === "page");
  if (!page) throw new Error("no page");
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

  // 注入事件监听（强制重置，避免跨脚本残留事件污染）
  await evaljs(`(async () => {
    try { if (window.__unlisten3) window.__unlisten3(); } catch {}
    window.__evts = [];
    const m = await import('/node_modules/.vite/deps/@tauri-apps_api_event.js');
    window.__unlisten3 = await m.listen('task://event', (e) => window.__evts.push(e.payload));
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
  const drainEvts = (n) => evaljs(`window.__evts.splice(0, ${n}).map(e => e.type === 'taskUpdated' ? ({t:'taskUpdated', status:e.task.status, id:e.task.id, name:e.task.name}) : ({t:e.type}))`);

  const waitDone = async (timeoutMs = 60000, nameMatch) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const n = await countEvts();
      if (n > 0) {
        const batch = await drainEvts(n);
        const done = batch.find((e) => e.t === "taskUpdated" && ["completed", "failed", "cancelled"].includes(e.status) && (nameMatch ? e.name === nameMatch : true));
        if (done) return done.status;
      }
      await SLEEP(300);
    }
    return "timeout";
  };

  const ffprobe = (file, entry) => {
    try {
      // 正斜杠路径避免 Windows 混合 shell 下反斜杠被吞
      const p = file.replace(/\\/g, "/");
      const out = execSync(`ffprobe -v error -show_entries ${entry} -of default=noprint_wrappers=1:nokey=1 "${p}"`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
      return out.trim();
    } catch (e) {
      const cmd = e.cmd ?? "";
      return "ERR|" + (e.stderr?.toString?.() ?? e.message).split("\n").slice(0, 2).join(" / ").slice(0, 120) + "|CMD:" + cmd.slice(-80);
    }
  };

  // ============ 1. media_probe_basic ============
  console.log("\n=== TEST M1: media_probe_basic ===");
  const info = await invoke("media_probe_basic", { path: INPUT });
  console.log(`durationMs=${info.durationMs} video=${info.hasVideo} audio=${info.hasAudio} streams=${info.streams.length}`);
  if (!info.ok || info.durationMs < 7000 || !info.hasVideo) throw new Error("M1 FAILED");

  // ============ 2. detect_crop ============
  console.log("\n=== TEST M2: detect_crop ===");
  const crop = await invoke("detect_crop", { path: INPUT });
  console.log("crop:", JSON.stringify(crop));
  if (!crop.w) throw new Error("M2 FAILED (no crop result)");

  // ============ 3. 滤镜链转码（真实 builder → 真实 ffmpeg） ============
  console.log("\n=== TEST M3: 滤镜链转码 ===");
  const args3 = await evaljs(`(async () => {
    const { buildVideoArgs } = await import('/src/video/builder.ts');
    const { defaultVideoParams, defaultVideoAudioParams } = await import('/src/video/types.ts');
    const v = defaultVideoParams();
    v.rotate = '90';        // transpose
    v.scaleMode = 2;        // scale=1280:-2
    v.scaleWidth = 1280;
    v.denoise = true;       // hqdn3d
    v.sharpen = 1.5;        // unsharp
    v.brightness = 0.05;    // eq
    v.contrast = 1.1;
    v.cropDetected = { w: 640, h: 352, x: 0, y: 4 }; // crop
    return buildVideoArgs({ input: ${JSON.stringify(INPUT)}, output: ${JSON.stringify(TEST_DIR + "\\m3-filtered.mp4")}, video: v, audio: defaultVideoAudioParams() }).join(' ');
  })()`);
  console.log("CMD:", args3);
  const out3 = TEST_DIR + "\\m3-filtered.mp4";
  await invoke("task_add", {
    task: { name: "M3 filters", args: args3.split(" "), inputPath: INPUT, outputPath: out3 },
  });
  const st3 = await waitDone(60000, "M3 filters");
  console.log("status:", st3);
  if (st3 !== "completed") throw new Error("M3 FAILED");
  // faststart 写 moov 需要几毫秒；retry 一次避免时序抖动
  let dims3 = ffprobe(out3, "stream=width,height");
  if (dims3.startsWith("ERR") || dims3.includes("moov")) {
    await new Promise((r) => setTimeout(r, 500));
    dims3 = ffprobe(out3, "stream=width,height");
  }
  console.log("output dims:", dims3);
  // 几何：crop 640x352 → scale=1280:-2 → 1280x704 → transpose=1（90°转置互换宽高）→ 704x1280
  if (dim3Parse(dims3) !== "704x1280") throw new Error("M3 FAILED: 分辨率/裁剪不正确: " + dims3);

  // ============ 4. 时间裁剪（-ss 2 -to 6 → 约 4s） ============
  console.log("\n=== TEST M4: 时间裁剪 ===");
  const args4 = await evaljs(`(async () => {
    const { buildVideoArgs } = await import('/src/video/builder.ts');
    const { defaultVideoParams, defaultVideoAudioParams } = await import('/src/video/types.ts');
    const args = buildVideoArgs({ input: ${JSON.stringify(INPUT)}, output: ${JSON.stringify(TEST_DIR + "\\m4-trim.mp4")}, video: defaultVideoParams(), audio: defaultVideoAudioParams(), clip: { startSec: 2, endSec: 6 } });
    return { raw: args.join(' '), verify: args.slice(0, args.indexOf('-i')).join(' ') };
  })()`);
  console.log("CMD:", args4.raw);
  const out4 = TEST_DIR + "\\m4-trim.mp4";
  await invoke("task_add", {
    task: { name: "M4 trim", args: args4.raw.split(" "), inputPath: INPUT, outputPath: out4 },
  });
  const st4 = await waitDone(60000, "M4 trim");
  console.log("status:", st4);
  const dur4 = parseFloat(ffprobe(out4, "format=duration"));
  console.log("trim duration:", dur4);
  if (st4 !== "completed" || Math.abs(dur4 - 4) > 0.6) throw new Error("M4 FAILED: 时长=" + dur4);

  // ============ 5. 多片段拼接（0-2s + 5-8s → 约 5s） ============
  console.log("\n=== TEST M5: 多片段拼接 ===");
  const args5 = await evaljs(`(async () => {
    const { buildVideoArgs } = await import('/src/video/builder.ts');
    const { defaultVideoParams, defaultVideoAudioParams } = await import('/src/video/types.ts');
    return buildVideoArgs({ input: ${JSON.stringify(INPUT)}, output: ${JSON.stringify(TEST_DIR + "\\m5-concat.mp4")}, video: defaultVideoParams(), audio: defaultVideoAudioParams(), concat: [ {startSec:0,endSec:2}, {startSec:5,endSec:8} ] }).join(' ');
  })()`);
  console.log("CMD:", args5);
  const out5 = TEST_DIR + "\\m5-concat.mp4";
  await invoke("task_add", {
    task: { name: "M5 concat", args: args5.split(" "), inputPath: INPUT, outputPath: out5 },
  });
  const st5 = await waitDone(60000, "M5 concat");
  console.log("status:", st5);
  const dur5 = parseFloat(ffprobe(out5, "format=duration"));
  console.log("concat duration:", dur5);
  if (st5 !== "completed" || Math.abs(dur5 - 5) > 0.8) throw new Error("M5 FAILED: 时长=" + dur5);

  // ============ 6. copy 流复制 + 滤镜参数被忽略 ============
  console.log("\n=== TEST M6: copy + 滤镜自动忽略 ===");
  const args6 = await evaljs(`(async () => {
    const { buildVideoArgs } = await import('/src/video/builder.ts');
    const { defaultVideoParams, defaultVideoAudioParams } = await import('/src/video/types.ts');
    const v = defaultVideoParams();
    v.vcodec = 'copy';
    v.denoise = true;
    v.rotate = '90';
    const raw = buildVideoArgs({ input: ${JSON.stringify(INPUT)}, output: ${JSON.stringify(TEST_DIR + "\\m6-copy.mkv")}, video: v, audio: defaultVideoAudioParams() });
    return JSON.stringify({ raw, hasVf: raw.includes('-vf'), hasFc: raw.includes('-filter_complex') });
  })()`);
  const a6 = JSON.parse(args6);
  console.log("hasVf:", a6.hasVf, "hasFc:", a6.hasFc, "cmd:", a6.raw.join(" "));
  if (a6.hasVf || a6.hasFc) throw new Error("M6 FAILED: copy 模式不应输出滤镜");
  const out6 = TEST_DIR + "\\m6-copy.mkv";
  await invoke("task_add", {
    task: { name: "M6 copy", args: a6.raw, inputPath: INPUT, outputPath: out6 },
  });
  const st6 = await waitDone(60000, "M6 copy");
  console.log("status:", st6);
  if (st6 !== "completed") throw new Error("M6 FAILED");
  if (!existsSync(out6)) throw new Error("M6 FAILED: 无输出");

  console.log("\n=== ALL MODULE-3 E2E TESTS PASSED ===");
  ws.close();
  process.exit(0);
}

function dim3Parse(s) {
  // ffprobe stream=width,height 输出两行：width\nheight
  const lines = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2 && /^\d+$/.test(lines[0]) && /^\d+$/.test(lines[1])) {
    return `${lines[0]}x${lines[1]}`;
  }
  return s;
}

main().catch((e) => { console.error("E2E FAILED:", e.message); process.exit(1); });