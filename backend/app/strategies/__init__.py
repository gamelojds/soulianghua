"""
SouLianghua - 策略引擎
所有量化策略的基类和注册表
"""

from .base import StrategyBase, StrategyConfig, Signal, SignalType, StrategyRegistry
from .ma_cross import MACrossStrategy
from .grid import GridStrategy
from .momentum import MomentumStrategy
from .mean_reversion import MeanReversionStrategy
from .rsi_strategy import RSIStrategy
from .bollinger import BollingerStrategy
from .turtle import TurtleStrategy
from .arbitrage import ArbitrageStrategy

__all__ = [
    "StrategyBase", "StrategyConfig", "Signal", "SignalType", "StrategyRegistry",
    "MACrossStrategy", "GridStrategy", "MomentumStrategy", "MeanReversionStrategy",
    "RSIStrategy", "BollingerStrategy", "TurtleStrategy", "ArbitrageStrategy",
]
