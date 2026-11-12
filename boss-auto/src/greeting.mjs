// 招呼语按岗位定制：从岗位名/标签里认技术栈，挑对应模板，变量替换后发出。
import { config } from "./common.mjs";

const DEFAULT_TEMPLATES = [
  {
    match: ["react", "vue", "前端", "web", "h5", "小程序"],
    text: "您好，看到贵司在招{岗位}。我做过 {年限} 年前端，主要栈是 {栈}，离得近/可随时到岗，方便发一下 JD 或约个时间聊吗？",
  },
  {
    match: ["java", "spring", "后端", "服务端"],
    text: "您好，{年限} 年 Java 后端经验（{栈}），对贵司 {岗位} 这个岗位很感兴趣，方便简单聊两句吗？",
  },
  {
    match: ["python", "算法", "数据", "ai", "大模型"],
    text: "您好，我做过 {年限} 年 {方向} 相关工作（{栈}），看到 {岗位} 觉得挺匹配，方便聊聊吗？",
  },
  {
    match: [],
    text: "您好，看到贵司在招{岗位}，我有相关项目经验，方便聊两句吗？",
  },
];

const STACK_WORDS = ["React", "Vue", "TypeScript", "Node", "Next", "Java", "Spring", "Python", "Go", "K8s", "MySQL", "Redis"];

function guessStack(job) {
  const text = `${job.name} ${(job.tags || []).join(" ")} ${job.jd || ""}`.toLowerCase();
  const found = STACK_WORDS.filter((w) => text.includes(w.toLowerCase()));
  return found.length ? found.slice(0, 3).join(" / ") : "主流技术栈";
}

export function pickGreeting(job) {
  const templates = Array.isArray(config.behavior.greetingTemplates) && config.behavior.greetingTemplates.length
    ? config.behavior.greetingTemplates
    : DEFAULT_TEMPLATES;
  const text = `${job.name} ${(job.tags || []).join(" ")}`.toLowerCase();
  const rule = templates.find((t) => (t.match || []).some((m) => text.includes(String(m).toLowerCase())))
    || templates[templates.length - 1];
  return String(rule.text || config.behavior.greeting || "")
    .replaceAll("{岗位}", job.name || "这个岗位")
    .replaceAll("{年限}", String(config.behavior.years || 3))
    .replaceAll("{栈}", guessStack(job))
    .replaceAll("{方向}", String(config.behavior.direction || "研发"))
    .replaceAll("{公司}", job.company || "贵司");
}
