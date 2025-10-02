// 1) Загружаем переменные из .env (BOT_TOKEN, ADMINS и т.п.)
import 'dotenv/config';

// 2) Импортируем Telegram-бота и клавиатуры
import { Bot, InlineKeyboard } from 'grammy';

// 3) Наши утилиты для дат (красивые строки времени)
import { fmtLocal } from './time.js';

// 4) Бизнес-логика событий/подписок
import {
  ensureUser,          // записываем юзера в БД (если ещё нет)
  listPublicUpcoming,  // получаем список ближайших публичных событий
  parseNewEventLine,   // парсим строку из /newevent
  createEvent,         // создаём событие
  getEvent,            // находим событие по id
  subscribe,           // подписываем пользователя на событие
} from './events';

// --- Конфигурация бота ---
// 5) Токен из .env (выдаётся BotFather)
const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is missing in .env');

// 6) Список админов (числовые Telegram id) из .env
// Пример: ADMINS=123456789,987654321
const ADMINS = (process.env.ADMINS || '')
  .split(',')
  .map(s => Number(s.trim()))
  .filter(Boolean);

// 7) Создаём экземпляр бота
const bot = new Bot(token);

// Вспомогательный метод: проверить, является ли id админом
const isAdmin = (id?: number) => !!id && ADMINS.includes(id);

// --- Состояния ---
// Здесь будем хранить id пользователей, от которых мы ждём строку для создания события
const awaitingNewEvent = new Set<number>();

// --- Команды ---
// /whoami — возвращает числовой id пользователя (нужен, чтобы добавить себя в ADMINS)
bot.command('whoami', (ctx) => ctx.reply(`Ваш id: ${ctx.from?.id}`));

/**
 * /start
 * 1. Регистрируем пользователя в базе
 * 2. Показываем список ближайших публичных событий
 * 3. Для каждого события даём ссылку вида "/start event_<ID>"
 */
bot.command('start', async (ctx) => {
  ensureUser(ctx.from!.id, ctx.from?.username ?? undefined);

  const events = listPublicUpcoming(5);
  let text = 'Привет! Я помогу с напоминаниями о встречах QA Start.\nБлижайшие публичные события:';
  if (events.length === 0) text += '\n— пока нет анонсов.';

  for (const e of events) {
    text += `\n• ${e.title} — ${fmtLocal(e.start_at)} (локальное время)\n  /start event_${e.id}`;
  }

  await ctx.reply(text);
});

/**
 * Обработчик 1: проверка, ждём ли мы строку от пользователя (после /newevent)
 * - Если пользователь есть в awaitingNewEvent → парсим сообщение как событие
 * - Если нет → передаём дальше другим хендлерам (next)
 */
bot.on('message:text', async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId || !awaitingNewEvent.has(userId)) {
    return next(); // для других случаев передаём управление дальше
  }

  try {
    // Парсим строку "Название | дата | длительность | ссылка | public/private"
    const data = parseNewEventLine(ctx.message!.text!);

    // Создаём событие в базе
    const id = createEvent({ ...(data as any), created_by: ctx.from!.id });


    // Отправляем подтверждение и ссылку для подписки
    await ctx.reply(`Создано: ${data.title}\nID: ${id}\nСсылка для подписки: /start event_${id}`);
  } catch (e: any) {
    await ctx.reply(`Ошибка: ${e.message}`);
  } finally {
    // Важно: убираем пользователя из списка ожидания
    awaitingNewEvent.delete(userId);
  }
});

/**
 * Обработчик 2: deep-link "/start event_<ID>"
 * - Пользователь вручную или по ссылке открывает событие
 * - Показываем карточку с кнопками
 */
bot.on('message:text', async (ctx, next) => {
  const m = ctx.message.text?.match(/\/start\s+event_([\w-]+)/);
  if (!m) return next();

  const id = m[1];
  const e = getEvent(id);
  if (!e) return ctx.reply('Событие не найдено или отменено.');

  // Inline-клавиатура
  const kb = new InlineKeyboard()
    .text('Подписаться', `sub:${id}`)
    .row()
    .text('Добавить email', `email:${id}`);

  await ctx.reply(
    `Событие: *${e.title}*\nКогда: ${fmtLocal(e.start_at)}\nСсылка: ${e.meeting_url}`,
    { parse_mode: 'Markdown', reply_markup: kb },
  );
});

// --- Кнопки карточки события ---

// Подписка: добавляем запись user_id + event_id в таблицу subscriptions
bot.callbackQuery(/sub:(.+)/, async (ctx) => {
  const id = ctx.match[1];
  subscribe(ctx.from!.id, id);
  await ctx.answerCallbackQuery({ text: 'Подписка оформлена' });
  await ctx.editMessageReplyMarkup(); // убираем кнопки
});

// Добавление email (пока просто заглушка, реализуем позже)
bot.callbackQuery(/email:(.+)/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply('Пришлите email одним сообщением (будем дублировать уведомления).');
});

/**
 * /newevent — создание события
 * - Доступно только админам
 * - Добавляем пользователя в awaitingNewEvent
 * - Следующее его текстовое сообщение бот воспримет как событие
 */
bot.command('newevent', async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return ctx.reply('Только для админов.');
  awaitingNewEvent.add(ctx.from!.id);

  await ctx.reply(
    'Отправьте одной строкой:\n' +
    'Название | 2025-12-15 19:00 | 60 | https://meet.link | public\n\n' +
    '(Для отмены просто ничего не отправляйте или введите /start)'
  );
});

// --- Общие настройки ---
bot.catch((err) => console.error('Bot error:', err));
bot.start({ drop_pending_updates: true });
console.log('Bot started with events/subscriptions');