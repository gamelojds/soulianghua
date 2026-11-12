// 本地投递台账：去重（同岗位只投一次）、每日限额、CSV 导出。
import fs from "node:fs";
import path from "node:path";
import { p, todayKey } from "./common.mjs";

const file = () => path.join(p("data"), "applied.jsonl");
const dailyFile = () => path.join(p("data"), "daily.json");

export function loadApplied() {
  const set = new Set();
  try {
    for (const line of fs.readFileSync(file(), "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        if (row.jobId) set.add(String(row.jobId));
      } catch {}
    }
  } catch {}
  return set;
}

export function appendApplied(row) {
  fs.appendFileSync(file(), JSON.stringify(row) + "\n", "utf8");
}

export function todayCount() {
  try {
    const data = JSON.parse(fs.readFileSync(dailyFile(), "utf8"));
    return Number(data[todayKey()] || 0);
  } catch { return 0; }
}

export function bumpToday(n = 1) {
  let data = {};
  try { data = JSON.parse(fs.readFileSync(dailyFile(), "utf8")); } catch {}
  data[todayKey()] = Number(data[todayKey()] || 0) + n;
  fs.writeFileSync(dailyFile(), JSON.stringify(data, null, 2), "utf8");
  return data[todayKey()];
}

export function exportCsv() {
  const rows = [];
  try {
    for (const line of fs.readFileSync(file(), "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      try { rows.push(JSON.parse(line)); } catch {}
    }
  } catch {}
  const head = ["时间", "岗位", "公司", "薪资", "地区", "状态", "链接"];
  const csv = [head.join(",")].concat(rows.map((r) => [
    r.ts, r.name, r.company, r.salary, r.area, r.status, r.url,
  ].map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(","))).join("\r\n");
  const out = path.join(p("data"), "applied.csv");
  fs.writeFileSync(out, "\ufeff" + csv, "utf8");
  return out;
}
