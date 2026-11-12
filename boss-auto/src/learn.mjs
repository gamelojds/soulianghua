// 黑名单自动学习：把「招满/不合适」的公司攒成候选，确认后再写进 blacklist.json。
// 用法：
//   node src/learn.mjs                 查看候选
//   node src/learn.mjs --apply         写入 blacklist.json（自动备份 .bak）
//   node src/learn.mjs --add "某公司" --reason "手动拉黑"
import fs from "node:fs";
import path from "node:path";
import { ROOT, log } from "./common.mjs";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (k) => {
  const eq = argv.find((a) => a.startsWith(`--${k}=`));
  if (eq) return eq.slice(k.length + 3);
  const i = argv.indexOf(`--${k}`);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")) return argv[i + 1];
  return "";
};

const dataDir = path.join(ROOT, "data");
const candFile = path.join(dataDir, "blacklist-candidates.jsonl");
const blFile = path.join(ROOT, "blacklist.json");

const candidates = new Map();
const add = (company, reason) => {
  const key = String(company || "").trim();
  if (!key || key.length < 2) return;
  const prev = candidates.get(key) || { company: key, reasons: new Set(), count: 0 };
  if (reason) prev.reasons.add(String(reason).slice(0, 60));
  prev.count += 1;
  candidates.set(key, prev);
};

// 1) 跟踪里出现的「不合适/招满」
try {
  for (const line of fs.readFileSync(candFile, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); add(r.company, r.reason); } catch {}
  }
} catch {}

// 2) 投递台账里明确关闭/失败的岗位，按公司合并
try {
  for (const line of fs.readFileSync(path.join(dataDir, "applied.jsonl"), "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (/已关闭|停止招聘|招满/.test(String(r.detail || ""))) add(r.company, r.detail);
    } catch {}
  }
} catch {}

const manual = val("add");
if (manual) {
  const reason = val("reason") || "手动添加";
  add(manual, reason);
  // 落盘，保证下次单独跑 --apply 还能看见这条候选
  fs.mkdirSync(dataDir, { recursive: true });
  fs.appendFileSync(candFile, JSON.stringify({ ts: new Date().toISOString(), company: manual.trim(), reason }) + "\n", "utf8");
}

if (!candidates.size) {
  log("没有候选。先跑 npm run track 攒一轮跟踪数据，或用 --add \"公司名\" 手动加。");
  process.exit(0);
}

log(`候选 ${candidates.size} 家：`);
for (const c of [...candidates.values()].sort((a, b) => b.count - a.count)) {
  log(`  ${c.company}  ×${c.count}  ${[...c.reasons].join(" / ")}`);
}

if (!has("--apply")) {
  log('确认无误后执行： node src/learn.mjs --apply');
  process.exit(0);
}

const blacklist = JSON.parse(fs.readFileSync(blFile, "utf8"));
const names = new Set(blacklist.companyNames || []);
let added = 0;
for (const { company } of candidates.values()) {
  if (!names.has(company)) { names.add(company); added++; }
}
blacklist.companyNames = [...names].sort();
fs.copyFileSync(blFile, blFile + ".bak");
fs.writeFileSync(blFile, JSON.stringify(blacklist, null, 2), "utf8");
log(`已写入 blacklist.json：新增 ${added} 家，共 ${blacklist.companyNames.length} 家。备份：blacklist.json.bak`);
