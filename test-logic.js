// Простой тест для проверки логики работы функций
// Запуск: node test-logic.js

import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

// Создаем тестовую базу данных в памяти
const db = new Database(':memory:');

// Создаем таблицы
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    tz TEXT DEFAULT 'Europe/Lisbon',
    email TEXT,
    email_verified INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    start_at TEXT NOT NULL,
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
    PRIMARY KEY (user_id, event_id)
  );
`);

console.log('✅ База данных создана');

// Тест 1: Создание события
const eventId = nanoid();
const eventTitle = 'Test Event';
const startAt = new Date().toISOString();

db.prepare(
  `INSERT INTO events (id, title, start_at, duration_min, meeting_url, is_public, created_by)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
).run(eventId, eventTitle, startAt, 60, 'https://meet.test.com', 1, 123456789);

console.log('✅ Событие создано:', eventId);

// Тест 2: Регистрация пользователя
const userId1 = 111111111;
const userId2 = 222222222;

db.prepare(`INSERT OR IGNORE INTO users (id, username) VALUES (?, ?)`).run(userId1, 'testuser1');
db.prepare(`INSERT OR IGNORE INTO users (id, username) VALUES (?, ?)`).run(userId2, 'testuser2');

console.log('✅ Пользователи зарегистрированы');

// Тест 3: Подписка на событие
const subscribe = (userId, eventId) => {
  db.prepare(`INSERT OR IGNORE INTO subscriptions (user_id, event_id) VALUES (?, ?)`).run(userId, eventId);
};

subscribe(userId1, eventId);
subscribe(userId2, eventId);

console.log('✅ Подписки созданы');

// Тест 4: Получение подписчиков
const getSubscribers = (eventId) => {
  const rows = db.prepare(`SELECT user_id FROM subscriptions WHERE event_id = ?`).all(eventId);
  return rows.map(r => r.user_id);
};

const subscribers = getSubscribers(eventId);
console.log('✅ Подписчики события:', subscribers);
console.assert(subscribers.length === 2, 'Должно быть 2 подписчика');

// Тест 5: Проверка подписки
const isSubscribed = (userId, eventId) => {
  const result = db.prepare(`SELECT 1 FROM subscriptions WHERE user_id = ? AND event_id = ?`).get(userId, eventId);
  return !!result;
};

console.assert(isSubscribed(userId1, eventId), 'Пользователь 1 должен быть подписан');
console.assert(isSubscribed(userId2, eventId), 'Пользователь 2 должен быть подписан');
console.log('✅ Проверка подписки работает');

// Тест 6: Отписка
const unsubscribe = (userId, eventId) => {
  db.prepare(`DELETE FROM subscriptions WHERE user_id = ? AND event_id = ?`).run(userId, eventId);
};

unsubscribe(userId1, eventId);
console.assert(!isSubscribed(userId1, eventId), 'Пользователь 1 должен быть отписан');
console.assert(isSubscribed(userId2, eventId), 'Пользователь 2 все еще подписан');
console.log('✅ Отписка работает');

// Тест 7: Отмена события
const cancelEvent = (eventId) => {
  db.prepare(`UPDATE events SET cancelled_at = datetime('now') WHERE id = ?`).run(eventId);
};

cancelEvent(eventId);
const cancelledEvent = db.prepare(`SELECT * FROM events WHERE id = ?`).get(eventId);
console.assert(cancelledEvent.cancelled_at !== null, 'Событие должно быть отменено');
console.log('✅ Отмена события работает');

// Тест 8: Получение активных событий
const activeEvents = db.prepare(
  `SELECT id, title FROM events WHERE cancelled_at IS NULL AND datetime(start_at) >= datetime('now')`
).all();
console.log('✅ Активные события:', activeEvents.length);

// Тест 9: Обновление события
const updateEvent = (eventId, updates) => {
  const fields = [];
  const values = [];
  
  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  
  if (fields.length === 0) return false;
  
  fields.push('updated_at = datetime(\'now\')');
  values.push(eventId);
  
  db.prepare(`UPDATE events SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return true;
};

const newEventId = nanoid();
db.prepare(
  `INSERT INTO events (id, title, start_at, duration_min, meeting_url, is_public)
   VALUES (?, ?, ?, ?, ?, ?)`
).run(newEventId, 'Old Title', startAt, 60, 'https://meet.test.com', 1);

updateEvent(newEventId, { title: 'New Title' });
const updatedEvent = db.prepare(`SELECT title FROM events WHERE id = ?`).get(newEventId);
console.assert(updatedEvent.title === 'New Title', 'Название должно быть обновлено');
console.log('✅ Обновление события работает');

console.log('\n🎉 Все тесты прошли успешно!');
db.close();

