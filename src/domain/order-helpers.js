const {
  PROVIDER_AVAILABILITY,
  SERVICE_TEMPLATES,
  STATUS_LABELS,
  URGENCY_OPTIONS,
} = require('../config/app-data');

function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function availabilityLabel(status) {
  const labels = {
    [PROVIDER_AVAILABILITY.READY_NOW]: '🟢 Готов помочь сейчас',
    [PROVIDER_AVAILABILITY.LATER]: '🕒 Смогу позже',
    [PROVIDER_AVAILABILITY.OFFLINE]: '⛔ Не на связи',
  };

  return labels[status] || labels[PROVIDER_AVAILABILITY.OFFLINE];
}

function urgencyLabel(key) {
  const option = URGENCY_OPTIONS.find((item) => item.key === key);
  return option ? option.label : '🌿 Без спешки';
}

function urgencyPriority(key) {
  const priorities = {
    within_hour: 3,
    today: 2,
    flexible: 1,
  };

  return priorities[key] || 0;
}

function urgencyBadge(key) {
  const badges = {
    within_hour: '🚨 СРОЧНО',
    today: '⏰ Сегодня',
    flexible: '🌿 Без спешки',
  };

  return badges[key] || '🌿 Без спешки';
}

function getServiceTemplate(key) {
  return SERVICE_TEMPLATES.find((item) => item.key === key);
}

function getOrderDisplayTitle(order) {
  if (order.title) {
    return order.title;
  }

  const template = getServiceTemplate(order.serviceKey || order.type);
  return template ? template.title : '🤝 Соседский запрос';
}

function priceLabel(price) {
  return price ? `${price} ₽` : 'не указана';
}

function getPopularServices(db, houseId) {
  const counts = new Map();

  for (const order of db.orders) {
    if (houseId && order.houseId !== houseId) {
      continue;
    }

    const key = order.serviceKey || order.type;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return SERVICE_TEMPLATES
    .map((service) => ({
      ...service,
      totalCount: counts.get(service.key) || 0,
      score: service.baseScore + (counts.get(service.key) || 0) * 10,
    }))
    .sort((left, right) => right.score - left.score || right.totalCount - left.totalCount)
    .slice(0, 5);
}

function getProviderAvailabilityStats(db, houseId) {
  const providers = db.users.filter((user) => user.houseId === houseId && user.role === 'provider');
  return {
    total: providers.length,
    readyNow: providers.filter((user) => user.availabilityStatus === PROVIDER_AVAILABILITY.READY_NOW).length,
    later: providers.filter((user) => user.availabilityStatus === PROVIDER_AVAILABILITY.LATER).length,
    offline: providers.filter(
      (user) => !user.availabilityStatus || user.availabilityStatus === PROVIDER_AVAILABILITY.OFFLINE
    ).length,
  };
}

module.exports = {
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
};
