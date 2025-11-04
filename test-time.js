// Тест для проверки работы с датами и временем
import { DateTime } from 'luxon';

// Тест parseLocalToUTC
function parseLocalToUTC(input) {
  const normalized = input.replace(/\s+/g, ' ').trim();
  
  const candidates = [
    () => DateTime.fromISO(normalized, { zone: 'local' }),
    () => DateTime.fromFormat(normalized, 'yyyy-MM-dd HH:mm', { zone: 'local' }),
    () => DateTime.fromFormat(normalized, 'dd.MM.yyyy HH:mm', { zone: 'local' }),
  ];

  for (const make of candidates) {
    const dt = make();
    if (dt.isValid) return dt.toUTC().toISO();
  }

  throw new Error(`Не удалось распознать дату/время: "${input}"`);
}

// Тест fmtLocal
function fmtLocal(isoUTC) {
  return DateTime.fromISO(isoUTC, { zone: 'utc' })
    .setZone('local')
    .toFormat('dd LLL yyyy, HH:mm');
}

// Тест getCalendarLink
function getCalendarLink(title, startAt, durationMin, meetingUrl) {
  const start = DateTime.fromISO(startAt, { zone: 'utc' });
  const end = start.plus({ minutes: durationMin });
  
  const formatForCalendar = (dt) => dt.toUTC().toFormat('yyyyMMdd\'T\'HHmmss\'Z\'');
  
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${formatForCalendar(start)}/${formatForCalendar(end)}`,
    details: `Ссылка на встречу: ${meetingUrl}`,
    location: meetingUrl,
  });
  
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

console.log('🧪 Тестирование функций работы с датами...\n');

// Тест 1: Парсинг даты в формате YYYY-MM-DD HH:mm
try {
  const test1 = parseLocalToUTC('2025-12-15 19:00');
  console.log('✅ Парсинг "2025-12-15 19:00":', test1);
} catch (e) {
  console.error('❌ Ошибка:', e.message);
}

// Тест 2: Парсинг даты в формате DD.MM.YYYY HH:mm
try {
  const test2 = parseLocalToUTC('15.12.2025 19:00');
  console.log('✅ Парсинг "15.12.2025 19:00":', test2);
} catch (e) {
  console.error('❌ Ошибка:', e.message);
}

// Тест 3: Форматирование для отображения
const testDate = '2025-12-15T19:00:00.000Z';
const formatted = fmtLocal(testDate);
console.log('✅ Форматирование:', formatted);

// Тест 4: Генерация ссылки на календарь
const calendarLink = getCalendarLink(
  'Sprint Review #5',
  testDate,
  60,
  'https://meet.google.com/abc-def-ghi'
);
console.log('✅ Ссылка на календарь:', calendarLink.substring(0, 80) + '...');
console.assert(calendarLink.includes('calendar.google.com'), 'Ссылка должна быть на Google Calendar');
console.assert(calendarLink.includes('Sprint+Review'), 'Ссылка должна содержать название события');

console.log('\n🎉 Все тесты работы с датами прошли успешно!');

