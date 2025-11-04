// Тест парсинга строки события
// Формат: "Название | 2025-12-15 19:00 | 60 | https://link | public"

import { z } from 'zod';
import { DateTime } from 'luxon';

const NewEventSchema = z.tuple([
  z.string().min(2),
  z.string().min(10),
  z.coerce.number().int().positive(),
  z.string().url(),
  z.enum(['public', 'private']).optional(),
]);

function parseNewEventLine(text) {
  const raw = text.split('|').map(s => s.trim());
  const parsed = NewEventSchema.safeParse(raw);
  
  if (!parsed.success) {
    throw new Error('Формат: Название | YYYY-MM-DD HH:mm | 60 | https://link | public');
  }

  const [title, localDT, duration, url, vis] = parsed.data;
  
  return {
    title,
    start_at: parseLocalToUTC(localDT),
    duration_min: duration,
    meeting_url: url,
    is_public: vis === 'private' ? 0 : 1,
  };
}

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

console.log('🧪 Тестирование парсинга событий...\n');

// Тест 1: Корректный формат
try {
  const test1 = parseNewEventLine('Sprint Review #5 | 2025-12-15 19:00 | 60 | https://meet.google.com/abc | public');
  console.log('✅ Корректный формат:', test1);
  console.assert(test1.title === 'Sprint Review #5', 'Название должно быть правильным');
  console.assert(test1.duration_min === 60, 'Длительность должна быть 60');
  console.assert(test1.is_public === 1, 'Событие должно быть публичным');
} catch (e) {
  console.error('❌ Ошибка:', e.message);
}

// Тест 2: Приватное событие
try {
  const test2 = parseNewEventLine('Private Meeting | 2025-12-20 14:00 | 30 | https://zoom.us/j/123 | private');
  console.log('✅ Приватное событие:', test2);
  console.assert(test2.is_public === 0, 'Событие должно быть приватным');
} catch (e) {
  console.error('❌ Ошибка:', e.message);
}

// Тест 3: Без указания видимости (должно быть публичным по умолчанию)
try {
  const test3 = parseNewEventLine('Default Event | 2025-12-25 10:00 | 45 | https://meet.test.com/xyz');
  console.log('✅ Без указания видимости:', test3);
  console.assert(test3.is_public === 1, 'По умолчанию должно быть публичным');
} catch (e) {
  console.error('❌ Ошибка:', e.message);
}

// Тест 4: Неправильный формат (должна быть ошибка)
try {
  parseNewEventLine('Short | 2025-12-15 | 60 | https://link');
  console.error('❌ Должна была быть ошибка для неправильного формата');
} catch (e) {
  console.log('✅ Правильно обработана ошибка:', e.message);
}

// Тест 5: Неправильный URL (должна быть ошибка)
try {
  parseNewEventLine('Test | 2025-12-15 19:00 | 60 | not-a-url | public');
  console.error('❌ Должна была быть ошибка для неправильного URL');
} catch (e) {
  console.log('✅ Правильно обработана ошибка URL:', e.message);
}

// Тест 6: Отрицательная длительность (должна быть ошибка)
try {
  parseNewEventLine('Test | 2025-12-15 19:00 | -30 | https://meet.test.com | public');
  console.error('❌ Должна была быть ошибка для отрицательной длительности');
} catch (e) {
  console.log('✅ Правильно обработана ошибка длительности');
}

console.log('\n🎉 Все тесты парсинга прошли успешно!');

