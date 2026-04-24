const fs = require('fs');
const path = require('path');
const { Telegraf, Markup, session } = require('telegraf');
const {
  PAYMENT_OPTIONS,
  PROVIDER_AVAILABILITY,
  SERVICE_TEMPLATES,
  URGENCY_OPTIONS,
} = require('./config/app-data');
const { MENU } = require('./config/ui-copy');
const {
  availabilityLabel,
  getOrderDisplayTitle,
  getPopularServices,
  getProviderAvailabilityStats,
  getServiceTemplate,
  priceLabel,
  statusLabel,
  urgencyBadge,
  urgencyLabel,
  urgencyPriority,
} = require('./domain/order-helpers');

const ENV_PATH = path.join(__dirname, '..', '.env');
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

const DEFAULT_DB = {
  houses: [
    {
      id: 'house_1',
      title: 'ЖК Северный, дом 1',
      city: 'Москва',
      address: 'ул. Примерная, 1',
      isActive: true,
    },
    {
      id: 'house_2',
      title: 'ЖК Северный, дом 2',
      city: 'Москва',
      address: 'ул. Примерная, 2',
      isActive: true,
    },
  ],
  users: [],
  orders: [],
  listings: [],
};

const REGISTRATION_STEPS = {
  NAME: 'registration_name',
  PHONE: 'registration_phone',
  ROLE: 'registration_role',
  HOUSE: 'registration_house',
  ENTRANCE: 'registration_entrance',
  FLOOR: 'registration_floor',
  APARTMENT: 'registration_apartment',
};

const ORDER_STEPS = {
  REQUEST_DETAILS: 'request_details',
  BAGS: 'trash_bags',
  COMMENT: 'trash_comment',
  URGENCY: 'request_urgency',
  PRICE: 'request_price',
  PAYMENT: 'trash_payment',
  READY_CONFIRM: 'ready_confirm',
  PHOTO_BEFORE: 'trash_photo_before',
  PHOTO_AFTER: 'trash_photo_after',
};

const CANCEL_TEXT = '❌ Отмена';
const FORCE_CREATE_TEXT = '⚠️ Все равно создать';
const CHANGE_URGENCY_TEXT = '🔄 Сменить срочность';

function loadEnvFile() {
  if (!fs.existsSync(ENV_PATH)) {
    return;
  }

  const lines = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (!key || process.env[key]) {
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2));
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDb(db) {
  ensureDb();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function withDb(mutator) {
  const db = readDb();
  const result = mutator(db);
  writeDb(db);
  return result;
}

function getTelegramUser(ctx) {
  return ctx.from || {};
}

function getUserByTelegramId(telegramId) {
  const db = readDb();
  return db.users.find((user) => user.telegramId === String(telegramId));
}

function getHouse(houseId) {
  const db = readDb();
  return db.houses.find((house) => house.id === houseId);
}

function getOrder(orderId) {
  const db = readDb();
  return db.orders.find((order) => order.id === orderId);
}

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function compactUserLabel(user) {
  return [user.name, user.username ? `@${user.username}` : null].filter(Boolean).join(' ');
}

function isFinishedOrderStatus(status) {
  return ['confirmed', 'cancelled'].includes(status);
}

function getMainKeyboard(user) {
  const buttons = [];

  if (user) {
    buttons.push([MENU.NEED_HELP, MENU.MY_ORDERS]);
    buttons.push([MENU.COMPLETED_ORDERS]);
    buttons.push([MENU.POPULAR]);
    if (user.role === 'provider') {
      buttons.push([MENU.HOUSE_REQUESTS]);
      buttons.push([MENU.AVAILABILITY]);
    }
    buttons.push([MENU.MY_HOUSE, MENU.PROFILE]);
    buttons.push([MENU.FUTURE_MODULES]);
  } else {
    buttons.push([MENU.START_REGISTRATION]);
  }

  return Markup.keyboard(buttons).resize();
}

function getCancelKeyboard() {
  return Markup.keyboard([[CANCEL_TEXT]]).resize().oneTime();
}

function houseLabel(house) {
  return `${house.title} (${house.address})`;
}

function roleLabel(role) {
  if (role === 'provider') {
    return 'Исполнитель';
  }
  return 'Заказчик';
}

function getAvailabilityInlineKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🟢 Готов помочь сейчас', `availability:${PROVIDER_AVAILABILITY.READY_NOW}`)],
    [Markup.button.callback('🕒 Смогу позже', `availability:${PROVIDER_AVAILABILITY.LATER}`)],
    [Markup.button.callback('⛔ Не на связи', `availability:${PROVIDER_AVAILABILITY.OFFLINE}`)],
  ]);
}

function getUrgencyKeyboard() {
  return Markup.keyboard([
    [URGENCY_OPTIONS[0].label],
    [URGENCY_OPTIONS[1].label],
    [URGENCY_OPTIONS[2].label],
    [CANCEL_TEXT],
  ]).resize().oneTime();
}

function getPaymentKeyboard() {
  return Markup.keyboard([
    [PAYMENT_OPTIONS[0], PAYMENT_OPTIONS[1]],
    [PAYMENT_OPTIONS[2]],
    [CANCEL_TEXT],
  ]).resize().oneTime();
}

function getAvailabilityWarningKeyboard() {
  return Markup.keyboard([
    [FORCE_CREATE_TEXT],
    [CHANGE_URGENCY_TEXT],
    [CANCEL_TEXT],
  ]).resize().oneTime();
}

function getRequestTypeInlineKeyboard() {
  return Markup.inlineKeyboard(
    SERVICE_TEMPLATES.map((service) => [
      Markup.button.callback(service.title, `request_type:${service.key}`),
    ])
  );
}

function getPopularServicesInlineKeyboard(services) {
  return Markup.inlineKeyboard(
    services.map((service) => [
      Markup.button.callback(
        service.supported ? `Выбрать: ${service.title}` : `Скоро: ${service.title}`,
        `popular_service:${service.key}`
      ),
    ])
  );
}

function oppositeRole(role) {
  return role === 'provider' ? 'client' : 'provider';
}

function getProfileInlineKeyboard(user) {
  if (!user) {
    return undefined;
  }

  return Markup.inlineKeyboard([
    [Markup.button.callback(`Стать ${roleLabel(oppositeRole(user.role)).toLowerCase()}`, `switch_role:${oppositeRole(user.role)}`)],
  ]);
}

function publicOrderText(order, client, house) {
  if (order.type === 'service') {
    return [
      `${urgencyBadge(order.urgencyKey)} · ${getOrderDisplayTitle(order)} #${order.id}`,
      `💰 Цена: ${priceLabel(order.price)}`,
      `⏰ Срочность: ${urgencyLabel(order.urgencyKey)}`,
      `📌 Статус: ${statusLabel(order.status)}`,
      `🏠 Дом: ${houseLabel(house)}`,
      `💬 Запрос: ${order.comment || 'без описания'}`,
      `💳 Условия: ${order.paymentMethod || 'договоримся'}`,
      `🚪 Подъезд: ${client.entrance}`,
      `🛗 Этаж: ${client.floor}`,
      '🔒 Квартира: скрыта до взятия запроса',
    ].join('\n');
  }

  return [
    `${urgencyBadge(order.urgencyKey)} · 🗑 Новый заказ #${order.id}`,
    `💰 Цена: ${priceLabel(order.price)}`,
    `⏰ Срочность: ${urgencyLabel(order.urgencyKey)}`,
    `📌 Статус: ${statusLabel(order.status)}`,
    `🏠 Дом: ${houseLabel(house)}`,
    `🛍 Пакетов: ${order.bagsCount}`,
    `💬 Комментарий: ${order.comment || 'нет'}`,
    `💳 Оплата: ${order.paymentMethod}`,
    `🚪 Подъезд: ${client.entrance}`,
    `🛗 Этаж: ${client.floor}`,
    '🔒 Квартира: скрыта до взятия заказа',
  ].join('\n');
}

function assignedOrderText(order, client, house) {
  if (order.type === 'service') {
    return [
      `✅ ${getOrderDisplayTitle(order)} теперь ваш`,
      `💰 Цена: ${priceLabel(order.price)}`,
      `⏰ Срочность: ${urgencyLabel(order.urgencyKey)}`,
      `📌 Статус: ${statusLabel(order.status)}`,
      `🏠 Дом: ${houseLabel(house)}`,
      `👤 Клиент: ${compactUserLabel(client) || 'без имени'}`,
      `💬 Запрос: ${order.comment || 'без описания'}`,
      `💳 Условия: ${order.paymentMethod || 'договоримся'}`,
      `🚪 Подъезд: ${client.entrance}`,
      `🛗 Этаж: ${client.floor}`,
      `🚪 Квартира: ${client.apartment}`,
    ].join('\n');
  }

  return [
    `✅ Заказ #${order.id} теперь ваш`,
    `💰 Цена: ${priceLabel(order.price)}`,
    `⏰ Срочность: ${urgencyLabel(order.urgencyKey)}`,
    `📌 Статус: ${statusLabel(order.status)}`,
    `🏠 Дом: ${houseLabel(house)}`,
    `👤 Клиент: ${compactUserLabel(client) || 'без имени'}`,
    `🛍 Пакетов: ${order.bagsCount}`,
    `💬 Комментарий: ${order.comment || 'нет'}`,
    `💳 Оплата: ${order.paymentMethod}`,
    `🚪 Подъезд: ${client.entrance}`,
    `🛗 Этаж: ${client.floor}`,
    `🚪 Квартира: ${client.apartment}`,
  ].join('\n');
}

function orderSummaryForClient(order, provider) {
  if (order.type === 'service') {
    return [
      `${getOrderDisplayTitle(order)} #${order.id}`,
      `💰 Цена: ${priceLabel(order.price)}`,
      `⏰ Срочность: ${urgencyLabel(order.urgencyKey)}`,
      `📌 Статус: ${statusLabel(order.status)}`,
      provider ? `🧰 Исполнитель: ${compactUserLabel(provider) || 'без имени'}` : '🧰 Исполнитель: еще не назначен',
      `💬 Запрос: ${order.comment || 'без описания'}`,
      `💳 Условия: ${order.paymentMethod || 'договоримся'}`,
    ].join('\n');
  }

  return [
    `📦 Заказ #${order.id}`,
    `💰 Цена: ${priceLabel(order.price)}`,
    `⏰ Срочность: ${urgencyLabel(order.urgencyKey)}`,
    `📌 Статус: ${statusLabel(order.status)}`,
    provider ? `🧰 Исполнитель: ${compactUserLabel(provider) || 'без имени'}` : '🧰 Исполнитель: еще не назначен',
    `🛍 Пакетов: ${order.bagsCount}`,
    `💬 Комментарий: ${order.comment || 'нет'}`,
    `💳 Оплата: ${order.paymentMethod}`,
  ].join('\n');
}

function orderSummaryForProvider(order, client) {
  if (order.type === 'service') {
    return [
      `${getOrderDisplayTitle(order)} #${order.id}`,
      `💰 Цена: ${priceLabel(order.price)}`,
      `⏰ Срочность: ${urgencyLabel(order.urgencyKey)}`,
      `📌 Статус: ${statusLabel(order.status)}`,
      `👤 Клиент: ${compactUserLabel(client) || 'без имени'}`,
      `💬 Запрос: ${order.comment || 'без описания'}`,
      `💳 Условия: ${order.paymentMethod || 'договоримся'}`,
    ].join('\n');
  }

  return [
    `📦 Заказ #${order.id}`,
    `💰 Цена: ${priceLabel(order.price)}`,
    `⏰ Срочность: ${urgencyLabel(order.urgencyKey)}`,
    `📌 Статус: ${statusLabel(order.status)}`,
    `👤 Клиент: ${compactUserLabel(client) || 'без имени'}`,
    `🛍 Пакетов: ${order.bagsCount}`,
    `💬 Комментарий: ${order.comment || 'нет'}`,
    `💳 Оплата: ${order.paymentMethod}`,
  ].join('\n');
}

function getOrderInlineKeyboard(order, user) {
  if (!user) {
    return undefined;
  }

  const buttons = [
    [Markup.button.callback('Открыть заказ', `view_order:${order.id}`)],
  ];

  if (order.clientUserId === user.id && order.status === 'created') {
    buttons.push([Markup.button.callback('Отменить заказ', `cancel_order:${order.id}`)]);
  }

  if (
    order.clientUserId === user.id &&
    (order.type === 'trash_removal' || order.type === 'service') &&
    isFinishedOrderStatus(order.status)
  ) {
    buttons.push([Markup.button.callback('Повторить заказ', `repeat_order:${order.id}`)]);
  }

  return Markup.inlineKeyboard(buttons);
}

function buildOrderSummary(order, db, user) {
  const provider = db.users.find((item) => item.id === order.providerUserId);
  const client = db.users.find((item) => item.id === order.clientUserId);
  return user.role === 'provider'
    ? orderSummaryForProvider(order, client)
    : orderSummaryForClient(order, provider);
}

async function showOrderDetails(ctx, orderId) {
  const user = getUserByTelegramId(ctx.from.id);
  if (!user) {
    await showStart(ctx, 'Сначала зарегистрируйтесь.');
    return;
  }

  const db = readDb();
  const order = db.orders.find((item) => item.id === orderId);
  if (!order) {
    await ctx.reply('😕 Заказ не найден.', getMainKeyboard(user));
    return;
  }

  if (order.clientUserId !== user.id && order.providerUserId !== user.id) {
    await ctx.reply('🔒 Этот заказ вам недоступен.', getMainKeyboard(user));
    return;
  }

  const summary = buildOrderSummary(order, db, user);
  const inlineKeyboard = getOrderInlineKeyboard(order, user);
  await ctx.reply(summary, {
    ...getMainKeyboard(user),
    ...(inlineKeyboard || {}),
  });
}

async function showStart(ctx, message) {
  const tgUser = getTelegramUser(ctx);
  const user = getUserByTelegramId(tgUser.id);

  if (!user) {
    await ctx.reply(
      message || '🏡 Добро пожаловать в DomHelperBot.\n\nЗдесь соседи помогают друг другу внутри одного дома.\nДля старта зарегистрируйтесь и привяжитесь к своему дому.',
      getMainKeyboard(null)
    );
    return;
  }

  const house = getHouse(user.houseId);
  await ctx.reply(
    message || [
      `👋 Привет, ${user.name}!`,
      `🎭 Роль: ${roleLabel(user.role)}`,
      `🏠 Дом: ${house ? houseLabel(house) : 'не найден'}`,
      '✨ Можно создать соседский запрос или откликнуться на запросы своего дома.',
    ].join('\n'),
    getMainKeyboard(user)
  );
}

async function showUserOrders(ctx) {
  const user = getUserByTelegramId(ctx.from.id);
  if (!user) {
    await showStart(ctx, 'Сначала зарегистрируйтесь.');
    return;
  }

  const db = readDb();
  const orders = db.orders
    .filter((order) => order.clientUserId === user.id || order.providerUserId === user.id)
    .filter((order) => !isFinishedOrderStatus(order.status))
    .slice(-10)
    .reverse();

  if (!orders.length) {
    await ctx.reply('📭 Сейчас нет активных заказов.', getMainKeyboard(user));
    return;
  }

  await ctx.reply('Активные заказы', getMainKeyboard(user));
  await showOrdersByRoleSections(ctx, db, user, orders);
}

async function showCompletedOrders(ctx) {
  const user = getUserByTelegramId(ctx.from.id);
  if (!user) {
    await showStart(ctx, 'Сначала зарегистрируйтесь.');
    return;
  }

  const db = readDb();
  const orders = db.orders
    .filter((order) => order.clientUserId === user.id || order.providerUserId === user.id)
    .filter((order) => isFinishedOrderStatus(order.status))
    .slice(-10)
    .reverse();

  if (!orders.length) {
    await ctx.reply('📭 Завершенных заказов пока нет.', getMainKeyboard(user));
    return;
  }

  await ctx.reply('Завершенные заказы', getMainKeyboard(user));
  await showOrdersByRoleSections(ctx, db, user, orders);
}

async function showOrdersByRoleSections(ctx, db, user, orders) {
  const clientOrders = orders.filter((order) => order.clientUserId === user.id);
  const providerOrders = orders.filter((order) => order.providerUserId === user.id);
  const sections = [
    { title: '🙋 Как заказчик', items: clientOrders },
    { title: '🧰 Как исполнитель', items: providerOrders },
  ];

  for (const section of sections) {
    if (!section.items.length) {
      continue;
    }

    await ctx.reply(section.title, getMainKeyboard(user));

    for (const order of section.items) {
      const summary = buildOrderSummary(order, db, user);
      const inlineKeyboard = getOrderInlineKeyboard(order, user);
      await ctx.reply(summary, {
        ...getMainKeyboard(user),
        ...(inlineKeyboard || {}),
      });
    }
  }
}

async function showMyHouse(ctx) {
  const user = getUserByTelegramId(ctx.from.id);
  if (!user) {
    await showStart(ctx, 'Сначала зарегистрируйтесь.');
    return;
  }

  const house = getHouse(user.houseId);
  const lines = [
    `👤 Профиль: ${user.name}`,
    `🎭 Роль: ${roleLabel(user.role)}`,
    `📱 Телефон: ${user.phone}`,
    `🏠 Дом: ${house ? houseLabel(house) : 'не найден'}`,
    `🚪 Подъезд: ${user.entrance}`,
    `🛗 Этаж: ${user.floor}`,
    `🔑 Квартира: ${user.apartment}`,
  ];

  if (user.role === 'provider') {
    lines.push(`🟢 Доступность: ${availabilityLabel(user.availabilityStatus)}`);
  }

  lines.push('');
  lines.push('✏️ Чтобы обновить профиль или сменить дом, нажмите "Профиль".');
  lines.push('🔄 Чтобы быстро сменить сценарий использования, нажмите кнопку ниже.');
  if (user.role === 'provider') {
    lines.push('🟢 Доступность можно поменять кнопкой "Моя доступность".');
  }

  await ctx.reply(
    lines.join('\n'),
    {
      ...getMainKeyboard(user),
      ...getProfileInlineKeyboard(user),
    }
  );
}

async function showAvailabilitySettings(ctx) {
  const user = getUserByTelegramId(ctx.from.id);
  if (!user) {
    await showStart(ctx, '🏡 Сначала зарегистрируйтесь.');
    return;
  }

  if (user.role !== 'provider') {
    await ctx.reply('🧰 Настройка доступности нужна только исполнителям.', getMainKeyboard(user));
    return;
  }

  await ctx.reply(
    [
      '🟢 Моя доступность',
      `Сейчас: ${availabilityLabel(user.availabilityStatus)}`,
      '',
      'Клиенты увидят, готовы ли соседи помочь прямо сейчас.',
    ].join('\n'),
    {
      ...getMainKeyboard(user),
      ...getAvailabilityInlineKeyboard(),
    }
  );
}

async function showPopularServices(ctx) {
  const user = getUserByTelegramId(ctx.from.id);
  if (!user) {
    await showStart(ctx, '🏡 Сначала зарегистрируйтесь.');
    return;
  }

  const db = readDb();
  const services = getPopularServices(db, user.houseId);
  const lines = [
    '🔥 Самые популярные услуги в вашем доме',
    '',
    ...services.map((service, index) => {
      const badge = index === 0 ? '👑' : `${index + 1}.`;
      const countLabel = service.totalCount > 0 ? `• заказов: ${service.totalCount}` : '• пока без истории';
      const supportLabel = service.supported ? '• доступно сейчас' : '• скоро';
      return `${badge} ${service.title}\n${service.description}\n${countLabel} ${supportLabel}`;
    }),
  ];

  await ctx.reply(lines.join('\n\n'), {
    ...getMainKeyboard(user),
    ...getPopularServicesInlineKeyboard(services),
  });
}

function startRegistration(ctx, options = {}) {
  const { existingUser = null, isEdit = false } = options;
  ctx.session.flow = {
    type: 'registration',
    step: REGISTRATION_STEPS.NAME,
    data: existingUser ? {
      name: existingUser.name,
      phone: existingUser.phone,
      role: existingUser.role,
      houseId: existingUser.houseId,
      entrance: existingUser.entrance,
      floor: existingUser.floor,
      apartment: existingUser.apartment,
    } : {},
  };

  if (isEdit && existingUser) {
    return ctx.reply(
      [
        '✏️ Редактирование профиля',
        'Пройдите шаги заново, чтобы обновить имя, телефон, роль или дом.',
        `👤 Текущее имя: ${existingUser.name}`,
      ].join('\n'),
      getCancelKeyboard()
    );
  }

  return ctx.reply('👤 Введите имя и фамилию.', getCancelKeyboard());
}

function startTrashOrder(ctx, user) {
  if (!user) {
    return showStart(ctx, 'Сначала зарегистрируйтесь.');
  }

  ctx.session.flow = {
    type: 'trash_order',
    step: ORDER_STEPS.BAGS,
    data: {},
  };

  return ctx.reply('🛍 Сколько пакетов нужно вынести? Напишите число.', getCancelKeyboard());
}

function startGeneralHelpOrder(ctx, user, serviceKey) {
  if (!user) {
    return showStart(ctx, 'Сначала зарегистрируйтесь.');
  }

  const service = getServiceTemplate(serviceKey);
  if (!service) {
    return ctx.reply('😕 Такой тип запроса не найден.', getMainKeyboard(user));
  }

  ctx.session.flow = {
    type: 'general_order',
    step: ORDER_STEPS.REQUEST_DETAILS,
    data: {
      serviceKey: service.key,
      title: service.title,
    },
  };

  return ctx.reply(
    [
      `${service.title}`,
      service.description,
      '',
      '💬 Опишите, что именно нужно сделать.',
    ].join('\n'),
    getCancelKeyboard()
  );
}

async function showRequestTypeSelector(ctx) {
  const user = getUserByTelegramId(ctx.from.id);
  if (!user) {
    await showStart(ctx, '🏡 Сначала зарегистрируйтесь.');
    return;
  }

  const db = readDb();
  const stats = getProviderAvailabilityStats(db, user.houseId);

  await ctx.reply(
    [
      '🙋 Какой запрос хотите создать?',
      '',
      `🟢 Готовы помочь сейчас: ${stats.readyNow}`,
      `🕒 Смогут позже: ${stats.later}`,
      stats.readyNow === 0
        ? '⚠️ Сейчас никто не отметил себя доступным. Запрос можно создать, но быстрый отклик не гарантирован.'
        : '✨ Есть соседи, которые готовы быстро откликнуться.',
      '',
      'Выберите готовый тип запроса ниже.',
    ].join('\n'),
    {
      ...getMainKeyboard(user),
      ...getRequestTypeInlineKeyboard(),
    }
  );
}

async function warnAboutNoReadyProviders(ctx, user, flow) {
  const db = readDb();
  const stats = getProviderAvailabilityStats(db, user.houseId);

  if (flow.data.urgencyKey !== 'within_hour' || stats.readyNow > 0) {
    return false;
  }

  flow.step = ORDER_STEPS.READY_CONFIRM;

  await ctx.reply(
    [
      '⚠️ Для срочного запроса сейчас нет исполнителей со статусом "Готов помочь сейчас".',
      `🕒 Смогут позже: ${stats.later}`,
      '',
      'Срочный запрос можно создать, но быстрый отклик не гарантирован.',
      'Выберите, что делать дальше.',
    ].join('\n'),
    getAvailabilityWarningKeyboard()
  );

  return true;
}

function startRepeatTrashOrder(ctx, user, sourceOrder) {
  if (!user) {
    return showStart(ctx, 'Сначала зарегистрируйтесь.');
  }

  ctx.session.flow = {
    type: 'trash_order',
    step: ORDER_STEPS.PAYMENT,
    data: {
      bagsCount: sourceOrder.bagsCount,
      comment: sourceOrder.comment,
      urgencyKey: sourceOrder.urgencyKey,
      price: sourceOrder.price,
      paymentMethod: sourceOrder.paymentMethod,
      repeatedFromOrderId: sourceOrder.id,
    },
  };

  return ctx.reply(
    [
      `Повторяем заказ #${sourceOrder.id}.`,
      `🛍 Пакетов: ${sourceOrder.bagsCount}`,
      `⏰ Срочность: ${urgencyLabel(sourceOrder.urgencyKey)}`,
      `💰 Цена: ${priceLabel(sourceOrder.price)}`,
      `💬 Комментарий: ${sourceOrder.comment || 'нет'}`,
      `💳 Оплата: ${sourceOrder.paymentMethod}`,
      '💳 Выберите способ оплаты заново кнопкой ниже.',
    ].join('\n'),
    getPaymentKeyboard()
  );
}

function startRepeatGeneralHelpOrder(ctx, user, sourceOrder) {
  if (!user) {
    return showStart(ctx, 'Сначала зарегистрируйтесь.');
  }

  ctx.session.flow = {
    type: 'general_order',
    step: ORDER_STEPS.PAYMENT,
    data: {
      serviceKey: sourceOrder.serviceKey || 'other_help',
      title: sourceOrder.title || getOrderDisplayTitle(sourceOrder),
      comment: sourceOrder.comment || '',
      urgencyKey: sourceOrder.urgencyKey,
      price: sourceOrder.price,
      repeatedFromOrderId: sourceOrder.id,
    },
  };

  return ctx.reply(
    [
      `🔁 Повторяем запрос #${sourceOrder.id}.`,
      `${sourceOrder.title || getOrderDisplayTitle(sourceOrder)}`,
      `⏰ Срочность: ${urgencyLabel(sourceOrder.urgencyKey)}`,
      `💰 Цена: ${priceLabel(sourceOrder.price)}`,
      `💬 Запрос: ${sourceOrder.comment || 'без описания'}`,
      '💳 Выберите способ оплаты заново кнопкой ниже.',
    ].join('\n'),
    getPaymentKeyboard()
  );
}

async function createGeneralOrderFromFlow(ctx, user, flow, bot) {
  const order = withDb((db) => {
    const newOrder = {
      id: generateId('order'),
      type: 'service',
      serviceKey: flow.data.serviceKey,
      title: flow.data.title,
      status: 'created',
      houseId: user.houseId,
      clientUserId: user.id,
      providerUserId: null,
      comment: flow.data.comment,
      urgencyKey: flow.data.urgencyKey,
      price: flow.data.price,
      paymentMethod: flow.data.paymentMethod,
      photoBeforeFileId: null,
      photoAfterFileId: null,
      repeatedFromOrderId: flow.data.repeatedFromOrderId || null,
      createdAt: new Date().toISOString(),
    };

    db.orders.push(newOrder);
    return newOrder;
  });

  clearFlow(ctx);
  const providerCount = await notifyProviders(bot, order);
  const creationSummary = [
    `🎉 Запрос #${order.id} создан.`,
    `📌 Статус: ${statusLabel(order.status)}`,
    providerCount > 0
      ? `🧰 Соседи-исполнители вашего дома уже получили уведомление: ${providerCount}.`
      : '📭 В вашем доме пока нет исполнителей, которым можно отправить запрос.',
  ].join('\n');

  await ctx.reply(creationSummary, getMainKeyboard(user));
  await showOrderDetails(ctx, order.id);
}

async function startProfileEdit(ctx) {
  const user = getUserByTelegramId(ctx.from.id);
  if (!user) {
    await showStart(ctx, 'Сначала зарегистрируйтесь.');
    return;
  }

  await startRegistration(ctx, { existingUser: user, isEdit: true });
  await ctx.reply('👤 Введите имя и фамилию.', getCancelKeyboard());
}

function clearFlow(ctx) {
  ctx.session.flow = null;
}

function isPhotoMessage(ctx) {
  return Boolean(ctx.message && ctx.message.photo && ctx.message.photo.length);
}

function getBestPhotoFileId(ctx) {
  const photos = ctx.message.photo;
  return photos[photos.length - 1].file_id;
}

async function notifyProviders(bot, order) {
  const db = readDb();
  const client = db.users.find((user) => user.id === order.clientUserId);
  const house = db.houses.find((item) => item.id === order.houseId);
  const providers = db.users.filter(
    (user) => user.houseId === order.houseId && user.role === 'provider' && user.telegramId !== client.telegramId
  );

  const message = publicOrderText(order, client, house);
  const buttons = Markup.inlineKeyboard([
    Markup.button.callback('Взять запрос', `take_order:${order.id}`),
  ]);

  for (const provider of providers) {
    try {
      if (order.photoBeforeFileId) {
        await bot.telegram.sendPhoto(provider.telegramId, order.photoBeforeFileId, {
          caption: message,
          ...buttons,
        });
      } else {
        await bot.telegram.sendMessage(provider.telegramId, message, {
          ...buttons,
        });
      }
    } catch (error) {
      console.error(`Failed to notify provider ${provider.telegramId}:`, error.message);
    }
  }

  return providers.length;
}

async function notifyClientOrderAssigned(bot, order, provider) {
  const db = readDb();
  const client = db.users.find((user) => user.id === order.clientUserId);
  if (!client) {
    return;
  }

  await bot.telegram.sendMessage(
    client.telegramId,
    [
      `Запрос #${order.id} взят в работу.`,
      `🧰 Исполнитель: ${compactUserLabel(provider) || 'без имени'}`,
      `📌 Статус: ${statusLabel(order.status)}`,
    ].join('\n')
  );
}

async function notifyClientOrderCompleted(bot, order) {
  const db = readDb();
  const client = db.users.find((user) => user.id === order.clientUserId);
  if (!client) {
    return;
  }

  const buttons = Markup.inlineKeyboard([
    Markup.button.callback('Подтвердить выполнение', `confirm_order:${order.id}`),
  ]);

  if (order.photoAfterFileId) {
    await bot.telegram.sendPhoto(client.telegramId, order.photoAfterFileId, {
      caption: [
        `📸 Исполнитель прислал фото после по заказу #${order.id}.`,
        `📌 Статус: ${statusLabel(order.status)}`,
        '✅ Подтвердите выполнение.',
      ].join('\n'),
      ...buttons,
    });
    return;
  }

  await bot.telegram.sendMessage(
    client.telegramId,
    [
      `✅ Исполнитель отметил запрос #${order.id} как выполненный.`,
      `📌 Статус: ${statusLabel(order.status)}`,
      'Подтвердите выполнение.',
    ].join('\n'),
    {
      ...buttons,
    }
  );
}

async function notifyProviderOrderConfirmed(bot, order) {
  const db = readDb();
  const provider = db.users.find((user) => user.id === order.providerUserId);
  const client = db.users.find((user) => user.id === order.clientUserId);

  if (!provider) {
    return;
  }

  await bot.telegram.sendMessage(
    provider.telegramId,
    [
      `🎉 Клиент подтвердил заказ #${order.id}.`,
      `📌 Статус: ${statusLabel(order.status)}`,
      client ? `👤 Клиент: ${compactUserLabel(client) || 'без имени'}` : null,
    ].filter(Boolean).join('\n')
  );
}

async function notifyProviderOrderCancelled(bot, order) {
  const db = readDb();
  const provider = db.users.find((user) => user.id === order.providerUserId);

  if (!provider) {
    return;
  }

  await bot.telegram.sendMessage(
    provider.telegramId,
    [
      `⚠️ Заказ #${order.id} отменен клиентом.`,
      `📌 Статус: ${statusLabel(order.status)}`,
    ].join('\n')
  );
}

function cancelActiveFlow(ctx, message) {
  const user = getUserByTelegramId(ctx.from.id);
  clearFlow(ctx);
  return ctx.reply(message || '🫡 Текущее действие отменено.', getMainKeyboard(user || null));
}

function createBot(botToken) {
  if (!botToken) {
    throw new Error('BOT_TOKEN is required. Create .env from .env.example or export BOT_TOKEN before npm start.');
  }

  const bot = new Telegraf(botToken);
  bot.use(session({ defaultSession: () => ({ flow: null }) }));

  bot.start(async (ctx) => {
    clearFlow(ctx);
    await showStart(ctx);
  });

  bot.command('register', async (ctx) => {
    await startRegistration(ctx);
  });

  bot.command('profile', async (ctx) => {
    await startProfileEdit(ctx);
  });

  bot.command('myhouse', async (ctx) => {
    await showMyHouse(ctx);
  });

  bot.command('orders', async (ctx) => {
    await showUserOrders(ctx);
  });

  bot.command('completed', async (ctx) => {
    await showCompletedOrders(ctx);
  });

  bot.command('popular', async (ctx) => {
    await showPopularServices(ctx);
  });

  bot.command('availability', async (ctx) => {
    await showAvailabilitySettings(ctx);
  });

  bot.command('help', async (ctx) => {
    const user = getUserByTelegramId(ctx.from.id);
    await ctx.reply(
      [
        '🧭 Основные команды:',
        '/start - главное меню',
        '/register - регистрация заново',
        '/profile - редактировать профиль',
        '/orders - мои заказы',
        '/completed - завершенные заказы',
        '/popular - популярные услуги',
        '/availability - доступность исполнителя',
        '/myhouse - мой дом',
        '/help - эта подсказка',
        '',
        '🔄 В экране "Мой дом" можно быстро переключить роль.',
        '🙋 Основной сценарий клиента: "Мне нужна помощь".',
        '🔥 Основной сценарий исполнителя: "Запросы дома".',
        '',
        `Во время сценариев можно нажать "${CANCEL_TEXT}".`,
      ].join('\n'),
      getMainKeyboard(user || null)
    );
  });

  bot.action(/^switch_role:(client|provider)$/, async (ctx) => {
    const nextRole = ctx.match[1];

    const result = withDb((db) => {
      const currentUser = db.users.find((item) => item.telegramId === String(ctx.from.id));
      if (!currentUser) {
        return { error: '🏡 Сначала зарегистрируйтесь.' };
      }

      if (currentUser.role === nextRole) {
        return { error: `У вас уже роль "${roleLabel(nextRole)}".` };
      }

      currentUser.role = nextRole;
      if (nextRole === 'provider' && !currentUser.availabilityStatus) {
        currentUser.availabilityStatus = PROVIDER_AVAILABILITY.OFFLINE;
      }
      currentUser.updatedAt = new Date().toISOString();
      return { user: currentUser };
    });

    if (result.error) {
      await ctx.answerCbQuery(result.error);
      return;
    }

    await ctx.answerCbQuery(`🎭 Роль обновлена: ${roleLabel(nextRole)}.`);
    await ctx.reply(
      [
        '🎉 Роль обновлена.',
        `Теперь вы: ${roleLabel(nextRole)}.`,
      ].join('\n'),
      getMainKeyboard(result.user)
    );
    await showMyHouse(ctx);
  });

  bot.action(/^availability:(ready_now|later|offline)$/, async (ctx) => {
    const nextStatus = ctx.match[1];

    const result = withDb((db) => {
      const currentUser = db.users.find((item) => item.telegramId === String(ctx.from.id));
      if (!currentUser) {
        return { error: '🏡 Сначала зарегистрируйтесь.' };
      }

      if (currentUser.role !== 'provider') {
        return { error: 'Настройка доступности нужна только исполнителям.' };
      }

      currentUser.availabilityStatus = nextStatus;
      currentUser.updatedAt = new Date().toISOString();
      return { user: currentUser };
    });

    if (result.error) {
      await ctx.answerCbQuery(result.error);
      return;
    }

    await ctx.answerCbQuery(`🟢 ${availabilityLabel(nextStatus)}`);
    await ctx.reply(
      `🟢 Доступность обновлена: ${availabilityLabel(nextStatus)}`,
      getMainKeyboard(result.user)
    );
    await showAvailabilitySettings(ctx);
  });

  bot.action(/^take_order:(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    const user = getUserByTelegramId(ctx.from.id);

    if (!user) {
      await ctx.answerCbQuery('🏡 Сначала зарегистрируйтесь.');
      return;
    }

    if (user.role !== 'provider') {
      await ctx.answerCbQuery('🧰 Взять заказ может только исполнитель.');
      return;
    }

    const result = withDb((db) => {
      const order = db.orders.find((item) => item.id === orderId);
      if (!order) {
        return { error: 'Заказ не найден.' };
      }

      if (order.houseId !== user.houseId) {
        return { error: 'Можно брать только заказы своего дома.' };
      }

      if (order.status !== 'created') {
        return { error: 'Заказ уже взят другим исполнителем.' };
      }

      order.status = 'assigned';
      order.providerUserId = user.id;
      order.assignedAt = new Date().toISOString();
      return { order };
    });

    if (result.error) {
      await ctx.answerCbQuery(result.error);
      return;
    }

    const db = readDb();
    const order = db.orders.find((item) => item.id === orderId);
    const client = db.users.find((item) => item.id === order.clientUserId);
    const house = db.houses.find((item) => item.id === order.houseId);

    await ctx.answerCbQuery('✅ Запрос закреплен за вами.');
    if (order.photoBeforeFileId) {
      await ctx.replyWithPhoto(order.photoBeforeFileId, {
        caption: assignedOrderText(order, client, house),
        ...Markup.inlineKeyboard([
          Markup.button.callback('Отправить фото после', `complete_order:${order.id}`),
        ]),
      });
    } else {
      await ctx.reply(assignedOrderText(order, client, house), {
        ...getMainKeyboard(user),
        ...Markup.inlineKeyboard([
          Markup.button.callback('Отметить выполненным', `complete_order:${order.id}`),
        ]),
      });
    }

    await notifyClientOrderAssigned(bot, order, user);
  });

  bot.action(/^view_order:(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    await ctx.answerCbQuery();
    await showOrderDetails(ctx, orderId);
  });

  bot.action(/^request_type:(.+)$/, async (ctx) => {
    const serviceKey = ctx.match[1];
    const user = getUserByTelegramId(ctx.from.id);
    const service = getServiceTemplate(serviceKey);

    if (!user || !service) {
      await ctx.answerCbQuery('🔒 Недоступно.');
      return;
    }

    await ctx.answerCbQuery();

    if (service.key === 'trash_removal') {
      await startTrashOrder(ctx, user);
      return;
    }

    await startGeneralHelpOrder(ctx, user, service.key);
  });

  bot.action(/^popular_service:(.+)$/, async (ctx) => {
    const serviceKey = ctx.match[1];
    const user = getUserByTelegramId(ctx.from.id);
    const service = getServiceTemplate(serviceKey);

    if (!user || !service) {
      await ctx.answerCbQuery('🔒 Недоступно.');
      return;
    }

    if (service.key === 'trash_removal') {
      await ctx.answerCbQuery('🚀 Запускаю самый популярный сценарий.');
      await startTrashOrder(ctx, user);
      return;
    }

    await ctx.answerCbQuery('🚀 Запускаю популярный сценарий.');
    await startGeneralHelpOrder(ctx, user, service.key);
  });

  bot.action(/^repeat_order:(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    const user = getUserByTelegramId(ctx.from.id);
    const order = getOrder(orderId);

    if (!user || !order || order.clientUserId !== user.id) {
      await ctx.answerCbQuery('🔒 Недоступно.');
      return;
    }

    if (!isFinishedOrderStatus(order.status)) {
      await ctx.answerCbQuery('Повтор доступен только для завершенных запросов.');
      return;
    }

    await ctx.answerCbQuery();
    if (order.type === 'trash_removal') {
      await startRepeatTrashOrder(ctx, user, order);
      return;
    }

    await startRepeatGeneralHelpOrder(ctx, user, order);
  });

  bot.action(/^complete_order:(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    const user = getUserByTelegramId(ctx.from.id);
    const order = getOrder(orderId);

    if (!user || !order || order.providerUserId !== user.id) {
      await ctx.answerCbQuery('🔒 Недоступно.');
      return;
    }

    if (order.type === 'service') {
      const result = withDb((db) => {
        const currentOrder = db.orders.find((item) => item.id === orderId);
        if (!currentOrder) {
          return { error: 'Заказ не найден.' };
        }

        if (currentOrder.providerUserId !== user.id) {
          return { error: 'Можно завершать только свой запрос.' };
        }

        currentOrder.status = 'completed';
        currentOrder.completedAt = new Date().toISOString();
        return { order: currentOrder };
      });

      if (result.error) {
        await ctx.answerCbQuery(result.error);
        return;
      }

      await ctx.answerCbQuery('✅ Запрос отмечен выполненным.');
      await ctx.reply(
        `✅ Запрос #${orderId} отмечен выполненным и отправлен клиенту на подтверждение.`,
        getMainKeyboard(user)
      );
      await notifyClientOrderCompleted(bot, result.order);
      return;
    }

    ctx.session.flow = {
      type: 'trash_order',
      step: ORDER_STEPS.PHOTO_AFTER,
      data: { orderId },
    };

    await ctx.answerCbQuery();
    await ctx.reply('📸 Пришлите фото после выполнения заказа.', getCancelKeyboard());
  });

  bot.action(/^confirm_order:(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    const user = getUserByTelegramId(ctx.from.id);

    const result = withDb((db) => {
      const order = db.orders.find((item) => item.id === orderId);
      if (!order) {
        return { error: 'Заказ не найден.' };
      }

      if (!user || order.clientUserId !== user.id) {
        return { error: 'Подтверждение доступно только клиенту.' };
      }

      if (order.type === 'trash_removal' && !order.photoAfterFileId) {
        return { error: 'Нельзя подтвердить без фото после.' };
      }

      order.status = 'confirmed';
      order.confirmedAt = new Date().toISOString();
      return { order };
    });

    if (result.error) {
      await ctx.answerCbQuery(result.error);
      return;
    }

    await ctx.answerCbQuery('🎉 Заказ подтвержден.');
    await ctx.reply(`🎉 Заказ #${orderId} подтвержден. Спасибо!`, getMainKeyboard(user));
    await notifyProviderOrderConfirmed(bot, result.order);
  });

  bot.action(/^cancel_order:(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    const user = getUserByTelegramId(ctx.from.id);

    const result = withDb((db) => {
      const order = db.orders.find((item) => item.id === orderId);
      if (!order) {
        return { error: 'Заказ не найден.' };
      }

      if (!user || order.clientUserId !== user.id) {
        return { error: 'Отменить заказ может только клиент.' };
      }

      if (order.status !== 'created') {
        return { error: 'Можно отменить только заказ без назначенного исполнителя.' };
      }

      order.status = 'cancelled';
      order.cancelledAt = new Date().toISOString();
      return { order };
    });

    if (result.error) {
      await ctx.answerCbQuery(result.error);
      return;
    }

    await ctx.answerCbQuery('⚠️ Заказ отменен.');
    await ctx.reply(
      [
        `⚠️ Заказ #${orderId} отменен.`,
        `📌 Статус: ${statusLabel(result.order.status)}`,
      ].join('\n'),
      getMainKeyboard(user)
    );
    await notifyProviderOrderCancelled(bot, result.order);
  });

  bot.hears(MENU.START_REGISTRATION, async (ctx) => {
    await startRegistration(ctx);
  });

  bot.hears(MENU.PROFILE, async (ctx) => {
    await startProfileEdit(ctx);
  });

  bot.hears(CANCEL_TEXT, async (ctx) => {
    await cancelActiveFlow(ctx);
  });

  bot.hears(MENU.NEED_HELP, async (ctx) => {
    await showRequestTypeSelector(ctx);
  });

  bot.hears(MENU.MY_ORDERS, async (ctx) => {
    await showUserOrders(ctx);
  });

  bot.hears(MENU.COMPLETED_ORDERS, async (ctx) => {
    await showCompletedOrders(ctx);
  });

  bot.hears(MENU.POPULAR, async (ctx) => {
    await showPopularServices(ctx);
  });

  bot.hears(MENU.AVAILABILITY, async (ctx) => {
    await showAvailabilitySettings(ctx);
  });

  bot.hears(MENU.MY_HOUSE, async (ctx) => {
    await showMyHouse(ctx);
  });

  bot.hears(MENU.HOUSE_REQUESTS, async (ctx) => {
    const user = getUserByTelegramId(ctx.from.id);
    if (!user) {
      await showStart(ctx, '🏡 Сначала зарегистрируйтесь.');
      return;
    }

    const db = readDb();
    const house = db.houses.find((item) => item.id === user.houseId);
    const orders = db.orders
      .filter((order) => order.houseId === user.houseId && order.status === 'created')
      .sort((left, right) => {
        const byUrgency = urgencyPriority(right.urgencyKey) - urgencyPriority(left.urgencyKey);
        if (byUrgency !== 0) {
          return byUrgency;
        }

        const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
        const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
        return rightTime - leftTime;
      });

    if (!orders.length) {
      await ctx.reply('📭 В вашем доме пока нет активных запросов.', getMainKeyboard(user));
      return;
    }

    for (const order of orders) {
      const client = db.users.find((item) => item.id === order.clientUserId);
      if (order.photoBeforeFileId) {
        await ctx.replyWithPhoto(order.photoBeforeFileId, {
          caption: publicOrderText(order, client, house),
          ...Markup.inlineKeyboard([
            Markup.button.callback('Взять запрос', `take_order:${order.id}`),
          ]),
        });
      } else {
        await ctx.reply(publicOrderText(order, client, house), {
          ...getMainKeyboard(user),
          ...Markup.inlineKeyboard([
            Markup.button.callback('Взять запрос', `take_order:${order.id}`),
          ]),
        });
      }
    }
  });

  bot.hears(MENU.FUTURE_MODULES, async (ctx) => {
    const user = getUserByTelegramId(ctx.from.id);
    await ctx.reply(
      '🚧 Этот раздел еще в разработке. Позже здесь появятся услуги соседей и аренда вещей внутри дома.',
      getMainKeyboard(user || null)
    );
  });

  bot.on('contact', async (ctx) => {
    const flow = ctx.session.flow;
    if (!flow || flow.type !== 'registration' || flow.step !== REGISTRATION_STEPS.PHONE) {
      return;
    }

    flow.data.phone = ctx.message.contact.phone_number;
    flow.step = REGISTRATION_STEPS.ROLE;

    await ctx.reply(
      '🎭 Выберите роль.',
      Markup.keyboard([['Заказчик'], ['Исполнитель'], [CANCEL_TEXT]]).resize().oneTime()
    );
  });

  bot.on('photo', async (ctx) => {
    const flow = ctx.session.flow;
    if (!flow) {
      return;
    }

  if (flow.type === 'trash_order' && flow.step === ORDER_STEPS.PHOTO_BEFORE) {
      const user = getUserByTelegramId(ctx.from.id);
      const photoBeforeFileId = getBestPhotoFileId(ctx);
      const order = withDb((db) => {
        const newOrder = {
          id: generateId('order'),
          type: 'trash_removal',
          serviceKey: 'trash_removal',
          title: '🗑 Вынести мусор',
          status: 'created',
          houseId: user.houseId,
          clientUserId: user.id,
          providerUserId: null,
          bagsCount: flow.data.bagsCount,
          comment: flow.data.comment,
          urgencyKey: flow.data.urgencyKey,
          price: flow.data.price,
          paymentMethod: flow.data.paymentMethod,
          photoBeforeFileId,
          photoAfterFileId: null,
          repeatedFromOrderId: flow.data.repeatedFromOrderId || null,
          createdAt: new Date().toISOString(),
        };

        db.orders.push(newOrder);
        return newOrder;
      });

      clearFlow(ctx);
      const providerCount = await notifyProviders(bot, order);
      const creationSummary = [
        `🎉 Заказ #${order.id} создан.`,
        `📌 Статус: ${statusLabel(order.status)}`,
        providerCount > 0
          ? `🧰 Исполнители вашего дома уже получили уведомление: ${providerCount}.`
          : '📭 В вашем доме пока нет исполнителей, которым можно отправить заказ.',
      ].join('\n');

      await ctx.reply(creationSummary, getMainKeyboard(user));
      await showOrderDetails(ctx, order.id);
      return;
    }

    if (flow.type === 'trash_order' && flow.step === ORDER_STEPS.PHOTO_AFTER) {
      const user = getUserByTelegramId(ctx.from.id);
      const photoAfterFileId = getBestPhotoFileId(ctx);
      const result = withDb((db) => {
        const order = db.orders.find((item) => item.id === flow.data.orderId);
        if (!order) {
          return { error: 'Заказ не найден.' };
        }

        if (order.providerUserId !== user.id) {
          return { error: 'Можно завершать только свой заказ.' };
        }

        order.photoAfterFileId = photoAfterFileId;
        order.status = 'completed';
        order.completedAt = new Date().toISOString();
        return { order };
      });

      clearFlow(ctx);

      if (result.error) {
        await ctx.reply(`⚠️ ${result.error}`, getMainKeyboard(user));
        return;
      }

      await ctx.reply(`📸 Фото после принято. Заказ #${result.order.id} отправлен клиенту на подтверждение.`, getMainKeyboard(user));
      const db = readDb();
      const client = db.users.find((item) => item.id === result.order.clientUserId);
      await ctx.reply(orderSummaryForProvider(result.order, client), getMainKeyboard(user));
      await notifyClientOrderCompleted(bot, result.order);
    }
  });

  bot.on('text', async (ctx) => {
        const flow = ctx.session.flow;
    if (!flow) {
      return;
    }

    const text = ctx.message.text.trim();

    if (text === CANCEL_TEXT) {
      await cancelActiveFlow(ctx);
      return;
    }

    if (flow.type === 'registration') {
      if (flow.step === REGISTRATION_STEPS.NAME) {
        flow.data.name = text;
        flow.step = REGISTRATION_STEPS.PHONE;

        await ctx.reply(
          '📱 Отправьте телефон текстом или кнопкой контакта.',
          Markup.keyboard([
            [Markup.button.contactRequest('Отправить контакт')],
            [CANCEL_TEXT],
          ]).resize().oneTime()
        );
        return;
      }

      if (flow.step === REGISTRATION_STEPS.PHONE) {
        flow.data.phone = text;
        flow.step = REGISTRATION_STEPS.ROLE;

        await ctx.reply(
          '🎭 Выберите роль.',
          Markup.keyboard([['Заказчик'], ['Исполнитель'], [CANCEL_TEXT]]).resize().oneTime()
        );
        return;
      }

      if (flow.step === REGISTRATION_STEPS.ROLE) {
        if (!['Заказчик', 'Исполнитель'].includes(text)) {
          await ctx.reply('🙂 Выберите один из вариантов: "Заказчик" или "Исполнитель".');
          return;
        }

        flow.data.role = text === 'Исполнитель' ? 'provider' : 'client';
        flow.step = REGISTRATION_STEPS.HOUSE;

        const db = readDb();
        const houseButtons = db.houses.filter((house) => house.isActive).map((house) => [houseLabel(house)]);
        houseButtons.push([CANCEL_TEXT]);
        await ctx.reply('🏠 Выберите дом.', Markup.keyboard(houseButtons).resize().oneTime());
        return;
      }

      if (flow.step === REGISTRATION_STEPS.HOUSE) {
        const db = readDb();
        const house = db.houses.find((item) => houseLabel(item) === text);
        if (!house) {
          await ctx.reply('🏠 Выберите дом из списка.');
          return;
        }

        flow.data.houseId = house.id;
        flow.step = REGISTRATION_STEPS.ENTRANCE;
        await ctx.reply('🚪 Введите номер подъезда.', getCancelKeyboard());
        return;
      }

      if (flow.step === REGISTRATION_STEPS.ENTRANCE) {
        flow.data.entrance = text;
        flow.step = REGISTRATION_STEPS.FLOOR;
        await ctx.reply('🛗 Введите этаж.', getCancelKeyboard());
        return;
      }

      if (flow.step === REGISTRATION_STEPS.FLOOR) {
        flow.data.floor = text;
        flow.step = REGISTRATION_STEPS.APARTMENT;
        await ctx.reply('🔑 Введите номер квартиры.', getCancelKeyboard());
        return;
      }

      if (flow.step === REGISTRATION_STEPS.APARTMENT) {
        const tgUser = getTelegramUser(ctx);
        const createdUser = withDb((db) => {
          const existingUser = db.users.find((item) => item.telegramId === String(tgUser.id));
          const userPayload = {
            id: existingUser ? existingUser.id : generateId('user'),
            telegramId: String(tgUser.id),
            name: flow.data.name,
            username: tgUser.username || '',
            phone: flow.data.phone,
            role: flow.data.role,
            availabilityStatus: flow.data.role === 'provider'
              ? (existingUser && existingUser.availabilityStatus) || PROVIDER_AVAILABILITY.OFFLINE
              : PROVIDER_AVAILABILITY.OFFLINE,
            houseId: flow.data.houseId,
            entrance: flow.data.entrance,
            floor: flow.data.floor,
            apartment: text,
            isResidentVerified: true,
            updatedAt: new Date().toISOString(),
          };

          if (existingUser) {
            Object.assign(existingUser, userPayload);
            return existingUser;
          }

          db.users.push({
            ...userPayload,
            createdAt: new Date().toISOString(),
          });
          return userPayload;
        });

        clearFlow(ctx);
        await showStart(ctx, `🎉 Регистрация завершена для ${createdUser.name}.`);
        await ctx.reply('✨ Профиль сохранен. Можно создать заказ или посмотреть свои заказы.', getMainKeyboard(createdUser));
        return;
      }
    }

    if (flow.type === 'trash_order') {
      if (flow.step === ORDER_STEPS.BAGS) {
        const bagsCount = Number(text);
        if (!Number.isInteger(bagsCount) || bagsCount < 1) {
          await ctx.reply('🙂 Введите целое число больше 0.');
          return;
        }

        flow.data.bagsCount = bagsCount;
        flow.step = ORDER_STEPS.COMMENT;
        await ctx.reply('💬 Добавьте комментарий к заказу или напишите "нет".', getCancelKeyboard());
        return;
      }

      if (flow.step === ORDER_STEPS.COMMENT) {
        flow.data.comment = text.toLowerCase() === 'нет' ? '' : text;
        flow.step = ORDER_STEPS.URGENCY;
        await ctx.reply('⏰ Насколько срочно нужен отклик?', getUrgencyKeyboard());
        return;
      }

      if (flow.step === ORDER_STEPS.URGENCY) {
        const option = URGENCY_OPTIONS.find((item) => item.label === text);
        if (!option) {
          await ctx.reply('🙂 Выберите срочность кнопкой ниже.', getUrgencyKeyboard());
          return;
        }

        flow.data.urgencyKey = option.key;
        flow.step = ORDER_STEPS.PRICE;
        await ctx.reply('💰 Укажите цену числом в рублях. Например: 300', getCancelKeyboard());
        return;
      }

      if (flow.step === ORDER_STEPS.PRICE) {
        const price = Number(text);
        if (!Number.isFinite(price) || price <= 0) {
          await ctx.reply('🙂 Введите цену числом больше 0. Например: 300');
          return;
        }

        flow.data.price = String(Math.round(price));
        flow.step = ORDER_STEPS.PAYMENT;
        await ctx.reply('💳 Выберите способ оплаты кнопкой ниже.', getPaymentKeyboard());
        return;
      }

      if (flow.step === ORDER_STEPS.PAYMENT) {
        if (!PAYMENT_OPTIONS.includes(text)) {
          await ctx.reply('🙂 Выберите способ оплаты кнопкой ниже.', getPaymentKeyboard());
          return;
        }

        flow.data.paymentMethod = text;
        flow.data.nextAction = 'trash_photo';

        if (await warnAboutNoReadyProviders(ctx, getUserByTelegramId(ctx.from.id), flow)) {
          return;
        }

        flow.step = ORDER_STEPS.PHOTO_BEFORE;
        await ctx.reply('📸 Пришлите фото мусора у двери. Без фото заказ не будет создан.', getCancelKeyboard());
        return;
      }

      if (flow.step === ORDER_STEPS.PHOTO_BEFORE || flow.step === ORDER_STEPS.PHOTO_AFTER) {
        await ctx.reply('📸 Нужна именно фотография.');
      }
    }

    if (flow.type === 'general_order') {
      if (flow.step === ORDER_STEPS.REQUEST_DETAILS) {
        flow.data.comment = text;
        flow.step = ORDER_STEPS.URGENCY;
        await ctx.reply('⏰ Насколько срочно нужен отклик?', getUrgencyKeyboard());
        return;
      }

      if (flow.step === ORDER_STEPS.URGENCY) {
        const option = URGENCY_OPTIONS.find((item) => item.label === text);
        if (!option) {
          await ctx.reply('🙂 Выберите срочность кнопкой ниже.', getUrgencyKeyboard());
          return;
        }

        flow.data.urgencyKey = option.key;
        flow.step = ORDER_STEPS.PRICE;
        await ctx.reply('💰 Укажите цену числом в рублях. Например: 500', getCancelKeyboard());
        return;
      }

      if (flow.step === ORDER_STEPS.PRICE) {
        const price = Number(text);
        if (!Number.isFinite(price) || price <= 0) {
          await ctx.reply('🙂 Введите цену числом больше 0. Например: 500');
          return;
        }

        flow.data.price = String(Math.round(price));
        flow.step = ORDER_STEPS.PAYMENT;
        await ctx.reply('💳 Выберите способ оплаты кнопкой ниже.', getPaymentKeyboard());
        return;
      }

      if (flow.step === ORDER_STEPS.PAYMENT) {
        const user = getUserByTelegramId(ctx.from.id);
        if (!PAYMENT_OPTIONS.includes(text)) {
          await ctx.reply('🙂 Выберите способ оплаты кнопкой ниже.', getPaymentKeyboard());
          return;
        }

        flow.data.paymentMethod = text;
        flow.data.nextAction = 'general_create';

        if (await warnAboutNoReadyProviders(ctx, user, flow)) {
          return;
        }

        await createGeneralOrderFromFlow(ctx, user, flow, bot);
        return;
      }

      if (flow.step === ORDER_STEPS.READY_CONFIRM) {
        const user = getUserByTelegramId(ctx.from.id);

        if (text === CHANGE_URGENCY_TEXT) {
          flow.step = ORDER_STEPS.URGENCY;
          await ctx.reply('⏰ Выберите новую срочность.', getUrgencyKeyboard());
          return;
        }

        if (text !== FORCE_CREATE_TEXT) {
          await ctx.reply('🙂 Выберите один из вариантов кнопкой ниже.', getAvailabilityWarningKeyboard());
          return;
        }

        if (flow.data.nextAction === 'general_create') {
          await createGeneralOrderFromFlow(ctx, user, flow, bot);
          return;
        }
      }
    }

    if (flow.type === 'trash_order' && flow.step === ORDER_STEPS.READY_CONFIRM) {
      if (text === CHANGE_URGENCY_TEXT) {
        flow.step = ORDER_STEPS.URGENCY;
        await ctx.reply('⏰ Выберите новую срочность.', getUrgencyKeyboard());
        return;
      }

      if (text !== FORCE_CREATE_TEXT) {
        await ctx.reply('🙂 Выберите один из вариантов кнопкой ниже.', getAvailabilityWarningKeyboard());
        return;
      }

      flow.step = ORDER_STEPS.PHOTO_BEFORE;
      await ctx.reply('📸 Пришлите фото мусора у двери. Без фото заказ не будет создан.', getCancelKeyboard());
      return;
    }
  });

  bot.catch((error, ctx) => {
    console.error('Bot error:', error);
    if (ctx && ctx.reply) {
      ctx.reply('⚠️ Что-то пошло не так. Попробуйте еще раз.');
    }
  });

  return bot;
}

module.exports = {
  createBot,
  ensureDb,
};

if (require.main === module) {
  loadEnvFile();
  ensureDb();
  const bot = createBot(process.env.BOT_TOKEN);

  bot.launch().then(() => {
    console.log('DomHelperBot started');
  });

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
