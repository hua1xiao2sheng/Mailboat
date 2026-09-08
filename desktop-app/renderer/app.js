const views = document.querySelectorAll('.view');
const navItems = document.querySelectorAll('.nav-item');
const title = document.getElementById('view-title');
const subtitle = document.getElementById('view-subtitle');

// Public source builds use the local backend by default.
// Set this to your own HTTPS endpoint when deploying a hosted service.
const REMOTE_API_BASE = '';
const LEGACY_LOCAL_API_BASE = 'http://127.0.0.1:6661';
const LOCAL_API_BASE = 'http://127.0.0.1:8000';
if (localStorage.getItem('apiBase') === LEGACY_LOCAL_API_BASE) {
  localStorage.setItem('apiBase', LOCAL_API_BASE);
}
const DEFAULT_API_BASE = LOCAL_API_BASE;
const API_BASE = localStorage.getItem('apiBase') || DEFAULT_API_BASE;
const TEST_LIST_KEY = 'testList';
const DEMO_MODE = Boolean(window.mailpilot?.isDemoMode);
// This public desktop build runs as a single-user local application.
const LOCAL_NO_AUTH = true;
const AUTH_BYPASS_ENABLED = LOCAL_NO_AUTH || DEMO_MODE;

const SMTP_PRESETS = {
  'gmail.com': { server: 'smtp.gmail.com', port: 465 },
  'googlemail.com': { server: 'smtp.gmail.com', port: 465 },
  'qq.com': { server: 'smtp.qq.com', port: 465 },
  '163.com': { server: 'smtp.163.com', port: 465 },
  '126.com': { server: 'smtp.126.com', port: 465 },
  'outlook.com': { server: 'smtp.office365.com', port: 587 },
  'hotmail.com': { server: 'smtp.office365.com', port: 587 },
  'live.com': { server: 'smtp.office365.com', port: 587 },
};

const authOverlay = document.getElementById('auth-overlay');
const authMessage = document.getElementById('auth-message');
const versionCheckModal = document.getElementById('version-check-modal');
const versionCheckTitle = document.getElementById('version-check-title');
const versionCheckSubtitle = document.getElementById('version-check-subtitle');
const versionCheckMessage = document.getElementById('version-check-message');
const versionCheckDetails = document.getElementById('version-check-details');
const versionCheckNotes = document.getElementById('version-check-notes');
const versionCheckDownloadBtn = document.getElementById('version-check-download');
const userEmailEl = document.getElementById('user-email');
const membershipStatusTitle = document.getElementById('membership-status-title');
const membershipStatusSub = document.getElementById('membership-status-sub');
const membershipStatusChip = document.getElementById('membership-status-chip');
const membershipOpenTopbar = document.getElementById('membership-open-topbar');
const membershipOpenCard = document.getElementById('membership-open-card');
const loginPhoneInput = document.getElementById('login-phone');
const loginPasswordInput = document.getElementById('login-password');
const loginPasswordToggleBtn = document.getElementById('login-password-toggle');
const loginCaptchaWrap = document.getElementById('login-captcha-wrap');
const loginCaptchaCodeInput = document.getElementById('login-captcha-code');
const loginCaptchaImage = document.getElementById('login-captcha-image');
const loginCaptchaRefreshBtn = document.getElementById('login-captcha-refresh');
const registerPhoneInput = document.getElementById('register-phone');
const registerPasswordInput = document.getElementById('register-password');
const registerCodeInput = document.getElementById('register-code');
const registerAgreeInput = document.getElementById('register-agree');
const registerSubmitBtn = document.getElementById('register-submit');
const registerPasswordToggleBtn = document.getElementById('register-password-toggle');
const sendCodeBtn = document.querySelector('[data-auth-action="send-code"]');
const resetPasswordModal = document.getElementById('reset-password-modal');
const resetPhoneInput = document.getElementById('reset-phone');
const resetCodeInput = document.getElementById('reset-code');
const resetPasswordInput = document.getElementById('reset-password');
const resetPasswordConfirmInput = document.getElementById('reset-password-confirm');
const resetPasswordToggleBtn = document.getElementById('reset-password-toggle');
const resetPasswordMessage = document.getElementById('reset-password-message');
const resetSendCodeBtn = document.querySelector('[data-auth-action="send-reset-code"]');
const paymentModal = document.getElementById('payment-modal');
const paymentPlanList = document.getElementById('payment-plan-list');
const paymentAccessSummary = document.getElementById('payment-access-summary');
const paymentQrLoading = document.getElementById('payment-qr-loading');
const paymentQrImage = document.getElementById('payment-qr-image');
const paymentOrderStatus = document.getElementById('payment-order-status');
const paymentOrderPlan = document.getElementById('payment-order-plan');
const paymentOrderPrice = document.getElementById('payment-order-price');
const paymentOrderNo = document.getElementById('payment-order-no');
const paymentOrderExpire = document.getElementById('payment-order-expire');
const PHONE_REGEX = /^1[3-9]\d{9}$/;
const DEFAULT_RELEASE_CHANNEL = 'windows';

function getApiBase() {
  return localStorage.getItem('apiBase') || API_BASE || DEFAULT_API_BASE;
}

const viewMeta = {
  dashboard: ['仪表盘', '总览发送任务、账号状态与导师池数据'],
  accounts: ['账号中心', '多账号独立发送，统一去重'],
  import: ['导入/粘贴', '导入 Excel 或粘贴表格到导师库'],
  library: ['导师库', '统一 teachers.json 去重数据'],
  compose: ['邮件模板', '编辑主题、正文与附件'],
  send: ['发送控制台', '发送任务、进度与重试控制'],
  test: ['测试发送', '独立测试名单，不影响正式记录'],
  logs: ['日志与报告', '失败原因、导出与重试'],
  feedback: ['问题反馈', '选择发件账号并发送反馈'],
  settings: ['设置', '安全与存储'],
};

const blankAccount = {
  email: '',
  send_channel: 'smtp',
  gmail_oauth_bound: false,
  password: '',
  name: '',
  smtp_server: 'smtp.gmail.com',
  smtp_port: 465,
  start_time_bj: '',
  min_delay: 40,
  max_delay: 60,
  subject: '',
  content: '',
  attachments: [],
};

const BUILTIN_COMPOSE_TEMPLATES = [
  {
    name: '示例模板',
    subject: 'PhD Application',
    content: `Dear Prof. {teacher_name},

Hope this email finds you well!

My name is [Your Name], and I am writing to inquire about potential opportunities.

Best regards,
[Your Name]`,
    attachments: [],
    isBuiltin: true,
  },
];

const BUILTIN_COMPOSE_TEMPLATE_NAMES = new Set(
  BUILTIN_COMPOSE_TEMPLATES.map((tpl) => String(tpl?.name || '').trim()).filter(Boolean),
);

let authToken = localStorage.getItem('authToken') || '';
let currentUser = null;
let accessState = null;
let currentAccounts = [];
let selectedFilePath = '';
let teacherFilter = 'all';
let accountFilter = 'all';
let logFilter = 'all';
let selectedTeacherEmails = new Set();
let lastTeacherIndex = null;
let lastRenderedTeachers = [];
let lastDashboard = null;
let composeSyncLock = false;
let sendRefreshTimer = null;
let sendSelectionTouched = false;
let appStartupComplete = false;
let startupVersionState = null;
let selectedSendAccounts = new Set();
let sendStopRequested = false;
let runningSendAccounts = new Set();
let testSendRunning = false;
let lastGridFocus = { mode: null, cell: null };
const gridUndo = { paste: [], test: [] };
const GRID_UNDO_LIMIT = 30;
let accountAutoSaveTimer = null;
let accountAutoSaveDirty = false;
let accountAutoSaveSnapshot = '';
let accountAutoSaving = false;
let gmailCredentialsUploaded = null;
let selectedAccountViewEmails = new Set();
let accountViewFilterInitialized = false;
let composeTemplates = [];
let registerCodeCooldownTimer = null;
let registerCodeCooldownLeft = 0;
let loginCaptchaRequired = false;
let loginCaptchaChallengeId = '';
let loginCaptchaLoading = false;
let resetCodeCooldownTimer = null;
let resetCodeCooldownLeft = 0;
let paymentSelectedPlanCode = 'vip_month';
let paymentCurrentOrder = null;
let paymentQrObjectUrl = '';
let paymentPollTimer = null;
let paymentExpiryTimer = null;
let paymentPrepareToken = 0;
let paymentExpiryDeadline = 0;
let accessRefreshTimer = null;

navItems.forEach((item) => {
  item.addEventListener('click', () => {
    if (!hasAccess()) {
      showAuth('请先登录');
      return;
    }
    navItems.forEach((i) => i.classList.remove('is-active'));
    item.classList.add('is-active');
    const view = item.dataset.view;
    showView(view);
  });
});

async function showView(view) {
  if (hasAccess()) {
    await autoSaveAccounts(true);
  }
  views.forEach((v) => v.classList.remove('is-visible'));
  const target = document.getElementById(`view-${view}`);
  if (target) {
    target.classList.add('is-visible');
  }
  navItems.forEach((item) => {
    item.classList.toggle('is-active', item.dataset.view === view);
  });
  const meta = viewMeta[view];
  if (meta) {
    title.textContent = meta[0];
    subtitle.textContent = meta[1];
  }
  if (view === 'compose') {
    void loadComposeTemplates();
  }
  refreshAll();
}

function setAuthOverlay(visible) {
  if (!authOverlay) return;
  if (visible) {
    authOverlay.classList.remove('is-hidden');
    document.body.classList.add('auth-locked');
  } else {
    authOverlay.classList.add('is-hidden');
    document.body.classList.remove('auth-locked');
  }
}

function setAuthMessage(message, isError = true) {
  if (!authMessage) return;
  authMessage.textContent = message || '';
  authMessage.style.color = isError ? 'var(--warning)' : 'var(--accent)';
}

function setResetPasswordMessage(message, isError = true) {
  if (!resetPasswordMessage) return;
  resetPasswordMessage.textContent = message || '';
  resetPasswordMessage.style.color = isError ? 'var(--warning)' : 'var(--accent)';
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = {};
      }
    }
    return { res, data };
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error('请求超时：请检查后端是否启动且可访问');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAuthWithFallback(path, options = {}, timeoutMs = 10000) {
  const preferredBase = getApiBase();
  const candidates = [preferredBase, REMOTE_API_BASE, LOCAL_API_BASE];
  const bases = Array.from(new Set(candidates.filter(Boolean)));

  let lastError = null;
  let lastResponse = null;
  let lastData = {};
  for (let i = 0; i < bases.length; i += 1) {
    const base = bases[i];
    try {
      const { res, data } = await fetchJsonWithTimeout(`${base}${path}`, options, timeoutMs);
      lastResponse = res;
      lastData = data;

      // Old remote backend usually returns 404 for new auth endpoints.
      if (!res.ok && res.status === 404 && i < bases.length - 1) {
        continue;
      }

      if (base !== preferredBase && res.ok) {
        localStorage.setItem('apiBase', base);
      }
      return { res, data, base };
    } catch (err) {
      lastError = err;
      if (i < bases.length - 1) {
        continue;
      }
    }
  }

  if (lastError) throw lastError;
  return { res: lastResponse, data: lastData, base: bases[bases.length - 1] };
}

function renderVersionCheckState(state) {
  startupVersionState = state || null;
  if (!versionCheckModal) return;

  versionCheckTitle.textContent = state?.title || '启动前版本校验';
  versionCheckSubtitle.textContent = state?.subtitle || '当前客户端需先完成版本校验';
  versionCheckMessage.textContent = state?.message || '正在执行版本校验。';
  versionCheckNotes.textContent = state?.notes || '请按版本策略更新客户端后重试。';
  versionCheckDetails.innerHTML = '';

  (state?.details || []).forEach((text) => {
    const item = document.createElement('li');
    item.textContent = text;
    versionCheckDetails.appendChild(item);
  });

  const downloadUrl = String(state?.downloadUrl || '').trim();
  versionCheckDownloadBtn.hidden = !downloadUrl;
  versionCheckDownloadBtn.dataset.url = downloadUrl;
  versionCheckModal.classList.remove('is-hidden');
}

function hideVersionCheckState() {
  startupVersionState = null;
  if (!versionCheckModal) return;
  versionCheckModal.classList.add('is-hidden');
  versionCheckDownloadBtn.hidden = true;
  versionCheckDownloadBtn.dataset.url = '';
}

async function openVersionDownload(url) {
  const target = String(url || '').trim();
  if (!target) {
    showToast('当前未配置安装包下载地址', 2600);
    return;
  }
  if (window.mailpilot?.openExternalUrl) {
    const result = await window.mailpilot.openExternalUrl(target);
    if (result?.ok) {
      showToast('已打开下载地址', 2200);
      return;
    }
  }
  window.open(target, '_blank', 'noopener');
}

async function getClientAppVersion() {
  try {
    if (!window.mailpilot?.getAppVersion) {
      return '0.0.0';
    }
    const result = await window.mailpilot.getAppVersion();
    return String(result?.version || '0.0.0').trim() || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function runStartupVersionCheck() {
  const clientVersion = await getClientAppVersion();
  const query = new URLSearchParams({
    version: clientVersion,
    channel: DEFAULT_RELEASE_CHANNEL,
  });

  try {
    const { res, data, base } = await fetchAuthWithFallback(`/public/app-version/check?${query.toString()}`, {}, 12000);
    if (!res.ok) {
      throw new Error(data?.detail || '版本校验接口不可用');
    }
    if (base) {
      localStorage.setItem('apiBase', base);
    }
    if (data?.allow_open) {
      hideVersionCheckState();
      return true;
    }

    const currentVersion = String(data?.current_version || '-').trim() || '-';
    const latestVersion = String(data?.latest_version || currentVersion).trim() || currentVersion;
    const packageName = String(data?.package_name || '').trim();
    const releaseNotes = String(data?.release_notes || '').trim();
    renderVersionCheckState({
      title: data?.requires_reinstall ? '检测到版本不匹配' : '检测到版本策略变更',
      subtitle: `当前客户端 ${clientVersion} · 校验接口 ${base || getApiBase()}`,
      message: data?.requires_reinstall
        ? '当前客户端版本与后端要求不一致，必须重新安装指定版本后才允许继续使用。'
        : '当前客户端版本与后端配置不一致，请确认是否需要更新后再继续使用。',
      details: [
        `当前客户端版本：${clientVersion}`,
        `后端要求版本：${currentVersion}`,
        `最新安装包版本：${latestVersion}`,
        packageName ? `安装包名称：${packageName}` : '',
      ].filter(Boolean),
      notes: releaseNotes || '请在数据库表 app_release_configs 中维护 current_version、latest_version、download_url 和 force_reinstall。',
      downloadUrl: String(data?.download_url || '').trim(),
    });
    return false;
  } catch (err) {
    renderVersionCheckState({
      title: '无法完成版本校验',
      subtitle: `当前客户端 ${clientVersion}`,
      message: '启动时未能从后端完成版本校验。为避免版本不一致带来的数据问题，当前已阻止进入主界面。',
      details: [
        `当前客户端版本：${clientVersion}`,
        `当前后端地址：${getApiBase()}`,
        `错误信息：${err?.message || err}`,
      ],
      notes: '请先确认后端已升级并提供 /public/app-version/check 接口，同时数据库已存在 app_release_configs 配置。',
      downloadUrl: '',
    });
    return false;
  }
}

function showAuth(message) {
  setAuthMessage(message || '');
  setAuthOverlay(true);
}

function setAuthed(user, token) {
  currentUser = user;
  authToken = token || '';
  if (authToken) {
    localStorage.setItem('authToken', authToken);
  } else {
    localStorage.removeItem('authToken');
  }
  localStorage.removeItem('guestMode');
  if (userEmailEl) {
    userEmailEl.textContent = user.username || user.email || '已登录';
  }
  setAuthMessage('');
  setAuthOverlay(false);
  void refreshAll();
}

function hasAccess() {
  return AUTH_BYPASS_ENABLED || Boolean(authToken);
}

async function apiRequest(path, options = {}) {
  const headers = options.headers || {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  const res = await fetch(`${getApiBase()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.detail || '请求失败';
    throw new Error(message);
  }
  return data;
}

async function checkAuth() {
  if (AUTH_BYPASS_ENABLED) {
    const localUsername = DEMO_MODE ? '本地演示' : '本地用户';
    currentUser = { id: 0, username: localUsername };
    accessState = {
      user: {
        id: 0,
        username: localUsername,
        can_send: true,
        membership_status: 'local',
        subscription_active: true,
        subscription_plan_name: DEMO_MODE ? '演示模式' : '本地版',
        today_success: 0,
        today_remaining: 20,
        daily_limit: 20,
      },
      plans: [],
      default_plan_code: '',
    };
    if (userEmailEl) userEmailEl.textContent = localUsername;
    setAuthMessage('');
    setAuthOverlay(false);
    renderMembershipCard();
    return;
  }
  if (!authToken) {
    showAuth('请登录后继续');
    return;
  }
  try {
    const user = await apiRequest('/me');
    setAuthed(user, authToken);
  } catch (err) {
    localStorage.removeItem('authToken');
    authToken = '';
    accessState = null;
    localStorage.removeItem('guestMode');
    showAuth('登录已失效，请重新登录');
  }
}

function coerceNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeDateTimeInput(value) {
  if (!value) return '';
  return String(value).trim().replace('T', ' ');
}

function toDateTimeLocalValue(value) {
  if (!value) return '';
  const text = String(value).trim();
  if (!text) return '';
  if (text.includes('T')) {
    return text.slice(0, 16);
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(text)) {
    return text.replace(' ', 'T').slice(0, 16);
  }
  return text;
}

function getNowDateTimeString() {
  const now = new Date();
  const pad = (num) => String(num).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function getNowDateTimeLocalValue() {
  return toDateTimeLocalValue(getNowDateTimeString());
}

function parseLocalDateTime(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const normalized = text.includes('T') ? text : text.replace(' ', 'T');
  const dt = new Date(normalized);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function ensureAccountStartTime(account) {
  if (!account) return '';
  const current = parseLocalDateTime(account.start_time_bj);
  const now = new Date();
  if (!account.start_time_bj || !current || current.getTime() < now.getTime()) {
    account.start_time_bj = getNowDateTimeString();
  }
  return account.start_time_bj;
}

function ensureAccountStartTimes() {
  currentAccounts.forEach((acc) => {
    ensureAccountStartTime(acc);
  });
}

function showToast(message, duration = 2200) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('is-hidden');
  if (showToast._timer) {
    clearTimeout(showToast._timer);
  }
  showToast._timer = setTimeout(() => {
    toast.classList.add('is-hidden');
  }, duration);
}

function showAccountFieldHint(index, field, message, duration = 2200) {
  if (!accountList) return;
  const row = accountList.querySelector(`.account-row[data-index="${index}"]`);
  const hint = row?.querySelector(`[data-hint="${field}"]`);
  if (!hint) return;
  hint.textContent = message;
  hint.classList.remove('is-hidden');
  if (hint._timer) {
    clearTimeout(hint._timer);
  }
  hint._timer = setTimeout(() => {
    hint.classList.add('is-hidden');
  }, duration);
}

function clearAccountFieldHint(index, field) {
  if (!accountList) return;
  const row = accountList.querySelector(`.account-row[data-index="${index}"]`);
  const hint = row?.querySelector(`[data-hint="${field}"]`);
  if (!hint) return;
  hint.classList.add('is-hidden');
}

function markAccountsDirty() {
  accountAutoSaveDirty = true;
}

function getCurrentUserId() {
  const id = Number(currentUser?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function getAccessUser() {
  return accessState?.user || null;
}

function getAccessPlans() {
  return Array.isArray(accessState?.plans) ? accessState.plans : [];
}

function clearPaymentQrObjectUrl() {
  if (paymentQrObjectUrl) {
    URL.revokeObjectURL(paymentQrObjectUrl);
    paymentQrObjectUrl = '';
  }
}

function clearPaymentTimers() {
  if (paymentPollTimer) {
    clearInterval(paymentPollTimer);
    paymentPollTimer = null;
  }
  if (paymentExpiryTimer) {
    clearInterval(paymentExpiryTimer);
    paymentExpiryTimer = null;
  }
  paymentExpiryDeadline = 0;
}

function formatDateTimeText(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleString('zh-CN', { hour12: false });
}

function formatCountdown(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function renderMembershipCard() {
  if (!membershipStatusTitle || !membershipStatusSub || !membershipStatusChip) return;
  const user = getAccessUser();
  if (!user) {
    membershipStatusTitle.textContent = '免费版';
    membershipStatusSub.textContent = '今日免费剩余 20 / 20';
    membershipStatusChip.textContent = '免费版';
    membershipStatusChip.className = 'status-pill free';
    if (membershipOpenTopbar) membershipOpenTopbar.textContent = '开通会员 / 续费';
    if (membershipOpenCard) membershipOpenCard.textContent = '开通会员';
    if (paymentAccessSummary) paymentAccessSummary.textContent = '今日免费剩余 20 / 20';
    return;
  }

  const limit = Number(user.daily_free_send_limit || 20);
  const todaySuccess = Number(user.today_success_count || 0);
  const remaining = Number(user.daily_free_remaining_count || 0);
  const active = Boolean(user.subscription_active);
  const expired = String(user.membership_status || '') === 'expired';

  if (active) {
    membershipStatusTitle.textContent = user.subscription_plan_name || '会员中';
    membershipStatusSub.textContent = user.subscription_expire_at
      ? `会员有效期至 ${formatDateTimeText(user.subscription_expire_at)} · 今日成功发送 ${todaySuccess}`
      : `会员有效中 · 今日成功发送 ${todaySuccess}`;
    membershipStatusChip.textContent = '会员中';
    membershipStatusChip.className = 'status-pill vip';
    if (membershipOpenTopbar) membershipOpenTopbar.textContent = '续费会员';
    if (membershipOpenCard) membershipOpenCard.textContent = '续费会员';
    if (paymentAccessSummary) {
      paymentAccessSummary.textContent = membershipStatusSub.textContent;
    }
    return;
  }

  membershipStatusTitle.textContent = expired ? '会员已过期' : '免费版';
  membershipStatusSub.textContent = `今日免费剩余 ${remaining} / ${limit} · 今日已成功发送 ${todaySuccess}`;
  membershipStatusChip.textContent = expired ? '已过期' : '免费版';
  membershipStatusChip.className = `status-pill ${expired ? 'expired' : 'free'}`;
  if (membershipOpenTopbar) membershipOpenTopbar.textContent = expired ? '续费会员' : '开通会员 / 续费';
  if (membershipOpenCard) membershipOpenCard.textContent = expired ? '续费会员' : '开通会员';
  if (paymentAccessSummary) {
    paymentAccessSummary.textContent = membershipStatusSub.textContent;
  }
}

async function refreshAccessState(options = {}) {
  if (AUTH_BYPASS_ENABLED) {
    renderMembershipCard();
    return accessState;
  }
  if (!authToken) {
    accessState = null;
    renderMembershipCard();
    return null;
  }
  try {
    const payload = await apiRequest('/api/user/access');
    accessState = payload;
    if (!paymentSelectedPlanCode) {
      paymentSelectedPlanCode = payload.default_plan_code || 'vip_month';
    }
    renderMembershipCard();
    renderPaymentPlanList();
    return payload;
  } catch (err) {
    if (!options.silent) {
      showToast(`读取会员状态失败：${err?.message || err}`, 2600);
    }
    return null;
  }
}

function ensureAccessRefreshTimer() {
  if (AUTH_BYPASS_ENABLED) return;
  if (accessRefreshTimer) return;
  accessRefreshTimer = setInterval(() => {
    if (!hasAccess()) return;
    void refreshAccessState({ silent: true });
  }, 30000);
}

function paymentPlanByCode(planCode) {
  const plans = getAccessPlans();
  return plans.find((plan) => String(plan.code || '') === String(planCode || '')) || plans[0] || null;
}

function renderPaymentPlanList() {
  if (!paymentPlanList) return;
  const plans = getAccessPlans();
  paymentPlanList.innerHTML = '';
  if (plans.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'payment-plan-card';
    empty.textContent = '暂无可用套餐';
    paymentPlanList.appendChild(empty);
    return;
  }
  if (!plans.some((plan) => plan.code === paymentSelectedPlanCode)) {
    paymentSelectedPlanCode = accessState?.default_plan_code || plans[0].code;
  }
  plans.forEach((plan) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `payment-plan-card ${plan.code === paymentSelectedPlanCode ? 'is-active' : ''}`;
    card.innerHTML = `
      <div class="payment-plan-name">${plan.name}</div>
      <div class="payment-plan-price">¥${plan.amount_yuan}</div>
      <div class="payment-plan-desc">${plan.grant_label}</div>
      <div class="payment-plan-desc">${plan.description}</div>
    `;
    card.addEventListener('click', () => {
      paymentSelectedPlanCode = plan.code;
      renderPaymentPlanList();
      void preparePaymentOrder(plan.code, false);
    });
    paymentPlanList.appendChild(card);
  });
}

function setPaymentStatus(message = '', state = '') {
  if (!paymentOrderStatus) return;
  paymentOrderStatus.textContent = message || '';
  paymentOrderStatus.className = 'payment-order-status';
  if (state) {
    paymentOrderStatus.classList.add(state);
  }
}

function renderPaymentPlaceholder(text = '二维码生成中') {
  clearPaymentQrObjectUrl();
  clearPaymentTimers();
  paymentCurrentOrder = null;
  if (paymentQrLoading) {
    paymentQrLoading.textContent = text;
    paymentQrLoading.classList.remove('is-hidden');
  }
  if (paymentQrImage) {
    paymentQrImage.src = '';
    paymentQrImage.classList.add('is-hidden');
  }
  if (paymentOrderPlan) paymentOrderPlan.textContent = '正在准备支付二维码';
  if (paymentOrderPrice) paymentOrderPrice.textContent = '';
  if (paymentOrderNo) paymentOrderNo.textContent = '';
  if (paymentOrderExpire) paymentOrderExpire.textContent = '';
}

async function fetchOrderQrObjectUrl(outTradeNo) {
  const res = await fetch(`${getApiBase()}/api/orders/${encodeURIComponent(outTradeNo)}/qrcode.svg`, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || '二维码加载失败');
  }
  const blob = await res.blob();
  clearPaymentQrObjectUrl();
  paymentQrObjectUrl = URL.createObjectURL(blob);
  return paymentQrObjectUrl;
}

function updatePaymentExpiryText() {
  if (!paymentOrderExpire) return;
  if (!paymentExpiryDeadline) {
    paymentOrderExpire.textContent = '';
    return;
  }
  const remaining = Math.max(0, Math.ceil((paymentExpiryDeadline - Date.now()) / 1000));
  paymentOrderExpire.textContent = `二维码剩余 ${formatCountdown(remaining)}`;
}

async function renderPreparedOrder(order, expiresInSeconds = 0) {
  paymentCurrentOrder = order;
  if (paymentOrderPlan) {
    paymentOrderPlan.textContent = `${order.plan_name} · ${order.grant_label || ''}`.trim();
  }
  if (paymentOrderPrice) {
    paymentOrderPrice.textContent = `支付金额 ¥${order.amount_yuan}`;
  }
  if (paymentOrderNo) {
    paymentOrderNo.textContent = `订单号：${order.out_trade_no}`;
  }
  paymentExpiryDeadline = Date.now() + Math.max(1, Number(expiresInSeconds || 0)) * 1000;
  updatePaymentExpiryText();
  const qrUrl = await fetchOrderQrObjectUrl(order.out_trade_no);
  if (paymentQrImage) {
    paymentQrImage.src = qrUrl;
    paymentQrImage.classList.remove('is-hidden');
  }
  if (paymentQrLoading) {
    paymentQrLoading.classList.add('is-hidden');
  }
  setPaymentStatus('请使用微信扫码完成支付');
}

function startPaymentWatchers(order, expiresInSeconds) {
  clearPaymentTimers();
  paymentExpiryDeadline = Date.now() + Math.max(1, Number(expiresInSeconds || 0)) * 1000;
  updatePaymentExpiryText();
  paymentExpiryTimer = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((paymentExpiryDeadline - Date.now()) / 1000));
    updatePaymentExpiryText();
    if (remaining <= 0) {
      clearPaymentTimers();
      void preparePaymentOrder(paymentSelectedPlanCode, true);
    }
  }, 1000);
  paymentPollTimer = setInterval(() => {
    if (!paymentCurrentOrder?.out_trade_no) return;
    void syncPaymentOrder(paymentCurrentOrder.out_trade_no, true);
  }, 4000);
}

async function syncPaymentOrder(outTradeNo, silent = false) {
  const target = String(outTradeNo || paymentCurrentOrder?.out_trade_no || '').trim();
  if (!target) return null;
  try {
    const payload = await apiRequest(`/api/orders/${encodeURIComponent(target)}/sync`, {
      method: 'POST',
    });
    if (paymentCurrentOrder && target !== paymentCurrentOrder.out_trade_no) {
      return payload;
    }
    if (payload?.order?.status === 'paid' || payload?.trade_state === 'SUCCESS') {
      accessState = { ...(accessState || {}), user: payload.user, plans: getAccessPlans() };
      renderMembershipCard();
      setPaymentStatus('开通成功，正在刷新权限', 'success');
      await refreshAll();
      showToast('会员已开通');
      setTimeout(() => closePaymentModal(), 500);
      return payload;
    }
    if (!silent) {
      setPaymentStatus('等待支付完成');
    }
    return payload;
  } catch (err) {
    if (!silent) {
      setPaymentStatus('支付状态同步中，请保持窗口打开', 'error');
    }
    return null;
  }
}

async function preparePaymentOrder(planCode = paymentSelectedPlanCode, forceRefresh = false) {
  if (!currentUser?.username) return null;
  paymentSelectedPlanCode = planCode || paymentSelectedPlanCode || 'vip_month';
  renderPaymentPlanList();
  const token = ++paymentPrepareToken;
  renderPaymentPlaceholder('二维码生成中');
  setPaymentStatus('');
  try {
    const payload = await apiRequest('/api/orders/prepare', {
      method: 'POST',
      body: JSON.stringify({
        username: currentUser.username,
        plan_code: paymentSelectedPlanCode,
        refresh: Boolean(forceRefresh),
      }),
    });
    if (token !== paymentPrepareToken) {
      return null;
    }
    if (payload?.user) {
      accessState = { ...(accessState || {}), user: payload.user, plans: getAccessPlans() };
      renderMembershipCard();
    }
    await renderPreparedOrder(payload.order, payload.expires_in_seconds || payload.ttl_seconds || 0);
    startPaymentWatchers(payload.order, payload.expires_in_seconds || payload.ttl_seconds || 0);
    return payload;
  } catch (err) {
    if (token !== paymentPrepareToken) return null;
    renderPaymentPlaceholder('二维码暂时不可用');
    setPaymentStatus('暂时无法生成支付二维码，请稍后重试', 'error');
    return null;
  }
}

function closePaymentModal() {
  paymentPrepareToken += 1;
  clearPaymentTimers();
  clearPaymentQrObjectUrl();
  if (paymentModal) {
    paymentModal.classList.add('is-hidden');
  }
}

function openPaymentModal(planCode = null) {
  if (!ensureAuth()) return;
  if (planCode) {
    paymentSelectedPlanCode = planCode;
  }
  if (paymentModal) {
    paymentModal.classList.remove('is-hidden');
  }
  void refreshAccessState({ silent: true }).then(() => {
    renderMembershipCard();
    renderPaymentPlanList();
    void preparePaymentOrder(paymentSelectedPlanCode, false);
  });
}

async function ensureCanSendOrPrompt() {
  if (!ensureAuth()) return false;
  if (AUTH_BYPASS_ENABLED) return true;
  const payload = await refreshAccessState({ silent: true });
  if (payload?.user?.can_send) {
    return true;
  }
  openPaymentModal();
  const expired = String(payload?.user?.membership_status || '').trim().toLowerCase() === 'expired';
  showToast(expired ? '会员已过期，请续费后继续发送' : '今日免费发送额度已用完，请开通会员后继续', 2600);
  return false;
}

async function saveAccountsWithSync(accounts) {
  const payload = {
    accounts,
    userId: getCurrentUserId(),
  };
  return window.mailpilot.saveAccounts(payload);
}

async function autoSaveAccounts(force = false) {
  if (!window.mailpilot || !hasAccess() || !accountList) return;
  const accounts = collectAccountsFromForm();
  if (!accounts || accounts.length === 0) return;
  const snapshot = JSON.stringify(accounts);
  if (!force && !accountAutoSaveDirty && snapshot === accountAutoSaveSnapshot) return;
  if (accountAutoSaving) return;
  accountAutoSaving = true;
  try {
    await saveAccountsWithSync(accounts);
    currentAccounts = accounts;
    accountAutoSaveSnapshot = snapshot;
    accountAutoSaveDirty = false;
  } catch (err) {
    // keep dirty flag for next retry
  } finally {
    accountAutoSaving = false;
  }
}

function startAccountAutoSaveTimer() {
  if (accountAutoSaveTimer) {
    clearInterval(accountAutoSaveTimer);
  }
  accountAutoSaveTimer = setInterval(() => {
    void autoSaveAccounts();
  }, 1000);
}

function getAccountStartTime(email) {
  if (!email) return '';
  const account = currentAccounts.find((acc) => acc.email === email);
  return toDateTimeLocalValue(ensureAccountStartTime(account));
}

function getDefaultTestStartTime() {
  if (testAccountSelect && testAccountSelect.value) {
    return getAccountStartTime(testAccountSelect.value);
  }
  return getNowDateTimeLocalValue();
}

function applyDefaultTestStartTime(force = false) {
  if (!testTimeInput) return;
  if (!force && testTimeInput.value) return;
  testTimeInput.value = getDefaultTestStartTime();
}

function syncBaseTimeInputs() {
  if (accountSelect && accountSelect.value) {
    baseTimeInput.value = getAccountStartTime(accountSelect.value);
  } else if (baseTimeInput && !baseTimeInput.value) {
    baseTimeInput.value = getNowDateTimeLocalValue();
  }
  if (accountSelectPaste && accountSelectPaste.value) {
    baseTimePasteInput.value = getAccountStartTime(accountSelectPaste.value);
  } else if (baseTimePasteInput && !baseTimePasteInput.value) {
    baseTimePasteInput.value = getNowDateTimeLocalValue();
  }
  applyDefaultTestStartTime(false);
}

function isAbsolutePath(value) {
  if (!value) return false;
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : '';
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

async function handleDroppedFiles(files) {
  if (!files || files.length === 0) return;
  const file = files[0];
  const path = file.path || '';
  if (isAbsolutePath(path)) {
    selectedFilePath = path;
    if (fileHint) {
      fileHint.textContent = selectedFilePath;
    }
    return selectedFilePath;
  }
  try {
    if (fileHint) {
      fileHint.textContent = `正在读取 ${file.name}...`;
    }
    const base64 = await fileToBase64(file);
    const result = await window.mailpilot.saveDroppedFile(file.name, base64);
    if (result && result.ok && result.path) {
      selectedFilePath = result.path;
      if (fileHint) {
        fileHint.textContent = `已保存：${selectedFilePath}`;
      }
      return selectedFilePath;
    } else {
      alert(`拖拽文件保存失败：${result?.error || '未知错误'}`);
    }
  } catch (err) {
    alert(`拖拽文件读取失败：${err.message || err}`);
  }
  if (fileHint) {
    fileHint.textContent = file.name || '未选择文件';
  }
  return '';
}

function normalizeAttachments(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value)
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function attachmentsToText(value) {
  return normalizeAttachments(value).join('\n');
}

function isGmailAddress(email) {
  if (!email || !email.includes('@')) return false;
  const domain = email.split('@').pop()?.toLowerCase() || '';
  return domain === 'gmail.com' || domain === 'googlemail.com';
}

function defaultSendChannelByEmail(email) {
  return isGmailAddress(email) ? 'gmail_api' : 'smtp';
}

function normalizeSendChannel(channel, email = '') {
  const value = String(channel || '').trim().toLowerCase();
  if (value === 'smtp' || value === 'gmail_api') return value;
  return defaultSendChannelByEmail(email);
}

function isSmtpAccount(account) {
  if (!account) return false;
  return normalizeSendChannel(account.send_channel, account.email) === 'smtp';
}

function uniqueAccountsByEmail(accounts) {
  const seen = new Set();
  const result = [];
  (accounts || []).forEach((acc) => {
    const email = String(acc?.email || '').trim();
    if (!email) return;
    const key = email.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push({
      ...acc,
      email,
    });
  });
  return result;
}

function createBlankAccount() {
  return { ...blankAccount, attachments: [] };
}

function buildPasteGridRows(rowCount = 4) {
  if (!pasteTableBody) return;
  pasteTableBody.innerHTML = '';
  for (let i = 0; i < rowCount; i += 1) {
    const tr = document.createElement('tr');
    tr.dataset.row = String(i);
    pasteColumns.forEach((col, colIndex) => {
      const td = document.createElement('td');
      td.dataset.col = String(colIndex);
      td.dataset.row = String(i);
      td.contentEditable = 'false';
      td.setAttribute('contenteditable', 'false');
      td.tabIndex = 0;
      tr.appendChild(td);
    });
    pasteTableBody.appendChild(tr);
  }
}

function ensurePasteRows(requiredCount) {
  if (!pasteTableBody) return;
  const existing = pasteTableBody.querySelectorAll('tr').length;
  if (existing >= requiredCount) return;
  for (let i = existing; i < requiredCount; i += 1) {
    const tr = document.createElement('tr');
    tr.dataset.row = String(i);
    pasteColumns.forEach((col, colIndex) => {
      const td = document.createElement('td');
      td.dataset.col = String(colIndex);
      td.dataset.row = String(i);
      td.contentEditable = 'false';
      td.setAttribute('contenteditable', 'false');
      td.tabIndex = 0;
      tr.appendChild(td);
    });
    pasteTableBody.appendChild(tr);
  }
}

function parsePastedText(text) {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\t/).map((cell) => cell.trim()));
  if (rows.length === 0) return [];
  const firstRow = rows[0] || [];
  const hasHeader = firstRow.some((cell) => cell.includes('邮箱'))
    && firstRow.some((cell) => cell.includes('姓'));
  return hasHeader ? rows.slice(1) : rows;
}

function fillPasteGrid(rows) {
  if (!pasteTableBody) return;
  const extraRows = 3;
  ensurePasteRows(rows.length + extraRows);
  const bodyRows = Array.from(pasteTableBody.querySelectorAll('tr'));
  rows.forEach((row, rowIndex) => {
    const cells = bodyRows[rowIndex]?.querySelectorAll('td');
    if (!cells) return;
    if (row.length >= 6) {
      for (let i = 0; i < pasteColumns.length; i += 1) {
        cells[i].textContent = row[i] ?? '';
      }
      return;
    }
    if (row.length >= 3) {
      cells[3].textContent = row[0] ?? '';
      cells[4].textContent = row[1] ?? '';
      cells[5].textContent = row[2] ?? '';
      return;
    }
    if (row.length >= 2) {
      cells[3].textContent = row[0] ?? '';
      cells[4].textContent = row[1] ?? '';
    }
  });
  ensureTrailingEmptyRow('paste', 4);
}

function extractPasteGrid() {
  if (!pasteTableBody) return '';
  const rows = Array.from(pasteTableBody.querySelectorAll('tr'));
  const dataRows = [];
  const invalidRows = [];

  rows.forEach((row, idx) => {
    const cells = Array.from(row.querySelectorAll('td')).map((td) => td.textContent.trim());
    if (cells.every((cell) => !cell)) return;
    const surname = cells[3] || '';
    const email = cells[4] || '';
    const offset = cells[5] || '0';
    if (!surname || !email) {
      invalidRows.push(idx + 2);
      return;
    }
    dataRows.push([surname, email, offset]);
  });

  if (invalidRows.length > 0) {
    alert(`以下行缺少姓氏或邮箱：${invalidRows.join(', ')}`);
    return '';
  }
  if (dataRows.length === 0) {
    alert('没有可导入的数据');
    return '';
  }
  const lines = ['姓氏\t作者邮箱\t与北京时间时差(小时)'];
  dataRows.forEach((row) => {
    lines.push(row.join('\t'));
  });
  return lines.join('\n');
}

function buildTestGridRows(rowCount = 4) {
  if (!testTableBody) return;
  testTableBody.innerHTML = '';
  for (let i = 0; i < rowCount; i += 1) {
    const tr = document.createElement('tr');
    tr.dataset.row = String(i);
    pasteColumns.forEach((col, colIndex) => {
      const td = document.createElement('td');
      td.dataset.col = String(colIndex);
      td.dataset.row = String(i);
      td.contentEditable = 'false';
      td.setAttribute('contenteditable', 'false');
      td.tabIndex = 0;
      tr.appendChild(td);
    });
    testTableBody.appendChild(tr);
  }
}

function ensureTestRows(requiredCount) {
  if (!testTableBody) return;
  const existing = testTableBody.querySelectorAll('tr').length;
  if (existing >= requiredCount) return;
  for (let i = existing; i < requiredCount; i += 1) {
    const tr = document.createElement('tr');
    tr.dataset.row = String(i);
    pasteColumns.forEach((col, colIndex) => {
      const td = document.createElement('td');
      td.dataset.col = String(colIndex);
      td.dataset.row = String(i);
      td.contentEditable = 'false';
      td.setAttribute('contenteditable', 'false');
      td.tabIndex = 0;
      tr.appendChild(td);
    });
    testTableBody.appendChild(tr);
  }
}

function getGridBody(mode) {
  return mode === 'test' ? testTableBody : pasteTableBody;
}

function getSelectedCells(mode) {
  const body = getGridBody(mode);
  if (!body) return [];
  return Array.from(body.querySelectorAll('td.is-selected'));
}

function getGridSelectionBounds(mode) {
  const selected = getSelectedCells(mode);
  if (selected.length === 0) return null;
  let minRow = Infinity;
  let maxRow = -Infinity;
  let minCol = Infinity;
  let maxCol = -Infinity;
  selected.forEach((cell) => {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    if (Number.isNaN(row) || Number.isNaN(col)) return;
    minRow = Math.min(minRow, row);
    maxRow = Math.max(maxRow, row);
    minCol = Math.min(minCol, col);
    maxCol = Math.max(maxCol, col);
  });
  if (!Number.isFinite(minRow) || !Number.isFinite(minCol)) return null;
  return { minRow, maxRow, minCol, maxCol };
}

function captureGridState(mode) {
  const body = getGridBody(mode);
  if (!body) return [];
  return Array.from(body.querySelectorAll('tr')).map((row) =>
    Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent || ''),
  );
}

function pushGridUndo(mode) {
  const stack = gridUndo[mode];
  if (!stack) return;
  stack.push(captureGridState(mode));
  if (stack.length > GRID_UNDO_LIMIT) {
    stack.shift();
  }
}

function restoreGridState(mode, state) {
  const body = getGridBody(mode);
  if (!body || !state) return;
  const ensureRows = mode === 'test' ? ensureTestRows : ensurePasteRows;
  const targetRows = Math.max(state.length, 4);
  ensureRows(targetRows);
  const rows = Array.from(body.querySelectorAll('tr'));
  rows.forEach((row, rowIndex) => {
    const cells = Array.from(row.querySelectorAll('td'));
    const rowData = state[rowIndex] || [];
    cells.forEach((cell, colIndex) => {
      cell.textContent = rowData[colIndex] ?? '';
    });
  });
  ensureTrailingEmptyRow(mode, 4);
  clearGridSelection(mode);
}

function undoGrid(mode) {
  const stack = gridUndo[mode];
  if (!stack || stack.length === 0) return false;
  const state = stack.pop();
  restoreGridState(mode, state);
  return true;
}

function copyGridSelection(mode) {
  const body = getGridBody(mode);
  if (!body) return false;
  const bounds = getGridSelectionBounds(mode);
  if (!bounds) return false;
  const rows = Array.from(body.querySelectorAll('tr'));
  const lines = [];
  for (let r = bounds.minRow; r <= bounds.maxRow; r += 1) {
    const row = rows[r];
    if (!row) continue;
    const cells = Array.from(row.querySelectorAll('td'));
    const values = [];
    for (let c = bounds.minCol; c <= bounds.maxCol; c += 1) {
      values.push((cells[c]?.textContent || '').trim());
    }
    lines.push(values.join('\t'));
  }
  const text = lines.join('\n');
  if (!text) return false;
  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
    return true;
  }
  try {
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    document.execCommand('copy');
    document.body.removeChild(helper);
    return true;
  } catch (err) {
    return false;
  }
}

function reindexGridRows(mode) {
  const body = getGridBody(mode);
  if (!body) return;
  const rows = Array.from(body.querySelectorAll('tr'));
  rows.forEach((row, rowIndex) => {
    row.dataset.row = String(rowIndex);
    row.querySelectorAll('td').forEach((cell) => {
      cell.dataset.row = String(rowIndex);
    });
  });
}

function deleteSelectedRows(mode) {
  const body = getGridBody(mode);
  if (!body) return false;
  const selected = getSelectedCells(mode);
  if (selected.length === 0) return false;
  pushGridUndo(mode);
  const rows = Array.from(body.querySelectorAll('tr'));
  const rowIndexes = new Set(
    selected
      .map((cell) => Number(cell.dataset.row))
      .filter((val) => Number.isFinite(val)),
  );
  const keep = rows.filter((row) => !rowIndexes.has(Number(row.dataset.row)));
  body.innerHTML = '';
  keep.forEach((row) => body.appendChild(row));
  reindexGridRows(mode);
  ensureTrailingEmptyRow(mode, 4);
  clearGridSelection(mode);
  return true;
}

function clearSelectedColumns(mode) {
  const body = getGridBody(mode);
  if (!body) return false;
  const selected = getSelectedCells(mode);
  if (selected.length === 0) return false;
  pushGridUndo(mode);
  const cols = new Set(
    selected
      .map((cell) => Number(cell.dataset.col))
      .filter((val) => Number.isFinite(val)),
  );
  if (cols.size === 0) return false;
  const rows = Array.from(body.querySelectorAll('tr'));
  rows.forEach((row) => {
    const cells = Array.from(row.querySelectorAll('td'));
    cols.forEach((col) => {
      if (cells[col]) cells[col].textContent = '';
    });
  });
  ensureTrailingEmptyRow(mode, 4);
  return true;
}

function clearGridSelection(mode) {
  const body = getGridBody(mode);
  if (!body) return;
  body.querySelectorAll('td.is-selected').forEach((cell) => cell.classList.remove('is-selected'));
}

function getLastSelectedCell(mode) {
  if (lastGridFocus.mode === mode && lastGridFocus.cell && lastGridFocus.cell.isConnected) {
    return lastGridFocus.cell;
  }
  const selected = getSelectedCells(mode);
  return selected[0] || null;
}

function countFilledRows(mode) {
  const body = getGridBody(mode);
  if (!body) return 0;
  const rows = Array.from(body.querySelectorAll('tr'));
  let filled = 0;
  rows.forEach((row) => {
    const cells = Array.from(row.querySelectorAll('td'));
    const hasValue = cells.some((cell) => (cell.textContent || '').trim());
    if (hasValue) filled += 1;
  });
  return filled;
}

function setGridRowCount(mode, targetCount) {
  const body = getGridBody(mode);
  if (!body) return;
  const rows = Array.from(body.querySelectorAll('tr'));
  const current = rows.length;
  if (current > targetCount) {
    for (let i = current - 1; i >= targetCount; i -= 1) {
      rows[i]?.remove();
    }
    clearGridSelection(mode);
    return;
  }
  if (current < targetCount) {
    if (mode === 'test') {
      ensureTestRows(targetCount);
    } else {
      ensurePasteRows(targetCount);
    }
  }
}

function clearGrid(mode, minRows = 4) {
  const body = getGridBody(mode);
  if (!body) return;
  body.querySelectorAll('td').forEach((cell) => {
    cell.textContent = '';
  });
  setGridRowCount(mode, minRows);
  clearGridSelection(mode);
}

function normalizeGridRows(mode, minRows = 4) {
  const filled = countFilledRows(mode);
  if (filled <= 3) {
    setGridRowCount(mode, minRows);
  }
}

function ensureTrailingEmptyRow(mode, minRows = 4) {
  const body = getGridBody(mode);
  if (!body) return;
  const rows = Array.from(body.querySelectorAll('tr'));
  if (rows.length === 0) {
    setGridRowCount(mode, minRows);
    return;
  }
  let lastFilledIndex = -1;
  rows.forEach((row, idx) => {
    const cells = Array.from(row.querySelectorAll('td'));
    const hasValue = cells.some((cell) => (cell.textContent || '').trim());
    if (hasValue) lastFilledIndex = idx;
  });
  const requiredRows = Math.max(minRows, lastFilledIndex + 2);
  setGridRowCount(mode, requiredRows);
}

function renderStorageInfo(info) {
  if (!info) return;
  if (storageBaseInput) storageBaseInput.value = info.baseDir || '';
  if (storageDataInput) storageDataInput.value = info.dataDir || '';
  if (storageLogsInput) storageLogsInput.value = info.logsDir || '';
  if (storageConfigInput) storageConfigInput.value = info.configDir || '';
}

async function loadStorageInfo() {
  if (!window.mailpilot?.getStorageInfo) return;
  try {
    const info = await window.mailpilot.getStorageInfo();
    renderStorageInfo(info);
  } catch (err) {
    // ignore
  }
}

async function loadAppVersion() {
  if (!window.mailpilot?.getAppVersion || !appVersionInput) return;
  try {
    const result = await window.mailpilot.getAppVersion();
    appVersionInput.value = result?.version ? `v${result.version}` : '';
  } catch (err) {
    appVersionInput.value = '';
  }
}

function applyGridSelection(mode, start, end) {
  const body = getGridBody(mode);
  if (!body || !start || !end) return;
  clearGridSelection(mode);
  const minRow = Math.min(start.row, end.row);
  const maxRow = Math.max(start.row, end.row);
  const minCol = Math.min(start.col, end.col);
  const maxCol = Math.max(start.col, end.col);
  const rows = Array.from(body.querySelectorAll('tr'));
  for (let r = minRow; r <= maxRow; r += 1) {
    const row = rows[r];
    if (!row) continue;
    const cells = Array.from(row.querySelectorAll('td'));
    for (let c = minCol; c <= maxCol; c += 1) {
      const cell = cells[c];
      if (cell) cell.classList.add('is-selected');
    }
  }
}

function enableCellEdit(cell) {
  if (!cell) return;
  cell.dataset.editing = '1';
  cell.dataset.undoCaptured = '';
  cell.contentEditable = 'true';
  cell.setAttribute('contenteditable', 'true');
  cell.focus();
  try {
    document.execCommand('selectAll', false, null);
  } catch (err) {
    // ignore
  }
}

function placeCursorAtEnd(cell) {
  if (!cell) return;
  const range = document.createRange();
  range.selectNodeContents(cell);
  range.collapse(false);
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

function focusCellForInput(cell, initialChar) {
  if (!cell) return;
  enableCellEdit(cell);
  if (typeof initialChar === 'string') {
    cell.textContent = initialChar;
    placeCursorAtEnd(cell);
  }
}

function disableCellEdit(cell) {
  if (!cell) return;
  cell.dataset.editing = '';
  cell.dataset.undoCaptured = '';
  cell.contentEditable = 'false';
  cell.setAttribute('contenteditable', 'false');
}

function exitGridEditing(body, exceptCell) {
  if (!body) return;
  body.querySelectorAll('td[data-editing="1"]').forEach((cell) => {
    if (cell === exceptCell) return;
    disableCellEdit(cell);
  });
}

async function handleGridPaste(event, mode) {
  let text = event.clipboardData?.getData('text/plain') || '';
  if (!text && navigator?.clipboard?.readText) {
    try {
      text = await navigator.clipboard.readText();
    } catch (err) {
      text = '';
    }
  }
  if (!text) return false;

  const rows = parsePastedText(text);
  if (rows.length === 0) return false;

  const activeCell = event.target?.closest?.('td[data-col]');
  const selectedBounds = getGridSelectionBounds(mode);
  const startRow = selectedBounds?.minRow ?? (activeCell ? Number(activeCell.dataset.row) : 0);
  const startCol = selectedBounds?.minCol ?? (activeCell ? Number(activeCell.dataset.col) : 0);

  if (rows.length === 1 && rows[0].length === 1) {
    pushGridUndo(mode);
    event.preventDefault();
    const value = rows[0][0];
    const selected = getSelectedCells(mode);
    if (selected.length > 0) {
      selected.forEach((cell) => {
        cell.textContent = value;
      });
      return true;
    }
    if (activeCell) {
      activeCell.textContent = value;
      return true;
    }
    return true;
  }

  event.preventDefault();
  pushGridUndo(mode);
  const body = getGridBody(mode);
  if (!body) return true;
  const ensureRows = mode === 'test' ? ensureTestRows : ensurePasteRows;
  ensureRows(startRow + rows.length + 3);
  const bodyRows = Array.from(body.querySelectorAll('tr'));
  rows.forEach((row, rowIndex) => {
    const targetRow = bodyRows[startRow + rowIndex];
    if (!targetRow) return;
    const cells = Array.from(targetRow.querySelectorAll('td'));
    row.forEach((value, colIndex) => {
      const targetCol = startCol + colIndex;
      if (targetCol < 0 || targetCol >= cells.length) return;
      cells[targetCol].textContent = value ?? '';
    });
  });
  ensureTrailingEmptyRow(mode, 4);
  return true;
}

function fillTestGrid(rows) {
  if (!testTableBody) return;
  const extraRows = 3;
  ensureTestRows(rows.length + extraRows);
  const bodyRows = Array.from(testTableBody.querySelectorAll('tr'));
  rows.forEach((row, rowIndex) => {
    const cells = bodyRows[rowIndex]?.querySelectorAll('td');
    if (!cells) return;
    if (row.length >= 6) {
      for (let i = 0; i < pasteColumns.length; i += 1) {
        cells[i].textContent = row[i] ?? '';
      }
      return;
    }
    if (row.length >= 3) {
      cells[3].textContent = row[0] ?? '';
      cells[4].textContent = row[1] ?? '';
      cells[5].textContent = row[2] ?? '';
      return;
    }
    if (row.length >= 2) {
      cells[3].textContent = row[0] ?? '';
      cells[4].textContent = row[1] ?? '';
    }
  });
  ensureTrailingEmptyRow('test', 4);
}

function extractTestGrid() {
  if (!testTableBody) return '';
  const rows = Array.from(testTableBody.querySelectorAll('tr'));
  const dataRows = [];
  const invalidRows = [];

  rows.forEach((row, idx) => {
    const cells = Array.from(row.querySelectorAll('td')).map((td) => td.textContent.trim());
    if (cells.every((cell) => !cell)) return;
    const surname = cells[3] || '';
    const email = cells[4] || '';
    const offset = cells[5] || '0';
    if (!surname || !email) {
      invalidRows.push(idx + 2);
      return;
    }
    dataRows.push([surname, email, offset]);
  });

  if (invalidRows.length > 0) {
    alert(`以下行缺少姓氏或邮箱：${invalidRows.join(', ')}`);
    return '';
  }
  if (dataRows.length === 0) {
    alert('没有可发送的测试数据');
    return '';
  }
  const lines = ['姓氏\t作者邮箱\t与北京时间时差(小时)'];
  dataRows.forEach((row) => {
    lines.push(row.join('\t'));
  });
  return lines.join('\n');
}

function countTsvRows(text) {
  if (!text) return 0;
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return 0;
  return lines.length - 1;
}

const statTotal = document.getElementById('stat-total');
const statPending = document.getElementById('stat-pending');
const statSent = document.getElementById('stat-sent');
const statFailed = document.getElementById('stat-failed');
const statTodaySent = document.getElementById('stat-today-sent');
const statTodaySentSub = document.getElementById('stat-today-sent-sub');
const recentTasks = document.getElementById('recent-tasks');
const accountCards = document.getElementById('account-cards');
const accountList = document.getElementById('account-list');
const accountViewFilter = document.getElementById('accounts-view-filter');
const accountViewFilterToggle = document.getElementById('accounts-view-filter-toggle');
const accountViewFilterMenu = document.getElementById('accounts-view-filter-menu');
const accountViewFilterAll = document.getElementById('accounts-view-filter-all');
const accountViewFilterOptions = document.getElementById('accounts-view-filter-options');
const teacherTable = document.getElementById('teacher-table');
const logList = document.getElementById('log-list');
const sendConsole = document.getElementById('send-console');
const testConsole = document.getElementById('test-console');
const importConsole = document.getElementById('import-console');
const testTimeInput = document.getElementById('test-time');
const sendProgressBar = document.getElementById('send-progress');
const storageBaseInput = document.getElementById('storage-base');
const storageDataInput = document.getElementById('storage-data');
const storageLogsInput = document.getElementById('storage-logs');
const storageConfigInput = document.getElementById('storage-config');
const appVersionInput = document.getElementById('app-version');
const sendStatus = document.getElementById('send-status');
const sendScope = document.getElementById('send-scope');
const sendPending = document.getElementById('send-pending');
const sendProgressList = document.getElementById('send-progress-list');
const sendStartButton = document.querySelector('[data-action="execute-send"]');
const sendStopButton = document.querySelector('[data-action="stop-send"]');
const testStartButton = document.querySelector('[data-action="execute-test"]');
const testStopButton = document.querySelector('[data-action="stop-test"]');

if (testTimeInput && !testTimeInput.value) {
  testTimeInput.value = getNowDateTimeLocalValue();
}

function setSendRunning() {
  updateSendControls(lastDashboard);
}

setSendRunning();

function updateTestSendControls() {
  if (testStartButton) {
    testStartButton.disabled = testSendRunning;
  }
  if (testStopButton) {
    testStopButton.disabled = !testSendRunning;
  }
}

updateTestSendControls();

function ensureSendRefreshTimer(active) {
  if (active) {
    if (!sendRefreshTimer) {
      sendRefreshTimer = setInterval(() => {
        refreshAll();
      }, 3000);
    }
    return;
  }
  if (sendRefreshTimer) {
    clearInterval(sendRefreshTimer);
    sendRefreshTimer = null;
  }
}

function updateSendStatusByRunning() {
  if (!sendStatus) return;
  if (runningSendAccounts.size > 0) {
    sendStatus.textContent = '发送中...';
    return;
  }
  if (['发送中...', '所选账号正在发送中', '正在停止...'].includes(sendStatus.textContent)) {
    sendStatus.textContent = '发送完成';
  }
}

const previewAdded = document.getElementById('preview-added');
const previewUpdated = document.getElementById('preview-updated');
const previewConflicts = document.getElementById('preview-conflicts');
const previewWrite = document.getElementById('preview-write');
const fileInput = document.getElementById('file-input');
const fileHint = document.getElementById('file-hint');
const dropzone = document.getElementById('dropzone');
const pasteTable = document.getElementById('paste-table');
const pasteTableBody = document.getElementById('paste-table-body');
const testTable = document.getElementById('test-table');
const testTableBody = document.getElementById('test-table-body');
const accountSelect = document.getElementById('account-select');
const accountSelectPaste = document.getElementById('account-select-paste');
const composeAccountSelect = document.getElementById('compose-account');
const testAccountSelect = document.getElementById('test-account');
const feedbackAccountSelect = document.getElementById('feedback-account');
const feedbackSubjectInput = document.getElementById('feedback-subject');
const feedbackMessageInput = document.getElementById('feedback-message');
const feedbackConsole = document.getElementById('feedback-console');
const announcementBar = document.getElementById('announcement-bar');
const announcementTrack = document.getElementById('announcement-track');
const announcementText = document.getElementById('announcement-text');
const announcementModal = document.getElementById('announcement-modal');
const announcementList = document.getElementById('announcement-list');
const authcodeHelpModal = document.getElementById('authcode-help-modal');
const gmailCredentialsHelpModal = document.getElementById('gmail-credentials-help-modal');
const authTermsModal = document.getElementById('auth-terms-modal');
const composeSubjectInput = document.getElementById('compose-subject');
const composeContentInput = document.getElementById('compose-content');
const composeAttachmentsInput = document.getElementById('compose-attachments');
const composeTemplateNameInput = document.getElementById('compose-template-name');
const composeTemplateSelect = document.getElementById('compose-template-select');
const baseTimeInput = document.getElementById('base-time');
const baseTimePasteInput = document.getElementById('base-time-paste');
const teacherFilters = document.querySelectorAll('[data-filter]');
const logFilters = document.querySelectorAll('[data-log-filter]');
const accountFilterSelect = document.getElementById('account-filter');
const sendAccountSelect = document.getElementById('send-account');
const sendAccountList = document.getElementById('send-account-list');
const sendAllToggle = document.getElementById('send-all');
const sendSelectedMeta = document.getElementById('send-selected-meta');
const toast = document.getElementById('toast');

if (composeTemplateSelect) {
  renderComposeTemplateOptions();
}

const pasteColumns = [
  { key: 'country', label: '国家' },
  { key: 'org', label: '机构' },
  { key: 'given', label: '姓名' },
  { key: 'surname', label: '姓氏', required: true },
  { key: 'email', label: '作者邮箱', required: true },
  { key: 'offset', label: '与北京时间时差(小时)' },
];

async function refreshAll() {
  if (!window.mailpilot || !hasAccess()) return;
  const [data] = await Promise.all([
    window.mailpilot.getDashboardData({ userId: getCurrentUserId() }),
    refreshAccessState({ silent: true }),
  ]);
  renderDashboard(data);
}

function renderDashboard(data) {
  lastDashboard = data;
  statTotal.textContent = data.stats.total ?? '-';
  statPending.textContent = data.stats.pending ?? '-';
  statSent.textContent = data.stats.sent ?? '-';
  statFailed.textContent = data.stats.failed ?? '-';
  if (statTodaySent) {
    statTodaySent.textContent = data.stats.todaySent ?? '-';
  }
  if (statTodaySentSub) {
    const limit = Number.isFinite(Number(data.stats.dailyTotalLimit))
      ? Number(data.stats.dailyTotalLimit)
      : 20;
    const dateText = String(data.quotaDate || '').trim();
    if (getAccessUser()?.subscription_active) {
      statTodaySentSub.textContent = getAccessUser()?.subscription_expire_at
        ? `会员有效期至 ${formatDateTimeText(getAccessUser()?.subscription_expire_at)}`
        : '会员有效中，不限成功发送封数';
    } else {
      statTodaySentSub.textContent = dateText
        ? `北京时间 ${dateText} · 每日免费上限 ${limit}`
        : `每日免费上限 ${limit}`;
    }
  }

  recentTasks.innerHTML = '';
  data.recentLogs.forEach((log) => {
    const li = document.createElement('li');
    li.textContent = log;
    recentTasks.appendChild(li);
  });

  currentAccounts = (data.accounts || []).map((acc) => {
    const channel = normalizeSendChannel(acc.send_channel, acc.email);
    return {
      ...acc,
      send_channel: channel,
      gmail_oauth_bound: Boolean(acc.gmail_oauth_bound),
    };
  });
  accountAutoSaveSnapshot = JSON.stringify(currentAccounts);
  accountAutoSaveDirty = false;
  updateRunningAccounts(data);
  updateSendStatusByRunning();
  ensureAccountStartTimes();
  renderAccountCards();
  renderAccountList();
  renderAccountSelects();
  renderAccountFilter();
  renderSendAccountList();
  updateSendInfo(data);
  renderSendProgressList(data);
  updateSendControls(data);
  ensureSendRefreshTimer(runningSendAccounts.size > 0);

  teacherTable.innerHTML = '';
  const activeAccountKeys = new Set(
    uniqueAccountsByEmail(currentAccounts).map((acc) => String(acc.email || '').trim().toLowerCase()),
  );
  const filteredTeachers = data.teachers.filter((teacher) => {
    const assignedAccount = String(teacher.assigned_account || '').trim();
    const assignedKey = assignedAccount.toLowerCase();
    if (accountFilter === '__deleted_accounts__') {
      if (!assignedKey || activeAccountKeys.has(assignedKey)) {
        return false;
      }
    } else if (accountFilter !== 'all' && assignedKey !== String(accountFilter || '').trim().toLowerCase()) {
      return false;
    }
    if (teacherFilter === 'all') return true;
    if (teacherFilter === 'failed') return teacher.status === '失败';
    return teacher.status === '未发送';
  });
  lastRenderedTeachers = filteredTeachers;
  const existingEmails = new Set(data.teachers.map((t) => t.email));
  selectedTeacherEmails = new Set(
    Array.from(selectedTeacherEmails).filter((email) => existingEmails.has(email)),
  );
  filteredTeachers.forEach((teacher, index) => {
    const row = document.createElement('div');
    row.className = 'table-row';
    const isChecked = selectedTeacherEmails.has(teacher.email);
    if (isChecked) row.classList.add('is-selected');
    row.innerHTML = `
      <div class="check-cell">
        <input type="checkbox" data-teacher-check="1" data-index="${index}" data-email="${teacher.email}" ${isChecked ? 'checked' : ''} />
      </div>
      <div>${teacher.name || '-'}</div>
      <div>${teacher.email}</div>
      <div>${teacher.org || '-'}</div>
      <div>${teacher.assigned_account || '-'}</div>
      <div>${teacher.status}</div>
      <div>${teacher.send_at_bj || '-'}</div>
      <div>${teacher.sent_at || '-'}</div>
    `;
    teacherTable.appendChild(row);
  });

  logList.innerHTML = '';
  const failureKeywords = ['失败', '错误', '拒绝', 'error', 'fail', 'timeout', 'denied', 'refused'];
  const successKeywords = ['[success_at_bj]', '成功', '发送成功', '已发送', 'success', 'queued', 'mail ok'];
  const isFailureLog = (line) => {
    const lower = String(line || '').toLowerCase();
    return failureKeywords.some((kw) => lower.includes(kw.toLowerCase()));
  };
  const isSuccessLog = (line) => {
    const lower = String(line || '').toLowerCase();
    if (isFailureLog(lower)) return false;
    return successKeywords.some((kw) => lower.includes(String(kw).toLowerCase()));
  };
  let filteredLogs = data.logs;
  if (logFilter === 'failed') {
    filteredLogs = data.logs.filter((line) => isFailureLog(line));
  } else if (logFilter === 'success') {
    filteredLogs = data.logs.filter((line) => isSuccessLog(line));
  }
  if (filteredLogs.length === 0) {
    const row = document.createElement('div');
    row.className = 'log-item';
    row.textContent = '暂无日志';
    logList.appendChild(row);
  } else {
    filteredLogs.slice(-80).reverse().forEach((log) => {
      const row = document.createElement('div');
      row.className = 'log-item';
      row.textContent = log;
      logList.appendChild(row);
    });
  }

  sendConsole.textContent = data.logTail.join('\n');
}

function syncTeacherSelectionUi() {
  if (!teacherTable) return;
  const boxes = teacherTable.querySelectorAll('input[data-teacher-check]');
  boxes.forEach((box) => {
    const email = String(box.dataset.email || '').trim();
    const checked = selectedTeacherEmails.has(email);
    box.checked = checked;
    box.closest('.table-row')?.classList.toggle('is-selected', checked);
  });
}

function renderAccountCards() {
  accountCards.innerHTML = '';
  accountCards.classList.remove('is-scrollable');
  accountCards.style.maxHeight = '';
  if (currentAccounts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'account-card';
    empty.textContent = '未检测到发件账号，请在账号中心添加';
    accountCards.appendChild(empty);
    return;
  }
  currentAccounts.forEach((acc) => {
    const stats = acc.stats || { assigned: 0, sent: 0, failed: 0, pending: 0 };
    const dailyLimit = Number.isFinite(Number(acc.daily_limit)) ? Number(acc.daily_limit) : 20;
    const todaySuccess = Number.isFinite(Number(acc.today_success)) ? Number(acc.today_success) : 0;
    const todayRemaining = Number.isFinite(Number(acc.today_remaining))
      ? Number(acc.today_remaining)
      : Math.max(dailyLimit - todaySuccess, 0);
    const quotaClass = getAccessUser()?.subscription_active ? 'good' : (todayRemaining <= 0 ? 'bad' : 'good');
    const quotaText = getAccessUser()?.subscription_active
      ? `会员中 · 今日成功发送 ${todaySuccess}`
      : `今日免费额度 ${todaySuccess}/${dailyLimit}`;
    const startTime = ensureAccountStartTime(acc);
    const channel = normalizeSendChannel(acc.send_channel, acc.email);
    const card = document.createElement('div');
    card.className = 'account-card';
    card.innerHTML = `
      <div class="email">${acc.email || '未填写邮箱'}</div>
      <div class="meta">通道：${channel === 'gmail_api' ? 'Gmail API' : 'SMTP'} · 开始时间：${startTime || '立即发送'} · 间隔 ${acc.min_delay ?? 40}-${acc.max_delay ?? 60}s</div>
      <div class="account-stats">
        <span class="account-stat">已分配 ${stats.assigned}</span>
        <span class="account-stat good">已发 ${stats.sent}</span>
        <span class="account-stat warn">待发 ${stats.pending}</span>
        <span class="account-stat bad">失败 ${stats.failed}</span>
        <span class="account-stat ${quotaClass}">${quotaText}</span>
      </div>
    `;
    accountCards.appendChild(card);
  });
  if (currentAccounts.length > 4) {
    accountCards.classList.add('is-scrollable');
    const cards = Array.from(accountCards.querySelectorAll('.account-card'));
    if (cards.length >= 4) {
      const style = window.getComputedStyle(accountCards);
      const gap = Number.parseFloat(style.rowGap || style.gap || '0') || 0;
      const firstFourHeight = cards.slice(0, 4).reduce((sum, card) => sum + card.offsetHeight, 0);
      // Lock viewport to exactly 4 cards; extra cards scroll inside.
      const viewportHeight = Math.ceil(firstFourHeight + gap * 3);
      accountCards.style.maxHeight = `${viewportHeight}px`;
    }
  }
}

function applyChannelVisibility(index, channelValue) {
  if (!accountList) return;
  const row = accountList.querySelector(`.account-row[data-index="${index}"]`);
  if (!row) return;
  const account = currentAccounts[index] || {};
  const channel = normalizeSendChannel(channelValue, account.email);
  row.dataset.channel = channel;
  row.querySelectorAll('.smtp-only').forEach((el) => {
    el.classList.toggle('channel-hidden', channel !== 'smtp');
  });
  row.querySelectorAll('.gmail-only').forEach((el) => {
    el.classList.toggle('channel-hidden', channel !== 'gmail_api');
  });

  const badge = row.querySelector('[data-account-channel]');
  if (badge) {
    badge.textContent = channel === 'gmail_api' ? 'Gmail API' : 'SMTP';
  }
  const status = row.querySelector('[data-gmail-status]');
  if (status) {
    const bound = Boolean(account.gmail_oauth_bound);
    status.textContent = bound ? '已绑定 OAuth' : '未绑定 OAuth';
    status.classList.toggle('good', bound);
  }

  const testBtn = row.querySelector('[data-account-action="test-smtp"]');
  if (testBtn) {
    const disable = channel !== 'smtp';
    testBtn.disabled = disable;
    testBtn.title = disable ? 'Gmail API 模式无需 SMTP 测试' : '测试SMTP';
  }
}

function applyGmailCredentialsStatusToRows() {
  if (!accountList) return;
  const labels = accountList.querySelectorAll('[data-gmail-credentials-status]');
  labels.forEach((label) => {
    label.classList.remove('good', 'bad');
    if (gmailCredentialsUploaded === true) {
      label.textContent = '已上传';
      label.classList.add('good');
    } else if (gmailCredentialsUploaded === false) {
      label.textContent = '未上传';
      label.classList.add('bad');
    } else {
      label.textContent = '检测中';
    }
  });
}

async function refreshGmailCredentialsStatus() {
  const checker = window.mailpilot?.getGmailCredentialsStatus || window.mailpilot?.getGmailClientSecretStatus;
  if (!checker) return;
  try {
    const result = await checker();
    if (result && result.ok) {
      gmailCredentialsUploaded = Boolean(result.exists);
    } else {
      gmailCredentialsUploaded = false;
    }
  } catch (err) {
    gmailCredentialsUploaded = false;
  }
  applyGmailCredentialsStatusToRows();
}

function getAccountViewFilterItems() {
  return uniqueAccountsByEmail(currentAccounts).map((acc) => {
    const email = String(acc.email || '').trim();
    return {
      email,
      key: email.toLowerCase(),
    };
  });
}

function syncSelectedAccountViewEmails(items) {
  const validKeys = new Set(items.map((item) => item.key));
  selectedAccountViewEmails = new Set(
    Array.from(selectedAccountViewEmails).filter((key) => validKeys.has(key)),
  );
  if (items.length > 0 && !accountViewFilterInitialized && selectedAccountViewEmails.size === 0) {
    selectedAccountViewEmails = new Set(items.map((item) => item.key));
    accountViewFilterInitialized = true;
    return;
  }
  if (items.length > 0 && !accountViewFilterInitialized) {
    accountViewFilterInitialized = true;
  }
}

function updateAccountViewFilterLabel(items) {
  if (!accountViewFilterToggle) return;
  if (items.length === 0) {
    accountViewFilterToggle.textContent = '筛选账号（0）';
    return;
  }
  const selectedCount = selectedAccountViewEmails.size;
  if (selectedCount === 0) {
    accountViewFilterToggle.textContent = `筛选账号（未选择）`;
    return;
  }
  if (selectedCount >= items.length) {
    accountViewFilterToggle.textContent = '筛选账号（全部）';
    return;
  }
  if (selectedCount === 1) {
    const only = items.find((item) => selectedAccountViewEmails.has(item.key));
    accountViewFilterToggle.textContent = `筛选账号（${only ? only.email : '1个'}）`;
    return;
  }
  accountViewFilterToggle.textContent = `筛选账号（${selectedCount}/${items.length}）`;
}

function renderAccountViewFilter() {
  if (!accountViewFilterOptions || !accountViewFilterAll) return;
  const items = getAccountViewFilterItems();
  syncSelectedAccountViewEmails(items);

  accountViewFilterOptions.innerHTML = '';
  items.forEach((item) => {
    const row = document.createElement('label');
    row.className = 'check-row account-view-filter-row';
    row.innerHTML = `
      <input type="checkbox" data-email-key="${item.key}" ${selectedAccountViewEmails.has(item.key) ? 'checked' : ''} />
      <span>${item.email}</span>
    `;
    accountViewFilterOptions.appendChild(row);
  });

  if (items.length === 0) {
    accountViewFilterAll.checked = false;
    accountViewFilterAll.indeterminate = false;
  } else {
    const selectedCount = selectedAccountViewEmails.size;
    accountViewFilterAll.checked = selectedCount === items.length;
    accountViewFilterAll.indeterminate = selectedCount > 0 && selectedCount < items.length;
  }
  updateAccountViewFilterLabel(items);
}

function shouldShowAccountInAccountView(account) {
  const email = String(account?.email || '').trim();
  if (!email) return true;
  if (selectedAccountViewEmails.size === 0) return false;
  return selectedAccountViewEmails.has(email.toLowerCase());
}

function getScopedAccountsByAccountViewFilter() {
  const all = uniqueAccountsByEmail(currentAccounts);
  if (all.length === 0) return [];
  if (!accountViewFilterInitialized && selectedAccountViewEmails.size === 0) {
    return all;
  }
  if (selectedAccountViewEmails.size === 0) return [];
  return all.filter((acc) => selectedAccountViewEmails.has(String(acc.email || '').trim().toLowerCase()));
}

function renderAccountList() {
  renderAccountViewFilter();
  accountList.innerHTML = '';
  if (currentAccounts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'account-card';
    empty.textContent = '请点击“添加账号”创建发件账号';
    accountList.appendChild(empty);
    return;
  }

  let visibleCount = 0;
  currentAccounts.forEach((acc, idx) => {
    const showInView = shouldShowAccountInAccountView(acc);
    if (showInView) {
      visibleCount += 1;
    }
    const stats = acc.stats || { assigned: 0, sent: 0, failed: 0, pending: 0 };
    const dailyLimit = Number.isFinite(Number(acc.daily_limit)) ? Number(acc.daily_limit) : 20;
    const todaySuccess = Number.isFinite(Number(acc.today_success)) ? Number(acc.today_success) : 0;
    const todayRemaining = Number.isFinite(Number(acc.today_remaining))
      ? Number(acc.today_remaining)
      : Math.max(dailyLimit - todaySuccess, 0);
    const quotaClass = getAccessUser()?.subscription_active ? 'good' : (todayRemaining <= 0 ? 'bad' : 'good');
    const quotaText = getAccessUser()?.subscription_active
      ? `会员中 · 今日成功发送 ${todaySuccess}`
      : `今日免费额度 ${todaySuccess}/${dailyLimit}`;
    const row = document.createElement('div');
    row.className = 'account-row';
    if (!showInView) {
      row.classList.add('is-filter-hidden');
    }
    row.dataset.index = String(idx);
    row.innerHTML = `
      <div class="account-header">
        <div>
          <div class="email">${acc.email || '未填写邮箱'}</div>
          <div class="meta">${acc.name || '未设置发件人'} · <span data-account-channel>SMTP</span></div>
        </div>
        <div class="account-actions">
          <div class="account-stats">
            <span class="account-stat">已分配 ${stats.assigned}</span>
            <span class="account-stat good">已发 ${stats.sent}</span>
            <span class="account-stat warn">待发 ${stats.pending}</span>
            <span class="account-stat bad">失败 ${stats.failed}</span>
            <span class="account-stat ${quotaClass}">${quotaText}</span>
          </div>
          <button class="ghost small" data-account-action="test-smtp" data-index="${idx}">测试SMTP</button>
          <button class="ghost small" data-account-action="remove" data-index="${idx}">删除</button>
        </div>
      </div>
      <div class="account-grid">
        <div class="account-field send-channel-field">
          <label>发送通道</label>
          <select data-index="${idx}" data-field="send_channel">
            <option value="smtp">SMTP（通用）</option>
            <option value="gmail_api">Gmail API（443）</option>
          </select>
        </div>
        <div class="account-field gmail-only gmail-auth-field">
          <label>Gmail 授权状态</label>
          <div class="account-input-row gmail-auth-row">
            <span class="account-oauth-status" data-gmail-status>未绑定 OAuth</span>
            <button class="ghost small" type="button" data-account-action="bind-gmail" data-index="${idx}">绑定</button>
            <button class="ghost small" type="button" data-account-action="unbind-gmail" data-index="${idx}">解绑</button>
            <button class="ghost small" type="button" data-account-action="upload-gmail-credentials" data-index="${idx}">上传 credentials.json</button>
            <button class="label-help gmail-help-btn" type="button" data-account-action="show-gmail-credentials-help" data-index="${idx}" aria-label="查看 credentials.json 下载说明" title="如何获取 credentials.json">?</button>
            <span class="account-client-secret-status" data-gmail-credentials-status title="credentials.json 上传状态">检测中</span>
          </div>
          <input type="hidden" data-index="${idx}" data-field="gmail_oauth_bound" value="0" />
        </div>
        <div class="account-field email-field">
          <label>邮箱</label>
          <input type="email" data-index="${idx}" data-field="email" placeholder="sender@example.com" />
        </div>
        <div class="account-field smtp-only">
          <label class="field-label">
            授权码
            <button class="label-help" type="button" data-account-action="help-authcode" data-index="${idx}" aria-label="授权码获取帮助">?</button>
          </label>
          <div class="account-input-row smtp-auth-row">
            <input type="password" data-index="${idx}" data-field="password" placeholder="授权码" />
            <button class="ghost small icon-button" type="button" data-account-action="toggle-password" data-index="${idx}" aria-label="显示授权码">👁</button>
          </div>
        </div>
        <div class="account-field sender-name-field">
          <label>发件人</label>
          <input type="text" data-index="${idx}" data-field="name" placeholder="显示名称" />
        </div>
        <div class="account-field smtp-only">
          <label>SMTP 服务器</label>
          <input type="text" data-index="${idx}" data-field="smtp_server" placeholder="smtp.gmail.com" />
        </div>
        <div class="account-field smtp-only">
          <label>端口</label>
          <input type="number" data-index="${idx}" data-field="smtp_port" min="1" placeholder="465" />
        </div>
        <div class="account-field">
          <label>开始发送时间(北京)</label>
          <div class="account-input-row date-row">
            <input type="datetime-local" step="60" data-index="${idx}" data-field="start_time_bj" />
            <button class="ghost small" type="button" data-account-action="clear-start-time" data-index="${idx}">默认</button>
          </div>
        </div>
        <div class="account-field full delay-pair-field">
          <label>发送间隔(秒)</label>
          <div class="delay-pair-row">
            <div class="delay-subfield">
              <label>最小间隔(秒)</label>
              <input type="number" data-index="${idx}" data-field="min_delay" min="1" placeholder="40" />
            </div>
            <div class="delay-subfield">
              <label>最大间隔(秒)</label>
              <div class="account-input-row delay-row">
                <input type="number" data-index="${idx}" data-field="max_delay" min="1" placeholder="60" />
                <span class="field-hint is-hidden" data-hint="max_delay"></span>
              </div>
            </div>
          </div>
        </div>
        <div class="account-field full">
          <label>邮件主题</label>
          <input type="text" data-index="${idx}" data-field="subject" placeholder="邮件主题" />
        </div>
        <div class="account-field full">
          <label>正文模板（{teacher_name}这个不要动，其他地方可修改！！！）</label>
          <textarea rows="4" data-index="${idx}" data-field="content" placeholder="正文模板"></textarea>
        </div>
        <div class="account-field full">
          <label>附件路径（每行一个）</label>
          <textarea rows="3" data-index="${idx}" data-field="attachments" placeholder="C:\\path\\file.pdf"></textarea>
          <div class="account-attachments-actions">
            <button class="ghost small" data-account-action="add-attachments" data-index="${idx}">选择附件</button>
            <button class="ghost small" data-account-action="clear-attachments" data-index="${idx}">清空</button>
          </div>
        </div>
      </div>
    `;

    const setValue = (selector, value) => {
      const el = row.querySelector(selector);
      if (el) el.value = value ?? '';
    };

    const channel = normalizeSendChannel(acc.send_channel, acc.email || '');
    acc.send_channel = channel;
    setValue('[data-field="email"]', acc.email || '');
    setValue('[data-field="send_channel"]', channel);
    setValue('[data-field="gmail_oauth_bound"]', acc.gmail_oauth_bound ? '1' : '0');
    setValue('[data-field="password"]', acc.password || '');
    setValue('[data-field="name"]', acc.name || '');
    setValue('[data-field="smtp_server"]', acc.smtp_server || 'smtp.gmail.com');
    setValue('[data-field="smtp_port"]', acc.smtp_port ?? 465);
    const startTime = ensureAccountStartTime(acc);
    setValue('[data-field="start_time_bj"]', toDateTimeLocalValue(startTime));
    setValue('[data-field="min_delay"]', acc.min_delay ?? 40);
    setValue('[data-field="max_delay"]', acc.max_delay ?? 60);
    setValue('[data-field="subject"]', acc.subject || '');
    setValue('[data-field="content"]', acc.content || '');
    setValue('[data-field="attachments"]', attachmentsToText(acc.attachments));

    accountList.appendChild(row);
    row.dataset.channelLocked = acc.email ? '1' : '0';
    applyChannelVisibility(idx, channel);
  });
  if (visibleCount === 0) {
    const empty = document.createElement('div');
    empty.className = 'account-card';
    empty.textContent = '当前筛选结果为空，请在筛选下拉中勾选账号';
    accountList.appendChild(empty);
  }
  applyGmailCredentialsStatusToRows();
  void refreshGmailCredentialsStatus();
}

function renderAccountSelects() {
  const allSelectable = getScopedAccountsByAccountViewFilter();
  const selectGroups = [
    { el: accountSelect, source: allSelectable },
    { el: accountSelectPaste, source: allSelectable },
    { el: composeAccountSelect, source: allSelectable },
    { el: testAccountSelect, source: allSelectable },
    { el: feedbackAccountSelect, source: allSelectable },
  ];
  selectGroups.forEach(({ el: select, source }) => {
    if (!select) return;
    const previous = select.value;
    select.innerHTML = '';
    if (source.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '未配置账号';
      select.appendChild(option);
      return;
    }
    source.forEach((acc) => {
      const option = document.createElement('option');
      option.value = acc.email;
      option.textContent = `${acc.email}${acc.name ? ` (${acc.name})` : ''}`;
      select.appendChild(option);
    });
    if (previous && source.some((acc) => acc.email === previous)) {
      select.value = previous;
    }
  });
  renderComposeEditor();
  syncBaseTimeInputs();
}

function renderAccountFilter() {
  if (!accountFilterSelect) return;
  // 导师库筛选保持显示全部账号，不跟随账号中心可见性筛选。
  const selectable = uniqueAccountsByEmail(currentAccounts);
  const activeKeys = new Set(selectable.map((acc) => String(acc.email || '').trim().toLowerCase()));
  const deletedAssigned = new Map();
  (lastDashboard?.teachers || []).forEach((teacher) => {
    const assigned = String(teacher?.assigned_account || '').trim();
    if (!assigned) return;
    const key = assigned.toLowerCase();
    if (activeKeys.has(key)) return;
    if (!deletedAssigned.has(key)) {
      deletedAssigned.set(key, assigned);
    }
  });
  const previous = accountFilterSelect.value || accountFilter;
  accountFilterSelect.innerHTML = '';
  const optionAll = document.createElement('option');
  optionAll.value = 'all';
  optionAll.textContent = '全部账号';
  accountFilterSelect.appendChild(optionAll);
  selectable.forEach((acc) => {
    const option = document.createElement('option');
    option.value = acc.email;
    option.textContent = acc.email;
    accountFilterSelect.appendChild(option);
  });
  if (deletedAssigned.size > 0) {
    const optionDeletedAll = document.createElement('option');
    optionDeletedAll.value = '__deleted_accounts__';
    optionDeletedAll.textContent = `已删除账号（${deletedAssigned.size}）`;
    accountFilterSelect.appendChild(optionDeletedAll);

    deletedAssigned.forEach((email) => {
      const option = document.createElement('option');
      option.value = email;
      option.textContent = `${email}（已删除）`;
      accountFilterSelect.appendChild(option);
    });
  }
  const allOptionValues = new Set(Array.from(accountFilterSelect.options).map((opt) => opt.value));
  const valid = allOptionValues.has(previous);
  accountFilterSelect.value = valid ? previous : 'all';
  accountFilter = accountFilterSelect.value;
}

function getSendSelectableAccounts() {
  const scoped = getScopedAccountsByAccountViewFilter();
  if (runningSendAccounts.size === 0) return scoped;
  const map = new Map(scoped.map((acc) => [String(acc.email || '').trim().toLowerCase(), acc]));
  uniqueAccountsByEmail(currentAccounts).forEach((acc) => {
    const key = String(acc.email || '').trim().toLowerCase();
    if (runningSendAccounts.has(key) && !map.has(key)) {
      map.set(key, acc);
    }
  });
  return Array.from(map.values());
}

function ensureSendSelection(selectable) {
  const available = new Set(selectable.map((acc) => acc.email));
  selectedSendAccounts = new Set(
    Array.from(selectedSendAccounts).filter((email) => available.has(email)),
  );
  if (!sendSelectionTouched && selectedSendAccounts.size === 0 && available.size > 0) {
    selectedSendAccounts = new Set(available);
  }
}

function updateSendSelectionMeta(selectable) {
  if (!sendAllToggle || !sendSelectedMeta) return;
  const total = selectable.length;
  const selectedCount = selectedSendAccounts.size;
  const runningCount = runningSendAccounts.size;
  sendSelectedMeta.textContent = runningCount > 0
    ? `已选 ${selectedCount} 个账号（发送中 ${runningCount}）`
    : `已选 ${selectedCount} 个账号`;
  if (total === 0) {
    sendAllToggle.checked = false;
    sendAllToggle.indeterminate = false;
    return;
  }
  sendAllToggle.checked = selectedCount === total;
  sendAllToggle.indeterminate = selectedCount > 0 && selectedCount < total;
}

function renderSendAccountList() {
  if (!sendAccountList) return;
  const displayAccounts = getSendSelectableAccounts();
  const selectable = getSendSelectableAccounts();
  ensureSendSelection(selectable);
  sendAccountList.innerHTML = '';
  if (displayAccounts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = '未配置账号';
    sendAccountList.appendChild(empty);
    updateSendSelectionMeta(selectable);
    return;
  }
  displayAccounts.forEach((acc) => {
    const row = document.createElement('label');
    row.className = 'check-row';
    const channel = normalizeSendChannel(acc.send_channel, acc.email);
    const isRunning = runningSendAccounts.has(acc.email.toLowerCase());
    const checked = selectedSendAccounts.has(acc.email) || isRunning;
    if (isRunning) {
      selectedSendAccounts.add(acc.email);
      row.classList.add('is-disabled', 'is-running');
    }
    const channelLabel = channel === 'gmail_api' ? ' (Gmail API)' : '';
    row.innerHTML = `
      <input type="checkbox" data-send-account="1" value="${acc.email}" ${checked ? 'checked' : ''} ${isRunning ? 'disabled' : ''} />
      <span>${acc.email}${channelLabel}</span>
    `;
    sendAccountList.appendChild(row);
  });
  updateSendSelectionMeta(selectable);
}

function syncScopedAccountSelectors() {
  renderAccountSelects();
  renderAccountFilter();
  renderSendAccountList();
  if (lastDashboard) {
    updateSendInfo(lastDashboard);
    updateSendControls(lastDashboard);
  }
}

function updateRunningAccounts(data) {
  const list = data?.runningAccounts || [];
  runningSendAccounts = new Set(list.map((item) => String(item.email || item).toLowerCase()));
}

function renderSendProgressList(data) {
  if (!sendProgressList) return;
  const running = data?.runningAccounts || [];
  sendProgressList.innerHTML = '';
  if (!running.length) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = '暂无发送中的账号';
    sendProgressList.appendChild(empty);
    return;
  }
  running.forEach((item) => {
    const email = item.email || item;
    const acc = (data?.accounts || []).find((a) => a.email === email);
    const stats = acc?.stats || { assigned: 0, sent: 0, failed: 0, pending: 0 };
    const total = stats.assigned ?? 0;
    const completed = (stats.sent ?? 0) + (stats.failed ?? 0);
    const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
    const done = total > 0 && (stats.pending ?? 0) === 0;
    const currentIndex = total > 0 ? Math.min(total, completed + (done ? 0 : 1)) : 0;
    const stopDisabled = done;
    const card = document.createElement('div');
    card.className = 'send-progress-item';
    card.innerHTML = `
      <div class="row">
        <span class="email">${email}</span>
        <div class="row-actions">
          <span class="status">${done ? '发送完成' : '发送中'}</span>
          <button class="ghost small" type="button" data-action="stop-send-account" data-email="${email}" ${stopDisabled ? 'disabled' : ''}>停止</button>
        </div>
      </div>
      <div class="progress">
        <div class="bar" style="width: ${percent}%"></div>
      </div>
      <div class="progress-meta">
        <span>进度 ${currentIndex}/${total}</span>
        <span>已发 ${stats.sent ?? 0}</span>
        <span>失败 ${stats.failed ?? 0}</span>
        <span>待发 ${stats.pending ?? 0}</span>
      </div>
    `;
    sendProgressList.appendChild(card);
  });
}

function updateSendControls(data) {
  const selectable = getSendSelectableAccounts();
  const running = runningSendAccounts;
  const toStart = Array.from(selectedSendAccounts).filter((email) => !running.has(String(email).toLowerCase()));
  if (sendStartButton) sendStartButton.disabled = selectable.length === 0 || toStart.length === 0;
  if (sendStopButton) sendStopButton.disabled = running.size === 0;
}

function buildAccountStatsMap(data) {
  const statsMap = new Map();
  const accounts = data?.accounts || currentAccounts || [];
  accounts.forEach((acc) => {
    const email = String(acc?.email || '').trim().toLowerCase();
    if (!email) return;
    const next = statsMap.get(email) || {
      assigned: 0,
      sent: 0,
      failed: 0,
      pending: 0,
    };
    const stats = acc?.stats || {};
    next.assigned += Number(stats.assigned ?? 0) || 0;
    next.sent += Number(stats.sent ?? 0) || 0;
    next.failed += Number(stats.failed ?? 0) || 0;
    next.pending += Number(stats.pending ?? 0) || 0;
    statsMap.set(email, next);
  });
  return statsMap;
}

function sumSelectedAccountStats(selectedEmails, data) {
  const map = buildAccountStatsMap(data);
  let total = 0;
  let pending = 0;
  let sent = 0;
  let failed = 0;
  selectedEmails.forEach((email) => {
    const key = String(email || '').trim().toLowerCase();
    if (!key) return;
    const stats = map.get(key);
    if (!stats) return;
    total += stats.assigned ?? 0;
    pending += stats.pending ?? 0;
    sent += stats.sent ?? 0;
    failed += stats.failed ?? 0;
  });
  return { total, pending, sent, failed };
}

function updateSendInfo(data) {
  if (!sendScope || !sendPending) return;
  const selectable = getSendSelectableAccounts();
  ensureSendSelection(selectable);
  const selected = Array.from(selectedSendAccounts);
  const totalSelected = selected.length;

  let total = 0;
  let pending = 0;
  let sent = 0;
  let failed = 0;

  if (totalSelected === 0) {
    sendScope.textContent = '发送账号：未选择';
  } else if (totalSelected === selectable.length) {
    sendScope.textContent = '发送账号：全部账号';
    const subset = sumSelectedAccountStats(selected, data);
    pending = subset.pending;
    sent = subset.sent;
    failed = subset.failed;
    total = subset.total;
  } else {
    sendScope.textContent = `发送账号：已选 ${totalSelected} 个`;
    const subset = sumSelectedAccountStats(selected, data);
    pending = subset.pending;
    sent = subset.sent;
    failed = subset.failed;
    total = subset.total;
  }

  sendPending.textContent = `待发送：${pending}`;
  if (sendStatus && sendStatus.textContent === '发送中...' && pending === 0) {
    sendStatus.textContent = '发送完成';
  }
  if (sendProgressBar) {
    const completed = sent + failed;
    const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
    sendProgressBar.style.width = `${percent}%`;
    sendProgressBar.setAttribute('aria-label', `发送进度 ${percent}%`);
  }

  updateSendSelectionMeta(selectable);
}

function ensureAuth() {
  if (!hasAccess()) {
    showAuth('请先登录');
    return false;
  }
  return true;
}

function getSmtpPreset(email) {
  if (!email || !email.includes('@')) return null;
  const domain = email.split('@').pop()?.toLowerCase() || '';
  return SMTP_PRESETS[domain] || null;
}

function applySmtpPreset(index, email) {
  if (!isSmtpAccount(currentAccounts[index])) return;
  const preset = getSmtpPreset(email);
  if (!preset || !accountList) return;
  const row = accountList.querySelector(`.account-row[data-index="${index}"]`);
  if (!row) return;
  const locked = row.dataset.smtpLocked === '1';
  if (locked) return;
  currentAccounts[index].smtp_server = preset.server;
  currentAccounts[index].smtp_port = preset.port;
  const serverInput = row.querySelector('[data-field="smtp_server"]');
  const portInput = row.querySelector('[data-field="smtp_port"]');
  if (serverInput) serverInput.value = preset.server;
  if (portInput) portInput.value = String(preset.port);
}

const announcementState = {
  enabled: false,
  speed: 24,
  refresh: 30,
};

function applyAnnouncement(content = '') {
  if (!announcementBar || !announcementText || !announcementTrack) return;
  const text = (content || '').trim();
  const enabled = announcementState.enabled && text.length > 0;
  if (!enabled) {
    announcementBar.classList.add('is-hidden');
    return;
  }
  const duration = Math.min(120, Math.max(8, Number(announcementState.speed) || 24));
  announcementText.textContent = text;
  announcementTrack.style.setProperty('--announcement-duration', `${duration}s`);
  announcementBar.classList.remove('is-hidden');
}

let announcementTimer = null;

async function fetchAnnouncement() {
  const result = await window.mailpilot.getAnnouncement();
  if (!result?.ok) {
    announcementState.enabled = false;
    applyAnnouncement('');
    return;
  }
  announcementState.enabled = Boolean(result.settings?.enabled);
  announcementState.speed = coerceNumber(result.settings?.speed, 24);
  announcementState.refresh = coerceNumber(result.settings?.refresh, 30);
  applyAnnouncement(result.data?.content || '');
}

function startAnnouncementPolling() {
  if (announcementTimer) {
    clearInterval(announcementTimer);
    announcementTimer = null;
  }
  if (!announcementState.enabled) return;
  const refresh = Math.min(600, Math.max(5, Number(announcementState.refresh) || 30));
  announcementTimer = setInterval(() => {
    void fetchAnnouncement();
  }, refresh * 1000);
}

function updateAccountField(index, field, value) {
  if (!currentAccounts[index]) return;
  const trimmed = typeof value === 'string' ? value.trim() : value;
  switch (field) {
    case 'email':
      currentAccounts[index].email = trimmed;
      if (accountList) {
        const row = accountList.querySelector(`.account-row[data-index="${index}"]`);
        const locked = row?.dataset.channelLocked === '1';
        if (!locked) {
          const nextChannel = defaultSendChannelByEmail(trimmed);
          currentAccounts[index].send_channel = nextChannel;
          applyChannelVisibility(index, nextChannel);
        }
      }
      applySmtpPreset(index, trimmed);
      break;
    case 'send_channel': {
      const normalized = normalizeSendChannel(trimmed, currentAccounts[index].email);
      currentAccounts[index].send_channel = normalized;
      if (accountList) {
        const row = accountList.querySelector(`.account-row[data-index="${index}"]`);
        if (row) row.dataset.channelLocked = '1';
      }
      applyChannelVisibility(index, normalized);
      break;
    }
    case 'gmail_oauth_bound':
      currentAccounts[index].gmail_oauth_bound = String(value) === '1' || value === true;
      applyChannelVisibility(index, currentAccounts[index].send_channel);
      break;
    case 'smtp_port':
      currentAccounts[index].smtp_port = coerceNumber(trimmed, 465);
      if (accountList) {
        const row = accountList.querySelector(`.account-row[data-index="${index}"]`);
        if (row) row.dataset.smtpLocked = '1';
      }
      break;
    case 'smtp_server':
      currentAccounts[index].smtp_server = trimmed || 'smtp.gmail.com';
      if (accountList) {
        const row = accountList.querySelector(`.account-row[data-index="${index}"]`);
        if (row) row.dataset.smtpLocked = '1';
      }
      break;
    case 'min_delay':
      currentAccounts[index].min_delay = coerceNumber(trimmed, 40);
      break;
    case 'max_delay':
      currentAccounts[index].max_delay = coerceNumber(trimmed, 60);
      break;
    case 'start_time_bj':
      currentAccounts[index].start_time_bj = normalizeDateTimeInput(trimmed);
      syncBaseTimeInputs();
      break;
    case 'attachments':
      currentAccounts[index].attachments = normalizeAttachments(value);
      break;
    case 'content':
      currentAccounts[index].content = value ?? '';
      break;
    default:
      currentAccounts[index][field] = trimmed;
  }
  if (field === 'min_delay' || field === 'max_delay') {
    enforceDelayBounds(index, field);
  }
  markAccountsDirty();
}

function getComposeAccount() {
  if (!composeAccountSelect) return null;
  const email = composeAccountSelect.value;
  if (!email) return null;
  return currentAccounts.find((acc) => acc.email === email) || null;
}

function renderComposeEditor() {
  if (!composeAccountSelect || !composeSubjectInput || !composeContentInput || !composeAttachmentsInput) return;
  const account = getComposeAccount();
  if (!account) {
    composeSyncLock = true;
    composeSubjectInput.value = '';
    composeContentInput.value = '';
    composeAttachmentsInput.value = '';
    composeSyncLock = false;
    return;
  }
  composeSyncLock = true;
  composeSubjectInput.value = account.subject || '';
  composeContentInput.value = account.content || '';
  composeAttachmentsInput.value = attachmentsToText(account.attachments);
  composeSyncLock = false;
}

function getAccountIndexByEmail(email) {
  if (!email) return -1;
  return currentAccounts.findIndex((acc) => acc.email === email);
}

function isBuiltinComposeTemplateName(nameRaw) {
  const name = String(nameRaw || '').trim();
  if (!name) return false;
  return BUILTIN_COMPOSE_TEMPLATE_NAMES.has(name);
}

function getAllComposeTemplates() {
  const builtinTemplates = BUILTIN_COMPOSE_TEMPLATES.map((tpl) => ({ ...tpl, isBuiltin: true }));
  const userTemplates = Array.isArray(composeTemplates) ? composeTemplates : [];
  const filteredUsers = userTemplates.filter((tpl) => !isBuiltinComposeTemplateName(tpl?.name));
  return [...builtinTemplates, ...filteredUsers];
}

function getComposeTemplateOptionLabel(tpl) {
  if (!tpl) return '';
  const name = String(tpl.name || '').trim();
  if (!name) return '';
  return tpl.isBuiltin ? `${name}` : name;
}

function renderComposeTemplateOptions(preferred = '') {
  if (!composeTemplateSelect) return;
  const previous = preferred || composeTemplateSelect.value || '';
  composeTemplateSelect.innerHTML = '';
  const templates = getAllComposeTemplates();
  if (templates.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '未保存模板';
    composeTemplateSelect.appendChild(option);
    composeTemplateSelect.value = '';
    return;
  }
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '选择模板';
  composeTemplateSelect.appendChild(placeholder);
  templates.forEach((tpl) => {
    const option = document.createElement('option');
    option.value = tpl.name;
    option.textContent = getComposeTemplateOptionLabel(tpl);
    composeTemplateSelect.appendChild(option);
  });
  const hasPrevious = templates.some((tpl) => tpl.name === previous);
  composeTemplateSelect.value = hasPrevious ? previous : '';
  if (composeTemplateNameInput && composeTemplateSelect.value) {
    if (!composeTemplateNameInput.value || preferred) {
      composeTemplateNameInput.value = composeTemplateSelect.value;
    }
  }
}

async function loadComposeTemplates(preferred = '') {
  if (!window.mailpilot?.listMailTemplates) return;
  try {
    const result = await window.mailpilot.listMailTemplates();
    if (!result?.ok) return;
    composeTemplates = Array.isArray(result.templates) ? result.templates : [];
    renderComposeTemplateOptions(preferred);
  } catch (err) {
    // ignore template loading failures to avoid blocking compose editing
  }
}

function getSelectedComposeTemplate() {
  const name = String(composeTemplateSelect?.value || '').trim();
  if (!name) return null;
  return getAllComposeTemplates().find((tpl) => String(tpl?.name || '') === name) || null;
}

function updateAccountRowField(index, field, value) {
  if (!accountList) return;
  const row = accountList.querySelector(`.account-row[data-index="${index}"]`);
  if (!row) return;
  const input = row.querySelector(`[data-field="${field}"]`);
  if (input && input.value !== value) {
    input.value = value;
  }
}

function focusAccountField(index, field) {
  if (!accountList) return;
  const row = accountList.querySelector(`.account-row[data-index="${index}"]`);
  const input = row?.querySelector(`[data-field="${field}"]`);
  if (!input) return;
  setTimeout(() => {
    input.focus();
    try {
      input.select();
    } catch (err) {
      // ignore
    }
  }, 0);
}

function enforceDelayBounds(index, changedField) {
  const account = currentAccounts[index];
  if (!account) return;
  let minDelay = Number(account.min_delay ?? 40);
  let maxDelay = Number(account.max_delay ?? 60);
  if (Number.isNaN(minDelay)) minDelay = 0;
  if (Number.isNaN(maxDelay)) maxDelay = minDelay;
  if (maxDelay >= minDelay) return;

  if (changedField === 'min_delay') {
    minDelay = maxDelay;
    account.min_delay = minDelay;
    updateAccountRowField(index, 'min_delay', String(minDelay));
  } else {
    maxDelay = minDelay;
    account.max_delay = maxDelay;
    updateAccountRowField(index, 'max_delay', String(maxDelay));
  }
  setTimeout(() => {
    showAccountFieldHint(index, 'max_delay', '最大间隔必须 ≥ 最小间隔，已自动调整');
    focusAccountField(index, changedField);
  }, 0);
}

function syncComposeToAccount() {
  if (composeSyncLock) return;
  const account = getComposeAccount();
  if (!account) return;
  const index = getAccountIndexByEmail(account.email);
  if (index < 0) return;
  const subject = composeSubjectInput ? composeSubjectInput.value.trim() : '';
  const content = composeContentInput ? composeContentInput.value : '';
  const attachmentsText = composeAttachmentsInput ? composeAttachmentsInput.value : '';
  updateAccountField(index, 'subject', subject);
  updateAccountField(index, 'content', content);
  updateAccountField(index, 'attachments', attachmentsText);
  updateAccountRowField(index, 'subject', subject);
  updateAccountRowField(index, 'content', content);
  updateAccountRowField(index, 'attachments', attachmentsText);
}

function collectAccountsFromForm() {
  if (!accountList) return currentAccounts;
  const rows = Array.from(accountList.querySelectorAll('.account-row'));
  if (rows.length === 0) return currentAccounts;
  return rows.map((row, idx) => {
    const getField = (field) => row.querySelector(`[data-field="${field}"]`);
    const valueOf = (field) => (getField(field)?.value ?? '').trim();
    const rawContent = getField('content')?.value ?? '';
    const rawAttachments = getField('attachments')?.value ?? '';
    const email = valueOf('email');
    const sendChannel = normalizeSendChannel(valueOf('send_channel'), email);
    const preset = getSmtpPreset(email) || {};
    return {
      email,
      send_channel: sendChannel,
      gmail_oauth_bound: valueOf('gmail_oauth_bound') === '1',
      password: valueOf('password'),
      name: valueOf('name'),
      smtp_server: valueOf('smtp_server') || preset.server || 'smtp.gmail.com',
      smtp_port: coerceNumber(valueOf('smtp_port'), preset.port ?? 465),
      start_time_bj: normalizeDateTimeInput(valueOf('start_time_bj')),
      min_delay: coerceNumber(valueOf('min_delay'), 40),
      max_delay: coerceNumber(valueOf('max_delay'), 60),
      subject: valueOf('subject'),
      content: rawContent,
      attachments: normalizeAttachments(rawAttachments),
    };
  });
}

function syncAccountsFromForm() {
  const updated = collectAccountsFromForm();
  if (updated.length > 0) {
    currentAccounts = updated;
  }
}

const actions = {
  'open-import': () => showView('import'),
  'open-logs': () => showView('logs'),
  'open-accounts': () => showView('accounts'),
  'open-membership': () => openPaymentModal(),
  'close-payment-modal': () => closePaymentModal(),
  'start-send': () => showView('send'),
  'add-account': () => {
    if (!ensureAuth()) return;
    currentAccounts = [...currentAccounts, createBlankAccount()];
    renderAccountList();
    renderAccountSelects();
    renderAccountCards();
    markAccountsDirty();
  },
  logout: () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('guestMode');
    authToken = '';
    accessState = null;
    currentUser = null;
    closePaymentModal();
    if (userEmailEl) userEmailEl.textContent = '未登录';
    renderMembershipCard();
    showAuth('已退出，请重新登录');
  },
  'save-accounts': async () => {
    if (!ensureAuth()) return;
    const accounts = collectAccountsFromForm();
    if (accounts.length === 0) {
      alert('请先添加账号');
      return;
    }
    const warnings = [];
    const hasMissing = accounts.some((acc) => {
      if (!acc.email) return true;
      if (normalizeSendChannel(acc.send_channel, acc.email) === 'smtp' && !acc.password) {
        return true;
      }
      return false;
    });
    if (hasMissing) {
      warnings.push('有账号未填写必要字段（SMTP 需要授权码）');
    }
    const hasUnboundGmail = accounts.some((acc) => (
      normalizeSendChannel(acc.send_channel, acc.email) === 'gmail_api' && !acc.gmail_oauth_bound
    ));
    if (hasUnboundGmail) {
      warnings.push('检测到 Gmail API 账号尚未绑定 OAuth，后续发送可能失败');
    }
    currentAccounts = accounts;
    accountAutoSaveSnapshot = JSON.stringify(accounts);
    accountAutoSaveDirty = false;
    // Keep current form DOM untouched so user can continue editing immediately.
    renderAccountCards();
    renderAccountSelects();
    renderAccountFilter();
    renderSendAccountList();
    if (warnings.length > 0) {
      showToast(`账号设置已保存（注意：${warnings.join('；')}）`, 3600);
    } else {
      showToast('账号设置已保存，数据库同步中');
    }
    void saveAccountsWithSync(accounts).then((result) => {
      if (result?.dbSync && result.dbSync.ok) {
        showToast('账号设置已保存，并已同步数据库');
      } else if (result?.dbSync && result.dbSync.skipped) {
        showToast(`账号设置已保存，数据库同步已跳过：${result.dbSync.error || '未登录账号'}`);
      } else if (result?.dbSync && !result.dbSync.skipped && !result?.dbSync?.pending) {
        showToast(`账号设置已保存，但数据库同步失败：${result.dbSync.error || '未知错误'}`);
      }
    }).catch(() => {
      showToast('账号设置已保存，但数据库同步失败');
    });
  },
  'clear-file': () => {
    if (fileInput) {
      fileInput.value = '';
    }
    selectedFilePath = '';
    if (fileHint) {
      fileHint.textContent = '未选择文件';
    }
  },
  'download-import-sample': async () => {
    if (!window.mailpilot?.downloadImportSample) {
      alert('当前版本不支持下载示例文件，请重启应用后再试');
      return;
    }
    const result = await window.mailpilot.downloadImportSample();
    if (result?.canceled) return;
    if (!result?.ok) {
      alert(`下载示例文件失败：${result?.error || '未知错误'}`);
      return;
    }
    if (importConsole) {
      importConsole.textContent = `示例文件已保存到：${result.path}`;
    }
    showToast('示例文件下载成功');
  },
  'compose-save': async () => {
    if (!ensureAuth()) return;
    syncAccountsFromForm();
    const account = getComposeAccount();
    if (!account) {
      alert('请先选择账号');
      return;
    }
    account.subject = composeSubjectInput ? composeSubjectInput.value.trim() : '';
    account.content = composeContentInput ? composeContentInput.value : '';
    account.attachments = normalizeAttachments(composeAttachmentsInput ? composeAttachmentsInput.value : '');
    accountAutoSaveSnapshot = JSON.stringify(currentAccounts);
    accountAutoSaveDirty = false;
    showToast('模板已保存，数据库同步中');
    void saveAccountsWithSync(currentAccounts).then((result) => {
      if (result?.dbSync && result.dbSync.ok) {
        showToast('模板已保存，并已同步数据库');
      } else if (result?.dbSync && result.dbSync.skipped) {
        showToast(`模板已保存，数据库同步已跳过：${result.dbSync.error || '未登录账号'}`);
      } else if (result?.dbSync && !result.dbSync.skipped && !result?.dbSync?.pending) {
        showToast(`模板已保存，但数据库同步失败：${result.dbSync.error || '未知错误'}`);
      }
    }).catch(() => {
      showToast('模板已保存，但数据库同步失败');
    });
  },
  'compose-template-save': async () => {
    if (!ensureAuth()) return;
    const subject = composeSubjectInput ? composeSubjectInput.value.trim() : '';
    const content = composeContentInput ? composeContentInput.value : '';
    const attachments = normalizeAttachments(composeAttachmentsInput ? composeAttachmentsInput.value : '');
    if (!subject && !content && attachments.length === 0) {
      alert('当前模板内容为空，无法保存');
      return;
    }
    if (!window.mailpilot?.saveMailTemplate) {
      alert('当前版本不支持模板库，请重启应用后再试');
      return;
    }
    const name = String(
      composeTemplateNameInput?.value
      || composeTemplateSelect?.value
      || composeAccountSelect?.value
      || '',
    ).trim();
    if (!name) {
      alert('请输入模板名称');
      return;
    }
    if (isBuiltinComposeTemplateName(name)) {
      alert('示例模板为内置模板，不能直接覆盖。请修改模板名称后再保存。');
      return;
    }
    const result = await window.mailpilot.saveMailTemplate({
      name,
      subject,
      content,
      attachments,
    });
    if (!result?.ok) {
      alert(`保存模板失败：${result?.error || '未知错误'}`);
      return;
    }
    await loadComposeTemplates(name);
    if (composeTemplateNameInput) {
      composeTemplateNameInput.value = name;
    }
    showToast(`模板已保存：${name}`);
  },
  'compose-template-apply': () => {
    syncAccountsFromForm();
    const account = getComposeAccount();
    if (!account) {
      alert('请先选择账号后再导入模板');
      return;
    }
    const tpl = getSelectedComposeTemplate();
    if (!tpl) {
      alert('请先选择要导入的模板');
      return;
    }
    if (composeSubjectInput) composeSubjectInput.value = String(tpl.subject || '');
    if (composeContentInput) composeContentInput.value = String(tpl.content || '');
    if (composeAttachmentsInput) composeAttachmentsInput.value = attachmentsToText(tpl.attachments);
    if (composeTemplateNameInput) composeTemplateNameInput.value = String(tpl.name || '');
    syncComposeToAccount();
    markAccountsDirty();
    showToast(`模板已导入：${tpl.name}`);
  },
  'compose-template-delete': async () => {
    if (!ensureAuth()) return;
    if (!window.mailpilot?.deleteMailTemplate) {
      alert('当前版本不支持删除模板，请重启应用后再试');
      return;
    }
    const name = String(
      composeTemplateNameInput?.value
      || composeTemplateSelect?.value
      || '',
    ).trim();
    if (!name) {
      alert('请先选择或输入要删除的模板名称');
      return;
    }
    if (isBuiltinComposeTemplateName(name)) {
      alert('示例模板为内置模板，不能删除。');
      return;
    }
    const ok = window.confirm(`确认删除模板「${name}」吗？`);
    if (!ok) return;
    const result = await window.mailpilot.deleteMailTemplate(name);
    if (!result?.ok) {
      alert(`删除模板失败：${result?.error || '未知错误'}`);
      return;
    }
    if (composeTemplateNameInput) {
      composeTemplateNameInput.value = '';
    }
    await loadComposeTemplates('');
    showToast(`模板已删除：${name}`);
  },
  'compose-reset': () => {
    renderComposeEditor();
  },
  'compose-add-attachments': async () => {
    if (!ensureAuth()) return;
    const account = getComposeAccount();
    if (!account || !composeAttachmentsInput) {
      alert('请先选择账号');
      return;
    }
    const paths = await window.mailpilot.selectAttachments();
    if (!paths || paths.length === 0) return;
    const existing = normalizeAttachments(composeAttachmentsInput.value);
    const merged = Array.from(new Set([...existing, ...paths]));
    composeAttachmentsInput.value = merged.join('\n');
    account.attachments = merged;
  },
  'compose-clear-attachments': () => {
    const account = getComposeAccount();
    if (!composeAttachmentsInput) return;
    composeAttachmentsInput.value = '';
    if (account) account.attachments = [];
  },
  'paste-demo': () => {
    const sample = [
      ['示例国家A', '示例机构A', '示例联系人A', '示例姓氏A', 'researcher1@example.com', '0'],
      ['示例国家B', '示例机构B', '示例联系人B', '示例姓氏B', 'researcher2@example.com', '0'],
    ];
    fillPasteGrid(sample);
  },
  'import-file': async () => {
    if (!ensureAuth()) return;
    syncAccountsFromForm();
    const account = accountSelect ? accountSelect.value : '';
    if (!account) {
      alert('请先选择账号');
      return;
    }
    const baseTime = baseTimeInput && baseTimeInput.value.trim()
      ? normalizeDateTimeInput(baseTimeInput.value.trim())
      : (currentAccounts.find((acc) => acc.email === account)?.start_time_bj || '');

    let filePath = selectedFilePath;
    if (!filePath && fileInput && fileInput.files && fileInput.files.length > 0) {
      filePath = await handleDroppedFiles(fileInput.files);
    }
    if (!filePath || !isAbsolutePath(filePath)) {
      filePath = await window.mailpilot.selectFile();
      if (!filePath || !isAbsolutePath(filePath)) {
        alert('未选择有效文件，请重新选择');
        return;
      }
      selectedFilePath = filePath;
      if (fileHint) {
        fileHint.textContent = filePath;
      }
    }
    const result = await window.mailpilot.importExcel(filePath, account, baseTime);
    handleImportResult(result);
  },
  'import-paste': async () => {
    if (!ensureAuth()) return;
    syncAccountsFromForm();
    const account = accountSelectPaste ? accountSelectPaste.value : '';
    if (!account) {
      alert('请先选择账号');
      return;
    }
    const baseTime = baseTimePasteInput && baseTimePasteInput.value.trim()
      ? normalizeDateTimeInput(baseTimePasteInput.value.trim())
      : (currentAccounts.find((acc) => acc.email === account)?.start_time_bj || '');

    const text = extractPasteGrid();
    if (!text) return;
    const result = await window.mailpilot.importPaste(text, account, baseTime);
    handleImportResult(result);
  },
  'parse-paste': () => {
    alert('粘贴内容会在导入时自动解析。');
  },
  'clear-paste-grid': () => {
    clearGrid('paste', 4);
    if (importConsole) {
      importConsole.textContent = '已清空粘贴表格';
    }
  },
  'delete-paste-rows': () => {
    deleteSelectedRows('paste');
  },
  'delete-paste-cols': () => {
    clearSelectedColumns('paste');
  },
  'clear-base-time': () => {
    if (!accountSelect) return;
    baseTimeInput.value = getAccountStartTime(accountSelect.value);
  },
  'clear-base-time-paste': () => {
    if (!accountSelectPaste) return;
    baseTimePasteInput.value = getAccountStartTime(accountSelectPaste.value);
  },
  'save-test-list': () => {
    const text = extractTestGrid();
    if (!text) {
      if (testConsole) {
        testConsole.textContent = '未检测到有效测试数据，请先填写/粘贴，且姓氏与作者邮箱必填。';
      }
      return;
    }
    localStorage.setItem(TEST_LIST_KEY, text);
    const count = countTsvRows(text);
    if (testConsole) {
      testConsole.textContent = `已保存测试名单：${count} 条\n不会写入 teachers.json`;
    }
  },
  'clear-test-time': () => {
    applyDefaultTestStartTime(true);
  },
  'delete-test-rows': () => {
    deleteSelectedRows('test');
  },
  'delete-test-cols': () => {
    clearSelectedColumns('test');
  },
  'execute-test': async () => {
    if (!ensureAuth()) return;
    if (!(await ensureCanSendOrPrompt())) return;
    syncAccountsFromForm();
    await autoSaveAccounts(true);
    if (testSendRunning) {
      if (testConsole) {
        testConsole.textContent = '测试发送进行中，请先停止或等待完成。';
      }
      return;
    }
    const text = extractTestGrid();
    if (!text) {
      if (testConsole) {
        testConsole.textContent = '未检测到有效测试数据，请先填写/粘贴，且姓氏与作者邮箱必填。';
      }
      return;
    }
    const account = testAccountSelect ? testAccountSelect.value : '';
    if (!account) {
      if (testConsole) {
        testConsole.textContent = '请先选择测试账号';
      }
      return;
    }
    localStorage.setItem(TEST_LIST_KEY, text);
    if (testConsole) {
      testConsole.textContent = '测试发送中...';
    }
    testSendRunning = true;
    updateTestSendControls();
    try {
      const startTime = normalizeDateTimeInput(testTimeInput ? testTimeInput.value : '');
      const result = await window.mailpilot.testSend(text, account, startTime, getCurrentUserId());
      if (!result?.ok) {
        if (result?.stopped) {
          if (testConsole) {
            testConsole.textContent = '测试发送已停止';
          }
          return;
        }
        const details = [result?.error, result?.stderr, result?.stdout].filter(Boolean);
        if (testConsole) {
          testConsole.textContent = details.length > 0 ? details.join('\n\n') : '测试发送失败';
        }
        return;
      }
      if (testConsole) {
        const details = [result.stdout, result.stderr].filter(Boolean);
        testConsole.textContent = details.length > 0 ? details.join('\n\n') : '测试发送完成';
      }
    } finally {
      testSendRunning = false;
      updateTestSendControls();
    }
  },
  'stop-test': async () => {
    if (!ensureAuth()) return;
    if (!testSendRunning) {
      if (testConsole) {
        testConsole.textContent = '当前没有正在进行的测试发送';
      }
      return;
    }
    const result = await window.mailpilot.stopTestSend();
    if (testConsole) {
      testConsole.textContent = result?.ok ? '测试发送停止中...' : '停止失败或无活动测试发送';
    }
  },
  'export-report': async () => {
    if (!ensureAuth()) return;
    const result = await window.mailpilot.exportReport();
    if (!result?.ok) {
      alert(`导出失败：${result?.error || '未知错误'}`);
      return;
    }
    alert(`报告已导出：${result.path}`);
  },
  'choose-storage': async () => {
    if (!window.mailpilot?.selectStorageDir) return;
    const result = await window.mailpilot.selectStorageDir();
    if (!result?.ok) return;
    renderStorageInfo(result);
    refreshAll();
  },
  'toggle-collapse': (event) => {
    const btn = event.currentTarget;
    const targetId = btn?.dataset?.target;
    if (!targetId) return;
    const body = document.getElementById(targetId);
    if (!body) return;
    const panel = body.closest('.panel');
    if (!panel) return;
    const collapsed = panel.classList.toggle('is-collapsed');
    btn.textContent = collapsed ? '展开' : '收起';
  },
  'feedback-send': async () => {
    if (!ensureAuth()) return;
    const account = feedbackAccountSelect ? feedbackAccountSelect.value : '';
    const toEmail = '';
    const subject = feedbackSubjectInput ? feedbackSubjectInput.value.trim() : '';
    const message = feedbackMessageInput ? feedbackMessageInput.value.trim() : '';
    if (!account) {
      alert('请先选择发件账号');
      return;
    }
    if (!message) {
      alert('请填写反馈内容');
      return;
    }
    if (feedbackConsole) {
      feedbackConsole.textContent = '发送中...';
    }
    const result = await window.mailpilot.sendFeedback({
      account,
      to: toEmail,
      subject,
      message,
    });
    if (!result?.ok) {
      const details = [result?.error, result?.stderr, result?.stdout].filter(Boolean);
      if (feedbackConsole) {
        feedbackConsole.textContent = details.length ? details.join('\n\n') : '发送失败';
      }
      return;
    }
    if (feedbackConsole) {
      feedbackConsole.textContent = result.stdout || '反馈已发送';
    }
    if (feedbackMessageInput) {
      feedbackMessageInput.value = '';
    }
  },
  'open-announcements': async () => {
    if (!announcementModal || !announcementList) return;
    announcementList.innerHTML = '';
    const result = await window.mailpilot.listAnnouncements();
    if (!result?.ok) {
      const item = document.createElement('div');
      item.className = 'announcement-item';
      item.textContent = result?.error || '无法获取公告';
      announcementList.appendChild(item);
    } else {
      const items = result.data?.items || [];
      const latestItems = items.length > 0 ? [items[0]] : [];
      if (latestItems.length === 0) {
        const item = document.createElement('div');
        item.className = 'announcement-item';
        item.textContent = '暂无公告';
        announcementList.appendChild(item);
      } else {
        latestItems.forEach((entry) => {
          const card = document.createElement('div');
          card.className = 'announcement-item';
          card.innerHTML = `
            <div>${entry.content || ''}</div>
            <div class="time">${entry.updated_at || ''}</div>
          `;
          announcementList.appendChild(card);
        });
      }
    }
    announcementModal.classList.remove('is-hidden');
  },
  'close-announcements': () => {
    if (announcementModal) {
      announcementModal.classList.add('is-hidden');
    }
  },
  'window-minimize': async () => {
    if (window.mailpilot?.windowMinimize) {
      await window.mailpilot.windowMinimize();
    }
  },
  'window-maximize': async () => {
    if (window.mailpilot?.windowMaximize) {
      await window.mailpilot.windowMaximize();
    }
  },
  'window-close': async () => {
    if (window.mailpilot?.windowClose) {
      await window.mailpilot.windowClose();
    }
  },
  'execute-send': async () => {
    if (!ensureAuth()) return;
    if (!(await ensureCanSendOrPrompt())) return;
    sendStopRequested = false;
    if (sendStatus) sendStatus.textContent = '发送中...';
    ensureSendRefreshTimer(true);

    const selectable = getSendSelectableAccounts();
    ensureSendSelection(selectable);
    const selected = Array.from(selectedSendAccounts);
    const running = runningSendAccounts;
    const toStart = selected.filter((email) => !running.has(String(email).toLowerCase()));

    if (toStart.length === 0) {
      if (sendStatus) {
        const hasOnlyGmailApi = selectable.length === 0
          && currentAccounts.some((acc) => normalizeSendChannel(acc.send_channel, acc.email) === 'gmail_api');
        sendStatus.textContent = hasOnlyGmailApi
          ? '当前仅有 Gmail API 账号（SMTP 发送未选择）'
          : (selected.length > 0 ? '所选账号正在发送中' : '请先选择账号');
      }
      ensureSendRefreshTimer(runningSendAccounts.size > 0);
      updateSendControls(lastDashboard);
      return;
    }

    let result = { ok: true };
    for (const email of toStart) {
      if (sendStopRequested) {
        result = { ok: false, stopped: true };
        break;
      }
      const started = await window.mailpilot.startSend(email, getCurrentUserId());
      if (started?.ok || started?.running) {
        runningSendAccounts.add(String(email).toLowerCase());
      }
    }

    if (sendStatus) {
      sendStatus.textContent = result?.stopped
        ? '已停止'
        : (result.ok ? '发送完成' : '发送失败');
    }
    refreshAll();
    updateSendControls(lastDashboard);
  },
  'stop-send': async () => {
    if (!ensureAuth()) return;
    sendStopRequested = true;
    if (sendStatus) sendStatus.textContent = '正在停止...';
    try {
      await window.mailpilot.stopSend();
    } catch (err) {
      // ignore
    }
    runningSendAccounts = new Set();
    ensureSendRefreshTimer(false);
    if (sendStatus) sendStatus.textContent = '已停止';
    setSendRunning(false);
    refreshAll();
  },
  'toggle-pin': async () => {
    const result = await window.mailpilot.toggleAlwaysOnTop();
    if (!result?.ok) return;
    const btn = document.querySelector('[data-action="toggle-pin"]');
    if (btn) {
      btn.textContent = result.value ? '📌' : '📍';
      btn.title = result.value ? '取消置顶' : '置顶窗口';
      btn.classList.toggle('is-active', result.value);
    }
  },
  'select-visible-teachers': () => {
    if (!ensureAuth()) return;
    const visibleEmails = Array.from(new Set(
      (lastRenderedTeachers || [])
        .map((teacher) => String(teacher?.email || '').trim())
        .filter(Boolean),
    ));
    if (visibleEmails.length === 0) {
      showToast('当前筛选结果为空，无可选导师');
      return;
    }
    selectedTeacherEmails = new Set(visibleEmails);
    lastTeacherIndex = null;
    syncTeacherSelectionUi();
    showToast(`已全选当前筛选结果：${visibleEmails.length} 条`);
  },
  'delete-selected': async () => {
    if (!ensureAuth()) return;
    if (!selectedTeacherEmails || selectedTeacherEmails.size === 0) {
      alert('请先选择要删除的导师');
      return;
    }
    const ok = window.confirm(`确认删除选中的 ${selectedTeacherEmails.size} 位导师吗？`);
    if (!ok) return;
    const result = await window.mailpilot.deleteTeachers(Array.from(selectedTeacherEmails));
    if (!result?.ok) {
      alert(`删除失败：${result?.error || '未知错误'}`);
      return;
    }
    selectedTeacherEmails.clear();
    lastTeacherIndex = null;
    refreshAll();
  },
};

function handleImportResult(result) {
  if (!importConsole) return;
  if (!result.ok) {
    const details = [result.error, result.stderr, result.stdout].filter(Boolean);
    importConsole.textContent = details.length > 0 ? details.join('\n\n') : '导入失败';
    previewWrite.textContent = '失败';
    return;
  }
  previewAdded.textContent = result.added ?? '-';
  previewUpdated.textContent = result.updated ?? '-';
  previewConflicts.textContent = result.conflicts ?? '-';
  previewWrite.textContent = '已写入';
  importConsole.textContent = result.stdout || '导入完成';
  refreshAll();
}

Object.keys(actions).forEach((key) => {
  document.querySelectorAll(`[data-action="${key}"]`).forEach((btn) => {
    btn.addEventListener('click', actions[key]);
  });
});

document.addEventListener('click', (event) => {
  const target = event.target;
  if (target && target.matches && target.matches('input[type="datetime-local"]')) {
    if (typeof target.showPicker === 'function') {
      target.showPicker();
    }
  }
});

teacherFilters.forEach((btn) => {
  btn.addEventListener('click', () => {
    teacherFilters.forEach((item) => item.classList.remove('is-active'));
    btn.classList.add('is-active');
    teacherFilter = btn.dataset.filter || 'all';
    refreshAll();
  });
});

logFilters.forEach((btn) => {
  btn.addEventListener('click', () => {
    logFilters.forEach((item) => item.classList.remove('is-active'));
    btn.classList.add('is-active');
    logFilter = btn.dataset.logFilter || 'all';
    refreshAll();
  });
});

if (accountFilterSelect) {
  accountFilterSelect.addEventListener('change', () => {
    accountFilter = accountFilterSelect.value || 'all';
    refreshAll();
  });
}

if (accountSelect) {
  accountSelect.addEventListener('change', () => {
    syncBaseTimeInputs();
  });
}

if (accountSelectPaste) {
  accountSelectPaste.addEventListener('change', () => {
    syncBaseTimeInputs();
  });
}

if (sendAccountSelect) {
  sendAccountSelect.addEventListener('change', () => {
    updateSendInfo(lastDashboard);
  });
}

if (sendAllToggle) {
  sendAllToggle.addEventListener('change', () => {
    sendSelectionTouched = true;
    const selectable = getSendSelectableAccounts();
    if (sendAllToggle.checked) {
      selectedSendAccounts = new Set(selectable.map((acc) => acc.email));
    } else {
      selectedSendAccounts = new Set(
        selectable
          .filter((acc) => runningSendAccounts.has(acc.email.toLowerCase()))
          .map((acc) => acc.email),
      );
    }
    renderSendAccountList();
    updateSendInfo(lastDashboard);
    updateSendControls(lastDashboard);
  });
}

if (sendAccountList) {
  sendAccountList.addEventListener('change', (event) => {
    const checkbox = event.target.closest('input[data-send-account]');
    if (!checkbox) return;
    sendSelectionTouched = true;
    const email = checkbox.value;
    if (checkbox.checked) {
      selectedSendAccounts.add(email);
    } else {
      selectedSendAccounts.delete(email);
    }
    updateSendInfo(lastDashboard);
    updateSendSelectionMeta(getSendSelectableAccounts());
    updateSendControls(lastDashboard);
  });
}

if (sendProgressList) {
  sendProgressList.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-action="stop-send-account"]');
    if (!btn) return;
    const email = btn.getAttribute('data-email');
    if (!email) return;
    btn.disabled = true;
    try {
      await window.mailpilot.stopSend(email);
    } catch (err) {
      // ignore
    }
    runningSendAccounts.delete(String(email).toLowerCase());
    refreshAll();
  });
}

if (teacherTable) {
  const applyTeacherSelection = (index, email, checked, shiftKey) => {
    if (shiftKey && lastTeacherIndex !== null) {
      const start = Math.min(lastTeacherIndex, index);
      const end = Math.max(lastTeacherIndex, index);
      const boxes = teacherTable.querySelectorAll('input[data-teacher-check]');
      for (let i = start; i <= end; i += 1) {
        const box = boxes[i];
        if (!box) continue;
        box.checked = checked;
        const rowEmail = box.dataset.email;
        if (checked) {
          selectedTeacherEmails.add(rowEmail);
          box.closest('.table-row')?.classList.add('is-selected');
        } else {
          selectedTeacherEmails.delete(rowEmail);
          box.closest('.table-row')?.classList.remove('is-selected');
        }
      }
    } else if (checked) {
      selectedTeacherEmails.add(email);
      teacherTable
        .querySelector(`input[data-teacher-check][data-index="${index}"]`)
        ?.closest('.table-row')
        ?.classList.add('is-selected');
    } else {
      selectedTeacherEmails.delete(email);
      teacherTable
        .querySelector(`input[data-teacher-check][data-index="${index}"]`)
        ?.closest('.table-row')
        ?.classList.remove('is-selected');
    }
    lastTeacherIndex = index;
  };

  teacherTable.addEventListener('click', (event) => {
    const row = event.target.closest('.table-row');
    if (!row) return;
    const targetCheckbox = event.target.closest('input[data-teacher-check]');
    const checkbox = targetCheckbox || row.querySelector('input[data-teacher-check]');
    if (!checkbox) return;
    if (!targetCheckbox) {
      checkbox.checked = !checkbox.checked;
    }
    const index = Number(checkbox.dataset.index);
    const email = checkbox.dataset.email;
    const checked = checkbox.checked;
    if (Number.isNaN(index) || !email) return;
    applyTeacherSelection(index, email, checked, event.shiftKey);
  });
}

if (announcementModal) {
  announcementModal.addEventListener('click', (event) => {
    if (event.target === announcementModal) {
      announcementModal.classList.add('is-hidden');
    }
  });
}

if (authcodeHelpModal) {
  authcodeHelpModal.addEventListener('click', (event) => {
    if (event.target === authcodeHelpModal) {
      authcodeHelpModal.classList.add('is-hidden');
    }
    const closeBtn = event.target.closest('[data-action="close-authcode-help"]');
    if (closeBtn) {
      authcodeHelpModal.classList.add('is-hidden');
    }
  });
}

if (gmailCredentialsHelpModal) {
  gmailCredentialsHelpModal.addEventListener('click', (event) => {
    if (event.target === gmailCredentialsHelpModal) {
      gmailCredentialsHelpModal.classList.add('is-hidden');
    }
    const closeBtn = event.target.closest('[data-action="close-gmail-credentials-help"]');
    if (closeBtn) {
      gmailCredentialsHelpModal.classList.add('is-hidden');
    }
  });
}

if (authTermsModal) {
  authTermsModal.addEventListener('click', (event) => {
    if (event.target === authTermsModal) {
      authTermsModal.classList.add('is-hidden');
    }
    const closeBtn = event.target.closest('[data-action="close-auth-terms"]');
    if (closeBtn) {
      authTermsModal.classList.add('is-hidden');
    }
  });
}

if (versionCheckModal) {
  versionCheckModal.addEventListener('click', (event) => {
    const retryBtn = event.target.closest('[data-action="retry-version-check"]');
    if (retryBtn) {
      void (async () => {
        retryBtn.disabled = true;
        try {
          const ok = await runStartupVersionCheck();
          if (ok) {
            await continueStartupAfterVersionCheck();
          }
        } finally {
          retryBtn.disabled = false;
        }
      })();
      return;
    }

    const downloadBtn = event.target.closest('[data-action="download-latest-version"]');
    if (downloadBtn) {
      void openVersionDownload(downloadBtn.dataset.url || '');
      return;
    }

    const exitBtn = event.target.closest('[data-action="exit-version-check"]');
    if (exitBtn) {
      if (window.mailpilot?.windowClose) {
        void window.mailpilot.windowClose();
      }
    }
  });
}

if (resetPasswordModal) {
  resetPasswordModal.addEventListener('click', (event) => {
    if (event.target === resetPasswordModal) {
      closeResetPasswordModal();
      return;
    }
    const closeBtn = event.target.closest('[data-action="close-reset-password"]');
    if (closeBtn) {
      closeResetPasswordModal();
    }
  });
}

if (pasteTable) {
  buildPasteGridRows();
  const pasteSelection = { anchor: null, selecting: false };
  pasteTable.addEventListener('mousedown', (event) => {
    const cell = event.target?.closest?.('td[data-col]');
    exitGridEditing(pasteTableBody, cell);
    if (!cell) return;
    if (cell.dataset.editing === '1') return;
    event.preventDefault();
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    if (Number.isNaN(row) || Number.isNaN(col)) return;
    lastGridFocus = { mode: 'paste', cell };
    const anchor = event.shiftKey && pasteSelection.anchor ? pasteSelection.anchor : { row, col };
    pasteSelection.anchor = anchor;
    pasteSelection.selecting = true;
    applyGridSelection('paste', anchor, { row, col });
  });
  pasteTable.addEventListener('mouseover', (event) => {
    if (!pasteSelection.selecting) return;
    const cell = event.target?.closest?.('td[data-col]');
    if (!cell) return;
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    if (Number.isNaN(row) || Number.isNaN(col)) return;
    lastGridFocus = { mode: 'paste', cell };
    applyGridSelection('paste', pasteSelection.anchor, { row, col });
  });
  pasteTable.addEventListener('mouseup', () => {
    pasteSelection.selecting = false;
  });
  const pasteClickState = { cell: null, time: 0 };
  pasteTable.addEventListener('click', (event) => {
    const cell = event.target?.closest?.('td[data-col]');
    if (!cell || cell.dataset.editing === '1') return;
    const selected = getSelectedCells('paste');
    if (selected.length > 1) return;
    const now = Date.now();
    const sameCell = pasteClickState.cell === cell && now - pasteClickState.time < 350;
    pasteClickState.cell = cell;
    pasteClickState.time = now;
    if (sameCell) {
      enableCellEdit(cell);
    }
  });
  pasteTable.addEventListener('dblclick', (event) => {
    const cell = event.target?.closest?.('td[data-col]');
    if (!cell) return;
    event.preventDefault();
    event.stopPropagation();
    exitGridEditing(pasteTableBody, cell);
    lastGridFocus = { mode: 'paste', cell };
    enableCellEdit(cell);
    placeCursorAtEnd(cell);
  });
  pasteTable.addEventListener('input', (event) => {
    const cell = event.target?.closest?.('td[data-col]');
    if (!cell || cell.dataset.editing !== '1') return;
    if (!cell.dataset.undoCaptured) {
      pushGridUndo('paste');
      cell.dataset.undoCaptured = '1';
    }
    ensureTrailingEmptyRow('paste', 4);
  });
  pasteTable.addEventListener('blur', (event) => {
    const cell = event.target?.closest?.('td[data-col]');
    if (!cell) return;
    if (cell.dataset.editing === '1') {
      disableCellEdit(cell);
      ensureTrailingEmptyRow('paste', 4);
    }
  }, true);
  pasteTable.addEventListener('keydown', (event) => {
    const cell = event.target?.closest?.('td[data-col]');
    if (!cell || cell.dataset.editing !== '1') return;
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      disableCellEdit(cell);
      cell.blur();
      ensureTrailingEmptyRow('paste', 4);
    }
  });
  pasteTable.addEventListener('paste', (event) => {
    void handleGridPaste(event, 'paste');
  });
}

if (testTable) {
  buildTestGridRows();
  const testSelection = { anchor: null, selecting: false };
  const cached = localStorage.getItem(TEST_LIST_KEY);
  if (cached) {
    const rows = parsePastedText(cached);
    if (rows.length > 0) {
      fillTestGrid(rows);
    }
  }
  testTable.addEventListener('mousedown', (event) => {
    const cell = event.target?.closest?.('td[data-col]');
    exitGridEditing(testTableBody, cell);
    if (!cell) return;
    if (cell.dataset.editing === '1') return;
    event.preventDefault();
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    if (Number.isNaN(row) || Number.isNaN(col)) return;
    lastGridFocus = { mode: 'test', cell };
    const anchor = event.shiftKey && testSelection.anchor ? testSelection.anchor : { row, col };
    testSelection.anchor = anchor;
    testSelection.selecting = true;
    applyGridSelection('test', anchor, { row, col });
  });
  testTable.addEventListener('mouseover', (event) => {
    if (!testSelection.selecting) return;
    const cell = event.target?.closest?.('td[data-col]');
    if (!cell) return;
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    if (Number.isNaN(row) || Number.isNaN(col)) return;
    lastGridFocus = { mode: 'test', cell };
    applyGridSelection('test', testSelection.anchor, { row, col });
  });
  testTable.addEventListener('mouseup', () => {
    testSelection.selecting = false;
  });
  const testClickState = { cell: null, time: 0 };
  testTable.addEventListener('click', (event) => {
    const cell = event.target?.closest?.('td[data-col]');
    if (!cell || cell.dataset.editing === '1') return;
    const selected = getSelectedCells('test');
    if (selected.length > 1) return;
    const now = Date.now();
    const sameCell = testClickState.cell === cell && now - testClickState.time < 350;
    testClickState.cell = cell;
    testClickState.time = now;
    if (sameCell) {
      enableCellEdit(cell);
    }
  });
  testTable.addEventListener('dblclick', (event) => {
    const cell = event.target?.closest?.('td[data-col]');
    if (!cell) return;
    event.preventDefault();
    event.stopPropagation();
    exitGridEditing(testTableBody, cell);
    lastGridFocus = { mode: 'test', cell };
    enableCellEdit(cell);
    placeCursorAtEnd(cell);
  });
  testTable.addEventListener('input', (event) => {
    const cell = event.target?.closest?.('td[data-col]');
    if (!cell || cell.dataset.editing !== '1') return;
    if (!cell.dataset.undoCaptured) {
      pushGridUndo('test');
      cell.dataset.undoCaptured = '1';
    }
    ensureTrailingEmptyRow('test', 4);
  });
  testTable.addEventListener('blur', (event) => {
    const cell = event.target?.closest?.('td[data-col]');
    if (!cell) return;
    if (cell.dataset.editing === '1') {
      disableCellEdit(cell);
      ensureTrailingEmptyRow('test', 4);
    }
  }, true);
  testTable.addEventListener('keydown', (event) => {
    const cell = event.target?.closest?.('td[data-col]');
    if (!cell || cell.dataset.editing !== '1') return;
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      disableCellEdit(cell);
      cell.blur();
      ensureTrailingEmptyRow('test', 4);
    }
  });
  testTable.addEventListener('paste', (event) => {
    void handleGridPaste(event, 'test');
  });
}

document.addEventListener('paste', async (event) => {
  if (event.defaultPrevented) return;
  const active = document.activeElement;
  const activeTag = active?.tagName || '';
  const inInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';
  const inPasteGrid = pasteTable && active && pasteTable.contains(active);
  const inTestGrid = testTable && active && testTable.contains(active);
  if (inInput && !inPasteGrid && !inTestGrid) return;

  const importView = document.getElementById('view-import');
  const testView = document.getElementById('view-test');
  const importVisible = importView?.classList.contains('is-visible');
  const testVisible = testView?.classList.contains('is-visible');

  if (!inPasteGrid && !inTestGrid && !importVisible && !testVisible) return;

  if (inTestGrid || (!inPasteGrid && testVisible)) {
    await handleGridPaste(event, 'test');
    return;
  }
  if (inPasteGrid || importVisible) {
    await handleGridPaste(event, 'paste');
  }
});

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    const active = document.activeElement;
    const inPasteGrid = pasteTable && active && pasteTable.contains(active);
    const inTestGrid = testTable && active && testTable.contains(active);

    const importView = document.getElementById('view-import');
    const testView = document.getElementById('view-test');
    const importVisible = importView?.classList.contains('is-visible');
    const testVisible = testView?.classList.contains('is-visible');
    const mode = testVisible ? 'test' : 'paste';

    if (inPasteGrid || inTestGrid || importVisible || testVisible) {
      const undone = undoGrid(mode);
      if (undone) {
        event.preventDefault();
        return;
      }
    }
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x') {
    const active = document.activeElement;
    const inPasteGrid = pasteTable && active && pasteTable.contains(active);
    const inTestGrid = testTable && active && testTable.contains(active);

    const importView = document.getElementById('view-import');
    const testView = document.getElementById('view-test');
    const importVisible = importView?.classList.contains('is-visible');
    const testVisible = testView?.classList.contains('is-visible');
    const mode = testVisible ? 'test' : 'paste';

    if (inPasteGrid || inTestGrid || importVisible || testVisible) {
      const copied = copyGridSelection(mode);
      if (copied) {
        pushGridUndo(mode);
        const selected = getSelectedCells(mode);
        selected.forEach((cell) => {
          cell.textContent = '';
        });
        normalizeGridRows(mode, 4);
        ensureTrailingEmptyRow(mode, 4);
        event.preventDefault();
        return;
      }
    }
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) {
    const active = document.activeElement;
    if (!active || !active.isContentEditable) {
      const importView = document.getElementById('view-import');
      const testView = document.getElementById('view-test');
      const importVisible = importView?.classList.contains('is-visible');
      const testVisible = testView?.classList.contains('is-visible');
      const mode = testVisible ? 'test' : 'paste';
      if ((importVisible || testVisible) && (mode === 'paste' || mode === 'test')) {
        const cell = getLastSelectedCell(mode);
        if (cell) {
          event.preventDefault();
          focusCellForInput(cell, event.key);
          return;
        }
      }
    }
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
    const active = document.activeElement;
    const inPasteGrid = pasteTable && active && pasteTable.contains(active);
    const inTestGrid = testTable && active && testTable.contains(active);

    const importView = document.getElementById('view-import');
    const testView = document.getElementById('view-test');
    const importVisible = importView?.classList.contains('is-visible');
    const testVisible = testView?.classList.contains('is-visible');

    if (inPasteGrid || importVisible) {
      const copied = copyGridSelection('paste');
      if (copied) {
        event.preventDefault();
        return;
      }
    }
    if (inTestGrid || testVisible) {
      const copied = copyGridSelection('test');
      if (copied) {
        event.preventDefault();
        return;
      }
    }
  }
  if (event.key !== 'Delete' && event.key !== 'Backspace') return;
  const active = document.activeElement;
  const activeTag = active?.tagName || '';
  if (active?.isContentEditable) return;
  if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;

  const importView = document.getElementById('view-import');
  const testView = document.getElementById('view-test');
  const importVisible = importView?.classList.contains('is-visible');
  const testVisible = testView?.classList.contains('is-visible');
  const mode = testVisible ? 'test' : 'paste';
  if (!importVisible && !testVisible) return;

  const selected = getSelectedCells(mode);
  if (selected.length === 0) return;
  pushGridUndo(mode);
  event.preventDefault();
  selected.forEach((cell) => {
    cell.textContent = '';
  });
  normalizeGridRows(mode, 4);
  ensureTrailingEmptyRow(mode, 4);
});

if (fileInput) {
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      const path = fileInput.files[0].path || '';
      selectedFilePath = isAbsolutePath(path) ? path : '';
      if (fileHint) {
        fileHint.textContent = selectedFilePath || fileInput.files[0].name;
      }
    }
  });
}

if (dropzone) {
  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  });
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    void handleDroppedFiles(event.dataTransfer?.files);
  });
}

if (fileInput) {
  fileInput.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  });
  fileInput.addEventListener('drop', (event) => {
    event.preventDefault();
    void handleDroppedFiles(event.dataTransfer?.files);
  });
}

window.addEventListener('dragover', (event) => {
  event.preventDefault();
});

window.addEventListener('drop', (event) => {
  event.preventDefault();
});

if (accountList) {
  accountList.addEventListener('click', async (event) => {
    const actionEl = event.target.closest('[data-account-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.accountAction;
    const index = Number(actionEl.dataset.index);
    if (Number.isNaN(index)) return;

    if (action === 'remove') {
      const ok = window.confirm('确认删除该账号？');
      if (!ok) return;
      currentAccounts = currentAccounts.filter((_, idx) => idx !== index);
      renderAccountList();
      renderAccountSelects();
      renderAccountCards();
      markAccountsDirty();
      return;
    }

    if (action === 'help-authcode') {
      if (authcodeHelpModal) {
        authcodeHelpModal.classList.remove('is-hidden');
      }
      return;
    }

    if (action === 'clear-start-time') {
      const row = accountList.querySelector(`.account-row[data-index="${index}"]`);
      const input = row ? row.querySelector('[data-field="start_time_bj"]') : null;
      const nowText = getNowDateTimeString();
      if (input) {
        input.value = toDateTimeLocalValue(nowText);
      }
      updateAccountField(index, 'start_time_bj', nowText);
      markAccountsDirty();
      return;
    }

    if (action === 'add-attachments') {
      const paths = await window.mailpilot.selectAttachments();
      if (!paths || paths.length === 0) return;
      const row = accountList.querySelector(`.account-row[data-index="${index}"]`);
      const textarea = row?.querySelector('[data-field="attachments"]');
      if (!textarea) return;
      const existing = normalizeAttachments(textarea.value);
      const merged = Array.from(new Set([...existing, ...paths]));
      textarea.value = merged.join('\n');
      updateAccountField(index, 'attachments', textarea.value);
      markAccountsDirty();
      return;
    }

    if (action === 'show-gmail-credentials-help') {
      if (gmailCredentialsHelpModal) {
        gmailCredentialsHelpModal.classList.remove('is-hidden');
      }
      return;
    }

    if (action === 'upload-gmail-credentials') {
      const uploader = window.mailpilot?.setGmailCredentials || window.mailpilot?.setGmailClientSecret;
      if (!uploader) {
        alert('当前版本不支持上传 credentials.json，请重启应用后再试。');
        return;
      }
      const result = await uploader();
      if (result?.canceled) return;
      if (!result?.ok) {
        alert(`上传失败：${result?.error || '未知错误'}`);
        return;
      }
      gmailCredentialsUploaded = true;
      applyGmailCredentialsStatusToRows();
      showToast('credentials.json 上传成功');
      return;
    }

    if (action === 'bind-gmail') {
      syncAccountsFromForm();
      const account = currentAccounts[index];
      if (!account) return;
      if (!isGmailAddress(account.email || '')) {
        alert('仅 gmail.com / googlemail.com 账号可绑定 Gmail API。');
        return;
      }
      const checker = window.mailpilot?.getGmailCredentialsStatus || window.mailpilot?.getGmailClientSecretStatus;
      if (checker) {
        const status = await checker();
        if (!status?.exists) {
          alert('未检测到 credentials.json，请先点击“上传 credentials.json”。');
          return;
        }
      }
      showToast('正在打开 Google 授权页面...');
      const result = await window.mailpilot.gmailOauthBind(account.email);
      if (!result?.ok) {
        alert(`Gmail 绑定失败：${result?.error || result?.stderr || '未知错误'}`);
        return;
      }
      updateAccountField(index, 'gmail_oauth_bound', true);
      updateAccountRowField(index, 'gmail_oauth_bound', '1');
      updateAccountField(index, 'send_channel', 'gmail_api');
      updateAccountRowField(index, 'send_channel', 'gmail_api');
      applyChannelVisibility(index, 'gmail_api');
      markAccountsDirty();
      await autoSaveAccounts(true);
      showToast('Gmail OAuth 绑定成功');
      renderAccountSelects();
      renderAccountCards();
      renderSendAccountList();
      return;
    }

    if (action === 'unbind-gmail') {
      syncAccountsFromForm();
      const account = currentAccounts[index];
      if (!account) return;
      if (!isGmailAddress(account.email || '')) {
        alert('该账号不是 Gmail，无需解绑。');
        return;
      }
      const ok = window.confirm(`确认解绑 ${account.email} 的 Gmail OAuth 吗？`);
      if (!ok) return;
      const result = await window.mailpilot.gmailOauthUnbind(account.email);
      if (!result?.ok) {
        alert(`Gmail 解绑失败：${result?.error || result?.stderr || '未知错误'}`);
        return;
      }
      updateAccountField(index, 'gmail_oauth_bound', false);
      updateAccountRowField(index, 'gmail_oauth_bound', '0');
      markAccountsDirty();
      await autoSaveAccounts(true);
      showToast('Gmail OAuth 已解绑');
      return;
    }

    if (action === 'test-smtp') {
      syncAccountsFromForm();
      const account = currentAccounts[index];
      if (!account) return;
      if (!isSmtpAccount(account)) {
        alert('Gmail API 模式无需测试 SMTP。');
        return;
      }
      const result = await window.mailpilot.testSmtp(account);
      if (result.ok) {
        const output = [result.stdout || '', result.stderr || ''].join(' ');
        const portMatch = output.match(/PORT=(\d{2,5})/i);
        const modeMatch = output.match(/MODE=([a-zA-Z]+)/i);
        const routeMatch = output.match(/ROUTE=([a-zA-Z_-]+)/i);
        const routeText = routeMatch ? `，路由 ${routeMatch[1]}` : '';
        if (portMatch) {
          const detectedPort = Number(portMatch[1]);
          const modeText = modeMatch ? ` (${modeMatch[1]})` : '';
          if (Number.isFinite(detectedPort) && account.smtp_port !== detectedPort) {
            account.smtp_port = detectedPort;
            const row = accountList.querySelector(`.account-row[data-index="${index}"]`);
            const portInput = row?.querySelector('[data-field="smtp_port"]');
            if (portInput) {
              portInput.value = String(detectedPort);
            }
            markAccountsDirty();
            await autoSaveAccounts(true);
            alert(`OK：测试成功！已自动切换为端口 ${detectedPort}${modeText}${routeText}`);
          } else {
            alert(`OK：测试成功！当前使用端口 ${detectedPort}${modeText}${routeText}`);
          }
        } else {
          alert(`OK：测试成功！${routeText}`.trim());
        }
      } else {
        const message = result.stderr || result.stdout || 'SMTP 登录失败';
        alert(`SMTP 登录失败：${message}`);
      }
      return;
    }

    if (action === 'toggle-password') {
      const row = accountList.querySelector(`.account-row[data-index="${index}"]`);
      const input = row?.querySelector('[data-field="password"]');
      const btn = actionEl;
      if (!input) return;
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      if (btn) {
        btn.setAttribute('aria-label', isHidden ? '隐藏授权码' : '显示授权码');
        btn.textContent = isHidden ? '🙈' : '👁';
      }
    }

    if (action === 'clear-attachments') {
      const row = accountList.querySelector(`.account-row[data-index="${index}"]`);
      const textarea = row?.querySelector('[data-field="attachments"]');
      if (textarea) textarea.value = '';
      updateAccountField(index, 'attachments', '');
      markAccountsDirty();
    }
  });

  accountList.addEventListener('input', (event) => {
    const target = event.target;
    if (!target || !target.dataset || !target.dataset.field) return;
    if (target.dataset.field === 'min_delay' || target.dataset.field === 'max_delay') {
      const index = Number(target.dataset.index);
      if (!Number.isNaN(index)) {
        clearAccountFieldHint(index, 'max_delay');
      }
    }
    markAccountsDirty();
  });

  accountList.addEventListener('change', (event) => {
    const target = event.target;
    if (!target || !target.dataset || !target.dataset.field) return;
    const field = target.dataset.field;
    const index = Number(target.dataset.index);
    if (Number.isNaN(index)) return;
    updateAccountField(index, field, target.value);
    markAccountsDirty();
    if (field === 'min_delay' || field === 'max_delay') {
      clearAccountFieldHint(index, 'max_delay');
    }
    if (field === 'email' || field === 'name') {
      const row = target.closest('.account-row');
      if (row) {
        if (field === 'email') {
          const emailLabel = row.querySelector('.email');
          if (emailLabel) emailLabel.textContent = target.value.trim() || '未填写邮箱';
        }
        if (field === 'name') {
          const metaLabel = row.querySelector('.meta');
          if (metaLabel) metaLabel.textContent = target.value.trim() || '未设置发件人';
        }
      }
      renderAccountSelects();
      renderAccountCards();
    }
    if (field === 'send_channel') {
      applyChannelVisibility(index, target.value);
      renderAccountSelects();
      renderAccountCards();
      renderSendAccountList();
    }
    if (field === 'subject' || field === 'content' || field === 'attachments') {
      const selectedEmail = composeAccountSelect ? composeAccountSelect.value : '';
      if (selectedEmail && currentAccounts[index] && currentAccounts[index].email === selectedEmail) {
        renderComposeEditor();
      }
    }
  });
}

if (composeAccountSelect) {
  composeAccountSelect.addEventListener('change', () => {
    renderComposeEditor();
  });
}

if (composeTemplateSelect) {
  composeTemplateSelect.addEventListener('change', () => {
    if (!composeTemplateNameInput) return;
    const selected = String(composeTemplateSelect.value || '').trim();
    if (selected) {
      composeTemplateNameInput.value = selected;
    }
  });
}

if (testAccountSelect) {
  testAccountSelect.addEventListener('change', () => {
    applyDefaultTestStartTime(true);
  });
}

if (accountViewFilterToggle && accountViewFilterMenu) {
  accountViewFilterToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    renderAccountViewFilter();
    accountViewFilterMenu.classList.toggle('is-hidden');
  });
}

if (accountViewFilterAll) {
  accountViewFilterAll.addEventListener('change', () => {
    accountViewFilterInitialized = true;
    const items = getAccountViewFilterItems();
    if (accountViewFilterAll.checked) {
      selectedAccountViewEmails = new Set(items.map((item) => item.key));
    } else {
      selectedAccountViewEmails = new Set();
    }
    renderAccountList();
    syncScopedAccountSelectors();
  });
}

if (accountViewFilterOptions) {
  accountViewFilterOptions.addEventListener('change', (event) => {
    const target = event.target;
    if (!target || !(target instanceof HTMLInputElement)) return;
    if (!target.matches('input[data-email-key]')) return;
    accountViewFilterInitialized = true;
    const key = String(target.dataset.emailKey || '').trim().toLowerCase();
    if (!key) return;
    if (target.checked) {
      selectedAccountViewEmails.add(key);
    } else {
      selectedAccountViewEmails.delete(key);
    }
    renderAccountList();
    syncScopedAccountSelectors();
  });
}

document.addEventListener('click', (event) => {
  if (!accountViewFilterMenu || !accountViewFilter) return;
  if (accountViewFilterMenu.classList.contains('is-hidden')) return;
  if (accountViewFilter.contains(event.target)) return;
  accountViewFilterMenu.classList.add('is-hidden');
});

window.addEventListener('resize', () => {
  if (!hasAccess() || !accountCards) return;
  if (currentAccounts.length > 4) {
    renderAccountCards();
  }
});

if (composeSubjectInput) {
  const forceComposeFocus = (input) => {
    if (!input) return;
    input.removeAttribute('readonly');
    input.removeAttribute('disabled');
    input.focus();
    try {
      input.select();
    } catch (err) {
      // ignore
    }
  };
  composeSubjectInput.addEventListener('mousedown', () => {
    forceComposeFocus(composeSubjectInput);
  });
  composeSubjectInput.addEventListener('dblclick', (event) => {
    event.preventDefault();
    forceComposeFocus(composeSubjectInput);
  });
  composeSubjectInput.addEventListener('input', () => {
    syncComposeToAccount();
  });
}

if (composeContentInput) {
  composeContentInput.addEventListener('mousedown', () => {
    composeContentInput.focus();
  });
  composeContentInput.addEventListener('input', () => {
    syncComposeToAccount();
  });
}

if (composeAttachmentsInput) {
  composeAttachmentsInput.addEventListener('input', () => {
    syncComposeToAccount();
  });
}

if (composeAccountSelect) {
  composeAccountSelect.addEventListener('change', () => {
    renderComposeEditor();
  });
}

const authTabs = document.querySelectorAll('[data-auth-tab]');
const authForms = document.querySelectorAll('[data-auth-form]');

authTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    authTabs.forEach((t) => t.classList.remove('is-active'));
    tab.classList.add('is-active');
    const mode = tab.dataset.authTab;
    authForms.forEach((form) => {
      form.classList.toggle('is-active', form.dataset.authForm === mode);
    });
    setAuthMessage('');
  });
});

function setLoginCaptchaVisible(visible) {
  if (!loginCaptchaWrap) return;
  loginCaptchaWrap.classList.toggle('is-hidden', !visible);
}

function resetLoginCaptchaState() {
  loginCaptchaRequired = false;
  loginCaptchaChallengeId = '';
  if (loginCaptchaCodeInput) {
    loginCaptchaCodeInput.value = '';
  }
  setLoginCaptchaVisible(false);
}

function parseCaptchaErrorMessage(detail) {
  const text = String(detail || '');
  if (!text) return '图片验证码校验失败';
  if (text.startsWith('captcha_service_unavailable')) return '图形验证码服务不可用，请稍后重试';
  if (text === 'captcha_required') return '请先输入图片验证码';
  if (text === 'captcha_expired') return '图片验证码已过期，请刷新后重试';
  if (text === 'captcha_mismatch') return '验证码与手机号不匹配，请刷新后重试';
  if (text === 'captcha_invalid') return '图片验证码错误，请重试';
  return text;
}

async function loadLoginCaptcha(force = false) {
  if (!force && !loginCaptchaRequired) return true;
  if (loginCaptchaLoading) return false;
  loginCaptchaLoading = true;
  if (loginCaptchaRefreshBtn) {
    loginCaptchaRefreshBtn.disabled = true;
  }
  try {
    const phone = loginPhoneInput ? normalizePhoneInput(loginPhoneInput.value) : '';
    const query = phone ? `?phone=${encodeURIComponent(phone)}` : '';
    const { res, data, base } = await fetchAuthWithFallback(`/auth/captcha${query}`, {
      method: 'GET',
    });
    if (!res.ok) {
      throw new Error(data.detail || '加载图片验证码失败');
    }
    if (base && base !== API_BASE) {
      localStorage.setItem('apiBase', base);
    }
    loginCaptchaChallengeId = String(data.challenge_id || '').trim();
    if (!loginCaptchaChallengeId || !loginCaptchaImage) {
      throw new Error('图片验证码数据无效');
    }
    loginCaptchaImage.src = String(data.image || '');
    if (loginCaptchaCodeInput) {
      loginCaptchaCodeInput.value = '';
      loginCaptchaCodeInput.focus();
    }
    loginCaptchaRequired = true;
    setLoginCaptchaVisible(true);
    return true;
  } catch (err) {
    setAuthMessage(`获取图片验证码失败：${String(err?.message || err)}`);
    return false;
  } finally {
    loginCaptchaLoading = false;
    if (loginCaptchaRefreshBtn) {
      loginCaptchaRefreshBtn.disabled = false;
    }
  }
}

function normalizePhoneInput(value) {
  const input = String(value || '').trim().replace(/[\s-]+/g, '');
  if (input.startsWith('+86')) return input.slice(3);
  if (input.startsWith('86') && input.length === 13) return input.slice(2);
  return input;
}

function isValidPhone(value) {
  return PHONE_REGEX.test(normalizePhoneInput(value));
}

async function loginWithCredentials(phoneRaw, password, captcha = {}) {
  const phone = normalizePhoneInput(phoneRaw);
  try {
    const payload = { phone, password };
    const captchaId = String(captcha.captchaId || '').trim();
    const captchaCode = String(captcha.captchaCode || '').trim();
    if (captchaId) payload.captcha_id = captchaId;
    if (captchaCode) payload.captcha_code = captchaCode;
    const { res, data, base } = await fetchAuthWithFallback('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = String(data.detail || '登录失败');
      const captchaRequired = Boolean(data.captcha_required);
      const captchaError =
        captchaRequired ||
        detail.startsWith('captcha_') ||
        detail.startsWith('captcha_service_unavailable');
      if (captchaError) {
        loginCaptchaRequired = true;
        setLoginCaptchaVisible(true);
        await loadLoginCaptcha(true);
        if (detail === 'Invalid credentials' && captchaRequired) {
          throw new Error('账号或密码错误，请输入新的图片验证码后重试');
        }
        throw new Error(parseCaptchaErrorMessage(detail));
      }
      throw new Error(detail);
    }
    if (base && base !== API_BASE) {
      localStorage.setItem('apiBase', base);
    }
    authToken = data.access_token;
    localStorage.setItem('authToken', authToken);
    const user = await apiRequest('/me');
    setAuthed(user, authToken);
    resetLoginCaptchaState();
    return true;
  } catch (err) {
    const msg = String(err?.message || '');
    if (/Failed to fetch/i.test(msg)) {
      setAuthMessage(`登录失败：后端不可达，请确认 ${getApiBase()} 已启动`);
    } else {
      setAuthMessage(`登录失败：${msg}`);
    }
    return false;
  }
}

async function handleLogin() {
  const username = loginPhoneInput ? normalizePhoneInput(loginPhoneInput.value) : '';
  const password = document.getElementById('login-password').value.trim();
  if (!username || !password) {
    setAuthMessage('请输入手机号和密码');
    return;
  }
  if (!isValidPhone(username)) {
    setAuthMessage('手机号格式不正确');
    return;
  }
  const captchaCode = loginCaptchaCodeInput ? loginCaptchaCodeInput.value.trim() : '';
  if (loginCaptchaRequired) {
    if (!loginCaptchaChallengeId) {
      const ok = await loadLoginCaptcha(true);
      if (!ok) return;
    }
    if (!/^\d{4}$/.test(captchaCode)) {
      setAuthMessage('请输入 4 位图片验证码');
      return;
    }
  }
  setAuthMessage('正在登录...', false);
  await loginWithCredentials(username, password, {
    captchaId: loginCaptchaChallengeId,
    captchaCode,
  });
}

function setSendCodeButtonState(label, disabled) {
  if (!sendCodeBtn) return;
  sendCodeBtn.textContent = label;
  sendCodeBtn.disabled = disabled;
}

function stopRegisterCodeCooldown() {
  if (registerCodeCooldownTimer) {
    clearInterval(registerCodeCooldownTimer);
    registerCodeCooldownTimer = null;
  }
  registerCodeCooldownLeft = 0;
  setSendCodeButtonState('发送验证码', false);
}

function startRegisterCodeCooldown(seconds) {
  const initial = Number(seconds);
  const total = Number.isFinite(initial) && initial > 0 ? Math.ceil(initial) : 60;
  if (registerCodeCooldownTimer) {
    clearInterval(registerCodeCooldownTimer);
    registerCodeCooldownTimer = null;
  }
  registerCodeCooldownLeft = total;
  setSendCodeButtonState(`重新发送(${registerCodeCooldownLeft}s)`, true);
  registerCodeCooldownTimer = setInterval(() => {
    registerCodeCooldownLeft -= 1;
    if (registerCodeCooldownLeft <= 0) {
      stopRegisterCodeCooldown();
      return;
    }
    setSendCodeButtonState(`重新发送(${registerCodeCooldownLeft}s)`, true);
  }, 1000);
}

function parseRetryAfterSeconds(message) {
  const text = String(message || '');
  const match = text.match(/(\d+)\s*s/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function setResetCodeButtonState(label, disabled) {
  if (!resetSendCodeBtn) return;
  resetSendCodeBtn.textContent = label;
  resetSendCodeBtn.disabled = disabled;
}

function stopResetCodeCooldown() {
  if (resetCodeCooldownTimer) {
    clearInterval(resetCodeCooldownTimer);
    resetCodeCooldownTimer = null;
  }
  resetCodeCooldownLeft = 0;
  setResetCodeButtonState('发送验证码', false);
}

function startResetCodeCooldown(seconds) {
  const initial = Number(seconds);
  const total = Number.isFinite(initial) && initial > 0 ? Math.ceil(initial) : 60;
  if (resetCodeCooldownTimer) {
    clearInterval(resetCodeCooldownTimer);
    resetCodeCooldownTimer = null;
  }
  resetCodeCooldownLeft = total;
  setResetCodeButtonState(`重新发送(${resetCodeCooldownLeft}s)`, true);
  resetCodeCooldownTimer = setInterval(() => {
    resetCodeCooldownLeft -= 1;
    if (resetCodeCooldownLeft <= 0) {
      stopResetCodeCooldown();
      return;
    }
    setResetCodeButtonState(`重新发送(${resetCodeCooldownLeft}s)`, true);
  }, 1000);
}

function openResetPasswordModal() {
  if (!resetPasswordModal) return;
  const phone = loginPhoneInput ? normalizePhoneInput(loginPhoneInput.value) : '';
  if (resetPhoneInput) {
    resetPhoneInput.value = phone || resetPhoneInput.value;
  }
  if (resetCodeInput) resetCodeInput.value = '';
  if (resetPasswordInput) resetPasswordInput.value = '';
  if (resetPasswordConfirmInput) resetPasswordConfirmInput.value = '';
  if (resetPasswordInput && resetPasswordInput.type !== 'password') {
    resetPasswordInput.type = 'password';
  }
  if (resetPasswordToggleBtn) {
    resetPasswordToggleBtn.classList.remove('is-visible');
    resetPasswordToggleBtn.setAttribute('aria-label', '显示密码');
  }
  setResetPasswordMessage('');
  resetPasswordModal.classList.remove('is-hidden');
}

function closeResetPasswordModal() {
  if (!resetPasswordModal) return;
  resetPasswordModal.classList.add('is-hidden');
  setResetPasswordMessage('');
}

async function handleSendResetCode() {
  const phone = resetPhoneInput ? normalizePhoneInput(resetPhoneInput.value) : '';
  if (!phone) {
    setResetPasswordMessage('请输入手机号');
    return;
  }
  if (!isValidPhone(phone)) {
    setResetPasswordMessage('手机号格式不正确');
    return;
  }

  setResetCodeButtonState('发送中...', true);
  try {
    setResetPasswordMessage('正在发送验证码...', false);
    const { res, data, base } = await fetchAuthWithFallback('/auth/send-reset-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`当前后端未启用找回密码验证码接口（${base || API_BASE}）`);
      }
      throw new Error(data.detail || '验证码发送失败');
    }
    if (base && base !== API_BASE) {
      localStorage.setItem('apiBase', base);
    }
    setResetPasswordMessage('验证码已发送，请查收短信', false);
    const retryAfter = Number(data.retry_after || data.retryAfter);
    startResetCodeCooldown(retryAfter);
  } catch (err) {
    const msg = String(err?.message || '');
    const retryAfter = parseRetryAfterSeconds(msg);
    if (retryAfter) {
      startResetCodeCooldown(retryAfter);
      setResetPasswordMessage(`发送频繁，请 ${retryAfter}s 后重试`);
      return;
    }
    if (/Failed to fetch/i.test(msg)) {
      setResetPasswordMessage(`发送失败：后端不可达，请确认 ${getApiBase()} 已启动`);
    } else {
      setResetPasswordMessage(`发送失败：${msg}`);
    }
    if (!resetCodeCooldownTimer) {
      setResetCodeButtonState('发送验证码', false);
    }
  }
}

async function handleSubmitResetPassword() {
  const phone = resetPhoneInput ? normalizePhoneInput(resetPhoneInput.value) : '';
  const code = resetCodeInput ? resetCodeInput.value.trim() : '';
  const password = resetPasswordInput ? resetPasswordInput.value : '';
  const confirm = resetPasswordConfirmInput ? resetPasswordConfirmInput.value : '';

  if (!phone || !code || !password || !confirm) {
    setResetPasswordMessage('请完整填写手机号、验证码和新密码');
    return;
  }
  if (!isValidPhone(phone)) {
    setResetPasswordMessage('手机号格式不正确');
    return;
  }
  if (!/^\d{4}$/.test(code)) {
    setResetPasswordMessage('请输入 4 位验证码');
    return;
  }
  if (password !== confirm) {
    setResetPasswordMessage('两次输入的新密码不一致');
    return;
  }
  if (new TextEncoder().encode(password).length > 72) {
    setResetPasswordMessage('密码过长，请控制在 72 字节以内');
    return;
  }

  try {
    setResetPasswordMessage('正在重置密码...', false);
    const { res, data, base } = await fetchAuthWithFallback('/auth/reset-password-with-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code, password }),
    });
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`当前后端未启用找回密码接口（${base || API_BASE}）`);
      }
      throw new Error(data.detail || '密码重置失败');
    }
    if (base && base !== API_BASE) {
      localStorage.setItem('apiBase', base);
    }
    if (loginPhoneInput) loginPhoneInput.value = phone;
    if (loginPasswordInput) loginPasswordInput.value = password;
    setAuthMessage('密码已重置，请使用新密码登录', false);
    setResetPasswordMessage('重置成功，正在返回登录', false);
    stopResetCodeCooldown();
    setTimeout(() => {
      closeResetPasswordModal();
    }, 500);
  } catch (err) {
    const msg = String(err?.message || '');
    if (/Failed to fetch/i.test(msg)) {
      setResetPasswordMessage(`重置失败：后端不可达，请确认 ${getApiBase()} 已启动`);
    } else {
      setResetPasswordMessage(`重置失败：${msg}`);
    }
  }
}

async function handleSendRegisterCode() {
  const phone = registerPhoneInput ? normalizePhoneInput(registerPhoneInput.value) : '';
  if (!phone) {
    setAuthMessage('请输入注册手机号');
    return;
  }
  if (!isValidPhone(phone)) {
    setAuthMessage('手机号格式不正确');
    return;
  }

  setSendCodeButtonState('发送中...', true);
  try {
    setAuthMessage('正在发送验证码...', false);
    const { res, data, base } = await fetchAuthWithFallback('/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`当前后端未启用短信验证码接口（${base || API_BASE}）`);
      }
      throw new Error(data.detail || '验证码发送失败');
    }
    if (base && base !== API_BASE) {
      localStorage.setItem('apiBase', base);
    }
    setAuthMessage('验证码已发送，请查收短信', false);
    const retryAfter = Number(data.retry_after || data.retryAfter);
    startRegisterCodeCooldown(retryAfter);
  } catch (err) {
    const msg = String(err?.message || '');
    const retryAfter = parseRetryAfterSeconds(msg);
    if (retryAfter) {
      startRegisterCodeCooldown(retryAfter);
      setAuthMessage(`发送频繁，请 ${retryAfter}s 后重试`);
      return;
    }
    if (/Failed to fetch/i.test(msg)) {
      setAuthMessage(`发送失败：后端不可达，请确认 ${getApiBase()} 已启动`);
    } else {
      setAuthMessage(`发送失败：${msg}`);
    }
    if (!registerCodeCooldownTimer) {
      setSendCodeButtonState('发送验证码', false);
    }
  }
}

async function handleRegister() {
  const phone = registerPhoneInput ? normalizePhoneInput(registerPhoneInput.value) : '';
  const password = registerPasswordInput ? registerPasswordInput.value.trim() : '';
  const code = registerCodeInput ? registerCodeInput.value.trim() : '';
  const agreed = Boolean(registerAgreeInput && registerAgreeInput.checked);
  if (!phone || !password || !code) {
    setAuthMessage('请输入手机号、密码和验证码');
    return;
  }
  if (!isValidPhone(phone)) {
    setAuthMessage('手机号格式不正确');
    return;
  }
  if (!/^\d{4}$/.test(code)) {
    setAuthMessage('请输入 4 位验证码');
    return;
  }
  if (!agreed) {
    setAuthMessage('请先勾选用户协议');
    return;
  }
  try {
    setAuthMessage('正在验证并注册...', false);
    const { res, data, base } = await fetchAuthWithFallback('/auth/register-with-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password, code, agree_terms: true }),
    });
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`当前后端未启用验证码注册接口（${base || API_BASE}）`);
      }
      throw new Error(data.detail || '注册失败');
    }
    if (base && base !== API_BASE) {
      localStorage.setItem('apiBase', base);
    }
    setAuthMessage('注册成功，正在登录...', false);
    await loginWithCredentials(phone, password);
    stopRegisterCodeCooldown();
  } catch (err) {
    const msg = String(err?.message || '');
    if (/Failed to fetch/i.test(msg)) {
      setAuthMessage(`注册失败：后端不可达，请确认 ${getApiBase()} 已启动`);
    } else {
      setAuthMessage(`注册失败：${msg}`);
    }
  }
}

function handleForgotPassword() {
  openResetPasswordModal();
}

function handleOpenAuthTerms(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  if (authTermsModal) {
    authTermsModal.classList.remove('is-hidden');
  }
}

async function handleRefreshLoginCaptcha() {
  loginCaptchaRequired = true;
  await loadLoginCaptcha(true);
}

function toggleLoginPasswordVisibility() {
  if (!loginPasswordInput || !loginPasswordToggleBtn) return;
  const isHidden = loginPasswordInput.type === 'password';
  loginPasswordInput.type = isHidden ? 'text' : 'password';
  loginPasswordToggleBtn.classList.toggle('is-visible', isHidden);
  loginPasswordToggleBtn.setAttribute('aria-label', isHidden ? '隐藏密码' : '显示密码');
}

function toggleResetPasswordVisibility() {
  if (!resetPasswordInput || !resetPasswordToggleBtn) return;
  const isHidden = resetPasswordInput.type === 'password';
  resetPasswordInput.type = isHidden ? 'text' : 'password';
  resetPasswordToggleBtn.classList.toggle('is-visible', isHidden);
  resetPasswordToggleBtn.setAttribute('aria-label', isHidden ? '隐藏密码' : '显示密码');
}

function toggleRegisterPasswordVisibility() {
  if (!registerPasswordInput || !registerPasswordToggleBtn) return;
  const isHidden = registerPasswordInput.type === 'password';
  registerPasswordInput.type = isHidden ? 'text' : 'password';
  registerPasswordToggleBtn.classList.toggle('is-visible', isHidden);
  registerPasswordToggleBtn.setAttribute('aria-label', isHidden ? '隐藏密码' : '显示密码');
}

document.querySelectorAll('[data-auth-action="login"]').forEach((btn) => {
  btn.addEventListener('click', handleLogin);
});

document.querySelectorAll('[data-auth-action="register"]').forEach((btn) => {
  btn.addEventListener('click', handleRegister);
});

document.querySelectorAll('[data-auth-action="send-code"]').forEach((btn) => {
  btn.addEventListener('click', handleSendRegisterCode);
});

document.querySelectorAll('[data-auth-action="send-reset-code"]').forEach((btn) => {
  btn.addEventListener('click', handleSendResetCode);
});

document.querySelectorAll('[data-auth-action="submit-reset-password"]').forEach((btn) => {
  btn.addEventListener('click', handleSubmitResetPassword);
});

document.querySelectorAll('[data-auth-action="forgot-password"]').forEach((btn) => {
  btn.addEventListener('click', handleForgotPassword);
});

document.querySelectorAll('[data-auth-action="open-auth-terms"]').forEach((btn) => {
  btn.addEventListener('click', handleOpenAuthTerms);
});

document.querySelectorAll('[data-auth-action="refresh-login-captcha"]').forEach((btn) => {
  btn.addEventListener('click', () => {
    void handleRefreshLoginCaptcha();
  });
});

document.querySelectorAll('[data-auth-action="toggle-login-password"]').forEach((btn) => {
  btn.addEventListener('click', toggleLoginPasswordVisibility);
});

document.querySelectorAll('[data-auth-action="toggle-reset-password"]').forEach((btn) => {
  btn.addEventListener('click', toggleResetPasswordVisibility);
});

document.querySelectorAll('[data-auth-action="toggle-register-password"]').forEach((btn) => {
  btn.addEventListener('click', toggleRegisterPasswordVisibility);
});

if (registerAgreeInput && registerSubmitBtn) {
  const syncRegisterSubmitState = () => {
    registerSubmitBtn.disabled = !registerAgreeInput.checked;
  };
  registerAgreeInput.addEventListener('change', syncRegisterSubmitState);
  syncRegisterSubmitState();
}

if (loginPhoneInput) {
  loginPhoneInput.addEventListener('change', () => {
    if (!loginCaptchaRequired) return;
    void loadLoginCaptcha(true);
  });
}

async function continueStartupAfterVersionCheck() {
  if (appStartupComplete) return;
  appStartupComplete = true;
  await fetchAnnouncement();
  startAnnouncementPolling();
  await checkAuth();
  ensureAccessRefreshTimer();
  await loadComposeTemplates();
  showView('dashboard');
  startAccountAutoSaveTimer();
}

resetLoginCaptchaState();
setResetCodeButtonState('发送验证码', false);

void (async () => {
  await loadStorageInfo();
  await loadAppVersion();
  if (DEMO_MODE) {
    hideVersionCheckState();
    await continueStartupAfterVersionCheck();
    return;
  }
  const versionOk = await runStartupVersionCheck();
  if (!versionOk) return;
  await continueStartupAfterVersionCheck();
})();
