from datetime import date, datetime
from sqlalchemy import BigInteger, Boolean, Column, Date, DateTime, Integer, String, Text, UniqueConstraint
from db import Base

class User(Base):
    __tablename__ = 'app_users'

    id = Column(Integer, primary_key=True)
    username = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    daily_total_limit = Column(Integer, nullable=False, default=20)
    today_success_date = Column(Date, nullable=True)
    today_success_count = Column(Integer, nullable=False, default=0)
    membership_status = Column(String(16), nullable=False, default='inactive')
    subscription_plan_code = Column(String(32), nullable=True)
    subscription_plan_name = Column(String(64), nullable=True)
    subscription_start_at = Column(String(40), nullable=True)
    subscription_expire_at = Column(String(40), nullable=True)
    subscription_updated_at = Column(String(40), nullable=True)
    agreed_terms_at = Column(DateTime, nullable=True)
    terms_version = Column(String(32), nullable=True)
    terms_ip = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class PhoneVerifyCode(Base):
    __tablename__ = 'phone_verify_codes'

    id = Column(Integer, primary_key=True)
    phone = Column(String(32), index=True, nullable=False)
    purpose = Column(String(32), index=True, nullable=False, default='register')
    code_hash = Column(String(128), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    attempt_count = Column(Integer, nullable=False, default=0)
    created_ip = Column(String(64), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class AppReleaseConfig(Base):
    __tablename__ = 'app_release_configs'
    __table_args__ = (UniqueConstraint('channel', name='uk_app_release_channel'),)

    id = Column(BigInteger().with_variant(Integer, 'sqlite'), primary_key=True, autoincrement=True)
    channel = Column(String(32), nullable=False, default='windows')
    product_name = Column(String(128), nullable=False)
    current_version = Column(String(32), nullable=False)
    latest_version = Column(String(32), nullable=False)
    package_name = Column(String(255), nullable=True)
    platform = Column(String(64), nullable=True)
    download_url = Column(String(512), nullable=True)
    release_notes = Column(Text, nullable=True)
    force_reinstall = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class WeixinPayOrder(Base):
    __tablename__ = 'weixin_pay_demo_orders'

    out_trade_no = Column(String(40), primary_key=True)
    username = Column(String(64), nullable=False, index=True)
    plan_code = Column(String(32), nullable=False)
    plan_name = Column(String(64), nullable=False)
    description = Column(String(127), nullable=False)
    amount_fen = Column(Integer, nullable=False)
    grant_days = Column(Integer, nullable=False, default=0)
    grant_unit = Column(String(16), nullable=True)
    grant_value = Column(Integer, nullable=False, default=0)
    status = Column(String(16), nullable=False)
    provider = Column(String(16), nullable=False)
    code_url = Column(Text, nullable=False)
    response_payload = Column(Text, nullable=True)
    warning_text = Column(Text, nullable=True)
    created_at = Column(String(40), nullable=False)
    paid_at = Column(String(40), nullable=True)
    subscription_start_at = Column(String(40), nullable=True)
    subscription_expire_at = Column(String(40), nullable=True)
