const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb, saveDb } = require('../db');
const { redirectIfLoggedIn } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'avatar-' + Date.now() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  }
});

// 将 sql.js exec 结果转为对象数组（用于复杂 JOIN 查询）
function execRows(db, sql, params = []) {
  const results = db.exec(sql, params);
  if (!results.length || !results[0].values.length) return [];
  const cols = results[0].columns;
  return results[0].values.map(row => {
    const obj = {};
    cols.forEach((c, i) => { obj[c] = row[i]; });
    return obj;
  });
}

// 首页
router.get('/', (req, res) => {
  const db = getDb();
  const boxes = execRows(db, `
    SELECT u.slug, u.display_name, u.avatar, u.box_password,
      (SELECT COUNT(*) FROM questions q WHERE q.box_id = u.id AND q.is_hidden = 0 AND q.is_answered = 1) as public_count
    FROM users u
    ORDER BY u.created_at DESC
  `);
  const ann = db.prepare("SELECT value FROM settings WHERE key = 'announcement'").get([]);
  const announcement = ann ? ann.value : '';
  res.render('index', { boxes, announcement });
});

// 注册页
router.get('/register', redirectIfLoggedIn, (req, res) => {
  res.render('register', { error: null });
});

// 注册处理
router.post('/register', upload.single('avatar'), (req, res) => {
  const db = getDb();
  const { username, slug, password, display_name, box_password } = req.body;

  if (!username || !slug || !password || !display_name) {
    return res.render('register', { error: '请填写所有必填字段' });
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.render('register', { error: 'URL标识只能包含小写字母、数字和连字符' });
  }
  if (password.length < 4) {
    return res.render('register', { error: '密码至少4个字符' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE slug = ? OR username = ?').get([slug, username]);
  if (existing) {
    return res.render('register', { error: 'URL标识或用户名已被使用' });
  }

  const password_hash = bcrypt.hashSync(password, 10);
  let avatar = req.body.avatar_url || '';
  if (req.file) {
    avatar = '/uploads/' + req.file.filename;
  }

  db.prepare(
    'INSERT INTO users (username, slug, password_hash, display_name, avatar, box_password) VALUES (?, ?, ?, ?, ?, ?)'
  ).run([username, slug, password_hash, display_name, avatar, box_password || '']);
  saveDb();
  const newUser = db.prepare('SELECT * FROM users WHERE username = ?').get([username]);

  req.session.user = {
    id: newUser.id,
    username: newUser.username,
    slug: newUser.slug,
    display_name: newUser.display_name,
    avatar: newUser.avatar
  };
  res.redirect('/dashboard');
});

// 登录页
router.get('/login', redirectIfLoggedIn, (req, res) => {
  res.render('login', { error: null });
});

// 登录处理
router.post('/login', (req, res) => {
  const db = getDb();
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get([username]);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.render('login', { error: '用户名或密码错误' });
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    slug: user.slug,
    display_name: user.display_name,
    avatar: user.avatar
  };
  res.redirect('/dashboard');
});

// 退出登录
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// 检查 slug 可用性
router.get('/api/check-slug', (req, res) => {
  const db = getDb();
  const { slug } = req.query;
  if (!slug) return res.json({ available: false });
  const existing = db.prepare('SELECT id FROM users WHERE slug = ?').get([slug]);
  res.json({ available: !existing });
});

module.exports = router;
