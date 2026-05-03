const {
  availabilityLabel,
  getOrderDisplayTitle,
  getProviderRatingStats,
  priceLabel,
  providerRatingLabel,
  statusLabel,
  urgencyBadge,
  urgencyLabel,
} = require('../domain/order-helpers');

function compactUserLabel(user) {
  if (!user) {
    return '';
  }

  return [user.name, user.username ? `@${user.username}` : null].filter(Boolean).join(' ');
}

function houseLabel(house) {
  if (house.title && house.address && house.title.includes(house.address)) {
    return house.title;
  }

  return `${house.title} (${house.address})`;
}

function roleLabel(role) {
  if (role === 'provider') {
    return 'Исполнитель';
  }
  return 'Заказчик';
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

function compactRatingSuffix(stats) {
  if (!stats || !stats.count) {
    return '';
  }

  return ` · ⭐ ${stats.average.toFixed(1)}`;
}

function rentalOrderStatusLabel(status) {
  if (status === 'assigned') {
    return 'Забронирована';
  }

  if (status === 'rented') {
    return 'Вещь в аренде';
  }

  if (status === 'return_requested') {
    return 'Клиент готов вернуть вещь';
  }

  if (status === 'completed') {
    return 'Возврат отмечен владельцем';
  }

  if (status === 'confirmed') {
    return 'Возврат подтвержден';
  }

  if (status === 'cancelled') {
    return 'Бронь отменена';
  }

  return statusLabel(status);
}

function rentalOrderSummaryForClient(order, owner, ownerRatingStats) {
  return [
    `${getOrderDisplayTitle(order)} #${order.id}`,
    `📌 Статус аренды: ${rentalOrderStatusLabel(order.status)}`,
    owner
      ? `👤 Владелец: ${compactUserLabel(owner) || 'без имени'}${compactRatingSuffix(ownerRatingStats)}`
      : '👤 Владелец: еще не назначен',
    `💬 Описание: ${order.comment || 'без описания'}`,
    `💳 Условия аренды: ${order.paymentMethod || 'договоримся'}`,
  ].join('\n');
}

function rentalOrderSummaryForProvider(order, client) {
  return [
    `${getOrderDisplayTitle(order)} #${order.id}`,
    `📌 Статус аренды: ${rentalOrderStatusLabel(order.status)}`,
    `👤 Клиент: ${compactUserLabel(client) || 'без имени'}`,
    `💬 Описание: ${order.comment || 'без описания'}`,
    `💳 Условия аренды: ${order.paymentMethod || 'договоримся'}`,
  ].join('\n');
}

function orderSummaryForClient(order, provider, providerRatingStats) {
  if (order.listingType === 'rental') {
    return rentalOrderSummaryForClient(order, provider, providerRatingStats);
  }

  if (order.type === 'service') {
    return [
      `${getOrderDisplayTitle(order)} #${order.id}`,
      `💰 Цена: ${priceLabel(order.price)}`,
      `⏰ Срочность: ${urgencyLabel(order.urgencyKey)}`,
      `📌 Статус: ${statusLabel(order.status)}`,
      provider
        ? `🧰 Исполнитель: ${compactUserLabel(provider) || 'без имени'}${compactRatingSuffix(providerRatingStats)}`
        : '🧰 Исполнитель: еще не назначен',
      `💬 Запрос: ${order.comment || 'без описания'}`,
      `💳 Условия: ${order.paymentMethod || 'договоримся'}`,
    ].join('\n');
  }

  return [
    `📦 Заказ #${order.id}`,
    `💰 Цена: ${priceLabel(order.price)}`,
    `⏰ Срочность: ${urgencyLabel(order.urgencyKey)}`,
    `📌 Статус: ${statusLabel(order.status)}`,
    provider
      ? `🧰 Исполнитель: ${compactUserLabel(provider) || 'без имени'}${compactRatingSuffix(providerRatingStats)}`
      : '🧰 Исполнитель: еще не назначен',
    `🛍 Пакетов: ${order.bagsCount}`,
    `💬 Комментарий: ${order.comment || 'нет'}`,
    `💳 Оплата: ${order.paymentMethod}`,
  ].join('\n');
}

function orderSummaryForProvider(order, client) {
  if (order.listingType === 'rental') {
    return rentalOrderSummaryForProvider(order, client);
  }

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

function buildOrderSummary(order, db, user) {
  const provider = db.users.find((item) => item.id === order.providerUserId);
  const client = db.users.find((item) => item.id === order.clientUserId);
  const ratingStats = provider ? getProviderRatingStats(db, provider.id, order.houseId) : null;
  return user.role === 'provider'
    ? orderSummaryForProvider(order, client)
    : orderSummaryForClient(order, provider, ratingStats);
}

function profileText(user, house, options = {}) {
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
    lines.push(providerRatingLabel(options.ratingStats));
  }

  lines.push('');
  lines.push('✏️ Чтобы обновить профиль или сменить дом, нажмите "Профиль".');
  lines.push('🔄 Чтобы быстро сменить сценарий использования, нажмите кнопку ниже.');
  if (user.role === 'provider') {
    lines.push('🟢 Доступность можно поменять кнопкой "Моя доступность".');
  }

  return lines.join('\n');
}

function listingTypeLabel(type) {
  if (type === 'rental') {
    return '🧰 Аренда вещи';
  }

  return '🛠 Услуга';
}

function listingStatusLabel(status) {
  if (status === 'reserved') {
    return 'Забронировано';
  }

  if (status === 'closed') {
    return 'Закрыто';
  }

  return 'Активно';
}

function listingCardText(listing, owner, options = {}) {
  const { ownerRatingStats = null, showOwner = true } = options;
  const lines = [
    `${listingTypeLabel(listing.type)} #${listing.id}`,
    `📌 Статус: ${listingStatusLabel(listing.status)}`,
    `🏷 ${listing.title}`,
    `💬 ${listing.description}`,
    `💰 Условия: ${listing.terms || 'по договоренности'}`,
  ];

  if (showOwner && owner) {
    lines.push(`👤 Автор: ${compactUserLabel(owner) || 'без имени'}`);
    lines.push(providerRatingLabel(ownerRatingStats));
    lines.push(`📱 Контакт: ${owner.phone || 'не указан'}`);
  }

  return lines.join('\n');
}

function listingInterestText(listing, interestedUser) {
  return [
    `🙋 Сосед откликнулся на предложение #${listing.id}.`,
    `🏷 ${listing.title}`,
    `👤 Кто: ${compactUserLabel(interestedUser) || 'без имени'}`,
    `📱 Телефон: ${interestedUser.phone || 'не указан'}`,
    `🚪 Подъезд: ${interestedUser.entrance || 'не указан'}`,
    `🛗 Этаж: ${interestedUser.floor || 'не указан'}`,
  ].join('\n');
}

function listingOrderCreatedText(listing, order, client) {
  return [
    `📦 По вашему предложению создан запрос #${order.id}.`,
    `🏷 ${listing.title}`,
    `👤 Клиент: ${compactUserLabel(client) || 'без имени'}`,
    `📱 Телефон: ${client.phone || 'не указан'}`,
    `📌 Статус: ${listing.type === 'rental' ? rentalOrderStatusLabel(order.status) : statusLabel(order.status)}`,
  ].join('\n');
}

function listingOrderNextStepText(listing, owner) {
  const lines = [
    listing.type === 'rental'
      ? '✅ Заказ создан. Вещь снята из активных предложений, чтобы ее не заказали повторно.'
      : '✅ Заказ создан и сразу назначен автору предложения.',
    '',
    listing.type === 'rental'
      ? 'Договоритесь с автором, когда и где забрать вещь.'
      : 'Напишите автору, чтобы уточнить детали выполнения.',
  ];

  if (owner && owner.username) {
    lines.push(`Telegram: https://t.me/${owner.username}`);
  }

  if (owner && owner.phone) {
    lines.push(`Телефон: ${owner.phone}`);
  }

  return lines.join('\n');
}

module.exports = {
  assignedOrderText,
  buildOrderSummary,
  compactUserLabel,
  houseLabel,
  listingCardText,
  listingInterestText,
  listingOrderCreatedText,
  listingOrderNextStepText,
  listingStatusLabel,
  listingTypeLabel,
  orderSummaryForClient,
  orderSummaryForProvider,
  profileText,
  publicOrderText,
  rentalOrderStatusLabel,
  roleLabel,
};
