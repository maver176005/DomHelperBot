const { Markup } = require('telegraf');
const {
  PAYMENT_OPTIONS,
  PROVIDER_AVAILABILITY,
  SERVICE_TEMPLATES,
  URGENCY_OPTIONS,
} = require('../config/app-data');
const { MENU } = require('../config/ui-copy');
const { roleLabel } = require('./telegram-text');

const CANCEL_TEXT = '❌ Отмена';
const FORCE_CREATE_TEXT = '⚠️ Все равно создать';
const CHANGE_URGENCY_TEXT = '🔄 Сменить срочность';

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
    buttons.push([MENU.INVITE_NEIGHBORS]);
    buttons.push([MENU.FUTURE_MODULES]);
  } else {
    buttons.push([MENU.START_REGISTRATION]);
  }

  return Markup.keyboard(buttons).resize();
}

function getCancelKeyboard() {
  return Markup.keyboard([[CANCEL_TEXT]]).resize().oneTime();
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

function isFinishedOrderStatus(status) {
  return ['confirmed', 'cancelled'].includes(status);
}

function getOrderInlineKeyboard(order, user, options = {}) {
  if (!user) {
    return undefined;
  }

  const { showOpen = true } = options;
  const buttons = [];

  if (showOpen) {
    buttons.push([Markup.button.callback('Открыть заказ', `view_order:${order.id}`)]);
  }

  if (order.clientUserId === user.id && order.status === 'created') {
    buttons.push([Markup.button.callback('Отменить заказ', `cancel_order:${order.id}`)]);
  }

  if (order.clientUserId === user.id && order.status === 'completed') {
    const confirmText = order.listingType === 'rental' ? 'Подтвердить возврат' : 'Подтвердить выполнение';
    buttons.push([Markup.button.callback(confirmText, `confirm_order:${order.id}`)]);
  }

  if (order.providerUserId === user.id && order.status === 'assigned') {
    const completeText = order.listingType === 'rental'
      ? 'Вещь вернулась'
      : order.type === 'trash_removal'
        ? 'Отправить фото после'
        : 'Отметить выполненным';
    buttons.push([Markup.button.callback(completeText, `complete_order:${order.id}`)]);
  }

  if (
    order.listingType === 'rental' &&
    order.status === 'assigned' &&
    (order.clientUserId === user.id || order.providerUserId === user.id)
  ) {
    buttons.push([Markup.button.callback('Отменить бронь', `cancel_booking:${order.id}`)]);
  }

  if (
    order.clientUserId === user.id &&
    (order.type === 'trash_removal' || order.type === 'service') &&
    order.listingType !== 'rental' &&
    isFinishedOrderStatus(order.status)
  ) {
    buttons.push([Markup.button.callback('Повторить заказ', `repeat_order:${order.id}`)]);
  }

  if (!buttons.length) {
    return undefined;
  }

  return Markup.inlineKeyboard(buttons);
}

function getOrderRatingInlineKeyboard(order) {
  return Markup.inlineKeyboard([
    [1, 2, 3, 4, 5].map((score) => Markup.button.callback(`${score} ⭐`, `rate_order:${order.id}:${score}`)),
  ]);
}

function getListingsInlineKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔎 Смотреть предложения дома', 'listings:browse')],
    [Markup.button.callback('🛠 Предложить услугу', 'listings:create_service')],
    [Markup.button.callback('🧰 Сдать вещь в аренду', 'listings:create_rental')],
    [Markup.button.callback('📋 Мои предложения', 'listings:my')],
  ]);
}

function getListingInlineKeyboard(listing, user) {
  if (!user || listing.status !== 'active') {
    return undefined;
  }

  if (listing.ownerUserId === user.id) {
    return Markup.inlineKeyboard([
      [Markup.button.callback('Закрыть предложение', `listing_close:${listing.id}`)],
    ]);
  }

  if (listing.houseId !== user.houseId) {
    return undefined;
  }

  return Markup.inlineKeyboard([
    [Markup.button.callback('Заказать у соседа', `listing_create_order:${listing.id}`)],
  ]);
}

module.exports = {
  CANCEL_TEXT,
  CHANGE_URGENCY_TEXT,
  FORCE_CREATE_TEXT,
  getAvailabilityInlineKeyboard,
  getAvailabilityWarningKeyboard,
  getCancelKeyboard,
  getMainKeyboard,
  getListingInlineKeyboard,
  getListingsInlineKeyboard,
  getOrderInlineKeyboard,
  getOrderRatingInlineKeyboard,
  getPaymentKeyboard,
  getPopularServicesInlineKeyboard,
  getProfileInlineKeyboard,
  getRequestTypeInlineKeyboard,
  getUrgencyKeyboard,
};
