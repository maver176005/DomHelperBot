const {
  availabilityLabel,
  getOrderDisplayTitle,
  priceLabel,
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

function buildOrderSummary(order, db, user) {
  const provider = db.users.find((item) => item.id === order.providerUserId);
  const client = db.users.find((item) => item.id === order.clientUserId);
  return user.role === 'provider'
    ? orderSummaryForProvider(order, client)
    : orderSummaryForClient(order, provider);
}

function profileText(user, house) {
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

  return lines.join('\n');
}

function listingTypeLabel(type) {
  if (type === 'rental') {
    return '🧰 Аренда вещи';
  }

  return '🛠 Услуга';
}

function listingStatusLabel(status) {
  if (status === 'closed') {
    return 'Закрыто';
  }

  return 'Активно';
}

function listingCardText(listing, owner, options = {}) {
  const { showOwner = true } = options;
  const lines = [
    `${listingTypeLabel(listing.type)} #${listing.id}`,
    `📌 Статус: ${listingStatusLabel(listing.status)}`,
    `🏷 ${listing.title}`,
    `💬 ${listing.description}`,
    `💰 Условия: ${listing.terms || 'по договоренности'}`,
  ];

  if (showOwner && owner) {
    lines.push(`👤 Автор: ${compactUserLabel(owner) || 'без имени'}`);
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
    `📌 Статус: ${statusLabel(order.status)}`,
  ].join('\n');
}

module.exports = {
  assignedOrderText,
  buildOrderSummary,
  compactUserLabel,
  houseLabel,
  listingCardText,
  listingInterestText,
  listingOrderCreatedText,
  listingStatusLabel,
  listingTypeLabel,
  orderSummaryForClient,
  orderSummaryForProvider,
  profileText,
  publicOrderText,
  roleLabel,
};
