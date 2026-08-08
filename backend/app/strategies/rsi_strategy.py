"""
RSI 指标策略
纯 RSI 超买超卖信号
"""

import pandas as pd
from .base import StrategyBase, StrategyConfig, Signal, SignalType, StrategyRegistry


class RSIStrategy(StrategyBase):
    """RSI 指标策略"""

    def __init__(self, config: StrategyConfig):
        super().__init__(config)
        self.period = config.params.get("period", 14)
        self.oversold = config.params.get("oversold", 30)
        self.overbought = config.params.get("overbought", 70)

    def on_bar(self, df: pd.DataFrame, current_idx: int) -> Signal:
        if current_idx < self.period + 1:
            return Signal(SignalType.HOLD, self.config.symbol, 0, reason="数据不足")

        close = df["close"]
        price = close.iloc[current_idx]
        rsi_series = self.rsi(close, self.period)
        rsi_prev = rsi_series.iloc[current_idx - 1]
        rsi_curr = rsi_series.iloc[current_idx]

        # RSI 从超卖区回升 → 买入
        if rsi_prev < self.oversold and rsi_curr >= self.oversold:
            qty = self.calculate_position(price)
            return Signal(SignalType.BUY, self.config.symbol, price, qty,
                          reason=f"RSI超卖回升 {rsi_curr:.0f}", confidence=0.65)

        # RSI 从超买区回落 → 卖出
        if rsi_prev > self.overbought and rsi_curr <= self.overbought:
            return Signal(SignalType.SELL, self.config.symbol, price,
                          reason=f"RSI超买回落 {rsi_curr:.0f}", confidence=0.65)

        return Signal(SignalType.HOLD, self.config.symbol, 0)


StrategyRegistry.register("rsi", RSIStrategy)
