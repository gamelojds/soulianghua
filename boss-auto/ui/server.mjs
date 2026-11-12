// boss-auto 桌面控制台：本地 HTTP 服务 + 单页 UI，零第三方依赖。
// 只绑定 127.0.0.1，任务用子进程跑，输出通过 SSE 实时推到页面。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const UI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(UI, "..");
const PORT = Number(process.env.BOSS_UI_PORT || 5299);
const OPEN = process.env.BOSS_UI_NO_OPEN !== "1";

const CONFIG = path.join(ROOT, "config.json");
const BLACKLIST = path.join(ROOT, "blacklist.json");
const DATA = path.join(ROOT, "data");
const EDGE = [process.env.EDGE_PATH, "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"].filter(Boolean).find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || "msedge";

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const writeJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2), "utf8");

// ---------- 任务执行器（一次只跑一个） ----------
const ACTIONS = {
  login: { args: ["src/login.mjs"], title: "扫码登录" },
  checkLogin: { args: ["src/login.mjs", "--verify"], title: "检查登录状态" },
  dry: { args: ["src/apply.mjs", "--dry-run"], title: "预扫（不点击）" },
  apply: { args: ["src/apply.mjs"], title: "开始投递" },
  track: { args: ["src/track.mjs"], title: "跟踪 HR 消息" },
  report: { args: ["src/report.mjs"], title: "生成报表" },
  learn: { args: ["src/learn.mjs"], title: "查看黑名单候选" },
  learnApply: { args: ["src/learn.mjs", "--apply"], title: "写入黑名单" },
};

let job = null;              // { key, title, startedAt, child }
const buffer = [];           // 最近输出行
const clients = new Set();   // SSE 连接

function emit(line) {
  const text = String(line).replace(/\u001b\[[0-9;]*m/g, "");
  buffer.push(text);
  if (buffer.length > 800) buffer.shift();
  for (const res of clients) {
    try { res.write(`data: ${JSON.stringify(text)}\n\n`); } catch {}
  }
}

function startJob(key) {
  if (job) return { ok: false, error: `正在跑「${job.title}」，等它结束。` };
  const action = ACTIONS[key];
  if (!action) return { ok: false, error: "未知操作" };
  buffer.length = 0;
  emit(`▶ ${action.title} 开始 ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`);
  const child = spawn(process.execPath, action.args, {
    cwd: ROOT,
    windowsHide: true,
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  job = { key, title: action.title, startedAt: Date.now(), child };
  const pipe = (stream) => {
    let rest = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      rest += chunk;
      const lines = rest.split(/\r?\n/);
      rest = lines.pop() || "";
      for (const line of lines) if (line.trim()) emit(line);
    });
    stream.on("end", () => { if (rest.trim()) emit(rest); });
  };
  pipe(child.stdout);
  pipe(child.stderr);
  child.on("exit", (code) => {
    emit(`■ ${action.title} 结束，退出码 ${code}`);
    job = null;
    broadcastState();
  });
  child.on("error", (error) => {
    emit(`✗ 启动失败：${error.message}`);
    job = null;
  });
  broadcastState();
  return { ok: true };
}

function statePayload() {
  let ui = {};
  try { ui = readJson(CONFIG); } catch {}
  let uiVersion = "";
  try { uiVersion = String(fs.statSync(path.join(UI, "index.html")).mtimeMs); } catch {}
  let applied = 0;
  try {
    applied = fs.readFileSync(path.join(DATA, "applied.jsonl"), "utf8").split(/\r?\n/).filter(Boolean).length;
  } catch {}
  let today = 0;
  try {
    const daily = readJson(path.join(DATA, "daily.json"));
    const key = new Date().toLocaleDateString("sv-SE");
    today = Number(daily[key] || 0);
  } catch {}
  let loginSaved = false;
  let loginInfo = null;
  try {
    loginInfo = readJson(path.join(DATA, "login-state.json"));
    loginSaved = loginInfo?.ok === true;
  } catch { loginSaved = false; }
  let blacklist = { companyKeywords: [], companyNames: [], titleKeywords: [] };
  try { blacklist = readJson(BLACKLIST); } catch {}
  return {
    running: job ? { key: job.key, title: job.title, seconds: Math.round((Date.now() - job.startedAt) / 1000) } : null,
    applied, today, loginSaved, loginInfo, uiVersion,
    config: ui,
    blacklist: {
      companyKeywords: blacklist.companyKeywords || [],
      companyNames: blacklist.companyNames || [],
      warnCompanyNames: blacklist.warnCompanyNames || [],
      titleKeywords: blacklist.titleKeywords || [],
      tagKeywords: blacklist.tagKeywords || [],
    },
    paths: { root: ROOT, data: DATA },
  };
}

function broadcastState() {
  const body = `data: ${JSON.stringify({ type: "state" })}\n\n`;
  for (const res of clients) { try { res.write(body); } catch {} }
}

function readLines(file) {
  try {
    // PowerShell 写的文件可能带 BOM，先剥掉再按行解析
    const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    return raw.split(/\r?\n/).filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

function ledger(limit = 40) {
  return readLines(path.join(DATA, "applied.jsonl")).slice(-limit).reverse();
}

function trackRows(limit = 15) {
  return readLines(path.join(DATA, "track.jsonl")).slice(-limit).reverse();
}

const send = (res, code, body, type = "application/json; charset=utf-8") => {  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};

const readBody = (req) => new Promise((resolve) => {
  let raw = "";
  req.on("data", (c) => { raw += c; if (raw.length > 2e6) req.destroy(); });
  req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const route = url.pathname;

  if (route === "/" || route === "/index.html") {
    return send(res, 200, fs.readFileSync(path.join(UI, "index.html"), "utf8"), "text/html; charset=utf-8");
  }
  if (route === "/api/state") return send(res, 200, statePayload());
  if (route === "/api/ledger") return send(res, 200, ledger(Number(url.searchParams.get("limit") || 40)));
  if (route === "/api/track") return send(res, 200, trackRows(Number(url.searchParams.get("limit") || 15)));

  if (route === "/api/log") {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write(`data: ${JSON.stringify({ type: "hello" })}\n\n`);
    // 一连上就推一次状态：页面不用等轮询就能拿到最新登录/任务状态
    res.write(`data: ${JSON.stringify({ type: "state" })}\n\n`);
    for (const line of buffer) res.write(`data: ${JSON.stringify(line)}\n\n`);
    clients.add(res);
    const ping = setInterval(() => { try { res.write(": ping\n\n"); } catch {} }, 15000);
    req.on("close", () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  if (route === "/api/run" && req.method === "POST") {
    const body = await readBody(req);
    return send(res, 200, startJob(String(body.action || "")));
  }
  if (route === "/api/stop" && req.method === "POST") {
    if (!job) return send(res, 200, { ok: false, error: "没有在跑的任务" });
    try { job.child.kill(); emit("⏹ 已请求停止"); } catch {}
    return send(res, 200, { ok: true });
  }

  if (route === "/api/config" && req.method === "POST") {
    const body = await readBody(req);
    try {
      const cfg = readJson(CONFIG);
      if (Array.isArray(body.queries)) cfg.search.queries = body.queries.map((s) => String(s).trim()).filter(Boolean);
      if (typeof body.city === "string") cfg.search.city = body.city.trim();
      if (Number.isFinite(Number(body.minSalaryK))) cfg.filter.minSalaryK = Number(body.minSalaryK);
      if (Number.isFinite(Number(body.maxSalaryK))) cfg.filter.maxSalaryK = Number(body.maxSalaryK);
      if (Number.isFinite(Number(body.maxApplyPerRun))) cfg.search.maxApplyPerRun = Number(body.maxApplyPerRun);
      if (Number.isFinite(Number(body.maxApplyPerDay))) cfg.search.maxApplyPerDay = Number(body.maxApplyPerDay);
      if (Number.isFinite(Number(body.maxPages))) cfg.search.maxPages = Number(body.maxPages);
      if (typeof body.sendCustomGreeting === "boolean") cfg.behavior.sendCustomGreeting = body.sendCustomGreeting;
      if (typeof body.greeting === "string") cfg.behavior.greeting = body.greeting;
      if (Array.isArray(body.rejectJdKeywords)) cfg.filter.rejectJdKeywords = body.rejectJdKeywords.map(String).filter(Boolean);
      if (typeof body.autoReplyEnabled === "boolean") cfg.autoReply.enabled = body.autoReplyEnabled;
      if (typeof body.autoReplyText === "string") cfg.autoReply.text = body.autoReply.text;
      if (body.notify && typeof body.notify === "object") {
        cfg.notify = { ...cfg.notify, ...body.notify };
      }
      writeJson(CONFIG, cfg);
      return send(res, 200, { ok: true });
    } catch (error) {
      return send(res, 500, { ok: false, error: error.message });
    }
  }

  if (route === "/api/blacklist" && req.method === "POST") {
    const body = await readBody(req);
    try {
      const bl = readJson(BLACKLIST);
      for (const key of ["companyKeywords", "companyNames", "titleKeywords"]) {
        if (Array.isArray(body[key])) {
          bl[key] = [...new Set(body[key].map((s) => String(s).trim()).filter(Boolean))];
        }
      }
      writeJson(BLACKLIST, bl);
      return send(res, 200, { ok: true });
    } catch (error) {
      return send(res, 500, { ok: false, error: error.message });
    }
  }

  if (route === "/api/open" && req.method === "POST") {
    const what = String((await readBody(req)).what || "data");
    const target = what === "root" ? ROOT : DATA;
    execFile("explorer.exe", [target], () => {});
    return send(res, 200, { ok: true });
  }

  if (route === "/api/export") {
    startJob("report");
    return send(res, 200, { ok: true, file: path.join(DATA, "applied.csv") });
  }

  return send(res, 404, { ok: false, error: "not found" });
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    // 已经开着一个控制台了：直接把窗口叫出来，不再起第二个服务。
    const addr = `http://127.0.0.1:${PORT}`;
    console.log(`控制台已在运行：${addr}`);
    if (OPEN) {
      spawn(fs.existsSync(EDGE) ? EDGE : "msedge", [
        `--app=${addr}`, "--window-size=1240,880",
        "--user-data-dir=" + path.join(ROOT, ".ui-profile"),
        "--no-first-run", "--no-default-browser-check",
      ], { detached: true, stdio: "ignore" }).unref();
    }
    setTimeout(() => process.exit(0), 1500);
    return;
  }
  console.error(error);
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  const addr = `http://127.0.0.1:${PORT}`;
  console.log(`boss-auto 控制台：${addr}`);
  if (OPEN) {
    const args = [
      `--app=${addr}`,
      `--window-size=1240,880`,
      "--user-data-dir=" + path.join(ROOT, ".ui-profile"),
      "--no-first-run",
      "--no-default-browser-check",
    ];
    try {
      spawn(fs.existsSync(EDGE) ? EDGE : "msedge", args, { detached: true, stdio: "ignore", windowsHide: false }).unref();
    } catch { execFile("cmd", ["/c", "start", "", addr]); }
  }
});
