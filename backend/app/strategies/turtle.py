"""
海龟交易策略
基于唐奇安通道的趋势跟踪经典策略
"""

import pandas as pd
import numpy as np
from .base import StrategyBase, StrategyConfig, Signal, SignalType, StrategyRegistry


class TurtleStrategy(StrategyBase):
    """海龟交易策略"""

    def __init__(self, config: StrategyConfig):
        super().__init__(config)
        self.entry_period = config.params.get("entry_period", 20)   # 入场突破周期
        self.exit_period = config.params.get("exit_period", 10)     # 离场突破周期
        self.atr_period = config.params.get("atr_period", 20)       # ATR 计算周期

    def _atr(self, df: pd.DataFrame, period: int) -> pd.Series:
        """计算 ATR"""
        high, low, close = df["high"], df["low"], df["close"]
        tr1 = high - low
        tr2 = abs(high - close.shift(1))
        tr3 = abs(low - close.shift(1))
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        return tr.rolling(period).mean()

    def on_bar(self, df: pd.DataFrame, current_idx: int) -> Signal:
        if current_idx < max(self.entry_period, self.atr_period) + 1:
            return Signal(SignalType.HOLD, self.config.symbol, 0, reason="数据不足")

        high = df["high"]
        low = df["low"]
        price = df["close"].iloc[current_idx]

        # 唐奇安通道
        entry_high = high.iloc[current_idx - self.entry_period:current_idx].max()
        entry_low = low.iloc[current_idx - self.entry_period:current_idx].min()
        exit_high = high.iloc[current_idx - self.exit_period:current_idx].max()
        exit_low = low.iloc[current_idx - self.exit_period:current_idx].min()

        # 突破N日高点 → 买入
        if price >= entry_high and df["close"].iloc[current_idx - 1] < entry_high:
            atr = self._atr(df, self.atr_period).iloc[current_idx]
            risk_amount = self.config.capital * 0.01  # 1% risk
            qty = max(100, int(risk_amount / (atr * 2) / 100) * 100) if atr > 0 else self.calculate_position(price)
            return Signal(SignalType.BUY, self.config.symbol, price, qty,
                          reason=f"海龟入场 突破{self.entry_period}日高点", confidence=0.8)

        # 跌破N日低点 → 卖出
        if price <= exit_low:
            return Signal(SignalType.SELL, self.config.symbol, price,
                          reason=f"海龟离场 跌破{self.exit_period}日低点", confidence=0.8)

        return Signal(SignalType.HOLD, self.config.symbol, 0)


StrategyRegistry.register("turtle", TurtleStrategy)
