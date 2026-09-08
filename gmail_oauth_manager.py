#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Manage Gmail OAuth token files for desktop app accounts.
"""

import argparse
import json
import os
import re
import sys
from typing import Any


def print_json(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def is_gmail_address(email: str) -> bool:
    if "@" not in email:
        return False
    domain = email.rsplit("@", 1)[1].lower()
    return domain in ("gmail.com", "googlemail.com")


def token_file_stem(email: str) -> str:
    safe = email.strip().lower().replace("@", "_at_")
    safe = re.sub(r"[^a-z0-9._-]", "_", safe)
    return safe


def token_file_name(email: str) -> str:
    return f"token_{token_file_stem(email)}.json"


def legacy_token_file_name(email: str) -> str:
    return f"{token_file_stem(email)}.json"


def token_file_path(tokens_dir: str, email: str) -> str:
    return os.path.join(tokens_dir, token_file_name(email))


def legacy_token_file_path(tokens_dir: str, email: str) -> str:
    return os.path.join(tokens_dir, legacy_token_file_name(email))


def resolve_existing_token_path(tokens_dir: str, email: str) -> str:
    primary = token_file_path(tokens_dir, email)
    if os.path.exists(primary):
        return primary
    legacy = legacy_token_file_path(tokens_dir, email)
    if os.path.exists(legacy):
        return legacy
    return primary


def validate_credentials_file(credentials_path: str) -> tuple[bool, str]:
    if not os.path.exists(credentials_path):
        return False, f"credentials file not found: {credentials_path}"
    try:
        with open(credentials_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as exc:  # pragma: no cover - defensive parsing
        return False, f"credentials json parse failed: {exc}"

    if not isinstance(data, dict) or ("installed" not in data and "web" not in data):
        return False, "credentials json missing installed/web field"
    return True, ""


def action_status(tokens_dir: str, email: str) -> int:
    token_path = resolve_existing_token_path(tokens_dir, email)
    bound = os.path.exists(token_path)
    print_json({
        "ok": True,
        "action": "status",
        "email": email,
        "bound": bound,
        "token_path": token_path,
        "token_name": os.path.basename(token_path),
    })
    return 0


def action_unbind(tokens_dir: str, email: str) -> int:
    token_path = token_file_path(tokens_dir, email)
    legacy_path = legacy_token_file_path(tokens_dir, email)
    removed = False
    removed_paths: list[str] = []
    for candidate in (token_path, legacy_path):
        if os.path.exists(candidate):
            os.remove(candidate)
            removed = True
            removed_paths.append(candidate)
    print_json({
        "ok": True,
        "action": "unbind",
        "email": email,
        "removed": removed,
        "removed_paths": removed_paths,
        "bound": False,
        "token_path": token_path,
    })
    return 0


def action_bind(tokens_dir: str, email: str, credentials_path: str) -> int:
    valid, message = validate_credentials_file(credentials_path)
    if not valid:
        print_json({
            "ok": False,
            "error": message,
        })
        return 1

    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
    except Exception as exc:
        print_json({
            "ok": False,
            "error": f"missing dependency: {exc}",
            "hint": "pip install google-auth google-auth-oauthlib google-api-python-client",
        })
        return 1

    scopes = ["https://www.googleapis.com/auth/gmail.send"]
    flow = InstalledAppFlow.from_client_secrets_file(credentials_path, scopes)
    try:
        creds = flow.run_local_server(
            host="localhost",
            port=0,
            open_browser=True,
            access_type="offline",
            prompt="consent",
        )
    except Exception as exc:
        err_text = str(exc)
        if "NoneType" in err_text and "replace" in err_text:
            print_json({
                "ok": False,
                "error": "oauth callback not completed",
                "detail": err_text,
                "hint": (
                    "浏览器未完成本机回调。请重新绑定并在浏览器完成授权后等待自动跳回，"
                    "不要提前关闭页面；若使用代理插件，请让 localhost/127.0.0.1 直连。"
                ),
            })
            return 1
        print_json({
            "ok": False,
            "error": "gmail oauth bind failed",
            "detail": err_text,
        })
        return 1

    os.makedirs(tokens_dir, exist_ok=True)
    token_path = token_file_path(tokens_dir, email)
    data = json.loads(creds.to_json())
    data["bound_email"] = email
    data["scopes"] = scopes
    with open(token_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print_json({
        "ok": True,
        "action": "bind",
        "email": email,
        "bound": True,
        "token_path": token_path,
        "token_name": os.path.basename(token_path),
        "has_refresh_token": bool(data.get("refresh_token")),
    })
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Gmail OAuth manager")
    parser.add_argument("--action", required=True, choices=("bind", "unbind", "status"))
    parser.add_argument("--email", required=True)
    parser.add_argument("--credentials", default="")
    parser.add_argument("--client-secret", default="")  # legacy option name
    parser.add_argument("--tokens-dir", required=True)
    args = parser.parse_args()

    email = args.email.strip().lower()
    if not email:
        print_json({"ok": False, "error": "email is required"})
        return 1
    if not is_gmail_address(email):
        print_json({"ok": False, "error": "only gmail.com/googlemail.com are supported"})
        return 1

    if args.action == "status":
        return action_status(args.tokens_dir, email)
    if args.action == "unbind":
        return action_unbind(args.tokens_dir, email)
    credentials_path = (args.credentials or args.client_secret).strip()
    if not credentials_path:
        print_json({"ok": False, "error": "credentials path is required"})
        return 1
    return action_bind(args.tokens_dir, email, credentials_path)


if __name__ == "__main__":
    sys.exit(main())
