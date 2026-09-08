# Mailboat

[简体中文](README.md) | [English](README_EN.md)

一款面向科研联系、招生咨询等场景的桌面批量邮件管理工具。Mailboat 将联系人导入、多发件账号、邮件模板、附件、定时发送和发送记录集中在一个界面中，并支持通用 SMTP 与 Gmail API 两种发信方式。

> 请仅向与你的业务或研究活动有关、且允许被联系的收件人发送邮件。使用前请遵守所在地法律、邮箱服务商规则及反垃圾邮件政策。

## 功能特性

- **多账号发送**：在账号中心管理多个发件邮箱，并为联系人指定发件账号。
- **双发送通道**：支持通用 SMTP，以及 Gmail OAuth 2.0 / Gmail API。
- **批量导入**：支持 Excel、CSV 和直接粘贴表格，自动提取并按邮箱去重。
- **联系人管理**：集中查看待发送、发送成功和发送失败状态。
- **邮件模板**：每个账号可配置主题、正文和附件；正文支持 `{teacher_name}` 姓名变量。
- **计划发送**：可立即发送，也可按北京时间和联系人时差安排发送时间。
- **发送保护**：支持随机发送间隔、每日发送上限、测试发送和 SMTP 连通性检查。
- **任务可视化**：仪表盘展示账号状态、联系人数量、任务进度和发送结果。
- **本地数据存储**：开发模式下，联系人、账号配置和日志保存在本机工作目录。
- **配套服务端**：提供用户认证、短信验证码、版本发布、发送额度和微信支付相关 API。

## 界面与功能介绍

### 1. 仪表盘与全局导航

![Mailboat 仪表盘与界面总览](docs/images/dashboard-overview.png)

- 汇总展示导师总数、待发送、已发送、失败、当日已发送和当前发送权益。
- 从 `teachers.json`、本地发送日志和后端额度数据中读取统计结果，便于快速判断任务状态。
- “最近发送任务”显示执行摘要、跳过数量、成功与失败数量，并可直接进入日志页面查看详情。
- “账号池实时状态”按发件账号展示发送通道、开始时间、随机间隔、已分配、已发送、待发送及失败数量。
- 顶部公告栏展示系统通知，并支持打开公告列表查看全部内容。
- 顶部快捷按钮可直接进入数据导入、会员管理和发送控制台，也可切换窗口置顶状态。
- 左侧导航集中提供仪表盘、账号中心、导入/粘贴、导师库、邮件模板、发送控制台、测试发送、日志与报告、问题反馈和设置等全部模块。

### 2. 账号中心

![Mailboat 账号中心](docs/images/account-center.png)

- 统一添加、筛选、编辑、保存和删除多个发件账号，各账号保留独立的发送配置。
- 支持通用 SMTP 与 Gmail API 两种发送通道，并根据邮箱类型自动提供常见 SMTP 服务器和端口。
- SMTP 账号可配置邮箱、发件人显示名称、服务器、端口及邮箱授权码，并可执行连通性测试。
- Gmail API 账号支持上传 `credentials.json`、绑定或解绑 OAuth，并显示当前授权状态。
- 可为每个账号单独设置北京时间的开始发送时间，以及最小、最大随机发送间隔。
- 可在账号内维护邮件主题、正文模板和附件路径，保存后供发送任务直接读取。
- 账号顶部实时显示已分配、已发送、待发送、失败和当日发送额度等状态。

### 3. 导入与粘贴

![Mailboat 数据导入](docs/images/data-import.png)

- 支持拖拽或点击选择 Excel、CSV 文件，并提供标准 Excel 示例文件下载。
- 导入前可指定归属发件账号及北京时间的发送开始时间；不指定时间时使用账号默认配置。
- 支持从 Excel 直接复制并粘贴表格，字段包括国家、机构、姓名、姓氏、邮箱和与北京时间的时差。
- 表格编辑区支持粘贴示例、解析字段、删除选中行、清空列内容和全部清除。
- 导入时校验必填字段与邮箱格式，并按照邮箱地址统一去重。
- 去重预览会分别统计新增、更新和冲突数量，并显示是否已写入 `teachers.json` 及详细处理信息。
- 同一个联系人邮箱只绑定一个发件账号，避免多个账号对同一联系人重复发送。

### 4. 导师库

![Mailboat 导师库](docs/images/teacher-library.png)

- 集中展示去重后的联系人姓名、邮箱、机构、归属账号、发送状态、计划发送时间和实际发送时间。
- 可按“未发送”“失败”“全部”筛选联系人，也可按具体发件账号缩小查看范围。
- 支持逐条勾选、全选当前可见联系人以及批量删除选中联系人。
- 发送状态由正式发送日志同步更新，可快速区分待处理、已发送和发送失败记录。
- 计划发送时间结合导入时设置的北京时间与联系人时差生成，便于检查跨时区发送安排。

### 5. 邮件模板

![Mailboat 邮件模板](docs/images/mail-templates.png)

- 按发件账号分别编辑邮件主题、正文和附件，切换账号时加载对应配置。
- 模板库支持命名、保存、导入和删除模板，主题、正文及附件路径可在不同账号之间复用。
- 正文支持 `{teacher_name}` 占位符，正式发送时自动替换为联系人姓名。
- 支持一次选择多个附件，也可手动维护每行一个附件路径并一键清空。
- “保存到该账号”会同时保存当前主题、正文和附件列表，供测试发送与正式发送共同使用。

### 6. 发送控制台

![Mailboat 发送控制台](docs/images/send-console.png)

- 支持勾选一个、多个或全部发件账号执行任务，未选中的账号不会参与发送。
- 自动读取各账号的发送通道、计划开始时间、随机间隔、邮件模板和附件配置。
- 执行前按联系人归属账号分组，并跳过已经成功发送的联系人，避免重复投递。
- 实时展示总体进度、当前状态、参与发送的账号范围、待发送数量和各账号执行进度。
- 控制台持续输出处理顺序、跳过原因、成功、失败、额度限制及最终统计信息。
- 支持开始和停止任务；详细运行记录同时写入 `logs/run_send.log`，便于后续排查。

### 7. 其他功能模块

- **测试发送**：维护独立测试名单，支持从 Excel 粘贴联系人、选择账号和发送时间、开始或停止测试；测试结果不会写入正式的已发送记录，也不会影响 `teachers.json`。
- **日志与报告**：集中查看全部、成功或失败日志，并可将当前统计与明细导出为文本报告。
- **问题反馈**：选择本地发件账号，填写标题和问题描述后向项目反馈邮箱发送信息，并在控制台查看结果。
- **安全与存储**：查看当前客户端版本和本地工作目录，可切换数据主目录，并分别查看数据、日志和配置目录位置。
- **公告与版本检查**：客户端启动时读取后端版本策略，展示更新说明、强制更新要求及下载入口；运行中可定时刷新公告。
- **发送额度与会员状态**：显示免费额度、当日成功数量和会员有效期；启用配套服务端后可扩展套餐与支付流程。

## 项目结构

```text
app2/
├── desktop-app/                 # Electron 桌面客户端
│   ├── renderer/                # 客户端页面、样式与交互
│   └── scripts/                 # Python 模块打包脚本
├── backend/                     # FastAPI 服务端
├── docs/images/                 # README 脱敏界面截图
├── samples/import_example.xlsx  # 联系人导入示例
├── email_sender.py              # SMTP / Gmail API 发信核心
├── import_teachers_from_excel.py# Excel / CSV 导入与去重
├── send_by_accounts.py          # 按账号分组执行发送任务
├── gmail_oauth_manager.py       # Gmail OAuth 授权管理
├── smtp_check.py                # SMTP 配置检查
├── config.py                    # Python 模块的安全默认配置
├── README.md                    # 中文说明
└── README_EN.md                 # English documentation
```

## 快速开始

### 环境要求

- Windows 10/11（当前桌面安装包以 Windows x64 为目标）
- Python 3.10 或更高版本
- Node.js 18 或更高版本，以及 npm
- 可正常发信的邮箱账号

如果只使用已经构建好的安装包，可直接安装并从“使用方法”一节开始，无需配置 Node.js。

### 1. 获取项目

```bash
git clone <your-repository-url>
cd bulk-email-sender-main/app2
```

请将 `<your-repository-url>` 替换为本仓库的实际 Git 地址。

### 2. 创建 Python 虚拟环境

PowerShell：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install pandas openpyxl pymysql requests google-auth google-auth-oauthlib google-api-python-client
```

Git Bash：

```bash
python -m venv .venv
source .venv/Scripts/activate
python -m pip install --upgrade pip
python -m pip install pandas openpyxl pymysql requests google-auth google-auth-oauthlib google-api-python-client
```

### 3. 安装并启动桌面客户端

```bash
cd desktop-app
npm ci
npm start
```

源码开发模式按单机本地应用运行，可直接进入主界面；正式打包发行版仍保留认证流程。

Electron 会调用当前可用的 Python。项目也会优先检查以下开发环境：

```text
%USERPROFILE%\.conda\envs\post_mail\python.exe
```

如果该路径不存在，则使用系统 `PATH` 中的 `python`。请确保依赖安装在实际被调用的 Python 环境中。

## 使用方法

### 1. 添加发件账号

打开“账号中心”，添加邮箱并选择发送通道：

- **SMTP（通用）**：填写发件邮箱、发件人名称、SMTP 服务器、端口和邮箱授权码。
- **Gmail API**：选择 Gmail API 通道，导入 Google OAuth 客户端凭据，然后点击绑定并在浏览器中完成授权。

应用内置了 Gmail、QQ 邮箱、163 邮箱、126 邮箱和 Outlook/Hotmail 等常见 SMTP 地址。其他邮箱请以服务商官方文档为准。

> 建议使用邮箱服务商生成的 SMTP“授权码”或“应用专用密码”，不要把邮箱网页登录密码写入配置文件或提交到 Git。

### 2. 准备联系人

最简单的方式是复制 [`samples/import_example.xlsx`](samples/import_example.xlsx) 并替换示例数据。导入时至少需要提供联系人姓名和邮箱；时差列为可选项，可用于计算适合对方时区的发送时间。

也可以在“导入/粘贴”页面直接粘贴表格内容。应用会：

1. 校验邮箱格式；
2. 按邮箱地址去重；
3. 将新增联系人合并到联系人库；
4. 记录账号分配和计划发送时间。

### 3. 编辑邮件

在账号中心或邮件编辑区域设置：

- 邮件主题；
- 正文模板；
- 一个或多个附件；
- 最小和最大发送间隔；
- 每日发送数量限制。

正文中的 `{teacher_name}` 会在发送时替换为对应联系人的姓名，例如：

```text
Dear Prof. {teacher_name},

I am writing to inquire about potential PhD opportunities...
```

### 4. 测试配置

正式批量发送前，建议依次完成：

1. SMTP 账号点击“测试 SMTP”；
2. 使用测试名单向自己或受控邮箱发送一封测试邮件；
3. 检查发件人名称、主题、姓名变量、正文格式和附件；
4. 确认发送间隔及每日限制符合邮箱服务商规则。

Gmail API 通道无需进行 SMTP 测试，但必须显示 OAuth 已绑定。

### 5. 开始发送

在联系人库中筛选并选择联系人，再选择一个或多个发件账号启动任务。发送期间可以在仪表盘查看进度；成功、失败和运行日志会同步更新。

## Gmail API 配置

1. 在 Google Cloud Console 中创建项目；
2. 启用 Gmail API；
3. 配置 OAuth 同意屏幕；
4. 创建“桌面应用”类型的 OAuth 2.0 客户端；
5. 下载客户端 JSON 凭据；
6. 在 Mailboat 账号中心导入凭据并绑定 Gmail 账号。

OAuth 凭据和账号令牌属于敏感信息。项目已经通过 `.gitignore` 排除以下本地目录：

```text
config/gmail/
config/gmail_tokens/
```

不要手动强制提交这些文件。

## 本地数据位置

Electron 开发版和安装版默认将运行数据写入：

```text
%LOCALAPPDATA%\Mailboat\workspace
```

其中通常包括：

```text
workspace/
├── config/              # 公告设置、Gmail OAuth 凭据与令牌
├── data/                # 联系人、账号、模板、导入批次等
└── logs/                # 发送日志与运行日志
```

仓库根目录中的 `data/`、`logs/`、`attachments/` 也已被 `.gitignore` 排除。迁移或重装前，请备份本地工作目录。

## 启动可选后端

桌面端可以连接远程服务，也可以在开发时启动本地 FastAPI 服务。后端需要 MySQL；验证码、登录风控等功能还需要 Redis。短信和微信支付功能需要相应服务商凭据。

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

编辑 `backend/.env`，至少修改：

```dotenv
DATABASE_URL=mysql+pymysql://user:password@127.0.0.1:3306/mailpilot
JWT_SECRET=replace-with-a-long-random-secret
REDIS_URL=redis://127.0.0.1:6379/0
```

确保数据库已创建、MySQL 与 Redis 已启动，然后运行：

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

访问以下地址检查服务：

```text
http://127.0.0.1:8000/health
http://127.0.0.1:8000/docs
```

生产环境中必须更换示例密钥、限制 CORS、启用 HTTPS，并妥善保护数据库、短信、支付和管理端凭据。

## 构建 Windows 安装包

桌面端使用 Electron Builder 生成 NSIS 安装包：

```bash
cd desktop-app
npm ci
npm run dist:win
```

构建结果默认生成在 `desktop-app/release/`。

`build:protected-py` 默认调用当前环境中的 Python。构建前请确认当前 Python 已安装 `setuptools` 和 `Cython`：

```bash
python -m pip install setuptools Cython
```

## 配置参考

根目录 [`config.py`](config.py) 为直接调用 Python 发信模块时提供安全默认值：

| 配置项                          | 作用                 | 默认值                       |
| ------------------------------- | -------------------- | ---------------------------- |
| `SMTP_SERVER` / `SMTP_PORT` | 默认 SMTP 地址和端口 | `smtp.gmail.com` / `465` |
| `SEND_CHANNEL`                | 默认发送通道         | `smtp`                     |
| `EMAIL_SUBJECT`               | 默认邮件主题         | `PhD Application`          |
| `EMAIL_CONTENT`               | 默认正文模板         | 包含`{teacher_name}`       |
| `TEACHER_DATA_FILE`           | 联系人数据路径       | `data/teachers.json`       |
| `MIN_DELAY` / `MAX_DELAY`   | 邮件间随机等待秒数   | `40` / `60`              |
| `MAX_CONCURRENT_SEND`         | 最大并发发送数       | `1`                        |
| `RANDOMIZE_ORDER`             | 是否随机发送顺序     | `False`                    |
| `DAILY_SEND_LIMIT`            | 默认每日发送上限     | `20`                       |

账号中心保存的账号设置优先于这些后备值。不要在 `config.py` 中提交真实邮箱密码、授权码或个人信息。

## 常见问题

### `python` 找不到，或缺少模块

确认虚拟环境已经激活，并检查 Electron 实际使用的解释器：

```bash
python --version
python -m pip --version
```

使用 `python -m pip install ...` 可以减少依赖被装入另一个 Python 环境的情况。

### SMTP 登录失败

- 确认邮箱已开启 SMTP 服务；
- 使用授权码或应用专用密码，而不是网页登录密码；
- 检查服务器、端口、SSL/TLS 设置；
- Gmail 如受网络环境限制，优先使用 Gmail API 通道；
- 如果使用代理，确认代理地址可访问且格式正确。

### Gmail 授权失败

- 确认已启用 Gmail API；
- OAuth 客户端类型应为“桌面应用”；
- 测试模式下，需要把当前 Gmail 地址加入测试用户；
- 删除旧令牌后重新绑定，通常可以解决授权范围或凭据变更问题。

### 导入后没有联系人

- 优先使用项目提供的示例 Excel；
- 检查姓名和邮箱列是否存在；
- 确认邮箱格式有效；
- 已经存在的邮箱会被去重，不会重复添加。

### 邮件进入垃圾箱或账号被限制

降低发送频率和每日数量，避免高度重复或误导性内容，并确保收件人与邮件主题相关。新邮箱应先建立正常使用记录，不建议立即进行高频批量发送。

## 安全说明

- 不要提交 `.env`、OAuth 凭据、访问令牌、SMTP 授权码或真实联系人数据；
- 正式发送前使用测试账号验证内容；
- 为数据库账户分配最小权限；
- 定期备份本地联系人和模板；
- 日志可能包含邮箱地址，分享日志前请先脱敏。

## 商业合作与私有化定制

Mailboat 可根据团队、实验室、教育机构及企业的实际工作流程提供商业合作与定制服务，包括但不限于：

- **私有化部署**：部署到客户自有服务器、内网或指定云平台，协助配置数据库、Redis、域名和 HTTPS；
- **功能定制**：定制联系人字段、审批流程、邮件模板、发送策略、额度规则和数据报表；
- **品牌定制**：定制产品名称、Logo、界面主题、安装包和版本更新渠道；
- **系统集成**：对接 CRM、教务系统、客户数据库、企业身份认证、短信及其他内部服务；
- **邮箱能力扩展**：适配特定企业邮箱服务商、OAuth 登录方式和邮件投递策略；
- **运维与技术支持**：提供安装部署、版本升级、故障排查、数据迁移和使用培训。

如需商业授权、私有化部署或定制开发，可发送邮件至 [huaxiaohang2022@163.com](mailto:huaxiaohang2022@163.com)，或通过 GitHub Issue 联系项目维护者并在标题中注明 `[商业合作]`。请勿在公开 Issue 中提交密码、密钥、联系人名单或其他敏感信息；具体需求可通过邮件等私密渠道沟通。

> 定制服务不会用于规避邮箱服务商限制或实施垃圾邮件发送。合作方案应符合适用法律、隐私要求及相关平台政策。

## 贡献

欢迎通过 Issue 报告问题或提出建议。提交 Pull Request 前，请先在本地启动桌面端，验证联系人导入、测试发送及相关界面没有回归。

## 许可证

仓库目前未提供根目录许可证文件。在添加明确的开源许可证前，默认保留所有权利；如需使用、修改或分发本项目，请先获得项目维护者许可。
