// 模块二 E2E：真实 ffmpeg 任务全链路验证
// 1) 添加任务 → 进度/日志/完成事件
// 2) 串行队列（一次只跑一个）
// 3) 停止运行中任务 → 进程树杀灭验证
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
    const r = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      return "EVAL-ERR: " + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    }
    return r.result?.value;
  };

  // ---- 0. 注入事件收集器（vite dev 下用预构建模块路径） ----
  const ins = await evaljs(`(async () => {
    try {
      const m = await import('/node_modules/.vite/deps/@tauri-apps_api_event.js');
      if (typeof m.listen !== 'function') return 'listen missing: ' + Object.keys(m).join(',');
      if (window.__evts) window.__evts.length = 0;
      else window.__evts = [];
      window.__unlisten2 = await m.listen('task://event', (e) => window.__evts.push(e.payload));
      return 'listener OK';
    } catch (e) { return 'IMPORT FAIL: ' + e.message; }
  })()`);
  console.log("LISTENER:", ins);

  const invoke = async (cmd, args) => {
    const r = await evaljs(
      `window.__TAURI_INTERNALS__.invoke('${cmd}', ${JSON.stringify(args)}).then(v => JSON.stringify({ok:true, v})).catch(e => JSON.stringify({ok:false, e:String(e)}))`,
    );
    const parsed = JSON.parse(r);
    if (!parsed.ok) throw new Error(`invoke ${cmd} failed: ${parsed.e}`);
    return parsed.v;
  };

  const clearEvts = () => evaljs(`window.__evts.length = 0; 0`);
  const countEvts = () => evaljs(`window.__evts.length`);

  // ---- 1. 任务 A：重编码 mp4（preset ultrafast，8s 视频应几秒完成）----
  console.log("\n=== TEST 1: 重编码任务 ===");
  await clearEvts();
  const outA = TEST_DIR + "\\out-a.mp4";
  const t1 = await invoke("task_add", {
    task: {
      name: "TEST-A re-encode",
      args: ["-i", INPUT, "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-c:a", "aac", "-b:a", "96k", outA],
      inputPath: INPUT,
      outputPath: outA,
    },
  });
  console.log("task added:", t1.id, t1.status);

  // 轮询等待完成（最多 30s）
  let done = false;
  let lastProgress = null;
  let logLines = 0;
  const started = Date.now();
  while (Date.now() - started < 30000) {
    const n = await countEvts();
    const batch = await evaljs(`window.__evts.splice(0, ${n}).map(e => e.type === 'taskUpdated' ? ({t:'taskUpdated', status: e.task.status, pct: e.task.progress.percent, speed: e.task.progress.speed, eta: e.task.progress.etaMs}) : ({t:e.type, ...(e.line?{line:e.line.slice(0,80)}:{})}))`);
    for (const e of batch) {
      if (e.t === "taskUpdated") {
        if (e.pct && e.pct >= 0) lastProgress = { pct: e.pct, speed: e.speed, eta: e.eta };
        if (e.status === "completed") done = true;
      }
      if (e.t === "log") logLines++;
    }
    if (done) break;
    await SLEEP(500);
  }
  console.log("completed:", done, "| lastProgress:", JSON.stringify(lastProgress), "| logLines:", logLines);
  const snap1 = await invoke("tasks_snapshot", {});
  console.log("snapshot: current=", snap1.current?.status ?? null, "queue=", snap1.queue.length, "history=", snap1.history.length);
  if (!done) throw new Error("TEST 1 FAILED: 任务未完成");

  // ---- 2. 串行队列：一次加 2 个任务，确认不会同时跑 ----
  console.log("\n=== TEST 2: 串行队列 ===");
  await clearEvts();
  const outB = TEST_DIR + "\\out-b.mp4";
  const outC = TEST_DIR + "\\out-c.mkv";
  await invoke("task_add", { task: { name: "TEST-B copy", args: ["-i", INPUT, "-c", "copy", outB], inputPath: INPUT, outputPath: outB } });
  await invoke("task_add", { task: { name: "TEST-C copy", args: ["-i", INPUT, "-c", "copy", outC], inputPath: INPUT, outputPath: outC } });
  await SLEEP(300);
  // 立刻查询：队列应有 2 个，current 应为空（第一个还没被 pump 拾起）或 running——但绝不出现 2 个 running
  const snap2 = await invoke("tasks_snapshot", {});
  console.log("right-after queue:", snap2.queue.map((t) => t.status).join(","), "current:", snap2.current?.name ?? null);

  // 轮询到全部完成；同时用时间线严格检测并发（同一时刻两个任务 running）
  const started2 = Date.now();
  const timeline = []; // {name, status}
  while (Date.now() - started2 < 30000) {
    const n = await countEvts();
    const batch = await evaljs(`window.__evts.splice(0, ${n}).map(e => e.type === 'taskUpdated' ? {t:'taskUpdated', status: e.task.status, name: e.task.name} : {t:e.type})`);
    for (const e of batch) {
      if (e.t === "taskUpdated") timeline.push({ name: e.name, status: e.status });
    }
    const snap = await invoke("tasks_snapshot", {});
    if (snap.queue.length === 0 && !snap.current) break;
    await SLEEP(400);
  }
  // 严格并发检测：running 集合中同一时刻不能有第二个任务
  const runningSet = new Set();
  let concurrency = 0;
  for (const e of timeline) {
    if (e.status === "running") {
      runningSet.add(e.name);
    } else if (["completed", "failed", "cancelled"].includes(e.status)) {
      runningSet.delete(e.name);
    }
    if (runningSet.size > 1) concurrency++;
  }
  const snap3 = await invoke("tasks_snapshot", {});
  console.log("serial: timelineEvents=", timeline.length, "| concurrencyViolations=", concurrency, "| queue=", snap3.queue.length, "| history=", snap3.history.map((t) => t.status).join(","));
  if (concurrency > 0) throw new Error("TEST 2 FAILED: 检测到并发运行（同一时刻两个任务 running）");
  if (snap3.history.length < 2) throw new Error("TEST 2 FAILED: 任务未全部完成");

  // ---- 3. 停止：加一个慢任务（4K 放大 + placebo 会跑很久），2 秒后停止 ----
  console.log("\n=== TEST 3: 停止任务 ===");
  await clearEvts();
  const outD = TEST_DIR + "\\out-d.mkv";
  const t4 = await invoke("task_add", {
    task: {
      name: "TEST-D slow",
      args: ["-i", INPUT, "-vf", "scale=3840:2160", "-c:v", "libx265", "-preset", "placebo", "-c:a", "copy", outD],
      inputPath: INPUT,
      outputPath: outD,
    },
  });
  console.log("slow task added:", t4.id);
  await SLEEP(2500);
  // 确认它在跑
  const snap4 = await invoke("tasks_snapshot", {});
  console.log("before stop: current=", snap4.current?.name, "status=", snap4.current?.status);
  await invoke("task_stop", { id: t4.id });
  await SLEEP(1500);

  // 检查 ffmpeg 进程是否已杀干净
  let ffmpegProcs = 0;
  try {
    execSync('tasklist /FI "IMAGENAME eq ffmpeg.exe" /FO CSV /NH', { encoding: "utf8" })
      .split("\n").filter((l) => l.includes("ffmpeg.exe")).forEach(() => ffmpegProcs++);
  } catch { /* tasklist 无匹配时返回非零 */ }
  console.log("ffmpeg.exe processes alive after stop:", ffmpegProcs);

  const snap5 = await invoke("tasks_snapshot", {});
  const stopped = snap5.history.find((t) => t.id === t4.id);
  console.log("stopped task status:", stopped?.status, "| finishedAt set:", !!stopped?.finishedAt);
  if (ffmpegProcs > 0) throw new Error("TEST 3 FAILED: 停止后仍有 ffmpeg 进程残留");
  if (stopped?.status !== "cancelled") throw new Error("TEST 3 FAILED: 停止状态应为 cancelled, got " + stopped?.status);

  // ---- 4. 输出文件验证 ----
  console.log("\n=== TEST 4: 输出文件 ===");
  for (const f of ["out-a.mp4", "out-b.mp4", "out-c.mkv"]) {
    console.log(f, "exists:", existsSync(TEST_DIR + "\\" + f));
  }

  console.log("\n=== ALL E2E TESTS PASSED ===");
  ws.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("E2E FAILED:", e.message);
  process.exit(1);
});