"""
SouLianghua - Windows 桌面启动器
PyInstaller 打包入口
"""

import sys
import os

# 确保 backend 模块可导入
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from app.main import main

if __name__ == "__main__":
    main()
