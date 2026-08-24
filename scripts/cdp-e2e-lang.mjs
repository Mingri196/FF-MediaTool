// E2E：模拟点击语言下拉切换为 English，验证 i18n 实时生效 + Rust 写盘
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const port = "9223";
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const res = await fetch(`http://127.0.0.1:${port}/json`);
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
    return r.result?.value;
  };

  // 1. 点击语言下拉 trigger
  await evaljs(`document.querySelector('[data-slot="select-trigger"]').click()`);
  await SLEEP(500);

  // 2. 读 popup 里的选项
  const items = await evaljs(`JSON.stringify([...document.querySelectorAll('[data-slot="select-item"]')].map(i => i.textContent.trim()))`);
  console.log("POPUP ITEMS:", items);

  // 3. 点击 "English"
  const clicked = await evaljs(`(() => {
    const items = [...document.querySelectorAll('[data-slot="select-item"]')];
    const target = items.find(i => i.textContent.includes('English'));
    if (!target) return false;
    target.click();
    return true;
  })()`);
  console.log("CLICKED ENGLISH:", clicked);
  await SLEEP(1200); // 防抖 300ms + 写盘

  // 4. 读界面文本（应变为英文）
  const text = await evaljs(`document.body.innerText.slice(0, 600)`);
  console.log("=== UI TEXT AFTER SWITCH ===");
  console.log(text);

  // 5. 检查 settings.json 是否落盘
  const settingsPath = join(process.env.LOCALAPPDATA, "com.ffmediatool.app", "settings.json");
  console.log("SETTINGS FILE EXISTS:", existsSync(settingsPath));
  if (existsSync(settingsPath)) {
    const s = JSON.parse(readFileSync(settingsPath, "utf8"));
    console.log("PERSISTED language:", s.language, "| theme:", s.theme, "| accent:", s.accentColor);
  }
  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });