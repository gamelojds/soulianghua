"""
SouLianghua - 量化交易系统主入口
FastAPI 服务器 + 前端静态文件
"""

import sys
import os
import webbrowser
import threading

# 确保能导入项目模块
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager

from .core.config import config
from .api.routes import router
from .strategies import (  # noqa: F401
    MACrossStrategy, GridStrategy, MomentumStrategy,
    MeanReversionStrategy, RSIStrategy, BollingerStrategy,
    TurtleStrategy, ArbitrageStrategy,
)


def find_frontend_dir() -> str:
    """查找前端构建目录"""
    # PyInstaller 打包后的路径
    if getattr(sys, 'frozen', False):
        base = sys._MEIPASS
    else:
        base = os.path.dirname(os.path.dirname(os.path.dirname(BASE_DIR)))

    candidates = [
        os.path.join(base, "frontend", "dist"),
        os.path.join(os.path.dirname(base), "frontend", "dist"),
        os.path.join(BASE_DIR, "..", "..", "frontend", "dist"),
    ]
    for d in candidates:
        d = os.path.normpath(d)
        if os.path.isdir(d):
            return d
    return ""


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期"""
    os.makedirs(config.DATA_CACHE_DIR, exist_ok=True)
    yield


app = FastAPI(
    title="SouLianghua - 量化交易系统",
    description="多策略量化交易平台",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

app.include_router(router)

# 静态前端
frontend_dir = find_frontend_dir()
if frontend_dir:
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """SPA fallback"""
        file_path = os.path.join(frontend_dir, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_dir, "index.html"))

    # 也挂载静态文件
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dir, "assets")), name="assets")


def open_browser():
    """延迟打开浏览器"""
    import time
    time.sleep(1.5)
    webbrowser.open(f"http://localhost:{config.PORT}")


def main():
    """程序入口：启动服务器 + 打开浏览器"""
    import uvicorn
    import logging

    frozen = getattr(sys, 'frozen', False)

    if not frozen:
        print(f"\n  SouLianghua 量化交易系统")
        print(f"  http://localhost:{config.PORT}")
        print(f"  API 文档: http://localhost:{config.PORT}/api/docs\n")

    # 启动浏览器
    threading.Thread(target=open_browser, daemon=True).start()

    # 日志配置：windowed 模式下避免 TTY 依赖
    log_config = None
    if frozen:
        logging.basicConfig(
            level=logging.WARNING,
            format="%(asctime)s [%(levelname)s] %(message)s",
            handlers=[logging.StreamHandler(open(os.devnull, 'w'))]
        )
        log_config = {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "default": {
                    "()": "logging.Formatter",
                    "fmt": "%(asctime)s [%(levelname)s] %(message)s",
                },
            },
            "handlers": {
                "default": {
                    "class": "logging.NullHandler",
                },
            },
            "loggers": {
                "uvicorn": {"handlers": ["default"], "level": "WARNING"},
                "uvicorn.error": {"handlers": ["default"], "level": "WARNING"},
                "uvicorn.access": {"handlers": ["default"], "level": "WARNING"},
            },
        }

    uvicorn.run(
        app, host=config.HOST, port=config.PORT,
        log_level="warning",
        log_config=log_config,
    )


if __name__ == "__main__":
    main()
