# Mailboat

[简体中文](README.md) | [English](README_EN.md)

Mailboat is a desktop bulk-email management tool designed for research outreach, admissions inquiries, and similar professional communication. It brings contact importing, multiple sender accounts, reusable templates, attachments, scheduled delivery, and delivery records into one interface. Both standard SMTP and the Gmail API are supported.

> Send email only to recipients who are relevant to your work or research and who may lawfully be contacted. Before using Mailboat, follow applicable laws, mailbox-provider requirements, and anti-spam policies.

## Features

- **Multiple sender accounts:** Manage multiple mailboxes and assign contacts to a specific sender.
- **Two delivery channels:** Use standard SMTP or Gmail OAuth 2.0 with the Gmail API.
- **Bulk import:** Import Excel or CSV files, or paste spreadsheet data directly, with automatic email-based deduplication.
- **Contact management:** Review pending, successful, and failed delivery states in one contact library.
- **Reusable templates:** Configure a subject, body, and attachments for each account; use `{teacher_name}` as a recipient-name placeholder.
- **Scheduled delivery:** Send immediately or schedule by Beijing time while accounting for a contact's time-zone offset.
- **Sending safeguards:** Configure randomized delays, daily limits, test deliveries, and SMTP connectivity checks.
- **Live task visibility:** Monitor account status, contact totals, progress, and results from the dashboard.
- **Local data storage:** Keep contacts, account settings, templates, and logs in a local workspace.
- **Optional service backend:** Includes APIs for authentication, SMS verification, release policies, sending quotas, and WeChat Pay integration.

## Interface and Module Guide

### 1. Dashboard and Global Navigation

![Mailboat dashboard overview](docs/images/dashboard-overview.png)

- Summarizes total contacts, pending messages, successful deliveries, failures, today's deliveries, and current sending entitlement.
- Reads statistics from `teachers.json`, local delivery logs, and backend quota data.
- Shows recent task summaries, including skipped, successful, and failed items, with a shortcut to detailed logs.
- Displays live sender-pool status for every account, including channel, start time, randomized interval, assignments, successes, pending items, and failures.
- Presents system announcements and provides access to the complete announcement list.
- Provides shortcuts to import, membership, sending, and window pinning controls.
- The sidebar links to every module: Dashboard, Account Center, Import/Paste, Contact Library, Email Templates, Send Console, Test Send, Logs and Reports, Feedback, and Settings.

### 2. Account Center

![Mailboat account center](docs/images/account-center.png)

- Add, filter, edit, save, and remove multiple sender accounts with independent settings.
- Choose either standard SMTP or Gmail API delivery, with presets for common SMTP providers and ports.
- Configure the mailbox, display name, SMTP server, port, and provider-issued authorization code, then run a connectivity test.
- Upload `credentials.json`, bind or unbind Gmail OAuth, and review the current authorization state for Gmail API accounts.
- Set an independent Beijing-time start time and minimum/maximum randomized interval for every account.
- Maintain the account's subject, body template, and attachment paths for later delivery tasks.
- Review assigned, successful, pending, failed, and daily-quota status at the top of each account card.

### 3. Import and Paste

![Mailboat data import](docs/images/data-import.png)

- Drag and drop or select Excel and CSV files, and download the standard Excel example file.
- Assign imported contacts to a sender account and optionally set a Beijing-time delivery start time.
- Paste spreadsheet rows directly from Excel. Supported fields include country, institution, name, surname, email address, and Beijing-time offset.
- Use the grid controls to load a sample, parse columns, remove selected rows, clear column contents, or reset the entire grid.
- Validate required fields and email formats, then deduplicate all records by email address.
- Preview the number of added, updated, and conflicting records and review the detailed import output.
- Bind each contact email to only one sender account to prevent duplicate delivery across accounts.

### 4. Contact Library

![Mailboat contact library](docs/images/teacher-library.png)

- Review deduplicated names, email addresses, institutions, assigned accounts, states, scheduled times, and actual delivery times.
- Filter contacts by pending, failed, or all states and narrow results to a specific sender account.
- Select individual rows, select all visible contacts, or delete selected records in bulk.
- Synchronize delivery states from formal delivery logs to distinguish pending, successful, and failed records.
- Review cross-time-zone schedules calculated from the selected Beijing time and each contact's offset.

### 5. Email Templates

![Mailboat email templates](docs/images/mail-templates.png)

- Edit the subject, body, and attachments separately for every sender account.
- Name, save, apply, and delete reusable templates containing the subject, body, and attachment paths.
- Use `{teacher_name}` in the body; Mailboat replaces it with the corresponding contact name when sending.
- Select multiple attachments, maintain one path per line, or clear the current attachment list.
- Save the complete subject, body, and attachment configuration to the selected account for both test and formal delivery.

### 6. Send Console

![Mailboat send console](docs/images/send-console.png)

- Select one, several, or all sender accounts; unchecked accounts do not participate in the task.
- Load each account's delivery channel, schedule, randomized interval, template, and attachment configuration automatically.
- Group contacts by assigned account and skip contacts already marked as successfully delivered.
- Display overall progress, task status, selected account scope, pending count, and per-account progress in real time.
- Stream processing order, skip reasons, successes, failures, quota decisions, and final statistics to the console.
- Start or stop the task and review the detailed record in `logs/run_send.log`.

### 7. Additional Modules

- **Test Send:** Maintain a separate test list, paste contacts from Excel, choose an account and delivery time, and start or stop a test. Test results do not alter formal delivery records or `teachers.json`.
- **Logs and Reports:** Filter all, successful, or failed logs and export current statistics and details as a text report.
- **Feedback:** Choose a local sender account, enter a title and description, send feedback to the project contact address, and review the result in the console.
- **Security and Storage:** Review the current client version and workspace location, change the base directory, and inspect the data, log, and configuration paths.
- **Announcements and Version Policy:** Read backend release policy at startup, display release notes and required updates, provide a download entry, and refresh announcements while running.
- **Quota and Membership State:** Display free quota, today's successful count, and subscription validity; the backend can be extended with plans and payment workflows.

## Project Structure

```text
app2/
├── desktop-app/                  # Electron desktop client
│   ├── renderer/                 # UI, styles, and renderer interactions
│   └── scripts/                  # Python module packaging scripts
├── backend/                      # FastAPI backend
├── docs/images/                  # Sanitized README screenshots
├── samples/import_example.xlsx   # Contact import example
├── email_sender.py               # SMTP / Gmail API delivery core
├── import_teachers_from_excel.py # Excel / CSV import and deduplication
├── send_by_accounts.py           # Account-grouped delivery runner
├── gmail_oauth_manager.py        # Gmail OAuth authorization manager
├── smtp_check.py                 # SMTP configuration check
├── config.py                     # Safe defaults for Python modules
└── README.md
```

## Quick Start

### Requirements

- Windows 10 or 11; the current desktop package targets Windows x64
- Python 3.10 or later
- Node.js 18 or later and npm
- One or more mailboxes authorized to send email

If you use a prebuilt installer, install it and continue with the Usage section; Node.js is not required.

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd bulk-email-sender-main/app2
```

Replace `<your-repository-url>` with this repository's Git URL.

### 2. Create a Python Virtual Environment

PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install pandas openpyxl pymysql requests google-auth google-auth-oauthlib google-api-python-client
```

Git Bash:

```bash
python -m venv .venv
source .venv/Scripts/activate
python -m pip install --upgrade pip
python -m pip install pandas openpyxl pymysql requests google-auth google-auth-oauthlib google-api-python-client
```

### 3. Install and Run the Desktop Client

```bash
cd desktop-app
npm ci
npm start
```

Source development builds run as a single-user local application and open the main interface directly. Packaged releases retain the authentication flow. Electron first checks the following development interpreter:

```text
%USERPROFILE%\.conda\envs\post_mail\python.exe
```

If that path does not exist, Electron uses `python` from the system `PATH`. Install dependencies into the interpreter Electron actually invokes.

## Usage

### 1. Add Sender Accounts

Open Account Center, add a mailbox, and select a delivery channel:

- **SMTP:** Enter the sender address, display name, SMTP server, port, and provider-issued authorization code.
- **Gmail API:** Select Gmail API, import Google OAuth client credentials, click Bind, and complete authorization in the browser.

Mailboat includes presets for Gmail, QQ Mail, 163 Mail, 126 Mail, Outlook, and Hotmail. Refer to your provider's official documentation for other services.

> Use an SMTP authorization code or application-specific password. Never commit a mailbox login password, API credential, or token to Git.

### 2. Prepare Contacts

Copy [`samples/import_example.xlsx`](samples/import_example.xlsx) and replace the example rows. A contact name and email address are required. The optional time-zone offset helps calculate an appropriate delivery time.

You can also paste spreadsheet content directly. Mailboat validates email addresses, deduplicates records, merges new contacts, and stores account assignments and schedules.

### 3. Compose Email

Configure the subject, body, attachments, randomized delay, and delivery schedule for an account. Use `{teacher_name}` where the contact name should appear:

```text
Dear Prof. {teacher_name},

I am writing to inquire about potential PhD opportunities...
```

### 4. Test the Configuration

Before a formal task:

1. Run Test SMTP for each SMTP account.
2. Send one message to your own or another controlled mailbox through Test Send.
3. Verify the display name, subject, name placeholder, formatting, and attachments.
4. Confirm that the delay and daily volume follow provider requirements.

Gmail API accounts do not need an SMTP test, but OAuth must show as bound.

### 5. Start Sending

Select contacts in the library, choose one or more sender accounts in the Send Console, and start the task. Progress and delivery outcomes update in the interface and local logs.

## Gmail API Setup

1. Create a project in Google Cloud Console.
2. Enable the Gmail API.
3. Configure the OAuth consent screen.
4. Create an OAuth 2.0 client of type Desktop app.
5. Download the client JSON credentials.
6. Import the credentials in Account Center and bind the Gmail account.

OAuth credentials and account tokens are sensitive. `.gitignore` excludes:

```text
config/gmail/
config/gmail_tokens/
```

Never force-add these files to Git.

## Local Data Location

Development and installed clients store runtime data under:

```text
%LOCALAPPDATA%\Mailboat\workspace
```

The workspace normally contains:

```text
workspace/
├── config/  # Announcements, Gmail OAuth credentials, and tokens
├── data/    # Contacts, accounts, templates, and import batches
└── logs/    # Delivery and runtime logs
```

The repository-level `data/`, `logs/`, and `attachments/` directories are also ignored. Back up the workspace before migrating or reinstalling.

## Optional Local Backend

The FastAPI backend requires MySQL. Redis is used by verification and login-risk controls. SMS and WeChat Pay features require credentials from the corresponding providers.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `backend/.env` and replace at least these values:

```dotenv
DATABASE_URL=mysql+pymysql://user:password@127.0.0.1:3306/mailpilot
JWT_SECRET=replace-with-a-long-random-secret
REDIS_URL=redis://127.0.0.1:6379/0
```

Create the database, start MySQL and Redis, then run:

```bash
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Check the service at:

```text
http://127.0.0.1:8000/health
http://127.0.0.1:8000/docs
```

For production, replace all example secrets, restrict CORS, enable HTTPS, and protect database, SMS, payment, and administrator credentials.

## Build the Windows Installer

```bash
cd desktop-app
npm ci
npm run dist:win
```

Electron Builder writes the NSIS output to `desktop-app/release/`. The protection build uses Python from the active environment and requires:

```bash
python -m pip install setuptools Cython
```

## Configuration Reference

Root-level [`config.py`](config.py) provides safe defaults when invoking the Python delivery modules directly:

| Setting | Purpose | Default |
| --- | --- | --- |
| `SMTP_SERVER` / `SMTP_PORT` | Default SMTP endpoint | `smtp.gmail.com` / `465` |
| `SEND_CHANNEL` | Default delivery channel | `smtp` |
| `EMAIL_SUBJECT` | Default subject | `PhD Application` |
| `EMAIL_CONTENT` | Default body | Contains `{teacher_name}` |
| `TEACHER_DATA_FILE` | Contact-data path | `data/teachers.json` |
| `MIN_DELAY` / `MAX_DELAY` | Randomized delay in seconds | `40` / `60` |
| `MAX_CONCURRENT_SEND` | Maximum concurrent deliveries | `1` |
| `RANDOMIZE_ORDER` | Randomize contact order | `False` |
| `DAILY_SEND_LIMIT` | Default daily limit | `20` |

Account Center settings override these fallback values. Never place real mailbox credentials or personal information in `config.py`.

## Troubleshooting

### Python or a Module Cannot Be Found

Confirm that the intended environment is active:

```bash
python --version
python -m pip --version
```

Using `python -m pip install ...` reduces the chance of installing dependencies into a different interpreter.

### SMTP Authentication Fails

- Confirm that SMTP access is enabled for the mailbox.
- Use an authorization code or application password instead of the web-login password.
- Verify the server, port, and SSL/TLS settings.
- Prefer Gmail API when Gmail SMTP is restricted by the current network.
- If a proxy is used, confirm that it is reachable and correctly formatted.

### Gmail Authorization Fails

- Confirm that Gmail API is enabled.
- Use an OAuth client of type Desktop app.
- In testing mode, add the Gmail address as an OAuth test user.
- Remove the old local token and bind again after changing credentials or scopes.

### No Contacts Appear After Import

- Start with the supplied example workbook.
- Confirm that name and email columns exist.
- Validate the email format.
- Existing addresses are deduplicated instead of added again.

### Messages Are Filtered or the Account Is Restricted

Lower the delivery frequency and daily volume, avoid misleading or excessively repetitive content, and ensure that recipients are relevant to the message. New mailboxes should establish normal usage history before handling larger batches.

## Security

- Never commit `.env`, OAuth credentials, access tokens, SMTP authorization codes, private keys, or real contact data.
- Test content and configuration with a controlled mailbox before formal delivery.
- Grant database users only the permissions they need.
- Back up local contacts and templates regularly.
- Logs may contain email addresses; sanitize them before sharing.

## Commercial Cooperation and Private Deployment

Commercial licensing and tailored deployments are available for teams, laboratories, educational institutions, and companies. Possible services include:

- **Private deployment:** Deployment to customer-owned servers, internal networks, or a selected cloud, including database, Redis, domain, and HTTPS setup.
- **Feature customization:** Contact fields, approval processes, templates, delivery policies, quota rules, and reports.
- **Brand customization:** Product name, logo, visual theme, installer, and update channel.
- **System integration:** CRM, academic systems, customer databases, enterprise identity, SMS, and other internal services.
- **Mailbox extension:** Additional enterprise mailbox providers, OAuth methods, and delivery strategies.
- **Operations and support:** Installation, upgrades, troubleshooting, data migration, and user training.

For commercial licensing, private deployment, or custom development, email [huaxiaohang2022@163.com](mailto:huaxiaohang2022@163.com), or open a GitHub Issue with `[Commercial]` in the title. Do not place passwords, keys, contact lists, or other sensitive information in a public Issue.

> Customization services will not be used to bypass provider restrictions or facilitate spam. Every engagement must follow applicable law, privacy requirements, and platform policies.

## Contributing

Issues and pull requests are welcome. Before submitting a pull request, run the desktop client locally and verify that contact import, test delivery, and affected interface flows still work.

## License

The repository currently has no root-level license file. Until an explicit open-source license is added, all rights are reserved. Obtain permission from the maintainer before using, modifying, or distributing the project.
