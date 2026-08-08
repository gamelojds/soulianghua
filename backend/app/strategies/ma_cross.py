"""
MA 双均线交叉策略
金叉买入，死叉卖出 —— 最经典的量化策略
"""

import pandas as pd
from .base import StrategyBase, StrategyConfig, Signal, SignalType, StrategyRegistry


class MACrossStrategy(StrategyBase):
    """双均线交叉策略"""

    def __init__(self, config: StrategyConfig):
        super().__init__(config)
        self.fast = config.params.get("fast", 5)
        self.slow = config.params.get("slow", 20)

    def on_bar(self, df: pd.DataFrame, current_idx: int) -> Signal:
        if current_idx < self.slow + 1:
            return Signal(SignalType.HOLD, self.config.symbol, 0, reason="数据不足")

        close = df["close"]
        fast_ma = self.sma(close, self.fast)
        slow_ma = self.sma(close, self.slow)

        # 金叉：快线上穿慢线
        if fast_ma.iloc[current_idx - 1] <= slow_ma.iloc[current_idx - 1] and \
           fast_ma.iloc[current_idx] > slow_ma.iloc[current_idx]:
            price = close.iloc[current_idx]
            qty = self.calculate_position(price)
            return Signal(SignalType.BUY, self.config.symbol, price, qty,
                          reason=f"金叉 MA{self.fast}↑MA{self.slow}", confidence=0.7)

        # 死叉：快线下穿慢线
        if fast_ma.iloc[current_idx - 1] >= slow_ma.iloc[current_idx - 1] and \
           fast_ma.iloc[current_idx] < slow_ma.iloc[current_idx]:
            price = close.iloc[current_idx]
            return Signal(SignalType.SELL, self.config.symbol, price, reason=f"死叉 MA{self.fast}↓MA{self.slow}", confidence=0.7)

        return Signal(SignalType.HOLD, self.config.symbol, 0)


StrategyRegistry.register("ma_cross", MACrossStrategy)
