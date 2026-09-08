-- Mailboat phone auth migration
-- Run this on the backend database used by app2.

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS agreed_terms_at DATETIME NULL AFTER password_hash;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS terms_version VARCHAR(32) NULL AFTER agreed_terms_at;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS terms_ip VARCHAR(64) NULL AFTER terms_version;

CREATE TABLE IF NOT EXISTS phone_verify_codes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  phone VARCHAR(20) NOT NULL,
  purpose VARCHAR(32) NOT NULL DEFAULT 'register',
  code_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  created_ip VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_phone_purpose_created (phone, purpose, created_at),
  INDEX idx_phone_purpose_expires (phone, purpose, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Optional cleanup when all services have switched to phone auth:
-- DROP TABLE IF EXISTS email_verify_codes;
