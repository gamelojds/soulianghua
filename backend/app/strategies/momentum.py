"""
动量策略
基于价格动量和成交量确认的趋势跟踪策略
"""

import pandas as pd
import numpy as np
from .base import StrategyBase, StrategyConfig, Signal, SignalType, StrategyRegistry


class MomentumStrategy(StrategyBase):
    """动量趋势策略"""

    def __init__(self, config: StrategyConfig):
        super().__init__(config)
        self.lookback = config.params.get("lookback", 20)        # 回看周期
        self.threshold = config.params.get("threshold", 0.03)    # 动量阈值 3%

    def on_bar(self, df: pd.DataFrame, current_idx: int) -> Signal:
        if current_idx < self.lookback + 1:
            return Signal(SignalType.HOLD, self.config.symbol, 0, reason="数据不足")

        close = df["close"]
        volume = df["volume"] if "volume" in df.columns else pd.Series(1, index=df.index)

        # 计算动量（过去N日涨跌幅）
        momentum = (close.iloc[current_idx] - close.iloc[current_idx - self.lookback]) / close.iloc[current_idx - self.lookback]

        # 成交量确认（当前成交量 > 过去N日均量的1.5倍）
        avg_vol = volume.iloc[current_idx - self.lookback:current_idx].mean()
        vol_confirm = volume.iloc[current_idx] > avg_vol * 1.5

        price = close.iloc[current_idx]

        if momentum > self.threshold and vol_confirm:
            qty = self.calculate_position(price)
            return Signal(SignalType.BUY, self.config.symbol, price, qty,
                          reason=f"动量突破 {momentum*100:.1f}% 放量确认", confidence=min(0.5 + abs(momentum) * 5, 0.95))

        if momentum < -self.threshold:
            return Signal(SignalType.SELL, self.config.symbol, price,
                          reason=f"动量衰减 {momentum*100:.1f}%", confidence=min(0.5 + abs(momentum) * 3, 0.9))

        return Signal(SignalType.HOLD, self.config.symbol, 0)


StrategyRegistry.register("momentum", MomentumStrategy)
