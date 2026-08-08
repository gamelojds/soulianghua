"""
SouLianghua - 量化交易系统配置
"""

import os
from pathlib import Path
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent.parent


class Config:
    """全局配置"""

    # 服务器
    HOST = os.getenv("SOULIANGHUA_HOST", "0.0.0.0")
    PORT = int(os.getenv("SOULIANGHUA_PORT", "8520"))

    # 数据库
    DATABASE_URL = os.getenv(
        "SOULIANGHUA_DB",
        f"sqlite+aiosqlite:///{BASE_DIR}/data/soulianghua.db",
    )

    # 交易模式: paper | live
    TRADE_MODE = os.getenv("SOULIANGHUA_MODE", "paper")

    # 券商配置 (实盘时需要)
    BROKER_TYPE = os.getenv("SOULIANGHUA_BROKER", "paper")  # paper | huatai | guangfa | etc.

    # 风控参数
    MAX_POSITION_RATIO = 0.3       # 单只股票最大仓位比例
    MAX_TOTAL_POSITION = 0.8       # 总仓位上限
    STOP_LOSS_RATIO = -0.05        # 止损线 -5%
    STOP_PROFIT_RATIO = 0.15       # 止盈线 +15%
    MAX_DAILY_TRADES = 50          # 每日最大交易次数

    # 初始资金 (模拟)
    INITIAL_CAPITAL = 1000000.0    # 100万

    # 数据
    DATA_CACHE_DIR = BASE_DIR / "data" / "cache"
    DATA_UPDATE_INTERVAL = 60       # 行情更新间隔(秒)


config = Config()
