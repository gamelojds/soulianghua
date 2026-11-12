// 台账报告：按天统计 + 导出 CSV（Excel 直接打开）。
import fs from "node:fs";
import path from "node:path";
import { p, log } from "./common.mjs";
import { exportCsv } from "./store.mjs";

const file = path.join(p("data"), "applied.jsonl");
const rows = [];
try {
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch {}
  }
} catch {
  log("还没有台账，先跑一轮 npm run run 或 npm run dry。");
  process.exit(0);
}

const byDay = new Map();
const byStatus = new Map();
for (const r of rows) {
  const day = String(r.ts || "").slice(0, 10);
  byDay.set(day, (byDay.get(day) || 0) + 1);
  byStatus.set(r.status, (byStatus.get(r.status) || 0) + 1);
}

log(`共 ${rows.length} 条记录`);
for (const [day, n] of [...byDay.entries()].sort()) log(`  ${day}: ${n}`);
for (const [st, n] of [...byStatus.entries()].sort()) log(`  ${st}: ${n}`);
const csv = exportCsv();
log(`CSV 已导出：${csv}`);
