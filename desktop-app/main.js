const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const sourceRoot = path.resolve(__dirname, '..');
const appRoot = app.isPackaged ? process.resourcesPath : sourceRoot;
const importScriptPath = path.join(appRoot, 'import_teachers_from_excel.py');
const sendScriptPath = path.join(appRoot, 'send_by_accounts.py');
const smtpCheckScriptPath = path.join(appRoot, 'smtp_check.py');
const testSendScriptPath = path.join(appRoot, 'test_send.py');
const feedbackScriptPath = path.join(appRoot, 'send_feedback.py');
const announcementScriptPath = path.join(appRoot, 'announcement_fetch.py');
const syncSenderAccountsScriptPath = path.join(appRoot, 'sync_sender_accounts.py');
const senderQuotaFetchScriptPath = path.join(appRoot, 'sender_quota_fetch.py');
const gmailOauthScriptPath = path.join(appRoot, 'gmail_oauth_manager.py');
const entryModules = {
  importTeachers: 'mailboat_core.import_teachers_from_excel',
  sendByAccounts: 'mailboat_core.send_by_accounts',
  smtpCheck: 'mailboat_core.smtp_check',
  testSend: 'mailboat_core.test_send',
  feedbackSend: 'mailboat_core.send_feedback',
  announcementFetch: 'mailboat_core.announcement_fetch',
  syncSenderAccounts: 'mailboat_core.sync_sender_accounts',
  senderQuotaFetch: 'mailboat_core.sender_quota_fetch',
  gmailOauth: 'mailboat_core.gmail_oauth_manager',
};
const importSampleFilePath = path.join(appRoot, 'samples', 'import_example.xlsx');

function getDefaultBaseDir() {
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    return path.join(localAppData, 'Mailboat', 'workspace');
  }
  try {
    return path.join(app.getPath('userData'), 'workspace');
  } catch (err) {
    const fallbackRoot = process.env.APPDATA || appRoot;
    return path.join(fallbackRoot, 'Mailboat', 'workspace');
  }
}

const defaultBaseDir = getDefaultBaseDir();

let baseDir = defaultBaseDir;
let dataDir = path.join(baseDir, 'data');
let teachersPath = path.join(dataDir, 'teachers.json');
let accountsPath = path.join(dataDir, 'accounts.json');
let mailTemplatesPath = path.join(dataDir, 'mail_templates.json');
let originalDir = path.join(dataDir, 'original');
let batchesDir = path.join(dataDir, 'batches');
let testLogsDir = path.join(dataDir, 'test_logs');
let feedbackLogsDir = path.join(dataDir, 'feedback_logs');
let logsDir = path.join(baseDir, 'logs');
let emailLogPath = path.join(logsDir, 'email_log.txt');
let runSendLogPath = path.join(logsDir, 'run_send.log');
let configDir = path.join(baseDir, 'config');
let announcementConfigPath = path.join(configDir, 'announcement_config.json');
let gmailCredentialsPath = path.join(configDir, 'gmail', 'credentials.json');
let gmailLegacyClientSecretPath = path.join(configDir, 'gmail', 'client_secret.json');
let gmailTokensDir = path.join(configDir, 'gmail_tokens');

const defaultPython = path.join(process.env.USERPROFILE || '', '.conda', 'envs', 'post_mail', 'python.exe');
const pythonBin = fs.existsSync(defaultPython) ? defaultPython : 'python';

let win = null;
const sendProcesses = new Map();
let sendStopRequested = false;
let testSendProcess = null;
const DEFAULT_DAILY_LIMIT = 20;
const SENDER_QUOTA_CACHE_TTL_MS = 5000;
const senderQuotaCache = {
  userId: null,
  fetchedAt: 0,
  date: '',
  dailyTotalLimit: DEFAULT_DAILY_LIMIT,
  todaySuccessTotal: 0,
  quotas: {},
};
const SMTP_PROXY_ENV_KEYS = [
  'SMTP_PROXY',
  'ALL_PROXY',
  'all_proxy',
  'HTTPS_PROXY',
  'https_proxy',
  'HTTP_PROXY',
  'http_proxy',
];

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
}

function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return '';
  }
}

function getUserSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadUserSettings() {
  const settingsPath = getUserSettingsPath();
  if (!fs.existsSync(settingsPath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

function saveUserSettings(settings) {
  const settingsPath = getUserSettingsPath();
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    // ignore
  }
}

function ensureAccountsFile() {
  if (!fs.existsSync(accountsPath)) {
    const template = { accounts: [] };
    fs.writeFileSync(accountsPath, JSON.stringify(template, null, 2), 'utf8');
  }
}

function ensureMailTemplatesFile() {
  if (!fs.existsSync(mailTemplatesPath)) {
    const template = { templates: [] };
    fs.writeFileSync(mailTemplatesPath, JSON.stringify(template, null, 2), 'utf8');
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function ensureTeachersFile() {
  if (!fs.existsSync(teachersPath)) {
    fs.writeFileSync(teachersPath, JSON.stringify({}, null, 2), 'utf8');
  }
}

function migrateLegacyGmailCredentialsFile() {
  try {
    if (fs.existsSync(gmailCredentialsPath)) return;
    if (!fs.existsSync(gmailLegacyClientSecretPath)) return;
    ensureDir(path.dirname(gmailCredentialsPath));
    fs.copyFileSync(gmailLegacyClientSecretPath, gmailCredentialsPath);
  } catch (err) {
    // ignore migration errors, uploader can overwrite manually
  }
}

function applyBaseDir(dirPath) {
  baseDir = dirPath || defaultBaseDir;
  dataDir = path.join(baseDir, 'data');
  teachersPath = path.join(dataDir, 'teachers.json');
  accountsPath = path.join(dataDir, 'accounts.json');
  mailTemplatesPath = path.join(dataDir, 'mail_templates.json');
  originalDir = path.join(dataDir, 'original');
  batchesDir = path.join(dataDir, 'batches');
  testLogsDir = path.join(dataDir, 'test_logs');
  feedbackLogsDir = path.join(dataDir, 'feedback_logs');
  logsDir = path.join(baseDir, 'logs');
  emailLogPath = path.join(logsDir, 'email_log.txt');
  runSendLogPath = path.join(logsDir, 'run_send.log');
  configDir = path.join(baseDir, 'config');
  announcementConfigPath = path.join(configDir, 'announcement_config.json');
  gmailCredentialsPath = path.join(configDir, 'gmail', 'credentials.json');
  gmailLegacyClientSecretPath = path.join(configDir, 'gmail', 'client_secret.json');
  gmailTokensDir = path.join(configDir, 'gmail_tokens');

  ensureDir(dataDir);
  ensureDir(originalDir);
  ensureDir(batchesDir);
  ensureDir(testLogsDir);
  ensureDir(feedbackLogsDir);
  ensureDir(logsDir);
  ensureDir(configDir);
  ensureDir(path.join(configDir, 'gmail'));
  ensureDir(gmailTokensDir);
  migrateLegacyGmailCredentialsFile();
  ensureAccountsFile();
  ensureMailTemplatesFile();
  ensureTeachersFile();
}

function initStoragePaths() {
  const settings = loadUserSettings();
  const configured = settings.baseDir;
  applyBaseDir(configured || defaultBaseDir);
}

function readTeachers() {
  const raw = safeReadFile(teachersPath);
  if (!raw) return [];
  try {
    const obj = JSON.parse(raw);
    return Object.entries(obj).map(([email, info]) => ({
      email,
      name: info.name || '',
      offset_hours: info.offset_hours ?? 0,
      send_at_bj: info.send_at_bj || '',
      assigned_account: info.assigned_account || '',
    }));
  } catch (err) {
    return [];
  }
}

function deleteTeachers(emails) {
  if (!emails || emails.length === 0) {
    return { ok: true, deleted: 0 };
  }
  const raw = safeReadFile(teachersPath);
  if (!raw) return { ok: false, error: 'teachers.json 为空或不存在' };
  let data = {};
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: 'teachers.json 格式错误' };
  }
  const unique = new Set(emails.map((e) => String(e).toLowerCase()));
  let deleted = 0;
  Object.keys(data).forEach((email) => {
    if (unique.has(email.toLowerCase())) {
      delete data[email];
      deleted += 1;
    }
  });
  fs.writeFileSync(teachersPath, JSON.stringify(data, null, 2), 'utf8');
  removeLogEntries(unique);
  return { ok: true, deleted };
}

function buildChildEnv(extraEnv = {}, disableSmtpProxy = false) {
  const env = {
    ...process.env,
    MAILPILOT_BASE_DIR: baseDir,
    ...extraEnv,
  };
  if (disableSmtpProxy) {
    SMTP_PROXY_ENV_KEYS.forEach((key) => {
      delete env[key];
    });
    env.SMTP_PROXY_DISABLED = '1';
  } else if (env.SMTP_PROXY_DISABLED) {
    delete env.SMTP_PROXY_DISABLED;
  }
  return env;
}

function buildPythonMainArgs(moduleName, fallbackScriptPath, scriptArgs = []) {
  if (app.isPackaged) {
    const code = `from ${moduleName} import main as _entry_main; raise SystemExit(_entry_main())`;
    return ['-c', code, ...scriptArgs];
  }
  return [fallbackScriptPath, ...scriptArgs];
}

function appendTailText(current, chunk, limit = 20000) {
  const next = `${current || ''}${chunk || ''}`;
  if (next.length <= limit) return next;
  return next.slice(next.length - limit);
}

function hasNetworkTimeoutSignal(text) {
  const value = String(text || '').toLowerCase();
  if (!value) return false;
  const hints = [
    'timed out',
    'timeout',
    'winerror 10060',
    'network is unreachable',
    'no route to host',
    'temporary failure in name resolution',
    'connection refused',
    'connection reset',
    'cannot assign requested address',
  ];
  return hints.some((hint) => value.includes(hint));
}

function removeLogEntries(emails) {
  if (!emails || emails.size === 0) return;
  const files = [emailLogPath, runSendLogPath];
  files.forEach((filePath) => {
    const raw = safeReadFile(filePath);
    if (!raw) return;
    const filtered = raw
      .split(/\r?\n/)
      .filter((line) => {
        if (!line) return false;
        const lower = line.toLowerCase();
        return !Array.from(emails).some((email) => lower.includes(email));
      })
      .join('\n');
    fs.writeFileSync(filePath, filtered + (filtered ? '\n' : ''), 'utf8');
  });
}

function readLogLines() {
  const logs = [];
  const emailLog = safeReadFile(emailLogPath);
  if (emailLog) {
    logs.push(...emailLog.split(/\r?\n/));
  }
  const runLog = safeReadFile(runSendLogPath);
  if (runLog) {
    logs.push(...runLog.split(/\r?\n/));
  }
  return logs.filter((line) => line && line.trim().length > 0);
}

function parseLogStats(lines) {
  const emailRegex = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const successKeywords = ['发送成功', '成功发送', 'gmail api send success to'];
  const failureKeywords = ['发送失败', '失败', '错误', '拒绝'];

  const sent = new Set();
  const failed = new Set();
  const sentTimes = {};

  lines.forEach((line) => {
    const emails = line.match(emailRegex);
    if (!emails) return;
    const lowerLine = line.toLowerCase();
    const isSuccess = successKeywords.some((kw) => lowerLine.includes(kw.toLowerCase()));
    const isFailure = !isSuccess && failureKeywords.some((kw) => line.includes(kw));

    if (isSuccess) {
      const timeMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
      emails.forEach((email) => {
        const key = email.toLowerCase();
        sent.add(key);
        if (timeMatch) {
          sentTimes[key] = timeMatch[1];
        }
      });
    } else if (isFailure) {
      emails.forEach((email) => failed.add(email.toLowerCase()));
    }
  });

  sent.forEach((email) => failed.delete(email));

  return { sent, failed, sentTimes };
}

function normalizeAttachments(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    return value.split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

function isGmailAddress(email) {
  if (!email || !String(email).includes('@')) return false;
  const domain = String(email).split('@').pop().toLowerCase();
  return domain === 'gmail.com' || domain === 'googlemail.com';
}

function gmailTokenStem(email) {
  const safe = String(email || '')
    .trim()
    .toLowerCase()
    .replace(/@/g, '_at_')
    .replace(/[^a-z0-9._-]/g, '_');
  return safe;
}

function gmailTokenPath(email) {
  return path.join(gmailTokensDir, `token_${gmailTokenStem(email)}.json`);
}

function legacyGmailTokenPath(email) {
  return path.join(gmailTokensDir, `${gmailTokenStem(email)}.json`);
}

function hasGmailOauthToken(email) {
  if (!isGmailAddress(email)) return false;
  return fs.existsSync(gmailTokenPath(email)) || fs.existsSync(legacyGmailTokenPath(email));
}

function resolveGmailCredentialsPath() {
  if (fs.existsSync(gmailCredentialsPath)) return gmailCredentialsPath;
  if (fs.existsSync(gmailLegacyClientSecretPath)) return gmailLegacyClientSecretPath;
  return gmailCredentialsPath;
}

function readAccounts() {
  ensureAccountsFile();
  const raw = safeReadFile(accountsPath);
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    const accounts = Array.isArray(data) ? data : data.accounts || [];
    return accounts.map((acc) => {
      const email = acc.email || '';
      return ({
        email,
        send_channel: acc.send_channel || '',
        gmail_oauth_bound: Boolean(acc.gmail_oauth_bound) || hasGmailOauthToken(email),
        password: acc.password || '',
        name: acc.name || '',
        smtp_server: acc.smtp_server || 'smtp.gmail.com',
        smtp_port: acc.smtp_port || 465,
        start_time_bj: acc.start_time_bj || '',
        min_delay: acc.min_delay ?? 40,
        max_delay: acc.max_delay ?? 60,
        subject: acc.subject || '',
        content: acc.content || '',
        attachments: normalizeAttachments(acc.attachments),
      });
    });
  } catch (err) {
    return [];
  }
}

function saveAccounts(accounts) {
  ensureAccountsFile();
  const payload = { accounts };
  fs.writeFileSync(accountsPath, JSON.stringify(payload, null, 2), 'utf8');
}

function readMailTemplates() {
  ensureMailTemplatesFile();
  const raw = safeReadFile(mailTemplatesPath);
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    const templates = Array.isArray(data) ? data : data.templates || [];
    return templates
      .filter((tpl) => tpl && String(tpl.name || '').trim())
      .map((tpl) => ({
        name: String(tpl.name || '').trim(),
        subject: String(tpl.subject || ''),
        content: String(tpl.content || ''),
        attachments: normalizeAttachments(tpl.attachments),
        created_at: tpl.created_at || '',
        updated_at: tpl.updated_at || '',
      }))
      .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  } catch (err) {
    return [];
  }
}

function saveMailTemplate(payload) {
  const name = String(payload?.name || '').trim();
  if (!name) {
    return { ok: false, error: '模板名称不能为空' };
  }
  const now = new Date().toISOString();
  const templates = readMailTemplates();
  const next = {
    name,
    subject: String(payload?.subject || ''),
    content: String(payload?.content || ''),
    attachments: normalizeAttachments(payload?.attachments),
    updated_at: now,
  };
  const index = templates.findIndex((item) => item.name.toLowerCase() === name.toLowerCase());
  if (index >= 0) {
    const existing = templates[index];
    templates[index] = {
      ...existing,
      ...next,
      created_at: existing.created_at || now,
    };
  } else {
    templates.unshift({
      ...next,
      created_at: now,
    });
  }
  ensureMailTemplatesFile();
  fs.writeFileSync(mailTemplatesPath, JSON.stringify({ templates }, null, 2), 'utf8');
  return { ok: true, template: templates.find((item) => item.name.toLowerCase() === name.toLowerCase()) };
}

function deleteMailTemplate(nameRaw) {
  const name = String(nameRaw || '').trim();
  if (!name) {
    return { ok: false, error: '????????' };
  }
  const templates = readMailTemplates();
  const next = templates.filter((item) => item.name.toLowerCase() !== name.toLowerCase());
  const deleted = templates.length - next.length;
  if (deleted <= 0) {
    return { ok: false, error: '?????' };
  }
  ensureMailTemplatesFile();
  fs.writeFileSync(mailTemplatesPath, JSON.stringify({ templates: next }, null, 2), 'utf8');
  return { ok: true, deleted };
}

function syncSenderAccountsToDb(userId) {
  return new Promise((resolve) => {
    const uid = Number(userId);
    if (!Number.isFinite(uid) || uid <= 0) {
      resolve({ ok: false, skipped: true, error: 'missing user_id' });
      return;
    }

    const config = readAnnouncementConfig();
    if (!config.host || !config.user || !config.database) {
      resolve({ ok: false, skipped: true, error: 'db config incomplete' });
      return;
    }

    const scriptArgs = [
      '--host',
      config.host,
      '--port',
      String(config.port || 3306),
      '--user',
      config.user,
      '--password',
      config.password || '',
      '--database',
      config.database,
      '--table',
      'sender_accounts',
      '--user-id',
      String(uid),
      '--accounts-file',
      accountsPath,
    ];
    const args = buildPythonMainArgs(
      entryModules.syncSenderAccounts,
      syncSenderAccountsScriptPath,
      scriptArgs,
    );

    const child = spawn(pythonBin, args, {
      cwd: appRoot,
      env: buildChildEnv(),
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('close', (code) => {
      if (code !== 0) {
        resolve({ ok: false, error: stderr.trim() || stdout.trim() || 'sync failed' });
        return;
      }
      try {
        const parsed = JSON.parse((stdout || '').trim() || '{}');
        if (parsed.ok) {
          resolve(parsed);
        } else {
          resolve({ ok: false, error: parsed.error || 'sync failed' });
        }
      } catch (err) {
        resolve({ ok: false, error: stdout.trim() || String(err) });
      }
    });
  });
}

function normalizeSenderQuotaData(rawData) {
  const result = {
    date: '',
    dailyTotalLimit: DEFAULT_DAILY_LIMIT,
    todaySuccessTotal: 0,
    quotas: {},
  };
  if (!rawData || typeof rawData !== 'object') {
    return result;
  }
  const dateText = String(rawData.date || '').trim();
  if (dateText) {
    result.date = dateText;
  }
  const dailyTotalLimit = Number(rawData.daily_total_limit);
  if (Number.isFinite(dailyTotalLimit) && dailyTotalLimit > 0) {
    result.dailyTotalLimit = dailyTotalLimit;
  }
  const todaySuccessTotal = Number(rawData.today_success_total);
  if (Number.isFinite(todaySuccessTotal) && todaySuccessTotal >= 0) {
    result.todaySuccessTotal = todaySuccessTotal;
  }
  const quotas = rawData.quotas;
  if (!quotas || typeof quotas !== 'object') {
    return result;
  }
  Object.entries(quotas).forEach(([email, item]) => {
    const key = String(email || '').trim().toLowerCase();
    if (!key || !item || typeof item !== 'object') return;
    const dailyLimit = Number(item.daily_limit);
    const todaySuccess = Number(item.today_success);
    const todayRemaining = Number(item.today_remaining);
    result.quotas[key] = {
      daily_limit: Number.isFinite(dailyLimit) && dailyLimit > 0 ? dailyLimit : DEFAULT_DAILY_LIMIT,
      today_success: Number.isFinite(todaySuccess) && todaySuccess >= 0 ? todaySuccess : 0,
      today_remaining: Number.isFinite(todayRemaining) && todayRemaining >= 0 ? todayRemaining : 0,
      limit_reached: Boolean(item.limit_reached),
    };
  });
  return result;
}

function runSenderQuotaFetch(userId) {
  return new Promise((resolve) => {
    const uid = Number(userId);
    if (!Number.isFinite(uid) || uid <= 0) {
      resolve({ ok: true, data: { date: '', quotas: {} } });
      return;
    }
    const config = readAnnouncementConfig();
    if (!config.host || !config.user || !config.database) {
      resolve({ ok: true, data: { date: '', quotas: {} } });
      return;
    }

    const scriptArgs = [
      '--host',
      String(config.host),
      '--port',
      String(config.port || 3306),
      '--user',
      String(config.user),
      '--password',
      String(config.password || ''),
      '--database',
      String(config.database),
      '--user-id',
      String(uid),
      '--sender-table',
      'sender_accounts',
      '--stats-table',
      'sender_daily_stats',
      '--default-limit',
      String(DEFAULT_DAILY_LIMIT),
    ];
    const args = buildPythonMainArgs(
      entryModules.senderQuotaFetch,
      senderQuotaFetchScriptPath,
      scriptArgs,
    );
    const child = spawn(pythonBin, args, {
      cwd: appRoot,
      env: buildChildEnv(),
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('close', (code) => {
      if (code !== 0) {
        resolve({ ok: false, error: stderr.trim() || stdout.trim() || 'quota fetch failed' });
        return;
      }
      try {
        const parsed = JSON.parse((stdout || '').trim() || '{}');
        if (!parsed.ok) {
          resolve({ ok: false, error: parsed.error || 'quota fetch failed' });
          return;
        }
        resolve({ ok: true, data: normalizeSenderQuotaData(parsed.data) });
      } catch (err) {
        resolve({ ok: false, error: stdout.trim() || String(err) });
      }
    });
  });
}

async function getSenderQuotaData(userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) {
    return {
      date: '',
      dailyTotalLimit: DEFAULT_DAILY_LIMIT,
      todaySuccessTotal: 0,
      quotas: {},
    };
  }
  const now = Date.now();
  if (
    senderQuotaCache.userId === uid
    && now - senderQuotaCache.fetchedAt <= SENDER_QUOTA_CACHE_TTL_MS
  ) {
    return {
      date: senderQuotaCache.date,
      dailyTotalLimit: senderQuotaCache.dailyTotalLimit,
      todaySuccessTotal: senderQuotaCache.todaySuccessTotal,
      quotas: { ...senderQuotaCache.quotas },
    };
  }
  const result = await runSenderQuotaFetch(uid);
  if (!result.ok) {
    return {
      date: '',
      dailyTotalLimit: DEFAULT_DAILY_LIMIT,
      todaySuccessTotal: 0,
      quotas: {},
    };
  }
  senderQuotaCache.userId = uid;
  senderQuotaCache.fetchedAt = now;
  senderQuotaCache.date = result.data?.date || '';
  senderQuotaCache.dailyTotalLimit = result.data?.dailyTotalLimit || DEFAULT_DAILY_LIMIT;
  senderQuotaCache.todaySuccessTotal = result.data?.todaySuccessTotal || 0;
  senderQuotaCache.quotas = result.data?.quotas || {};
  return {
    date: senderQuotaCache.date,
    dailyTotalLimit: senderQuotaCache.dailyTotalLimit,
    todaySuccessTotal: senderQuotaCache.todaySuccessTotal,
    quotas: { ...senderQuotaCache.quotas },
  };
}

function buildSenderStatsEnv(userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) {
    return {};
  }
  const config = readAnnouncementConfig();
  if (!config.host || !config.user || !config.database) {
    return {};
  }
  return {
    MAILPILOT_USER_ID: String(uid),
    MAILPILOT_DB_HOST: String(config.host),
    MAILPILOT_DB_PORT: String(config.port || 3306),
    MAILPILOT_DB_USER: String(config.user),
    MAILPILOT_DB_PASSWORD: String(config.password || ''),
    MAILPILOT_DB_DATABASE: String(config.database),
    MAILPILOT_DB_SENDER_TABLE: 'sender_accounts',
    MAILPILOT_DB_STATS_TABLE: 'sender_daily_stats',
  };
}

function readAnnouncementConfig() {
  const template = {
    enabled: false,
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '',
    database: 'mailpilot',
    table: 'announcements',
    refreshSeconds: 30,
    speedSeconds: 24,
    maxItems: 20,
    fallbackText: '',
  };
  if (!fs.existsSync(announcementConfigPath)) {
    ensureDir(configDir);
    fs.writeFileSync(announcementConfigPath, JSON.stringify(template, null, 2), 'utf8');
    return template;
  }
  const raw = safeReadFile(announcementConfigPath);
  if (!raw) return template;
  try {
    const data = JSON.parse(raw);
    return { ...template, ...data };
  } catch (err) {
    return template;
  }
}

async function buildDashboard(userId = null) {
  const teachers = readTeachers();
  const logs = readLogLines();
  const { sent, failed, sentTimes } = parseLogStats(logs);
  const accounts = readAccounts();
  const quotaData = await getSenderQuotaData(userId);
  const quotaMap = quotaData?.quotas || {};

  const statsMap = {};
  accounts.forEach((acc) => {
    if (acc.email) {
      statsMap[acc.email.toLowerCase()] = {
        assigned: 0,
        sent: 0,
        failed: 0,
        pending: 0,
      };
    }
  });

  const teacherRows = teachers.map((teacher) => {
    const email = teacher.email.toLowerCase();
    let status = '未发送';
    if (sent.has(email)) status = '已发送';
    else if (failed.has(email)) status = '失败';

    const assigned = (teacher.assigned_account || '').toLowerCase();
    if (assigned && statsMap[assigned]) {
      statsMap[assigned].assigned += 1;
      if (status === '已发送') statsMap[assigned].sent += 1;
      else if (status === '失败') statsMap[assigned].failed += 1;
    }

    return {
      name: teacher.name,
      email: teacher.email,
      org: teacher.org || '',
      status,
      assigned_account: teacher.assigned_account || '',
      send_at_bj: teacher.send_at_bj || '',
      sent_at: status === '已发送' ? sentTimes[email] || '' : '',
    };
  });

  Object.values(statsMap).forEach((stat) => {
    stat.pending = Math.max(stat.assigned - stat.sent - stat.failed, 0);
  });

  const total = teachers.length;
  const sentCount = teacherRows.filter((t) => t.status === '已发送').length;
  const failedCount = teacherRows.filter((t) => t.status === '失败').length;
  const pendingCount = Math.max(total - sentCount - failedCount, 0);
  const todaySentRaw = Number(quotaData?.todaySuccessTotal);
  const todaySent = Number.isFinite(todaySentRaw) && todaySentRaw >= 0 ? todaySentRaw : 0;
  const dailyTotalLimitRaw = Number(quotaData?.dailyTotalLimit);
  const dailyTotalLimit = Number.isFinite(dailyTotalLimitRaw) && dailyTotalLimitRaw > 0
    ? dailyTotalLimitRaw
    : DEFAULT_DAILY_LIMIT;

  const accountsWithStats = accounts.map((acc) => {
    const emailKey = String(acc.email || '').toLowerCase();
    const stats = statsMap[emailKey] || {
      assigned: 0,
      sent: 0,
      failed: 0,
      pending: 0,
    };
    const quota = quotaMap[emailKey] || {};
    const dailyLimitRaw = Number(quota.daily_limit);
    const dailyLimit = Number.isFinite(dailyLimitRaw) && dailyLimitRaw > 0
      ? dailyLimitRaw
      : DEFAULT_DAILY_LIMIT;
    const todaySuccessRaw = Number(quota.today_success);
    const todaySuccess = Number.isFinite(todaySuccessRaw) && todaySuccessRaw >= 0
      ? todaySuccessRaw
      : 0;
    const todayRemainingRaw = Number(quota.today_remaining);
    const todayRemaining = Number.isFinite(todayRemainingRaw) && todayRemainingRaw >= 0
      ? todayRemainingRaw
      : Math.max(dailyLimit - todaySuccess, 0);

    return {
      ...acc,
      stats,
      daily_limit: dailyLimit,
      today_success: todaySuccess,
      today_remaining: todayRemaining,
      limit_reached: todayRemaining <= 0,
    };
  });

  const runningAccounts = Array.from(sendProcesses.values()).map((record) => ({
    email: record.email,
    startedAt: record.startedAt,
  }));

  return {
    stats: {
      total,
      sent: sentCount,
      failed: failedCount,
      pending: pendingCount,
      todaySent,
      dailyTotalLimit,
    },
    teachers: teacherRows,
    logs,
    recentLogs: logs.slice(-6).reverse(),
    logTail: logs.slice(-60),
    accounts: accountsWithStats,
    runningAccounts,
    quotaDate: quotaData?.date || '',
  };
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[,"\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildReportText(data) {
  const now = new Date();
  const timestamp = now.toISOString().replace('T', ' ').slice(0, 19);
  const lines = [];
  lines.push(`Report generated: ${timestamp}`);
  lines.push(`Total: ${data.stats.total} | Pending: ${data.stats.pending} | Sent: ${data.stats.sent} | Failed: ${data.stats.failed}`);
  lines.push('');
  lines.push('Accounts:');
  data.accounts.forEach((acc) => {
    const stats = acc.stats || {};
    lines.push(
      `- ${acc.email || 'unknown'} | assigned=${stats.assigned ?? 0} sent=${stats.sent ?? 0} failed=${stats.failed ?? 0} pending=${stats.pending ?? 0}`,
    );
  });
  lines.push('');
  lines.push('Teachers:');
  lines.push('email,name,org,assigned_account,status,sent_at');
  data.teachers.forEach((t) => {
    lines.push([
      csvEscape(t.email),
      csvEscape(t.name),
      csvEscape(t.org),
      csvEscape(t.assigned_account),
      csvEscape(t.status),
      csvEscape(t.sent_at),
    ].join(','));
  });
  lines.push('');
  lines.push('Logs:');
  data.logs.forEach((line) => lines.push(line));
  return lines.join('\n');
}

function runImport(filePath, account, baseTime) {
  return new Promise((resolve) => {
    if (!filePath) {
      resolve({ ok: false, error: '未选择文件' });
      return;
    }

    if (!fs.existsSync(batchesDir)) {
      fs.mkdirSync(batchesDir, { recursive: true });
    }

    const newJsonPath = path.join(batchesDir, `new_teachers_${Date.now()}.json`);

    const scriptArgs = ['--excel', filePath, '--json', teachersPath, '--new-json', newJsonPath];
    if (account) {
      scriptArgs.push('--account', account);
    }
    if (baseTime) {
      scriptArgs.push('--base-time', baseTime);
    }
    const args = buildPythonMainArgs(
      entryModules.importTeachers,
      importScriptPath,
      scriptArgs,
    );

    const debugHeader = [
      `[debug] python=${pythonBin}`,
      `[debug] script=${app.isPackaged ? entryModules.importTeachers : importScriptPath}`,
      `[debug] cwd=${appRoot}`,
      `[debug] excel=${filePath}`,
      `[debug] teachers=${teachersPath}`,
      `[debug] new_json=${newJsonPath}`,
      account ? `[debug] account=${account}` : '',
      baseTime ? `[debug] base_time=${baseTime}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const child = spawn(pythonBin, args, {
      cwd: appRoot,
      env: { ...process.env, MAILPILOT_BASE_DIR: baseDir },
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('close', (code) => {
      const result = {
        ok: code === 0,
        code,
        stdout: `${debugHeader}\n${stdout}`.trim(),
        stderr: stderr.trim(),
      };
      const match = stdout.match(/新增\s*(\d+)\s*条.*更新\s*(\d+)\s*条.*冲突\s*(\d+)\s*条/);
      if (match) {
        result.added = Number(match[1]);
        result.updated = Number(match[2]);
        result.conflicts = Number(match[3]);
      }
      resolve(result);
    });
  });
}

function importPasteToCsv(text) {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\t|,/).map((cell) => cell.trim()));

  if (rows.length === 0) return null;

  const firstRow = rows[0];
  const hasHeader = firstRow.some((cell) => cell.includes('姓名') || cell.includes('姓氏'))
    && firstRow.some((cell) => cell.includes('邮箱'));

  const dataRows = hasHeader ? rows.slice(1) : rows;

  const csvLines = ['姓氏,作者邮箱,与北京时间时差(小时)'];
  dataRows.forEach((cols) => {
    if (cols.length < 2) return;
    const name = cols[0].replace(/"/g, '""');
    const email = cols[1].replace(/"/g, '""');
    const offset = (cols[2] ?? '').toString().trim().replace(/"/g, '""');
    csvLines.push(`"${name}","${email}","${offset}"`);
  });

  if (!fs.existsSync(originalDir)) {
    fs.mkdirSync(originalDir, { recursive: true });
  }

  const fileName = `paste_${Date.now()}.csv`;
  const filePath = path.join(originalDir, fileName);
  fs.writeFileSync(filePath, csvLines.join('\n'), 'utf8');
  return filePath;
}

function writeTestList(text) {
  if (!text || !text.trim()) return null;
  if (!fs.existsSync(batchesDir)) {
    fs.mkdirSync(batchesDir, { recursive: true });
  }
  const fileName = `test_list_${Date.now()}.tsv`;
  const filePath = path.join(batchesDir, fileName);
  fs.writeFileSync(filePath, text, 'utf8');
  return filePath;
}

function startSendProcess(account, userId = null) {
  sendStopRequested = false;
  const email = (account || '').trim();
  if (!email) {
    return { ok: false, error: 'account_required' };
  }
  const key = email.toLowerCase();
  if (sendProcesses.has(key)) {
    return { ok: true, running: true };
  }

  const args = buildPythonMainArgs(
    entryModules.sendByAccounts,
    sendScriptPath,
    ['--teachers', teachersPath, '--accounts', accountsPath, '--log', emailLogPath, '--account', email],
  );
  const childEnv = {
    ...process.env,
    MAILPILOT_BASE_DIR: baseDir,
    ...buildSenderStatsEnv(userId),
  };
  const state = {
    email,
    child: null,
    startedAt: Date.now(),
    retryWithProxyAttempted: false,
    outputTail: '',
  };
  sendProcesses.set(key, state);

  const launch = (useProxy = false) => {
    const child = spawn(pythonBin, args, {
      cwd: appRoot,
      env: buildChildEnv(childEnv, !useProxy),
    });
    state.child = child;

    child.stdout.on('data', (data) => {
      const text = data.toString();
      state.outputTail = appendTailText(state.outputTail, text);
      fs.appendFileSync(runSendLogPath, text);
    });
    child.stderr.on('data', (data) => {
      const text = data.toString();
      state.outputTail = appendTailText(state.outputTail, text);
      fs.appendFileSync(runSendLogPath, text);
    });
    child.on('close', (code) => {
      const record = sendProcesses.get(key);
      if (!record || record !== state) return;
      const canRetryWithProxy =
        !sendStopRequested &&
        !useProxy &&
        !state.retryWithProxyAttempted &&
        code !== 0 &&
        hasNetworkTimeoutSignal(state.outputTail);

      if (canRetryWithProxy) {
        state.retryWithProxyAttempted = true;
        state.outputTail = '';
        fs.appendFileSync(runSendLogPath, `[fallback] direct route failed, retrying with proxy for ${email}\n`);
        launch(true);
        return;
      }
      sendProcesses.delete(key);
    });
  };

  launch(false);

  return { ok: true, started: true };
}

function stopSend(account) {
  sendStopRequested = true;
  const targets = [];
  if (account) {
    const key = account.toLowerCase();
    const record = sendProcesses.get(key);
    if (record) targets.push(record);
  } else {
    sendProcesses.forEach((record) => targets.push(record));
  }

  if (targets.length === 0) {
    return { ok: false, message: 'no active send' };
  }
  targets.forEach((record) => {
    if (record.child && !record.child.killed) {
      try {
        record.child.kill();
      } catch (err) {
        // ignore
      }
    }
  });
  return { ok: true, stopped: targets.map((item) => item.email) };
}

function runTestSend(text, account, startTime, userId = null) {
  return new Promise((resolve) => {
    if (testSendProcess && testSendProcess.child && !testSendProcess.child.killed) {
      resolve({ ok: false, running: true, error: 'test send already running' });
      return;
    }
    if (!account) {
      resolve({ ok: false, error: '请选择测试账号' });
      return;
    }
    const listPath = writeTestList(text);
    if (!listPath) {
      resolve({ ok: false, error: '测试名单为空' });
      return;
    }
    if (!fs.existsSync(testLogsDir)) {
      fs.mkdirSync(testLogsDir, { recursive: true });
    }
    const logPath = path.join(testLogsDir, `test_send_${Date.now()}.log`);
    const scriptArgs = [
      '--list',
      listPath,
      '--accounts',
      accountsPath,
      '--account',
      account,
      '--log',
      logPath,
    ];
    if (startTime) {
      scriptArgs.push('--start-time');
      scriptArgs.push(startTime);
    }
    const args = buildPythonMainArgs(
      entryModules.testSend,
      testSendScriptPath,
      scriptArgs,
    );

    let stdout = '';
    let stderr = '';
    const state = {
      child: null,
      account,
      startedAt: Date.now(),
      stopRequested: false,
      retryWithProxyAttempted: false,
      outputTail: '',
    };

    const launch = (useProxy = false) => {
      const child = spawn(pythonBin, args, {
        cwd: appRoot,
        env: buildChildEnv({}, !useProxy),
      });
      state.child = child;
      testSendProcess = state;

      child.stdout.on('data', (data) => {
        const text = data.toString();
        state.outputTail = appendTailText(state.outputTail, text);
        stdout += text;
      });
      child.stderr.on('data', (data) => {
        const text = data.toString();
        state.outputTail = appendTailText(state.outputTail, text);
        stderr += text;
      });
      child.on('close', (code) => {
        const isCurrent = testSendProcess && testSendProcess.child === child;
        const wasStopped = Boolean((isCurrent && testSendProcess.stopRequested) || state.stopRequested);
        if (isCurrent) {
          testSendProcess = null;
        }

        const canRetryWithProxy =
          !wasStopped &&
          !useProxy &&
          !state.retryWithProxyAttempted &&
          code !== 0 &&
          hasNetworkTimeoutSignal(state.outputTail);

        if (canRetryWithProxy) {
          state.retryWithProxyAttempted = true;
          state.outputTail = '';
          stderr += '\n[fallback] direct route failed, retrying with proxy\n';
          launch(true);
          return;
        }

        if (wasStopped) {
          resolve({
            ok: false,
            stopped: true,
            code,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            logPath,
          });
          return;
        }

        resolve({
          ok: code === 0,
          code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          logPath,
        });
      });
    };

    launch(false);
  });
}

function stopTestSend() {
  if (!testSendProcess || !testSendProcess.child || testSendProcess.child.killed) {
    return { ok: false, message: 'no active test send' };
  }
  testSendProcess.stopRequested = true;
  try {
    testSendProcess.child.kill();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function runFeedbackSend(payload) {
  return new Promise((resolve) => {
    const account = payload?.account || '';
    const to = payload?.to || '';
    const subject = payload?.subject || '';
    const message = payload?.message || '';
    if (!account) {
      resolve({ ok: false, error: '请选择发件账号' });
      return;
    }
    if (!message) {
      resolve({ ok: false, error: '请填写反馈内容' });
      return;
    }

    if (!fs.existsSync(feedbackLogsDir)) {
      fs.mkdirSync(feedbackLogsDir, { recursive: true });
    }
    const stamp = Date.now();
    const messageFile = path.join(feedbackLogsDir, `feedback_${stamp}.txt`);
    const logPath = path.join(feedbackLogsDir, `feedback_${stamp}.log`);
    fs.writeFileSync(messageFile, message, 'utf8');

    const scriptArgs = [
      '--accounts',
      accountsPath,
      '--account',
      account,
      '--subject',
      subject || 'Mailboat 问题反馈',
      '--message-file',
      messageFile,
      '--log',
      logPath,
    ];
    if (to) {
      scriptArgs.push('--to');
      scriptArgs.push(to);
    }
    const args = buildPythonMainArgs(
      entryModules.feedbackSend,
      feedbackScriptPath,
      scriptArgs,
    );

    const child = spawn(pythonBin, args, {
      cwd: appRoot,
      env: buildChildEnv({}, true),
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        logPath,
      });
    });
  });
}

function runAnnouncementFetch(all = false) {
  return new Promise((resolve) => {
    const config = readAnnouncementConfig();
    const fallback = (config.fallbackText || '').trim();
    if (!config.enabled) {
      resolve({
        ok: true,
        data: { content: fallback },
        settings: {
          enabled: Boolean(fallback),
          refresh: config.refreshSeconds,
          speed: config.speedSeconds,
        },
      });
      return;
    }
    if (!config.host || !config.user || !config.database) {
      if (fallback) {
        resolve({
          ok: true,
          data: { content: fallback },
          settings: {
            enabled: true,
            refresh: config.refreshSeconds,
            speed: config.speedSeconds,
          },
        });
      } else {
        resolve({
          ok: false,
          error: '??? announcement_config.json ?????host/user/database',
        });
      }
      return;
    }
    const scriptArgs = [
      '--host',
      config.host,
      '--port',
      String(config.port || 3306),
      '--user',
      config.user,
      '--password',
      config.password || '',
      '--database',
      config.database,
      '--table',
      config.table || 'announcements',
    ];
    if (all) {
      scriptArgs.push('--all');
      scriptArgs.push('--limit');
      scriptArgs.push(String(config.maxItems || 20));
    }
    const args = buildPythonMainArgs(
      entryModules.announcementFetch,
      announcementScriptPath,
      scriptArgs,
    );
    const child = spawn(pythonBin, args, {
      cwd: appRoot,
      env: buildChildEnv(),
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('close', (code) => {
      if (code !== 0) {
        if (fallback) {
          resolve({
            ok: true,
            data: { content: fallback },
            settings: {
              enabled: true,
              refresh: config.refreshSeconds,
              speed: config.speedSeconds,
            },
          });
        } else {
          resolve({ ok: false, error: stderr || stdout || '?????????' });
        }
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        if (!parsed.ok) {
          if (fallback) {
            resolve({
              ok: true,
              data: { content: fallback },
              settings: {
                enabled: true,
                refresh: config.refreshSeconds,
                speed: config.speedSeconds,
              },
            });
          } else {
            resolve({ ok: false, error: parsed.error || '?????????' });
          }
          return;
        }
        resolve({
          ok: true,
          data: parsed.data || {},
          settings: {
            enabled: true,
            refresh: config.refreshSeconds,
            speed: config.speedSeconds,
          },
        });
      } catch (err) {
        resolve({ ok: false, error: stdout.trim() || String(err) });
      }
    });
  });
}

function runSmtpCheck(account) {
  return new Promise((resolve) => {
    if (!account || !account.email || !account.password) {
      resolve({ ok: false, error: '请先填写邮箱和授权码' });
      return;
    }
    const args = buildPythonMainArgs(
      entryModules.smtpCheck,
      smtpCheckScriptPath,
      [
        '--email',
        account.email,
        '--password',
        account.password,
        '--smtp-server',
        account.smtp_server || 'smtp.gmail.com',
        '--smtp-port',
        String(account.smtp_port || 465),
        '--timeout',
        '15',
      ],
    );

    const runAttempt = (useProxy) =>
      new Promise((attemptResolve) => {
        const child = spawn(pythonBin, args, {
          cwd: appRoot,
          env: buildChildEnv({}, !useProxy),
        });
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        child.on('close', (code) => {
          attemptResolve({
            ok: code === 0,
            code,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            route: useProxy ? 'proxy' : 'direct',
          });
        });
      });

    runAttempt(false).then((direct) => {
      if (direct.ok) {
        resolve(direct);
        return;
      }

      const directMsg = `${direct.stdout || ''}\n${direct.stderr || ''}`.trim();
      if (!hasNetworkTimeoutSignal(directMsg)) {
        resolve(direct);
        return;
      }

      runAttempt(true).then((proxy) => {
        if (proxy.ok) {
          const tagged = proxy.stdout ? `${proxy.stdout}; ROUTE=proxy` : 'ROUTE=proxy';
          resolve({ ...proxy, stdout: tagged });
          return;
        }

        const merged = [
          `[direct] ${directMsg || 'failed'}`,
          `[proxy] ${(proxy.stderr || proxy.stdout || '').trim() || 'failed'}`,
        ]
          .filter(Boolean)
          .join('\n');

        resolve({
          ok: false,
          code: proxy.code,
          stdout: '',
          stderr: merged,
          route: 'both-failed',
        });
      });
    });
  });
}

function runGmailOauthAction(action, email) {
  return new Promise((resolve) => {
    const normalizedAction = String(action || '').trim().toLowerCase();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      resolve({ ok: false, error: 'invalid email' });
      return;
    }
    if (!isGmailAddress(normalizedEmail)) {
      resolve({ ok: false, error: 'only gmail/googlemail is supported' });
      return;
    }
    if (!['bind', 'unbind', 'status'].includes(normalizedAction)) {
      resolve({ ok: false, error: 'invalid action' });
      return;
    }

    const args = buildPythonMainArgs(
      entryModules.gmailOauth,
      gmailOauthScriptPath,
      [
        '--action',
        normalizedAction,
        '--email',
        normalizedEmail,
        '--credentials',
        resolveGmailCredentialsPath(),
        '--tokens-dir',
        gmailTokensDir,
      ],
    );

    const child = spawn(pythonBin, args, {
      cwd: appRoot,
      env: buildChildEnv(),
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('close', (code) => {
      if (code !== 0) {
        resolve({
          ok: false,
          code,
          error: (stderr || stdout || '').trim() || 'gmail oauth failed',
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
        return;
      }
      const text = (stdout || '').trim();
      let parsed = null;
      if (text) {
        const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        for (let i = lines.length - 1; i >= 0; i -= 1) {
          try {
            parsed = JSON.parse(lines[i]);
            break;
          } catch (err) {
            // continue
          }
        }
      }
      if (!parsed || typeof parsed !== 'object') {
        resolve({
          ok: false,
          code,
          error: 'oauth response parse failed',
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
        return;
      }
      resolve(parsed);
    });
  });
}

function validateGmailCredentialsJson(raw) {
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: 'credentials.json is not valid JSON' };
  }
  if (!data || typeof data !== 'object' || (!data.installed && !data.web)) {
    return { ok: false, error: 'credentials.json missing installed/web field' };
  }
  return { ok: true, normalized: `${JSON.stringify(data, null, 2)}\n` };
}

function setGmailCredentialsFromFile(sourcePath) {
  try {
    const src = String(sourcePath || '').trim();
    if (!src) {
      return { ok: false, error: 'empty source path' };
    }
    if (!fs.existsSync(src)) {
      return { ok: false, error: 'source file not found' };
    }
    const raw = fs.readFileSync(src, 'utf8');
    const check = validateGmailCredentialsJson(raw);
    if (!check.ok) {
      return { ok: false, error: check.error };
    }

    ensureDir(path.dirname(gmailCredentialsPath));
    fs.writeFileSync(gmailCredentialsPath, check.normalized, 'utf8');
    return {
      ok: true,
      source: src,
      target: gmailCredentialsPath,
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function getGmailCredentialsStatus() {
  const resolvedPath = resolveGmailCredentialsPath();
  return {
    ok: true,
    exists: fs.existsSync(resolvedPath),
    path: resolvedPath,
    target: gmailCredentialsPath,
  };
}

function createWindow() {
  initStoragePaths();
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#0b101a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function setupAppMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit',
          role: 'quit',
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: (_menuItem, focusedWindow) => {
            if (focusedWindow) {
              focusedWindow.reload();
            }
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (gotSingleInstanceLock) {
  app.whenReady().then(() => {
    setupAppMenu();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Spreadsheets', extensions: ['xlsx', 'csv'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('download-import-sample', async () => {
  try {
    if (!fs.existsSync(importSampleFilePath)) {
      return {
        ok: false,
        error: `示例文件不存在：${importSampleFilePath}`,
      };
    }
    const result = await dialog.showSaveDialog({
      title: '下载示例文件',
      defaultPath: path.join(baseDir, 'import_example.xlsx'),
      filters: [
        { name: 'Excel', extensions: ['xlsx'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true };
    }
    fs.copyFileSync(importSampleFilePath, result.filePath);
    return { ok: true, path: result.filePath };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('select-attachments', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Attachments', extensions: ['pdf', 'doc', 'docx', 'png', 'jpg'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('save-dropped-file', async (_event, name, base64) => {
  try {
    if (!base64) {
      return { ok: false, error: 'empty file data' };
    }
    if (!fs.existsSync(originalDir)) {
      fs.mkdirSync(originalDir, { recursive: true });
    }
    const safeName = String(name || 'dropped.xlsx').replace(/[<>:"/\\|?*]/g, '_');
    const fileName = `${Date.now()}_${safeName}`;
    const filePath = path.join(originalDir, fileName);
    const buffer = Buffer.from(base64, 'base64');
    fs.writeFileSync(filePath, buffer);
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('get-dashboard', async (_event, payload) => {
  const userId = payload && typeof payload === 'object' ? payload.userId : null;
  return buildDashboard(userId);
});

ipcMain.handle('import-excel', async (_event, filePath, account, baseTime) => runImport(filePath, account, baseTime));

ipcMain.handle('import-paste', async (_event, text, account, baseTime) => {
  const filePath = importPasteToCsv(text);
  if (!filePath) return { ok: false, error: '粘贴内容为空' };
  return runImport(filePath, account, baseTime);
});

ipcMain.handle('save-accounts', async (_event, payload) => {
  const accounts = Array.isArray(payload) ? payload : payload?.accounts;
  const userId = Array.isArray(payload) ? null : payload?.userId;
  saveAccounts(Array.isArray(accounts) ? accounts : []);
  // Fire-and-forget DB sync to keep UI responsive.
  syncSenderAccountsToDb(userId).catch(() => {});
  return { ok: true, dbSync: { pending: true } };
});

ipcMain.handle('list-mail-templates', async () => ({
  ok: true,
  templates: readMailTemplates(),
}));

ipcMain.handle('save-mail-template', async (_event, payload) => saveMailTemplate(payload));
ipcMain.handle('delete-mail-template', async (_event, name) => deleteMailTemplate(name));

async function openGmailCredentialsPicker() {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'JSON', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return { ok: false, canceled: true };
  }
  return setGmailCredentialsFromFile(result.filePaths[0]);
}

ipcMain.handle('set-gmail-credentials', async () => openGmailCredentialsPicker());
ipcMain.handle('get-gmail-credentials-status', async () => getGmailCredentialsStatus());

// Backward-compatible IPC aliases (old renderer names).
ipcMain.handle('set-gmail-client-secret', async () => openGmailCredentialsPicker());
ipcMain.handle('get-gmail-client-secret-status', async () => getGmailCredentialsStatus());

ipcMain.handle('start-send', async (_event, payload) => {
  if (typeof payload === 'string') {
    return startSendProcess(payload, null);
  }
  return startSendProcess(payload?.account, payload?.userId);
});
ipcMain.handle('stop-send', async (_event, account) => stopSend(account));

ipcMain.handle('test-send', async (_event, payload, legacyAccount, legacyStartTime) => {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return runTestSend(payload.text, payload.account, payload.startTime, payload.userId);
  }
  return runTestSend(payload, legacyAccount, legacyStartTime, null);
});
ipcMain.handle('stop-test-send', async () => stopTestSend());

ipcMain.handle('test-smtp', async (_event, account) => runSmtpCheck(account));
ipcMain.handle('gmail-oauth-bind', async (_event, email) => runGmailOauthAction('bind', email));
ipcMain.handle('gmail-oauth-unbind', async (_event, email) => runGmailOauthAction('unbind', email));
ipcMain.handle('gmail-oauth-status', async (_event, email) => runGmailOauthAction('status', email));

ipcMain.handle('get-announcement', async () => runAnnouncementFetch(false));
ipcMain.handle('list-announcements', async () => runAnnouncementFetch(true));

ipcMain.handle('get-storage-info', async () => ({
  baseDir,
  dataDir,
  logsDir,
  configDir,
  teachersPath,
  accountsPath,
}));

ipcMain.handle('get-app-version', async () => ({
  version: app.getVersion(),
}));

ipcMain.handle('open-external-url', async (_event, url) => {
  const target = String(url || '').trim();
  if (!target) {
    return { ok: false, error: 'empty_url' };
  }
  try {
    await shell.openExternal(target);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});

ipcMain.handle('select-storage-dir', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return { ok: false };
  }
  const nextDir = result.filePaths[0];
  applyBaseDir(nextDir);
  saveUserSettings({ baseDir: nextDir });
  return {
    ok: true,
    baseDir,
    dataDir,
    logsDir,
    configDir,
    teachersPath,
    accountsPath,
  };
});

ipcMain.handle('window-minimize', async () => {
  if (win) win.minimize();
  return { ok: true };
});

ipcMain.handle('window-maximize', async () => {
  if (!win) return { ok: false };
  if (win.isMaximized()) {
    win.unmaximize();
    return { ok: true, maximized: false };
  }
  win.maximize();
  return { ok: true, maximized: true };
});

ipcMain.handle('window-close', async () => {
  if (win) win.close();
  return { ok: true };
});

ipcMain.handle('export-report', async () => {
  try {
    const data = await buildDashboard(null);
    const report = buildReportText(data);
    const now = new Date();
    const stamp = now.toISOString().replace(/[:T]/g, '-').slice(0, 16);
    const defaultName = `report_${stamp}.txt`;
    const result = await dialog.showSaveDialog({
      title: '导出报告',
      defaultPath: path.join(appRoot, defaultName),
      filters: [
        { name: 'Report', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePath) {
      return { ok: false, error: '已取消导出' };
    }
    fs.writeFileSync(result.filePath, report, 'utf8');
    return { ok: true, path: result.filePath };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('send-feedback', async (_event, payload) => runFeedbackSend(payload));

ipcMain.handle('delete-teachers', async (_event, emails) => deleteTeachers(emails));

ipcMain.handle('toggle-always-on-top', async () => {
  if (!win) return { ok: false };
  const next = !win.isAlwaysOnTop();
  win.setAlwaysOnTop(next, 'screen-saver');
  return { ok: true, value: next };
});
