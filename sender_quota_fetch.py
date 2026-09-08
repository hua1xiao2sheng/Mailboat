#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fetch user-level daily quota usage and map it to sender accounts."""

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone


def bj_today():
    return datetime.now(timezone(timedelta(hours=8))).date()


def parse_iso_datetime(value):
    text = str(value or '').strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc).astimezone()
    return parsed.astimezone()


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch user daily quota usage")
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", type=int, default=3306)
    parser.add_argument("--user", required=True)
    parser.add_argument("--password", default="")
    parser.add_argument("--database", required=True)
    parser.add_argument("--user-id", type=int, required=True)
    parser.add_argument("--sender-table", default="sender_accounts")
    parser.add_argument("--stats-table", default="sender_daily_stats")
    parser.add_argument("--default-limit", type=int, default=20)
    parser.add_argument("--stat-date", default="")
    args = parser.parse_args()

    try:
        import pymysql
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"Missing pymysql: {exc}"}))
        return 1

    if args.user_id <= 0:
        print(json.dumps({"ok": True, "data": {"date": "", "quotas": {}}}))
        return 0

    stat_date = args.stat_date.strip() if args.stat_date else str(bj_today())
    bj_today_text = str(bj_today())
    default_limit = args.default_limit if args.default_limit and args.default_limit > 0 else 20

    try:
        conn = pymysql.connect(
            host=args.host,
            port=args.port,
            user=args.user,
            password=args.password,
            database=args.database,
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=True,
        )
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"DB connect failed: {exc}"}))
        return 1

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                f"SELECT sender_email FROM {args.sender_table} WHERE user_id=%s",
                (args.user_id,),
            )
            rows = cursor.fetchall() or []
            sender_emails = [
                str(row.get("sender_email") or "").strip().lower()
                for row in rows
                if str(row.get("sender_email") or "").strip()
            ]

            cursor.execute(
                """
                SELECT COLUMN_NAME
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA=%s AND TABLE_NAME='app_users'
                """,
                (args.database,),
            )
            user_columns = {row["COLUMN_NAME"] for row in cursor.fetchall() or []}
            has_user_limit = "daily_total_limit" in user_columns
            has_today_success_count = "today_success_count" in user_columns
            has_today_success_date = "today_success_date" in user_columns
            has_membership_status = "membership_status" in user_columns
            has_subscription_expire_at = "subscription_expire_at" in user_columns

            if has_user_limit:
                cursor.execute(
                    "SELECT COALESCE(daily_total_limit, %s) AS daily_limit FROM app_users WHERE id=%s LIMIT 1",
                    (default_limit, args.user_id),
                )
                row = cursor.fetchone() or {}
                daily_limit = int(row.get("daily_limit") or default_limit)
            else:
                daily_limit = default_limit
            if daily_limit <= 0:
                daily_limit = default_limit

            today_success = None
            if has_today_success_count:
                if has_today_success_date:
                    cursor.execute(
                        "SELECT today_success_date, COALESCE(today_success_count, 0) AS today_success_count "
                        "FROM app_users WHERE id=%s LIMIT 1",
                        (args.user_id,),
                    )
                    snapshot = cursor.fetchone() or {}
                    snapshot_date = snapshot.get("today_success_date")
                    snapshot_date_text = str(snapshot_date) if snapshot_date else ""
                    if snapshot_date_text == bj_today_text:
                        today_success = int(snapshot.get("today_success_count") or 0)
                else:
                    cursor.execute(
                        "SELECT COALESCE(today_success_count, 0) AS today_success_count "
                        "FROM app_users WHERE id=%s LIMIT 1",
                        (args.user_id,),
                    )
                    snapshot = cursor.fetchone() or {}
                    today_success = int(snapshot.get("today_success_count") or 0)

            if today_success is None:
                cursor.execute(
                    f"SELECT COALESCE(SUM(success_count), 0) AS total_success "
                    f"FROM {args.stats_table} WHERE user_id=%s AND stat_date=%s",
                    (args.user_id, stat_date),
                )
                total_row = cursor.fetchone() or {}
                today_success = int(total_row.get("total_success") or 0)

            if today_success < 0:
                today_success = 0

            membership_status = 'inactive'
            subscription_expire_at = ''
            subscription_active = False
            if has_membership_status or has_subscription_expire_at:
                select_cols = []
                if has_membership_status:
                    select_cols.append("membership_status")
                if has_subscription_expire_at:
                    select_cols.append("subscription_expire_at")
                cursor.execute(
                    f"SELECT {', '.join(select_cols)} FROM app_users WHERE id=%s LIMIT 1",
                    (args.user_id,),
                )
                member_row = cursor.fetchone() or {}
                membership_status = str(member_row.get("membership_status") or "inactive").strip().lower() or "inactive"
                subscription_expire_at = str(member_row.get("subscription_expire_at") or "").strip()
                expire_at = parse_iso_datetime(subscription_expire_at)
                if expire_at is not None:
                    subscription_active = expire_at > datetime.now(timezone.utc).astimezone()
                else:
                    subscription_active = membership_status == 'active'
                if not subscription_active and membership_status == 'active':
                    membership_status = 'expired'
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"Query failed: {exc}"}))
        return 1
    finally:
        conn.close()

    remaining = max(daily_limit - today_success, 0)
    quotas = {}
    for sender_email in sender_emails:
        if not sender_email:
            continue
        quotas[sender_email] = {
            "daily_limit": daily_limit,
            "today_success": today_success,
            "today_remaining": remaining,
            "limit_reached": (remaining <= 0) and not subscription_active,
        }

    print(
        json.dumps(
            {
                "ok": True,
                "data": {
                    "date": stat_date,
                    "daily_total_limit": daily_limit,
                    "today_success_total": today_success,
                    "membership_status": membership_status,
                    "subscription_active": subscription_active,
                    "subscription_expire_at": subscription_expire_at,
                    "quotas": quotas,
                },
            }
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
