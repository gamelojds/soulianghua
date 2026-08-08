"""
SouLianghua - REST API 路由
策略管理 / 回测 / 账户 / 行情
"""

import threading
from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

from ..strategies.base import StrategyConfig, StrategyRegistry
from ..engine.live_trading import get_engine, LiveTradingEngine
from ..engine.backtest import BacktestEngine, BacktestResult
from ..data.fetcher import DataFetcher

router = APIRouter(prefix="/api", tags=["量化交易"])

# WebSocket 连接池
_ws_clients: list[WebSocket] = []


# ==================== 请求模型 ====================

class StrategyCreateRequest(BaseModel):
    type: str                    # ma_cross, grid, momentum, etc.
    name: str = ""
    symbol: str = "sh600036"
    capital: float = 100000.0
    position_size: float = 0.1
    stop_loss: float = -0.05
    stop_profit: float = 0.15
    params: dict = {}

class BacktestRequest(BaseModel):
    strategy_type: str
    symbol: str
    capital: float = 100000.0
    params: dict = {}
    days: int = 365


# ==================== 策略管理 ====================

@router.get("/strategies")
async def list_strategies():
    """列出所有可用策略"""
    return {"strategies": StrategyRegistry.list_all()}


@router.post("/strategies/create")
async def create_strategy(req: StrategyCreateRequest):
    """创建策略实例"""
    strategy_cls = StrategyRegistry.get(req.type)
    if not strategy_cls:
        return JSONResponse({"error": f"未知策略类型: {req.type}"}, 400)

    config = StrategyConfig(
        name=req.name or f"{req.type}_{req.symbol}",
        symbol=req.symbol,
        capital=req.capital,
        position_size=req.position_size,
        stop_loss=req.stop_loss,
        stop_profit=req.stop_profit,
        params=req.params,
    )

    try:
        strategy = strategy_cls(config)
        return {"success": True, "strategy": strategy.to_dict()}
    except Exception as e:
        return JSONResponse({"error": str(e)}, 500)


@router.post("/strategies/start")
async def start_strategy(req: StrategyCreateRequest):
    """启动策略（加入实盘引擎）"""
    strategy_cls = StrategyRegistry.get(req.type)
    if not strategy_cls:
        return JSONResponse({"error": f"未知策略: {req.type}"}, 400)

    config = StrategyConfig(
        name=req.name or f"{req.type}_{req.symbol}",
        symbol=req.symbol,
        capital=req.capital,
        position_size=req.position_size,
        stop_loss=req.stop_loss,
        stop_profit=req.stop_profit,
        params=req.params,
    )

    try:
        strategy = strategy_cls(config)
        engine = get_engine()
        engine.add_strategy(strategy)
        return {"success": True, "strategy": strategy.to_dict(), "message": "策略已启动"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, 500)


@router.post("/strategies/{name}/stop")
async def stop_strategy(name: str):
    """停止策略"""
    engine = get_engine()
    engine.remove_strategy(name)
    return {"success": True, "message": f"策略 {name} 已停止"}


@router.get("/strategies/running")
async def get_running_strategies():
    """获取运行中的策略"""
    engine = get_engine()
    return {"running": engine.get_strategies_status()}


# ==================== 交易引擎 ====================

@router.post("/engine/start")
async def start_engine():
    """启动交易引擎"""
    engine = get_engine()
    await engine.start()
    return {"success": True, "message": "交易引擎已启动"}


@router.post("/engine/stop")
async def stop_engine():
    """停止交易引擎"""
    engine = get_engine()
    await engine.stop()
    return {"success": True, "message": "交易引擎已停止"}


@router.get("/engine/status")
async def engine_status():
    """获取引擎状态"""
    engine = get_engine()
    return {
        "is_running": engine.is_running,
        "strategies": engine.get_strategies_status(),
        "account": engine.get_account_state().to_dict(),
    }


# ==================== 回测 ====================

@router.post("/backtest")
async def run_backtest(req: BacktestRequest):
    """运行回测"""
    strategy_cls = StrategyRegistry.get(req.strategy_type)
    if not strategy_cls:
        return JSONResponse({"error": f"未知策略: {req.strategy_type}"}, 400)

    config = StrategyConfig(
        name=f"{req.strategy_type}_{req.symbol}",
        symbol=req.symbol,
        capital=req.capital,
        position_size=0.1,
        params=req.params,
    )

    try:
        strategy = strategy_cls(config)
        df = DataFetcher.get_daily_data(req.symbol, days=req.days)
        if df is None or len(df) < 50:
            return JSONResponse({"error": "数据不足，请检查股票代码"}, 400)

        engine = BacktestEngine(req.capital)
        result = engine.run(strategy, df)

        return {"success": True, "result": result.to_dict()}
    except Exception as e:
        return JSONResponse({"error": str(e)}, 500)


# ==================== 账户 ====================

@router.get("/account")
async def get_account():
    """获取账户状态"""
    engine = get_engine()
    return engine.get_account_state().to_dict()


@router.get("/account/trades")
async def get_trades(limit: int = 50):
    """获取交易记录"""
    engine = get_engine()
    return {"trades": engine.get_trade_log(limit)}


# ==================== 行情数据 ====================

@router.get("/market/search")
async def search_market(keyword: str = ""):
    """搜索股票"""
    results = DataFetcher.search_symbol(keyword)
    return {"results": results}


@router.get("/market/data/{symbol}")
async def get_market_data(symbol: str, days: int = 365):
    """获取行情数据"""
    df = DataFetcher.get_daily_data(symbol, days=days)
    if df is None:
        return JSONResponse({"error": "获取数据失败"}, 500)

    data = []
    for idx, row in df.iterrows():
        date_str = str(idx)[:10] if hasattr(idx, 'strftime') else str(idx)
        data.append({
            "date": date_str,
            "open": round(float(row["open"]), 2),
            "high": round(float(row["high"]), 2),
            "low": round(float(row["low"]), 2),
            "close": round(float(row["close"]), 2),
            "volume": int(row["volume"]),
        })

    return {"symbol": symbol, "count": len(data), "data": data}


# ==================== WebSocket ====================

@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """WebSocket 实时推送"""
    await ws.accept()
    _ws_clients.append(ws)

    engine = get_engine()

    def push_update(data: dict):
        """推送更新到 WebSocket 客户端"""
        import json
        import asyncio
        for client in _ws_clients:
            try:
                asyncio.run_coroutine_threadsafe(
                    client.send_json(data),
                    asyncio.get_event_loop() if hasattr(asyncio, 'get_event_loop') else None
                )
            except Exception:
                pass

    engine.on_update(push_update)

    try:
        # 发送初始状态
        await ws.send_json({
            "event": "connected",
            "account": engine.get_account_state().to_dict(),
            "strategies": engine.get_strategies_status(),
        })

        while True:
            data = await ws.receive_json()
            # 处理客户端命令
            cmd = data.get("cmd", "")
            if cmd == "get_account":
                await ws.send_json(engine.get_account_state().to_dict())
            elif cmd == "get_strategies":
                await ws.send_json({
                    "strategies": engine.get_strategies_status()
                })

    except WebSocketDisconnect:
        _ws_clients.remove(ws)
    except Exception:
        if ws in _ws_clients:
            _ws_clients.remove(ws)


# ==================== 系统 ====================

@router.get("/health")
async def health_check():
    return {
        "status": "ok",
        "time": datetime.now().isoformat(),
        "engine_running": get_engine().is_running,
    }
