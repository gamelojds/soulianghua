// 打开（或复用）那个专用 Edge 窗口，停在 BOSS 首页。
// 用途：① 手动过「安全验证」 ② 登录 ③ 肉眼看看账号现在什么状态。
// 窗口不要关——脚本每轮都接管这个窗口，同一指纹才不会反复被要求验证。
import { launch, log, sleep } from "./common.mjs";

const context = await launch({ headless: false });
const page = context.pages().find((p) => !p.url().startsWith("about:")) || context.pages()[0] || (await context.newPage());
await page.goto("https://www.zhipin.com/web/geek/job", { waitUntil: "domcontentloaded" }).catch(() => {});
await sleep(2500);

const state = await page.evaluate(() => ({
  url: location.href,
  title: document.title,
  text: (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 200),
  cards: document.querySelectorAll(".job-card-wrapper, .job-list-box li").length,
})).catch(() => ({}));

log("当前页面：" + state.url);
log("标题：" + state.title);
if (/verify\.html|security\.html|安全验证/.test(`${state.url} ${state.text}`)) {
  log("→ 页面是「安全验证」：请在这个窗口里点一下验证按钮 / 拖滑块，过了会回到职位页。");
} else if (state.cards > 0) {
  log(`→ 正常，抓到 ${state.cards} 个岗位卡片。可以直接回去点「预扫」了。`);
} else {
  log("→ 页面内容：" + (state.text || "(空)"));
}
log("窗口先别关。验证/登录弄好后回到控制台点「检查登录状态」→「② 预扫」。");
await context.browser()?.close().catch(() => {});
