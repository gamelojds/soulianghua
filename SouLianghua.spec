# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller 打包配置"""

import sys
import os
from pathlib import Path

block_cipher = None

# 项目根目录
PROJ_DIR = Path(SPECPATH)

# 收集所有需要的数据文件
datas = []

# 前端构建文件
frontend_dist = PROJ_DIR / "frontend" / "dist"
if frontend_dist.exists():
    # 递归添加前端所有文件
    for root, dirs, files in os.walk(frontend_dist):
        for f in files:
            src = os.path.join(root, f)
            rel_dir = os.path.relpath(root, frontend_dist)
            dest_dir = os.path.join("frontend", "dist", rel_dir)
            datas.append((src, dest_dir))

# 隐藏导入
hiddenimports = [
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "fastapi",
    "starlette",
    "pydantic",
    "sqlalchemy",
    "aiosqlite",
    "loguru",
    "pandas",
    "numpy",
    "websockets",
    "asyncio",
    "anyio",
    "httpcore",
    "httptools",
    "uvloop",
]

a = Analysis(
    [str(PROJ_DIR / "launcher.py")],
    pathex=[str(PROJ_DIR), str(PROJ_DIR / "backend")],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "tkinter", "matplotlib", "scipy", "PIL",
        "test", "tests", "unittest",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="SouLianghua",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,           # Windows: 无控制台窗口
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
