"""
均值回归策略
基于布林带和RSI的均值回归交易
超卖买入，超买卖出
"""

import pandas as pd
from .base import StrategyBase, StrategyConfig, Signal, SignalType, StrategyRegistry


class MeanReversionStrategy(StrategyBase):
    """均值回归策略"""

    def __init__(self, config: StrategyConfig):
        super().__init__(config)
        self.bb_period = config.params.get("bb_period", 20)
        self.bb_std = config.params.get("bb_std", 2.0)
        self.rsi_period = config.params.get("rsi_period", 14)
        self.rsi_oversold = config.params.get("rsi_oversold", 30)
        self.rsi_overbought = config.params.get("rsi_overbought", 70)

    def on_bar(self, df: pd.DataFrame, current_idx: int) -> Signal:
        if current_idx < max(self.bb_period, self.rsi_period) + 1:
            return Signal(SignalType.HOLD, self.config.symbol, 0, reason="数据不足")

        close = df["close"]
        price = close.iloc[current_idx]

        # 布林带
        upper, mid, lower = self.bollinger(close, self.bb_period, self.bb_std)

        # RSI
        rsi_val = self.rsi(close, self.rsi_period)

        bb_lower = lower.iloc[current_idx]
        bb_upper = upper.iloc[current_idx]
        rsi_curr = rsi_val.iloc[current_idx]

        # 超卖 + 触碰下轨 → 买入
        if price <= bb_lower and rsi_curr < self.rsi_oversold:
            qty = self.calculate_position(price)
            return Signal(SignalType.BUY, self.config.symbol, price, qty,
                          reason=f"均值回归买入 RSI:{rsi_curr:.0f} 触下轨", confidence=0.75)

        # 超买 + 触碰上轨 → 卖出
        if price >= bb_upper and rsi_curr > self.rsi_overbought:
            return Signal(SignalType.SELL, self.config.symbol, price,
                          reason=f"均值回归卖出 RSI:{rsi_curr:.0f} 触上轨", confidence=0.75)

        return Signal(SignalType.HOLD, self.config.symbol, 0)


StrategyRegistry.register("mean_reversion", MeanReversionStrategy)
