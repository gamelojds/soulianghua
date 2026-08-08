"""
SouLianghua - Windows 桌面启动器
PyInstaller 打包入口
"""

import sys
import os

# ===== 关键修复：windowed 模式重定向 stdout/stderr =====
if getattr(sys, 'frozen', False):
    # PyInstaller windowed 模式下 stdout/stderr 为 None
    devnull = open(os.devnull, 'w')
    if sys.stdout is None:
        sys.stdout = devnull
    if sys.stderr is None:
        sys.stderr = devnull

    # 禁用 uvicorn 的颜色输出（无 TTY）
    os.environ["UVICORN_NO_COLOR"] = "1"

# 确保 backend 模块可导入
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from app.main import main

if __name__ == "__main__":
    main()
