"""
SouLianghua - 交易引擎数据模型
避免循环引用的共享模型
"""

from dataclasses import dataclass, field


@dataclass
class AccountState:
    """账户状态"""
    capital: float = 0
    available: float = 0
    frozen: float = 0
    total_value: float = 0
    total_pnl: float = 0
    total_pnl_pct: float = 0
    positions: list[dict] = field(default_factory=list)
    today_trades: int = 0

    def to_dict(self) -> dict:
        return {
            "capital": round(self.capital, 2),
            "available": round(self.available, 2),
            "frozen": round(self.frozen, 2),
            "total_value": round(self.total_value, 2),
            "total_pnl": round(self.total_pnl, 2),
            "total_pnl_pct": round(self.total_pnl_pct * 100, 2),
            "positions": self.positions,
            "today_trades": self.today_trades,
        }
