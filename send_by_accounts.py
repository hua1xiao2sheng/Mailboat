#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Send emails by account assignment from teachers.json and accounts.json.
"""
import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone

from email_sender import EmailSender, apply_account_config


def load_json(path):
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


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
    raise ValueError("Invalid base time format")


def normalize_accounts(data):
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and "accounts" in data:
        return data["accounts"]
    return []


def main():
    parser = argparse.ArgumentParser(description="Send emails by assigned_account")
    parser.add_argument("--teachers", default="data/teachers.json", help="teachers.json path")
    parser.add_argument("--accounts", default="data/accounts.json", help="accounts.json path")
    parser.add_argument("--log", default=None, help="override log file path")
    parser.add_argument("--account", default=None, help="only send for this account email")
    args = parser.parse_args()

    teachers = load_json(args.teachers)
    accounts = normalize_accounts(load_json(args.accounts))

    if not accounts:
        print("No accounts found in accounts.json")
        return 1

    # Build map from account email to account config
    account_map = {}
    for acc in accounts:
        email = (acc.get("email") or "").strip()
        if not email:
            continue
        account_map[email.lower()] = acc

    # Group teachers by assigned account
    target_account = (args.account or "").strip().lower()
    grouped = {}
    if target_account:
        if target_account not in account_map:
            print(f"[warn] target account not found: {args.account}")
            return 1
        grouped[target_account] = {}
    else:
        grouped = {email: {} for email in account_map.keys()}
    unassigned = []

    for email, info in teachers.items():
        if not isinstance(info, dict):
            info = {"name": str(info)}
        assigned = (info.get("assigned_account") or "").strip().lower()
        if not assigned:
            unassigned.append(email)
            continue
        if assigned not in grouped:
            print(f"[warn] assigned account not found for {email}: {assigned}")
            continue
        grouped[assigned][email] = info

    if unassigned:
        print(f"[warn] {len(unassigned)} emails have no assigned_account, skipped")

    # Send for each account
    for account_email, teacher_data in grouped.items():
        if not teacher_data:
            print(f"[skip] {account_email} has no assigned teachers")
            continue

        account = account_map[account_email]
        apply_account_config(account, log_file=args.log)

        base_time_str = account.get("start_time_bj") or account.get("base_time")
        base_epoch = None
        if base_time_str:
            try:
                base_dt = parse_base_time(base_time_str)
                base_epoch = base_dt.timestamp()
            except ValueError:
                print(f"[warn] invalid start_time for {account_email}: {base_time_str}")

        print("\n" + "=" * 60)
        print(f"[account] {account_email} start={base_time_str or 'now'}")
        print("=" * 60)

        sender = EmailSender()
        sender.batch_send(teacher_data, base_epoch=base_epoch)

    return 0


if __name__ == "__main__":
    sys.exit(main())
