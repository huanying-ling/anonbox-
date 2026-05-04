// 主人登录检查
function requireUser(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

// 管理员登录检查
function requireAdmin(req, res, next) {
  if (!req.session.admin) {
    return res.redirect('/admin/login');
  }
  next();
}

// 已登录则重定向到 dashboard
function redirectIfLoggedIn(req, res, next) {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  next();
}

module.exports = { requireUser, requireAdmin, redirectIfLoggedIn };
