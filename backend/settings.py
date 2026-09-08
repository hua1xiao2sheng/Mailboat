import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8-sig', extra='ignore')

    database_url: str = 'mysql+pymysql://root:password@127.0.0.1:3306/mailpilot'
    jwt_secret: str = 'change-me'
    jwt_algo: str = 'HS256'
    jwt_exp_minutes: int = 10080  # 7 days
    admin_token: str = 'admin-change-me'
    upload_dir: str = 'uploads'
    smtp_host: str = ''
    smtp_port: int = 465
    smtp_use_ssl: bool = True
    smtp_user: str = ''
    smtp_password: str = ''
    smtp_from: str = ''
    verify_code_expire_seconds: int = 300
    verify_code_resend_seconds: int = 60
    verify_code_max_attempts: int = 5
    terms_version: str = 'v2.1'
    release_channel: str = 'windows'
    release_product_name: str = 'Mailboat'
    release_current_version: str = '1.0.0'
    release_latest_version: str = '1.0.0'
    release_package_name: str = 'Mailboat Setup 1.0.0.exe'
    release_platform: str = 'Windows 10/11 x64'
    release_download_url: str = ''
    release_notes: str = 'Update this row in MySQL to control download and force reinstall policy.'
    release_force_reinstall: bool = True
    redis_url: str = 'redis://127.0.0.1:6379/0'
    login_fail_window_seconds: int = 600
    login_fail_threshold: int = 3
    captcha_expire_seconds: int = 120
    captcha_max_attempts: int = 5
    captcha_length: int = 4
    sms_access_key_id: str = ''
    sms_access_key_secret: str = ''
    sms_provider: str = 'auto'  # auto | dysms | dypns
    sms_endpoint: str = 'dysmsapi.aliyuncs.com'
    sms_sign_name: str = ''
    sms_template_code: str = ''
    sms_template_param_code_key: str = 'code'
    sms_template_param_min_key: str = 'min'
    sms_template_param_extra_json: str = '{}'
    wechat_real_mode: bool = False
    wechat_appid: str = ''
    wechat_mchid: str = ''
    wechat_merchant_serial_no: str = ''
    wechat_private_key_path: str = ''
    wechat_platform_public_key_path: str = ''
    wechat_platform_serial_no: str = ''
    wechat_api_v3_key: str = ''
    wechat_notify_url: str = ''
    wechat_api_base: str = 'https://api.mch.weixin.qq.com'

settings = Settings()

os.makedirs(settings.upload_dir, exist_ok=True)
