"""
网格交易策略
在设定的价格区间内低买高卖，适合震荡行情
"""

import pandas as pd
from .base import StrategyBase, StrategyConfig, Signal, SignalType, StrategyRegistry


class GridStrategy(StrategyBase):
    """网格交易策略"""

    def __init__(self, config: StrategyConfig):
        super().__init__(config)
        self.grid_num = config.params.get("grid_num", 10)       # 网格层数
        self.grid_width = config.params.get("grid_width", 0.02)  # 每格宽度 2%
        self._grids: list[float] = []
        self._last_grid_idx: int = -1
        self._init_price: float = 0

    def _build_grids(self, mid_price: float):
        """构建网格价格区间"""
        half = self.grid_num // 2
        self._grids = [
            mid_price * (1 + (i - half) * self.grid_width)
            for i in range(self.grid_num)
        ]
        self._last_grid_idx = half

    def on_bar(self, df: pd.DataFrame, current_idx: int) -> Signal:
        if current_idx < 20:
            return Signal(SignalType.HOLD, self.config.symbol, 0, reason="数据不足")

        price = df["close"].iloc[current_idx]

        if not self._grids:
            self._build_grids(price)

        # 找到当前价格所在的网格位置
        grid_idx = 0
        for i, g in enumerate(self._grids):
            if price >= g:
                grid_idx = i

        if grid_idx > self._last_grid_idx:
            # 价格上涨跨越网格线 → 卖出
            self._last_grid_idx = grid_idx
            qty = self.calculate_position(price) // 2
            return Signal(SignalType.SELL, self.config.symbol, price, qty,
                          reason=f"网格卖出 格{grid_idx}/{self.grid_num}", confidence=0.6)

        elif grid_idx < self._last_grid_idx:
            # 价格下跌跨越网格线 → 买入
            self._last_grid_idx = grid_idx
            qty = self.calculate_position(price) // 2
            return Signal(SignalType.BUY, self.config.symbol, price, qty,
                          reason=f"网格买入 格{grid_idx}/{self.grid_num}", confidence=0.6)

        return Signal(SignalType.HOLD, self.config.symbol, 0)


StrategyRegistry.register("grid", GridStrategy)
