# BOSS 直聘 自动投递助手（boss-auto-apply）

用**你自己账号**的登录态，在桌面上一键完成：搜岗位 → 过滤黑名单 → 逐个发沟通 → 跟踪回复 → 出报表。
全程本地运行，不经过任何第三方服务器。

> Windows + Edge。Node.js 18+。

## 它解决什么

BOSS 上「找岗位」这一步重复劳动最多：翻页、看公司是不是外包、开详情读 JD、看有没有坑（单休/押金/中介费）、点沟通、再回来翻下一页。
这套脚本把这些串成一条流水线，并且**每一步都留证据**（本地台账 + 现场截图）。

## 功能

| 能力 | 说明 |
|---|---|
| 多关键词轮投 | 例如「保安 / 仓管」一次跑两个词，共用一份去重台账 |
| 公司黑名单 | 三档：公司名关键词（劳务/派遣/外包/众包/猎头…）、精确公司名、观察名单（只提示） |
| 岗位名/标签黑名单 | 销售、兼职、驻场、外派… |
| **JD 反筛** | 进详情页读正文，命中「单休/做六休一/押金/服装费/中介费/先交费」直接不投，另存 `data/suspect.jsonl` |
| 薪资过滤 | 列表里的薪资是字体加密的，脚本会从 JD 正文里解析金额（`6000-8200` → `6-8.2K`） |
| 招呼语模板 | 按岗位关键词挑模板，`{岗位}{年限}{栈}{方向}` 自动替换 |
| 投后跟踪 | 扫会话列表：约面提醒 / 不匹配入黑名单候选 / 普通询问按规则自动回 |
| 黑名单自动学习 | 「已招满/不合适」的公司攒成候选，确认后写回 `blacklist.json` |
| 手机推送 | 企业微信群机器人 / Telegram / Server酱 |
| 桌面控制台 | 双击图标出窗口：登录、预扫、投递、跟踪、改条件、看实时日志 |
| 定时任务 | 每天 09:35 / 19:35 自动跑一轮 |

## 安装

```powershell
git clone <this-repo> boss-auto
cd boss-auto
npm install          # 只装 playwright-core，用系统自带的 Edge，不下载浏览器内核
```

生成桌面快捷方式（可选）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\create-shortcut.ps1
```

## 使用

### 桌面版（推荐）

双击桌面「BOSS 自动投递」→ 弹出一个没有地址栏的窗口：

1. **① 扫码登录** —— 会用一个**干净的 Edge**（无自动化特征）打开登录页，手机扫码后**把那个窗口关掉**，脚本自动验证并记住
2. **② 预扫** —— 只筛选、只打印候选和跳过原因，一次都不点
3. **③ 开始投递** —— 真投，节奏按 `config.json` 里的间隔走
4. **④ 跟踪 HR 消息** —— 约面提醒、不匹配拉黑、普通询问自动回

### 命令行

```powershell
npm run login       # 扫码登录（只需一次）
npm run dry         # 预扫
npm run run         # 投递
npm run track       # 跟踪
npm run report      # 导出 data\applied.csv
npm run learn       # 看黑名单候选（--apply 写入）
npm run open        # 打开/复用那个专用 Edge 窗口
npm run schedule    # 注册每日计划任务
npm run unschedule  # 删除计划任务
```

参数：`--limit=N`、`--pages=N`、`--query=关键词`、`--city=城市代码`、`--dry-run`、`--force`（越过冷却）

## 配置

`config.json`

- `search.queries` 关键词数组（一个个搜）、`search.city` 城市代码（留空=账号所在城市）、`maxPages`、`maxApplyPerRun`、`maxApplyPerDay`
- `behavior` 间隔（`minDelayMs`/`maxDelayMs`）、每投几个休息、招呼语模板、`{年限}` `{方向}` 等变量
- `filter.minSalaryK` / `maxSalaryK`、`rejectTitleKeywords`、`rejectJdKeywords`
- `autoReply` 自动回复开关与文案
- `notify` 推送类型（`wecom` / `telegram` / `serverchan`）

`blacklist.json`：`companyKeywords` / `companyNames` / `warnCompanyNames` / `titleKeywords` / `tagKeywords`

## 目录

```
config.json  blacklist.json  package.json  run-daily.cmd  launch-ui.vbs
src\    login / apply / filter / store / greeting / notify / track / learn / report / open / common
ui\     server.mjs（本地 HTTP 服务）+ index.html（控制台页面）
tools\  create-shortcut.ps1  schedule-task.ps1
data\   运行后生成：applied.jsonl（台账）、track.jsonl、suspect.jsonl、cooldown.json、screenshots\
profile\  Edge 登录态（别提交、别删）
```

## 工作原理（几个关键点）

1. **不用 Playwright 自开浏览器**，而是 `--remote-debugging-port` 启动一个真实 Edge，再用 CDP 连上去。
   自开的浏览器带一整套自动化指纹，BOSS 会直接跳「安全验证」并弹回首页；接管真实实例后 `navigator.webdriver === false`。
2. **清单页是「左列表 + 右面板」**，沟通按钮在右侧面板里（`A.op-btn.op-btn-chat`），且点卡片会触发 SPA 导航。
   所以每一步都拆成独立、同步的页面内 `element.click()`，中间靠 Node 侧等待 —— 用 Playwright 的 `click()` 在 DOM 周期性卸载时会必然超时。
3. **薪资是字体加密的**：`.job-salary` 的文本是 `kanzhun-mix` 字体的私有区码位（`U+E0xx`），所以从 JD 正文解析金额做兜底。
4. **风控会来了**：被弹回首页（`_security_check`）或页面停在骨架屏时，脚本立刻停手并写 `data/cooldown.json` 冷却 4-6 小时，
   拒绝继续撞（`--force` 可越过）。冷却期间 `track` 也自动跳过。

## 已知限制

- 只支持 Windows + Edge（代码里预留了 `EDGE_PATH`、`BOSS_PROFILE_DIR` 环境变量）
- BOSS 前端是 SPA 且会改版：选择器集中在 `src/apply.mjs` 顶部与 `playInlineDescribe` 附近，改版后先跑 `npm run dry` 看日志
- 列表 DOM 会周期性卸载重载（限流时更明显），脚本用「同步点击 + 轮询」绕开，但极端情况下仍可能失败，失败会记 `status: fail`
- 薪资数字只能从 JD 正文推断，不是平台原始字段

## 免责与使用边界

- 本工具**只操作你自己登录的账号**，不做批量养号、不代替他人投递、不采集他人信息
- 使用频率请保持人类水平（默认配置已经做得很慢）；平台的风控规则、每日沟通上限由平台决定，脚本只做识别与停止
- 因使用本工具导致的账号限制、投递结果，由使用者自行承担

MIT License
