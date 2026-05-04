const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const escapeHtml = require('escape-html');
const multer = require('multer');
const path = require('path');
const { getDb, saveDb } = require('../db');
const { requireUser } = require('../middleware/auth');

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

router.use(requireUser);

// Dashboard 首页
router.get('/', (req, res) => {
  const db = getDb();
  const userId = req.session.user.id;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get([userId]);
  const questions = db.prepare(`
    SELECT * FROM questions WHERE box_id = ? ORDER BY is_pinned DESC, created_at DESC
  `).all([userId]);

  const stats = {
    total: questions.length,
    answered: questions.filter(q => q.is_answered).length,
    hidden: questions.filter(q => q.is_hidden).length,
    public: questions.filter(q => !q.is_hidden && q.is_answered).length
  };

  res.render('dashboard', { user, questions, stats, message: req.query.message || null });
});

// 更新设置
router.post('/settings', upload.single('avatar'), (req, res) => {
  const db = getDb();
  const userId = req.session.user.id;

  const display_name = req.body.display_name || req.session.user.display_name;
  const accept_questions = req.body.accept_questions === '1' ? 1 : 0;
  const question_limit = parseInt(req.body.question_limit) || 500;

  let avatar = req.session.user.avatar;
  if (req.file) {
    avatar = '/uploads/' + req.file.filename;
  } else if (req.body.avatar_url) {
    avatar = req.body.avatar_url;
  }

  db.prepare(
    'UPDATE users SET display_name = ?, accept_questions = ?, question_limit = ?, avatar = ? WHERE id = ?'
  ).run([display_name, accept_questions, question_limit, avatar, userId]);
  saveDb();

  req.session.user.display_name = display_name;
  req.session.user.avatar = avatar;

  res.redirect('/dashboard?message=设置已更新');
});

// 修改密码
router.post('/change-password', (req, res) => {
  const db = getDb();
  const userId = req.session.user.id;
  const { current_password, new_password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get([userId]);
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    const questions = db.prepare('SELECT * FROM questions WHERE box_id = ? ORDER BY is_pinned DESC, created_at DESC').all([userId]);
    const stats = {
      total: questions.length,
      answered: questions.filter(q => q.is_answered).length,
      hidden: questions.filter(q => q.is_hidden).length,
      public: questions.filter(q => !q.is_hidden && q.is_answered).length
    };
    return res.render('dashboard', { user, questions, stats, message: '当前密码错误' });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run([hash, userId]);
  saveDb();
  res.redirect('/dashboard?message=密码已修改');
});

// 切换公开/隐藏
router.post('/questions/:id/toggle', (req, res) => {
  const db = getDb();
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get([req.params.id]);
  if (!q || q.box_id !== req.session.user.id) {
    return res.status(403).send('无权限');
  }
  db.prepare('UPDATE questions SET is_hidden = ? WHERE id = ?').run([q.is_hidden ? 0 : 1, req.params.id]);
  saveDb();
  res.redirect('/dashboard');
});

// 回答问题
router.post('/questions/:id/answer', (req, res) => {
  const db = getDb();
  const { answer_text } = req.body;
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get([req.params.id]);
  if (!q || q.box_id !== req.session.user.id) {
    return res.status(403).send('无权限');
  }

  db.prepare(
    "UPDATE questions SET answer_text = ?, is_answered = 1, answered_at = datetime('now') WHERE id = ?"
  ).run([escapeHtml(answer_text || ''), req.params.id]);
  saveDb();
  res.redirect('/dashboard');
});

// 删除问题
router.post('/questions/:id/delete', (req, res) => {
  const db = getDb();
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get([req.params.id]);
  if (!q || q.box_id !== req.session.user.id) {
    return res.status(403).send('无权限');
  }
  db.prepare('DELETE FROM questions WHERE id = ?').run([req.params.id]);
  saveDb();
  res.redirect('/dashboard');
});

// 置顶/取消置顶
router.post('/questions/:id/toggle-pin', (req, res) => {
  const db = getDb();
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get([req.params.id]);
  if (!q || q.box_id !== req.session.user.id) {
    return res.status(403).send('无权限');
  }
  db.prepare('UPDATE questions SET is_pinned = ? WHERE id = ?').run([q.is_pinned ? 0 : 1, req.params.id]);
  saveDb();
  res.redirect('/dashboard');
});

module.exports = router;
