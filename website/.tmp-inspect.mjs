// Temporary visual inspection helper (deleted after use).
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333;
const OUT = "shots";
mkdirSync(OUT, { recursive: true });

const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", "5173", "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
vite.stdout.on("data", (d) => process.stdout.write(`[vite] ${d}`));
vite.stderr.on("data", (d) => process.stderr.write(`[vite] ${d}`));
let ready = false;
for (let i = 0; i < 60; i += 1) {
  try {
    const res = await fetch("http://127.0.0.1:5173/");
    if (res.ok) { ready = true; break; }
  } catch { /* waiting */ }
  await new Promise((r) => setTimeout(r, 400));
}
if (!ready) { console.error("vite never became ready"); process.exit(1); }

const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  `--remote-debugging-port=${PORT}`,
  "--user-data-dir=C:/Users/lakay/AppData/Local/Temp/nh-chrome-profile",
  "about:blank",
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error("Chrome did not start");
}

const wsUrl = await getTarget();
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
function send(method, params = {}) {
  id += 1;
  const cid = id;
  ws.send(JSON.stringify({ id: cid, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(cid, (msg) => msg.error ? reject(new Error(`${method}: ${JSON.stringify(msg.error)}`)) : resolve(msg.result));
  });
}
async function evaluate(expression) {
  const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  return res.result?.value;
}
async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64"));
  console.log("saved", name);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
ws.addEventListener("message", (e) => {
  const msg = JSON.parse(e.data);
  if (msg.method === "Runtime.exceptionThrown") console.log("EXCEPTION", JSON.stringify(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text));
  if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") console.log("LOGERR", msg.params.entry.text?.slice(0, 300));
});

if (process.argv[3]) {
  await send("Page.addScriptToEvaluateOnNewDocument", { source: readFileSync(process.argv[3], "utf8") });
}

const tasks = JSON.parse(process.argv[2] || "[]");
for (const task of tasks) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: task.width || 390,
    height: task.height || 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await send("Page.navigate", { url: task.url });
  await sleep(task.settle || 3500);
  if (task.storage) await evaluate(task.storage);
  if (task.reloadAfterStorage) {
    await send("Page.reload", { ignoreCache: false });
    await sleep(task.settle || 3500);
  }
  if (task.click) {
    await evaluate(`document.querySelector(${JSON.stringify(task.click)})?.click(); true`);
    await sleep(700);
  }
  if (task.before) await evaluate(task.before);
  if (task.preEvalFile) console.log(task.name, "pre:", JSON.stringify(await evaluate(readFileSync(task.preEvalFile, "utf8"))));
  if (task.afterShot) await sleep(task.afterShot);
  await shot(task.name);
  if (task.html) console.log(task.name, "html:", JSON.stringify(await evaluate("document.body.innerHTML.slice(0, 1200)")));
  if (task.evalFile) console.log(task.name, "eval:", JSON.stringify(await evaluate(readFileSync(task.evalFile, "utf8"))));
  if (task.probe) {
    console.log(task.name, "probe:", JSON.stringify(await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(task.probe)});
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { cls: el.className, display: cs.display, vis: cs.visibility, op: cs.opacity, transform: cs.transform, left: r.left, top: r.top, w: r.width, h: r.height, z: cs.zIndex, bg: cs.backgroundColor, color: cs.color };
    })()`)));
  }
}

ws.close();
chrome.kill();
spawn("taskkill", ["/PID", String(vite.pid), "/T", "/F"], { stdio: "ignore" });
process.exit(0);
