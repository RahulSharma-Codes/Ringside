#!/usr/bin/env python3
"""
Replit project audit for Inorganic Growth Operating System.
Run from the root of the Replit project:

    python audit_replit_project.py

It prints where demo data appears, which commands start the app, and whether the code references Supabase/DATABASE_URL.
It does not print secret values.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

ROOT = Path.cwd()
TEXT_EXTS = {
    ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
    ".py", ".json", ".yaml", ".yml", ".toml", ".env",
    ".md", ".sql", ".css", ".html"
}
SKIP_DIRS = {
    "node_modules", ".git", ".cache", ".next", "dist", "build",
    "__pycache__", ".venv", "venv", ".pythonlibs", ".upm",
}
DEMO_TERMS = [
    "Project Apollo", "Project Beacon", "Project Catalyst", "Project Helios", "Project Orion",
    "Apollo", "Beacon", "Catalyst", "Helios", "Orion",
]
DB_TERMS = [
    "DATABASE_URL", "drizzle", "pg", "postgres", "supabase", "sqlite", "better-sqlite3",
    "sqlalchemy", "prisma", "localStorage", "mock", "demoData", "seed",
]


def safe_read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except Exception as exc:
        return f"<could not read: {exc}>"


def iter_files():
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        parts = set(path.parts)
        if parts & SKIP_DIRS:
            continue
        if path.suffix.lower() in TEXT_EXTS or path.name in {".replit", "Dockerfile", "Procfile"}:
            yield path


def print_header(title: str):
    print("\n" + "=" * 80)
    print(title)
    print("=" * 80)


def relative(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def main():
    print_header("PROJECT ROOT")
    print(ROOT)
    print("DATABASE_URL present in environment:", bool(os.getenv("DATABASE_URL")))
    print("APP_PASSWORD present in environment:", bool(os.getenv("APP_PASSWORD")))

    print_header("TOP-LEVEL FILE TREE")
    for path in sorted(ROOT.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
        marker = "/" if path.is_dir() else ""
        print(f"- {path.name}{marker}")

    print_header("START / BUILD CONFIG")
    for name in [".replit", "package.json", "pnpm-workspace.yaml", "requirements.txt", "pyproject.toml", "vite.config.ts", "vite.config.js", "next.config.js", "drizzle.config.ts", "lib/db/drizzle.config.ts"]:
        path = ROOT / name
        if path.exists():
            print(f"\n--- {name} ---")
            content = safe_read(path)
            if name == "package.json":
                try:
                    pkg = json.loads(content)
                    print(json.dumps({
                        "scripts": pkg.get("scripts"),
                        "dependencies": pkg.get("dependencies"),
                        "devDependencies": pkg.get("devDependencies"),
                    }, indent=2))
                except Exception:
                    print(content[:2500])
            else:
                print(content[:2500])

    files = list(iter_files())

    print_header("DEMO DATA SEARCH: APOLLO / ORION / BEACON / CATALYST / HELIOS")
    found_demo = False
    for path in files:
        text = safe_read(path)
        lower = text.lower()
        if any(term.lower() in lower for term in DEMO_TERMS):
            found_demo = True
            print(f"\n--- {relative(path)} ---")
            lines = text.splitlines()
            for idx, line in enumerate(lines, start=1):
                if any(term.lower() in line.lower() for term in DEMO_TERMS):
                    print(f"L{idx}: {line[:240]}")
    if not found_demo:
        print("No Apollo/Orion demo strings found in readable project files.")

    print_header("DATABASE / MOCK / STORAGE REFERENCES")
    for path in files:
        text = safe_read(path)
        hits = []
        for idx, line in enumerate(text.splitlines(), start=1):
            if any(term.lower() in line.lower() for term in DB_TERMS):
                hits.append((idx, line.strip()[:240]))
        if hits:
            print(f"\n--- {relative(path)} ---")
            for idx, line in hits[:40]:
                print(f"L{idx}: {line}")
            if len(hits) > 40:
                print(f"... {len(hits) - 40} more hits omitted")

    print_header("LIKELY FRONTEND / BACKEND ENTRYPOINTS")
    entry_patterns = [
        "src/main.tsx", "src/main.jsx", "src/App.tsx", "src/App.jsx",
        "client/src/main.tsx", "client/src/App.tsx", "server/index.ts", "server/routes.ts",
        "artifacts/growth-os/src/main.tsx", "artifacts/growth-os/src/App.tsx",
        "artifacts/api-server/src/index.ts", "artifacts/api-server/index.ts",
        "app.py", "main.py",
    ]
    for item in entry_patterns:
        path = ROOT / item
        if path.exists():
            print(f"- {item}")

    print_header("NEXT STEP")
    print("Copy everything from this audit output and paste it back into ChatGPT.")
    print("Do not paste DATABASE_URL or APP_PASSWORD values. This script only prints whether they exist.")


if __name__ == "__main__":
    main()
