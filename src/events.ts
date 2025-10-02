import { db } from './db.js'; // Импортируем нашу базу данных (db.ts создаёт таблицы и подключается к SQLite)
import { nanoid } from 'nanoid'; // Импортируем генератор случайных коротких id (будем присваивать событиям)
import { z } from 'zod'; // Импортируем библиотеку для валидации данных
import { toUTC } from './time.js'; // Утилита для перевода локального времени в UTC


// Тип для описания строки события в базе данных
export type EventRow = {
  id: string;              // уникальный ID события (nanoid)
  title: string;           // название события
  description?: string | null; // описание (опционально)
  start_at: string;        // дата и время начала в формате ISO (UTC)
  duration_min: number;    // продолжительность в минутах
  meeting_url: string;     // ссылка на встречу (Zoom/Meet и т.д.)
  is_public: number;       // 1 = публичное событие, 0 = приватное
  created_by?: number | null; // кто создал (id пользователя Telegram)
};

// --- Парсинг строки из команды /newevent ---
// Мы ожидаем формат: "Название | 2025-12-15 19:00 | 60 | https://link | public"
const NewEventSchema = z.tuple([
  z.string().min(2),                  // название (строка минимум из 2 символов)
  z.string().min(10),                 // дата и время в строке
  z.coerce.number().int().positive(), // длительность (число > 0)
  z.string().url(),                   // ссылка (валидный URL)
  z.enum(['public', 'private']).optional(), // видимость (опционально)
]);

// Функция, которая разбирает строку в удобный объект
export function parseNewEventLine(text: string) {
  // Разбиваем строку по символу "|"
  const raw = text.split('|').map(s => s.trim());

  // Проверяем, что данные подходят под схему (NewEventSchema)
  const parsed = NewEventSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('Формат: Название | YYYY-MM-DD HH:mm | 60 | https://link | public');
  }

  // Достаём данные из результата
  const [title, localDT, duration, url, vis] = parsed.data;

  // Возвращаем объект, который уже готов для записи в БД
  return {
    title,
    start_at: toUTC(localDT), // переводим дату в UTC
    duration_min: duration,
    meeting_url: url,
    is_public: vis === 'private' ? 0 : 1, // если private → 0, иначе → 1
  };
}

// --- Создание события в БД ---
export function createEvent(input: Omit<EventRow, 'id'>) {
  const id = nanoid(); // генерируем уникальный id
  db.prepare(
    `INSERT INTO events (id,title,description,start_at,duration_min,meeting_url,is_public,created_by)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    input.title,
    null,                // описание пока не используем
    input.start_at,
    input.duration_min,
    input.meeting_url,
    input.is_public,
    input.created_by ?? null,
  );
  return id; // возвращаем id, чтобы потом делиться ссылкой
}

// --- Получить событие по id ---
export function getEvent(eventId: string) {
  return db.prepare(
    `SELECT * FROM events WHERE id = ? AND cancelled_at IS NULL`,
  ).get(eventId) as EventRow | undefined;
}

// --- Список ближайших публичных событий ---
export function listPublicUpcoming(limit = 5) {
  return db.prepare(
    `SELECT id,title,start_at,meeting_url FROM events
     WHERE cancelled_at IS NULL
       AND is_public = 1
       AND datetime(start_at) >= datetime('now')
     ORDER BY start_at LIMIT ?`,
  ).all(limit) as Array<Pick<EventRow,'id'|'title'|'start_at'|'meeting_url'>>;
}

// --- Убедиться, что пользователь записан в таблице users ---
export function ensureUser(userId: number, username?: string) {
  db.prepare(
    `INSERT OR IGNORE INTO users (id, username) VALUES (?,?)`,
  ).run(userId, username ?? null);
}

// --- Подписка пользователя на событие ---
export function subscribe(userId: number, eventId: string) {
  db.prepare(
    `INSERT OR IGNORE INTO subscriptions (user_id,event_id) VALUES (?,?)`,
  ).run(userId, eventId);
}