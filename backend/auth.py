from datetime import datetime, timedelta
from jose import jwt
from passlib.context import CryptContext
from settings import settings

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def create_access_token(subject: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.jwt_exp_minutes)
    payload = {'sub': subject, 'exp': expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algo)