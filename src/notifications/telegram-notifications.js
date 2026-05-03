const { Markup } = require('telegraf');
const { statusLabel } = require('../domain/order-helpers');
const {
  getOrderInlineKeyboard,
  getOrderRatingInlineKeyboard,
} = require('../presentation/telegram-keyboards');
const {
  publicOrderText,
  compactUserLabel,
  rentalOrderStatusLabel,
} = require('../presentation/telegram-text');
const { readDb } = require('../storage/json-store');

function providerTakeOrderKeyboard(order) {
  return Markup.inlineKeyboard([
    Markup.button.callback('Взять заказ', `take_order:${order.id}`),
  ]);
}

function confirmOrderKeyboard(order) {
  return Markup.inlineKeyboard([
    Markup.button.callback('Подтвердить выполнение', `confirm_order:${order.id}`),
  ]);
}

function clientOrderAssignedText(order, provider) {
  return [
    `Запрос #${order.id} взят в работу.`,
    `🧰 Исполнитель: ${compactUserLabel(provider) || 'без имени'}`,
    `📌 Статус: ${statusLabel(order.status)}`,
  ].join('\n');
}

function clientOrderCompletedText(order) {
  if (order.listingType === 'rental') {
    return [
      `✅ Владелец подтвердил возврат вещи по заказу #${order.id}.`,
      `📌 Статус аренды: ${rentalOrderStatusLabel(order.status)}`,
      'Оцените аренду — это поможет соседям выбирать надежных владельцев вещей.',
    ].join('\n');
  }

  return [
    `✅ Исполнитель отметил запрос #${order.id} как выполненный.`,
    `📌 Статус: ${statusLabel(order.status)}`,
    'Подтвердите выполнение.',
  ].join('\n');
}

function clientOrderCompletedPhotoCaption(order) {
  if (order.listingType === 'rental') {
    return [
      `📸 Фото по возврату вещи #${order.id}.`,
      `📌 Статус аренды: ${rentalOrderStatusLabel(order.status)}`,
      'Оцените аренду.',
    ].join('\n');
  }

  return [
    `📸 Исполнитель прислал фото после по заказу #${order.id}.`,
    `📌 Статус: ${statusLabel(order.status)}`,
    '✅ Подтвердите выполнение.',
  ].join('\n');
}

function providerOrderConfirmedText(order, client) {
  return [
    `🎉 Клиент подтвердил заказ #${order.id}.`,
    `📌 Статус: ${statusLabel(order.status)}`,
    client ? `👤 Клиент: ${compactUserLabel(client) || 'без имени'}` : null,
  ].filter(Boolean).join('\n');
}

function providerOrderCancelledText(order) {
  return [
    `⚠️ Заказ #${order.id} отменен клиентом.`,
    `📌 Статус: ${statusLabel(order.status)}`,
  ].join('\n');
}

function clientRentalHandedOverText(order) {
  return [
    `🧰 Владелец отметил передачу вещи по заказу #${order.id}.`,
    `📌 Статус аренды: ${rentalOrderStatusLabel(order.status)}`,
    'Когда закончите пользоваться вещью, нажмите "Готов вернуть".',
  ].join('\n');
}

function providerRentalReturnRequestedText(order, client) {
  return [
    `↩️ Клиент готов вернуть вещь по заказу #${order.id}.`,
    client ? `👤 Клиент: ${compactUserLabel(client) || 'без имени'}` : null,
    `📌 Статус аренды: ${rentalOrderStatusLabel(order.status)}`,
    'Когда вещь фактически вернется к вам, нажмите "Вещь вернулась".',
  ].filter(Boolean).join('\n');
}

async function notifyProviders(bot, order, options = {}) {
  const db = await (options.readDb || readDb)();
  const client = db.users.find((user) => user.id === order.clientUserId);
  const house = db.houses.find((item) => item.id === order.houseId);
  const providers = db.users.filter(
    (user) => user.houseId === order.houseId && user.role === 'provider' && user.telegramId !== client.telegramId
  );

  const message = publicOrderText(order, client, house);
  const buttons = providerTakeOrderKeyboard(order);

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

async function notifyClientOrderAssigned(bot, order, provider, options = {}) {
  const db = await (options.readDb || readDb)();
  const client = db.users.find((user) => user.id === order.clientUserId);
  if (!client) {
    return;
  }

  await bot.telegram.sendMessage(client.telegramId, clientOrderAssignedText(order, provider));
}

async function notifyClientOrderCompleted(bot, order, options = {}) {
  const db = await (options.readDb || readDb)();
  const client = db.users.find((user) => user.id === order.clientUserId);
  if (!client) {
    return;
  }

  const buttons = order.listingType === 'rental'
    ? getOrderRatingInlineKeyboard(order)
    : confirmOrderKeyboard(order);

  if (order.photoAfterFileId) {
    await bot.telegram.sendPhoto(client.telegramId, order.photoAfterFileId, {
      caption: clientOrderCompletedPhotoCaption(order),
      ...buttons,
    });
    return;
  }

  await bot.telegram.sendMessage(client.telegramId, clientOrderCompletedText(order), {
    ...buttons,
  });
}

async function notifyClientRentalHandedOver(bot, order, options = {}) {
  const db = await (options.readDb || readDb)();
  const client = db.users.find((user) => user.id === order.clientUserId);
  if (!client) {
    return;
  }

  await bot.telegram.sendMessage(client.telegramId, clientRentalHandedOverText(order), {
    ...getOrderInlineKeyboard(order, client),
  });
}

async function notifyProviderRentalReturnRequested(bot, order, options = {}) {
  const db = await (options.readDb || readDb)();
  const provider = db.users.find((user) => user.id === order.providerUserId);
  const client = db.users.find((user) => user.id === order.clientUserId);
  if (!provider) {
    return;
  }

  await bot.telegram.sendMessage(provider.telegramId, providerRentalReturnRequestedText(order, client), {
    ...getOrderInlineKeyboard(order, provider),
  });
}

async function notifyProviderOrderConfirmed(bot, order, options = {}) {
  const db = await (options.readDb || readDb)();
  const provider = db.users.find((user) => user.id === order.providerUserId);
  const client = db.users.find((user) => user.id === order.clientUserId);

  if (!provider) {
    return;
  }

  await bot.telegram.sendMessage(provider.telegramId, providerOrderConfirmedText(order, client));
}

async function notifyProviderOrderCancelled(bot, order, options = {}) {
  const db = await (options.readDb || readDb)();
  const provider = db.users.find((user) => user.id === order.providerUserId);

  if (!provider) {
    return;
  }

  await bot.telegram.sendMessage(provider.telegramId, providerOrderCancelledText(order));
}

module.exports = {
  clientOrderAssignedText,
  clientOrderCompletedPhotoCaption,
  clientOrderCompletedText,
  clientRentalHandedOverText,
  notifyClientOrderAssigned,
  notifyClientOrderCompleted,
  notifyClientRentalHandedOver,
  notifyProviderOrderCancelled,
  notifyProviderOrderConfirmed,
  notifyProviderRentalReturnRequested,
  notifyProviders,
  providerRentalReturnRequestedText,
  providerOrderCancelledText,
  providerOrderConfirmedText,
};
