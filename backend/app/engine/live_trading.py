"""SouLianghua - 实盘/模拟交易引擎
管理策略运行、信号执行、账户状态
"""

import asyncio
import json
import threading
import time
from datetime import datetime
from typing import Optional, Callable

import pandas as pd

from ..strategies.base import StrategyBase, Signal, SignalType, StrategyConfig
from ..broker.base import BrokerBase
from ..broker.paper import PaperBroker
from ..data.fetcher import DataFetcher
from ..core.config import config
from .models import AccountState


class LiveTradingEngine:
    """实盘/模拟交易引擎"""

    def __init__(self):
        self.strategies: dict[str, StrategyBase] = {}
        self.broker: BrokerBase = PaperBroker()
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._callbacks: list[Callable] = []
        self._last_update: dict[str, datetime] = {}
        self.trade_log: list[dict] = []

    @property
    def is_running(self) -> bool:
        return self._running

    def add_strategy(self, strategy: StrategyBase):
        """添加策略"""
        self.strategies[strategy.name] = strategy

    def remove_strategy(self, name: str):
        """移除策略"""
        self.strategies.pop(name, None)

    def on_update(self, callback: Callable):
        """注册状态更新回调（用于 WebSocket 推送）"""
        self._callbacks.append(callback)

    def _notify(self, data: dict):
        """通知所有回调"""
        for cb in self._callbacks:
            try:
                cb(data)
            except Exception:
                pass

    async def start(self):
        """启动交易引擎"""
        if self._running:
            return

        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        self._notify({"event": "engine_started", "timestamp": datetime.now().isoformat()})
        self.trade_log.append({"event": "引擎启动", "time": datetime.now().isoformat()})

    async def stop(self):
        """停止交易引擎"""
        self._running = False
        self._notify({"event": "engine_stopped", "timestamp": datetime.now().isoformat()})
        self.trade_log.append({"event": "引擎停止", "time": datetime.now().isoformat()})

    def _run_loop(self):
        """主循环（在后台线程运行）"""
        while self._running:
            try:
                for name, strategy in self.strategies.items():
                    symbol = strategy.config.symbol
                    if not symbol:
                        continue

                    # 检查更新间隔
                    last = self._last_update.get(symbol)
                    if last and (datetime.now() - last).seconds < config.DATA_UPDATE_INTERVAL:
                        continue

                    # 获取行情数据
                    df = DataFetcher.get_realtime_data(symbol)
                    if df is None or len(df) < 50:
                        continue

                    # 生成信号
                    signal = strategy.on_bar(df, len(df) - 1)

                    # 执行交易
                    if signal.type in (SignalType.BUY, SignalType.SELL):
                        self._execute_signal(strategy, signal)

                    self._last_update[symbol] = datetime.now()

                # 推送账户状态
                state = self.get_account_state()
                self._notify({"event": "account_update", "state": state.to_dict()})

            except Exception as e:
                self._notify({"event": "error", "message": str(e)})

            time.sleep(config.DATA_UPDATE_INTERVAL)

    def _execute_signal(self, strategy: StrategyBase, signal: Signal):
        """执行交易信号"""
        result = self.broker.execute(signal)
        log_entry = {
            "time": datetime.now().isoformat(),
            "strategy": strategy.name,
            "symbol": signal.symbol,
            "type": signal.type.value,
            "price": signal.price,
            "quantity": signal.quantity,
            "reason": signal.reason,
            "result": result,
        }
        self.trade_log.append(log_entry)
        self._notify({"event": "trade_executed", "trade": log_entry})

    def get_account_state(self) -> AccountState:
        """获取账户状态"""
        return self.broker.get_account_state()

    def get_trade_log(self, limit: int = 50) -> list[dict]:
        return self.trade_log[-limit:]

    def get_strategies_status(self) -> list[dict]:
        """获取所有策略状态"""
        return [
            {"name": s.name, "symbol": s.config.symbol, "params": s.config.params}
            for s in self.strategies.values()
        ]


# 全局单例
_engine: Optional[LiveTradingEngine] = None


def get_engine() -> LiveTradingEngine:
    global _engine
    if _engine is None:
        _engine = LiveTradingEngine()
    return _engine
