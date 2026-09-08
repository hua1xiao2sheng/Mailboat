#!/usr/bin/env python3
"""
Sync local sender accounts into MySQL sender_accounts table.
"""

import argparse
import json
import sys
from typing import Any


def to_int_or_none(value: Any) -> int | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(float(text))
    except Exception:
        return None


def normalize_accounts(raw: Any) -> list[dict[str, Any]]:
    if isinstance(raw, dict):
        data = raw.get("accounts", [])
    elif isinstance(raw, list):
        data = raw
    else:
        data = []
    if not isinstance(data, list):
        return []

    merged: dict[str, dict[str, Any]] = {}
    for item in data:
        if not isinstance(item, dict):
            continue
        email = str(item.get("email", "")).strip()
        if not email:
            continue
        key = email.lower()
        merged[key] = item
    return list(merged.values())


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync sender_accounts table")
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", type=int, default=3306)
    parser.add_argument("--user", required=True)
    parser.add_argument("--password", default="")
    parser.add_argument("--database", required=True)
    parser.add_argument("--table", default="sender_accounts")
    parser.add_argument("--user-id", type=int, required=True)
    parser.add_argument("--accounts-file", required=True)
    args = parser.parse_args()

    try:
        import pymysql
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"Missing pymysql: {exc}"}))
        return 1

    try:
        with open(args.accounts_file, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"Read accounts failed: {exc}"}))
        return 1

    accounts = normalize_accounts(raw)

    try:
        conn = pymysql.connect(
            host=args.host,
            port=args.port,
            user=args.user,
            password=args.password,
            database=args.database,
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=False,
        )
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"DB connect failed: {exc}"}))
        return 1

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT COLUMN_NAME
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s
                """,
                (args.database, args.table),
            )
            columns = {row["COLUMN_NAME"] for row in cursor.fetchall()}

            required = {"user_id", "sender_email"}
            if not required.issubset(columns):
                missing = sorted(required.difference(columns))
                raise RuntimeError(f"Missing required columns: {','.join(missing)}")

            optional_field_map = {
                "sender_name": "name",
                "smtp_server": "smtp_server",
                "smtp_port": "smtp_port",
                "min_delay": "min_delay",
                "max_delay": "max_delay",
                "start_time_bj": "start_time_bj",
                "daily_limit": "daily_limit",
            }
            usable_optional = [c for c in optional_field_map.keys() if c in columns]

            synced = 0
            for acc in accounts:
                row: dict[str, Any] = {
                    "user_id": args.user_id,
                    "sender_email": str(acc.get("email", "")).strip(),
                }
                for column in usable_optional:
                    src = optional_field_map[column]
                    value: Any = acc.get(src)
                    if column == "daily_limit":
                        value = to_int_or_none(value)
                        if value is None or value <= 0:
                            value = 20
                    elif column in {"smtp_port", "min_delay", "max_delay"}:
                        value = to_int_or_none(value)
                    elif column == "start_time_bj":
                        value = str(value).strip() if value is not None else None
                        if not value:
                            value = None
                    elif value is not None:
                        value = str(value).strip()
                    row[column] = value

                fields = list(row.keys())
                placeholders = ",".join(["%s"] * len(fields))
                field_sql = ",".join(fields)
                update_fields = [f for f in fields if f not in {"user_id", "sender_email"}]
                if update_fields:
                    update_sql = ",".join([f"{f}=VALUES({f})" for f in update_fields])
                else:
                    update_sql = "sender_email=VALUES(sender_email)"

                sql = (
                    f"INSERT INTO {args.table} ({field_sql}) VALUES ({placeholders}) "
                    f"ON DUPLICATE KEY UPDATE {update_sql}"
                )
                cursor.execute(sql, tuple(row[f] for f in fields))
                synced += 1

            emails = [str(acc.get("email", "")).strip().lower() for acc in accounts if acc.get("email")]
            deleted = 0
            if emails:
                placeholders = ",".join(["%s"] * len(emails))
                delete_sql = (
                    f"DELETE FROM {args.table} "
                    f"WHERE user_id=%s AND LOWER(sender_email) NOT IN ({placeholders})"
                )
                cursor.execute(delete_sql, tuple([args.user_id] + emails))
                deleted = cursor.rowcount
            else:
                cursor.execute(f"DELETE FROM {args.table} WHERE user_id=%s", (args.user_id,))
                deleted = cursor.rowcount

        conn.commit()
    except Exception as exc:
        conn.rollback()
        print(json.dumps({"ok": False, "error": f"Sync failed: {exc}"}))
        return 1
    finally:
        conn.close()

    print(json.dumps({"ok": True, "synced": len(accounts), "deleted": deleted}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
