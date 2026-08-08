"""
SouLianghua - 模拟券商
完全本地模拟交易，用于回测和策略验证
"""

from datetime import datetime
from typing import Optional

from .base import BrokerBase
from ..strategies.base import Signal, SignalType
from ..engine.models import AccountState
from ..core.config import config


class PaperBroker(BrokerBase):
    """模拟券商（Paper Trading）"""

    def __init__(self, initial_capital: float = None):
        self._capital = initial_capital or config.INITIAL_CAPITAL
        self._available = self._capital
        self._frozen = 0.0
        self._positions: dict[str, dict] = {}  # symbol -> {qty, avg_price, ...}
        self._orders: list[dict] = []
        self._today_trades = 0
        self._total_pnl = 0.0

    def execute(self, signal: Signal) -> dict:
        if self._today_trades >= config.MAX_DAILY_TRADES:
            return {"success": False, "reason": "达到每日交易上限"}

        if signal.type == SignalType.BUY:
            return self._buy(signal)
        elif signal.type == SignalType.SELL:
            return self._sell(signal)
        return {"success": False, "reason": "无效信号"}

    def _buy(self, signal: Signal) -> dict:
        cost = signal.quantity * signal.price * 1.0003  # 手续费
        if cost > self._available:
            return {"success": False, "reason": "资金不足"}

        self._available -= cost
        self._frozen += cost

        # 更新持仓
        symbol = signal.symbol
        if symbol in self._positions:
            pos = self._positions[symbol]
            total_qty = pos["qty"] + signal.quantity
            pos["avg_price"] = (pos["avg_price"] * pos["qty"] + signal.price * signal.quantity) / total_qty
            pos["qty"] = total_qty
        else:
            self._positions[symbol] = {
                "qty": signal.quantity,
                "avg_price": signal.price,
                "current_price": signal.price,
            }

        self._frozen -= cost
        self._today_trades += 1
        self._orders.append({"type": "buy", "symbol": symbol, "price": signal.price,
                             "qty": signal.quantity, "time": datetime.now().isoformat()})

        return {"success": True, "filled": signal.quantity, "price": signal.price,
                "time": datetime.now().isoformat()}

    def _sell(self, signal: Signal) -> dict:
        symbol = signal.symbol
        pos = self._positions.get(symbol)
        if not pos or pos["qty"] <= 0:
            return {"success": False, "reason": f"无持仓: {symbol}"}

        sell_qty = min(signal.quantity, pos["qty"]) if signal.quantity > 0 else pos["qty"]
        revenue = sell_qty * signal.price * (1 - 0.0003 - 0.001)

        pnl = (signal.price - pos["avg_price"]) * sell_qty
        self._total_pnl += pnl
        self._available += revenue

        pos["qty"] -= sell_qty
        if pos["qty"] <= 0:
            del self._positions[symbol]

        self._today_trades += 1
        self._orders.append({"type": "sell", "symbol": symbol, "price": signal.price,
                             "qty": sell_qty, "pnl": round(pnl, 2),
                             "time": datetime.now().isoformat()})

        return {"success": True, "filled": sell_qty, "price": signal.price,
                "pnl": round(pnl, 2), "time": datetime.now().isoformat()}

    def get_account_state(self) -> AccountState:
        positions = []
        total_market_value = 0
        for sym, pos in self._positions.items():
            mv = pos["qty"] * pos["current_price"]
            total_market_value += mv
            positions.append({
                "symbol": sym,
                "quantity": pos["qty"],
                "avg_price": round(pos["avg_price"], 4),
                "current_price": round(pos["current_price"], 4),
                "market_value": round(mv, 2),
                "pnl": round((pos["current_price"] - pos["avg_price"]) * pos["qty"], 2),
            })

        total_value = self._available + total_market_value
        return AccountState(
            capital=self._capital,
            available=self._available,
            frozen=self._frozen,
            total_value=total_value,
            total_pnl=total_value - self._capital + self._total_pnl,
            total_pnl_pct=(total_value - self._capital) / self._capital if self._capital > 0 else 0,
            positions=positions,
            today_trades=self._today_trades,
        )

    def get_positions(self) -> list[dict]:
        state = self.get_account_state()
        return state.positions

    def cancel_order(self, order_id: str) -> bool:
        return True

    def get_orders(self) -> list[dict]:
        return self._orders
