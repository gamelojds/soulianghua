// 公共设施：配置、路径、日志、随机节奏、浏览器启动、登录态判断。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";
import { chromium } from "playwright-core";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** 找本机的 Edge（可用 EDGE_PATH 环境变量覆盖）。 */
function resolveEdge() {
  const cands = [
    process.env.EDGE_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  for (const p of cands) { try { if (fs.existsSync(p)) return p; } catch {} }
  return cands[1]; // 都没找到就交给调用方报错
}
export const EDGE = resolveEdge();

const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8")); }
  catch (error) {
    if (fallback !== undefined) return fallback;
    throw new Error(`读取 ${file} 失败：${error.message}`);
  }
};

export const config = readJson("config.json");
export const blacklist = readJson("blacklist.json");

export const p = (key) => {
  // 想用你平时那个 Edge 的资料（信任度更高）时：set BOSS_PROFILE_DIR=...
  if (key === "profile" && process.env.BOSS_PROFILE_DIR) {
    const dir = path.resolve(process.env.BOSS_PROFILE_DIR);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  const rel = config.paths?.[key] || key;
  const abs = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  fs.mkdirSync(abs, { recursive: true });
  return abs;
};

// ---- 风控冷却：被 BOSS 弹回首页时，别继续撞，先冻一段时间 ----
const cooldownFile = () => path.join(ROOT, "data", "cooldown.json");

export function readCooldown() {
  try {
    const data = JSON.parse(fs.readFileSync(cooldownFile(), "utf8"));
    const until = Date.parse(data.until || "");
    if (Number.isFinite(until) && until > Date.now()) return { ...data, remainingMs: until - Date.now() };
    return null;
  } catch { return null; }
}

export function writeCooldown({ hours = 6, reason = "" } = {}) {
  const until = new Date(Date.now() + hours * 3600 * 1000);
  fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
  fs.writeFileSync(cooldownFile(), JSON.stringify({
    until: until.toISOString(),
    reason,
    created: new Date().toISOString(),
  }, null, 2), "utf8");
  return until;
}

export function clearCooldown() {
  try { fs.rmSync(cooldownFile(), { force: true }); } catch {}
}

export const log = (...args) => console.log(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}]`, ...args);
export const warn = (...args) => console.warn(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] ⚠`, ...args);
export const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function parseSalary(text) {
  const raw = String(text || "").replace(/\s/g, "");
  if (!raw) return null;
  // 15-25K / 15-25K·14薪 / 1.5-2.5万 / 200-300元/天 / 面议
  let m = raw.match(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)(K|k|万|千)/);
  if (m) {
    const unit = m[3];
    let lo = Number(m[1]);
    let hi = Number(m[2]);
    if (unit === "万") { lo *= 10; hi *= 10; }
    if (unit === "千") { lo /= 1; hi /= 1; }        // 千 == K
    if (/元\/天/.test(raw)) { lo = lo * 21 / 1000; hi = hi * 21 / 1000; } // 折算成月薪(21天)
    return { min: lo, max: hi, text: raw };
  }
  m = raw.match(/(\d+(?:\.\d+)?)(K|k|万)以上/);
  if (m) {
    const lo = m[2] === "万" ? Number(m[1]) * 10 : Number(m[1]);
    return { min: lo, max: Infinity, text: raw };
  }
  return null;
}

/**
 * 清掉占用本 profile 的残留浏览器。
 * Chromium 一个 user-data-dir 只允许一个实例：上一轮没退干净的 headless/自动化进程会把
 * 目录锁住，之后每次启动都是「秒退」，表现为"点了没反应/扫描 0 个岗位"。
 * 只杀带 --headless / remote-debugging-pipe 的（即脚本自己起的），不动你手工登录的窗口。
 */
export function killStaleBrowsers(profileDir) {
  const safe = String(profileDir).replace(/'/g, "''");
  const ps = [
    `$p='${safe}'`,
    `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" |`,
    `Where-Object { $_.CommandLine -and $_.CommandLine.Contains($p) -and ($_.CommandLine.Contains('--headless') -or $_.CommandLine.Contains('remote-debugging-pipe')) } |`,
    `ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }`,
  ].join(" ");
  try {
    execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], {
      windowsHide: true, timeout: 25000, stdio: "ignore",
    });
  } catch { /* 清理失败不致命，下面还有重试 */ }
  for (const name of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    try { fs.rmSync(path.join(profileDir, name), { force: true }); } catch {}
  }
}

/** 调试端口上的 Edge 是否已就绪。 */
async function cdpAlive(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch { return false; }
}

/**
 * 接管一个「真实的」Edge 实例（你自己装的 Edge，独立 profile，只多开了调试端口）。
 *
 * 为什么不用 Playwright 自己启动浏览器：那样带上 --enable-automation / --remote-debugging-pipe
 * 等一串特征，BOSS 直接判定"异常访问"，页面被换成「安全验证」。
 * 用 --remote-debugging-port 打开的实例是原生浏览器，navigator.webdriver 为 false，
 * BOSS 侧看到的就是普通 Edge。
 */
async function ensureDebugEdge(port, profileDir) {
  if (await cdpAlive(port)) return true;
  killStaleBrowsers(profileDir);
  const child = spawn(EDGE, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--profile-directory=Default",
    "--start-maximized",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=msEdgeFirstRunExperience",
    "https://www.zhipin.com/",
  ], { detached: true, stdio: "ignore" });
  child.unref();
  for (let i = 0; i < 60; i++) {
    if (await cdpAlive(port)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

export async function launch({ headless = false } = {}) {
  const profileDir = p("profile");
  const port = Number(process.env.BOSS_CDP_PORT || 9222);
  const ok = await ensureDebugEdge(port, profileDir);
  if (!ok) throw new Error(`连不上 Edge 调试端口 ${port}（浏览器没起来或被组策略禁了）`);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0] || (await browser.newContext());
  context.setDefaultTimeout(20000);
  console.log(`[浏览器] 已接管真实 Edge（cdp ${port}），navigator.webdriver = ${await (async () => {
    const pg = context.pages()[0];
    if (!pg) return "?";
    return pg.evaluate(() => String(navigator.webdriver)).catch(() => "?");
  })()}`);
  return context;
}

/** 已登录：能看到顶部头像/退出入口，且不在登录页。 */
export async function isLoggedIn(page) {
  const url = page.url();
  if (/\/web\/user\/|\/login|\/passport\//i.test(url)) return false;
  if (await page.locator("text=登录/注册").first().isVisible().catch(() => false)) return false;
  const markers = [
    ".nav-figure img",
    ".user-nav .nav-figure",
    ".header-login-btn >> text=登录",
    ".figure",
  ];
  for (const sel of markers.slice(0, 2)) {
    if (await page.locator(sel).first().isVisible().catch(() => false)) return true;
  }
  // 兜底：cookie 里有安全令牌
  const cookies = await page.context().cookies("https://www.zhipin.com").catch(() => []);
  return cookies.some((c) => ["zp_token", "bst", "__zp_stoken__", "wt2", "atoken"].includes(c.name));
}

export async function ensureLoggedIn(page, { timeoutMs = 5 * 60 * 1000 } = {}) {
  await page.goto("https://www.zhipin.com/web/geek/job", { waitUntil: "domcontentloaded" }).catch(() => {});
  await sleep(1500);
  if (await isLoggedIn(page)) return true;

  // BOSS 的二次安全校验页：不是登录失败，是它要求验证一次
  if (/security\.html|_security_check|\/passport\//.test(page.url())) {
    warn("BOSS 弹了「安全验证」页（不是掉登录）。请在弹出的浏览器窗口里手动过一下验证，脚本会继续等。");
  } else {
    warn("未登录。请在弹出的浏览器窗口里用手机 BOSS 直聘 App 扫码登录（只需一次，登录态会存在 profile 目录）。");
  }
  warn("如果这个窗口是脚本起的（带自动化特征），建议关掉它，改用桌面控制台里的「① 扫码登录」。");

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(2000);
    if (await isLoggedIn(page)) {
      log("登录成功，登录态已保存。");
      await sleep(1000);
      return true;
    }
  }
  throw new Error("等待登录超时。请在桌面控制台点「① 扫码登录」重来一遍。");
}

export function todayKey() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
