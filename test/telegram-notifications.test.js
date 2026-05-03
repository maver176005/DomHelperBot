const assert = require('node:assert/strict');
const test = require('node:test');
const {
  clientOrderAssignedText,
  clientOrderCompletedPhotoCaption,
  clientOrderCompletedText,
  notifyClientOrderCompleted,
  notifyProviders,
  providerOrderCancelledText,
  providerOrderConfirmedText,
} = require('../src/notifications/telegram-notifications');

function createBotSpy() {
  const calls = [];
  return {
    calls,
    bot: {
      telegram: {
        async sendMessage(...args) {
          calls.push({ method: 'sendMessage', args });
        },
        async sendPhoto(...args) {
          calls.push({ method: 'sendPhoto', args });
        },
      },
    },
  };
}

function createDb() {
  return {
    houses: [
      { id: 'house_1', title: 'Дом 1', address: 'ул. Тестовая, 1' },
      { id: 'house_2', title: 'Дом 2', address: 'ул. Тестовая, 2' },
    ],
    users: [
      {
        id: 'client_1',
        telegramId: '100',
        role: 'client',
        houseId: 'house_1',
        name: 'Анна',
        username: 'anna',
        entrance: '1',
        floor: '5',
        apartment: '50',
      },
      {
        id: 'provider_1',
        telegramId: '200',
        role: 'provider',
        houseId: 'house_1',
        name: 'Петр',
        username: 'petr',
      },
      {
        id: 'provider_2',
        telegramId: '300',
        role: 'provider',
        houseId: 'house_2',
        name: 'Олег',
      },
    ],
  };
}

const order = {
  id: 'order_1',
  type: 'trash_removal',
  serviceKey: 'trash_removal',
  status: 'created',
  houseId: 'house_1',
  clientUserId: 'client_1',
  providerUserId: 'provider_1',
  bagsCount: 1,
  comment: '',
  urgencyKey: 'today',
  price: '300',
  paymentMethod: '💳 Перевод',
};

test('notification text builders include key order details', () => {
  assert.match(clientOrderAssignedText({ ...order, status: 'assigned' }, { name: 'Петр' }), /Запрос #order_1/);
  assert.match(clientOrderCompletedText({ ...order, status: 'completed' }), /Ожидает подтверждения клиента/);
  assert.match(clientOrderCompletedText({ ...order, listingType: 'rental', status: 'confirmed' }), /Оцените аренду/);
  assert.match(clientOrderCompletedPhotoCaption({ ...order, status: 'completed' }), /фото после/);
  assert.match(providerOrderConfirmedText({ ...order, status: 'confirmed' }, { name: 'Анна' }), /Клиент подтвердил/);
  assert.match(providerOrderCancelledText({ ...order, status: 'cancelled' }), /отменен клиентом/);
});

test('notifyProviders sends only to providers from the same house', async () => {
  const { bot, calls } = createBotSpy();
  const notified = await notifyProviders(bot, order, { readDb: createDb });

  assert.equal(notified, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'sendMessage');
  assert.equal(calls[0].args[0], '200');
  assert.match(calls[0].args[1], /Квартира: скрыта/);
  assert.equal(calls[0].args[2].reply_markup.inline_keyboard[0][0].text, 'Взять заказ');
});

test('notifyProviders sends photo when order has before photo', async () => {
  const { bot, calls } = createBotSpy();
  const notified = await notifyProviders(bot, { ...order, photoBeforeFileId: 'photo_before' }, { readDb: createDb });

  assert.equal(notified, 1);
  assert.equal(calls[0].method, 'sendPhoto');
  assert.equal(calls[0].args[0], '200');
  assert.equal(calls[0].args[1], 'photo_before');
});

test('notifyClientOrderCompleted sends photo after when present', async () => {
  const { bot, calls } = createBotSpy();
  await notifyClientOrderCompleted(
    bot,
    { ...order, status: 'completed', photoAfterFileId: 'photo_after' },
    { readDb: createDb }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'sendPhoto');
  assert.equal(calls[0].args[0], '100');
  assert.equal(calls[0].args[1], 'photo_after');
  assert.match(calls[0].args[2].caption, /Подтвердите выполнение/);
});

test('notifyClientOrderCompleted asks client to rate returned rental', async () => {
  const { bot, calls } = createBotSpy();
  await notifyClientOrderCompleted(
    bot,
    { ...order, type: 'service', listingType: 'rental', status: 'confirmed' },
    { readDb: createDb }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'sendMessage');
  assert.match(calls[0].args[1], /Владелец подтвердил возврат/);
  assert.equal(calls[0].args[2].reply_markup.inline_keyboard[0][0].callback_data, 'rate_order:order_1:1');
});
