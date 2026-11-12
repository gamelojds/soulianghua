// 登录：不靠自动化浏览器扫码。
// BOSS 会识别 Playwright 开出来的浏览器并重定向到 security.html（表现为"自己跳出去"），
// 所以这里改成：① 先用无自动化特征的 Edge 打开登录页让你扫码 → ② 关窗后由脚本读 cookie 验证。
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { launch, p, log, warn, sleep, EDGE } from "./common.mjs";

const VERIFY_ONLY = process.argv.includes("--verify");

const PROFILE = p("profile");
const LOGIN_URL = "https://www.zhipin.com/web/user/?ka=header-login";
const stateFile = path.join(p("data"), "login-state.json");
const TOKEN_COOKIES = ["zp_token", "bst", "wt2", "atoken", "__zp_stoken__", "t"];

function writeState(payload) {
  fs.writeFileSync(stateFile, JSON.stringify({ checkedAt: new Date().toISOString(), ...payload }, null, 2), "utf8");
}

/** 读 cookie 判断是否已登录（不看 DOM，避免被安全页误导）。 */
async function verify() {
  const context = await launch({ headless: true });
  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto("https://www.zhipin.com/web/geek/job", { waitUntil: "domcontentloaded" }).catch(() => {});
    await sleep(2500);
    const cookies = (await context.cookies("https://www.zhipin.com")) || [];
    const names = cookies.map((c) => c.name);
    const auth = names.find((n) => TOKEN_COOKIES.includes(n));
    // __zp_stoken__ 只是风控令牌，真正代表登录的是 zp_token / bst / wt2
    const strong = names.some((n) => ["zp_token", "bst", "wt2", "atoken"].includes(n));
    return {
      cookies: names,
      authCookie: auth || "",
      ok: strong,
      pageUrl: page.url(),
      onSecurityPage: /security\.html|_security_check/.test(page.url()),
    };
  } finally {
    await context.browser()?.close().catch(() => {}); // CDP 接管：只断开连接，浏览器窗口留着复用
  }
}

function openPlainEdge() {
  return new Promise((resolve) => {
    log("正在用【干净的 Edge】打开登录页（没有自动化特征，BOSS 不会跳安全页）。");
    log("→ 手机 BOSS 直聘 App 扫码登录");
    log("→ 登录成功后，请把那个 Edge 窗口整个关掉（脚本靠窗口关闭来判断你登完了）");
    const child = spawn(EDGE, [
      `--user-data-dir=${PROFILE}`,
      "--profile-directory=Default",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-features=msEdgeFirstRunExperience",
      LOGIN_URL,
    ], { detached: false, stdio: "ignore" });
    const kill = () => { try { child.kill(); } catch {} };
    process.on("SIGINT", kill);
    const timer = setTimeout(() => {
      warn("等了 15 分钟还没关窗口，先按你现在的状态继续验证。");
      kill();
      resolve();
    }, 15 * 60 * 1000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
    child.on("error", (error) => { clearTimeout(timer); warn("启动 Edge 失败：" + error.message); resolve(); });
  });
}

// ---------------- 主流程 ----------------
log("先检查当前登录态…");
let result = await verify();

if (result.ok) {
  log(`已经登录（凭证 cookie: ${result.authCookie}），不用再扫码。`);
  writeState({ ok: true, cookieNames: result.cookies, authCookie: result.authCookie, source: "already" });
  process.exit(0);
}

if (VERIFY_ONLY) {
  warn(`未登录（找到的 cookie: ${result.cookies.join(", ") || "无"}）`);
  writeState({ ok: false, cookieNames: result.cookies, pageUrl: result.pageUrl, source: "verify" });
  process.exit(1);
}

log("当前未登录，开始扫码流程…");
await openPlainEdge();
await sleep(1500);

log("窗口已关闭，正在验证登录结果…");
result = await verify();

if (result.ok) {
  log(`✅ 登录成功（凭证 cookie: ${result.authCookie}）。以后直接投递就行，不用再扫码。`);
  writeState({ ok: true, cookieNames: result.cookies, authCookie: result.authCookie, source: "login" });
  process.exit(0);
}

warn("还是没有抓到登录凭证。常见原因：");
warn("  1) 窗口关太早，二维码还没扫完就被关了");
warn("  2) 扫码后 BOSS 弹了「安全验证」，你没点完");
warn("  3) 登录页跳到了 passport 域名但你中途退出了");
warn(`当前 cookie：${result.cookies.join(", ") || "无"}`);
warn("重跑一次：双击桌面图标 → 点「① 扫码登录」，或者 npm run login");
writeState({ ok: false, cookieNames: result.cookies, pageUrl: result.pageUrl, source: "login" });
process.exit(1);
