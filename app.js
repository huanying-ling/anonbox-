require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const { init: initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// 视图引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 中间件
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true
  }
}));

// 全局变量传递给模板
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.admin = req.session.admin || null;
  res.locals.path = req.path;
  next();
});

// 路由 — 注意顺序：具体路由必须在通配 :slug 之前
app.use('/dashboard', require('./routes/dashboard'));
app.use('/admin', require('./routes/admin'));
app.use('/', require('./routes/index'));
app.use('/', require('./routes/box'));

// 404
app.use((req, res) => {
  res.status(404).render('404');
});

// 错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('500');
});

// 初始化数据库并启动
(async () => {
  await initDb();
  app.listen(PORT, () => {
    console.log(`[AskBox] Server running at http://localhost:${PORT}`);
  });
})();
