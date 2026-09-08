#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Check SMTP credentials and pick the first reachable login path.
Supports optional HTTP CONNECT proxy used by the sender module.
"""

import argparse
import smtplib
import ssl
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

from email_sender import ProxySMTP, ProxySMTP_SSL, apply_account_config, get_proxy_url


def try_login_ssl(server, port, email, password, timeout, proxy_url=None):
    client = None
    try:
        if proxy_url:
            client = ProxySMTP_SSL(proxy_url, server, port, timeout=timeout)
        else:
            client = smtplib.SMTP_SSL(server, port, timeout=timeout)
        client.login(email, password)
        return True, None
    except Exception as exc:
        return False, str(exc)
    finally:
        if client:
            try:
                client.quit()
            except Exception:
                try:
                    client.close()
                except Exception:
                    pass


def try_login_starttls(server, port, email, password, timeout, proxy_url=None):
    client = None
    try:
        if proxy_url:
            client = ProxySMTP(proxy_url, server, port, timeout=timeout)
        else:
            client = smtplib.SMTP(server, port, timeout=timeout)
        client.ehlo()
        context = ssl.create_default_context()
        client.starttls(context=context)
        client.ehlo()
        client.login(email, password)
        return True, None
    except Exception as exc:
        return False, str(exc)
    finally:
        if client:
            try:
                client.quit()
            except Exception:
                try:
                    client.close()
                except Exception:
                    pass


def build_candidates(server, preferred_port):
    # Always probe 465/587 in parallel for SMTP usability test.
    raw = [("ssl", 465), ("starttls", 587)]
    if preferred_port not in (465, 587):
        raw.append(("ssl", preferred_port))

    dedup = []
    seen = set()
    for mode, port in raw:
        key = (mode, port)
        if key in seen:
            continue
        seen.add(key)
        dedup.append((server, mode, port))
    return dedup


def main():
    parser = argparse.ArgumentParser(description="SMTP credential check")
    parser.add_argument("--email", required=True, help="sender email")
    parser.add_argument("--password", required=True, help="sender password/app password")
    parser.add_argument("--smtp-server", default="smtp.gmail.com", help="smtp server")
    parser.add_argument("--smtp-port", type=int, default=465, help="smtp port")
    parser.add_argument("--timeout", type=int, default=15, help="timeout in seconds")
    args = parser.parse_args()

    account = {
        "email": args.email,
        "password": args.password,
        "smtp_server": args.smtp_server,
        "smtp_port": args.smtp_port,
    }
    apply_account_config(account)
    proxy_url = get_proxy_url()

    candidates = build_candidates(args.smtp_server, args.smtp_port)
    errors = []
    with ThreadPoolExecutor(max_workers=len(candidates)) as pool:
        futures = {}
        for server, mode, port in candidates:
            if mode == "starttls":
                fut = pool.submit(
                    try_login_starttls,
                    server,
                    port,
                    args.email,
                    args.password,
                    args.timeout,
                    proxy_url,
                )
            else:
                fut = pool.submit(
                    try_login_ssl,
                    server,
                    port,
                    args.email,
                    args.password,
                    args.timeout,
                    proxy_url,
                )
            futures[fut] = (mode, port)

        for fut in as_completed(futures):
            mode, port = futures[fut]
            ok, err = fut.result()
            if ok:
                suffix = "; PROXY=on" if proxy_url else ""
                print(f"OK: SMTP login success; MODE={mode}; PORT={port}{suffix}")
                return 0
            errors.append(f"{mode}:{port} -> {err}")

    print(f"ERROR: {' | '.join(errors)}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
