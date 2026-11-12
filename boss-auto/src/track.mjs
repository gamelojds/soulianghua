// 投后跟踪 + 面试提醒 + HR 消息自动回复。
// 设计原则：只回「普通询问」，遇到约面/不合适一律不动手，只记台账 + 推手机。
import fs from "node:fs";
import path from "node:path";
import { config, log, warn, p, rand, sleep, launch, ensureLoggedIn, readCooldown } from "./common.mjs";
import { notify } from "./notify.mjs";

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const MAX = Number((argv.find((a) => a.startsWith("--max=")) || "").split("=")[1] || 15);

const replyCfg = config.autoReply || {};
const stateFile = path.join(p("data"), "reply-state.json");
const trackFile = path.join(p("data"), "track.jsonl");
const loadState = () => { try { return JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch { return {}; } };
const saveState = (s) => fs.writeFileSync(stateFile, JSON.stringify(s, null, 2), "utf8");

const RE_INTERVIEW = /面试|面谈|约个时间|什么时候方便|方便过来|电话沟通|加个微信|聊聊时间|来公司/;
const RE_REJECT = /不合适|已招满|暂停招聘|岗位关闭|已经招到|再联系|不符合|不考虑/;
const RE_ASK = /简历|方便|在吗|您好|你好|聊|看机会|薪资|期望|岗位|JD/i;

async function lastMessages(page) {
  return page.evaluate(() => {
    const sels = [".message-list li", ".chat-message", ".message-item", ".message-list .item"];
    for (const s of sels) {
      const nodes = [...document.querySelectorAll(s)];
      if (nodes.length) return nodes.slice(-6).map((n) => (n.innerText || "").replace(/\s+/g, " ").trim()).filter(Boolean);
    }
    return [];
  }).catch(() => []);
}

async function conversationList(page) {
  return page.evaluate(() => {
    const sels = [".chat-user", ".chat-user-list li", ".user-list li", ".chat-list li"];
    for (const s of sels) {
      const nodes = [...document.querySelectorAll(s)];
      if (nodes.length) {
        return nodes.map((n, i) => {
          const badge = n.querySelector(".notice-badge, .badge-count, .unread-count");
          return {
            index: i,
            text: (n.innerText || "").replace(/\s+/g, " ").trim().slice(0, 120),
            unread: Boolean(badge) && !/0/.test(badge.textContent || ""),
            name: (n.querySelector(".name-text, .name, .geek-name")?.innerText || "").trim(),
            company: (n.querySelector(".company-name, .title-box .name")?.innerText || "").trim(),
          };
        }).filter((x) => x.text);
      }
    }
    return [];
  }).catch(() => []);
}

async function sendReply(page, text) {
  const box = page.locator(".chat-input, div[contenteditable='true'].chat-input, textarea.input-area").first();
  if (!(await box.isVisible().catch(() => false))) return false;
  await box.click({ timeout: 3000 }).catch(() => {});
  await page.keyboard.type(text, { delay: rand(40, 90) });
  await sleep(rand(300, 800));
  await page.keyboard.press("Enter");
  await sleep(rand(800, 1500));
  return true;
}

// 风控冷却期内不碰 BOSS（apply 被拦时这里也一样要停，否则等于继续撞）
const cooling = readCooldown();
if (cooling && !argv.includes("--force")) {
  const h = Math.round(cooling.remainingMs / 3600000 * 10) / 10;
  warn(`账号还在风控冷却期，剩 ${h} 小时（${cooling.reason || ""}）。跟踪也跳过。要强行跑加 --force。`);
  process.exit(2);
}

const context = await launch({ headless: config.behavior.headless === true });
const page = context.pages()[0] || (await context.newPage());
await ensureLoggedIn(page);
await page.goto("https://www.zhipin.com/web/geek/chat", { waitUntil: "domcontentloaded" });
await sleep(rand(2500, 4000));

const list = await conversationList(page);
if (!list.length) {
  warn("没抓到会话列表（未登录/无沟通记录/或选择器变了）。截图已存。");
  fs.mkdirSync(path.join(p("screenshots")), { recursive: true });
  await page.screenshot({ path: path.join(p("screenshots"), `chat-${Date.now()}.png`) }).catch(() => {});
    await context.browser()?.close().catch(() => {}); // CDP 接管：只断开连接，浏览器窗口留着复用
  process.exit(0);
}
log(`会话 ${list.length} 个，本轮处理前 ${Math.min(MAX, list.length)} 个`);

const state = loadState();
const today = new Date().toISOString().slice(0, 10);
const events = [];
let replied = 0;

for (const conv of list.slice(0, MAX)) {
  const label = conv.company || conv.text;
  try {
    const item = page.locator(".chat-user, .chat-user-list li, .user-list li, .chat-list li").nth(conv.index);
    await item.click({ timeout: 5000 });
    await sleep(rand(1200, 2400));
    const msgs = await lastMessages(page);
    const last = msgs[msgs.length - 1] || "";
    if (!last) continue;

    let verdict = "chatting";
    if (RE_INTERVIEW.test(last)) verdict = "interview";
    else if (RE_REJECT.test(last)) verdict = "rejected";

    const row = { ts: new Date().toISOString(), company: label, hr: conv.name, last, verdict, unread: conv.unread };
    events.push(row);
    fs.appendFileSync(trackFile, JSON.stringify(row) + "\n", "utf8");

    if (verdict === "interview") {
      log(`🎯 面试邀约｜${label}｜${last.slice(0, 60)}`);
      await notify(`【面试邀约】${label}\n${last.slice(0, 300)}\n请尽快回复。`);
      continue;
    }
    if (verdict === "rejected") {
      log(`✕ 不匹配/招满｜${label}｜${last.slice(0, 60)}`);
      fs.appendFileSync(path.join(p("data"), "blacklist-candidates.jsonl"),
        JSON.stringify({ ts: new Date().toISOString(), company: label, reason: last.slice(0, 80) }) + "\n", "utf8");
      continue;
    }

    // 普通询问才考虑自动回复
    if (!replyCfg.enabled) continue;
    if (!conv.unread && !replyCfg.replyEvenIfRead) continue;
    if (!RE_ASK.test(last)) continue;
    if (replied >= (replyCfg.maxPerRun || 5)) { log("到达自动回复上限，本轮不再回。"); break; }
    const key = `${label}|${conv.name}`;
    if (state[key] === today) continue;

    const text = String(replyCfg.text || "在的，方便的话我把简历发您，或者您发一下 JD 我先看下，谢谢！");
    if (DRY) {
      log(`[dry] 会回复｜${label}｜对方：${last.slice(0, 40)}｜回：${text}`);
      continue;
    }
    const ok = await sendReply(page, text);
    if (ok) {
      replied++;
      state[key] = today;
      saveState(state);
      log(`↩ 已回复｜${label}｜${text.slice(0, 30)}`);
      await sleep(rand(3000, 7000));
    }
  } catch (error) {
    warn(`处理会话失败：${label}｜${error.message}`);
  }
}

const interviews = events.filter((e) => e.verdict === "interview");
const rejects = events.filter((e) => e.verdict === "rejected");
log(`跟踪完成：${events.length} 个会话，面试邀约 ${interviews.length}，不匹配 ${rejects.length}，自动回复 ${replied} 条。`);
if (events.length) {
  await notify([
    "【BOSS 跟踪】",
    `检查 ${events.length} 个会话`,
    `面试邀约 ${interviews.length} 个${interviews.length ? "：" + interviews.map((i) => i.company).join("、") : ""}`,
    `不匹配 ${rejects.length} 个`,
    `自动回复 ${replied} 条`,
  ].join("\n"));
}
log(`台账：${trackFile}｜黑名单候选：data\\blacklist-candidates.jsonl（写黑名单跑 npm run learn）`);
    await context.browser()?.close().catch(() => {}); // CDP 接管：只断开连接，浏览器窗口留着复用
