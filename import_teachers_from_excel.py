#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 Excel/CSV 中读取“姓氏”“作者邮箱”列，合并到 data/teachers.json，
并输出仅包含本次新增邮箱的 JSON 文件。
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

try:
    import fcntl
except Exception:
    fcntl = None

try:
    import pandas as pd
except Exception:
    pd = None


EMAIL_PATTERN = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
OFFSET_PATTERN = re.compile(r"[+-]?\d+(?:\.\d+)?")

def configure_io():
    # Force UTF-8 output to avoid GBK encoding errors on Windows consoles.
    for name in ("stdout", "stderr"):
        stream = getattr(sys, name)
        try:
            stream.reconfigure(encoding="utf-8")
            continue
        except Exception:
            pass
        try:
            import io

            wrapped = io.TextIOWrapper(stream.buffer, encoding="utf-8")
            setattr(sys, name, wrapped)
        except Exception:
            pass


def load_existing(json_path):
    if not os.path.exists(json_path):
        return {}
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError("teachers.json 不是 JSON 对象格式")
    return data


def read_excel(excel_path, sheet_name):
    if pd is None:
        print("❌ 缺少依赖 pandas。请先安装: python -m pip install pandas openpyxl")
        sys.exit(1)
    try:
        return pd.read_excel(excel_path, dtype=str, sheet_name=sheet_name)
    except ImportError as e:
        if "openpyxl" in str(e).lower():
            print("❌ 缺少 openpyxl。请先安装: python -m pip install openpyxl")
            sys.exit(1)
        raise


def read_csv(csv_path):
    if pd is None:
        print("❌ 缺少依赖 pandas。请先安装: python -m pip install pandas")
        sys.exit(1)
    try:
        return pd.read_csv(csv_path, dtype=str, encoding="utf-8-sig")
    except UnicodeDecodeError:
        return pd.read_csv(csv_path, dtype=str, encoding="gb18030")


def normalize_col(col):
    return str(col).strip()


def clean_text(value):
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() == "nan":
        return None
    return text


def extract_emails(cell):
    if cell is None:
        return []
    return [email.lower() for email in EMAIL_PATTERN.findall(str(cell))]


def parse_offset_hours(value):
    text = clean_text(value)
    if text is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    match = OFFSET_PATTERN.search(str(text))
    if not match:
        return 0.0
    try:
        return float(match.group(0))
    except ValueError:
        return 0.0


def normalize_name(value):
    text = clean_text(value)
    return text or ""


def get_entry_name(value):
    if isinstance(value, dict):
        return normalize_name(
            value.get("name") or value.get("surname") or value.get("teacher_name")
        )
    return normalize_name(value)


def get_entry_offset(value):
    if isinstance(value, dict):
        if "offset_hours" in value:
            return parse_offset_hours(value.get("offset_hours"))
        return parse_offset_hours(value.get("offset"))
    return 0.0


def normalize_entry(value):
    entry = {
        "name": get_entry_name(value),
        "offset_hours": get_entry_offset(value),
    }
    if isinstance(value, dict):
        assigned_account = value.get("assigned_account") or value.get("account")
        if assigned_account:
            entry["assigned_account"] = assigned_account
        send_at_bj = value.get("send_at_bj")
        if send_at_bj:
            entry["send_at_bj"] = send_at_bj
    return entry


def parse_base_time(value):
    if not value:
        return None
    text = value.strip()
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
    raise ValueError("无效的 base time 格式")


def compute_send_at_bj(base_dt, offset_hours):
    if base_dt is None:
        return None
    send_dt = base_dt - timedelta(hours=offset_hours)
    return send_dt.strftime("%Y-%m-%d %H:%M")


def sort_entries_by_offset(entries):
    def sort_key(item):
        _, value = item
        offset_hours = get_entry_offset(value)
        return -offset_hours

    return {email: value for email, value in sorted(entries.items(), key=sort_key)}


def parse_sheet_arg(value):
    if value is None:
        return 0
    try:
        return int(value)
    except ValueError:
        return value


def collect_input_files(path):
    if os.path.isdir(path):
        files = []
        for name in os.listdir(path):
            full_path = os.path.join(path, name)
            if not os.path.isfile(full_path):
                continue
            ext = os.path.splitext(name)[1].lower()
            if ext in (".csv", ".xlsx"):
                files.append(full_path)
        files.sort()
        return files
    if os.path.isfile(path):
        return [path]
    return []


def read_source_file(file_path, sheet_name):
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".csv":
        return read_csv(file_path)
    if ext == ".xlsx":
        return read_excel(file_path, sheet_name)
    raise ValueError(f"不支持的文件类型: {file_path}")


def write_json(json_path, data):
    os.makedirs(os.path.dirname(json_path) or ".", exist_ok=True)
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
        f.write("\n")


class FileLock:
    def __init__(self, lock_path):
        self.lock_path = lock_path
        self.handle = None

    def __enter__(self):
        if fcntl is None:
            return None
        os.makedirs(os.path.dirname(self.lock_path) or ".", exist_ok=True)
        self.handle = open(self.lock_path, "w", encoding="utf-8")
        fcntl.flock(self.handle, fcntl.LOCK_EX)
        return self.handle

    def __exit__(self, exc_type, exc, tb):
        if self.handle is not None:
            fcntl.flock(self.handle, fcntl.LOCK_UN)
            self.handle.close()


def main():
    configure_io()
    parser = argparse.ArgumentParser(description="导入导师邮箱和姓氏到 teachers.json")
    parser.add_argument(
        "--excel",
        default="data/original",
        help="Excel/CSV 文件路径或目录",
    )
    parser.add_argument(
        "--json",
        default="data/teachers.json",
        help="teachers.json 文件路径",
    )
    parser.add_argument(
        "--new-json",
        default="data/new_teachers.json",
        help="仅保存本次新增导师的 JSON 文件路径",
    )
    parser.add_argument(
        "--account",
        default=None,
        help="????????????????? assigned_account ??",
    )
    parser.add_argument(
        "--base-time",
        default=None,
        help="北京时间基准发送时间（YYYY-MM-DD HH:MM 或 MM.DD HH:MM）",
    )
    parser.add_argument(
        "--sheet",
        default=None,
        help="工作表名称或索引（默认第一个，适用于所有 Excel 文件）",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="若邮箱已存在，则用新姓氏覆盖",
    )
    parser.add_argument(
        "--send",
        action="store_true",
        help="仅发送本次新增导师（需要已配置邮箱信息）",
    )
    args = parser.parse_args()

    excel_path = args.excel
    json_path = args.json
    new_json_path = args.new_json
    account = args.account.strip() if args.account else None
    base_time_str = args.base_time or os.environ.get("BASE_SEND_AT")

    try:
        base_dt = parse_base_time(base_time_str)
    except ValueError as exc:
        print(f"❌ {exc}: {base_time_str}")
        return

    input_files = collect_input_files(excel_path)
    if not input_files:
        print(f"❌ 未找到可用的 Excel/CSV 文件: {excel_path}")
        sys.exit(1)

    sheet_name = parse_sheet_arg(args.sheet)
    extracted = {}
    required = ["姓氏", "作者邮箱"]
    offset_col_name = "与北京时间时差(小时)"

    print(f"📂 发现 {len(input_files)} 个数据文件")
    for file_path in input_files:
        df = read_source_file(file_path, sheet_name)

        col_map = {normalize_col(c): c for c in df.columns}
        missing = [c for c in required if c not in col_map]
        if missing:
            print(f"❌ 文件缺少列: {', '.join(missing)} -> {file_path}")
            print(f"已发现列: {', '.join(str(c) for c in df.columns)}")
            sys.exit(1)

        cols = [col_map["姓氏"], col_map["作者邮箱"]]
        has_offset = offset_col_name in col_map
        if has_offset:
            cols.append(col_map[offset_col_name])

        df = df[cols].copy()
        if has_offset:
            df.columns = ["surname", "email", "offset_hours"]
        else:
            df.columns = ["surname", "email"]

        for _, row in df.iterrows():
            surname = clean_text(row["surname"])
            if not surname:
                continue
            emails = extract_emails(row["email"])
            if not emails:
                continue
            offset_hours = parse_offset_hours(row["offset_hours"]) if has_offset else 0.0
            for email in emails:
                if email not in extracted:
                    extracted[email] = {
                        "name": surname,
                        "offset_hours": offset_hours,
                    }
                    if account:
                        extracted[email]["assigned_account"] = account

    lock_path = f"{json_path}.lock"
    with FileLock(lock_path):
        existing_raw = load_existing(json_path)
        existing = {email: normalize_entry(value) for email, value in existing_raw.items()}
        new_entries = {}

        added = 0
        updated = 0
        conflicts = []
        account_conflicts = []

        for email, info in extracted.items():
            incoming = normalize_entry(info)
            if base_dt is not None:
                incoming["send_at_bj"] = compute_send_at_bj(
                    base_dt, incoming.get("offset_hours", 0.0)
                )
            if email in existing:
                existing_entry = existing[email]
                existing_account = existing_entry.get("assigned_account")
                incoming_account = incoming.get("assigned_account") or account
                if incoming_account and existing_account and existing_account != incoming_account:
                    account_conflicts.append((email, existing_account, incoming_account))
                    continue
                existing_name = existing_entry.get("name", "")
                incoming_name = incoming.get("name", "")
                if existing_name == incoming_name:
                    existing_offset = existing_entry.get("offset_hours", 0.0)
                    incoming_offset = incoming.get("offset_hours", 0.0)
                    if existing_offset != incoming_offset and (
                        args.overwrite or incoming_offset != 0.0 or existing_offset == 0.0
                    ):
                        existing_entry["offset_hours"] = incoming_offset
                        updated += 1
                    if base_dt is not None and (
                        args.overwrite or not existing_entry.get("send_at_bj")
                    ):
                        existing_entry["send_at_bj"] = compute_send_at_bj(
                            base_dt, existing_entry.get("offset_hours", 0.0)
                        )
                    if incoming_account and not existing_entry.get("assigned_account"):
                        existing_entry["assigned_account"] = incoming_account
                        updated += 1
                    continue
                if args.overwrite:
                    existing[email] = incoming
                    updated += 1
                else:
                    conflicts.append((email, existing_name, incoming_name))
            else:
                new_entries[email] = incoming
                added += 1

        new_entries = sort_entries_by_offset(new_entries)
        merged = dict(existing)
        for email, info in new_entries.items():
            merged[email] = info

        if base_dt is not None:
            for entry in merged.values():
                if not entry.get("send_at_bj"):
                    entry["send_at_bj"] = compute_send_at_bj(
                        base_dt, entry.get("offset_hours", 0.0)
                    )

        write_json(json_path, merged)
        write_json(new_json_path, new_entries)

    print(f"✅ 新增 {added} 条，更新 {updated} 条，冲突 {len(conflicts)} 条")
    print(f"📄 本次新增 JSON 已保存: {new_json_path} (共 {len(new_entries)} 条)")
    if conflicts and not args.overwrite:
        print("⚠️ 发现邮箱已有不同姓氏，未覆盖。示例(最多5条):")
        for email, old, new in conflicts[:5]:
            print(f"  - {email}: '{old}' -> '{new}'")

    if account_conflicts:
        print("⚠️ 发现邮箱已绑定其他账号，已跳过。示例(最多5条):")
        for email, old_acc, new_acc in account_conflicts[:5]:
            print(f"  - {email}: {old_acc} -> {new_acc}")

    if args.send:
        if not new_entries:
            print("📭 本次没有新增导师，跳过发送")
            return
        from email_sender import EmailSender

        email_sender = EmailSender()
        email_sender.batch_send(new_entries)


if __name__ == "__main__":
    main()
