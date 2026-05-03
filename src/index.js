const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { Telegraf, Markup, session } = require('telegraf');
const {
  PAYMENT_OPTIONS,
  PROVIDER_AVAILABILITY,
  URGENCY_OPTIONS,
} = require('./config/app-data');
const { MENU } = require('./config/ui-copy');
const {
  availabilityLabel,
  getOrderDisplayTitle,
  getPopularServices,
  getProviderAvailabilityStats,
  getProviderRatingStats,
  getServiceTemplate,
  priceLabel,
  statusLabel,
  urgencyLabel,
  urgencyPriority,
} = require('./domain/order-helpers');
const { buildOrderFromListing } = require('./domain/listing-helpers');
const {
  ADD_HOUSE_TEXT,
  CHANGE_HOUSE_TEXT,
  CONFIRM_HOUSE_TEXT,
  DEFAULT_PILOT_CITY,
  buildHouseInviteLink,
  buildHouseAddress,
  buildHouseTitle,
  buildNormalizedAddress,
  findHouseByJoinCode,
  findHouseByNormalizedAddress,
  generateJoinCode,
  parseHouseStartPayload,
} = require('./domain/house-helpers');
const {
  isValidFloor,
  isValidName,
  isValidPhone,
  isValidShortAddressPart,
  normalizePhone,
} = require('./domain/registration-validation');
const {
  assignedOrderText,
  buildOrderSummary,
  houseLabel,
  listingCardText,
  listingInterestText,
  listingOrderCreatedText,
  listingOrderNextStepText,
  listingTypeLabel,
  orderSummaryForProvider,
  profileText,
  publicOrderText,
  roleLabel,
} = require('./presentation/telegram-text');
const {
  CANCEL_TEXT,
  CHANGE_URGENCY_TEXT,
  FORCE_CREATE_TEXT,
  getAvailabilityInlineKeyboard,
  getAvailabilityWarningKeyboard,
  getCancelKeyboard,
  getListingInlineKeyboard,
  getListingsInlineKeyboard,
  getMainKeyboard,
  getOrderInlineKeyboard,
  getOrderRatingInlineKeyboard,
  getPaymentKeyboard,
  getPopularServicesInlineKeyboard,
  getProfileInlineKeyboard,
  getRequestTypeInlineKeyboard,
  getUrgencyKeyboard,
} = require('./presentation/telegram-keyboards');
const {
  ensureDb,
  readDb,
  withDb,
} = require('./storage/json-store');
const {
  notifyClientOrderAssigned,
  notifyClientOrderCompleted,
  notifyProviderOrderCancelled,
  notifyProviderOrderConfirmed,
  notifyProviders,
} = require('./notifications/telegram-notifications');

const ENV_PATH = path.join(__dirname, '..', '.env');
const BOT_USERNAME = process.env.BOT_USERNAME || 'YouDomHelperBot';

const REGISTRATION_STEPS = {
  NAME: 'registration_name',
  PHONE: 'registration_phone',
  ROLE: 'registration_role',
  HOUSE: 'registration_house',
  HOUSE_STREET: 'registration_house_street',
  HOUSE_NUMBER: 'registration_house_number',
  HOUSE_CONFIRM: 'registration_house_confirm',
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

const LISTING_STEPS = {
  TITLE: 'listing_title',
  DESCRIPTION: 'listing_description',
  TERMS: 'listing_terms',
};

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

function getTelegramUser(ctx) {
  return ctx.from || {};
}

async function getUserByTelegramId(telegramId) {
  const db = await readDb();
  return db.users.find((user) => user.telegramId === String(telegramId));
}

async function getHouse(houseId) {
  const db = await readDb();
  return db.houses.find((house) => house.id === houseId);
}

async function getOrder(orderId) {
  const db = await readDb();
  return db.orders.find((order) => order.id === orderId);
}

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getBotUsername() {
  return process.env.BOT_USERNAME || BOT_USERNAME;
}

function getStartPayload(ctx) {
  const text = ctx.message && ctx.message.text ? ctx.message.text : '';
  return text.split(/\s+/)[1] || '';
}

function getActiveHouseButtons(db) {
  const houseButtons = db.houses
    .filter((house) => house.isActive && house.city === DEFAULT_PILOT_CITY)
    .sort((left, right) => houseLabel(left).localeCompare(houseLabel(right), 'ru'))
    .map((house) => [houseLabel(house)]);

  houseButtons.push([ADD_HOUSE_TEXT]);
  houseButtons.push([CANCEL_TEXT]);
  return houseButtons;
}

async function resolveHouseStartPayload(ctx) {
  const joinCode = parseHouseStartPayload(getStartPayload(ctx));
  if (!joinCode) {
    return null;
  }

  const db = await readDb();
  const house = findHouseByJoinCode(db, joinCode);
  if (!house) {
    return null;
  }

  ctx.session.pendingHouseId = house.id;
  return house;
}

function setRegistrationHouseAndAskEntrance(ctx, flow, house) {
  flow.data.houseId = house.id;
  flow.step = REGISTRATION_STEPS.ENTRANCE;
  return ctx.reply('🚪 Введите номер подъезда.', getCancelKeyboard());
}

function isFinishedOrderStatus(status) {
  return ['confirmed', 'cancelled'].includes(status);
}

async function showOrderDetails(ctx, orderId) {
  const user = await getUserByTelegramId(ctx.from.id);
  if (!user) {
    await showStart(ctx, 'Сначала зарегистрируйтесь.');
    return;
  }

  const db = await readDb();
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
  const inlineKeyboard = getOrderInlineKeyboard(order, user, { showOpen: false });
  await ctx.reply(summary, {
    ...getMainKeyboard(user),
    ...(inlineKeyboard || {}),
  });
}

async function showStart(ctx, message) {
  const tgUser = getTelegramUser(ctx);
  const user = await getUserByTelegramId(tgUser.id);

  if (!user) {
    await ctx.reply(
      message || '🏡 Добро пожаловать в DomHelperBot.\n\nЗдесь соседи помогают друг другу внутри одного дома.\nДля старта зарегистрируйтесь и привяжитесь к своему дому.',
      getMainKeyboard(null)
    );
    return;
  }

  const house = await getHouse(user.houseId);
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
  const user = await getUserByTelegramId(ctx.from.id);
  if (!user) {
    await showStart(ctx, 'Сначала зарегистрируйтесь.');
    return;
  }

  const db = await readDb();
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
  const user = await getUserByTelegramId(ctx.from.id);
  if (!user) {
    await showStart(ctx, 'Сначала зарегистрируйтесь.');
    return;
  }

  const db = await readDb();
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
      const inlineKeyboard = getOrderInlineKeyboard(order, user, { showOpen: false });
      await ctx.reply(summary, {
        ...getMainKeyboard(user),
        ...(inlineKeyboard || {}),
      });
    }
  }
}

async function showMyHouse(ctx) {
  const user = await getUserByTelegramId(ctx.from.id);
  if (!user) {
    await showStart(ctx, 'Сначала зарегистрируйтесь.');
    return;
  }

  const house = await getHouse(user.houseId);
  const db = await readDb();
  const ratingStats = user.role === 'provider' ? getProviderRatingStats(db, user.id, user.houseId) : null;
  await ctx.reply(
    profileText(user, house, { ratingStats }),
    {
      ...getMainKeyboard(user),
      ...getProfileInlineKeyboard(user),
    }
  );
}

async function showHouseInvite(ctx) {
  const user = await getUserByTelegramId(ctx.from.id);
  if (!user) {
    await showStart(ctx, '🏡 Сначала зарегистрируйтесь.');
    return;
  }

  const house = await getHouse(user.houseId);
  if (!house || !house.joinCode) {
    await ctx.reply('🏠 Для вашего дома пока не готова ссылка приглашения. Попробуйте позже.', getMainKeyboard(user));
    return;
  }

  const inviteLink = buildHouseInviteLink(getBotUsername(), house);
  const caption = [
    '📎 Пригласить соседей',
    '',
    `Дом: ${houseLabel(house)}`,
    '',
    inviteLink,
    '',
    'Эту ссылку можно отправить в чат дома. QR-код можно распечатать и повесить в подъезде.',
  ].join('\n');

  const qrBuffer = await QRCode.toBuffer(inviteLink, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 720,
  });

  await ctx.replyWithPhoto(
    { source: qrBuffer },
    {
      caption,
      ...getMainKeyboard(user),
    }
  );
}

async function showAvailabilitySettings(ctx) {
  const user = await getUserByTelegramId(ctx.from.id);
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
  const user = await getUserByTelegramId(ctx.from.id);
  if (!user) {
    await showStart(ctx, '🏡 Сначала зарегистрируйтесь.');
    return;
  }

  const db = await readDb();
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
      houseAutoSelected: false,
      entrance: existingUser.entrance,
      floor: existingUser.floor,
      apartment: existingUser.apartment,
    } : {
      houseId: ctx.session.pendingHouseId || null,
      houseAutoSelected: Boolean(ctx.session.pendingHouseId),
      joinedByHouseLink: Boolean(ctx.session.pendingHouseId),
    },
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
  const user = await getUserByTelegramId(ctx.from.id);
  if (!user) {
    await showStart(ctx, '🏡 Сначала зарегистрируйтесь.');
    return;
  }

  const db = await readDb();
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
  const db = await readDb();
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
  const order = await withDb((db) => {
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
  const user = await getUserByTelegramId(ctx.from.id);
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

async function showListingsHub(ctx) {
  const user = await getUserByTelegramId(ctx.from.id);
  if (!user) {
    await showStart(ctx, '🏡 Сначала зарегистрируйтесь.');
    return;
  }

  const db = await readDb();
  const activeCount = db.listings.filter(
    (listing) => listing.houseId === user.houseId && listing.status === 'active'
  ).length;

  await ctx.reply(
    [
      '🧰 Услуги и аренда',
      '',
      'Здесь соседи публикуют, что могут сделать или дать во временное пользование.',
      `Активных предложений в вашем доме: ${activeCount}.`,
    ].join('\n'),
    {
      ...getMainKeyboard(user),
      ...getListingsInlineKeyboard(),
    }
  );
}

async function showHouseListings(ctx) {
  const user = await getUserByTelegramId(ctx.from.id);
  if (!user) {
    await showStart(ctx, '🏡 Сначала зарегистрируйтесь.');
    return;
  }

  const db = await readDb();
  const listings = db.listings
    .filter((listing) => listing.houseId === user.houseId && listing.status === 'active')
    .slice(-10)
    .reverse();

  if (!listings.length) {
    await ctx.reply('📭 В вашем доме пока нет активных предложений.', {
      ...getMainKeyboard(user),
      ...getListingsInlineKeyboard(),
    });
    return;
  }

  await ctx.reply('🔎 Активные предложения дома', getMainKeyboard(user));
  for (const listing of listings) {
    const owner = db.users.find((item) => item.id === listing.ownerUserId);
    const ownerRatingStats = owner ? getProviderRatingStats(db, owner.id, listing.houseId) : null;
    const inlineKeyboard = getListingInlineKeyboard(listing, user);
    await ctx.reply(listingCardText(listing, owner, { ownerRatingStats }), {
      ...getMainKeyboard(user),
      ...(inlineKeyboard || {}),
    });
  }
}

async function showMyListings(ctx) {
  const user = await getUserByTelegramId(ctx.from.id);
  if (!user) {
    await showStart(ctx, '🏡 Сначала зарегистрируйтесь.');
    return;
  }

  const db = await readDb();
  const listings = db.listings
    .filter((listing) => listing.ownerUserId === user.id)
    .slice(-10)
    .reverse();

  if (!listings.length) {
    await ctx.reply('📭 Вы пока не добавляли предложения.', {
      ...getMainKeyboard(user),
      ...getListingsInlineKeyboard(),
    });
    return;
  }

  await ctx.reply('📋 Мои предложения', getMainKeyboard(user));
  for (const listing of listings) {
    const inlineKeyboard = getListingInlineKeyboard(listing, user);
    await ctx.reply(listingCardText(listing, user, { showOwner: false }), {
      ...getMainKeyboard(user),
      ...(inlineKeyboard || {}),
    });
  }
}

function startListingFlow(ctx, user, type) {
  if (!user) {
    return showStart(ctx, '🏡 Сначала зарегистрируйтесь.');
  }

  ctx.session.flow = {
    type: 'listing',
    step: LISTING_STEPS.TITLE,
    data: { listingType: type },
  };

  return ctx.reply(
    [
      `${listingTypeLabel(type)}`,
      'Введите короткое название предложения.',
      type === 'rental' ? 'Например: Дам дрель на вечер' : 'Например: Соберу шкаф',
    ].join('\n'),
    getCancelKeyboard()
  );
}

async function createListingFromFlow(ctx, user, flow) {
  const listing = await withDb((db) => {
    const newListing = {
      id: generateId('listing'),
      type: flow.data.listingType,
      status: 'active',
      houseId: user.houseId,
      ownerUserId: user.id,
      title: flow.data.title,
      description: flow.data.description,
      terms: flow.data.terms,
      createdAt: new Date().toISOString(),
    };

    db.listings.push(newListing);
    return newListing;
  });

  clearFlow(ctx);
  await ctx.reply('✅ Предложение опубликовано для соседей вашего дома.', getMainKeyboard(user));
  await ctx.reply(listingCardText(listing, user, { showOwner: false }), {
    ...getMainKeyboard(user),
    ...getListingInlineKeyboard(listing, user),
  });
}

async function cancelActiveFlow(ctx, message) {
  const user = await getUserByTelegramId(ctx.from.id);
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
    const invitedHouse = await resolveHouseStartPayload(ctx);
    if (invitedHouse) {
      const user = await getUserByTelegramId(ctx.from.id);
      if (user) {
        await ctx.reply(
          [
            `🏠 Ссылка ведет в дом: ${houseLabel(invitedHouse)}.`,
            'Если хотите сменить дом, нажмите "Профиль" и пройдите регистрацию заново.',
          ].join('\n'),
          getMainKeyboard(user)
        );
        return;
      }

      await ctx.reply(
        [
          `🏠 Вы перешли по ссылке дома: ${houseLabel(invitedHouse)}.`,
          'Начните регистрацию — дом будет выбран автоматически.',
        ].join('\n'),
        getMainKeyboard(null)
      );
      return;
    }

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

  bot.command('houseqr', async (ctx) => {
    await showHouseInvite(ctx);
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
    const user = await getUserByTelegramId(ctx.from.id);
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
        '/houseqr - ссылка и QR для приглашения соседей',
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

    const result = await withDb((db) => {
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

    const result = await withDb((db) => {
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
    const user = await getUserByTelegramId(ctx.from.id);

    if (!user) {
      await ctx.answerCbQuery('🏡 Сначала зарегистрируйтесь.');
      return;
    }

    if (user.role !== 'provider') {
      await ctx.answerCbQuery('🧰 Взять заказ может только исполнитель.');
      return;
    }

    const result = await withDb((db) => {
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

    const db = await readDb();
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
    const user = await getUserByTelegramId(ctx.from.id);
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
    const user = await getUserByTelegramId(ctx.from.id);
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
    const user = await getUserByTelegramId(ctx.from.id);
    const order = await getOrder(orderId);

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
    const user = await getUserByTelegramId(ctx.from.id);
    const order = await getOrder(orderId);

    if (!user || !order || order.providerUserId !== user.id) {
      await ctx.answerCbQuery('🔒 Недоступно.');
      return;
    }

    if (order.type === 'service') {
      const result = await withDb((db) => {
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
    const user = await getUserByTelegramId(ctx.from.id);

    const result = await withDb((db) => {
      const order = db.orders.find((item) => item.id === orderId);
      if (!order) {
        return { error: 'Заказ не найден.' };
      }

      if (!user || order.clientUserId !== user.id) {
        return { error: 'Подтверждение доступно только клиенту.' };
      }

      if (order.status !== 'completed') {
        return { error: 'Подтверждение доступно после отметки исполнителя о выполнении.' };
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
    await ctx.reply(
      [
        `🎉 Заказ #${orderId} подтвержден. Спасибо!`,
        'Оцените исполнителя — это поможет соседям выбирать надежных помощников.',
      ].join('\n'),
      {
        ...getMainKeyboard(user),
        ...getOrderRatingInlineKeyboard(result.order),
      }
    );
    await notifyProviderOrderConfirmed(bot, result.order);
  });

  bot.action(/^rate_order:(.+):([1-5])$/, async (ctx) => {
    const orderId = ctx.match[1];
    const score = Number(ctx.match[2]);
    const user = await getUserByTelegramId(ctx.from.id);

    const result = await withDb((db) => {
      const order = db.orders.find((item) => item.id === orderId);
      if (!order) {
        return { error: 'Заказ не найден.' };
      }

      if (!user || order.clientUserId !== user.id) {
        return { error: 'Оценку может поставить только клиент.' };
      }

      if (order.status !== 'confirmed') {
        return { error: 'Оценка доступна только после подтверждения заказа.' };
      }

      if (!order.providerUserId) {
        return { error: 'У заказа нет исполнителя.' };
      }

      if (order.rating) {
        return { error: 'Оценка уже сохранена.' };
      }

      order.rating = {
        score,
        clientUserId: user.id,
        providerUserId: order.providerUserId,
        ratedAt: new Date().toISOString(),
      };

      return {
        order,
        ratingStats: getProviderRatingStats(db, order.providerUserId, order.houseId),
      };
    });

    if (result.error) {
      await ctx.answerCbQuery(result.error);
      return;
    }

    await ctx.answerCbQuery(`⭐ Оценка ${score} сохранена.`);
    await ctx.reply(
      [
        `⭐ Спасибо, оценка ${score} из 5 сохранена.`,
        `Рейтинг исполнителя теперь: ${result.ratingStats.average.toFixed(1)} из 5 (${result.ratingStats.count}).`,
      ].join('\n'),
      getMainKeyboard(user)
    );
  });

  bot.action(/^cancel_order:(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    const user = await getUserByTelegramId(ctx.from.id);

    const result = await withDb((db) => {
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

  bot.action('listings:browse', async (ctx) => {
    await ctx.answerCbQuery();
    await showHouseListings(ctx);
  });

  bot.action('listings:create_service', async (ctx) => {
    const user = await getUserByTelegramId(ctx.from.id);
    await ctx.answerCbQuery();
    await startListingFlow(ctx, user, 'service');
  });

  bot.action('listings:create_rental', async (ctx) => {
    const user = await getUserByTelegramId(ctx.from.id);
    await ctx.answerCbQuery();
    await startListingFlow(ctx, user, 'rental');
  });

  bot.action('listings:my', async (ctx) => {
    await ctx.answerCbQuery();
    await showMyListings(ctx);
  });

  bot.action(/^listing_close:(.+)$/, async (ctx) => {
    const listingId = ctx.match[1];
    const user = await getUserByTelegramId(ctx.from.id);

    const result = await withDb((db) => {
      const listing = db.listings.find((item) => item.id === listingId);
      if (!listing) {
        return { error: 'Предложение не найдено.' };
      }

      if (!user || listing.ownerUserId !== user.id) {
        return { error: 'Можно закрыть только свое предложение.' };
      }

      if (listing.status !== 'active') {
        return { error: 'Предложение уже закрыто.' };
      }

      listing.status = 'closed';
      listing.closedAt = new Date().toISOString();
      return { listing };
    });

    if (result.error) {
      await ctx.answerCbQuery(result.error);
      return;
    }

    await ctx.answerCbQuery('Предложение закрыто.');
    await ctx.reply('✅ Предложение закрыто и больше не видно соседям.', getMainKeyboard(user));
  });

  bot.action(/^listing_interest:(.+)$/, async (ctx) => {
    const listingId = ctx.match[1];
    const user = await getUserByTelegramId(ctx.from.id);

    if (!user) {
      await ctx.answerCbQuery('🏡 Сначала зарегистрируйтесь.');
      return;
    }

    const db = await readDb();
    const listing = db.listings.find((item) => item.id === listingId);
    if (!listing) {
      await ctx.answerCbQuery('Предложение не найдено.');
      return;
    }

    if (listing.status !== 'active') {
      await ctx.answerCbQuery('Предложение уже неактивно.');
      return;
    }

    if (listing.houseId !== user.houseId) {
      await ctx.answerCbQuery('Можно откликаться только на предложения своего дома.');
      return;
    }

    if (listing.ownerUserId === user.id) {
      await ctx.answerCbQuery('Это ваше предложение.');
      return;
    }

    const owner = db.users.find((item) => item.id === listing.ownerUserId);
    if (!owner) {
      await ctx.answerCbQuery('Автор предложения не найден.');
      return;
    }

    await ctx.answerCbQuery('Автор получил ваш контакт.');
    await ctx.reply('✅ Автор предложения получил ваш контакт и сможет связаться с вами.', getMainKeyboard(user));

    try {
      await bot.telegram.sendMessage(owner.telegramId, listingInterestText(listing, user));
    } catch (error) {
      console.error(`Failed to notify listing owner ${owner.telegramId}:`, error.message);
    }
  });

  bot.action(/^listing_create_order:(.+)$/, async (ctx) => {
    const listingId = ctx.match[1];
    const user = await getUserByTelegramId(ctx.from.id);

    const result = await withDb((db) => {
      const listing = db.listings.find((item) => item.id === listingId);
      if (!listing) {
        return { error: 'Предложение не найдено.' };
      }

      if (!user) {
        return { error: '🏡 Сначала зарегистрируйтесь.' };
      }

      if (listing.status !== 'active') {
        return { error: 'Предложение уже неактивно.' };
      }

      if (listing.houseId !== user.houseId) {
        return { error: 'Можно создавать запросы только по предложениям своего дома.' };
      }

      if (listing.ownerUserId === user.id) {
        return { error: 'Нельзя создать запрос по своему предложению.' };
      }

      const owner = db.users.find((item) => item.id === listing.ownerUserId);
      if (!owner) {
        return { error: 'Автор предложения не найден.' };
      }

      const order = buildOrderFromListing(listing, user, {
        id: generateId('order'),
        now: new Date().toISOString(),
      });
      db.orders.push(order);

      if (listing.type === 'rental') {
        listing.status = 'reserved';
        listing.reservedByOrderId = order.id;
        listing.reservedByUserId = user.id;
        listing.reservedAt = order.createdAt;
      }

      return { listing, order, owner };
    });

    if (result.error) {
      await ctx.answerCbQuery(result.error);
      return;
    }

    await ctx.answerCbQuery('Заказ создан.');
    await ctx.reply(listingOrderNextStepText(result.listing, result.owner), getMainKeyboard(user));
    await showOrderDetails(ctx, result.order.id);

    try {
      await bot.telegram.sendMessage(
        result.owner.telegramId,
        listingOrderCreatedText(result.listing, result.order, user)
      );
    } catch (error) {
      console.error(`Failed to notify listing owner ${result.owner.telegramId}:`, error.message);
    }
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

  bot.hears(MENU.INVITE_NEIGHBORS, async (ctx) => {
    await showHouseInvite(ctx);
  });

  bot.hears(MENU.HOUSE_REQUESTS, async (ctx) => {
    const user = await getUserByTelegramId(ctx.from.id);
    if (!user) {
      await showStart(ctx, '🏡 Сначала зарегистрируйтесь.');
      return;
    }

    const db = await readDb();
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
            Markup.button.callback('Взять заказ', `take_order:${order.id}`),
          ]),
        });
      } else {
        await ctx.reply(publicOrderText(order, client, house), {
          ...getMainKeyboard(user),
          ...Markup.inlineKeyboard([
            Markup.button.callback('Взять заказ', `take_order:${order.id}`),
          ]),
        });
      }
    }
  });

  bot.hears(MENU.FUTURE_MODULES, async (ctx) => {
    await showListingsHub(ctx);
  });

  bot.on('contact', async (ctx) => {
    const flow = ctx.session.flow;
    if (!flow || flow.type !== 'registration' || flow.step !== REGISTRATION_STEPS.PHONE) {
      return;
    }

    const phone = normalizePhone(ctx.message.contact.phone_number);
    if (!isValidPhone(phone)) {
      await ctx.reply('📱 Не получилось распознать телефон. Введите российский номер: +7XXXXXXXXXX или 8XXXXXXXXXX.');
      return;
    }

    flow.data.phone = phone;
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
      const user = await getUserByTelegramId(ctx.from.id);
      const photoBeforeFileId = getBestPhotoFileId(ctx);
      const order = await withDb((db) => {
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
      const user = await getUserByTelegramId(ctx.from.id);
      const photoAfterFileId = getBestPhotoFileId(ctx);
      const result = await withDb((db) => {
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

      await ctx.reply(
        `📸 Фото после принято. Заказ #${result.order.id} отправлен клиенту на подтверждение.`,
        getMainKeyboard(user)
      );
      const db = await readDb();
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
        if (!isValidName(text)) {
          await ctx.reply('👤 Введите имя от 2 до 80 символов.');
          return;
        }

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
        const phone = normalizePhone(text);
        if (!isValidPhone(phone)) {
          await ctx.reply('📱 Введите российский номер: +7XXXXXXXXXX или 8XXXXXXXXXX. Буквы и короткие номера не подходят.');
          return;
        }

        flow.data.phone = phone;
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
        flow.data.city = DEFAULT_PILOT_CITY;

        if (flow.data.houseAutoSelected && flow.data.houseId) {
          const house = await getHouse(flow.data.houseId);
          if (house) {
            await ctx.reply(
              [
                `🏠 Дом выбран по ссылке: ${houseLabel(house)}`,
                'Теперь укажите данные квартиры.',
              ].join('\n'),
              getCancelKeyboard()
            );
            await setRegistrationHouseAndAskEntrance(ctx, flow, house);
            return;
          }
        }

        flow.step = REGISTRATION_STEPS.HOUSE;

        const db = await readDb();
        await ctx.reply(
          [
            `🏠 Город пилота: ${DEFAULT_PILOT_CITY}.`,
            'Выберите дом из списка или добавьте свой.',
          ].join('\n'),
          Markup.keyboard(getActiveHouseButtons(db)).resize().oneTime()
        );
        return;
      }

      if (flow.step === REGISTRATION_STEPS.HOUSE) {
        if (text === ADD_HOUSE_TEXT) {
          flow.step = REGISTRATION_STEPS.HOUSE_STREET;
          await ctx.reply('🏙 Введите улицу в Обнинске без номера дома.', getCancelKeyboard());
          return;
        }

        const db = await readDb();
        const house = db.houses.find((item) => houseLabel(item) === text);
        if (!house) {
          await ctx.reply('🏠 Выберите дом из списка или нажмите "Моего дома нет".');
          return;
        }

        await setRegistrationHouseAndAskEntrance(ctx, flow, house);
        return;
      }

      if (flow.step === REGISTRATION_STEPS.HOUSE_STREET) {
        if (text.length < 2 || text.length > 80) {
          await ctx.reply('🏙 Введите название улицы от 2 до 80 символов.');
          return;
        }

        flow.data.houseStreet = text;
        flow.step = REGISTRATION_STEPS.HOUSE_NUMBER;
        await ctx.reply('🏠 Введите номер дома и корпус, если есть. Например: 10, 10к1 или 10 корпус 1.', getCancelKeyboard());
        return;
      }

      if (flow.step === REGISTRATION_STEPS.HOUSE_NUMBER) {
        if (!isValidShortAddressPart(text)) {
          await ctx.reply('🏠 Введите номер дома от 1 до 20 символов.');
          return;
        }

        const normalizedAddress = buildNormalizedAddress(
          DEFAULT_PILOT_CITY,
          flow.data.houseStreet,
          text
        );
        const db = await readDb();
        const existingHouse = findHouseByNormalizedAddress(db, normalizedAddress);

        if (existingHouse) {
          await ctx.reply(
            [
              '🏠 Такой дом уже есть в списке.',
              `Выбрали: ${houseLabel(existingHouse)}`,
            ].join('\n'),
            getCancelKeyboard()
          );
          await setRegistrationHouseAndAskEntrance(ctx, flow, existingHouse);
          return;
        }

        flow.data.houseNumber = text;
        flow.data.normalizedAddress = normalizedAddress;
        flow.step = REGISTRATION_STEPS.HOUSE_CONFIRM;

        await ctx.reply(
          [
            '🏠 Добавить новый дом?',
            buildHouseTitle(DEFAULT_PILOT_CITY, flow.data.houseStreet, flow.data.houseNumber),
          ].join('\n'),
          Markup.keyboard([[CONFIRM_HOUSE_TEXT], [CHANGE_HOUSE_TEXT], [CANCEL_TEXT]]).resize().oneTime()
        );
        return;
      }

      if (flow.step === REGISTRATION_STEPS.HOUSE_CONFIRM) {
        if (text === CHANGE_HOUSE_TEXT) {
          flow.step = REGISTRATION_STEPS.HOUSE_STREET;
          delete flow.data.houseStreet;
          delete flow.data.houseNumber;
          delete flow.data.normalizedAddress;
          await ctx.reply('🏙 Введите улицу в Обнинске без номера дома.', getCancelKeyboard());
          return;
        }

        if (text !== CONFIRM_HOUSE_TEXT) {
          await ctx.reply('🏠 Подтвердите добавление дома или введите адрес заново.');
          return;
        }

        const newHouse = await withDb((db) => {
          const existingHouse = findHouseByNormalizedAddress(db, flow.data.normalizedAddress);
          if (existingHouse) {
            return existingHouse;
          }

          const house = {
            id: generateId('house'),
            title: buildHouseTitle(DEFAULT_PILOT_CITY, flow.data.houseStreet, flow.data.houseNumber),
            city: DEFAULT_PILOT_CITY,
            street: flow.data.houseStreet,
            houseNumber: flow.data.houseNumber,
            address: buildHouseAddress(flow.data.houseStreet, flow.data.houseNumber),
            normalizedAddress: flow.data.normalizedAddress,
            joinCode: generateJoinCode(),
            isActive: true,
            status: 'active',
            source: 'user',
            createdByTelegramId: String(ctx.from.id),
            createdAt: new Date().toISOString(),
          };

          db.houses.push(house);
          return house;
        });

        await ctx.reply(`✅ Дом добавлен: ${houseLabel(newHouse)}`, getCancelKeyboard());
        flow.data.createdHouseDuringRegistration = true;
        await setRegistrationHouseAndAskEntrance(ctx, flow, newHouse);
        return;
      }

      if (flow.step === REGISTRATION_STEPS.ENTRANCE) {
        if (!isValidShortAddressPart(text)) {
          await ctx.reply('🚪 Введите номер подъезда от 1 до 20 символов.');
          return;
        }

        flow.data.entrance = text;
        flow.step = REGISTRATION_STEPS.FLOOR;
        await ctx.reply('🛗 Введите этаж.', getCancelKeyboard());
        return;
      }

      if (flow.step === REGISTRATION_STEPS.FLOOR) {
        if (!isValidFloor(text)) {
          await ctx.reply('🛗 Введите этаж числом от -5 до 100.');
          return;
        }

        flow.data.floor = text;
        flow.step = REGISTRATION_STEPS.APARTMENT;
        await ctx.reply('🔑 Введите номер квартиры.', getCancelKeyboard());
        return;
      }

      if (flow.step === REGISTRATION_STEPS.APARTMENT) {
        if (!isValidShortAddressPart(text)) {
          await ctx.reply('🔑 Введите номер квартиры от 1 до 20 символов.');
          return;
        }

        const tgUser = getTelegramUser(ctx);
        const createdUser = await withDb((db) => {
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
            isResidentVerified: false,
            joinedByHouseLink: Boolean(flow.data.joinedByHouseLink || (existingUser && existingUser.joinedByHouseLink)),
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
        ctx.session.pendingHouseId = null;
        await showStart(ctx, `🎉 Регистрация завершена для ${createdUser.name}.`);
        await ctx.reply('✨ Профиль сохранен. Можно создать заказ или посмотреть свои заказы.', getMainKeyboard(createdUser));
        if (flow.data.joinedByHouseLink) {
          await ctx.reply('📎 Вы присоединились по ссылке дома. Ее можно переслать соседям через кнопку "Пригласить соседей".', getMainKeyboard(createdUser));
        }
        if (flow.data.createdHouseDuringRegistration) {
          await ctx.reply('📎 Вы добавили новый дом. Пригласите соседей по домовой ссылке или QR-коду.', getMainKeyboard(createdUser));
          await showHouseInvite(ctx);
        }
        return;
      }
    }

    if (flow.type === 'listing') {
      const user = await getUserByTelegramId(ctx.from.id);
      if (!user) {
        await cancelActiveFlow(ctx, '🏡 Сначала зарегистрируйтесь.');
        return;
      }

      if (flow.step === LISTING_STEPS.TITLE) {
        if (text.length < 3 || text.length > 80) {
          await ctx.reply('🏷 Введите название от 3 до 80 символов.');
          return;
        }

        flow.data.title = text;
        flow.step = LISTING_STEPS.DESCRIPTION;
        await ctx.reply('💬 Опишите предложение: что именно делаете или что сдаете.', getCancelKeyboard());
        return;
      }

      if (flow.step === LISTING_STEPS.DESCRIPTION) {
        if (text.length < 10 || text.length > 500) {
          await ctx.reply('💬 Введите описание от 10 до 500 символов.');
          return;
        }

        flow.data.description = text;
        flow.step = LISTING_STEPS.TERMS;
        await ctx.reply('💰 Укажите цену или условия. Например: 500 ₽, шоколадка, договоримся.', getCancelKeyboard());
        return;
      }

      if (flow.step === LISTING_STEPS.TERMS) {
        if (text.length < 2 || text.length > 120) {
          await ctx.reply('💰 Введите условия от 2 до 120 символов.');
          return;
        }

        flow.data.terms = text;
        await createListingFromFlow(ctx, user, flow);
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

        if (await warnAboutNoReadyProviders(ctx, await getUserByTelegramId(ctx.from.id), flow)) {
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
        const user = await getUserByTelegramId(ctx.from.id);
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
        const user = await getUserByTelegramId(ctx.from.id);

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
  (async () => {
    loadEnvFile();
    await ensureDb();
    const bot = createBot(process.env.BOT_TOKEN);

    await bot.launch();
    console.log('DomHelperBot started');

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  })().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
