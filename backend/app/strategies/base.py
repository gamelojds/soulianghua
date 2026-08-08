"""
SouLianghua - 策略基类
定义策略接口、信号类型和注册机制
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
import pandas as pd
import numpy as np


class SignalType(str, Enum):
    BUY = "buy"
    SELL = "sell"
    HOLD = "hold"


@dataclass
class StrategyConfig:
    """策略参数配置"""
    name: str = ""
    symbol: str = ""                    # 交易标的
    capital: float = 100000.0           # 分配资金
    position_size: float = 0.1          # 每次交易仓位比例
    stop_loss: float = -0.05            # 止损线
    stop_profit: float = 0.15           # 止盈线
    max_hold_days: int = 20             # 最长持仓天数
    # 扩展参数
    params: dict = field(default_factory=dict)


@dataclass
class Signal:
    """交易信号"""
    type: SignalType
    symbol: str
    price: float
    quantity: int = 0
    amount: float = 0.0
    reason: str = ""
    confidence: float = 0.5    # 信号置信度 0~1
    timestamp: str = ""

    def to_dict(self) -> dict:
        return {
            "type": self.type.value,
            "symbol": self.symbol,
            "price": round(self.price, 4),
            "quantity": self.quantity,
            "amount": round(self.amount, 2),
            "reason": self.reason,
            "confidence": round(self.confidence, 2),
            "timestamp": self.timestamp,
        }


class StrategyBase(ABC):
    """量化策略抽象基类"""

    def __init__(self, config: StrategyConfig):
        self.config = config
        self.name = config.name or self.__class__.__name__
        self._positions: dict = {}  # 持仓记录

    @abstractmethod
    def on_bar(self, df: pd.DataFrame, current_idx: int) -> Signal:
        """
        每根K线调用一次，返回交易信号
        df: 完整的历史 OHLCV 数据
        current_idx: 当前K线索引
        """
        ...

    def calculate_position(self, price: float) -> int:
        """根据当前价格计算应买数量（A股100股整数倍）"""
        amount = self.config.capital * self.config.position_size
        qty = int(amount / price / 100) * 100
        return max(100, qty)

    def check_risk(self, entry_price: float, current_price: float, hold_days: int) -> Signal | None:
        """风控检查：止损/止盈/超时"""
        pnl_pct = (current_price - entry_price) / entry_price

        if pnl_pct <= self.config.stop_loss:
            return Signal(SignalType.SELL, self.config.symbol, current_price, 0, 0,
                          f"止损 ({pnl_pct*100:.1f}%)", 0.9)

        if pnl_pct >= self.config.stop_profit:
            return Signal(SignalType.SELL, self.config.symbol, current_price, 0, 0,
                          f"止盈 ({pnl_pct*100:.1f}%)", 0.9)

        if hold_days >= self.config.max_hold_days:
            return Signal(SignalType.SELL, self.config.symbol, current_price, 0, 0,
                          f"持仓超时 ({hold_days}天)", 0.6)

        return None

    @staticmethod
    def sma(series: pd.Series, period: int) -> pd.Series:
        """简单移动平均"""
        return series.rolling(window=period).mean()

    @staticmethod
    def ema(series: pd.Series, period: int) -> pd.Series:
        """指数移动平均"""
        return series.ewm(span=period, adjust=False).mean()

    @staticmethod
    def rsi(series: pd.Series, period: int = 14) -> pd.Series:
        """RSI 指标"""
        delta = series.diff()
        gain = delta.where(delta > 0, 0.0)
        loss = -delta.where(delta < 0, 0.0)
        avg_gain = gain.ewm(alpha=1/period, adjust=False).mean()
        avg_loss = loss.ewm(alpha=1/period, adjust=False).mean()
        rs = avg_gain / (avg_loss + 1e-10)
        return 100 - (100 / (1 + rs))

    @staticmethod
    def bollinger(series: pd.Series, period: int = 20, std: float = 2.0) -> tuple:
        """布林带"""
        mid = series.rolling(period).mean()
        std_dev = series.rolling(period).std()
        upper = mid + std * std_dev
        lower = mid - std * std_dev
        return upper, mid, lower

    @staticmethod
    def macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> tuple:
        """MACD 指标"""
        ema_fast = series.ewm(span=fast, adjust=False).mean()
        ema_slow = series.ewm(span=slow, adjust=False).mean()
        dif = ema_fast - ema_slow
        dea = dif.ewm(span=signal, adjust=False).mean()
        hist = 2 * (dif - dea)
        return dif, dea, hist

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "type": self.__class__.__name__,
            "symbol": self.config.symbol,
            "capital": self.config.capital,
            "position_size": self.config.position_size,
            "stop_loss": self.config.stop_loss,
            "stop_profit": self.config.stop_profit,
            "params": self.config.params,
        }


class StrategyRegistry:
    """策略注册表"""

    _strategies: dict[str, type[StrategyBase]] = {}

    @classmethod
    def register(cls, name: str, strategy_cls: type[StrategyBase]):
        cls._strategies[name] = strategy_cls

    @classmethod
    def get(cls, name: str) -> type[StrategyBase] | None:
        return cls._strategies.get(name)

    @classmethod
    def list_all(cls) -> list[dict]:
        return [
            {
                "name": name,
                "class": s.__name__,
                "description": s.__doc__ or "",
            }
            for name, s in cls._strategies.items()
        ]

    @classmethod
    def create(cls, name: str, config: StrategyConfig) -> StrategyBase | None:
        strategy_cls = cls.get(name)
        if strategy_cls is None:
            return None
        return strategy_cls(config)
