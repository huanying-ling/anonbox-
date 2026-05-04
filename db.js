const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.db');

let _db = null;

function getDb() {
  if (!_db) throw new Error('Database not initialized. Call init() first.');
  return _db;
}

function saveDb() {
  const data = _db.raw.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

async function init() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  let buffer;
  try {
    buffer = fs.readFileSync(DB_PATH);
  } catch (e) {
    buffer = null;
  }

  const rawDb = new SQL.Database(buffer);
  _db = wrapDb(rawDb);

  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
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
    )
  `);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS questions (
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
    )
  `);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    )
  `);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS banned_ips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT ''
    )
  `);

  saveDb();

  // 迁移：为已有数据库添加新字段（忽略已存在的列）
  const migrations = [
    "ALTER TABLE users ADD COLUMN box_password TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN accept_questions INTEGER DEFAULT 1",
    "ALTER TABLE users ADD COLUMN question_limit INTEGER DEFAULT 500"
  ];
  for (const sql of migrations) {
    try { _db.raw.run(sql); saveDb(); } catch (e) { /* 列已存在则跳过 */ }
  }

  const bcrypt = require('bcryptjs');
  const existing = _db.prepare('SELECT id FROM admins WHERE username = ?').get(['admin']);
  if (!existing) {
    const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123';
    const hash = bcrypt.hashSync(defaultPassword, 10);
    _db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(['admin', hash]);
    saveDb();
    console.log('[DB] Default admin account created: admin / ' + defaultPassword);
  }

  console.log('[DB] Database initialized.');
}

function lastInsertRowId() {
  const result = _db.exec('SELECT last_insert_rowid() as id');
  if (result.length > 0 && result[0].values.length > 0) {
    return result[0].values[0][0];
  }
  return 0;
}

// ============== 兼容层 ==============

function wrapDb(raw) {
  return {
    raw,

    exec(sql, params) {
      if (params && params.length > 0) {
        return raw.exec(sql, params);
      }
      return raw.exec(sql);
    },

    prepare(sql) {
      return wrapStmt(raw, sql);
    },

    export() {
      return raw.export();
    }
  };
}

function wrapStmt(rawDb, sql) {
  return {
    get(params) {
      let rows;
      if (params && params.length > 0) {
        rows = rawDb.exec(sql, params);
      } else {
        rows = rawDb.exec(sql);
      }
      if (!rows.length || !rows[0].values.length) return undefined;
      const cols = rows[0].columns;
      const vals = rows[0].values[0];
      const obj = {};
      cols.forEach((c, i) => { obj[c] = vals[i]; });
      return obj;
    },

    all(params) {
      let rows;
      if (params && params.length > 0) {
        rows = rawDb.exec(sql, params);
      } else {
        rows = rawDb.exec(sql);
      }
      if (!rows.length || !rows[0].values.length) return [];
      const cols = rows[0].columns;
      return rows[0].values.map(vals => {
        const obj = {};
        cols.forEach((c, i) => { obj[c] = vals[i]; });
        return obj;
      });
    },

    run(params) {
      if (params && params.length > 0) {
        rawDb.run(sql, params);
      } else {
        rawDb.run(sql);
      }
      return { changes: rawDb.getRowsModified() };
    }
  };
}

module.exports = { getDb, init, saveDb, lastInsertRowId };
