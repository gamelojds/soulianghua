"""
SouLianghua - 券商基类
定义交易接口规范
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from ..strategies.base import Signal
from ..engine.models import AccountState


class BrokerBase(ABC):
    """券商交易接口基类"""

    @abstractmethod
    def execute(self, signal: Signal) -> dict:
        """执行交易信号，返回执行结果"""
        ...

    @abstractmethod
    def get_account_state(self) -> AccountState:
        """获取账户当前状态"""
        ...

    @abstractmethod
    def get_positions(self) -> list[dict]:
        """获取当前持仓"""
        ...

    @abstractmethod
    def cancel_order(self, order_id: str) -> bool:
        """撤销订单"""
        ...

    @abstractmethod
    def get_orders(self) -> list[dict]:
        """获取今日订单"""
        ...
