#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
邮件发送器模块
负责邮件的创建和发送
"""

import os
import json
import base64
import time
import random
import smtplib
import socket
import ssl
import logging
import threading
import re
import sys
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlparse
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from email.utils import formatdate
from config import *


class ProxyConfigError(Exception):
    """Raised when proxy configuration is invalid."""


def configure_io():
    # Avoid Windows GBK encoding errors on emoji output.
    for name in ("stdout", "stderr"):
        stream = getattr(sys, name)
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
            continue
        except Exception:
            pass
        try:
            import io

            wrapped = io.TextIOWrapper(stream.buffer, encoding="utf-8", errors="replace")
            setattr(sys, name, wrapped)
        except Exception:
            pass


def parse_send_at_bj(value):
    if not value:
        return None
    text = str(value).strip().replace("T", " ")
    if not text:
        return None
    tz = timezone(timedelta(hours=8))
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S"):
        try:
            dt = datetime.strptime(text, fmt)
            return dt.replace(tzinfo=tz)
        except ValueError:
            continue
    return None


def resolve_teacher_data_path():
    base_dir = os.environ.get("MAILPILOT_BASE_DIR")
    path = TEACHER_DATA_FILE
    if base_dir and path and not os.path.isabs(path):
        return os.path.join(base_dir, path)
    return path


def resolve_base_dir():
    base_dir = os.environ.get("MAILPILOT_BASE_DIR")
    if base_dir:
        return base_dir
    return os.path.dirname(os.path.abspath(__file__))


def get_gmail_tokens_dir():
    override = str(os.environ.get("MAILPILOT_GMAIL_TOKENS_DIR", "")).strip()
    if override:
        return override
    return os.path.join(resolve_base_dir(), "config", "gmail_tokens")


def gmail_token_file_stem(email: str) -> str:
    safe = email.strip().lower().replace("@", "_at_")
    safe = re.sub(r"[^a-z0-9._-]", "_", safe)
    return safe


def gmail_token_file_name(email: str) -> str:
    return f"token_{gmail_token_file_stem(email)}.json"


def legacy_gmail_token_file_name(email: str) -> str:
    return f"{gmail_token_file_stem(email)}.json"


def gmail_token_file_path(tokens_dir: str, email: str) -> str:
    primary = os.path.join(tokens_dir, gmail_token_file_name(email))
    if os.path.exists(primary):
        return primary
    legacy = os.path.join(tokens_dir, legacy_gmail_token_file_name(email))
    if os.path.exists(legacy):
        return legacy
    return primary


configure_io()

DEFAULT_FREE_DAILY_LIMIT = 20
try:
    DAILY_SEND_LIMIT = int(globals().get("DAILY_SEND_LIMIT", DEFAULT_FREE_DAILY_LIMIT))
except Exception:
    DAILY_SEND_LIMIT = DEFAULT_FREE_DAILY_LIMIT


def _is_local_proxy_listening(host, port, timeout=0.3):
    try:
        sock = socket.create_connection((host, port), timeout=timeout)
        sock.close()
        return True
    except Exception:
        return False


def get_proxy_url():
    if str(os.environ.get("SMTP_PROXY_DISABLED", "")).strip() in ("1", "true", "TRUE", "yes", "YES"):
        return None

    for key in (
        "SMTP_PROXY",
        "HTTP_PROXY",
        "http_proxy",
        "HTTPS_PROXY",
        "https_proxy",
        "ALL_PROXY",
        "all_proxy",
    ):
        value = os.environ.get(key)
        if value:
            return value

    # Fallback for desktop users running Clash in system mode where env vars
    # may be missing in Electron child processes.
    if _is_local_proxy_listening("127.0.0.1", 7890):
        return "http://127.0.0.1:7890"
    return None


def _sanitize_proxy_value(value):
    text = str(value or "").strip()
    if not text:
        return ""
    # Some environments accidentally inject broken values like ":9".
    if text.endswith(":9") or text.endswith(":9/"):
        return ""
    return text


def get_gmail_http_proxies():
    """
    Build HTTP(S) proxy config for Gmail API HTTP calls.
    This is intentionally independent from SMTP_PROXY_DISABLED so Gmail API
    can still use local Clash/system proxy when SMTP proxy is disabled.
    """
    https_proxy = ""
    http_proxy = ""

    for key in ("HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"):
        value = _sanitize_proxy_value(os.environ.get(key))
        if value:
            https_proxy = value
            break

    for key in ("HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"):
        value = _sanitize_proxy_value(os.environ.get(key))
        if value:
            http_proxy = value
            break

    if not https_proxy and not http_proxy and _is_local_proxy_listening("127.0.0.1", 7890):
        https_proxy = "http://127.0.0.1:7890"
        http_proxy = "http://127.0.0.1:7890"

    proxies = {}
    if https_proxy:
        proxies["https"] = https_proxy
    if http_proxy:
        proxies["http"] = http_proxy
    return proxies


def parse_http_proxy(proxy_url):
    parsed = urlparse(proxy_url)
    scheme = (parsed.scheme or "").lower()
    if scheme != "http":
        raise ProxyConfigError("Only http proxy is supported, e.g. http://127.0.0.1:7891")
    if not parsed.hostname:
        raise ProxyConfigError("Proxy host is missing")
    proxy_port = parsed.port or 80
    return parsed.hostname, proxy_port


class ProxySMTP_SSL(smtplib.SMTP_SSL):
    """SMTP over SSL via HTTP CONNECT proxy."""

    def __init__(self, proxy_url, *args, **kwargs):
        self._proxy_url = proxy_url
        super().__init__(*args, **kwargs)

    def _get_socket(self, host, port, timeout):
        if not self._proxy_url:
            return super()._get_socket(host, port, timeout)

        proxy_host, proxy_port = parse_http_proxy(self._proxy_url)
        sock = socket.create_connection((proxy_host, proxy_port), timeout=timeout)

        connect_target = f"{host}:{port}"
        request = (
            f"CONNECT {connect_target} HTTP/1.1\r\n"
            f"Host: {connect_target}\r\n"
            "Proxy-Connection: Keep-Alive\r\n"
            "\r\n"
        )
        sock.sendall(request.encode("ascii"))

        response = b""
        while b"\r\n\r\n" not in response and len(response) < 8192:
            chunk = sock.recv(4096)
            if not chunk:
                break
            response += chunk

        status_line = response.split(b"\r\n", 1)[0].decode("ascii", "ignore")
        if " 200 " not in status_line:
            sock.close()
            raise ProxyConfigError(f"Proxy CONNECT failed: {status_line}")

        return self.context.wrap_socket(sock, server_hostname=host)


class ProxySMTP(smtplib.SMTP):
    """SMTP over plain TCP via HTTP CONNECT proxy (for STARTTLS)."""

    def __init__(self, proxy_url, *args, **kwargs):
        self._proxy_url = proxy_url
        super().__init__(*args, **kwargs)

    def _get_socket(self, host, port, timeout):
        if not self._proxy_url:
            return super()._get_socket(host, port, timeout)

        proxy_host, proxy_port = parse_http_proxy(self._proxy_url)
        sock = socket.create_connection((proxy_host, proxy_port), timeout=timeout)

        connect_target = f"{host}:{port}"
        request = (
            f"CONNECT {connect_target} HTTP/1.1\r\n"
            f"Host: {connect_target}\r\n"
            "Proxy-Connection: Keep-Alive\r\n"
            "\r\n"
        )
        sock.sendall(request.encode("ascii"))

        response = b""
        while b"\r\n\r\n" not in response and len(response) < 8192:
            chunk = sock.recv(4096)
            if not chunk:
                break
            response += chunk

        status_line = response.split(b"\r\n", 1)[0].decode("ascii", "ignore")
        if " 200 " not in status_line:
            sock.close()
            raise ProxyConfigError(f"Proxy CONNECT failed: {status_line}")

        return sock


def _create_ssl_connection(server, port, timeout, proxy_url):
    if proxy_url:
        return ProxySMTP_SSL(proxy_url, server, port, timeout=timeout)
    return smtplib.SMTP_SSL(server, port, timeout=timeout)


def _create_starttls_connection(server, port, timeout, proxy_url):
    if proxy_url:
        smtp = ProxySMTP(proxy_url, server, port, timeout=timeout)
    else:
        smtp = smtplib.SMTP(server, port, timeout=timeout)
    smtp.ehlo()
    context = ssl.create_default_context()
    smtp.starttls(context=context)
    smtp.ehlo()
    return smtp


def create_smtp_connection(timeout=30, allow_port_fallback=True):
    proxy_url = get_proxy_url()

    if allow_port_fallback:
        if SMTP_PORT == 587:
            candidates = [("starttls", 587), ("ssl", 465)]
        elif SMTP_PORT == 465:
            candidates = [("ssl", 465), ("starttls", 587)]
        else:
            candidates = [("ssl", SMTP_PORT)]
    else:
        mode = "starttls" if SMTP_PORT == 587 else "ssl"
        candidates = [(mode, SMTP_PORT)]

    last_error = None
    for mode, port in candidates:
        try:
            if mode == "starttls":
                return _create_starttls_connection(SMTP_SERVER, port, timeout, proxy_url)
            return _create_ssl_connection(SMTP_SERVER, port, timeout, proxy_url)
        except Exception as exc:
            last_error = exc
            continue

    if last_error:
        raise last_error
    raise RuntimeError("Failed to create SMTP connection")


def apply_account_config(account, log_file=None):
    """Override sender configuration from an account dict."""
    if not account:
        return

    globals_map = globals()

    if account.get("email"):
        globals_map["SENDER_EMAIL"] = account["email"]
    if account.get("password"):
        globals_map["SENDER_PASSWORD"] = account["password"]
    if account.get("name"):
        globals_map["SENDER_NAME"] = account["name"]
    if account.get("smtp_server"):
        globals_map["SMTP_SERVER"] = account["smtp_server"]
    if account.get("smtp_port"):
        globals_map["SMTP_PORT"] = int(account["smtp_port"])
    if account.get("min_delay") is not None:
        globals_map["MIN_DELAY"] = int(account["min_delay"])
    if account.get("max_delay") is not None:
        globals_map["MAX_DELAY"] = int(account["max_delay"])
    if account.get("subject"):
        globals_map["EMAIL_SUBJECT"] = account["subject"]
    if account.get("content"):
        globals_map["EMAIL_CONTENT"] = account["content"]
    if account.get("attachments"):
        globals_map["ATTACHMENTS"] = list(account["attachments"])
    channel = str(account.get("send_channel") or "").strip().lower()
    if channel not in ("smtp", "gmail_api"):
        channel = "smtp"
    globals_map["SEND_CHANNEL"] = channel
    if log_file:
        globals_map["LOG_FILE"] = log_file


OFFSET_PATTERN = re.compile(r"[+-]?\d+(?:\.\d+)?")
SQL_IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def parse_offset_hours(value):
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text or text.lower() == "nan":
        return 0.0
    match = OFFSET_PATTERN.search(text)
    if not match:
        return 0.0
    try:
        return float(match.group(0))
    except ValueError:
        return 0.0


def normalize_send_channel(value):
    text = str(value or "").strip().lower()
    return "gmail_api" if text == "gmail_api" else "smtp"

class EmailSender:
    """邮件发送器类"""
    
    def __init__(self):
        self.success_count = 0
        self.fail_count = 0
        self.failed_emails = []
        self.sent_emails = set()  # 记录已发送的邮箱
        self._lock = threading.Lock()
        self.logger = logging.getLogger(__name__)
        self.send_channel = normalize_send_channel(globals().get("SEND_CHANNEL", "smtp"))
        self._teacher_data_path = resolve_teacher_data_path()
        self._teacher_cache = {"mtime": None, "emails": None}
        self._stats_sync_config = self._load_stats_sync_config()
        self._stats_sender_id_cache = {}
        self._stats_sync_warned = False
        self._stats_sync_lock = threading.Lock()
        self.daily_send_limit = self._resolve_daily_send_limit()
        self.daily_success_count = 0
        self._daily_limit_warned = False
        self._subscription_active = False


        # 配置日志
        self._setup_logging()

        # 加载已发送记录
        self._load_sent_records()
        self.daily_success_count = self._load_today_success_count()

    def _resolve_daily_send_limit(self):
        value = globals().get("DAILY_SEND_LIMIT", DEFAULT_FREE_DAILY_LIMIT)
        try:
            limit = int(value)
        except Exception:
            limit = DEFAULT_FREE_DAILY_LIMIT
        if limit <= 0:
            return None
        return limit

    def _load_teacher_set(self):
        path = self._teacher_data_path
        if not path or not os.path.exists(path):
            return None
        try:
            mtime = os.path.getmtime(path)
        except OSError:
            return self._teacher_cache.get("emails")
        cached_mtime = self._teacher_cache.get("mtime")
        cached_emails = self._teacher_cache.get("emails")
        if cached_mtime == mtime and cached_emails is not None:
            return cached_emails
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            emails = {str(email).lower() for email in data.keys()}
            self._teacher_cache = {"mtime": mtime, "emails": emails}
            return emails
        except Exception:
            return cached_emails

    def _is_teacher_active(self, email):
        emails = self._load_teacher_set()
        if emails is None:
            return True
        return str(email).lower() in emails

    def _load_stats_sync_config(self):
        user_id_text = str(os.environ.get("MAILPILOT_USER_ID", "")).strip()
        if not user_id_text:
            return None
        try:
            user_id = int(user_id_text)
        except ValueError:
            return None
        if user_id <= 0:
            return None

        host = str(os.environ.get("MAILPILOT_DB_HOST", "")).strip()
        user = str(os.environ.get("MAILPILOT_DB_USER", "")).strip()
        database = str(os.environ.get("MAILPILOT_DB_DATABASE", "")).strip()
        if not host or not user or not database:
            return None

        port_text = str(os.environ.get("MAILPILOT_DB_PORT", "3306")).strip()
        try:
            port = int(port_text)
        except ValueError:
            port = 3306

        sender_table = str(os.environ.get("MAILPILOT_DB_SENDER_TABLE", "sender_accounts")).strip()
        stats_table = str(os.environ.get("MAILPILOT_DB_STATS_TABLE", "sender_daily_stats")).strip()
        if not SQL_IDENTIFIER_PATTERN.match(sender_table):
            return None
        if not SQL_IDENTIFIER_PATTERN.match(stats_table):
            return None

        return {
            "user_id": user_id,
            "host": host,
            "port": port,
            "user": user,
            "password": str(os.environ.get("MAILPILOT_DB_PASSWORD", "")),
            "database": database,
            "sender_table": sender_table,
            "stats_table": stats_table,
        }

    def _load_today_success_count(self):
        snapshot = self._load_user_access_snapshot()
        if snapshot is not None:
            with self._lock:
                self.daily_send_limit = snapshot["daily_limit"]
                self._subscription_active = snapshot["subscription_active"]
            return max(int(snapshot["today_success"] or 0), 0)
        config = self._stats_sync_config
        if not config:
            return 0
        try:
            import pymysql

            stat_date = datetime.now(timezone(timedelta(hours=8))).date()
            conn = pymysql.connect(
                host=config["host"],
                port=config["port"],
                user=config["user"],
                password=config["password"],
                database=config["database"],
                charset="utf8mb4",
                cursorclass=pymysql.cursors.DictCursor,
                autocommit=True,
            )
            try:
                with conn.cursor() as cursor:
                    cursor.execute(
                        f"SELECT COALESCE(SUM(success_count), 0) AS total_success "
                        f"FROM {config['stats_table']} "
                        "WHERE user_id=%s AND stat_date=%s",
                        (config["user_id"], stat_date),
                    )
                    row = cursor.fetchone() or {}
                    value = int(row.get("total_success") or 0)
                    return max(value, 0)
            finally:
                conn.close()
        except Exception:
            return 0

    def _load_user_access_snapshot(self):
        config = self._stats_sync_config
        if not config:
            return None
        try:
            import pymysql

            today = datetime.now(timezone(timedelta(hours=8))).date()
            conn = pymysql.connect(
                host=config["host"],
                port=config["port"],
                user=config["user"],
                password=config["password"],
                database=config["database"],
                charset="utf8mb4",
                cursorclass=pymysql.cursors.DictCursor,
                autocommit=True,
            )
            try:
                with conn.cursor() as cursor:
                    cursor.execute(
                        "SELECT daily_total_limit, today_success_date, COALESCE(today_success_count, 0) AS today_success_count, "
                        "membership_status, subscription_expire_at "
                        "FROM app_users WHERE id=%s LIMIT 1",
                        (config["user_id"],),
                    )
                    row = cursor.fetchone() or {}
            finally:
                conn.close()
        except Exception:
            return None

        daily_limit = int(row.get("daily_total_limit") or DEFAULT_FREE_DAILY_LIMIT or 20)
        if daily_limit <= 0:
            daily_limit = DEFAULT_FREE_DAILY_LIMIT or 20

        today_success = 0
        snapshot_date = row.get("today_success_date")
        if snapshot_date and str(snapshot_date) == str(today):
            today_success = max(int(row.get("today_success_count") or 0), 0)

        expire_at_text = str(row.get("subscription_expire_at") or "").strip()
        membership_status = str(row.get("membership_status") or "").strip().lower() or "inactive"
        subscription_active = False
        if expire_at_text:
            try:
                expire_at = datetime.fromisoformat(expire_at_text)
                if expire_at.tzinfo is None:
                    expire_at = expire_at.replace(tzinfo=timezone.utc).astimezone()
                subscription_active = expire_at.astimezone() > datetime.now(timezone.utc).astimezone()
            except Exception:
                subscription_active = membership_status == "active"
        else:
            subscription_active = membership_status == "active"

        return {
            "daily_limit": daily_limit,
            "today_success": today_success,
            "subscription_active": subscription_active,
            "membership_status": "active" if subscription_active else membership_status,
            "subscription_expire_at": expire_at_text,
        }

    def _daily_remaining_quota(self):
        limit = self.daily_send_limit
        if limit is None:
            return None
        if self._stats_sync_config:
            refreshed = self._load_today_success_count()
            with self._lock:
                subscription_active = bool(self._subscription_active)
            with self._lock:
                # Keep local value monotonic in case DB write is slightly delayed.
                self.daily_success_count = max(int(self.daily_success_count or 0), int(refreshed or 0))
            if subscription_active:
                return None
        with self._lock:
            used = int(self.daily_success_count or 0)
        return max(limit - used, 0)

    def _warn_daily_limit_reached(self):
        limit = self.daily_send_limit
        if limit is None:
            return
        message = (
            f"user daily free total quota reached: {limit}/day. "
            "please contact support for upgrade."
        )
        if not self._daily_limit_warned:
            self._daily_limit_warned = True
            self.logger.warning(message)
        print(f"⛔ 已达到用户每日免费总发送上限（{limit} 封），请联系客服升级。")

    def _get_sender_account_id(self, sender_email):
        config = self._stats_sync_config
        if not config or not sender_email:
            return None
        key = str(sender_email).strip().lower()
        if not key:
            return None

        with self._stats_sync_lock:
            if key in self._stats_sender_id_cache:
                return self._stats_sender_id_cache[key]

        import pymysql

        conn = pymysql.connect(
            host=config["host"],
            port=config["port"],
            user=config["user"],
            password=config["password"],
            database=config["database"],
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=True,
        )
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    f"SELECT id FROM {config['sender_table']} "
                    "WHERE user_id=%s AND LOWER(sender_email)=LOWER(%s) LIMIT 1",
                    (config["user_id"], key),
                )
                row = cursor.fetchone()
                sender_id = row["id"] if row and "id" in row else None
        finally:
            conn.close()

        if sender_id is not None:
            with self._stats_sync_lock:
                self._stats_sender_id_cache[key] = sender_id
        return sender_id

    def _sync_sender_daily_stats(self):
        config = self._stats_sync_config
        if not config:
            return
        sender_email = str(globals().get("SENDER_EMAIL", "")).strip()
        if not sender_email:
            return

        try:
            sender_id = self._get_sender_account_id(sender_email)
            if not sender_id:
                return

            import pymysql

            stat_date = datetime.now(timezone(timedelta(hours=8))).date()
            conn = pymysql.connect(
                host=config["host"],
                port=config["port"],
                user=config["user"],
                password=config["password"],
                database=config["database"],
                charset="utf8mb4",
                cursorclass=pymysql.cursors.DictCursor,
                autocommit=True,
            )
            try:
                with conn.cursor() as cursor:
                    cursor.execute(
                        f"INSERT INTO {config['stats_table']} "
                        "(user_id, sender_account_id, stat_date, success_count) "
                        "VALUES (%s, %s, %s, %s) "
                        "ON DUPLICATE KEY UPDATE success_count = success_count + 1",
                        (config["user_id"], sender_id, stat_date, 1),
                    )
            finally:
                conn.close()
        except Exception as exc:
            if not self._stats_sync_warned:
                self._stats_sync_warned = True
                self.logger.warning(f"daily stats sync failed: {exc}")

    def _setup_logging(self):
        """设置日志配置"""
        # 创建文件处理器，强制刷新缓冲区
        file_handler = logging.FileHandler(LOG_FILE, encoding='utf-8')
        file_handler.setLevel(logging.INFO)

        # 创建控制台处理器
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)

        # 设置格式
        formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        file_handler.setFormatter(formatter)
        console_handler.setFormatter(formatter)

        # 配置根日志记录器
        logging.basicConfig(
            level=logging.INFO,
            handlers=[file_handler, console_handler],
            force=True  # 强制重新配置
        )

        # 确保日志立即刷新
        for handler in logging.getLogger().handlers:
            if hasattr(handler, 'flush'):
                handler.flush()

    def flush_logs(self):
        """强制刷新所有日志处理器"""
        for handler in logging.getLogger().handlers:
            if hasattr(handler, 'flush'):
                handler.flush()

    def _load_sent_records(self):
        """Load historical sent-email records from log file."""
        if not os.path.exists(LOG_FILE):
            return

        marker_cn = "\u53d1\u9001\u6210\u529f\u7ed9"
        marker_en = "gmail api send success to"
        email_in_parentheses = re.compile(r"\(([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\)")
        email_anywhere = re.compile(r"([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})")

        try:
            with open(LOG_FILE, 'r', encoding='utf-8') as f:
                for line in f:
                    if '@' not in line:
                        continue
                    line_lower = line.lower()
                    if marker_cn not in line and marker_en not in line_lower:
                        continue

                    match = email_in_parentheses.search(line)
                    if match:
                        self.sent_emails.add(match.group(1).strip().lower())
                        continue

                    fallback = email_anywhere.search(line)
                    if fallback:
                        self.sent_emails.add(fallback.group(1).strip().lower())

            if self.sent_emails:
                self.logger.info(f"loaded sent records: {len(self.sent_emails)}")
        except Exception as e:
            self.logger.warning(f"failed to load sent records: {e}")

    def is_already_sent(self, email):
        """检查邮箱是否已经发送过"""
        with self._lock:
            return email in self.sent_emails

    def mark_as_sent(self, email):
        """标记邮箱为已发送"""
        with self._lock:
            self.sent_emails.add(email)

    def _record_success(self, email):
        with self._lock:
            self.sent_emails.add(email)
            self.success_count += 1
            if self.daily_send_limit is not None:
                self.daily_success_count += 1
        self._sync_sender_daily_stats()

    def _record_failure(self, email, name, error_msg):
        with self._lock:
            self.fail_count += 1
            self.failed_emails.append((email, name, error_msg))

    def _now_bj_text(self):
        bj = datetime.now(timezone(timedelta(hours=8)))
        return bj.strftime("%Y-%m-%d %H:%M:%S")

    def _normalize_teacher_entries(self, teacher_data):
        entries = []
        for email, value in teacher_data.items():
            send_at_bj = None
            if isinstance(value, dict):
                name = (
                    value.get("name")
                    or value.get("surname")
                    or value.get("teacher_name")
                    or ""
                )
                offset_hours = parse_offset_hours(
                    value.get("offset_hours")
                    if "offset_hours" in value
                    else value.get("offset")
                )
                send_at_bj = value.get("send_at_bj")
            else:
                name = value
                offset_hours = 0.0
            entries.append(
                {
                    "email": email,
                    "name": name,
                    "offset_hours": offset_hours,
                    "send_at_bj": send_at_bj,
                }
            )
        return entries

    def get_sent_summary(self):
        """获取已发送邮箱的摘要信息"""
        with self._lock:
            if not self.sent_emails:
                return "📭 暂无已发送记录"

        with self._lock:
            sent_emails = sorted(self.sent_emails)
        summary = f"📋 已发送邮箱列表 (共 {len(sent_emails)} 个):\n"
        summary += "=" * 50 + "\n"

        for i, email in enumerate(sent_emails, 1):
            summary += f"{i:3d}. {email}\n"

        return summary
    
    def create_email_content(self, teacher_name):
        """
        创建邮件正文内容

        Args:
            teacher_name (str): 导师姓名

        Returns:
            str: 邮件正文（HTML格式）
        """
        # 获取原始文本内容
        text_content = EMAIL_CONTENT.format(teacher_name=teacher_name)

        # 转换为HTML格式
        html_content = self.convert_text_to_html(text_content)

        return html_content

    def convert_text_to_html(self, text_content):
        """
        将纯文本转换为HTML格式，优化段落间距

        Args:
            text_content (str): 纯文本内容

        Returns:
            str: HTML格式内容
        """
        # 分割段落
        paragraphs = text_content.split('\n')
        html_paragraphs = []

        signature_started = False

        for paragraph in paragraphs:
            # 先检查是否以全角空格开头（首行缩进标识），再进行strip
            has_indent = paragraph.startswith('　　')
            paragraph_stripped = paragraph.strip()

            if not paragraph_stripped:
                # 空行跳过，不添加额外间距
                continue
            elif paragraph_stripped.startswith('尊敬的') and paragraph_stripped.endswith('：'):
                # 称呼部分
                html_paragraphs.append(f'<p style="margin: 0 0 16px 0; line-height: 1.5;">{paragraph_stripped}</p>')
            elif has_indent:
                # 正文段落，使用正常的段落间距和首行缩进
                # 移除开头的两个全角空格，用CSS text-indent实现缩进
                content = paragraph.lstrip('　').strip()
                html_paragraphs.append(f'<p style="margin: 0 0 16px 0; line-height: 1.8; text-indent: 2em;">{content}</p>')
            elif '学生魏中信' in paragraph_stripped or '2025年' in paragraph_stripped or signature_started:
                # 签名部分开始
                if not signature_started:
                    signature_started = True
                    html_paragraphs.append('<div style="text-align: right; margin-top: 30px; line-height: 1.5;">')

                # 处理签名内容
                if paragraph_stripped:
                    html_paragraphs.append(f'<div style="margin-bottom: 5px;">{paragraph_stripped}</div>')
            else:
                # 其他内容
                html_paragraphs.append(f'<p style="margin: 0 0 16px 0; line-height: 1.5;">{paragraph_stripped}</p>')

        # 如果有签名部分，关闭div
        if signature_started:
            html_paragraphs.append('</div>')

        # 组合HTML内容
        html_body = f'''
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{
                    font-family: "Microsoft YaHei", "SimSun", Arial, sans-serif;
                    font-size: 14px;
                    color: #333;
                    line-height: 1.6;
                    margin: 0;
                    padding: 20px;
                    max-width: 1225px;
                }}
            </style>
        </head>
        <body>
            {''.join(html_paragraphs)}
        </body>
        </html>
        '''

        return html_body

    def setup_email_headers(self, msg, teacher_email):
        """
        设置邮件头，确保格式正确避免被拒收

        Args:
            msg: 邮件对象
            teacher_email (str): 收件人邮箱
        """
        # 使用最简单的格式设置邮件头
        msg['From'] = SENDER_EMAIL
        msg['To'] = teacher_email
        msg['Subject'] = EMAIL_SUBJECT

        # 添加一些标准邮件头，提高送达率
        msg['Message-ID'] = f"<{int(time.time() * 1000000)}@{SENDER_EMAIL.split('@')[1]}>"
        msg['Date'] = formatdate(localtime=True)
        msg['MIME-Version'] = '1.0'
    
    def add_attachments(self, msg):
        """
        添加附件到邮件

        Args:
            msg: 邮件对象
        """
        import mimetypes

        for attachment_path in ATTACHMENTS:
            if os.path.exists(attachment_path):
                try:
                    # 获取文件的MIME类型
                    mime_type, _ = mimetypes.guess_type(attachment_path)
                    if mime_type is None:
                        mime_type = 'application/octet-stream'

                    main_type, sub_type = mime_type.split('/', 1)

                    with open(attachment_path, 'rb') as attachment:
                        part = MIMEBase(main_type, sub_type)
                        part.set_payload(attachment.read())
                        encoders.encode_base64(part)

                        # 正确设置文件名，避免中文乱码
                        filename = os.path.basename(attachment_path)
                        # 使用RFC2231编码处理中文文件名
                        from email.header import Header
                        from urllib.parse import quote

                        # 对文件名进行URL编码
                        encoded_filename = quote(filename.encode('utf-8'))

                        part.add_header(
                            'Content-Disposition',
                            f'attachment; filename*=UTF-8\'\'{encoded_filename}'
                        )
                        msg.attach(part)
                    # 静默记录附件添加信息到日志
                    self.logger.debug(f"已添加附件: {attachment_path} (类型: {mime_type})")
                except Exception as e:
                    self.logger.warning(f"添加附件失败 {attachment_path}: {e}")
            else:
                self.logger.warning(f"附件文件不存在: {attachment_path}")
                print(f"⚠️  警告: 附件文件不存在: {attachment_path}")
    
    def _load_gmail_credentials(self):
        token_path = gmail_token_file_path(get_gmail_tokens_dir(), SENDER_EMAIL)
        if not os.path.exists(token_path):
            raise RuntimeError(f"Gmail OAuth token not found: {token_path}")

        with open(token_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        scopes = data.get("scopes") or ["https://www.googleapis.com/auth/gmail.send"]

        try:
            from google.oauth2.credentials import Credentials
            from google.auth.transport.requests import Request
        except Exception as exc:
            raise RuntimeError(
                f"missing dependency: {exc}. "
                "pip install google-auth google-auth-oauthlib google-api-python-client"
            )

        creds = Credentials.from_authorized_user_info(data, scopes=scopes)
        if creds.expired and creds.refresh_token:
            session, _ = self._build_gmail_http_session()
            creds.refresh(Request(session=session))
            try:
                payload = json.loads(creds.to_json())
                payload["bound_email"] = data.get("bound_email", SENDER_EMAIL)
                payload["scopes"] = scopes
                os.makedirs(os.path.dirname(token_path), exist_ok=True)
                with open(token_path, "w", encoding="utf-8") as f:
                    json.dump(payload, f, ensure_ascii=False, indent=2)
            except Exception:
                pass
        return creds

    def _build_gmail_http_session(self):
        try:
            import requests
        except Exception as exc:
            raise RuntimeError(
                f"missing dependency: {exc}. "
                "pip install requests google-auth google-auth-oauthlib google-api-python-client"
            )

        session = requests.Session()
        # Keep behavior deterministic and consistent with local test script.
        session.trust_env = False
        proxies = get_gmail_http_proxies()
        if proxies:
            session.proxies.update(proxies)
        return session, proxies

    def _send_gmail_message_http(self, creds, raw_message):
        session, proxies = self._build_gmail_http_session()
        response = session.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            headers={"Authorization": f"Bearer {creds.token}"},
            json={"raw": raw_message},
            timeout=30,
        )
        if not response.ok:
            detail = (response.text or "").strip()
            raise RuntimeError(f"HTTP {response.status_code}: {detail}")
        try:
            payload = response.json()
        except Exception:
            payload = {}
        route = "proxy" if proxies else "direct"
        return payload, route

    def _build_gmail_service(self, creds):
        try:
            from googleapiclient.discovery import build
        except Exception as exc:
            raise RuntimeError(
                f"missing dependency: {exc}. "
                "pip install google-auth google-auth-oauthlib google-api-python-client"
            )
        return build("gmail", "v1", credentials=creds, cache_discovery=False)

    def send_single_email_gmail_api(self, teacher_email, teacher_name, retry_count=5):
        for attempt in range(retry_count):
            try:
                if attempt > 0:
                    print(f"Retry Gmail API send ({attempt + 1}/{retry_count}) ...")
                    time.sleep(2)

                msg = MIMEMultipart()
                self.setup_email_headers(msg, teacher_email)
                html_body = self.create_email_content(teacher_name)
                msg.attach(MIMEText(html_body, 'html', 'utf-8'))
                self.add_attachments(msg)

                creds = self._load_gmail_credentials()
                raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
                _, route = self._send_gmail_message_http(creds, raw)

                self.logger.info(
                    f"✅ 发送成功给 {teacher_name}({teacher_email}) [Gmail API route={route}]"
                )
                self.flush_logs()
                self._record_success(teacher_email)
                print(f"[success_at_bj] {self._now_bj_text()} {teacher_email}")
                return True

            except Exception as e:
                error_msg = str(e)
                lower = error_msg.lower()
                auth_error = (
                    "invalid_grant" in lower
                    or "unauthorized" in lower
                    or "forbidden" in lower
                    or "oauth" in lower
                    or "token" in lower
                    or "credential" in lower
                    or "http 401" in lower
                    or "http 403" in lower
                )
                if auth_error:
                    self.logger.error(f"Gmail API auth error: {error_msg}")
                    self.flush_logs()
                    self._record_failure(teacher_email, teacher_name, error_msg)
                    return False
                if attempt < retry_count - 1:
                    self.logger.warning(
                        f"Gmail API network issue, retrying: {error_msg} ({attempt + 1}/{retry_count})"
                    )
                    time.sleep(3)
                    continue
                self.logger.error(f"Gmail API send failed: {error_msg}")
                self._record_failure(teacher_email, teacher_name, error_msg)
                return False

    def send_single_email(self, teacher_email, teacher_name, retry_count=10):
        """
        发送单封邮件，支持重试机制

        Args:
            teacher_email (str): 导师邮箱
            teacher_name (str): 导师姓名
            retry_count (int): 重试次数

        Returns:
            bool: 发送是否成功
        """
        if self.send_channel == "gmail_api":
            return self.send_single_email_gmail_api(
                teacher_email,
                teacher_name,
                retry_count=retry_count,
            )
        for attempt in range(retry_count):
            try:
                # 重试时显示提示
                if attempt > 0:
                    print(f"🔄 第 {attempt + 1} 次尝试发送...")
                    time.sleep(2)  # 重试前等待2秒
                # 创建邮件对象
                msg = MIMEMultipart()

                # 设置邮件头
                self.setup_email_headers(msg, teacher_email)

                # 添加邮件正文（HTML格式）
                html_body = self.create_email_content(teacher_name)
                msg.attach(MIMEText(html_body, 'html', 'utf-8'))

                # 添加附件
                self.add_attachments(msg)

                # 连接SMTP服务器并发送邮件，设置超时和强制关闭
                server = None
                try:
                    server = create_smtp_connection(timeout=30)
                    server.login(SENDER_EMAIL, SENDER_PASSWORD)
                    # 使用send_message方法，让服务器自动处理邮件头
                    result = server.send_message(msg)
                    # send_message返回的是被拒绝的收件人字典，空字典表示全部成功
                    if result:
                        # 如果有被拒绝的收件人，记录但不抛出异常
                        self.logger.warning(f"部分收件人被拒绝: {result}")
                        print(f"⚠️  部分收件人被拒绝")
                    else:
                        # 全部成功
                        pass
                finally:
                    # 确保连接被关闭
                    if server:
                        try:
                            server.quit()
                        except:
                            try:
                                server.close()
                            except:
                                pass

                # 记录发送成功，包含具体老师信息
                self.logger.info(f"✅ 发送成功给 {teacher_name}({teacher_email})")
                self.flush_logs()  # 强制刷新日志
                self._record_success(teacher_email)
                print(f"[success_at_bj] {self._now_bj_text()} {teacher_email}")
                return True

            except ProxyConfigError as e:
                error_msg = f"Proxy config error: {e}"
                self.logger.error(f"❌ 发送失败: {error_msg}")
                self.flush_logs()
                self._record_failure(teacher_email, teacher_name, error_msg)
                return False

            except smtplib.SMTPAuthenticationError as e:
                error_msg = f"SMTP认证失败: {e}"
                self.logger.error(f"❌ 发送失败: 请检查邮箱和授权码")
                self.flush_logs()  # 强制刷新日志
                # 认证失败不重试
                self._record_failure(teacher_email, teacher_name, error_msg)
                return False

            except smtplib.SMTPRecipientsRefused as e:
                error_msg = f"收件人被拒绝: {e}"
                self.logger.error(f"❌ 发送失败: 收件人邮箱无效")
                # 收件人问题不重试
                self._record_failure(teacher_email, teacher_name, error_msg)
                return False

            except (smtplib.SMTPServerDisconnected, smtplib.SMTPConnectError, OSError) as e:
                # 网络连接相关错误，可以重试
                error_msg = f"网络连接错误: {e}"
                if attempt < retry_count - 1:
                    self.logger.warning(f"⚠️  网络连接问题，将重试 (尝试 {attempt + 1}/{retry_count})")
                    time.sleep(5)  # 等待5秒后重试
                    continue
                else:
                    self.logger.error(f"❌ 发送失败: 网络连接问题，已重试 {retry_count} 次")
                    self._record_failure(teacher_email, teacher_name, error_msg)
                    return False

            except smtplib.SMTPDataError as e:
                error_msg = f"邮件数据错误: {e}"
                self.logger.error(f"❌ 发送失败: 邮件格式问题")
                # 数据格式问题不重试
                self._record_failure(teacher_email, teacher_name, error_msg)
                return False

            except Exception as e:
                error_msg = str(e)
                # 检查是否是成功的SMTP响应被误判为异常
                if "250" in error_msg and ("Mail OK" in error_msg or "queued" in error_msg):
                    # 这实际上是成功的响应
                    self.logger.info(f"✅ 发送成功给 {teacher_name}({teacher_email})")
                    self._record_success(teacher_email)
                    print(f"[success_at_bj] {self._now_bj_text()} {teacher_email}")
                    return True
                else:
                    # 其他未知错误，可以重试
                    if attempt < retry_count - 1:
                        self.logger.warning(f"⚠️  未知错误，将重试: {error_msg} (尝试 {attempt + 1}/{retry_count})")
                        time.sleep(3)  # 等待3秒后重试
                        continue
                    else:
                        self.logger.error(f"❌ 发送失败: {error_msg}")
                        self._record_failure(teacher_email, teacher_name, error_msg)
                        return False

        # 如果所有重试都失败了
        self.logger.error(f"❌ 发送失败: 已重试 {retry_count} 次，仍然失败")
        self._record_failure(teacher_email, teacher_name, "重试次数已用完")
        return False
    
    def batch_send(self, teacher_data, base_epoch=None):
        """
        批量发送邮件

        Args:
            teacher_data (dict): 导师数据 {email: name}
            base_epoch (float|None): 北京时间基准时间戳（用于按时区差值调度）
        """
        print("\n🚀 开始发送邮件...")
        print("="*50)
        
        teacher_entries = self._normalize_teacher_entries(teacher_data)
        schedule_enabled = False

        for entry in teacher_entries:
            send_epoch = None
            send_at_bj = entry.get("send_at_bj")
            if send_at_bj:
                parsed = parse_send_at_bj(send_at_bj)
                if parsed is not None:
                    send_epoch = parsed.timestamp()
            if send_epoch is None and base_epoch is not None:
                send_epoch = base_epoch - entry["offset_hours"] * 3600
            if send_epoch is not None:
                entry["send_epoch"] = send_epoch
                schedule_enabled = True

        if schedule_enabled:
            teacher_entries.sort(key=lambda e: e.get("send_epoch", 0))
        
        total_count = len(teacher_entries)
        
        # 统计跳过的邮件数量
        skipped_count = 0

        max_concurrent = MAX_CONCURRENT_SEND
        if max_concurrent is None:
            max_concurrent = 1

        if schedule_enabled and max_concurrent != 1:
            self.logger.info("检测到时区调度，强制使用顺序发送以保证间隔")
            max_concurrent = 1

        if max_concurrent != 1:
            to_send = []
            for i, entry in enumerate(teacher_entries, 1):
                email = entry["email"]
                name = entry["name"]
                teacher_name = name

                if not self._is_teacher_active(email):
                    print(f"[{i}/{total_count}] ⏭️  跳过 {teacher_name}({email}) - 已从导师库删除")
                    skipped_count += 1
                    continue

                if self.is_already_sent(email):
                    print(f"[{i}/{total_count}] ⏭️  跳过 {teacher_name}({email}) - 已发送过")
                    skipped_count += 1
                    continue

                print(f"[{i}/{total_count}] 正在发送给 {teacher_name}({email}) ... ")
                to_send.append((email, teacher_name))

            remaining_quota = self._daily_remaining_quota()
            if remaining_quota is not None:
                if remaining_quota <= 0:
                    skipped_count += len(to_send)
                    self._warn_daily_limit_reached()
                    self.print_summary(skipped_count)
                    return
                if len(to_send) > remaining_quota:
                    overflow = len(to_send) - remaining_quota
                    to_send = to_send[:remaining_quota]
                    skipped_count += overflow
                    print(
                        f"⚠️ 用户每日免费总发送上限 {self.daily_send_limit} 封，"
                        f"本次仅发送 {remaining_quota} 封，其余 {overflow} 封已跳过。"
                    )

            if not to_send:
                self.print_summary(skipped_count)
                return

            max_workers = max_concurrent
            if max_workers <= 0:
                max_workers = len(to_send)
            max_workers = min(max_workers, len(to_send))

            print(f"🧵 并发发送开启，最大并发: {max_workers}")

            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = [executor.submit(self.send_single_email, email, teacher_name) for email, teacher_name in to_send]
                for future in as_completed(futures):
                    try:
                        success = future.result()
                        if not success:
                            print("❌ 发送失败，继续下一封邮件")
                    except Exception as e:
                        print(f"❌ 发送过程中出现异常: {e}")
                        self.logger.error(f"发送异常: {e}")

            self.print_summary(skipped_count)
            return

        for i, entry in enumerate(teacher_entries, 1):
            # 处理导师姓名
            email = entry["email"]
            name = entry["name"]
            teacher_name = name

            if not self._is_teacher_active(email):
                print(f"[{i}/{total_count}] ⏭️  跳过 {teacher_name}({email}) - 已从导师库删除")
                skipped_count += 1
                continue

            # 检查是否已经发送过
            if self.is_already_sent(email):
                print(f"[{i}/{total_count}] ⏭️  跳过 {teacher_name}({email}) - 已发送过")
                skipped_count += 1
                continue

            remaining_quota = self._daily_remaining_quota()
            if remaining_quota is not None and remaining_quota <= 0:
                skipped_count += (total_count - i + 1)
                self._warn_daily_limit_reached()
                break

            if schedule_enabled and entry.get("send_epoch") is not None:
                wait_seconds = entry["send_epoch"] - time.time()
                if wait_seconds > 0:
                    print(f"⏳ 等待 {int(wait_seconds)} 秒直到该时区发送时间...")
                    time.sleep(wait_seconds)

            print(f"[{i}/{total_count}] 正在发送给 {teacher_name}({email}) ... ")

            # 发送邮件，添加超时保护
            try:
                success = self.send_single_email(email, teacher_name)
                if not success:
                    print(f"❌ 发送失败，继续下一封邮件")
            except Exception as e:
                print(f"❌ 发送过程中出现异常: {e}")
                self.logger.error(f"发送异常: {e}")

            # 如果不是最后一封邮件，则等待随机时间（分段等待，避免长时间挂起）
            if i < total_count:
                delay = random.randint(MIN_DELAY, MAX_DELAY)
                print(f"⏳ 等待 {delay} 秒后发送下一封...")

                # 分段等待，每5秒检查一次，避免长时间挂起
                remaining_time = delay
                while remaining_time > 0:
                    sleep_time = min(5, remaining_time)
                    time.sleep(sleep_time)
                    remaining_time -= sleep_time
                    if remaining_time > 0:
                        print(f"⏳ 还需等待 {remaining_time} 秒...")
        
        # 输出发送统计
        self.print_summary(skipped_count)
    
    def print_summary(self, skipped_count=0):
        """打印发送统计信息"""
        with self._lock:
            success_count = self.success_count
            fail_count = self.fail_count
            sent_count = len(self.sent_emails)
            failed_emails = list(self.failed_emails)

        total_count = success_count + fail_count

        print("\n" + "="*50)
        print("📊 发送完成统计")
        print("="*50)
        print(f"✅ 成功发送: {success_count} 封")
        print(f"❌ 发送失败: {fail_count} 封")
        if skipped_count > 0:
            print(f"⏭️  跳过已发送: {skipped_count} 封")
        print(f"📧 本次处理: {total_count} 封")
        print(f"📋 总已发送: {sent_count} 封")

        if total_count > 0:
            success_rate = success_count / total_count * 100
            print(f"📈 本次成功率: {success_rate:.1f}%")
        
        if failed_emails:
            print(f"\n❌ 发送失败的邮件:")
            for email, name, error in failed_emails:
                print(f"  - {name} ({email}): {error}")
        
        print("="*50)
        print(f"📝 详细日志已保存到 {LOG_FILE}")
        
        # 记录统计信息到日志
        self.logger.info(f"发送统计 - 成功: {success_count}, 失败: {fail_count}, 跳过: {skipped_count}, 本次处理: {total_count}, 总已发送: {sent_count}")
    
    def test_connection(self):
        """
        测试SMTP连接
        
        Returns:
            bool: 连接是否成功
        """
        try:
            server = create_smtp_connection(timeout=30)
            try:
                server.login(SENDER_EMAIL, SENDER_PASSWORD)
            finally:
                try:
                    server.quit()
                except Exception:
                    server.close()
            print("✅ SMTP连接测试成功")
            return True
        except Exception as e:
            print(f"❌ SMTP连接测试失败: {e}")
            return False
