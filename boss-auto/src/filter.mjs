// 黑名单 + 薪资 + 关键词筛选。返回 {ok, reason} 供主流程决定跳过与记录。
import { blacklist, config, parseSalary } from "./common.mjs";

const norm = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();
const hit = (text, list) => {
  const t = norm(text);
  return (list || []).find((k) => k && t.includes(norm(k))) || "";
};

export function checkJob(job) {
  const company = job.company || "";
  const title = job.name || "";
  const tags = (job.tags || []).join(" ");

  const kw = hit(company, blacklist.companyKeywords);
  if (kw) return { ok: false, reason: `公司名含黑名单关键词「${kw}」` };

  const exact = (blacklist.companyNames || []).find((n) => norm(company) === norm(n) || norm(company).includes(norm(n)));
  if (exact) return { ok: false, reason: `公司黑名单「${exact}」` };

  const tk = hit(title, [...(blacklist.titleKeywords || []), ...(config.filter?.rejectTitleKeywords || [])]);
  if (tk) return { ok: false, reason: `岗位名含「${tk}」` };

  const tg = hit(tags, blacklist.tagKeywords || []);
  if (tg) return { ok: false, reason: `岗位标签含「${tg}」` };

  const salary = parseSalary(job.salary);
  const minSalaryK = Number(config.filter?.minSalaryK || 0);
  const maxSalaryK = Number(config.filter?.maxSalaryK || 0);
  // 区间取「有交集」就算过：岗位 4-6K 与期望 4-7K 是重叠的，不该被砍。
  if (salary) {
    if (minSalaryK > 0 && Number.isFinite(salary.max) && salary.max < minSalaryK) {
      return { ok: false, reason: `薪资上限 ${salary.max}K < 期望下限 ${minSalaryK}K` };
    }
    if (maxSalaryK > 0 && salary.min > maxSalaryK) {
      return { ok: false, reason: `薪资下限 ${salary.min}K > 期望上限 ${maxSalaryK}K` };
    }
  }

  const requireAny = config.filter?.requireAnyKeywords || [];
  if (requireAny.length) {
    const text = `${title} ${tags} ${job.jd || ""}`;
    const anyHit = requireAny.some((k) => norm(text).includes(norm(k)));
    if (!anyHit) return { ok: false, reason: `未命中要求关键词 ${requireAny.join("/")}` };
  }

  const watch = (blacklist.warnCompanyNames || []).find((n) => norm(company).includes(norm(n)));
  return { ok: true, salary, note: watch ? `注意：${watch} 在观察名单里` : "" };
}
