"""
SouLianghua - 行情数据获取
支持 A 股、港股、美股数据源
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Optional


class DataFetcher:
    """行情数据获取器"""

    @staticmethod
    def get_daily_data(symbol: str, days: int = 365) -> Optional[pd.DataFrame]:
        """
        获取日线数据（AKShare + yfinance 双源）
        自动识别 A股/港股/美股
        """
        # 尝试 AKShare (A股)
        df = DataFetcher._try_akshare(symbol, days)
        if df is not None and len(df) > 0:
            return df

        # 尝试 yfinance (美股/港股)
        df = DataFetcher._try_yfinance(symbol, days)
        if df is not None and len(df) > 0:
            return df

        # 生成模拟数据用于演示
        return DataFetcher._generate_demo_data(symbol, days)

    @staticmethod
    def _try_akshare(symbol: str, days: int) -> Optional[pd.DataFrame]:
        """尝试用 AKShare 获取 A 股数据"""
        try:
            import akshare as ak

            # 处理 symbol 格式: sh600000 / sz000001
            code = symbol.replace("sh", "").replace("sz", "").replace("SH", "").replace("SZ", "")
            if not code.isdigit():
                return None

            df = ak.stock_zh_a_hist(
                symbol=code,
                period="daily",
                start_date=(datetime.now() - timedelta(days=days)).strftime("%Y%m%d"),
                end_date=datetime.now().strftime("%Y%m%d"),
                adjust="qfq",
            )

            if df is None or len(df) == 0:
                return None

            df = df.rename(columns={
                "日期": "date", "开盘": "open", "收盘": "close",
                "最高": "high", "最低": "low", "成交量": "volume",
            })
            df["date"] = pd.to_datetime(df["date"])
            df = df.set_index("date")
            df = df[["open", "high", "low", "close", "volume"]]
            df = df.astype(float)
            return df
        except Exception:
            return None

    @staticmethod
    def _try_yfinance(symbol: str, days: int) -> Optional[pd.DataFrame]:
        """尝试用 yfinance 获取美股/港股数据"""
        try:
            import yfinance as yf

            ticker = yf.Ticker(symbol)
            df = ticker.history(period=f"{days}d")
            if df is None or len(df) == 0:
                return None

            df = df.rename(columns={
                "Open": "open", "High": "high", "Low": "low",
                "Close": "close", "Volume": "volume",
            })
            df = df[["open", "high", "low", "close", "volume"]]
            return df
        except Exception:
            return None

    @staticmethod
    def _generate_demo_data(symbol: str, days: int) -> pd.DataFrame:
        """生成演示用的模拟数据"""
        np.random.seed(hash(symbol) % 100000)

        dates = pd.date_range(end=datetime.now(), periods=days, freq="B")
        returns = np.random.normal(0.0003, 0.015, days)
        prices = 50 * np.exp(np.cumsum(returns))

        # 添加趋势和波动
        trend = np.linspace(0, 0.3, days) * (0.5 + 0.5 * np.sin(np.linspace(0, np.pi * 3, days)))
        prices = 50 + trend * 20 + np.random.normal(0, 2, days).cumsum()

        df = pd.DataFrame({
            "open": prices * (1 + np.random.normal(0, 0.005, days)),
            "high": prices * (1 + abs(np.random.normal(0, 0.01, days))),
            "low": prices * (1 - abs(np.random.normal(0, 0.01, days))),
            "close": prices,
            "volume": np.random.randint(1000000, 10000000, days),
        }, index=dates)
        return df

    @staticmethod
    def get_realtime_data(symbol: str) -> Optional[pd.DataFrame]:
        """获取实时行情数据（用于实盘/模拟交易）"""
        # 实盘应接入实时行情接口，此处简化为返回模拟数据
        return DataFetcher.get_daily_data(symbol, days=100)

    @staticmethod
    def search_symbol(keyword: str) -> list[dict]:
        """搜索股票代码"""
        common_stocks = [
            {"symbol": "sh600036", "name": "招商银行", "market": "A股"},
            {"symbol": "sh600519", "name": "贵州茅台", "market": "A股"},
            {"symbol": "sz000001", "name": "平安银行", "market": "A股"},
            {"symbol": "sh601318", "name": "中国平安", "market": "A股"},
            {"symbol": "sz000858", "name": "五粮液", "market": "A股"},
            {"symbol": "sh600276", "name": "恒瑞医药", "market": "A股"},
            {"symbol": "sz300750", "name": "宁德时代", "market": "A股"},
            {"symbol": "sh601012", "name": "隆基绿能", "market": "A股"},
            {"symbol": "sz002594", "name": "比亚迪", "market": "A股"},
            {"symbol": "sh600900", "name": "长江电力", "market": "A股"},
            {"symbol": "AAPL", "name": "Apple Inc.", "market": "美股"},
            {"symbol": "TSLA", "name": "Tesla Inc.", "market": "美股"},
            {"symbol": "GOOGL", "name": "Alphabet Inc.", "market": "美股"},
            {"symbol": "MSFT", "name": "Microsoft", "market": "美股"},
            {"symbol": "NVDA", "name": "NVIDIA", "market": "美股"},
        ]

        if not keyword:
            return common_stocks

        kw = keyword.lower()
        return [s for s in common_stocks if kw in s["name"].lower() or kw in s["symbol"].lower()]
