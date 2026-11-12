// 主流程：搜索 → 收集卡片 → 过滤 → 逐个沟通 → 记录。支持 --dry-run 只筛选不点击。
import fs from "node:fs";
import path from "node:path";
import {
  config, log, warn, p, rand, sleep, launch, ensureLoggedIn,
  readCooldown, writeCooldown, clearCooldown,
} from "./common.mjs";
import { checkJob } from "./filter.mjs";
import { pickGreeting } from "./greeting.mjs";
import { notify } from "./notify.mjs";
import { appendApplied, bumpToday, loadApplied, todayCount } from "./store.mjs";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")) return argv[i + 1];
  return fallback;
};
const DRY = argv.includes("--dry-run");
const LIMIT = Number(arg("limit", config.search.maxApplyPerRun));
const PAGES = Number(arg("pages", config.search.maxPages));
const CITY = arg("city", config.search.city);
// 支持一次跑多个关键词（保安 / 仓管），逐个搜、共用同一份去重台账。
const QUERIES = (() => {
  const single = arg("query", null);
  if (single) return [single];
  const many = Array.isArray(config.search.queries) ? config.search.queries.filter(Boolean) : [];
  if (many.length) return many;
  return [config.search.query].filter(Boolean);
})();

const S = {
  // 2026-11 版本（v6815）：卡片是 li.job-card-box，公司名用 .boss-name，地区用 .company-location
  card: ["li.job-card-box", ".job-card-wrap", "li.job-card-wrapper", ".job-card-wrapper", "ul.job-list-box > li"],
  title: [".job-name"],
  company: [".boss-name", ".company-name a", ".company-name"],
  salary: [".job-salary", ".salary"],
  area: [".company-location", ".job-area"],
  tag: [".tag-list li", ".tag-list span"],
  chatBtn: [".start-chat-btn", ".op-btn-chat", ".btn-startchat"],
  detailChat: ["a.btn-startchat", ".btn-startchat", "a.op-btn-chat", ".op-btn-chat", "button.btn-startchat", ".btn-startchat-link"],
  dialog: [".dialog-container", ".dialog-wrap", ".greet-boss-dialog", ".chat-dialog"],
  input: [".dialog-container textarea", ".chat-input", ".dialog-wrap textarea", "textarea.input-area", "[contenteditable='true']"],
  send: [".dialog-container .btn-sure", ".dialog-container .btn-send", "button:has-text('发送')", ".btn-sure", ".btn-send"],
};

async function clickAny(page, selectors, { limit = 4000 } = {}) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    try {
      if (await loc.isVisible({ timeout: 600 }).catch(() => false)) {
        await loc.click({ timeout: limit });
        return sel;
      }
    } catch { /* 换下一个选择器 */ }
  }
  return "";
}

async function bodyText(page) {
  return page.evaluate(() => document.body?.innerText || "").catch(() => "");
}

async function waitHuman(page) {
  await sleep(rand(config.behavior.minDelayMs, config.behavior.maxDelayMs));
}

async function detectRisk(page) {
  const url = page.url();
  // BOSS 的二次安全校验页会直接替换掉页面内容
  if (/security\.html|_security_check|verify\.html|\/web\/passport\/zp\//i.test(url)) return "captcha";
  const text = await bodyText(page);
  if (/安全验证|异常访问行为/.test(text)) return "captcha";
  if (/今日沟通次数|沟通次数已达上限|已达上限/.test(text)) return "limit";
  if (/操作过于频繁|请稍后再试|访问异常|验证一下/.test(text)) return "throttle";
  if (/滑动验证|拖动滑块|captcha/i.test(text)) return "captcha";
  const hasCaptchaFrame = await page.locator("iframe[src*='captcha'], .geetest_panel, #captcha").first().isVisible().catch(() => false);
  return hasCaptchaFrame ? "captcha" : "";
}

/** 页面上有没有"可以点一下"的验证入口（卡片/滑块/iframe）。没有就是被静默弹回，等人也没用。 */
async function hasVerifyGate(page) {
  const byText = await page.evaluate(() => [...document.querySelectorAll("div,span,button,a")]
    .some((e) => /点击按钮进行验证|开始验证|请完成验证|拖动滑块/.test(e.innerText || ""))).catch(() => false);
  if (byText) return true;
  const byFrame = await page.locator("iframe[src*='captcha'], .geetest_panel, #captcha, [class*=verify]").first()
    .isVisible().catch(() => false);
  return Boolean(byFrame);
}

async function pauseForHuman(page, kind, shotDir) {
  if (config.behavior.screenshotOnError) {
    fs.mkdirSync(shotDir, { recursive: true });
    await page.screenshot({ path: path.join(shotDir, `${kind}-${Date.now()}.png`), fullPage: false }).catch(() => {});
  }

  // 没有可点的验证入口 = 账号被静默弹回，等下去只会浪费时间
  if (kind === "captcha" && !(await hasVerifyGate(page))) {
    return "blocked";
  }

  warn(kind === "captcha"
    ? "BOSS 弹了「安全验证」：在这个浏览器窗口里点一下「点击按钮进行验证」，过了脚本会自己继续（最多等 5 分钟）。"
    : "触发风控（频率限制）：建议先停手，休息 10-30 分钟再跑。");
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    await sleep(3000);
    const again = await detectRisk(page);
    if (!again || again === "limit") return again;
  }
  return "timeout";
}

function searchUrl(query, page = 1) {
  const params = new URLSearchParams();
  params.set("query", query);
  if (CITY) params.set("city", CITY);
  for (const [k, v] of Object.entries(config.search.params || {})) if (v) params.set(k, String(v));
  if (page > 1) params.set("page", String(page));
  return `https://www.zhipin.com/web/geek/job?${params.toString()}`;
}

/** 等卡片真正出现（SPA 是异步渲染的，固定 sleep 不可靠）。 */
async function waitForCards(page, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let last = [];
  while (Date.now() < deadline) {
    last = await collectCards(page);
    if (last.length) return last;
    await sleep(1200);
  }
  return last;
}

async function collectCards(page) {  for (const sel of S.card) {
    const count = await page.locator(sel).count().catch(() => 0);
    if (!count) continue;
    const rows = await page.evaluate(({ cardSel, titleSel, companySel, salarySel, areaSel, tagSel, chatSel }) => {
      const q = (el, list) => {
        for (const s of list) {
          const n = el.querySelector(s);
          if (n && n.innerText.trim()) return n.innerText.trim();
        }
        return "";
      };
      return [...document.querySelectorAll(cardSel)].map((el) => {
        const a = el.querySelector("a.job-name, .job-name a") || el.querySelector("a[href*='job_detail']");
        const href = a?.getAttribute("href") || el.querySelector("a[href*='job_detail']")?.getAttribute("href") || "";
        const btn = el.querySelector(chatSel.join(","));
        return {
          name: q(el, titleSel) || (a?.innerText || "").trim(),
          company: q(el, companySel),
          salary: q(el, salarySel),
          area: q(el, areaSel),
          tags: [...el.querySelectorAll(tagSel.join(","))].map((n) => n.innerText.trim()).filter(Boolean).slice(0, 6),
          href,
          jobId: (href.match(/job_detail\/([A-Za-z0-9]+?)\.html/) || href.match(/job_detail\/([A-Za-z0-9]+)/) || [])[1] || "",
          btnText: (btn?.innerText || "").trim(),
          cardText: (el.innerText || "").split("\n").slice(0, 12).join(" / "),
        };
      }).filter((x) => x.name && x.company);
    }, {
      cardSel: sel,
      titleSel: S.title,
      companySel: S.company,
      salarySel: S.salary,
      areaSel: S.area,
      tagSel: S.tag,
      chatSel: S.chatBtn,
    }).catch(() => []);
    if (rows.length) return rows;
  }
  return [];
}

/** 切关键词时 SPA 有时不重新拉数据（还显示上一个词的岗位），这里强制刷新一次。 */
async function ensureQuery(page, query) {
  const val = await page.evaluate(() => {
    const input = document.querySelector("input[type='text'], input[placeholder*='搜索'], input[placeholder*='职位']");
    return input ? input.value : "";
  }).catch(() => "");
  if (val && !String(val).includes(query)) {
    log(`搜索框还是「${val}」，强制刷新一次…`);
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    await sleep(rand(2500, 4000));
  }
}

// ---------- 新 UI（v6815）：左侧列表 + 右侧详情面板，按钮在面板里 ----------
const CARD_SEL = "li.job-card-box, .job-card-wrap";

/** 抓一次"当前页面状态"。BOSS 限流时列表会反复卸载，靠这个判断能不能动。 */
async function snap(page) {
  return page.evaluate((sel) => {
    const box = document.querySelector(".job-detail-box, .page-job-detail");
    const chat = document.querySelector(".op-btn-chat, .btn-startchat, .btn-chat");
    const sal = document.querySelector(".salary, .job-salary");
    return {
      cards: document.querySelectorAll(sel).length,
      hasPanel: Boolean(box),
      title: (box?.querySelector(".name h1, h1, .job-name")?.textContent || "").trim(),
      chatText: (chat?.textContent || "").trim(),
      salaryRaw: sal ? sal.textContent : "",
      jdLen: (box?.querySelector(".job-sec-text, .job-detail-body")?.innerText || "").length,
    };
  }, CARD_SEL).catch(() => null);
}

/** 等一个"列表和面板都在"的稳定时刻。 */
async function stable(page, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const s = await snap(page);
    if (s && s.cards > 0 && s.hasPanel) return s;
    last = s;
    await sleep(1200);
  }
  return last;
}

/** 页面内点击（Playwright 的点击在 DOM 反复卸载时必然超时） */
async function clickCardByTitle(page, title) {
  return page.evaluate(({ sel, title }) => {
    const cards = [...document.querySelectorAll(sel)];
    const norm = (s) => (s || "").replace(/\s+/g, "");
    let target = cards.find((c) => norm(c.querySelector(".job-name")?.textContent) === norm(title));
    if (!target) target = cards.find((c) => norm(c.querySelector(".job-name")?.textContent).includes(norm(title).slice(0, 8)));
    if (!target) return false;
    target.scrollIntoView({ block: "center" });
    target.click();
    return true;
  }, { sel: CARD_SEL, title }).catch(() => false);
}

/** 读面板正文（JD 反筛用），顺便把薪资编码解出来。面板是异步渲染的，要等它出现。 */
async function readPanel(page, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  let last = { jd: "", chatText: "", hasChat: false, salaryRaw: "" };
  while (Date.now() < deadline) {
    last = await page.evaluate(() => {
      const box = document.querySelector(".job-detail-box, .page-job-detail");
      const jd = (document.querySelector(".job-sec-text, .job-detail-body, .job-sec")?.innerText || "").replace(/\s+/g, " ").trim();
      const chat = document.querySelector(".op-btn-chat, .btn-startchat, .btn-chat");
      const sal = document.querySelector(".salary, .job-salary");
      return {
        jd,
        chatText: (chat?.textContent || "").trim(),
        hasChat: Boolean(chat),
        salaryRaw: sal ? sal.textContent : "",
      };
    }).catch(() => ({ jd: "", chatText: "", hasChat: false, salaryRaw: "" }));
    if (last.hasChat) return last;
    await sleep(1200);
  }
  return last;
}

/**
 * 薪资是「字体加密」的：数字被换成 kanzhun-mix 字体里的私有区码位（U+E0xx）。
 * 用同一页面把每个字符和 0-9 都用这个字体画到 canvas 上逐像素比对，就能建出映射表。
 */
async function salaryDecoder(page) {
  const map = await page.evaluate(() => {
    try {
      const el = document.querySelector(".job-salary, .salary");
      if (!el) return {};
      const family = getComputedStyle(el).fontFamily || "kanzhun-mix";
      const c = document.createElement("canvas");
      c.width = 24; c.height = 32;
      const g = c.getContext("2d");
      const sig = (ch) => {
        g.clearRect(0, 0, 24, 32);
        g.fillStyle = "#000";
        g.font = "22px " + family;
        g.fillText(ch, 2, 24);
        return Array.from(g.getImageData(0, 0, 24, 32).data).join(",");
      };
      const digits = new Map();
      for (let d = 0; d <= 9; d++) digits.set(sig(String(d)), String(d));
      const out = {};
      const chars = new Set();
      for (const node of document.querySelectorAll(".job-salary, .salary, .job-detail-box .salary")) {
        for (const ch of node.textContent) chars.add(ch);
      }
      for (const ch of chars) {
        const d = digits.get(sig(ch));
        if (d !== undefined) out[ch.codePointAt(0).toString(16)] = d;
      }
      return out;
    } catch { return {}; }
  }).catch(() => ({}));
  return (raw) => {
    if (!raw) return "";
    let out = "";
    for (const ch of raw) {
      const key = ch.codePointAt(0).toString(16);
      out += map[key] !== undefined ? map[key] : ch;
    }
    return out;
  };
}

/** 在面板里点「立即沟通」，并处理打招呼弹窗。全部用页面内点击。 */
async function clickChat(page) {
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector(".op-btn-chat, .btn-startchat, .btn-chat");
    if (!btn) return false;
    btn.click();
    return true;
  }).catch(() => false);
  if (!clicked) return { ok: false, reason: "面板里没有沟通按钮" };
  await sleep(rand(1500, 2800));
  return { ok: true };
}

async function sendDialogText(page, text) {
  return page.evaluate((content) => {
    const box = document.querySelector(".dialog-container, .dialog-wrap, .greet-boss-dialog, .chat-dialog");
    if (!box) return "no-dialog";
    const area = box.querySelector("textarea, [contenteditable='true']");
    if (area) {
      if (area.tagName === "TEXTAREA") {
        area.focus();
        area.value = content;
        area.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        area.focus();
        area.textContent = content;
        area.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
    const send = [...box.querySelectorAll("a,button,span,div")]
      .find((e) => /^发送$|^确定$|^发送消息$/.test((e.textContent || "").trim()));
    if (send) { send.click(); return "sent"; }
    return "no-send-btn";
  }, text).catch((e) => "err:" + e.message.slice(0, 40));
}

/** 薪资兜底：列表数字被字体加密，但 JD 正文里常写着「薪资待遇:6000-8200」，从那儿抠。 */
function salaryFromJd(jd) {
  if (!jd) return "";
  const m = jd.match(/(\d{4,5})\s*[-~到至]\s*(\d{4,5})/) || jd.match(/月薪\s*(\d{4,5})/) || jd.match(/薪资[^0-9]{0,6}(\d{4,5})/);
  if (!m) return "";
  const lo = Number(m[1]) / 1000;
  const hi = m[2] ? Number(m[2]) / 1000 : lo;
  const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return `${fmt(lo)}-${fmt(hi)}K`;
}

/**
 * 新版列表页是「列表 + 右侧面板」，而且 DOM 会周期性卸载重载（2-4 秒一轮），
 * Playwright 的多次往返根本赶不上。所以整段动作都在**页面内一次执行**：
 * 找卡 → 点开 → 等面板 → 读 JD/薪资 → 点立即沟通 → 填打招呼 → 发送。
 */
/**
 * 新 UI（v6815）是「左列表 + 右面板」，且点卡片会触发 SPA 导航 —— 页面内 async 函数
 * 会在点击瞬间被销毁（Execution context destroyed）。所以严格拆成四步，
 * 每一步都只做一件同步动作，中间靠 Node 侧等待：
 *   ① 点卡片（同步返回）② 等导航完、读面板（JD/薪资/按钮文案）③ 点立即沟通（同步返回）
 *   ④ 等一会儿看结果（URL 是否进聊天页 / 按钮是否变「继续沟通」）
 */
async function applyOne(page, job, shotDir, listUrl) {
  const rejectWords = config.filter.rejectJdKeywords || [];
  try {
    // ① 点开这张卡（只做同步 click，不等任何东西）
    const picked = await page.evaluate(({ title }) => {
      const norm = (s) => (s || "").replace(/\s+/g, "");
      const cards = [...document.querySelectorAll("li.job-card-box, .job-card-wrap")];
      if (!cards.length) return "no-cards";
      const card = cards.find((c) => norm(c.querySelector(".job-name")?.textContent) === norm(title))
        || cards.find((c) => norm(c.querySelector(".job-name")?.textContent).includes(norm(title).slice(0, 8)));
      if (!card) return "not-found";
      card.scrollIntoView({ block: "center" });
      card.click();
      return "ok";
    }, { title: job.name }).catch(() => "err");
    if (picked === "no-cards") return { status: "risk", detail: "列表空" };
    if (picked !== "ok") return { status: "skip", detail: `列表里没找到「${job.name.slice(0, 12)}」` };

    // ② 等导航/面板刷新，然后读面板
    await sleep(rand(2200, 3200));
    let panel = { hasChat: false, jd: "", chatText: "", salaryRaw: "" };
    for (let i = 0; i < 6; i++) {
      panel = await page.evaluate(() => {
        const btn = document.querySelector(".op-btn-chat, .btn-startchat, .btn-chat");
        const jd = (document.querySelector(".job-sec-text, .job-detail-body, .job-sec")?.innerText || "").replace(/\s+/g, " ").trim();
        const sal = document.querySelector(".salary, .job-salary");
        return { hasChat: Boolean(btn), chatText: (btn?.textContent || "").trim(), jd, salaryRaw: sal ? sal.textContent : "" };
      }).catch(() => ({ hasChat: false, jd: "", chatText: "", salaryRaw: "" }));
      if (panel.hasChat) break;
      await sleep(1500);
    }

    const salary = salaryFromJd(panel.jd);
    if (!panel.hasChat) return { status: "fail", detail: "面板里没等到沟通按钮", salary };
    if (/继续沟通|已沟通/.test(panel.chatText)) return { status: "skip", detail: "已沟通过", salary };

    const hit = rejectWords.find((k) => k && panel.jd.includes(k));
    if (hit) return { status: "skip", detail: `JD 含「${hit}」`, jdBad: hit, salary, jd: panel.jd.slice(0, 50) };

    if (DRY) return { status: "dry", detail: "可投（预扫不点击）", salary, jd: panel.jd.slice(0, 60) };

    // ③ 点「立即沟通」（同步返回，导航交给它自己）
    const pushed = await page.evaluate(() => {
      const btn = document.querySelector(".op-btn-chat, .btn-startchat, .btn-chat");
      if (!btn) return false;
      btn.click();
      return true;
    }).catch(() => false);
    if (!pushed) return { status: "fail", detail: "点不到沟通按钮", salary };

    // ④ 看结果
    await sleep(rand(2600, 3800));
    const after = await page.evaluate(() => ({
      url: location.href,
      body: (document.body.innerText || "").slice(0, 600),
      chat: (document.querySelector(".op-btn-chat, .btn-startchat")?.textContent || "").trim(),
    })).catch(() => ({ url: page.url(), body: "", chat: "" }));

    if (/今日沟通次数|沟通次数已达上限/.test(after.body)) return { status: "limit", detail: "今日沟通已达上限", salary };
    if (/沟通成功|已发送|消息已发送/.test(after.body)) return { status: "ok", detail: "已沟通", salary };
    if (/\/web\/geek\/chat/.test(after.url)) return { status: "ok", detail: "已进聊天页", salary };
    if (/继续沟通/.test(after.chat)) return { status: "ok", detail: "已沟通(按钮变化)", salary };
    return { status: "unknown", detail: "点了没看到回执", salary };
  } catch (error) {
    return { status: "fail", detail: String(error?.message || error).slice(0, 100) };
  }
}
/** 动作做完可能跳到聊天页，回到列表并重新稳定。 */
async function backToList(page, listUrl) {
  if (!listUrl) return;
  if (!page.url().includes("/web/geek/job")) {
    await page.goto(listUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
    await sleep(rand(2000, 3500));
  }
  await stable(page, 25000);
}

// ---------------- 主流程 ----------------
const shotDir = path.join(p("screenshots"));
const applied = loadApplied();
let today = todayCount();

// 被 BOSS 弹回首页并挂上 _security_check 时，会连续撞风控；先看有没有冷却期
const cooling = readCooldown();
if (cooling && !argv.includes("--force")) {
  const h = Math.round(cooling.remainingMs / 3600000 * 10) / 10;
  warn(`账号还在风控冷却期，剩 ${h} 小时（${cooling.reason || "上次被弹回首页"}）。`);
  warn("冷却期内继续访问只会让风控更严。要强行跑加参数：--force");
  process.exit(2);
}
log(`模式：${DRY ? "只筛选不投递(dry-run)" : "真实投递"}｜关键词「${QUERIES.join(" / ")}」｜城市 ${CITY}｜今日已投 ${today}/${config.search.maxApplyPerDay}`);

const context = await launch({ headless: config.behavior.headless === true });
const page = context.pages()[0] || (await context.newPage());
await ensureLoggedIn(page);

let sent = 0;
let scanned = 0;
const skipped = [];

outer:
for (const QUERY of QUERIES) {
log(`=== 关键词：${QUERY} ===`);
for (let pageNo = 1; pageNo <= PAGES; pageNo++) {
  const url = searchUrl(QUERY, pageNo);
  log(`第 ${pageNo} 页：${url}`);
  // 被风控时 BOSS 的 JS 会在导航中途跳走，goto 会抛 ERR_ABORTED；这不是错误，按当前 URL 判断即可
  await page.goto(url, { waitUntil: "domcontentloaded" }).catch((e) => {
    if (!/ERR_ABORTED|NS_BINDING_ABORTED|interrupted by another navigation/i.test(String(e?.message))) throw e;
  });
  await sleep(rand(1500, 3000));

  const risk = await detectRisk(page);
  if (risk === "captcha") {
    const still = await pauseForHuman(page, "captcha", shotDir);
    if (still === "blocked") {
      const until = writeCooldown({ hours: 6, reason: "被弹回首页，且没有可点的验证入口" });
      warn("BOSS 没给验证入口，直接把职位页弹回了首页 —— 账号当前处于风控状态。");
      warn(`已冷却到 ${until.toLocaleString("zh-CN")}，期间脚本不再访问。`);
      warn("恢复：手机上用 BOSS App 正常刷职位（有提示就按要求验证），过几小时再跑脚本。");
      break outer;
    }
    if (still) { warn("验证未通过，停止本轮。"); break outer; }
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    await sleep(2000);
  }

  // 像人一样往下滚一滚，让卡片全部加载
  for (let i = 0; i < rand(2, 4); i++) {
    await page.mouse.wheel(0, rand(400, 900));
    await sleep(rand(600, 1400));
  }

  // 被弹回首页并挂上 _security_check：账号级风控，不是选择器问题，立刻停手
  if (/_security_check/.test(page.url())) {
    const until = writeCooldown({ hours: 6, reason: "职位页被弹回首页(_security_check)" });
    warn("BOSS 把职位页弹回了首页（_security_check），这是账号被风控，不是页面选择器坏了。");
    warn(`已设置冷却到 ${until.toLocaleString("zh-CN")}，期间脚本不再访问 BOSS。`);
    warn("恢复办法：手机上用 BOSS App 正常刷职位/按要求验证一次；或等几小时。别再用脚本连撞。");
    break outer;
  }

  await ensureQuery(page, QUERY);
  const cards = await waitForCards(page, 20000);
  if (!cards.length) {
    const where = page.url();    const probe = await page.evaluate(() => ({
      skeleton: Boolean(document.querySelector(".page-loading, [class*=skeleton], [class*=loading-box]")),
      bars: document.querySelectorAll("[class*=skeleton], .page-loading").length,
      text: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 90),
    })).catch(() => ({}));
    warn(`这一页没抓到岗位卡片。当前页面：${where}`);
    if (probe.bars || probe.skeleton) {
      const until = writeCooldown({ hours: 4, reason: "职位列表停在骨架屏，数据接口被限流" });
      warn("页面一直停在骨架屏（灰条占位）—— 职位数据接口没给数据，这是账号/出口 IP 被限流，不是脚本选择器的问题。");
      warn(`已冷却到 ${until.toLocaleString("zh-CN")}。处理：手机 App 正常用一会儿，或换网络（关掉代理/VPN），过几小时再跑。`);
      break outer;
    }
    if (probe.text) warn(`页面内容：${probe.text}`);
    if (!/\/web\/geek\/job/.test(where)) {
      const until = writeCooldown({ hours: 6, reason: `搜索页被弹走：${where.slice(0, 80)}` });
      warn("搜索页被 BOSS 弹走到别的地址 —— 账号在风控里，已冷却到 " + until.toLocaleString("zh-CN"));
      break outer;
    }
    warn("地址还是搜索页但 20 秒内没出卡片：可能是网络慢，或选择器又变了。");
    break;
  }
  clearCooldown();

  for (const job of cards) {
    scanned++;
    if (sent >= LIMIT) { log(`到达本轮上限 ${LIMIT}，收工。`); break outer; }
    if (today >= config.search.maxApplyPerDay) { log(`到达每日上限 ${config.search.maxApplyPerDay}，收工。`); break outer; }

    const key = job.jobId || `${job.company}|${job.name}`;
    if (applied.has(key)) continue;
    if (config.filter.skipIfAlreadyChat && /继续沟通|已沟通/.test(job.btnText || "")) continue;

    const verdict = checkJob(job);
    if (!verdict.ok) {
      skipped.push({ ...job, reason: verdict.reason });
      if (DRY) log(`跳过｜${job.company}｜${job.name}｜${verdict.reason}`);
      continue;
    }
    if (verdict.note) warn(`${job.company}｜${job.name}｜${verdict.note}`);

    const result = await applyOne(page, job, shotDir, url);

    if (DRY) {
      const sal = result.salary || job.salary || "-";
      if (result.status === "dry") {
        log(`候选｜${job.company}｜${job.name}｜薪资 ${sal || "?"}｜${job.area || "-"}｜${job.tags.join(",")}｜JD ${result.jd ? "✓" : "空"}`);
      } else {
        log(`候选(未确认)｜${job.company}｜${job.name}｜${result.detail}`);
      }
      applied.add(key);
      break; // 预扫只看第一页的第一批，够判断就行，别把账号拖进限流
    }

    const row = {
      ts: new Date().toISOString(),
      jobId: job.jobId,
      name: job.name,
      company: job.company,
      salary: result.salary || job.salary,
      area: job.area,
      status: result.status,
      detail: result.detail,
      url: job.href,
    };
    appendApplied(row);
    applied.add(key);

    if (result.jdBad) {
      fs.appendFileSync(
        path.join(p("data"), "suspect.jsonl"),
        JSON.stringify({ ts: row.ts, company: job.company, name: job.name, keyword: result.jdBad, url: job.href }) + "\n",
        "utf8",
      );
    }

    if (result.status === "ok") {
      sent++;
      today = bumpToday(1);
      log(`✅ 已沟通｜${job.company}｜${job.name}｜${result.salary || job.salary}｜今日 ${today}`);
    } else if (result.status === "limit") {
      warn("今日沟通次数已达上限，停止本轮。");
      break outer;
    } else if (result.status === "risk") {
      const still = await pauseForHuman(page, result.detail || "risk", shotDir);
      if (still) { warn("风控未解除，停止本轮。"); break outer; }
    } else {
      log(`— ${result.status}｜${job.company}｜${job.name}｜${result.detail}`);
    }

    await backToList(page, url);
    await waitHuman(page);
    if (sent && sent % config.behavior.restEveryApplies === 0) {
      const [a, b] = config.behavior.restMs;
      const ms = rand(a, b);
      log(`已连投 ${sent} 个，休息 ${Math.round(ms / 1000)} 秒（真人节奏，别硬顶）。`);
      await sleep(ms);
    }
  }

  const [pa, pb] = config.behavior.pageDelayMs;
  await sleep(rand(pa, pb));
}
}

log(`本轮结束：扫描 ${scanned} 个岗位，成功沟通 ${sent} 个，跳过 ${skipped.length} 个。`);
log(`台账：${path.join(p("data"), "applied.jsonl")}｜导出 Excel 用：npm run report`);
if (sent > 0) {
  await notify([
    "【BOSS 自动投递】",
    `关键词「${QUERIES.join(" / ")}」城市 ${CITY}`,
    `本轮沟通成功 ${sent} 个（今日累计 ${today}）`,
    `扫描 ${scanned}，本地/黑名单跳过 ${skipped.length}`,
  ].join("\n"));
}
    await context.browser()?.close().catch(() => {}); // CDP 接管：只断开连接，浏览器窗口留着复用
