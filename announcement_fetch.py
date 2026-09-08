#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fetch latest announcement from MySQL.
"""

import argparse
import json
import sys


def main():
    parser = argparse.ArgumentParser(description="Fetch announcement from MySQL")
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", type=int, default=3306)
    parser.add_argument("--user", required=True)
    parser.add_argument("--password", default="")
    parser.add_argument("--database", required=True)
    parser.add_argument("--table", default="announcements")
    parser.add_argument("--all", action="store_true", help="return list of announcements")
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()

    try:
        import pymysql
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"Missing pymysql: {exc}"}))
        return 1

    if args.all:
        query = f"""
            SELECT content, level, updated_at
            FROM {args.table}
            WHERE is_active=1
              AND (start_at IS NULL OR start_at <= NOW())
              AND (end_at IS NULL OR end_at >= NOW())
            ORDER BY updated_at DESC, id DESC
            LIMIT {max(1, args.limit)}
        """
    else:
        query = f"""
            SELECT content, level, updated_at
            FROM {args.table}
            WHERE is_active=1
              AND (start_at IS NULL OR start_at <= NOW())
              AND (end_at IS NULL OR end_at >= NOW())
            ORDER BY updated_at DESC, id DESC
            LIMIT 1
        """

    try:
        conn = pymysql.connect(
            host=args.host,
            port=args.port,
            user=args.user,
            password=args.password,
            database=args.database,
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
        )
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"DB connect failed: {exc}"}))
        return 1

    try:
        with conn.cursor() as cursor:
            cursor.execute(query)
            row = cursor.fetchall() if args.all else cursor.fetchone()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"Query failed: {exc}"}))
        return 1
    finally:
        conn.close()

    if args.all:
        items = []
        for entry in row or []:
            items.append(
                {
                    "content": entry.get("content", "") or "",
                    "level": entry.get("level", "info") or "info",
                    "updated_at": str(entry.get("updated_at", "")) if entry.get("updated_at") else "",
                }
            )
        print(json.dumps({"ok": True, "data": {"items": items}}))
        return 0

    if not row:
        print(json.dumps({"ok": True, "data": {"content": "", "level": "info"}}))
        return 0

    data = {
        "content": row.get("content", "") or "",
        "level": row.get("level", "info") or "info",
        "updated_at": str(row.get("updated_at", "")) if row.get("updated_at") else "",
    }
    print(json.dumps({"ok": True, "data": data}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
