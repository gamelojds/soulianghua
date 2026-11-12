// 结果推送到手机：企业微信群机器人 / Telegram / Server酱，都走纯 HTTP。
// config.notify 留空就只在控制台打印，不报错。
import { config, log } from "./common.mjs";

function endpoint() {
  const n = config.notify || {};
  if (n.type === "wecom" && n.webhook) {
    return { url: n.webhook, body: (text) => ({ msgtype: "text", text: { content: text } }) };
  }
  if (n.type === "telegram" && n.botToken && n.chatId) {
    return {
      url: `https://api.telegram.org/bot${n.botToken}/sendMessage`,
      body: (text) => ({ chat_id: n.chatId, text, disable_web_page_preview: true }),
    };
  }
  if (n.type === "serverchan" && n.sendKey) {
    return {
      url: `https://sctapi.ftqq.com/${n.sendKey}.send`,
      body: (text) => new URLSearchParams({ title: text.split("\n")[0].slice(0, 60), desp: text }).toString(),
      form: true,
    };
  }
  return null;
}

export async function notify(text) {
  const ep = endpoint();
  if (!ep) { log("[通知未配置] " + text.replaceAll("\n", " ｜ ")); return false; }
  try {
    const payload = ep.body(text);
    const res = await fetch(ep.url, {
      method: "POST",
      headers: ep.form ? { "content-type": "application/x-www-form-urlencoded" } : { "content-type": "application/json" },
      body: ep.form ? payload : JSON.stringify(payload),
    });
    if (!res.ok) { log(`[通知失败 ${res.status}] ${text.slice(0, 40)}`); return false; }
    return true;
  } catch (error) {
    log(`[通知异常] ${error.message}`);
    return false;
  }
}
