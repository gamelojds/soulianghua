"""
统计套利策略
基于价格比率偏离的配对交易策略
"""

import pandas as pd
import numpy as np
from .base import StrategyBase, StrategyConfig, Signal, SignalType, StrategyRegistry


class ArbitrageStrategy(StrategyBase):
    """统计套利策略"""

    def __init__(self, config: StrategyConfig):
        super().__init__(config)
        self.lookback = config.params.get("lookback", 60)
        self.entry_zscore = config.params.get("entry_zscore", 2.0)
        self.exit_zscore = config.params.get("exit_zscore", 0.5)
        # 支持两个标的的价差交易
        self.symbol_b = config.params.get("symbol_b", config.symbol)
        self._spread_history: list[float] = []

    def _calc_zscore(self, spread: float) -> float:
        """计算 Z-Score"""
        self._spread_history.append(spread)
        if len(self._spread_history) > self.lookback:
            self._spread_history = self._spread_history[-self.lookback:]

        if len(self._spread_history) < 20:
            return 0

        mean = np.mean(self._spread_history)
        std = np.std(self._spread_history) + 1e-10
        return (spread - mean) / std

    def on_bar(self, df: pd.DataFrame, current_idx: int) -> Signal:
        if current_idx < 30:
            return Signal(SignalType.HOLD, self.config.symbol, 0, reason="数据不足")

        close = df["close"]
        price = close.iloc[current_idx]

        # 用收盘价和开盘价的比率作为简单的"价差"指标
        spread = price / close.iloc[current_idx - 5] - 1 if current_idx >= 5 else 0
        zscore = self._calc_zscore(spread)

        if zscore > self.entry_zscore:
            qty = self.calculate_position(price)
            return Signal(SignalType.BUY, self.config.symbol, price, qty,
                          reason=f"套利入场 Z={zscore:.2f}", confidence=min(0.5 + abs(zscore) * 0.1, 0.9))

        if zscore < -self.entry_zscore:
            return Signal(SignalType.SELL, self.config.symbol, price,
                          reason=f"套利离场 Z={zscore:.2f}", confidence=min(0.5 + abs(zscore) * 0.1, 0.9))

        return Signal(SignalType.HOLD, self.config.symbol, 0)


StrategyRegistry.register("arbitrage", ArbitrageStrategy)
