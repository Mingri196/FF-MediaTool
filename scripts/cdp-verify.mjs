// CDP 验证脚本 v2：合并消息分发，抓 console 与异常
const port = process.argv[2] || "9223";

async function main() {
  const res = await fetch(`http://127.0.0.1:${port}/json`);
  const pages = await res.json();
  const page = pages.find((p) => p.type === "page");
  if (!page) return console.log("NO PAGE");
  console.log("PAGE:", page.url);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const events = [];

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  };

  await new Promise((resolve) => (ws.onopen = resolve));

  await send("Runtime.enable");
  await send("Log.enable").catch(() => {});

  // 重新加载并等待
  await send("Page.enable").catch(() => {});
  await send("Page.reload", { ignoreCache: true }).catch(() => {});
  await new Promise((r) => setTimeout(r, 4000));

  const evalRes = await send("Runtime.evaluate", {
    expression: `JSON.stringify({
      text: document.body ? document.body.innerText.slice(0, 2000) : 'NO BODY',
      buttons: document.querySelectorAll('button').length,
      rootHTML: document.getElementById('root')?.innerHTML.slice(0, 500) ?? 'NO ROOT',
      scripts: [...document.querySelectorAll('script')].map(s => s.src || 'inline')
    })`,
    returnByValue: true,
  });
  console.log("=== DOM AFTER RELOAD ===");
  console.log(evalRes.result.value);

  console.log("=== CAPTURED EVENTS (filtered) ===");
  const interesting = events.filter((e) =>
    ["Runtime.exceptionThrown", "Log.entryAdded", "Runtime.consoleAPICalled"].includes(e.method),
  );
  for (const e of interesting.slice(0, 15)) {
    if (e.method === "Runtime.exceptionThrown") {
      const d = e.params.exceptionDetails;
      console.log("[EXCEPTION]", d.text, "|", d.exception?.description?.slice(0, 400) ?? "");
    } else if (e.method === "Log.entryAdded") {
      console.log("[LOG]", e.params.entry.level, e.params.entry.text?.slice(0, 300));
    } else if (e.method === "Runtime.consoleAPICalled") {
      console.log("[CONSOLE]", e.params.type, JSON.stringify(e.params.args?.map((a) => a.value ?? a.description).slice(0, 3)));
    }
  }
  if (interesting.length === 0) console.log("(no exceptions/errors captured)");
  ws.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});