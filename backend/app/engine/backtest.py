"""
SouLianghua - 回测引擎
使用历史数据模拟策略表现
"""

import pandas as pd
import numpy as np
from datetime import datetime
from dataclasses import dataclass, field
from typing import Optional

from ..strategies.base import StrategyBase, Signal, SignalType
from ..core.config import config


@dataclass
class Trade:
    """单笔交易记录"""
    symbol: str
    entry_time: str
    exit_time: str
    entry_price: float
    exit_price: float
    quantity: int
    pnl: float
    pnl_pct: float
    reason: str = ""


@dataclass
class BacktestResult:
    """回测结果"""
    strategy_name: str = ""
    symbol: str = ""
    start_date: str = ""
    end_date: str = ""
    initial_capital: float = 0
    final_capital: float = 0
    total_return: float = 0
    annual_return: float = 0
    max_drawdown: float = 0
    sharpe_ratio: float = 0
    win_rate: float = 0
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    avg_profit: float = 0
    avg_loss: float = 0
    profit_factor: float = 0
    trades: list[Trade] = field(default_factory=list)
    equity_curve: list[float] = field(default_factory=list)
    daily_returns: list[float] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "strategy_name": self.strategy_name,
            "symbol": self.symbol,
            "start_date": self.start_date,
            "end_date": self.end_date,
            "initial_capital": round(self.initial_capital, 2),
            "final_capital": round(self.final_capital, 2),
            "total_return": round(self.total_return * 100, 2),
            "annual_return": round(self.annual_return * 100, 2),
            "max_drawdown": round(self.max_drawdown * 100, 2),
            "sharpe_ratio": round(self.sharpe_ratio, 2),
            "win_rate": round(self.win_rate * 100, 2),
            "total_trades": self.total_trades,
            "winning_trades": self.winning_trades,
            "losing_trades": self.losing_trades,
            "avg_profit": round(self.avg_profit * 100, 2),
            "avg_loss": round(self.avg_loss * 100, 2),
            "profit_factor": round(self.profit_factor, 2),
            "trades": [t.__dict__ for t in self.trades[-50:]],  # 最近50笔
            "equity_curve": [round(e, 2) for e in self.equity_curve[::max(1, len(self.equity_curve)//200)]],
            "daily_returns": [round(r * 100, 4) for r in self.daily_returns[::max(1, len(self.daily_returns)//200)]],
        }


class BacktestEngine:
    """回测引擎"""

    def __init__(self, initial_capital: float = None):
        self.capital = initial_capital or config.INITIAL_CAPITAL

    def run(self, strategy: StrategyBase, df: pd.DataFrame, progress_callback=None) -> BacktestResult:
        """
        运行回测
        strategy: 策略实例
        df: OHLCV 数据
        """
        result = BacktestResult(
            strategy_name=strategy.name,
            symbol=strategy.config.symbol,
            start_date=str(df.index[0])[:10] if hasattr(df.index[0], 'strftime') else str(df.index[0]),
            end_date=str(df.index[-1])[:10] if hasattr(df.index[-1], 'strftime') else str(df.index[-1]),
            initial_capital=self.capital,
        )

        capital = self.capital
        position = 0       # 持仓数量
        entry_price = 0     # 入场价格
        entry_idx = 0
        equity = [capital]
        daily_returns = []
        trades = []
        prev_close = df["close"].iloc[0]

        for i in range(len(df)):
            try:
                signal = strategy.on_bar(df, i)
            except Exception:
                signal = Signal(SignalType.HOLD, strategy.config.symbol, 0)

            price = df["close"].iloc[i]
            timestamp = str(df.index[i])[:19] if hasattr(df.index[i], 'strftime') else str(i)

            # 处理信号
            if signal.type == SignalType.BUY and position == 0 and signal.quantity > 0:
                qty = min(signal.quantity, int(capital / price / 100) * 100)
                if qty >= 100:
                    cost = qty * price * (1 + 0.0003)  # 万分之3手续费
                    if cost <= capital:
                        capital -= cost
                        position = qty
                        entry_price = price
                        entry_idx = i

            elif signal.type == SignalType.SELL and position > 0:
                revenue = position * price * (1 - 0.0003 - 0.001)  # 手续费+印花税
                capital += revenue
                pnl = (price - entry_price) * position
                pnl_pct = (price - entry_price) / entry_price
                trades.append(Trade(
                    symbol=strategy.config.symbol,
                    entry_time=str(df.index[entry_idx])[:19] if hasattr(df.index[entry_idx], 'strftime') else "",
                    exit_time=timestamp,
                    entry_price=entry_price,
                    exit_price=price,
                    quantity=position,
                    pnl=pnl,
                    pnl_pct=pnl_pct,
                    reason=signal.reason,
                ))
                position = 0

            # 风控检查
            if position > 0:
                hold_days = i - entry_idx
                risk_signal = strategy.check_risk(entry_price, price, hold_days)
                if risk_signal and risk_signal.type == SignalType.SELL:
                    revenue = position * price * (1 - 0.0003 - 0.001)
                    capital += revenue
                    pnl = (price - entry_price) * position
                    pnl_pct = (price - entry_price) / entry_price
                    trades.append(Trade(
                        symbol=strategy.config.symbol,
                        entry_time=str(df.index[entry_idx])[:19] if hasattr(df.index[entry_idx], 'strftime') else "",
                        exit_time=timestamp,
                        entry_price=entry_price,
                        exit_price=price,
                        quantity=position,
                        pnl=pnl,
                        pnl_pct=pnl_pct,
                        reason=risk_signal.reason,
                    ))
                    position = 0

            # 记录权益
            current_equity = capital + (position * price if position > 0 else 0)
            equity.append(current_equity)

            if i > 0:
                ret = (df["close"].iloc[i] - df["close"].iloc[i - 1]) / df["close"].iloc[i - 1]
                daily_returns.append(float(ret))

            if progress_callback and i % 50 == 0:
                progress_callback(i / len(df))

        # 计算统计指标
        result.trades = trades
        result.equity_curve = equity
        result.daily_returns = daily_returns
        result.final_capital = equity[-1]
        result.total_return = (equity[-1] - self.capital) / self.capital
        result.total_trades = len(trades)
        result.winning_trades = sum(1 for t in trades if t.pnl > 0)
        result.losing_trades = sum(1 for t in trades if t.pnl <= 0)
        result.win_rate = result.winning_trades / max(result.total_trades, 1)

        profits = [t.pnl_pct for t in trades if t.pnl > 0]
        losses = [t.pnl_pct for t in trades if t.pnl <= 0]
        result.avg_profit = np.mean(profits) if profits else 0
        result.avg_loss = np.mean(losses) if losses else 0

        total_profit = sum(t.pnl for t in trades if t.pnl > 0)
        total_loss = abs(sum(t.pnl for t in trades if t.pnl < 0))
        result.profit_factor = total_profit / max(total_loss, 1)

        # 年化收益率
        days = len(df)
        if days > 0:
            result.annual_return = (1 + result.total_return) ** (252 / days) - 1

        # 最大回撤
        peak = equity[0]
        mdd = 0
        for e in equity:
            if e > peak:
                peak = e
            dd = (peak - e) / peak
            if dd > mdd:
                mdd = dd
        result.max_drawdown = mdd

        # 夏普比率
        if daily_returns:
            mean_ret = np.mean(daily_returns)
            std_ret = np.std(daily_returns) + 1e-10
            result.sharpe_ratio = (mean_ret / std_ret) * np.sqrt(252)

        return result
