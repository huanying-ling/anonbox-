const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb, saveDb } = require('../db');
const { requireAdmin } = require('../middleware/auth');

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

function renderDashboard(req, res, db, message) {
  const boxCountRow = db.exec('SELECT COUNT(*) as count FROM users');
  const boxCount = boxCountRow[0].values[0][0];
  const questionCountRow = db.exec('SELECT COUNT(*) as count FROM questions');
  const questionCount = questionCountRow[0].values[0][0];
  const todayCountRow = db.exec("SELECT COUNT(*) as count FROM questions WHERE date(created_at) = date('now')");
  const todayCount = todayCountRow[0].values[0][0];
  const ann = db.prepare("SELECT value FROM settings WHERE key = 'announcement'").get([]);
  res.render('admin/dashboard', {
    admin: req.session.admin,
    stats: { boxCount, questionCount, todayCount },
    announcement: ann ? ann.value : '',
    message
  });
}

// 管理员登录页面
router.get('/login', (req, res) => {
  if (req.session.admin) return res.redirect('/admin');
  res.render('admin/login', { error: null });
});

// 管理员登录处理
router.post('/login', (req, res) => {
  const db = getDb();
  const { username, password } = req.body;

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get([username]);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.render('admin/login', { error: '用户名或密码错误' });
  }

  req.session.admin = { id: admin.id, username: admin.username };

  if (password === (process.env.ADMIN_DEFAULT_PASSWORD || 'admin123')) {
    req.session.admin.mustChangePassword = true;
  }

  res.redirect('/admin');
});

// 管理员退出
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

router.use(requireAdmin);

// 仪表盘
router.get('/', (req, res) => {
  renderDashboard(req, res, getDb(), null);
});

// 修改密码
router.post('/change-password', (req, res) => {
  const db = getDb();
  const { current_password, new_password } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get([req.session.admin.id]);

  if (!bcrypt.compareSync(current_password, admin.password_hash)) {
    return renderDashboard(req, res, db, '当前密码错误');
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run([hash, req.session.admin.id]);
  saveDb();
  req.session.admin.mustChangePassword = false;
  renderDashboard(req, res, db, '密码已修改');
});

// 问题列表
router.get('/questions', (req, res) => {
  const db = getDb();
  const { slug, ip, date, page: p } = req.query;
  const page = parseInt(p) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  let where = [];
  let params = [];

  if (slug) {
    where.push("u.slug LIKE ?");
    params.push(`%${slug}%`);
  }
  if (ip) {
    where.push("q.asker_ip LIKE ?");
    params.push(`%${ip}%`);
  }
  if (date) {
    where.push("date(q.created_at) = ?");
    params.push(date);
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

  const questions = execRows(db, `
    SELECT q.*, u.slug as box_slug, u.display_name as owner_name
    FROM questions q
    JOIN users u ON q.box_id = u.id
    ${whereClause}
    ORDER BY q.created_at DESC
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  const totalRow = db.exec(`
    SELECT COUNT(*) as count
    FROM questions q
    JOIN users u ON q.box_id = u.id
    ${whereClause}
  `, params);
  const total = totalRow[0].values[0][0];
  const totalPages = Math.ceil(total / limit) || 1;

  res.render('admin/questions', {
    admin: req.session.admin,
    questions,
    currentPage: page,
    totalPages,
    filters: { slug, ip, date }
  });
});

// 删除问题
router.post('/questions/:id/delete', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM questions WHERE id = ?').run([req.params.id]);
  saveDb();
  res.redirect('/admin/questions');
});

// 封禁 IP
router.post('/ban-ip', (req, res) => {
  const db = getDb();
  const { ip } = req.body;
  if (ip && ip.trim()) {
    db.prepare('INSERT OR IGNORE INTO banned_ips (ip) VALUES (?)').run([ip.trim()]);
    saveDb();
  }
  res.redirect('/admin/questions');
});

// 解封 IP
router.post('/unban-ip', (req, res) => {
  const db = getDb();
  const { ip } = req.body;
  if (ip && ip.trim()) {
    db.prepare('DELETE FROM banned_ips WHERE ip = ?').run([ip.trim()]);
    saveDb();
  }
  res.redirect('/admin/questions');
});

// 查看封禁列表
router.get('/banned', (req, res) => {
  const db = getDb();
  const banned = db.prepare('SELECT * FROM banned_ips ORDER BY created_at DESC').all([]);
  res.render('admin/banned', { admin: req.session.admin, banned });
});

// 提问箱管理
router.get('/boxes', (req, res) => {
  const db = getDb();
  const boxes = db.prepare(`
    SELECT u.*,
      (SELECT COUNT(*) FROM questions q WHERE q.box_id = u.id) as total_questions,
      (SELECT COUNT(*) FROM questions q WHERE q.box_id = u.id AND q.is_answered = 1) as answered_count
    FROM users u
    ORDER BY u.created_at DESC
  `).all([]);
  res.render('admin/boxes', { admin: req.session.admin, boxes });
});

// 删除提问箱
router.post('/boxes/:id/delete', (req, res) => {
  const db = getDb();
  const boxId = req.params.id;
  db.prepare('DELETE FROM questions WHERE box_id = ?').run([boxId]);
  db.prepare('DELETE FROM users WHERE id = ?').run([boxId]);
  saveDb();
  res.redirect('/admin/boxes');
});

// 更新公告
router.post('/announcement', (req, res) => {
  const db = getDb();
  const { announcement } = req.body;
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(['announcement', announcement || '']);
  saveDb();
  res.redirect('/admin');
});

module.exports = router;
