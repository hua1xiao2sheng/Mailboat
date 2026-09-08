-- User-level daily free quota (default: 20/day).
-- Global limit means all sender emails under one user share the same quota.

-- 1) Add daily_total_limit to app_users if missing.
SET @has_daily_total_limit = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'app_users'
    AND COLUMN_NAME = 'daily_total_limit'
);

SET @sql_add_daily_total_limit = IF(
  @has_daily_total_limit = 0,
  'ALTER TABLE app_users ADD COLUMN daily_total_limit INT NOT NULL DEFAULT 20 COMMENT ''User daily free total send limit'' AFTER password_hash',
  'SELECT 1'
);

PREPARE stmt_add_daily_total_limit FROM @sql_add_daily_total_limit;
EXECUTE stmt_add_daily_total_limit;
DEALLOCATE PREPARE stmt_add_daily_total_limit;

-- 2) Add "today success" snapshot columns to app_users.
SET @has_today_success_date = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'app_users'
    AND COLUMN_NAME = 'today_success_date'
);

SET @sql_add_today_success_date = IF(
  @has_today_success_date = 0,
  'ALTER TABLE app_users ADD COLUMN today_success_date DATE NULL COMMENT ''Beijing date for today_success_count'' AFTER daily_total_limit',
  'SELECT 1'
);

PREPARE stmt_add_today_success_date FROM @sql_add_today_success_date;
EXECUTE stmt_add_today_success_date;
DEALLOCATE PREPARE stmt_add_today_success_date;

SET @has_today_success_count = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'app_users'
    AND COLUMN_NAME = 'today_success_count'
);

SET @sql_add_today_success_count = IF(
  @has_today_success_count = 0,
  'ALTER TABLE app_users ADD COLUMN today_success_count INT NOT NULL DEFAULT 0 COMMENT ''Today success total by user'' AFTER today_success_date',
  'SELECT 1'
);

PREPARE stmt_add_today_success_count FROM @sql_add_today_success_count;
EXECUTE stmt_add_today_success_count;
DEALLOCATE PREPARE stmt_add_today_success_count;

-- 3) Normalize invalid limit values.
UPDATE app_users
SET daily_total_limit = 20
WHERE daily_total_limit IS NULL OR daily_total_limit <= 0;

-- 4) Backfill app_users.today_success_* from sender_daily_stats (Beijing date).
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

-- 5) Keep app_users.today_success_* in sync via triggers.
DROP TRIGGER IF EXISTS trg_sender_daily_stats_ai_sync_today_total;
DROP TRIGGER IF EXISTS trg_sender_daily_stats_au_sync_today_total;
DROP TRIGGER IF EXISTS trg_sender_daily_stats_ad_sync_today_total;

DELIMITER //

CREATE TRIGGER trg_sender_daily_stats_ai_sync_today_total
AFTER INSERT ON sender_daily_stats
FOR EACH ROW
BEGIN
  DECLARE bj_today DATE;
  SET bj_today = DATE(UTC_TIMESTAMP() + INTERVAL 8 HOUR);

  UPDATE app_users u
  SET u.today_success_date = bj_today,
      u.today_success_count = (
        SELECT COALESCE(SUM(s.success_count), 0)
        FROM sender_daily_stats s
        WHERE s.user_id = NEW.user_id
          AND s.stat_date = bj_today
      )
  WHERE u.id = NEW.user_id;
END//

CREATE TRIGGER trg_sender_daily_stats_au_sync_today_total
AFTER UPDATE ON sender_daily_stats
FOR EACH ROW
BEGIN
  DECLARE bj_today DATE;
  SET bj_today = DATE(UTC_TIMESTAMP() + INTERVAL 8 HOUR);

  UPDATE app_users u
  SET u.today_success_date = bj_today,
      u.today_success_count = (
        SELECT COALESCE(SUM(s.success_count), 0)
        FROM sender_daily_stats s
        WHERE s.user_id = OLD.user_id
          AND s.stat_date = bj_today
      )
  WHERE u.id = OLD.user_id;

  IF NEW.user_id <> OLD.user_id THEN
    UPDATE app_users u
    SET u.today_success_date = bj_today,
        u.today_success_count = (
          SELECT COALESCE(SUM(s.success_count), 0)
          FROM sender_daily_stats s
          WHERE s.user_id = NEW.user_id
            AND s.stat_date = bj_today
        )
    WHERE u.id = NEW.user_id;
  END IF;
END//

CREATE TRIGGER trg_sender_daily_stats_ad_sync_today_total
AFTER DELETE ON sender_daily_stats
FOR EACH ROW
BEGIN
  DECLARE bj_today DATE;
  SET bj_today = DATE(UTC_TIMESTAMP() + INTERVAL 8 HOUR);

  UPDATE app_users u
  SET u.today_success_date = bj_today,
      u.today_success_count = (
        SELECT COALESCE(SUM(s.success_count), 0)
        FROM sender_daily_stats s
        WHERE s.user_id = OLD.user_id
          AND s.stat_date = bj_today
      )
  WHERE u.id = OLD.user_id;
END//

DELIMITER ;

-- 6) Optional: legacy sender_accounts.daily_limit can remain, but is not used.
