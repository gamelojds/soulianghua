# 📈 SouLianghua — 量化交易系统

> 多策略量化交易平台，支持回测、模拟交易、实盘交易

<p align="center">
  <img src="https://img.shields.io/badge/python-3.10+-green" alt="python">
  <img src="https://img.shields.io/badge/fastapi-0.109-blue" alt="fastapi">
  <img src="https://img.shields.io/badge/react-18-61dafb" alt="react">
  <img src="https://img.shields.io/badge/license-MIT-orange" alt="license">
</p>

---

## ✨ 功能特性

### 🎯 8 大量化策略

| 策略 | 类型 | 原理 |
|------|------|------|
| **双均线交叉** | 趋势跟踪 | 快线上穿慢线买入，下穿卖出 |
| **网格交易** | 震荡策略 | 价格区间内分层低买高卖 |
| **动量趋势** | 趋势跟踪 | 放量突破确认入场，动量衰减离场 |
| **均值回归** | 反转策略 | 布林带下轨+RSI超卖买入 |
| **RSI 指标** | 反转策略 | 纯RSI超买超卖信号 |
| **布林带突破** | 波段策略 | 价格突破上下轨产生信号 |
| **海龟交易** | 趋势跟踪 | 唐奇安通道突破，ATR动态仓位 |
| **统计套利** | 套利策略 | Z-Score偏离均值回归 |

### 🔧 平台功能

- **策略回测**: 历史数据验证策略表现，输出收益率、夏普比率、最大回撤、胜率等指标
- **模拟交易**: 内置 Paper Broker，完全本地模拟，支持手续费、印花税
- **实时行情**: 接入 AKShare + yfinance 双数据源（含演示数据）
- **WebSocket**: 实时推送账户状态和交易执行结果
- **风险控制**: 止损/止盈/持仓天数限制/每日交易上限

---

## 🚀 快速开始

### 启动后端

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8520 --reload
```

API 文档: http://localhost:8520/api/docs

### 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端: http://localhost:3000

---

## 📁 项目结构

```
soulianghua/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI 入口
│   │   ├── core/
│   │   │   ├── config.py        # 配置管理
│   │   │   └── database.py      # SQLite 数据库
│   │   ├── strategies/          # 8 大量化策略
│   │   │   ├── base.py          # 基类 + 注册表
│   │   │   ├── ma_cross.py      # 双均线
│   │   │   ├── grid.py          # 网格交易
│   │   │   ├── momentum.py      # 动量趋势
│   │   │   ├── mean_reversion.py# 均值回归
│   │   │   ├── rsi_strategy.py  # RSI 策略
│   │   │   ├── bollinger.py     # 布林带
│   │   │   ├── turtle.py        # 海龟交易
│   │   │   └── arbitrage.py     # 统计套利
│   │   ├── engine/              # 交易引擎
│   │   │   ├── backtest.py      # 回测引擎
│   │   │   ├── live_trading.py  # 实盘引擎
│   │   │   └── models.py        # 共享模型
│   │   ├── broker/              # 券商接口
│   │   │   ├── base.py          # 抽象基类
│   │   │   └── paper.py         # 模拟券商
│   │   ├── data/
│   │   │   └── fetcher.py       # 行情数据(AKShare/yfinance)
│   │   └── api/
│   │       └── routes.py        # REST + WebSocket API
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # 主应用
│   │   ├── api.ts               # API 客户端
│   │   ├── components/
│   │   │   ├── Dashboard.tsx    # 账户概览
│   │   │   ├── StrategyPanel.tsx# 策略管理
│   │   │   ├── BacktestPanel.tsx# 回测面板
│   │   │   ├── TradeLog.tsx     # 交易日志
│   │   │   └── MarketView.tsx   # 行情查看
│   │   └── index.css            # 全局样式
│   └── package.json
└── README.md
```

## ⚠️ 免责声明

本软件仅供学习和研究使用。量化交易存在风险，历史回测结果不代表未来收益。实盘交易请谨慎评估风险。

## 📝 License

MIT
