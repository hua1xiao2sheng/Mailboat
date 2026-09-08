-- Mailboat unified schema migration
-- Target: MySQL 8.x / MariaDB 10.x
-- Notes:
-- 1) Idempotent: safe to run multiple times.
-- 2) Includes auth, phone verification, sender account sync, daily stats, quota snapshot,
--    announcement, and feedback setting tables.

SET NAMES utf8mb4;
SET sql_safe_updates = 0;

/* --------------------------------------------------------------------------
   app_users
-------------------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS app_users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  agreed_terms_at DATETIME NULL,
  terms_version VARCHAR(32) NULL,
  terms_ip VARCHAR(64) NULL,
  daily_total_limit INT NOT NULL DEFAULT 20 COMMENT 'User daily free total send limit',
  today_success_date DATE NULL COMMENT 'Beijing date for today_success_count',
  today_success_count INT NOT NULL DEFAULT 0 COMMENT 'Today success total by user',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_users' AND COLUMN_NAME = 'username'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE app_users ADD COLUMN username VARCHAR(255) NOT NULL DEFAULT ''''',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_users' AND COLUMN_NAME = 'password_hash'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE app_users ADD COLUMN password_hash VARCHAR(255) NOT NULL DEFAULT ''''',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_users' AND COLUMN_NAME = 'agreed_terms_at'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE app_users ADD COLUMN agreed_terms_at DATETIME NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_users' AND COLUMN_NAME = 'terms_version'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE app_users ADD COLUMN terms_version VARCHAR(32) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_users' AND COLUMN_NAME = 'terms_ip'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE app_users ADD COLUMN terms_ip VARCHAR(64) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_users' AND COLUMN_NAME = 'daily_total_limit'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE app_users ADD COLUMN daily_total_limit INT NOT NULL DEFAULT 20 COMMENT ''User daily free total send limit''',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_users' AND COLUMN_NAME = 'today_success_date'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE app_users ADD COLUMN today_success_date DATE NULL COMMENT ''Beijing date for today_success_count''',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_users' AND COLUMN_NAME = 'today_success_count'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE app_users ADD COLUMN today_success_count INT NOT NULL DEFAULT 0 COMMENT ''Today success total by user''',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_users' AND COLUMN_NAME = 'created_at'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE app_users ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE app_users
SET daily_total_limit = 20
WHERE daily_total_limit IS NULL OR daily_total_limit <= 0;

UPDATE app_users
SET today_success_count = 0
WHERE today_success_count IS NULL OR today_success_count < 0;

SET @has_uk_username := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'app_users'
    AND COLUMN_NAME = 'username'
    AND NON_UNIQUE = 0
);
SET @dup_username := (
  SELECT COUNT(*) FROM (
    SELECT username
    FROM app_users
    GROUP BY username
    HAVING COUNT(*) > 1
  ) t
);
SET @sql := IF(@has_uk_username = 0 AND @dup_username = 0,
  'ALTER TABLE app_users ADD UNIQUE KEY uk_app_users_username (username)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

/* --------------------------------------------------------------------------
   phone_verify_codes
-------------------------------------------------------------------------- */
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

SET @has_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'phone_verify_codes' AND INDEX_NAME = 'idx_phone_purpose_created'
);
SET @sql := IF(@has_idx = 0,
  'ALTER TABLE phone_verify_codes ADD INDEX idx_phone_purpose_created (phone, purpose, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'phone_verify_codes' AND INDEX_NAME = 'idx_phone_purpose_expires'
);
SET @sql := IF(@has_idx = 0,
  'ALTER TABLE phone_verify_codes ADD INDEX idx_phone_purpose_expires (phone, purpose, expires_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

/* --------------------------------------------------------------------------
   sender_accounts
-------------------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS sender_accounts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  sender_email VARCHAR(255) NOT NULL,
  sender_name VARCHAR(255) NULL,
  smtp_server VARCHAR(255) NULL,
  smtp_port INT NULL,
  min_delay INT NULL,
  max_delay INT NULL,
  start_time_bj VARCHAR(32) NULL,
  daily_limit INT NOT NULL DEFAULT 20 COMMENT 'legacy per-account limit',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sender_accounts' AND COLUMN_NAME = 'sender_name'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE sender_accounts ADD COLUMN sender_name VARCHAR(255) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sender_accounts' AND COLUMN_NAME = 'smtp_server'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE sender_accounts ADD COLUMN smtp_server VARCHAR(255) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sender_accounts' AND COLUMN_NAME = 'smtp_port'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE sender_accounts ADD COLUMN smtp_port INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sender_accounts' AND COLUMN_NAME = 'min_delay'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE sender_accounts ADD COLUMN min_delay INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sender_accounts' AND COLUMN_NAME = 'max_delay'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE sender_accounts ADD COLUMN max_delay INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sender_accounts' AND COLUMN_NAME = 'start_time_bj'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE sender_accounts ADD COLUMN start_time_bj VARCHAR(32) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sender_accounts' AND COLUMN_NAME = 'daily_limit'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE sender_accounts ADD COLUMN daily_limit INT NOT NULL DEFAULT 20 COMMENT ''legacy per-account limit''',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE sender_accounts
SET daily_limit = 20
WHERE daily_limit IS NULL OR daily_limit <= 0;

-- De-duplicate before unique index.
DELETE a1
FROM sender_accounts a1
JOIN sender_accounts a2
  ON a1.user_id = a2.user_id
 AND LOWER(a1.sender_email) = LOWER(a2.sender_email)
 AND a1.id > a2.id;

SET @has_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sender_accounts' AND INDEX_NAME = 'idx_sender_accounts_user_id'
);
SET @sql := IF(@has_idx = 0,
  'ALTER TABLE sender_accounts ADD INDEX idx_sender_accounts_user_id (user_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_uk := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sender_accounts' AND INDEX_NAME = 'uk_user_sender_email'
);
SET @sql := IF(@has_uk = 0,
  'ALTER TABLE sender_accounts ADD UNIQUE KEY uk_user_sender_email (user_id, sender_email)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

/* --------------------------------------------------------------------------
   sender_daily_stats
-------------------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS sender_daily_stats (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  sender_account_id BIGINT NOT NULL,
  stat_date DATE NOT NULL COMMENT 'Beijing date',
  success_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sender_daily_stats' AND COLUMN_NAME = 'success_count'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE sender_daily_stats ADD COLUMN success_count INT NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE sender_daily_stats
SET success_count = 0
WHERE success_count IS NULL OR success_count < 0;

-- Merge duplicates before unique index.
UPDATE sender_daily_stats s
JOIN (
  SELECT MIN(id) AS keep_id, sender_account_id, stat_date, COALESCE(SUM(success_count), 0) AS total_success
  FROM sender_daily_stats
  GROUP BY sender_account_id, stat_date
) t ON s.id = t.keep_id
SET s.success_count = t.total_success;

DELETE s1
FROM sender_daily_stats s1
JOIN sender_daily_stats s2
  ON s1.sender_account_id = s2.sender_account_id
 AND s1.stat_date = s2.stat_date
 AND s1.id > s2.id;

SET @has_uk := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sender_daily_stats' AND INDEX_NAME = 'uk_sender_account_date'
);
SET @sql := IF(@has_uk = 0,
  'ALTER TABLE sender_daily_stats ADD UNIQUE KEY uk_sender_account_date (sender_account_id, stat_date)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sender_daily_stats' AND INDEX_NAME = 'idx_stats_user_date'
);
SET @sql := IF(@has_idx = 0,
  'ALTER TABLE sender_daily_stats ADD INDEX idx_stats_user_date (user_id, stat_date)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

/* --------------------------------------------------------------------------
   app_settings (for feedback receiver and other key/value settings)
-------------------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS app_settings (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  `key` VARCHAR(128) NOT NULL,
  `value` TEXT NULL,
  description VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- De-duplicate before unique index.
DELETE s1
FROM app_settings s1
JOIN app_settings s2
  ON s1.`key` = s2.`key`
 AND s1.id > s2.id;

SET @has_uk := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_settings' AND INDEX_NAME = 'uk_app_settings_key'
);
SET @sql := IF(@has_uk = 0,
  'ALTER TABLE app_settings ADD UNIQUE KEY uk_app_settings_key (`key`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO app_settings (`key`, `value`, description)
SELECT 'feedback_email', '', 'Feedback receiver email'
WHERE NOT EXISTS (
  SELECT 1 FROM app_settings WHERE `key` = 'feedback_email'
);

/* --------------------------------------------------------------------------
   announcements
-------------------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS announcements (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  content TEXT NOT NULL,
  level VARCHAR(16) NOT NULL DEFAULT 'info',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  start_at DATETIME NULL,
  end_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @has_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'announcements' AND INDEX_NAME = 'idx_ann_active_time'
);
SET @sql := IF(@has_idx = 0,
  'ALTER TABLE announcements ADD INDEX idx_ann_active_time (is_active, start_at, end_at, updated_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

/* --------------------------------------------------------------------------
   app_release_configs
-------------------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS app_release_configs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  channel VARCHAR(32) NOT NULL,
  product_name VARCHAR(128) NOT NULL,
  current_version VARCHAR(32) NOT NULL,
  latest_version VARCHAR(32) NOT NULL,
  package_name VARCHAR(255) NULL,
  platform VARCHAR(64) NULL,
  download_url VARCHAR(512) NULL,
  release_notes TEXT NULL,
  force_reinstall TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @has_uk := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_release_configs' AND INDEX_NAME = 'uk_app_release_channel'
);
SET @sql := IF(@has_uk = 0,
  'ALTER TABLE app_release_configs ADD UNIQUE KEY uk_app_release_channel (channel)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO app_release_configs (
  channel,
  product_name,
  current_version,
  latest_version,
  package_name,
  platform,
  download_url,
  release_notes,
  force_reinstall
)
SELECT
  'windows',
  'Mailboat',
  '1.0.0',
  '1.0.0',
  'Mailboat Setup 1.0.0.exe',
  'Windows 10/11 x64',
  '/downloads/Mailboat%20Setup%201.0.0.exe',
  'Update this row in MySQL to control download and force reinstall policy.',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM app_release_configs WHERE channel = 'windows'
);

/* --------------------------------------------------------------------------
   Refresh app_users daily snapshot from sender_daily_stats
-------------------------------------------------------------------------- */
SET @bj_today = DATE(UTC_TIMESTAMP() + INTERVAL 8 HOUR);

UPDATE app_users u
LEFT JOIN (
  SELECT user_id, COALESCE(SUM(success_count), 0) AS cnt
  FROM sender_daily_stats
  WHERE stat_date = @bj_today
  GROUP BY user_id
) s ON s.user_id = u.id
SET u.today_success_date = @bj_today,
    u.today_success_count = COALESCE(s.cnt, 0);

SELECT 'mailboat full schema migration finished' AS result;
