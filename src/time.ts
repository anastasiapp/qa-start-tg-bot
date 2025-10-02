// Luxon — удобная библиотека для работы с датами и часовыми поясами
import { DateTime } from 'luxon';

/**
 * Преобразовать локальную дату/время (введённые строкой) в ISO-дату в UTC.
 * Пример входа: "2025-12-15 19:00" — воспринимаем как локальное время на твоей машине.
 * На выходе: "2025-12-15T19:00:00.000Z" (UTC).
 */
export const toUTC = (isoOrLocal: string) =>
  DateTime.fromISO(isoOrLocal, { zone: 'local' }).toUTC().toISO();

/**
 * Преобразовать ISO в UTC → в объект даты для требуемого часового пояса.
 * По умолчанию используем 'local' — часовой пояс компьютера, где запущен бот.
 */
export const fromUTC = (isoUTC: string, tz = 'local') =>
  DateTime.fromISO(isoUTC, { zone: 'utc' }).setZone(tz);

/**
 * Красивое локальное форматирование даты/времени для сообщений бота.
 * Пример: "15 Dec 2025, 19:00"
 */
export const fmtLocal = (isoUTC: string) =>
  fromUTC(isoUTC).toFormat('dd LLL yyyy, HH:mm');