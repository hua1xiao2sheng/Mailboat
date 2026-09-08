#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Desktop-safe default mail config.
Keep this file free of personal secrets.
"""

# ==================== Sender Defaults ====================
# These are only fallback values.
# Real account settings should come from Account Center / accounts.json.
SENDER_EMAIL = ""
SENDER_PASSWORD = ""
SENDER_NAME = ""

# SMTP fallback
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 465

# Optional explicit default channel: "smtp" or "gmail_api"
SEND_CHANNEL = "smtp"

# ==================== Mail Template Defaults ====================
EMAIL_SUBJECT = "PhD Application"
EMAIL_CONTENT = """
Dear Prof. {teacher_name},

Hope this email finds you well.

My name is [Your Name], and I am writing to inquire about potential PhD opportunities.

Best regards,
[Your Name]
"""

# ==================== Paths ====================
TEACHER_DATA_FILE = "data/teachers.json"
ATTACHMENTS = []
LOG_FILE = "logs/email_log.txt"

# ==================== Send Controls ====================
MIN_DELAY = 40
MAX_DELAY = 60
MAX_CONCURRENT_SEND = 1
RANDOMIZE_ORDER = False
DAILY_SEND_LIMIT = 20
