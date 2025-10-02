import Database from 'better-sqlite3';

export const db = new Database('./data.db');

// создаём таблицы, если их ещё нет
db.exec(`
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,         -- telegram user id
  username TEXT,
  tz TEXT DEFAULT 'Europe/Lisbon',
  email TEXT,
  email_verified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,            -- nanoid
  title TEXT NOT NULL,
  description TEXT,
  start_at TEXT NOT NULL,         -- UTC ISO
  duration_min INTEGER NOT NULL,
  meeting_url TEXT NOT NULL,
  is_public INTEGER DEFAULT 1,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT,
  cancelled_at TEXT
);

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id INTEGER,
  event_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, event_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (event_id) REFERENCES events(id)
);
`);
