// 调试：检查 toast + 手动 invoke save_settings
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
    if (r.exceptionDetails) return "EVAL-ERR: " + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result?.value;
  };

  // 1. 页面上的 toast
  console.log("TOASTS:", await evaljs(`JSON.stringify([...document.querySelectorAll('[data-sonner-toast]')].map(t => t.textContent))`));

  // 2. 直接调 Tauri invoke（手动构造一次 save）
  const invokeRes = await evaljs(`(async () => {
    try {
      const st = await window.__TAURI_INTERNALS__.invoke('get_settings');
      return JSON.stringify({ ok: true, settings: st });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e) });
    }
  })()`);
  console.log("INVOKE get_settings:", invokeRes);

  // 3. 手动 save 一份
  const saveRes = await evaljs(`(async () => {
    try {
      const st = await window.__TAURI_INTERNALS__.invoke('get_settings');
      const saved = await window.__TAURI_INTERNALS__.invoke('save_settings', { settings: { ...st, accentColor: '#dc2626' } });
      return JSON.stringify({ ok: true, accent: saved.accentColor });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e) });
    }
  })()`);
  console.log("INVOKE save_settings:", saveRes);

  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });