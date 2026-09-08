#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Send test emails without touching the main sent records.
Reads a TSV/CSV list: 姓氏\t作者邮箱\t与北京时间时差(小时)
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone

from email_sender import EmailSender, apply_account_config, parse_offset_hours


def load_json(path):
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def normalize_accounts(data):
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and "accounts" in data:
        return data["accounts"]
    return []


def parse_rows(path):
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            text = line.strip()
            if not text:
                continue
            delimiter = "	" if "	" in text else ","
            cols = [cell.strip() for cell in text.split(delimiter)]
            rows.append(cols)
    if not rows:
        return []

    first = rows[0]
    has_email_header = any(("email" in cell.lower()) or ("\u90ae\u7bb1" in cell) for cell in first)
    has_name_header = any(("surname" in cell.lower()) or ("\u59d3" in cell) for cell in first)
    has_header = has_email_header and has_name_header
    return rows[1:] if has_header else rows


def build_teacher_data(rows):
    data = {}
    for cols in rows:
        if len(cols) < 2:
            continue
        surname = cols[0].strip()
        email = cols[1].strip()
        if not email or "@" not in email:
            continue
        offset = cols[2].strip() if len(cols) > 2 else "0"
        data[email] = {
            "name": surname,
            "surname": surname,
            "offset_hours": parse_offset_hours(offset),
        }
    return data


def parse_base_time(value):
    if not value:
        return None
    text = value.strip().replace("T", " ")
    tz = timezone(timedelta(hours=8))
    formats = ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%m.%d %H:%M")
    for fmt in formats:
        try:
            dt = datetime.strptime(text, fmt)
            if fmt == "%m.%d %H:%M":
                dt = dt.replace(year=datetime.now(tz).year)
            return dt.replace(tzinfo=tz)
        except ValueError:
            continue
    raise ValueError("Invalid start time format")


def main():
    parser = argparse.ArgumentParser(description="Send test emails without recording sent list")
    parser.add_argument("--list", required=True, help="TSV/CSV list path")
    parser.add_argument("--accounts", default="data/accounts.json", help="accounts.json path")
    parser.add_argument("--account", default=None, help="account email to use")
    parser.add_argument("--log", default=None, help="override log file path")
    parser.add_argument("--start-time", default=None, help="Beijing time base (YYYY-MM-DD HH:MM)")
    args = parser.parse_args()

    accounts = normalize_accounts(load_json(args.accounts))
    if not accounts:
        print("No accounts found in accounts.json")
        return 1

    target = (args.account or "").strip().lower()
    selected = None
    if target:
        for acc in accounts:
            if (acc.get("email") or "").strip().lower() == target:
                selected = acc
                break
        if not selected:
            print(f"Target account not found: {args.account}")
            return 1
    else:
        selected = accounts[0]

    channel = str(selected.get("send_channel") or "").strip().lower()
    if channel not in ("smtp", "gmail_api"):
        channel = "smtp"
    if channel == "gmail_api":
        channel_text = "gmail_api/http-443"
    else:
        smtp_server = str(selected.get("smtp_server") or "smtp.gmail.com").strip()
        smtp_port = int(selected.get("smtp_port") or 465)
        channel_text = f"smtp/{smtp_server}:{smtp_port}"
    print(f"TEST_CONFIG account={selected.get('email', '')} channel={channel_text}")
    print("TEST_CONFIG teachers_write=disabled skip_checks=disabled")

    rows = parse_rows(args.list)
    teacher_data = build_teacher_data(rows)
    if not teacher_data:
        print("No valid rows to send")
        return 1

    apply_account_config(selected, log_file=args.log)
    sender = EmailSender()
    # Test mode should always send the provided list without skip checks.
    sender.sent_emails.clear()
    sender.is_already_sent = lambda _email: False
    sender._is_teacher_active = lambda _email: True
    base_epoch = None
    if args.start_time:
        try:
            base_dt = parse_base_time(args.start_time)
            base_epoch = base_dt.timestamp()
        except ValueError:
            print(f"[warn] invalid start_time: {args.start_time}")
    sender.batch_send(teacher_data, base_epoch=base_epoch)

    print(
        f"TEST_SUMMARY success={sender.success_count} "
        f"failed={sender.fail_count} total={len(teacher_data)}"
    )
    if sender.failed_emails:
        print("FAILED:")
        for email, name, error in sender.failed_emails:
            print(f"- {name}({email}): {error}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
