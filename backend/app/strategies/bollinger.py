"""
布林带突破策略
价格突破布林带上下轨产生信号
"""

import pandas as pd
from .base import StrategyBase, StrategyConfig, Signal, SignalType, StrategyRegistry


class BollingerStrategy(StrategyBase):
    """布林带策略"""

    def __init__(self, config: StrategyConfig):
        super().__init__(config)
        self.period = config.params.get("period", 20)
        self.std_mult = config.params.get("std_mult", 2.0)

    def on_bar(self, df: pd.DataFrame, current_idx: int) -> Signal:
        if current_idx < self.period + 1:
            return Signal(SignalType.HOLD, self.config.symbol, 0, reason="数据不足")

        close = df["close"]
        price = close.iloc[current_idx]
        prev_price = close.iloc[current_idx - 1]

        upper, mid, lower = self.bollinger(close, self.period, self.std_mult)

        bb_lower = lower.iloc[current_idx]
        bb_upper = upper.iloc[current_idx]
        bb_mid = mid.iloc[current_idx]
        prev_lower = lower.iloc[current_idx - 1]

        # 价格从下轨下方回到下轨上方 → 买入
        if prev_price <= prev_lower and price > bb_lower:
            qty = self.calculate_position(price)
            return Signal(SignalType.BUY, self.config.symbol, price, qty,
                          reason="突破布林下轨反弹", confidence=0.7)

        # 价格突破上轨 → 卖出
        if price >= bb_upper:
            return Signal(SignalType.SELL, self.config.symbol, price,
                          reason="触及布林上轨", confidence=0.7)

        return Signal(SignalType.HOLD, self.config.symbol, 0)


StrategyRegistry.register("bollinger", BollingerStrategy)
