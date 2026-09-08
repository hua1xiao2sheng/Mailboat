#!/usr/bin/env python3
"""
Build protected Python resources for Electron packaging.

This script compiles selected modules with Cython and writes a bundle to
desktop-app/.protected_py.
"""

from __future__ import annotations

import shutil
import sys
import os
from pathlib import Path

from setuptools import Extension, setup

try:
    from Cython.Build import cythonize
except Exception as exc:  # pragma: no cover
    raise SystemExit(
        "Cython is required. Install it in the build Python environment first."
    ) from exc


ROOT_DIR = Path(__file__).resolve().parents[2]
DESKTOP_DIR = ROOT_DIR / "desktop-app"
OUT_DIR = DESKTOP_DIR / ".protected_py"
BUILD_TEMP_DIR = DESKTOP_DIR / ".cython_build"

# Modules imported by the compiled entry modules and expected as top-level
# imports at runtime.
TOP_LEVEL_MODULES = [
    "config",
    "email_sender",
]

# Scripts spawned by Electron. They are compiled under mailboat_core.* and
# executed via `python -c` entrypoints from main.js.
ENTRY_MODULES = [
    "announcement_fetch",
    "gmail_oauth_manager",
    "import_teachers_from_excel",
    "sender_quota_fetch",
    "send_by_accounts",
    "send_feedback",
    "smtp_check",
    "sync_sender_accounts",
    "test_send",
]


def reset_output_dirs() -> None:
    for path in (OUT_DIR, BUILD_TEMP_DIR):
        if path.exists():
            shutil.rmtree(path)
        path.mkdir(parents=True, exist_ok=True)


def cleanup_stale_generated_c_files() -> None:
    module_names = [*TOP_LEVEL_MODULES, *ENTRY_MODULES]
    for module_name in module_names:
        generated = ROOT_DIR / f"{module_name}.c"
        if generated.exists():
            generated.unlink()


def build_extensions() -> None:
    current_dir = Path.cwd()
    os.chdir(ROOT_DIR)
    try:
        exts = []
        for module_name in TOP_LEVEL_MODULES:
            exts.append(
                Extension(
                    module_name,
                    [f"{module_name}.py"],
                )
            )
        for module_name in ENTRY_MODULES:
            exts.append(
                Extension(
                    f"mailboat_core.{module_name}",
                    [f"{module_name}.py"],
                )
            )

        ext_modules = cythonize(
            exts,
            build_dir=str(BUILD_TEMP_DIR / "cythonized"),
            language_level=3,
            compiler_directives={
                "embedsignature": False,
                "binding": False,
            },
            annotate=False,
        )

        # setup() drives the C extension build and outputs artifacts to OUT_DIR.
        setup(
            name="mailboat-protected-python",
            script_args=[
                "build_ext",
                "--build-lib",
                str(OUT_DIR),
                "--build-temp",
                str(BUILD_TEMP_DIR),
            ],
            ext_modules=ext_modules,
        )
    finally:
        os.chdir(current_dir)


def main() -> int:
    print(f"[build_cython_bundle] root: {ROOT_DIR}")
    reset_output_dirs()
    cleanup_stale_generated_c_files()
    build_extensions()
    print(f"[build_cython_bundle] done: {OUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
