#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Send feedback email using a selected account.
"""

import argparse
import base64
import json
import os
import sys
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, formatdate

from email_sender import (
    apply_account_config,
    create_smtp_connection,
    get_gmail_http_proxies,
    get_gmail_tokens_dir,
    gmail_token_file_path,
    normalize_send_channel,
)


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


def read_message(args):
    if args.message_file:
        if not os.path.exists(args.message_file):
            raise FileNotFoundError(args.message_file)
        with open(args.message_file, "r", encoding="utf-8") as f:
            return f.read().strip()
    return (args.message or "").strip()


def load_feedback_receiver():
    base_dir = os.environ.get("MAILPILOT_BASE_DIR") or os.path.dirname(__file__)
    config_path = os.path.join(base_dir, "config", "announcement_config.json")
    if not os.path.exists(config_path):
        return ""
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
    except Exception:
        return ""
    host = config.get("host") or ""
    user = config.get("user") or ""
    password = config.get("password") or ""
    database = config.get("database") or ""
    port = int(config.get("port") or 3306)
    if not host or not user or not database:
        return ""
    try:
        import pymysql
    except Exception:
        return ""
    try:
        conn = pymysql.connect(
            host=host,
            user=user,
            password=password,
            database=database,
            port=port,
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
        )
        with conn.cursor() as cursor:
            cursor.execute("SELECT value FROM app_settings WHERE `key`='feedback_email' LIMIT 1")
            row = cursor.fetchone()
        return (row.get("value") or "").strip() if row else ""
    except Exception:
        return ""
    finally:
        try:
            conn.close()
        except Exception:
            pass


def load_gmail_credentials(sender_email):
    token_path = gmail_token_file_path(get_gmail_tokens_dir(), sender_email)
    if not os.path.exists(token_path):
        raise RuntimeError(f"Gmail OAuth token not found: {token_path}")

    with open(token_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    scopes = data.get("scopes") or ["https://www.googleapis.com/auth/gmail.send"]

    try:
        import requests
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
    except Exception as exc:
        raise RuntimeError(
            f"missing dependency: {exc}. "
            "pip install requests google-auth google-auth-oauthlib google-api-python-client"
        )

    creds = Credentials.from_authorized_user_info(data, scopes=scopes)
    if creds.expired and creds.refresh_token:
        session = requests.Session()
        session.trust_env = False
        proxies = get_gmail_http_proxies()
        if proxies:
            session.proxies.update(proxies)
        creds.refresh(Request(session=session))
        try:
            payload = json.loads(creds.to_json())
            payload["bound_email"] = data.get("bound_email", sender_email)
            payload["scopes"] = scopes
            os.makedirs(os.path.dirname(token_path), exist_ok=True)
            with open(token_path, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
        except Exception:
            pass
    return creds


def send_feedback_via_gmail_api(msg, sender_email):
    try:
        import requests
    except Exception as exc:
        raise RuntimeError(
            f"missing dependency: {exc}. "
            "pip install requests google-auth google-auth-oauthlib google-api-python-client"
        )

    creds = load_gmail_credentials(sender_email)
    raw_message = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")

    session = requests.Session()
    session.trust_env = False
    proxies = get_gmail_http_proxies()
    if proxies:
        session.proxies.update(proxies)

    response = session.post(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        headers={"Authorization": f"Bearer {creds.token}"},
        json={"raw": raw_message},
        timeout=30,
    )
    if not response.ok:
        detail = (response.text or "").strip()
        raise RuntimeError(f"HTTP {response.status_code}: {detail}")
    return "proxy" if proxies else "direct"



def main():
    parser = argparse.ArgumentParser(description="Send feedback email")
    parser.add_argument("--accounts", default="data/accounts.json", help="accounts.json path")
    parser.add_argument("--account", required=True, help="sender account email")
    parser.add_argument("--to", default="", help="feedback receiver email")
    parser.add_argument("--subject", default="Mailboat 问题反馈", help="email subject")
    parser.add_argument("--message", default="", help="feedback message")
    parser.add_argument("--message-file", default="", help="feedback message file path")
    parser.add_argument("--log", default=None, help="log file path")
    args = parser.parse_args()

    accounts = normalize_accounts(load_json(args.accounts))
    if not accounts:
        print("No accounts found in accounts.json")
        return 1

    target = (args.account or "").strip().lower()
    account = None
    for acc in accounts:
        if (acc.get("email") or "").strip().lower() == target:
            account = acc
            break
    if not account:
        print(f"Target account not found: {args.account}")
        return 1

    message = read_message(args)
    if not message:
        print("Message is empty")
        return 1

    to_email = (args.to or "").strip()
    if not to_email:
        to_email = load_feedback_receiver()
    if not to_email:
        print("Feedback receiver not configured in database")
        return 1

    if args.log:
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s - %(levelname)s - %(message)s",
            handlers=[logging.FileHandler(args.log, encoding="utf-8")],
        )

    apply_account_config(account, log_file=args.log)

    from email_sender import SENDER_EMAIL, SENDER_PASSWORD, SENDER_NAME  # noqa: E402

    msg = MIMEMultipart()
    sender_name = SENDER_NAME or SENDER_EMAIL
    msg["From"] = formataddr((sender_name, SENDER_EMAIL))
    msg["To"] = to_email
    msg["Subject"] = args.subject or "Mailboat 问题反馈"
    msg["Date"] = formatdate(localtime=True)

    html_body = f"<pre style=\"font-family:inherit;white-space:pre-wrap;\">{message}</pre>"
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    channel = normalize_send_channel(account.get("send_channel"))
    if channel == "gmail_api":
        route = send_feedback_via_gmail_api(msg, SENDER_EMAIL)
        print(f"反馈已发送[Gmail API route={route}]")
        if args.log:
            logging.info("Feedback sent to %s via Gmail API(route=%s)", to_email, route)
        return 0

    server = None
    try:
        server = create_smtp_connection(timeout=30)
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        server.send_message(msg)
        print(f"反馈已发送")
        if args.log:
            logging.info("Feedback sent to %s via SMTP", to_email)
        return 0
    finally:
        if server:
            try:
                server.quit()
            except Exception:
                try:
                    server.close()
                except Exception:
                    pass


if __name__ == "__main__":
    sys.exit(main())
