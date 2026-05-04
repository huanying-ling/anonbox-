const express = require('express');
const router = express.Router();
const escapeHtml = require('escape-html');
const { getDb, saveDb } = require('../db');

const SENSITIVE_WORDS = [
  'fuck', 'shit', 'ass', 'bitch', 'damn',
  '他妈的', '操你', '傻逼', '贱人', '婊子',
  '垃圾', '废物', '白痴', '去死', '滚蛋',
  '色情', '赌博', '毒品', '枪支', '诈骗'
];

function filterSensitive(text) {
  let result = text;
  for (const word of SENSITIVE_WORDS) {
    const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    result = result.replace(regex, '***');
  }
  return result;
}

// ========== 主页入口（POST，URL 隐藏） ==========

router.post('/visit', (req, res) => {
  const db = getDb();
  const { slug } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE slug = ?').get([slug]);
  if (!user) return res.status(404).render('404');

  // 密码保护
  if (user.box_password && user.box_password.trim()) {
    if (!req.session.boxAccess || !req.session.boxAccess[slug]) {
      return res.render('box-locked', { box: user, error: null, visitMode: true });
    }
  }

  renderBox(req, res, user, true);
});

router.post('/visit/unlock', (req, res) => {
  const db = getDb();
  const { slug, box_password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE slug = ?').get([slug]);
  if (!user) return res.status(404).render('404');

  if (box_password === user.box_password) {
    if (!req.session.boxAccess) req.session.boxAccess = {};
    req.session.boxAccess[slug] = true;
    return renderBox(req, res, user, true);
  }

  res.render('box-locked', { box: user, error: '密码错误，请重试', visitMode: true });
});

router.post('/visit/ask', (req, res) => {
  handleAsk(req, res, null, true);
});

// ========== 直接 URL 访问 ==========

router.get('/:slug', (req, res) => {
  const db = getDb();
  const { slug } = req.params;

  if (['login', 'register', 'logout', 'dashboard', 'admin', 'api', 'public', 'uploads', 'visit'].includes(slug)) {
    return res.status(404).render('404');
  }

  const user = db.prepare('SELECT * FROM users WHERE slug = ?').get([slug]);
  if (!user) return res.status(404).render('404');

  renderBox(req, res, user, false);
});

router.post('/:slug/unlock', (req, res) => {
  const db = getDb();
  const { slug } = req.params;
  const { box_password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE slug = ?').get([slug]);
  if (!user) return res.status(404).render('404');

  if (box_password === user.box_password) {
    if (!req.session.boxAccess) req.session.boxAccess = {};
    req.session.boxAccess[slug] = true;
    return renderBox(req, res, user, false);
  }

  res.render('box-locked', { box: user, error: '密码错误，请重试', visitMode: false });
});

router.post('/:slug/ask', (req, res) => {
  handleAsk(req, res, req.params.slug, false);
});

// ========== 公共函数 ==========

function renderBox(req, res, user, visitMode) {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;

  const db = getDb();
  const questions = db.prepare(`
    SELECT * FROM questions
    WHERE box_id = ? AND is_hidden = 0 AND is_answered = 1
    ORDER BY is_pinned DESC, answered_at DESC
    LIMIT ? OFFSET ?
  `).all([user.id, limit, offset]);

  const countRow = db.prepare(
    'SELECT COUNT(*) as count FROM questions WHERE box_id = ? AND is_hidden = 0 AND is_answered = 1'
  ).get([user.id]);
  const total = countRow ? countRow.count : 0;
  const totalPages = Math.ceil(total / limit) || 1;

  res.render('box', {
    box: user,
    questions,
    currentPage: page,
    totalPages,
    success: req.query.success || null,
    visitMode
  });
}

function handleAsk(req, res, slugParam, visitMode) {
  const db = getDb();
  const slug = slugParam || req.body.slug;

  const user = db.prepare('SELECT * FROM users WHERE slug = ?').get([slug]);
  if (!user) return res.status(404).json({ error: '提问箱不存在' });

  if (!user.accept_questions) {
    return res.status(403).json({ error: '该提问箱暂不接受新提问' });
  }

  const ip = req.ip || req.connection.remoteAddress;
  const banned = db.prepare('SELECT id FROM banned_ips WHERE ip = ?').get([ip]);
  if (banned) {
    return res.status(403).json({ error: '您的IP已被禁止提问' });
  }

  let { nickname, question } = req.body;
  question = (question || '').trim();

  if (!question) {
    return res.status(400).json({ error: '请输入提问内容' });
  }

  if (question.length > user.question_limit) {
    return res.status(400).json({ error: `提问内容不能超过${user.question_limit}字` });
  }

  question = filterSensitive(question);
  let asker_nickname = (nickname || '').trim();
  if (!asker_nickname) asker_nickname = '匿名';
  else asker_nickname = filterSensitive(escapeHtml(asker_nickname));

  const ua = req.headers['user-agent'] || '';

  db.prepare(
    'INSERT INTO questions (box_id, asker_nickname, question_text, asker_ip, asker_ua) VALUES (?, ?, ?, ?, ?)'
  ).run([user.id, asker_nickname, escapeHtml(question), ip, ua]);
  saveDb();

  if (req.headers.accept?.includes('application/json') || req.xhr) {
    return res.json({ success: true, message: '提问已发送' });
  }
  if (visitMode) {
    return renderBox(req, res, user, true);
  }
  res.redirect(`/${slug}?success=1`);
}

module.exports = router;
