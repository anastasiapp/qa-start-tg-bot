// Luxon — библиотека для работы с датами и часовыми поясами
import { DateTime } from 'luxon';

/**
 * Пытается распарсить локальную дату/время из нескольких популярных форматов
 * и вернуть ISO в UTC. Бросает понятную ошибку, если ничего не подошло.
 *
 * Поддерживаемые примеры:
 * - "2025-12-15 19:00"
 * - "2025-12-15T19:00"
 * - "15.12.2025 19:00"
 */
export function parseLocalToUTC(input: string): string {
  // нормализуем пробелы
  const normalized = input.replace(/\s+/g, ' ').trim();

  // Порядок попыток: ISO, YYYY-MM-DD HH:mm, DD.MM.YYYY HH:mm
  const candidates = [
    () => DateTime.fromISO(normalized, { zone: 'local' }),
    () => DateTime.fromFormat(normalized, 'yyyy-MM-dd HH:mm', { zone: 'local' }),
    () => DateTime.fromFormat(normalized, 'dd.MM.yyyy HH:mm', { zone: 'local' }),
  ];

  for (const make of candidates) {
    const dt = make();
    if (dt.isValid) return dt.toUTC().toISO();
  }

  // Если ни один формат не подошёл — даём человеку подсказку
  throw new Error(
    `Не удалось распознать дату/время: "${input}". ` +
    `Попробуйте форматы: 2025-12-15 19:00 или 2025-12-15T19:00 или 15.12.2025 19:00`
  );
}

/** Перевод из ISO UTC в объект Luxon в нужном часовом поясе (по умолчанию — локальный) */
export const fromUTC = (isoUTC: string, tz = 'local') =>
  DateTime.fromISO(isoUTC, { zone: 'utc' }).setZone(tz);

/** Красивое локальное форматирование для сообщений бота */
export const fmtLocal = (isoUTC: string) =>
  fromUTC(isoUTC).toFormat('dd LLL yyyy, HH:mm');