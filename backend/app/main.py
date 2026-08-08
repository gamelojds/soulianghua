"""
SouLianghua - 量化交易系统主入口
FastAPI 服务器
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from .core.config import config
from .api.routes import router
from .strategies import (  # noqa: F401 - 注册所有策略
    MACrossStrategy, GridStrategy, MomentumStrategy,
    MeanReversionStrategy, RSIStrategy, BollingerStrategy,
    TurtleStrategy, ArbitrageStrategy,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期"""
    import os
    os.makedirs(config.DATA_CACHE_DIR, exist_ok=True)
    yield


app = FastAPI(
    title="SouLianghua - 量化交易系统",
    description="多策略量化交易平台，支持回测、模拟交易、实盘交易",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 路由
app.include_router(router)

# 静态文件（前端）
frontend_dir = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=config.HOST, port=config.PORT, log_level="info")
