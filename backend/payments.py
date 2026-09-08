from __future__ import annotations

import base64
import calendar
import json
import math
import os
import secrets
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlparse

from sqlalchemy import inspect, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from models import User as AppUser, WeixinPayOrder

try:
    import qrcode
    from qrcode.image.svg import SvgPathImage

    QR_IMPORT_ERROR: Exception | None = None
except ImportError as exc:
    qrcode = None
    SvgPathImage = None
    QR_IMPORT_ERROR = exc

try:
    from cryptography import x509
    from cryptography.exceptions import InvalidSignature, InvalidTag
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    CRYPTO_IMPORT_ERROR: Exception | None = None
except ImportError as exc:
    x509 = None
    InvalidSignature = InvalidTag = None
    hashes = serialization = padding = AESGCM = None
    CRYPTO_IMPORT_ERROR = exc


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PLAN_CODE = "vip_month"
PREPARED_ORDER_TTL_MINUTES = 100
PREPARED_ORDER_TTL_SECONDS = PREPARED_ORDER_TTL_MINUTES * 60
DAILY_FREE_SEND_LIMIT = 20
PAYMENT_NOTIFY_PATH = "/api/wechat/notify"
PAYMENT_PLANS = (
    {
        "code": "vip_month",
        "name": "月卡会员",
        "amount_fen": 1,
        "grant_unit": "month",
        "grant_value": 1,
        "grant_label": "1个月",
        "grant_days": 0,
        "description": "开通 1 个月无限发送权限",
    },
    {
        "code": "vip_year",
        "name": "年卡会员",
        "amount_fen": 15000,
        "grant_unit": "month",
        "grant_value": 12,
        "grant_label": "12个月",
        "grant_days": 0,
        "description": "开通 12 个月无限发送权限",
    },
)

PREPARED_ORDER_CACHE: dict[tuple[str, str], dict[str, Any]] = {}
PREPARED_ORDER_CACHE_LOCK = threading.Lock()
PREPARED_ORDER_BUILD_LOCKS: dict[tuple[str, str], threading.Lock] = {}
PREPARED_ORDER_BUILD_LOCKS_LOCK = threading.Lock()


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip().lstrip("\ufeff")
        value = value.strip().strip("'\"")
        if key and key not in os.environ:
            os.environ[key] = value


def bootstrap_payment_env() -> None:
    _load_env_file(PROJECT_ROOT / "backend" / ".env")
    _load_env_file(PROJECT_ROOT / ".env")


bootstrap_payment_env()


class PaymentApiError(Exception):
    def __init__(self, status: int, message: str, *, extra: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.message = message
        self.extra = extra or {}


def now_local() -> datetime:
    return datetime.now(timezone.utc).astimezone()


def now_iso() -> str:
    return now_local().replace(microsecond=0).isoformat()


def today_iso() -> str:
    return now_local().date().isoformat()


def parse_iso_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    else:
        text = str(value or "").strip()
        if not text:
            return None
        try:
            parsed = datetime.fromisoformat(text)
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc).astimezone()
    return parsed.astimezone()


def fen_to_yuan(amount_fen: int) -> str:
    return f"{amount_fen / 100:.2f}"


def grant_label_text(grant_unit: str, grant_value: int, fallback_days: int = 0) -> str:
    unit = str(grant_unit or "").strip().lower()
    value = max(0, int(grant_value or 0))
    if unit == "month" and value > 0:
        return f"{value}个月"
    if unit == "day" and value > 0:
        return f"{value}天"
    if unit == "minute" and value > 0:
        return f"{value}分钟"
    if fallback_days > 0:
        return f"{fallback_days}天"
    return ""


def add_calendar_months(reference: datetime, months: int) -> datetime:
    if months <= 0:
        return reference
    target_month_index = (reference.month - 1) + months
    target_year = reference.year + (target_month_index // 12)
    target_month = (target_month_index % 12) + 1
    target_day = min(reference.day, calendar.monthrange(target_year, target_month)[1])
    return reference.replace(year=target_year, month=target_month, day=target_day)


def apply_entitlement_grant(
    reference: datetime,
    *,
    grant_unit: str | None,
    grant_value: int | None,
    fallback_days: int = 0,
) -> datetime:
    unit = str(grant_unit or "").strip().lower()
    value = max(0, int(grant_value or 0))
    if unit == "month" and value > 0:
        return add_calendar_months(reference, value)
    if unit == "day" and value > 0:
        return reference + timedelta(days=value)
    if unit == "minute" and value > 0:
        return reference + timedelta(minutes=value)
    if fallback_days > 0:
        return reference + timedelta(days=fallback_days)
    return reference


def normalize_username(value: str) -> str:
    return str(value or "").strip()


def env_bool(name: str) -> bool:
    return (os.getenv(name) or "").strip().lower() in {"1", "true", "yes", "on"}


def read_env(name: str, *aliases: str) -> str:
    for key in (name, *aliases):
        value = (os.getenv(key) or "").strip()
        if value:
            return value
    return ""


def resolve_local_path(raw_path: str) -> Path:
    path = Path(raw_path)
    if not path.is_absolute():
        path = (PROJECT_ROOT / raw_path).resolve()
    return path


def ensure_crypto_support() -> None:
    if CRYPTO_IMPORT_ERROR is not None:
        raise RuntimeError(
            "cryptography is required for the real WeChat payment flow. "
            "Run `python -m pip install cryptography`."
        ) from CRYPTO_IMPORT_ERROR


def qr_svg_bytes(text: str) -> bytes:
    if QR_IMPORT_ERROR is not None:
        raise RuntimeError(
            "qrcode is required for QR rendering. Run `python -m pip install qrcode`."
        ) from QR_IMPORT_ERROR

    qr = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        border=2,
        box_size=8,
    )
    qr.add_data(text)
    qr.make(fit=True)
    image = qr.make_image(image_factory=SvgPathImage)
    buffer = BytesIO()
    image.save(buffer)
    return buffer.getvalue()


def serialize_plan(plan: dict[str, Any]) -> dict[str, Any]:
    grant_unit = str(plan.get("grant_unit") or "day").strip()
    grant_value = int(plan.get("grant_value", plan.get("grant_days", 0)) or 0)
    fallback_days = int(plan.get("grant_days", 0) or 0)
    return {
        "code": str(plan["code"]),
        "name": str(plan["name"]),
        "description": str(plan["description"]),
        "amount_fen": int(plan["amount_fen"]),
        "amount_yuan": fen_to_yuan(int(plan["amount_fen"])),
        "grant_days": fallback_days,
        "grant_unit": grant_unit,
        "grant_value": grant_value,
        "grant_label": str(plan.get("grant_label") or grant_label_text(grant_unit, grant_value, fallback_days)),
    }


def list_payment_plans() -> list[dict[str, Any]]:
    return [serialize_plan(plan) for plan in PAYMENT_PLANS]


def resolve_payment_plan(plan_code: str) -> dict[str, Any]:
    normalized = (plan_code or DEFAULT_PLAN_CODE).strip()
    for plan in PAYMENT_PLANS:
        if plan["code"] == normalized:
            return serialize_plan(plan)
    raise PaymentApiError(400, f"unknown plan_code: {normalized}")


def current_payment_provider() -> str:
    return "wechat" if env_bool("WECHAT_REAL_MODE") else "mock"


def live_membership_status(expire_at_text: str | None, reference_time: datetime | None = None) -> str:
    reference = reference_time or now_local()
    expire_at = parse_iso_datetime(expire_at_text)
    if expire_at is None:
        return "inactive"
    if expire_at > reference:
        return "active"
    return "expired"


def serialize_order(order: WeixinPayOrder) -> dict[str, Any]:
    grant_unit = str(order.grant_unit or "").strip()
    grant_value = int(order.grant_value or 0)
    grant_days = int(order.grant_days or 0)
    return {
        "out_trade_no": order.out_trade_no,
        "username": order.username,
        "plan_code": order.plan_code,
        "plan_name": order.plan_name,
        "description": order.description,
        "amount_fen": int(order.amount_fen),
        "amount_yuan": fen_to_yuan(int(order.amount_fen)),
        "grant_days": grant_days,
        "grant_unit": grant_unit,
        "grant_value": grant_value,
        "grant_label": grant_label_text(grant_unit, grant_value, grant_days),
        "status": order.status,
        "provider": order.provider,
        "code_url": order.code_url,
        "warning_text": order.warning_text or "",
        "created_at": order.created_at,
        "paid_at": order.paid_at,
        "subscription_start_at": order.subscription_start_at,
        "subscription_expire_at": order.subscription_expire_at,
    }


def prepared_order_cache_key(username: str, plan_code: str) -> tuple[str, str]:
    normalized_username = normalize_username(username)
    normalized_plan_code = resolve_payment_plan(plan_code)["code"]
    return normalized_username, normalized_plan_code


def prepared_order_build_lock(username: str, plan_code: str) -> threading.Lock:
    key = (normalize_username(username), plan_code.strip())
    with PREPARED_ORDER_BUILD_LOCKS_LOCK:
        lock = PREPARED_ORDER_BUILD_LOCKS.get(key)
        if lock is None:
            lock = threading.Lock()
            PREPARED_ORDER_BUILD_LOCKS[key] = lock
        return lock


def prepared_order_seconds_left(order: dict[str, Any], reference_time: datetime | None = None) -> int:
    created_at = parse_iso_datetime(order.get("created_at"))
    if created_at is None:
        return 0
    reference = reference_time or now_local()
    age_seconds = max(0.0, (reference - created_at).total_seconds())
    return max(0, math.ceil(PREPARED_ORDER_TTL_SECONDS - age_seconds))


def prepared_order_is_valid(
    order: dict[str, Any],
    *,
    username: str | None = None,
    plan_code: str | None = None,
    reference_time: datetime | None = None,
) -> bool:
    if order.get("status") != "created":
        return False
    if order.get("provider") != current_payment_provider():
        return False
    if username is not None and order.get("username") != normalize_username(username):
        return False
    if plan_code is not None and order.get("plan_code") != plan_code.strip():
        return False
    return prepared_order_seconds_left(order, reference_time) > 0


def remember_prepared_order(order: dict[str, Any]) -> None:
    key = (str(order["username"]).strip(), str(order["plan_code"]).strip())
    with PREPARED_ORDER_CACHE_LOCK:
        PREPARED_ORDER_CACHE[key] = {"order": dict(order)}


def load_cached_prepared_order(username: str, plan_code: str) -> dict[str, Any] | None:
    key = (normalize_username(username), plan_code.strip())
    with PREPARED_ORDER_CACHE_LOCK:
        cached = PREPARED_ORDER_CACHE.get(key)
        if cached is None:
            return None
        order = dict(cached.get("order") or {})
        if prepared_order_is_valid(order, username=username, plan_code=plan_code):
            return order
        PREPARED_ORDER_CACHE.pop(key, None)
    return None


def invalidate_prepared_order(username: str, plan_code: str) -> None:
    key = (normalize_username(username), plan_code.strip())
    with PREPARED_ORDER_CACHE_LOCK:
        PREPARED_ORDER_CACHE.pop(key, None)


def ensure_registered_user(db: Session, username: str, *, for_update: bool = False) -> AppUser:
    normalized = normalize_username(username)
    if not normalized:
        raise PaymentApiError(400, "username is required")
    stmt = select(AppUser).where(AppUser.username == normalized).limit(1)
    if for_update:
        stmt = stmt.with_for_update()
    user = db.execute(stmt).scalar_one_or_none()
    if user is None:
        raise PaymentApiError(404, "user not found")
    return user


def sync_user_access_state(user: AppUser, reference_time: datetime | None = None) -> bool:
    reference = reference_time or now_local()
    changed = False

    current_day = reference.date()
    stored_day = user.today_success_date
    if isinstance(stored_day, str):
        try:
            stored_day = datetime.fromisoformat(stored_day).date()
        except ValueError:
            stored_day = None
    if stored_day != current_day:
        user.today_success_date = current_day
        user.today_success_count = 0
        changed = True

    daily_limit = int(user.daily_total_limit or 0)
    if daily_limit <= 0:
        user.daily_total_limit = DAILY_FREE_SEND_LIMIT
        changed = True

    desired_status = live_membership_status(user.subscription_expire_at, reference)
    if user.membership_status != desired_status:
        user.membership_status = desired_status
        user.subscription_updated_at = reference.replace(microsecond=0).isoformat()
        changed = True
    return changed


def expire_stale_pending_orders(
    db: Session,
    *,
    username: str | None = None,
    plan_code: str | None = None,
    provider: str | None = None,
    reference_time: datetime | None = None,
) -> int:
    reference = reference_time or now_local()
    expire_before = (reference - timedelta(seconds=PREPARED_ORDER_TTL_SECONDS)).replace(microsecond=0).isoformat()
    stmt = select(WeixinPayOrder).where(
        WeixinPayOrder.status == "created",
        WeixinPayOrder.created_at <= expire_before,
    )
    if username is not None:
        stmt = stmt.where(WeixinPayOrder.username == normalize_username(username))
    if plan_code is not None:
        stmt = stmt.where(WeixinPayOrder.plan_code == plan_code)
    if provider is not None:
        stmt = stmt.where(WeixinPayOrder.provider == provider)

    changed = 0
    for order in db.execute(stmt).scalars().all():
        order.status = "expired"
        invalidate_prepared_order(order.username, order.plan_code)
        changed += 1
    if changed:
        db.flush()
    return changed


def replace_pending_orders(
    db: Session,
    *,
    username: str,
    plan_code: str,
    provider: str,
) -> int:
    stmt = (
        select(WeixinPayOrder)
        .where(
            WeixinPayOrder.username == normalize_username(username),
            WeixinPayOrder.plan_code == plan_code,
            WeixinPayOrder.provider == provider,
            WeixinPayOrder.status == "created",
        )
        .with_for_update()
    )
    changed = 0
    for order in db.execute(stmt).scalars().all():
        order.status = "replaced"
        invalidate_prepared_order(order.username, order.plan_code)
        changed += 1
    if changed:
        db.flush()
    return changed


def fetch_recent_orders(db: Session, username: str, *, limit: int = 8) -> list[dict[str, Any]]:
    stmt = (
        select(WeixinPayOrder)
        .where(WeixinPayOrder.username == normalize_username(username))
        .order_by(WeixinPayOrder.created_at.desc())
        .limit(limit)
    )
    return [serialize_order(row) for row in db.execute(stmt).scalars().all()]


def serialize_user(
    user: AppUser,
    recent_orders: list[dict[str, Any]],
    reference_time: datetime | None = None,
) -> dict[str, Any]:
    reference = reference_time or now_local()
    status = live_membership_status(user.subscription_expire_at, reference)
    expire_at = parse_iso_datetime(user.subscription_expire_at)
    remaining_days = 0
    if expire_at is not None and status == "active":
        remaining_seconds = max(0.0, (expire_at - reference).total_seconds())
        remaining_days = math.ceil(remaining_seconds / 86400) if remaining_seconds else 0

    daily_limit = max(1, int(user.daily_total_limit or DAILY_FREE_SEND_LIMIT))
    today_success = max(0, int(user.today_success_count or 0))
    daily_remaining = max(daily_limit - today_success, 0)
    access_mode = "paid" if status == "active" else ("free" if daily_remaining > 0 else "blocked")
    created_at = user.created_at.isoformat() if isinstance(user.created_at, datetime) else str(user.created_at or "")
    return {
        "username": user.username,
        "membership_status": status,
        "subscription_active": status == "active",
        "subscription_plan_code": user.subscription_plan_code or "",
        "subscription_plan_name": user.subscription_plan_name or "",
        "subscription_start_at": user.subscription_start_at,
        "subscription_expire_at": user.subscription_expire_at,
        "subscription_remaining_days": remaining_days,
        "daily_free_send_limit": daily_limit,
        "today_success_count": today_success,
        "daily_free_remaining_count": daily_remaining,
        "access_mode": access_mode,
        "can_send": access_mode != "blocked",
        "created_at": created_at,
        "recent_orders": recent_orders,
    }


def build_user_snapshot(db: Session, username: str) -> dict[str, Any]:
    normalized = normalize_username(username)
    user = ensure_registered_user(db, normalized)
    expire_stale_pending_orders(db, username=normalized)
    sync_user_access_state(user, now_local())
    db.flush()
    return serialize_user(user, fetch_recent_orders(db, normalized), now_local())


def get_access_status_payload(db: Session, username: str) -> dict[str, Any]:
    payload = {
        "ok": True,
        "user": build_user_snapshot(db, username),
        "plans": list_payment_plans(),
        "default_plan_code": DEFAULT_PLAN_CODE,
        "payment_provider": current_payment_provider(),
        "real_mode": env_bool("WECHAT_REAL_MODE"),
        "prepared_order_ttl_seconds": PREPARED_ORDER_TTL_SECONDS,
    }
    db.commit()
    return payload


def load_order_model(db: Session, out_trade_no: str, *, for_update: bool = False) -> WeixinPayOrder:
    normalized = str(out_trade_no or "").strip()
    if not normalized:
        raise PaymentApiError(404, "order not found")
    stmt = select(WeixinPayOrder).where(WeixinPayOrder.out_trade_no == normalized).limit(1)
    if for_update:
        stmt = stmt.with_for_update()
    order = db.execute(stmt).scalar_one_or_none()
    if order is None:
        raise PaymentApiError(404, "order not found")
    return order


def find_recent_prepared_order(db: Session, username: str, plan_code: str) -> dict[str, Any] | None:
    provider = current_payment_provider()
    expire_stale_pending_orders(
        db,
        username=username,
        plan_code=plan_code,
        provider=provider,
    )
    stmt = (
        select(WeixinPayOrder)
        .where(
            WeixinPayOrder.username == normalize_username(username),
            WeixinPayOrder.plan_code == plan_code,
            WeixinPayOrder.status == "created",
            WeixinPayOrder.provider == provider,
        )
        .order_by(WeixinPayOrder.created_at.desc())
        .limit(1)
    )
    order_model = db.execute(stmt).scalar_one_or_none()
    if order_model is None:
        return None
    order = serialize_order(order_model)
    if not prepared_order_is_valid(order, username=username, plan_code=plan_code):
        return None
    remember_prepared_order(order)
    return order


def make_out_trade_no() -> str:
    return "NP" + now_local().strftime("%Y%m%d%H%M%S") + secrets.token_hex(3).upper()


def build_mock_code_url(out_trade_no: str) -> str:
    token = secrets.token_urlsafe(12)
    return f"weixin://wxpay/bizpayurl/mock?pr={token}&out_trade_no={out_trade_no}"


@lru_cache(maxsize=None)
def load_private_key(path_text: str) -> Any:
    ensure_crypto_support()
    data = Path(path_text).read_bytes()
    try:
        return serialization.load_pem_private_key(data, password=None)
    except (TypeError, ValueError) as exc:
        raise RuntimeError(f"invalid merchant private key: {path_text}") from exc


@lru_cache(maxsize=None)
def load_public_key(path_text: str) -> Any:
    ensure_crypto_support()
    data = Path(path_text).read_bytes()
    try:
        if b"BEGIN CERTIFICATE" in data:
            cert = x509.load_pem_x509_certificate(data)
            return cert.public_key()
        return serialization.load_pem_public_key(data)
    except ValueError as exc:
        raise RuntimeError(f"invalid WeChat platform public key: {path_text}") from exc


def create_wechat_signature(message: str, private_key_path: Path) -> str:
    signature = load_private_key(str(private_key_path)).sign(
        message.encode("utf-8"),
        padding.PKCS1v15(),
        hashes.SHA256(),
    )
    return base64.b64encode(signature).decode("utf-8")


def verify_wechat_signature(message: str, signature_b64: str, public_key_path: Path) -> None:
    ensure_crypto_support()
    try:
        signature = base64.b64decode(signature_b64)
    except ValueError as exc:
        raise RuntimeError("invalid WeChat signature encoding") from exc
    try:
        load_public_key(str(public_key_path)).verify(
            signature,
            message.encode("utf-8"),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
    except InvalidSignature as exc:
        raise RuntimeError("WeChat signature verification failed") from exc


def decrypt_wechat_resource(resource: dict[str, Any], api_v3_key: str) -> dict[str, Any]:
    ensure_crypto_support()
    algorithm = str(resource.get("algorithm") or "").strip()
    if algorithm != "AEAD_AES_256_GCM":
        raise RuntimeError(f"unsupported resource algorithm: {algorithm or 'missing'}")
    ciphertext = str(resource.get("ciphertext") or "").strip()
    nonce = str(resource.get("nonce") or "").strip()
    associated_data = str(resource.get("associated_data") or "").strip()
    if not ciphertext or not nonce:
        raise RuntimeError("resource.ciphertext or resource.nonce is missing")
    try:
        plaintext = AESGCM(api_v3_key.encode("utf-8")).decrypt(
            nonce.encode("utf-8"),
            base64.b64decode(ciphertext),
            associated_data.encode("utf-8"),
        )
    except (InvalidTag, ValueError) as exc:
        raise RuntimeError("failed to decrypt WeChat notify resource") from exc
    payload = json.loads(plaintext.decode("utf-8"))
    if not isinstance(payload, dict):
        raise RuntimeError("decrypted WeChat payload must be a JSON object")
    return payload


def resolve_wechat_config(
    *,
    require_api_v3_key: bool = False,
    require_platform_public_key: bool = False,
) -> dict[str, Any]:
    appid = read_env("WECHAT_APPID")
    mchid = read_env("WECHAT_MCHID")
    merchant_serial_no = read_env("WECHAT_MERCHANT_SERIAL_NO", "WECHAT_SERIAL_NO", "WECHAT_SERIAL")
    private_key_raw = read_env("WECHAT_PRIVATE_KEY_PATH")
    notify_url = read_env("WECHAT_NOTIFY_URL")
    api_base = read_env("WECHAT_API_BASE") or "https://api.mch.weixin.qq.com"
    api_base = api_base.rstrip("/")
    api_v3_key = read_env("WECHAT_API_V3_KEY")
    platform_public_key_raw = read_env("WECHAT_PLATFORM_PUBLIC_KEY_PATH", "WECHAT_PUBLIC_KEY_PATH")
    platform_serial_no = read_env("WECHAT_PLATFORM_SERIAL_NO", "WECHAT_PAY_PUBLIC_KEY_ID")

    missing = []
    for name, value in (
        ("WECHAT_APPID", appid),
        ("WECHAT_MCHID", mchid),
        ("WECHAT_MERCHANT_SERIAL_NO", merchant_serial_no),
        ("WECHAT_PRIVATE_KEY_PATH", private_key_raw),
        ("WECHAT_NOTIFY_URL", notify_url),
    ):
        if not value:
            missing.append(name)
    if require_api_v3_key and not api_v3_key:
        missing.append("WECHAT_API_V3_KEY")
    if require_platform_public_key and not platform_public_key_raw:
        missing.append("WECHAT_PLATFORM_PUBLIC_KEY_PATH")
    if missing:
        raise RuntimeError(f"missing env: {', '.join(missing)}")

    parsed_notify_url = urlparse(notify_url)
    if parsed_notify_url.scheme != "https":
        raise RuntimeError("WECHAT_NOTIFY_URL must use https")
    if parsed_notify_url.path != PAYMENT_NOTIFY_PATH:
        raise RuntimeError(f"WECHAT_NOTIFY_URL must end with {PAYMENT_NOTIFY_PATH}")
    if parsed_notify_url.query or parsed_notify_url.fragment:
        raise RuntimeError("WECHAT_NOTIFY_URL must not contain query or fragment")

    private_key_path = resolve_local_path(private_key_raw)
    if not private_key_path.exists():
        raise RuntimeError(f"private key not found: {private_key_path}")

    platform_public_key_path: Path | None = None
    if platform_public_key_raw:
        platform_public_key_path = resolve_local_path(platform_public_key_raw)
        if not platform_public_key_path.exists():
            raise RuntimeError(f"WeChat platform public key not found: {platform_public_key_path}")

    if api_v3_key and len(api_v3_key.encode("utf-8")) != 32:
        raise RuntimeError("WECHAT_API_V3_KEY must be exactly 32 bytes")

    return {
        "appid": appid,
        "mchid": mchid,
        "merchant_serial_no": merchant_serial_no,
        "private_key_path": private_key_path,
        "notify_url": notify_url,
        "api_base": api_base,
        "api_v3_key": api_v3_key,
        "platform_public_key_path": platform_public_key_path,
        "platform_serial_no": platform_serial_no,
    }


def build_wechat_authorization(
    *,
    method: str,
    canonical_url: str,
    body_text: str,
    mchid: str,
    merchant_serial_no: str,
    private_key_path: Path,
) -> str:
    nonce_str = secrets.token_hex(16)
    timestamp = str(int(time.time()))
    message = f"{method}\n{canonical_url}\n{timestamp}\n{nonce_str}\n{body_text}\n"
    signature = create_wechat_signature(message, private_key_path)
    return (
        "WECHATPAY2-SHA256-RSA2048 "
        f'mchid="{mchid}",'
        f'nonce_str="{nonce_str}",'
        f'timestamp="{timestamp}",'
        f'serial_no="{merchant_serial_no}",'
        f'signature="{signature}"'
    )


def verify_wechat_response_signature(headers: Any, body_text: str, config: dict[str, Any]) -> None:
    public_key_path = config.get("platform_public_key_path")
    if public_key_path is None:
        return
    signature = str(headers.get("Wechatpay-Signature") or "").strip()
    timestamp = str(headers.get("Wechatpay-Timestamp") or "").strip()
    nonce = str(headers.get("Wechatpay-Nonce") or "").strip()
    serial_no = str(headers.get("Wechatpay-Serial") or "").strip()
    if not signature or not timestamp or not nonce:
        raise RuntimeError("missing WeChat response signature headers")
    expected_serial_no = str(config.get("platform_serial_no") or "").strip()
    if expected_serial_no and serial_no and serial_no != expected_serial_no:
        raise RuntimeError(f"unexpected WeChat platform serial: {serial_no}")
    message = f"{timestamp}\n{nonce}\n{body_text}\n"
    verify_wechat_signature(message, signature, public_key_path)


def request_wechat_api(method: str, canonical_url: str, *, config: dict[str, Any], body: dict[str, Any] | None = None) -> str:
    request_started = time.perf_counter()
    body_text = ""
    data: bytes | None = None
    headers = {
        "Accept": "application/json",
        "User-Agent": "level3-wechat-pay/1.0",
    }
    if body is not None:
        body_text = json.dumps(body, ensure_ascii=False, separators=(",", ":"))
        data = body_text.encode("utf-8")
        headers["Content-Type"] = "application/json"
    headers["Authorization"] = build_wechat_authorization(
        method=method,
        canonical_url=canonical_url,
        body_text=body_text,
        mchid=str(config["mchid"]),
        merchant_serial_no=str(config["merchant_serial_no"]),
        private_key_path=config["private_key_path"],
    )

    request = urllib.request.Request(
        url=f"{config['api_base']}{canonical_url}",
        data=data,
        method=method,
        headers=headers,
    )

    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            payload_text = response.read().decode("utf-8")
            verify_wechat_response_signature(response.headers, payload_text, config)
            elapsed_ms = (time.perf_counter() - request_started) * 1000
            print(f"[wechat_api] {method} {canonical_url} {elapsed_ms:.0f}ms")
            return payload_text
    except urllib.error.HTTPError as exc:
        error_text = exc.read().decode("utf-8", "ignore")
        elapsed_ms = (time.perf_counter() - request_started) * 1000
        print(f"[wechat_api] {method} {canonical_url} failed {elapsed_ms:.0f}ms status={exc.code}")
        raise RuntimeError(f"wechat api error {exc.code}: {error_text}") from exc
    except urllib.error.URLError as exc:
        elapsed_ms = (time.perf_counter() - request_started) * 1000
        print(f"[wechat_api] {method} {canonical_url} failed {elapsed_ms:.0f}ms reason={exc.reason}")
        raise RuntimeError(f"wechat api unavailable: {exc.reason}") from exc


def create_real_wechat_order(order_data: dict[str, Any]) -> dict[str, Any]:
    config = resolve_wechat_config()
    body = {
        "appid": config["appid"],
        "mchid": config["mchid"],
        "description": order_data["description"],
        "out_trade_no": order_data["out_trade_no"],
        "notify_url": config["notify_url"],
        "attach": json.dumps(
            {
                "username": order_data["username"],
                "plan_code": order_data["plan_code"],
                "grant_days": order_data["grant_days"],
                "grant_unit": order_data["grant_unit"],
                "grant_value": order_data["grant_value"],
            },
            ensure_ascii=False,
        ),
        "amount": {
            "total": order_data["amount_fen"],
            "currency": "CNY",
        },
        "time_expire": (now_local() + timedelta(minutes=PREPARED_ORDER_TTL_MINUTES)).replace(microsecond=0).isoformat(),
        "settle_info": {
            "profit_sharing": False,
        },
    }
    payload_text = request_wechat_api("POST", "/v3/pay/transactions/native", config=config, body=body)
    payload = json.loads(payload_text)
    code_url = str(payload.get("code_url") or "").strip()
    if not code_url:
        raise RuntimeError(f"missing code_url in response: {payload_text}")
    return {
        "provider": "wechat",
        "code_url": code_url,
        "response_payload": payload_text,
        "warning_text": "",
    }


def query_wechat_order(out_trade_no: str) -> dict[str, Any]:
    config = resolve_wechat_config()
    canonical_url = (
        f"/v3/pay/transactions/out-trade-no/{quote(out_trade_no, safe='')}"
        f"?mchid={quote(str(config['mchid']), safe='')}"
    )
    payload_text = request_wechat_api("GET", canonical_url, config=config)
    payload = json.loads(payload_text)
    if not isinstance(payload, dict):
        raise RuntimeError("wechat query response must be a JSON object")
    return payload


def create_order_payload(db: Session, username: str, plan_code: str) -> dict[str, Any]:
    order_started = time.perf_counter()
    normalized_username = normalize_username(username)
    if len(normalized_username) > 64:
        raise PaymentApiError(400, "username is too long")
    ensure_registered_user(db, normalized_username)
    plan = resolve_payment_plan(plan_code)

    out_trade_no = make_out_trade_no()
    order_data = {
        "out_trade_no": out_trade_no,
        "username": normalized_username,
        "plan_code": plan["code"],
        "plan_name": plan["name"],
        "description": plan["description"],
        "amount_fen": int(plan["amount_fen"]),
        "grant_days": int(plan["grant_days"]),
        "grant_unit": str(plan.get("grant_unit") or ""),
        "grant_value": int(plan.get("grant_value", 0) or 0),
    }

    if env_bool("WECHAT_REAL_MODE"):
        try:
            payment_result = create_real_wechat_order(order_data)
        except Exception as exc:
            raise PaymentApiError(502, f"wechat order failed: {exc}") from exc
    else:
        payment_result = {
            "provider": "mock",
            "code_url": build_mock_code_url(out_trade_no),
            "response_payload": json.dumps({"mock": True}, ensure_ascii=False),
            "warning_text": "WECHAT_REAL_MODE is disabled. The current QR code is a local demo code.",
        }

    created_at = now_iso()
    expire_stale_pending_orders(
        db,
        username=normalized_username,
        plan_code=plan["code"],
        provider=payment_result["provider"],
    )
    replace_pending_orders(
        db,
        username=normalized_username,
        plan_code=plan["code"],
        provider=payment_result["provider"],
    )

    order = WeixinPayOrder(
        out_trade_no=out_trade_no,
        username=normalized_username,
        plan_code=plan["code"],
        plan_name=plan["name"],
        description=plan["description"],
        amount_fen=int(plan["amount_fen"]),
        grant_days=int(plan["grant_days"]),
        grant_unit=str(plan.get("grant_unit") or ""),
        grant_value=int(plan.get("grant_value", 0) or 0),
        status="created",
        provider=str(payment_result["provider"]),
        code_url=str(payment_result["code_url"]),
        response_payload=str(payment_result["response_payload"]),
        warning_text=str(payment_result["warning_text"]),
        created_at=created_at,
        paid_at=None,
        subscription_start_at=None,
        subscription_expire_at=None,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    serialized_order = serialize_order(order)
    remember_prepared_order(serialized_order)
    total_ms = (time.perf_counter() - order_started) * 1000
    print(
        "[create_order]",
        f"out_trade_no={out_trade_no}",
        f"provider={payment_result['provider']}",
        f"total={total_ms:.0f}ms",
    )
    user_payload = get_access_status_payload(db, normalized_username)["user"]
    return {
        "order": serialized_order,
        "user": user_payload,
    }


def prepare_order_payload(db: Session, username: str, plan_code: str, *, force_refresh: bool = False) -> dict[str, Any]:
    normalized_username, normalized_plan_code = prepared_order_cache_key(username, plan_code)
    ensure_registered_user(db, normalized_username)

    if not force_refresh:
        cached_order = load_cached_prepared_order(normalized_username, normalized_plan_code)
        if cached_order is not None:
            return {
                "order": cached_order,
                "user": get_access_status_payload(db, normalized_username)["user"],
                "prepared": True,
                "reused": True,
                "ttl_seconds": PREPARED_ORDER_TTL_SECONDS,
                "expires_in_seconds": prepared_order_seconds_left(cached_order),
            }

        reusable_order = find_recent_prepared_order(db, normalized_username, normalized_plan_code)
        if reusable_order is not None:
            db.commit()
            return {
                "order": reusable_order,
                "user": get_access_status_payload(db, normalized_username)["user"],
                "prepared": True,
                "reused": True,
                "ttl_seconds": PREPARED_ORDER_TTL_SECONDS,
                "expires_in_seconds": prepared_order_seconds_left(reusable_order),
            }

    with prepared_order_build_lock(normalized_username, normalized_plan_code):
        if not force_refresh:
            cached_order = load_cached_prepared_order(normalized_username, normalized_plan_code)
            if cached_order is not None:
                return {
                    "order": cached_order,
                    "user": get_access_status_payload(db, normalized_username)["user"],
                    "prepared": True,
                    "reused": True,
                    "ttl_seconds": PREPARED_ORDER_TTL_SECONDS,
                    "expires_in_seconds": prepared_order_seconds_left(cached_order),
                }

            reusable_order = find_recent_prepared_order(db, normalized_username, normalized_plan_code)
            if reusable_order is not None:
                db.commit()
                return {
                    "order": reusable_order,
                    "user": get_access_status_payload(db, normalized_username)["user"],
                    "prepared": True,
                    "reused": True,
                    "ttl_seconds": PREPARED_ORDER_TTL_SECONDS,
                    "expires_in_seconds": prepared_order_seconds_left(reusable_order),
                }

        result = create_order_payload(db, normalized_username, normalized_plan_code)
        return {
            **result,
            "prepared": True,
            "reused": False,
            "ttl_seconds": PREPARED_ORDER_TTL_SECONDS,
            "expires_in_seconds": prepared_order_seconds_left(result["order"]),
        }


def mark_order_paid_payload(db: Session, out_trade_no: str) -> dict[str, Any]:
    order = load_order_model(db, out_trade_no, for_update=True)
    user = ensure_registered_user(db, order.username, for_update=True)
    paid_now_dt = now_local()
    paid_now = paid_now_dt.replace(microsecond=0).isoformat()
    sync_user_access_state(user, paid_now_dt)

    if order.status != "paid":
        current_expire_at = parse_iso_datetime(user.subscription_expire_at)
        current_start_at = parse_iso_datetime(user.subscription_start_at)
        if current_expire_at is not None and current_expire_at > paid_now_dt:
            subscription_start_at = current_start_at or paid_now_dt
            renewal_anchor = current_expire_at
        else:
            subscription_start_at = paid_now_dt
            renewal_anchor = paid_now_dt

        subscription_expire_at = apply_entitlement_grant(
            renewal_anchor,
            grant_unit=order.grant_unit,
            grant_value=order.grant_value,
            fallback_days=int(order.grant_days or 0),
        )
        subscription_start_text = subscription_start_at.replace(microsecond=0).isoformat()
        subscription_expire_text = subscription_expire_at.replace(microsecond=0).isoformat()

        order.status = "paid"
        order.paid_at = paid_now
        order.subscription_start_at = subscription_start_text
        order.subscription_expire_at = subscription_expire_text

        user.membership_status = "active"
        user.subscription_plan_code = order.plan_code
        user.subscription_plan_name = order.plan_name
        user.subscription_start_at = subscription_start_text
        user.subscription_expire_at = subscription_expire_text
        user.subscription_updated_at = paid_now

    db.commit()
    invalidate_prepared_order(order.username, order.plan_code)
    return {
        "order": serialize_order(load_order_model(db, out_trade_no)),
        "user": get_access_status_payload(db, order.username)["user"],
    }


def confirm_mock_order_payload(db: Session, out_trade_no: str) -> dict[str, Any]:
    order = load_order_model(db, out_trade_no)
    if order.provider == "wechat":
        raise PaymentApiError(400, "real WeChat orders cannot be confirmed manually; use sync or notify")
    return mark_order_paid_payload(db, out_trade_no)


def sync_wechat_order_payload(db: Session, out_trade_no: str) -> dict[str, Any]:
    order = serialize_order(load_order_model(db, out_trade_no))
    if order["provider"] != "wechat":
        raise PaymentApiError(400, "only WeChat orders support status sync")

    config = resolve_wechat_config()
    payload = query_wechat_order(out_trade_no)
    payload_out_trade_no = str(payload.get("out_trade_no") or "").strip()
    if payload_out_trade_no != out_trade_no:
        raise RuntimeError("wechat query returned mismatched out_trade_no")
    payload_appid = str(payload.get("appid") or "").strip()
    if payload_appid and payload_appid != str(config["appid"]):
        raise RuntimeError("wechat query returned mismatched appid")
    payload_mchid = str(payload.get("mchid") or "").strip()
    if payload_mchid and payload_mchid != str(config["mchid"]):
        raise RuntimeError("wechat query returned mismatched mchid")
    amount = payload.get("amount") or {}
    try:
        total = int((amount or {}).get("total"))
    except (TypeError, ValueError) as exc:
        raise RuntimeError("wechat query returned invalid amount.total") from exc
    if total != int(order["amount_fen"]):
        raise RuntimeError("wechat query returned mismatched amount.total")

    trade_state = str(payload.get("trade_state") or "").strip() or "UNKNOWN"
    if trade_state == "SUCCESS":
        result = mark_order_paid_payload(db, out_trade_no)
    else:
        result = {
            "order": serialize_order(load_order_model(db, out_trade_no)),
            "user": get_access_status_payload(db, order["username"])["user"],
        }
    result["trade_state"] = trade_state
    result["sync_message"] = (
        "WeChat order confirmed as paid."
        if trade_state == "SUCCESS"
        else f"WeChat order is still {trade_state}."
    )
    return result


def process_wechat_notify_payload(db: Session, raw_body: bytes, headers: Any) -> dict[str, Any]:
    config = resolve_wechat_config(require_api_v3_key=True, require_platform_public_key=True)
    body_text = raw_body.decode("utf-8")
    verify_wechat_response_signature(headers, body_text, config)
    payload = json.loads(body_text)
    if not isinstance(payload, dict):
        raise RuntimeError("wechat notify payload must be a JSON object")
    resource = payload.get("resource")
    if not isinstance(resource, dict):
        raise RuntimeError("wechat notify resource is missing")
    transaction = decrypt_wechat_resource(resource, str(config["api_v3_key"]))
    out_trade_no = str(transaction.get("out_trade_no") or "").strip()
    if not out_trade_no:
        raise RuntimeError("wechat notify out_trade_no is missing")

    order = serialize_order(load_order_model(db, out_trade_no))
    payload_appid = str(transaction.get("appid") or "").strip()
    if payload_appid and payload_appid != str(config["appid"]):
        raise RuntimeError("wechat notify appid mismatch")
    payload_mchid = str(transaction.get("mchid") or "").strip()
    if payload_mchid and payload_mchid != str(config["mchid"]):
        raise RuntimeError("wechat notify mchid mismatch")
    amount = transaction.get("amount") or {}
    try:
        total = int((amount or {}).get("total"))
    except (TypeError, ValueError) as exc:
        raise RuntimeError("wechat notify returned invalid amount.total") from exc
    if total != int(order["amount_fen"]):
        raise RuntimeError("wechat notify amount mismatch")

    trade_state = str(transaction.get("trade_state") or "").strip()
    if trade_state != "SUCCESS":
        return {
            "trade_state": trade_state or "UNKNOWN",
            "out_trade_no": out_trade_no,
        }
    result = mark_order_paid_payload(db, out_trade_no)
    result["trade_state"] = trade_state
    return result


def load_order_qr_svg(db: Session, out_trade_no: str) -> bytes:
    order = load_order_model(db, out_trade_no)
    return qr_svg_bytes(order.code_url)


def ensure_payment_schema(engine: Engine) -> None:
    inspector = inspect(engine)
    if not inspector.has_table("app_users"):
        return

    user_columns = {column["name"] for column in inspector.get_columns("app_users")}
    order_exists = inspector.has_table("weixin_pay_demo_orders")
    order_columns = {column["name"] for column in inspector.get_columns("weixin_pay_demo_orders")} if order_exists else set()

    user_alters = {
        "daily_total_limit": "ALTER TABLE app_users ADD COLUMN daily_total_limit INT NOT NULL DEFAULT 20",
        "today_success_date": "ALTER TABLE app_users ADD COLUMN today_success_date DATE NULL",
        "today_success_count": "ALTER TABLE app_users ADD COLUMN today_success_count INT NOT NULL DEFAULT 0",
        "membership_status": "ALTER TABLE app_users ADD COLUMN membership_status VARCHAR(16) NOT NULL DEFAULT 'inactive'",
        "subscription_plan_code": "ALTER TABLE app_users ADD COLUMN subscription_plan_code VARCHAR(32) NULL",
        "subscription_plan_name": "ALTER TABLE app_users ADD COLUMN subscription_plan_name VARCHAR(64) NULL",
        "subscription_start_at": "ALTER TABLE app_users ADD COLUMN subscription_start_at VARCHAR(40) NULL",
        "subscription_expire_at": "ALTER TABLE app_users ADD COLUMN subscription_expire_at VARCHAR(40) NULL",
        "subscription_updated_at": "ALTER TABLE app_users ADD COLUMN subscription_updated_at VARCHAR(40) NULL",
    }
    order_alters = {
        "grant_days": "ALTER TABLE weixin_pay_demo_orders ADD COLUMN grant_days INT NOT NULL DEFAULT 0",
        "grant_unit": "ALTER TABLE weixin_pay_demo_orders ADD COLUMN grant_unit VARCHAR(16) NULL",
        "grant_value": "ALTER TABLE weixin_pay_demo_orders ADD COLUMN grant_value INT NOT NULL DEFAULT 0",
        "response_payload": "ALTER TABLE weixin_pay_demo_orders ADD COLUMN response_payload TEXT NULL",
        "warning_text": "ALTER TABLE weixin_pay_demo_orders ADD COLUMN warning_text TEXT NULL",
        "paid_at": "ALTER TABLE weixin_pay_demo_orders ADD COLUMN paid_at VARCHAR(40) NULL",
        "subscription_start_at": "ALTER TABLE weixin_pay_demo_orders ADD COLUMN subscription_start_at VARCHAR(40) NULL",
        "subscription_expire_at": "ALTER TABLE weixin_pay_demo_orders ADD COLUMN subscription_expire_at VARCHAR(40) NULL",
    }

    with engine.begin() as conn:
        for column_name, sql in user_alters.items():
            if column_name not in user_columns:
                conn.execute(text(sql))

        if not order_exists:
            WeixinPayOrder.__table__.create(bind=conn, checkfirst=True)
        else:
            for column_name, sql in order_alters.items():
                if column_name not in order_columns:
                    conn.execute(text(sql))
