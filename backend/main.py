from datetime import datetime, timedelta
import base64
import hashlib
import json
import random
import re
import secrets
from pathlib import Path
from urllib.parse import quote

from fastapi import FastAPI, Depends, HTTPException, Header, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import select, inspect, text

from db import Base, engine, get_db
from models import AppReleaseConfig, User, PhoneVerifyCode
from payments import (
    PaymentApiError,
    ensure_payment_schema,
    get_access_status_payload,
    load_order_qr_svg,
    prepare_order_payload,
    process_wechat_notify_payload,
    sync_wechat_order_payload,
)
from schemas import (
    AccessStatusOut,
    AppVersionCheckOut,
    AppVersionPublicOut,
    PreparedOrderOut,
    LoginRequest,
    PrepareOrderRequest,
    SyncOrderOut,
    UserOut,
    Token,
    SendCodeRequest,
    RegisterWithCodeRequest,
    ResetPasswordWithCodeRequest,
    CaptchaOut,
)
from auth import hash_password, verify_password, create_access_token
from settings import settings

app = FastAPI(title='Mailboat Backend')

DEFAULT_RELEASE_CHANNEL = str(settings.release_channel or 'windows').strip() or 'windows'
DEFAULT_PRODUCT_NAME = str(settings.release_product_name or 'Mailboat').strip() or 'Mailboat'
DEFAULT_PLATFORM = str(settings.release_platform or 'Windows 10/11 x64').strip() or 'Windows 10/11 x64'
APP_API_VERSION = str(settings.release_current_version or settings.release_latest_version or '1.0.0').strip() or '1.0.0'

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

@app.exception_handler(PaymentApiError)
def payment_api_error_handler(_: Request, exc: PaymentApiError) -> JSONResponse:
    return JSONResponse(status_code=exc.status, content={'ok': False, 'error': exc.message, **exc.extra})


def ensure_app_users_schema() -> None:
    inspector = inspect(engine)
    if not inspector.has_table('app_users'):
        return

    existing = {col['name'] for col in inspector.get_columns('app_users')}
    alter_sql = []
    if 'agreed_terms_at' not in existing:
        alter_sql.append('ALTER TABLE app_users ADD COLUMN agreed_terms_at DATETIME NULL AFTER password_hash')
    if 'terms_version' not in existing:
        alter_sql.append('ALTER TABLE app_users ADD COLUMN terms_version VARCHAR(32) NULL AFTER agreed_terms_at')
    if 'terms_ip' not in existing:
        alter_sql.append('ALTER TABLE app_users ADD COLUMN terms_ip VARCHAR(64) NULL AFTER terms_version')

    if not alter_sql:
        return

    with engine.begin() as conn:
        for sql in alter_sql:
            conn.execute(text(sql))

@app.on_event('startup')
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_app_users_schema()
    ensure_payment_schema(engine)
    with Session(engine) as db:
        ensure_default_release_config(db)

PHONE_REGEX = re.compile(r'^1[3-9]\d{9}$')
CAPTCHA_CODESET = '23456789'
REDIS_CAPTCHA_PREFIX = 'mailpilot:auth:captcha:'
REDIS_FAIL_IP_PREFIX = 'mailpilot:auth:fail:ip:'
REDIS_FAIL_PHONE_PREFIX = 'mailpilot:auth:fail:phone:'
_redis_client = None


def get_redis_client():
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    try:
        import redis
    except ImportError as err:
        raise RuntimeError('Redis client missing. Install: redis') from err
    _redis_client = redis.Redis.from_url(
        settings.redis_url,
        decode_responses=True,
        socket_connect_timeout=2,
        socket_timeout=2,
    )
    return _redis_client


def normalize_release_text(value: str | None) -> str:
    return str(value or '').strip()


def build_default_download_path(package_name: str) -> str:
    normalized = normalize_release_text(package_name)
    if not normalized:
        normalized = f'{DEFAULT_PRODUCT_NAME} Setup {APP_API_VERSION}.exe'
    return f"/downloads/{quote(normalized, safe='')}"


def coerce_release_bool(value, default: bool = True) -> bool:
    if isinstance(value, bool):
        return value
    text_value = normalize_release_text(value).lower()
    if not text_value:
        return default
    return text_value not in {'0', 'false', 'no', 'off'}


def default_release_payload() -> dict[str, str | bool | None]:
    configured_current = normalize_release_text(getattr(settings, 'release_current_version', ''))
    configured_latest = normalize_release_text(getattr(settings, 'release_latest_version', ''))
    current_version = configured_current or configured_latest or APP_API_VERSION
    latest_version = configured_latest or current_version
    package_name = (
        normalize_release_text(getattr(settings, 'release_package_name', ''))
        or f'{DEFAULT_PRODUCT_NAME} Setup {latest_version}.exe'
    )
    download_url = (
        normalize_release_text(getattr(settings, 'release_download_url', ''))
        or build_default_download_path(package_name)
    )
    return {
        'channel': DEFAULT_RELEASE_CHANNEL,
        'product_name': normalize_release_text(getattr(settings, 'release_product_name', '')) or DEFAULT_PRODUCT_NAME,
        'current_version': current_version,
        'latest_version': latest_version,
        'package_name': package_name,
        'platform': normalize_release_text(getattr(settings, 'release_platform', '')) or DEFAULT_PLATFORM,
        'download_url': download_url,
        'release_notes': normalize_release_text(getattr(settings, 'release_notes', '')) or None,
        'force_reinstall': coerce_release_bool(getattr(settings, 'release_force_reinstall', True), True),
    }


def get_release_config(db: Session, channel: str = DEFAULT_RELEASE_CHANNEL) -> AppReleaseConfig | None:
    release_channel = normalize_release_text(channel) or DEFAULT_RELEASE_CHANNEL
    return db.execute(
        select(AppReleaseConfig).where(AppReleaseConfig.channel == release_channel).limit(1)
    ).scalar_one_or_none()


def ensure_default_release_config(db: Session) -> AppReleaseConfig:
    config = get_release_config(db, DEFAULT_RELEASE_CHANNEL)
    if config is not None:
        return config

    config = AppReleaseConfig(**default_release_payload())
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


def get_release_config_or_404(db: Session, channel: str = DEFAULT_RELEASE_CHANNEL) -> AppReleaseConfig:
    config = get_release_config(db, channel)
    normalized_channel = normalize_release_text(channel) or DEFAULT_RELEASE_CHANNEL
    if config is None and normalized_channel == DEFAULT_RELEASE_CHANNEL:
        config = ensure_default_release_config(db)
    if config is None:
        raise HTTPException(status_code=404, detail=f'release channel not found: {normalized_channel}')
    return config


def resolve_public_download_url(download_url: str | None, request: Request | None = None) -> str:
    raw = normalize_release_text(download_url)
    if not raw:
        return raw
    if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*://', raw):
        return raw
    if request is None:
        return raw
    base_url = str(request.base_url).rstrip('/')
    if raw.startswith('/'):
        return f'{base_url}{raw}'
    return f"{base_url}/{raw.lstrip('/')}"


def serialize_release_config(
    config: AppReleaseConfig,
    request: Request | None = None,
) -> dict[str, str | bool | None]:
    current_version = normalize_release_text(config.current_version) or APP_API_VERSION
    latest_version = normalize_release_text(config.latest_version) or current_version
    package_name = (
        normalize_release_text(config.package_name)
        or f'{DEFAULT_PRODUCT_NAME} Setup {latest_version}.exe'
    )
    return {
        'channel': normalize_release_text(config.channel) or DEFAULT_RELEASE_CHANNEL,
        'product_name': normalize_release_text(config.product_name) or DEFAULT_PRODUCT_NAME,
        'current_version': current_version,
        'latest_version': latest_version,
        'package_name': package_name,
        'platform': normalize_release_text(config.platform) or DEFAULT_PLATFORM,
        'download_url': resolve_public_download_url(
            normalize_release_text(config.download_url) or build_default_download_path(package_name),
            request,
        ),
        'release_notes': normalize_release_text(config.release_notes) or None,
        'force_reinstall': bool(config.force_reinstall),
    }


def normalize_phone(value: str) -> str:
    phone = re.sub(r'[\s-]+', '', str(value or '').strip())
    if phone.startswith('+86'):
        phone = phone[3:]
    elif phone.startswith('86') and len(phone) == 13:
        phone = phone[2:]
    return phone


def is_valid_phone(value: str) -> bool:
    return bool(PHONE_REGEX.fullmatch(value))


def build_captcha_hash(challenge_id: str, code: str) -> str:
    secret = settings.jwt_secret or 'mailpilot-secret'
    raw = f'{challenge_id}|{str(code or "").strip().upper()}|{secret}'
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def build_captcha_image(code: str) -> str:
    width = 128
    height = 44
    bg = '#0b1220'
    border = '#1f2a3e'
    line_svg = []
    for _ in range(5):
        x1 = random.randint(0, width - 1)
        y1 = random.randint(0, height - 1)
        x2 = random.randint(0, width - 1)
        y2 = random.randint(0, height - 1)
        color = random.choice(['#2cc4ff', '#22d1a3', '#4b89ff'])
        line_svg.append(
            f"<line x1='{x1}' y1='{y1}' x2='{x2}' y2='{y2}' stroke='{color}' stroke-width='1' opacity='0.45'/>"
        )

    chars = []
    for idx, ch in enumerate(code):
        x = 18 + idx * 24 + random.randint(-2, 2)
        y = 30 + random.randint(-2, 2)
        rotate = random.randint(-18, 18)
        color = random.choice(['#e9f2ff', '#7be8ff', '#8ff3d2'])
        chars.append(
            f"<text x='{x}' y='{y}' fill='{color}' font-size='24' "
            f"font-family='monospace' font-weight='700' transform='rotate({rotate},{x},{y})'>{ch}</text>"
        )

    svg = (
        f"<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}' viewBox='0 0 {width} {height}'>"
        f"<rect width='100%' height='100%' rx='8' ry='8' fill='{bg}' stroke='{border}'/>"
        + ''.join(line_svg)
        + ''.join(chars)
        + '</svg>'
    )
    encoded = base64.b64encode(svg.encode('utf-8')).decode('ascii')
    return f'data:image/svg+xml;base64,{encoded}'


def build_captcha_challenge(phone: str, ip: str | None) -> dict:
    redis_client = get_redis_client()
    challenge_id = secrets.token_urlsafe(24)
    length = max(4, int(settings.captcha_length))
    code = ''.join(secrets.choice(CAPTCHA_CODESET) for _ in range(length))
    code_hash = build_captcha_hash(challenge_id, code)
    key = f'{REDIS_CAPTCHA_PREFIX}{challenge_id}'
    # Keep compatibility with older Redis servers that do not support
    # multi-field HSET in one call.
    redis_client.hset(key, 'code_hash', code_hash)
    redis_client.hset(key, 'phone', phone or '')
    redis_client.hset(key, 'ip', ip or '')
    redis_client.hset(key, 'attempts', '0')
    redis_client.expire(key, max(30, int(settings.captcha_expire_seconds)))
    return {
        'challenge_id': challenge_id,
        'image': build_captcha_image(code),
        'expires_in': max(30, int(settings.captcha_expire_seconds)),
    }


def get_login_fail_key_ip(ip: str) -> str:
    return f'{REDIS_FAIL_IP_PREFIX}{ip}'


def get_login_fail_key_phone(phone: str) -> str:
    return f'{REDIS_FAIL_PHONE_PREFIX}{phone}'


def should_require_login_captcha(phone: str, ip: str | None) -> bool:
    try:
        redis_client = get_redis_client()
        threshold = max(1, int(settings.login_fail_threshold))
        ip_count = 0
        if ip:
            ip_raw = redis_client.get(get_login_fail_key_ip(ip))
            ip_count = int(ip_raw or 0)
        phone_raw = redis_client.get(get_login_fail_key_phone(phone))
        phone_count = int(phone_raw or 0)
        return ip_count >= threshold or phone_count >= threshold
    except Exception:
        return False


def record_login_failure(phone: str, ip: str | None) -> None:
    try:
        redis_client = get_redis_client()
        window = max(60, int(settings.login_fail_window_seconds))
        phone_key = get_login_fail_key_phone(phone)
        redis_client.incr(phone_key)
        redis_client.expire(phone_key, window)
        if ip:
            ip_key = get_login_fail_key_ip(ip)
            redis_client.incr(ip_key)
            redis_client.expire(ip_key, window)
    except Exception:
        return


def clear_login_failures(phone: str, ip: str | None) -> None:
    try:
        redis_client = get_redis_client()
        keys = [get_login_fail_key_phone(phone)]
        if ip:
            keys.append(get_login_fail_key_ip(ip))
        if keys:
            redis_client.delete(*keys)
    except Exception:
        return


def verify_login_captcha(challenge_id: str, code: str, phone: str, ip: str | None) -> tuple[bool, str]:
    try:
        redis_client = get_redis_client()
    except Exception as err:
        return False, f'captcha_service_unavailable: {err}'

    cid = str(challenge_id or '').strip()
    ccode = str(code or '').strip()
    if not cid or not ccode:
        return False, 'captcha_required'
    key = f'{REDIS_CAPTCHA_PREFIX}{cid}'
    row = redis_client.hgetall(key)
    if not row:
        return False, 'captcha_expired'

    expected_phone = str(row.get('phone') or '').strip()
    expected_ip = str(row.get('ip') or '').strip()
    if expected_phone and expected_phone != phone:
        return False, 'captcha_mismatch'
    if expected_ip and ip and expected_ip != ip:
        return False, 'captcha_mismatch'

    attempts = int(row.get('attempts') or 0)
    max_attempts = max(1, int(settings.captcha_max_attempts))
    if attempts >= max_attempts:
        redis_client.delete(key)
        return False, 'captcha_expired'

    code_hash = str(row.get('code_hash') or '')
    if build_captcha_hash(cid, ccode) != code_hash:
        redis_client.hincrby(key, 'attempts', 1)
        return False, 'captcha_invalid'

    redis_client.delete(key)
    return True, ''


def generate_verify_code() -> str:
    return f'{secrets.randbelow(10_000):04d}'


def build_verify_code_hash(phone: str, purpose: str, code: str) -> str:
    secret = settings.jwt_secret or 'mailpilot-secret'
    raw = f'{phone}|{purpose}|{code}|{secret}'
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def build_sms_template_param(code: str) -> str:
    payload = {}
    code_key = str(settings.sms_template_param_code_key or '').strip() or 'code'
    payload[code_key] = code

    min_key = str(settings.sms_template_param_min_key or '').strip()
    if min_key:
        ttl_minutes = max(1, (int(settings.verify_code_expire_seconds) + 59) // 60)
        payload[min_key] = str(ttl_minutes)

    extra_raw = str(settings.sms_template_param_extra_json or '').strip()
    if extra_raw:
        try:
            extra = json.loads(extra_raw)
        except json.JSONDecodeError as err:
            raise RuntimeError(f'Invalid sms_template_param_extra_json: {err}') from err
        if not isinstance(extra, dict):
            raise RuntimeError('sms_template_param_extra_json must be JSON object')
        for key, value in extra.items():
            key_text = str(key).strip()
            if key_text and key_text not in payload:
                payload[key_text] = value

    return json.dumps(payload, ensure_ascii=False)


def build_dypns_template_param() -> str:
    payload = {}
    code_key = str(settings.sms_template_param_code_key or '').strip() or 'code'
    payload[code_key] = '##code##'

    min_key = str(settings.sms_template_param_min_key or '').strip()
    if min_key:
        ttl_minutes = max(1, (int(settings.verify_code_expire_seconds) + 59) // 60)
        payload[min_key] = str(ttl_minutes)

    # Keep this payload minimal to match Dypns verify template expectations.
    return json.dumps(payload, ensure_ascii=False)


def resolve_sms_provider() -> str:
    raw = str(settings.sms_provider or 'auto').strip().lower()
    if raw not in ('auto', 'dysms', 'dypns'):
        raise RuntimeError('sms_provider must be one of: auto, dysms, dypns')
    if raw == 'auto':
        template_code = str(settings.sms_template_code or '').strip()
        return 'dypns' if re.fullmatch(r'\d+', template_code) else 'dysms'
    return raw


def resolve_sms_endpoint(provider: str) -> str:
    configured = str(settings.sms_endpoint or '').strip()
    if configured:
        lowered = configured.lower()
        if provider == 'dypns' and 'dysmsapi' in lowered:
            return 'dypnsapi.aliyuncs.com'
        if provider == 'dysms' and 'dypnsapi' in lowered:
            return 'dysmsapi.aliyuncs.com'
        return configured
    return 'dypnsapi.aliyuncs.com' if provider == 'dypns' else 'dysmsapi.aliyuncs.com'


def send_verify_code_via_dysms(phone: str, code: str) -> str:
    try:
        from alibabacloud_dysmsapi20170525 import models as dysmsapi_models
        from alibabacloud_dysmsapi20170525.client import Client as DysmsapiClient
        from alibabacloud_tea_openapi import models as open_api_models
        from alibabacloud_tea_util import models as util_models
    except ImportError as err:
        raise RuntimeError(
            'Aliyun SMS SDK missing. Install: alibabacloud-dysmsapi20170525 alibabacloud-tea-openapi alibabacloud-tea-util'
        ) from err

    config = open_api_models.Config(
        access_key_id=settings.sms_access_key_id,
        access_key_secret=settings.sms_access_key_secret,
    )
    config.endpoint = resolve_sms_endpoint('dysms')
    client = DysmsapiClient(config)

    request = dysmsapi_models.SendSmsRequest(
        phone_numbers=phone,
        sign_name=settings.sms_sign_name,
        template_code=settings.sms_template_code,
        template_param=build_sms_template_param(code),
    )
    response = client.send_sms_with_options(request, util_models.RuntimeOptions())
    body = response.body
    result_code = getattr(body, 'code', '') or ''
    if result_code != 'OK':
        result_message = getattr(body, 'message', '') or ''
        raise RuntimeError(f'{result_code}: {result_message}')
    return code


def send_verify_code_via_dypns(phone: str) -> str:
    try:
        from alibabacloud_dypnsapi20170525.client import Client as DypnsapiClient
        from alibabacloud_dypnsapi20170525 import models as dypns_models
        from alibabacloud_tea_openapi import models as open_api_models
        from alibabacloud_tea_util import models as util_models
    except ImportError as err:
        raise RuntimeError(
            'Aliyun Dypns SDK missing. Install: alibabacloud-dypnsapi20170525 alibabacloud-tea-openapi alibabacloud-tea-util'
        ) from err

    config = open_api_models.Config(
        access_key_id=settings.sms_access_key_id,
        access_key_secret=settings.sms_access_key_secret,
    )
    config.endpoint = resolve_sms_endpoint('dypns')
    client = DypnsapiClient(config)

    request = dypns_models.SendSmsVerifyCodeRequest(
        phone_number=phone,
        sign_name=settings.sms_sign_name,
        template_code=settings.sms_template_code,
        template_param=build_dypns_template_param(),
        code_length=4,
        return_verify_code=True,
    )
    response = client.send_sms_verify_code_with_options(request, util_models.RuntimeOptions())
    body = getattr(response, 'body', None)
    result_code = getattr(body, 'code', '') if body else ''
    if result_code and result_code != 'OK':
        result_message = getattr(body, 'message', '') or ''
        raise RuntimeError(f'{result_code}: {result_message}')
    model = getattr(body, 'model', None) if body else None
    verify_code = getattr(model, 'verify_code', None) if model else None
    verify_code_text = str(verify_code or '').strip()
    if not verify_code_text:
        raise RuntimeError('SMS provider did not return verify code')
    return verify_code_text


def send_verify_code_sms(phone: str, code: str) -> tuple[str, str]:
    if not settings.sms_access_key_id or not settings.sms_access_key_secret:
        raise RuntimeError('SMS access key is not configured')
    if not settings.sms_sign_name:
        raise RuntimeError('SMS sign name is not configured')
    if not settings.sms_template_code:
        raise RuntimeError('SMS template code is not configured')

    provider = resolve_sms_provider()
    if provider == 'dypns':
        sent_code = send_verify_code_via_dypns(phone)
        return provider, sent_code
    sent_code = send_verify_code_via_dysms(phone, code)
    return provider, sent_code


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(status_code=401, detail='Missing token')
    token = authorization.split(' ', 1)[1]
    try:
        from jose import jwt

        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algo])
        username = payload.get('sub')
    except Exception:
        raise HTTPException(status_code=401, detail='Invalid token')
    if not username:
        raise HTTPException(status_code=401, detail='Invalid token')
    user = db.scalar(select(User).where(User.username == username))
    if not user:
        raise HTTPException(status_code=401, detail='User not found')
    return user


@app.get('/health')
def health():
    return {'ok': True}


@app.get('/public/app-version', response_model=AppVersionPublicOut)
def public_app_version(
    request: Request,
    channel: str = DEFAULT_RELEASE_CHANNEL,
    db: Session = Depends(get_db),
):
    config = get_release_config_or_404(db, channel)
    return AppVersionPublicOut(**serialize_release_config(config, request))


@app.get('/public/app-version/check', response_model=AppVersionCheckOut)
def public_app_version_check(
    request: Request,
    version: str,
    channel: str = DEFAULT_RELEASE_CHANNEL,
    db: Session = Depends(get_db),
):
    client_version = normalize_release_text(version)
    if not client_version:
        raise HTTPException(status_code=400, detail='version is required')

    config = get_release_config_or_404(db, channel)
    payload = serialize_release_config(config, request)
    current_version = normalize_release_text(payload['current_version'])
    latest_version = normalize_release_text(payload['latest_version'])
    force_reinstall = bool(payload['force_reinstall'])
    version_matches = client_version == current_version
    requires_reinstall = force_reinstall and not version_matches
    allow_open = version_matches or not force_reinstall

    if version_matches:
        reason = 'version matched current release'
    elif requires_reinstall:
        reason = f'client version {client_version} must reinstall {latest_version}'
    else:
        reason = f'client version {client_version} differs from current release {current_version}'

    return AppVersionCheckOut(
        **payload,
        client_version=client_version,
        allow_open=allow_open,
        requires_reinstall=requires_reinstall,
        reason=reason,
    )


@app.post('/auth/register')
def register_deprecated():
    raise HTTPException(status_code=400, detail='Please use /auth/register-with-code')


def send_verification_code_for_purpose(
    phone: str,
    purpose: str,
    request: Request,
    db: Session,
) -> dict:
    now = datetime.utcnow()
    cooldown_seconds = max(1, int(settings.verify_code_resend_seconds))
    latest = db.scalar(
        select(PhoneVerifyCode)
        .where(PhoneVerifyCode.phone == phone, PhoneVerifyCode.purpose == purpose)
        .order_by(PhoneVerifyCode.id.desc())
    )
    if latest and latest.created_at:
        passed = (now - latest.created_at).total_seconds()
        if passed < cooldown_seconds:
            remaining = max(1, cooldown_seconds - int(passed))
            raise HTTPException(status_code=429, detail=f'Please retry in {remaining}s')

    code = generate_verify_code()
    try:
        _, sent_code = send_verify_code_sms(phone, code)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f'Failed to send verification code: {err}')

    code_for_hash = sent_code or code
    expires_at = now + timedelta(seconds=max(60, int(settings.verify_code_expire_seconds)))
    ip = request.client.host if request and request.client else None
    row = PhoneVerifyCode(
        phone=phone,
        purpose=purpose,
        code_hash=build_verify_code_hash(phone, purpose, code_for_hash),
        expires_at=expires_at,
        created_ip=ip,
    )
    db.add(row)
    db.commit()
    return {'ok': True, 'message': 'Verification code sent', 'retry_after': cooldown_seconds}


@app.get('/auth/captcha', response_model=CaptchaOut)
def get_login_captcha(request: Request, phone: str = Query(default='')):
    normalized_phone = normalize_phone(phone) if phone else ''
    if normalized_phone and not is_valid_phone(normalized_phone):
        normalized_phone = ''
    ip = request.client.host if request and request.client else ''
    try:
        challenge = build_captcha_challenge(normalized_phone, ip)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f'Captcha service unavailable: {err}')
    return CaptchaOut(
        challenge_id=challenge['challenge_id'],
        image=challenge['image'],
        expires_in=challenge['expires_in'],
    )


@app.post('/auth/send-code')
def send_code(payload: SendCodeRequest, request: Request, db: Session = Depends(get_db)):
    phone = normalize_phone(payload.phone)
    if not is_valid_phone(phone):
        raise HTTPException(status_code=400, detail='Invalid phone number')

    exists_user = db.scalar(select(User).where(User.username == phone))
    if exists_user:
        raise HTTPException(status_code=400, detail='Phone already registered')

    return send_verification_code_for_purpose(phone, 'register', request, db)


@app.post('/auth/send-reset-code')
def send_reset_code(payload: SendCodeRequest, request: Request, db: Session = Depends(get_db)):
    phone = normalize_phone(payload.phone)
    if not is_valid_phone(phone):
        raise HTTPException(status_code=400, detail='Invalid phone number')

    exists_user = db.scalar(select(User).where(User.username == phone))
    if not exists_user:
        raise HTTPException(status_code=400, detail='Phone not registered')

    return send_verification_code_for_purpose(phone, 'reset_password', request, db)


@app.post('/auth/register-with-code', response_model=UserOut)
def register_with_code(payload: RegisterWithCodeRequest, request: Request, db: Session = Depends(get_db)):
    phone = normalize_phone(payload.phone)
    password = str(payload.password or '')
    code = str(payload.code or '').strip()
    purpose = 'register'

    if not payload.agree_terms:
        raise HTTPException(status_code=400, detail='Please agree to the terms first')
    if not is_valid_phone(phone):
        raise HTTPException(status_code=400, detail='Invalid phone number')
    if len(password.encode('utf-8')) > 72:
        raise HTTPException(status_code=400, detail='Password too long (bcrypt limit 72 bytes)')
    if not re.fullmatch(r'\d{4}', code):
        raise HTTPException(status_code=400, detail='Verification code must be 4 digits')

    exists_user = db.scalar(select(User).where(User.username == phone))
    if exists_user:
        raise HTTPException(status_code=400, detail='Phone already registered')

    now = datetime.utcnow()
    ip = request.client.host if request and request.client else None
    code_row = db.scalar(
        select(PhoneVerifyCode)
        .where(
            PhoneVerifyCode.phone == phone,
            PhoneVerifyCode.purpose == purpose,
            PhoneVerifyCode.used_at.is_(None),
            PhoneVerifyCode.expires_at >= now,
        )
        .order_by(PhoneVerifyCode.id.desc())
    )
    if not code_row:
        raise HTTPException(status_code=400, detail='Invalid or expired verification code')

    max_attempts = max(1, int(settings.verify_code_max_attempts))
    if int(code_row.attempt_count or 0) >= max_attempts:
        raise HTTPException(status_code=400, detail='Invalid or expired verification code')

    expected_hash = build_verify_code_hash(phone, purpose, code)
    if code_row.code_hash != expected_hash:
        code_row.attempt_count = int(code_row.attempt_count or 0) + 1
        db.add(code_row)
        db.commit()
        raise HTTPException(status_code=400, detail='Invalid or expired verification code')

    code_row.used_at = now
    db.add(code_row)

    terms_version = str(settings.terms_version or 'v2.1').strip()[:32]
    user = User(
        username=phone,
        password_hash=hash_password(password),
        agreed_terms_at=now,
        terms_version=terms_version or 'v2.1',
        terms_ip=(str(ip).strip()[:64] if ip else None),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post('/auth/reset-password-with-code')
def reset_password_with_code(payload: ResetPasswordWithCodeRequest, request: Request, db: Session = Depends(get_db)):
    phone = normalize_phone(payload.phone)
    password = str(payload.password or '')
    code = str(payload.code or '').strip()
    purpose = 'reset_password'

    if not is_valid_phone(phone):
        raise HTTPException(status_code=400, detail='Invalid phone number')
    if len(password.encode('utf-8')) > 72:
        raise HTTPException(status_code=400, detail='Password too long (bcrypt limit 72 bytes)')
    if not re.fullmatch(r'\d{4}', code):
        raise HTTPException(status_code=400, detail='Verification code must be 4 digits')

    user = db.scalar(select(User).where(User.username == phone))
    if not user:
        raise HTTPException(status_code=400, detail='Phone not registered')

    now = datetime.utcnow()
    code_row = db.scalar(
        select(PhoneVerifyCode)
        .where(
            PhoneVerifyCode.phone == phone,
            PhoneVerifyCode.purpose == purpose,
            PhoneVerifyCode.used_at.is_(None),
            PhoneVerifyCode.expires_at >= now,
        )
        .order_by(PhoneVerifyCode.id.desc())
    )
    if not code_row:
        raise HTTPException(status_code=400, detail='Invalid or expired verification code')

    max_attempts = max(1, int(settings.verify_code_max_attempts))
    if int(code_row.attempt_count or 0) >= max_attempts:
        raise HTTPException(status_code=400, detail='Invalid or expired verification code')

    expected_hash = build_verify_code_hash(phone, purpose, code)
    if code_row.code_hash != expected_hash:
        code_row.attempt_count = int(code_row.attempt_count or 0) + 1
        db.add(code_row)
        db.commit()
        raise HTTPException(status_code=400, detail='Invalid or expired verification code')

    code_row.used_at = now
    user.password_hash = hash_password(password)
    db.add(code_row)
    db.add(user)
    db.commit()

    ip = request.client.host if request and request.client else None
    clear_login_failures(phone, ip)
    return {'ok': True, 'message': 'Password reset successful'}


@app.post('/auth/login', response_model=Token)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    phone = normalize_phone(payload.phone)
    password_bytes = payload.password.encode('utf-8')
    ip = request.client.host if request and request.client else ''
    if not is_valid_phone(phone):
        raise HTTPException(status_code=400, detail='Invalid phone number')
    if len(password_bytes) > 72:
        raise HTTPException(status_code=400, detail='Password too long (bcrypt limit 72 bytes)')

    captcha_required = should_require_login_captcha(phone, ip)
    if captcha_required:
        ok, reason = verify_login_captcha(
            payload.captcha_id or '',
            payload.captcha_code or '',
            phone,
            ip,
        )
        if not ok:
            return JSONResponse(
                status_code=400,
                content={
                    'detail': reason or 'captcha_required',
                    'captcha_required': True,
                },
            )

    user = db.scalar(select(User).where(User.username == phone))
    if not user or not verify_password(payload.password, user.password_hash):
        record_login_failure(phone, ip)
        return JSONResponse(
            status_code=401,
            content={
                'detail': 'Invalid credentials',
                'captcha_required': should_require_login_captcha(phone, ip),
            },
        )
    clear_login_failures(phone, ip)
    token = create_access_token(user.username)
    return Token(access_token=token)


@app.get('/me', response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@app.get('/api/user/access', response_model=AccessStatusOut)
def get_user_access_status(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return AccessStatusOut(**get_access_status_payload(db, user.username))


@app.post('/api/orders/prepare', response_model=PreparedOrderOut)
def prepare_order(
    payload: PrepareOrderRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    requested_username = str(payload.username or '').strip()
    if requested_username and requested_username != user.username:
        raise HTTPException(status_code=403, detail='username mismatch')
    return PreparedOrderOut(
        **prepare_order_payload(db, user.username, payload.plan_code, force_refresh=payload.refresh)
    )


@app.get('/api/orders/{out_trade_no}/qrcode.svg')
def get_order_qrcode_svg(
    out_trade_no: str,
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return Response(
        content=load_order_qr_svg(db, out_trade_no),
        media_type='image/svg+xml',
        headers={'Cache-Control': 'no-store'},
    )


@app.post('/api/orders/{out_trade_no}/sync', response_model=SyncOrderOut)
def sync_wechat_order(
    out_trade_no: str,
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return SyncOrderOut(**sync_wechat_order_payload(db, out_trade_no))


@app.post('/api/wechat/notify')
async def wechat_notify(request: Request, db: Session = Depends(get_db)) -> JSONResponse:
    raw_body = await request.body()
    try:
        process_wechat_notify_payload(db, raw_body, request.headers)
    except Exception as exc:
        db.rollback()
        return JSONResponse(status_code=500, content={'code': 'FAIL', 'message': str(exc)})
    return JSONResponse(status_code=200, content={'code': 'SUCCESS', 'message': 'OK'})


# Keep these mounts at the end so API routes take priority.
downloads_dir = Path(__file__).resolve().parent / 'downloads'
if downloads_dir.is_dir():
    app.mount('/downloads', StaticFiles(directory=str(downloads_dir)), name='downloads')

# Serve only files inside backend/html (no dependency on project-level folders).
site_dir = Path(__file__).resolve().parent / 'html'
if site_dir.is_dir():
    app.mount('/', StaticFiles(directory=str(site_dir), html=True), name='site')
