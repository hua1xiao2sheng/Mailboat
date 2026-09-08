from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    phone: str
    password: str
    captcha_id: str | None = None
    captcha_code: str | None = None


class UserOut(BaseModel):
    id: int
    username: str

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = 'bearer'


class SendCodeRequest(BaseModel):
    phone: str


class RegisterWithCodeRequest(BaseModel):
    phone: str
    password: str
    code: str
    agree_terms: bool = False


class ResetPasswordWithCodeRequest(BaseModel):
    phone: str
    password: str
    code: str


class CaptchaOut(BaseModel):
    challenge_id: str
    image: str
    expires_in: int


class AppVersionPublicOut(BaseModel):
    channel: str
    product_name: str
    current_version: str
    latest_version: str
    package_name: str | None = None
    platform: str | None = None
    download_url: str | None = None
    release_notes: str | None = None
    force_reinstall: bool = True


class AppVersionCheckOut(AppVersionPublicOut):
    client_version: str
    allow_open: bool
    requires_reinstall: bool
    reason: str


class PaymentPlanOut(BaseModel):
    code: str
    name: str
    description: str
    amount_fen: int
    amount_yuan: str
    grant_days: int = 0
    grant_unit: str = ""
    grant_value: int = 0
    grant_label: str = ""


class PaymentOrderOut(BaseModel):
    out_trade_no: str
    username: str
    plan_code: str
    plan_name: str
    description: str
    amount_fen: int
    amount_yuan: str
    grant_days: int = 0
    grant_unit: str = ""
    grant_value: int = 0
    grant_label: str = ""
    status: str
    provider: str
    code_url: str
    warning_text: str = ""
    created_at: str
    paid_at: str | None = None
    subscription_start_at: str | None = None
    subscription_expire_at: str | None = None


class AccessUserOut(BaseModel):
    username: str
    membership_status: str
    subscription_active: bool
    subscription_plan_code: str = ""
    subscription_plan_name: str = ""
    subscription_start_at: str | None = None
    subscription_expire_at: str | None = None
    subscription_remaining_days: int = 0
    daily_free_send_limit: int
    today_success_count: int
    daily_free_remaining_count: int
    access_mode: str
    can_send: bool
    recent_orders: list[PaymentOrderOut] = Field(default_factory=list)


class AccessStatusOut(BaseModel):
    ok: bool = True
    user: AccessUserOut
    plans: list[PaymentPlanOut] = Field(default_factory=list)
    default_plan_code: str
    payment_provider: str
    real_mode: bool
    prepared_order_ttl_seconds: int


class PrepareOrderRequest(BaseModel):
    username: str
    plan_code: str
    refresh: bool = False


class PreparedOrderOut(BaseModel):
    ok: bool = True
    order: PaymentOrderOut
    user: AccessUserOut
    prepared: bool = True
    reused: bool = False
    ttl_seconds: int
    expires_in_seconds: int


class SyncOrderOut(BaseModel):
    ok: bool = True
    order: PaymentOrderOut
    user: AccessUserOut
    trade_state: str | None = None
    sync_message: str | None = None
