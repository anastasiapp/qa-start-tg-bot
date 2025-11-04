// 1) Загружаем переменные из .env (BOT_TOKEN, ADMINS и т.п.)
import 'dotenv/config';

// 2) Импортируем Telegram-бота и клавиатуры
import { Bot, InlineKeyboard } from 'grammy';

// 3) Наши утилиты для дат (красивые строки времени)
import { fmtLocal, getCalendarLink } from './time.js';

// 4) Бизнес-логика событий/подписок
import {
  ensureUser,          // записываем юзера в БД (если ещё нет)
  listPublicUpcoming,  // получаем список ближайших публичных событий
  parseNewEventLine,   // парсим строку из /newevent
  createEvent,         // создаём событие
  getEvent,            // находим событие по id
  subscribe,           // подписываем пользователя на событие
  unsubscribe,         // отписка от события
  isSubscribed,        // проверка подписки
  getSubscribers,      // получить список подписчиков
  getAllUsers,         // получить всех пользователей бота
  updateEvent,         // обновить событие
  cancelEvent,         // отменить событие
  type EventRow,       // тип события
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

// --- Функции для формирования карточек событий ---

/**
 * Формирует карточку события для админа с кнопками управления
 */
function formatEventCardForAdmin(event: EventRow): { text: string; keyboard: InlineKeyboard } {
  const text = `📅 *${event.title}*\n\n` +
    `📆 Когда: ${fmtLocal(event.start_at)}\n` +
    `⏱ Продолжительность: ${event.duration_min} минут\n` +
    `🔗 Ссылка: ${event.meeting_url}\n` +
    `👥 Участников: ${getSubscribers(event.id).length}`;

  const kb = new InlineKeyboard()
    .text('📢 Оповестить подписчиков бота', `notify:${event.id}`)
    .row()
    .text('✏️ Редактировать', `edit:${event.id}`)
    .text('❌ Отменить', `cancel:${event.id}`);

  return { text, keyboard: kb };
}

/**
 * Формирует карточку события для подписчика
 */
function formatEventCardForUser(event: EventRow, userId: number): { text: string; keyboard: InlineKeyboard } {
  const subscribed = isSubscribed(userId, event.id);

  const text = `📅 *${event.title}*\n\n` +
    `📆 Когда: ${fmtLocal(event.start_at)}\n` +
    `⏱ Продолжительность: ${event.duration_min} минут\n` +
    `🔗 Ссылка: ${event.meeting_url}`;

  const kb = new InlineKeyboard();
  
  if (subscribed) {
    kb.text('✅ Подписка активна', `sub:${event.id}`)
      .row()
      .text('📅 Добавить в календарь', `calendar:${event.id}`)
      .row()
      .text('❌ Отписаться', `unsub:${event.id}`);
  } else {
    kb.text('🔔 Подписаться', `sub:${event.id}`)
      .row()
      .text('📅 Добавить в календарь', `calendar:${event.id}`);
  }

  return { text, keyboard: kb };
}

/**
 * Отправляет карточку события всем пользователям бота (кто нажал /start)
 */
async function notifySubscribers(eventId: string) {
  const event = getEvent(eventId);
  if (!event) return;

  // Получаем всех пользователей, которые когда-либо нажали /start
  const allUsers = getAllUsers();
  if (allUsers.length === 0) return;

  for (const userId of allUsers) {
    try {
      const { text, keyboard } = formatEventCardForUser(event, userId);
      await bot.api.sendMessage(userId, text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } catch (error: any) {
      // Если пользователь заблокировал бота или произошла ошибка, просто пропускаем
      console.error(`Failed to send to user ${userId}:`, error.message);
    }
  }
}

// --- Состояния ---
// Здесь будем хранить id пользователей, от которых мы ждём строку для создания события
const awaitingNewEvent = new Set<number>();

// --- Команды ---
// /whoami — возвращает числовой id пользователя (нужен, чтобы добавить себя в ADMINS)
bot.command('whoami', (ctx) => ctx.reply(`Ваш id: ${ctx.from?.id}`));

/**
 * /start
 * 1. Регистрируем пользователя в базе
 * 2. Показываем приветственное сообщение и меню
 * 3. Информируем о подписке на бота
 */
bot.command('start', async (ctx) => {
  ensureUser(ctx.from!.id, ctx.from?.username ?? undefined);

  const text = '👋 Привет!\n\n' +
    'Я бот для уведомлений о встречах QA Start.\n\n' +
    '✅ Вы подписались на бота! Теперь вам будут приходить уведомления о новых событиях.\n\n' +
    '📋 Что можно сделать:\n' +
    '• Просмотреть события — используйте команду /start event_<ID> (если знаете ID события)\n' +
    '• Подписаться на конкретное событие — нажмите кнопку "Подписаться" в карточке события\n' +
    '• Добавить событие в календарь — используйте кнопку в карточке события\n\n' +
    'Для получения списка событий обратитесь к администратору.';

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

    // Получаем созданное событие и показываем карточку для админа
    const event = getEvent(id);
    if (event) {
      const { text, keyboard } = formatEventCardForAdmin(event);
      await ctx.reply(text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } else {
      await ctx.reply(`Создано: ${data.title}\nID: ${id}`);
    }
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
 * - Показываем карточку с кнопками (разную для админа и подписчика)
 */
bot.on('message:text', async (ctx, next) => {
  const m = ctx.message.text?.match(/\/start\s+event_([\w-]+)/);
  if (!m) return next();

  const id = m[1];
  const event = getEvent(id);
  if (!event) return ctx.reply('Событие не найдено или отменено.');

  const userId = ctx.from!.id;
  
  // Если админ - показываем карточку управления
  if (isAdmin(userId)) {
    const { text, keyboard } = formatEventCardForAdmin(event);
    await ctx.reply(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  } else {
    // Для обычных пользователей - карточка подписки
    const { text, keyboard } = formatEventCardForUser(event, userId);
    await ctx.reply(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  }
});

// --- Кнопки карточки события ---

// Подписка: добавляем запись user_id + event_id в таблицу subscriptions
bot.callbackQuery(/sub:(.+)/, async (ctx) => {
  const id = ctx.match[1];
  const event = getEvent(id);
  if (!event) {
    await ctx.answerCallbackQuery({ text: 'Событие не найдено' });
    return;
  }

  subscribe(ctx.from!.id, id);
  
  // Обновляем карточку с новым состоянием подписки
  const { text, keyboard } = formatEventCardForUser(event, ctx.from!.id);
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
  await ctx.answerCallbackQuery({ text: '✅ Подписка оформлена' });
});

// Отписка от события
bot.callbackQuery(/unsub:(.+)/, async (ctx) => {
  const id = ctx.match[1];
  const event = getEvent(id);
  if (!event) {
    await ctx.answerCallbackQuery({ text: 'Событие не найдено' });
    return;
  }

  unsubscribe(ctx.from!.id, id);
  
  // Обновляем карточку с новым состоянием подписки
  const { text, keyboard } = formatEventCardForUser(event, ctx.from!.id);
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
  await ctx.answerCallbackQuery({ text: '❌ Вы отписаны' });
});

// Добавить в календарь
bot.callbackQuery(/calendar:(.+)/, async (ctx) => {
  const id = ctx.match[1];
  const event = getEvent(id);
  if (!event) {
    await ctx.answerCallbackQuery({ text: 'Событие не найдено' });
    return;
  }

  const calendarLink = getCalendarLink(
    event.title,
    event.start_at,
    event.duration_min,
    event.meeting_url
  );

  await ctx.answerCallbackQuery();
  await ctx.reply(
    `📅 Добавьте событие в календарь:\n\n${calendarLink}`,
    { parse_mode: 'Markdown' }
  );
});

// Оповестить подписчиков (только для админов)
bot.callbackQuery(/notify:(.+)/, async (ctx) => {
  if (!isAdmin(ctx.from?.id)) {
    await ctx.answerCallbackQuery({ text: 'Только для админов' });
    return;
  }

  const id = ctx.match[1];
  const event = getEvent(id);
  if (!event) {
    await ctx.answerCallbackQuery({ text: 'Событие не найдено' });
    return;
  }

  await ctx.answerCallbackQuery({ text: 'Отправляю уведомления...' });
  
  await notifySubscribers(id);
  
  // Обновляем карточку админа с актуальным количеством участников
  const { text, keyboard } = formatEventCardForAdmin(event);
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
  
  const allUsersCount = getAllUsers().length;
  await ctx.answerCallbackQuery({ 
    text: allUsersCount > 0 
      ? `✅ Уведомления отправлены ${allUsersCount} участникам бота` 
      : '⚠️ Нет участников для оповещения'
  });
});

// Редактировать событие (только для админов, пока заглушка)
bot.callbackQuery(/edit:(.+)/, async (ctx) => {
  if (!isAdmin(ctx.from?.id)) {
    await ctx.answerCallbackQuery({ text: 'Только для админов' });
    return;
  }

  await ctx.answerCallbackQuery();
  await ctx.reply('Редактирование событий будет реализовано в следующей версии. Используйте /newevent для создания нового события.');
});

// Отменить событие (только для админов)
bot.callbackQuery(/cancel:(.+)/, async (ctx) => {
  if (!isAdmin(ctx.from?.id)) {
    await ctx.answerCallbackQuery({ text: 'Только для админов' });
    return;
  }

  const id = ctx.match[1];
  const event = getEvent(id);
  if (!event) {
    await ctx.answerCallbackQuery({ text: 'Событие не найдено' });
    return;
  }

  cancelEvent(id);
  
  // Отправляем уведомления всем пользователям бота об отмене
  const allUsers = getAllUsers();
  for (const userId of allUsers) {
    try {
      await bot.api.sendMessage(
        userId,
        `❌ Событие "${event.title}" отменено.\n\nДата: ${fmtLocal(event.start_at)}`,
        { parse_mode: 'Markdown' }
      );
    } catch (error: any) {
      console.error(`Failed to send cancellation to user ${userId}:`, error.message);
    }
  }
  
  await ctx.editMessageText(
    `❌ Событие "${event.title}" отменено.\n\n${allUsers.length > 0 ? `Уведомления отправлены ${allUsers.length} участникам бота.` : 'Участников не было.'}`,
    { parse_mode: 'Markdown' }
  );
  await ctx.answerCallbackQuery({ text: 'Событие отменено' });
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