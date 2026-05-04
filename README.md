# Anonbox

轻量级匿名提问箱 Web 应用。用户创建提问箱接受匿名提问并公开回答，管理员拥有全站管理权限。

## 功能特性

- **提问箱** — 注册创建唯一子页面，自定义昵称、头像、URL 标识
- **访问密码** — 可选设置密码保护，主页访问需验证，直接 URL 可分享
- **匿名提问** — 访客无需登录，可选填临时昵称，支持敏感词过滤
- **问题管理** — 公开/隐藏/回答/置顶/删除，自定义字数上限
- **首页公告** — 管理员可编辑公告牌，有内容时显示，无内容时隐藏
- **管理员后台** — 全站统计、问题筛选、IP 封禁/解封、提问箱管理
- **响应式 UI** — 适配手机、平板、桌面端

## 技术栈

| 层面 | 技术 |
|------|------|
| 运行时 | Node.js 18+ |
| 框架 | Express 4 |
| 数据库 | SQLite (sql.js，纯 JS 无需编译) |
| 模板引擎 | EJS |
| 前端 | 原生 HTML/CSS/JS |
| 密码哈希 | bcryptjs |

---

## 快速开始

```bash
# 1. 克隆项目
git clone https://github.com/你的用户名/anonbox.git
cd anonbox

# 2. 配置环境变量
cp .env.example .env

# 3. 安装依赖
npm install

# 4. 启动
npm start
```

浏览器访问 `http://localhost:3000`

### 默认账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 管理员 | `admin` | `admin123` |

> 首次登录后请立即修改默认密码

### .env 配置说明

```env
PORT=3000                              # 监听端口
SESSION_SECRET=openssl-rand-hex-32     # 会话密钥（生产环境务必修改）
NODE_ENV=development                   # 运行环境
ADMIN_DEFAULT_PASSWORD=admin123        # 初始管理员密码
DB_PATH=                               # 数据库路径（可选，默认 ./data.db）
```

---

## Docker 部署

### Docker Compose（推荐）

```bash
# 1. 克隆项目
git clone https://github.com/你的用户名/anonbox.git
cd anonbox

# 2. 创建 .env 文件
cat > .env << 'EOF'
SESSION_SECRET=$(openssl rand -hex 32)
ADMIN_DEFAULT_PASSWORD=change-me-now
EOF

# 3. 构建并启动
docker compose up -d

# 4. 查看日志
docker compose logs -f
```

服务运行在 `http://localhost:3000`。

### Docker CLI

```bash
# 构建镜像
docker build -t anonbox .

# 创建数据目录
mkdir -p data uploads

# 运行容器
docker run -d \
  --name anonbox \
  -p 3000:3000 \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  -e ADMIN_DEFAULT_PASSWORD=change-me-now \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/uploads:/app/uploads \
  --restart unless-stopped \
  anonbox
```

### Docker + Nginx 反向代理

创建 `docker-compose.nginx.yml`:

```yaml
version: '3.8'

services:
  anonbox:
    build: .
    container_name: anonbox
    environment:
      - PORT=3000
      - DB_PATH=/app/data/data.db
      - SESSION_SECRET=${SESSION_SECRET}
      - NODE_ENV=production
      - ADMIN_DEFAULT_PASSWORD=${ADMIN_DEFAULT_PASSWORD}
    volumes:
      - ./data:/app/data
      - ./uploads:/app/uploads
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    container_name: anonbox-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
      - ./public:/var/www/anonbox/public
      - ./uploads:/var/www/anonbox/uploads
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - anonbox
    restart: unless-stopped
```

配套 `nginx.conf`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    client_max_body_size 3m;

    location / {
        proxy_pass http://anonbox:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /public/ {
        alias /var/www/anonbox/public/;
        expires 30d;
    }

    location /uploads/ {
        alias /var/www/anonbox/uploads/;
    }
}
```

启动:

```bash
docker compose -f docker-compose.nginx.yml up -d
```

---

## 传统部署（云服务器 + Nginx + PM2）

以下适用于 Ubuntu 20.04+ / Debian 11+。

### 1. 环境准备

```bash
sudo apt update && sudo apt upgrade -y

# Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 基础工具
sudo apt install -y git nginx

# PM2
sudo npm i -g pm2

# 验证
node -v && npm -v && git --version
```

### 2. 获取代码

```bash
git clone https://github.com/你的用户名/anonbox.git /var/www/anonbox
cd /var/www/anonbox
```

### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`:

```env
PORT=3000
SESSION_SECRET=<执行 openssl rand -hex 32 生成>
NODE_ENV=production
ADMIN_DEFAULT_PASSWORD=admin123
```

### 4. 安装依赖

```bash
npm install
```

### 5. 上传目录权限

```bash
chmod 755 /var/www/anonbox/uploads
```

### 6. PM2 启动

```bash
pm2 start app.js --name anonbox --env production
pm2 save
pm2 startup
# 按提示执行输出的 sudo 命令
```

验证:

```bash
pm2 status
curl http://localhost:3000
```

### 7. Nginx 反向代理

创建站点配置:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    client_max_body_size 3m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /public/ {
        alias /var/www/anonbox/public/;
        expires 30d;
    }

    location /uploads/ {
        alias /var/www/anonbox/uploads/;
    }
}
```

启用站点:

```bash
sudo ln -s /etc/nginx/sites-available/anonbox /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 8. HTTPS（可选）

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

### 9. 更新部署

```bash
cd /var/www/anonbox
git pull
npm install
pm2 restart anonbox
```

### 10. 故障排查

```bash
pm2 logs anonbox --lines 50           # 应用日志
sudo tail -f /var/log/nginx/error.log  # Nginx 错误日志
curl http://localhost:3000             # 测试应用是否运行
sudo netstat -tlnp | grep 3000         # 检查端口监听
```

---

## 宝塔面板部署

### 1. 安装软件

宝塔「软件商店」安装：**Nginx**、**Node.js版本管理器**（装 v18+）、**PM2管理器**、**Git客户端**

### 2. 拉取代码

宝塔「终端」:

```bash
cd /www/wwwroot
git clone https://github.com/你的用户名/anonbox.git
```

### 3. 配置 .env

宝塔「文件」→ 进入 `/www/wwwroot/anonbox/` → 新建 `.env`:

```env
PORT=3000
SESSION_SECRET=<随机字符串>
NODE_ENV=production
ADMIN_DEFAULT_PASSWORD=admin123
```

### 4. 安装依赖

宝塔「终端」:

```bash
export PATH=/www/server/nodejs/v18/bin:$PATH
cd /www/wwwroot/anonbox
npm install
```

### 5. PM2 启动

PM2管理器 → 设置 → 选择 Node 版本 → 保存 → 返回项目列表 → 添加项目:

| 字段 | 值 |
|------|-----|
| 启动文件 | `/www/wwwroot/anonbox/app.js` |
| 运行目录 | `/www/wwwroot/anonbox` |
| 项目名称 | `anonbox` |
| 环境 | `production` |

### 6. Nginx 反向代理

网站 → 你的域名 → 设置 → 反向代理 → 添加:

| 字段 | 值 |
|------|-----|
| 目标 URL | `http://127.0.0.1:3000` |
| 发送域名 | `$host` |

### 7. SSL

网站 → 你的域名 → 设置 → SSL → Let's Encrypt → 申请

---

## 项目结构

```
anonbox/
├── app.js                    # 应用入口
├── db.js                     # 数据库初始化与迁移
├── package.json              # 依赖管理
├── .env.example              # 环境变量模板
├── .gitignore
├── .dockerignore
├── Dockerfile                # Docker 镜像构建
├── docker-compose.yml        # Docker Compose 编排
├── routes/
│   ├── index.js              # 首页、注册、登录
│   ├── box.js                # 提问箱子页面、密码验证
│   ├── dashboard.js          # 主人后台
│   └── admin.js              # 管理员后台
├── middleware/
│   └── auth.js               # 认证中间件
├── views/
│   ├── partials/             # header.ejs, footer.ejs
│   ├── index.ejs             # 首页
│   ├── register.ejs          # 注册
│   ├── login.ejs             # 主人登录
│   ├── box.ejs               # 提问箱公开页
│   ├── box-locked.ejs        # 密码验证页
│   ├── dashboard.ejs         # 主人后台
│   ├── 404.ejs / 500.ejs     # 错误页
│   └── admin/
│       ├── login.ejs
│       ├── dashboard.ejs
│       ├── questions.ejs
│       ├── boxes.ejs
│       └── banned.ejs
├── public/
│   ├── css/style.css         # 响应式样式
│   └── img/default-avatar.svg
├── uploads/                  # 头像上传目录
└── README.md
```

## 数据库表结构

```sql
-- 用户（提问箱主人）
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar TEXT DEFAULT '',
  box_password TEXT DEFAULT '',
  accept_questions INTEGER DEFAULT 1,
  question_limit INTEGER DEFAULT 500,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 问题
CREATE TABLE questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  box_id INTEGER NOT NULL REFERENCES users(id),
  asker_nickname TEXT DEFAULT '匿名',
  question_text TEXT NOT NULL,
  answer_text TEXT DEFAULT '',
  is_hidden INTEGER DEFAULT 0,
  is_answered INTEGER DEFAULT 0,
  asker_ip TEXT DEFAULT '',
  asker_ua TEXT DEFAULT '',
  is_pinned INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  answered_at DATETIME
);

-- 管理员
CREATE TABLE admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);

-- 封禁 IP
CREATE TABLE banned_ips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 配置项（公告等）
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);
```

## 安全注意事项

- `.env` 文件已在 `.gitignore` 中排除，**切勿**提交到 Git
- 生产环境务必修改 `SESSION_SECRET` 为随机字符串
- 管理员首次登录后立即修改默认密码 `admin123`
- 头像上传限制 2MB，仅允许 png/jpg/gif/webp
- 前后端均对用户输入做了 XSS 转义

## 许可证

MIT
