const { Markup } = require('telegraf');
const { statusLabel } = require('../domain/order-helpers');
const { publicOrderText, compactUserLabel } = require('../presentation/telegram-text');
const { readDb } = require('../storage/json-store');

function providerTakeOrderKeyboard(order) {
  return Markup.inlineKeyboard([
    Markup.button.callback('Взять запрос', `take_order:${order.id}`),
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
  return [
    `✅ Исполнитель отметил запрос #${order.id} как выполненный.`,
    `📌 Статус: ${statusLabel(order.status)}`,
    'Подтвердите выполнение.',
  ].join('\n');
}

function clientOrderCompletedPhotoCaption(order) {
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

async function notifyProviders(bot, order, options = {}) {
  const db = (options.readDb || readDb)();
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
  const db = (options.readDb || readDb)();
  const client = db.users.find((user) => user.id === order.clientUserId);
  if (!client) {
    return;
  }

  await bot.telegram.sendMessage(client.telegramId, clientOrderAssignedText(order, provider));
}

async function notifyClientOrderCompleted(bot, order, options = {}) {
  const db = (options.readDb || readDb)();
  const client = db.users.find((user) => user.id === order.clientUserId);
  if (!client) {
    return;
  }

  const buttons = confirmOrderKeyboard(order);

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

async function notifyProviderOrderConfirmed(bot, order, options = {}) {
  const db = (options.readDb || readDb)();
  const provider = db.users.find((user) => user.id === order.providerUserId);
  const client = db.users.find((user) => user.id === order.clientUserId);

  if (!provider) {
    return;
  }

  await bot.telegram.sendMessage(provider.telegramId, providerOrderConfirmedText(order, client));
}

async function notifyProviderOrderCancelled(bot, order, options = {}) {
  const db = (options.readDb || readDb)();
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
  notifyClientOrderAssigned,
  notifyClientOrderCompleted,
  notifyProviderOrderCancelled,
  notifyProviderOrderConfirmed,
  notifyProviders,
  providerOrderCancelledText,
  providerOrderConfirmedText,
};
