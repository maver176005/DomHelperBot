const assert = require('node:assert/strict');
const test = require('node:test');
const {
  assignedOrderText,
  buildOrderSummary,
  houseLabel,
  listingCardText,
  listingInterestText,
  listingOrderCreatedText,
  listingOrderNextStepText,
  listingTypeLabel,
  profileText,
  publicOrderText,
  rentalOrderStatusLabel,
  roleLabel,
} = require('../src/presentation/telegram-text');

const house = {
  title: 'ЖК Тест',
  address: 'ул. Проверочная, 1',
};

const client = {
  id: 'client_1',
  name: 'Анна',
  username: 'anna',
  entrance: '2',
  floor: '7',
  apartment: '71',
};

const provider = {
  id: 'provider_1',
  name: 'Петр',
  username: 'petr',
};

const trashOrder = {
  id: 'order_1',
  type: 'trash_removal',
  status: 'created',
  clientUserId: client.id,
  providerUserId: provider.id,
  bagsCount: 2,
  comment: 'у двери',
  urgencyKey: 'today',
  price: '300',
  paymentMethod: '💳 Перевод',
};

test('telegram labels are stable', () => {
  assert.equal(roleLabel('provider'), 'Исполнитель');
  assert.equal(roleLabel('client'), 'Заказчик');
  assert.equal(houseLabel(house), 'ЖК Тест (ул. Проверочная, 1)');
  assert.equal(houseLabel({ title: 'Обнинск, ул. Ленина, 1', address: 'ул. Ленина, 1' }), 'Обнинск, ул. Ленина, 1');
});

test('public order text hides apartment before assignment', () => {
  const text = publicOrderText(trashOrder, client, house);

  assert.match(text, /Квартира: скрыта/);
  assert.doesNotMatch(text, /71/);
});

test('assigned order text shows apartment after assignment', () => {
  const text = assignedOrderText(trashOrder, client, house);

  assert.match(text, /Квартира: 71/);
  assert.match(text, /@anna/);
});

test('build order summary picks user role perspective', () => {
  const db = {
    users: [client, provider],
    orders: [{ ...trashOrder, status: 'confirmed', rating: { score: 5 } }],
  };

  assert.match(buildOrderSummary(trashOrder, db, { role: 'client' }), /Исполнитель: Петр @petr · ⭐ 5.0/);
  assert.match(buildOrderSummary(trashOrder, db, { role: 'provider' }), /Клиент: Анна @anna/);
});

test('rental order summary uses booking language', () => {
  const rentalOrder = {
    id: 'order_2',
    type: 'service',
    listingType: 'rental',
    status: 'assigned',
    title: 'Аппарат для маникюра',
    clientUserId: client.id,
    providerUserId: provider.id,
    comment: 'Сдам аппарат strong 210',
    paymentMethod: 'Сутки / 24 часа - 500 руб',
  };
  const db = {
    users: [client, provider],
    orders: [rentalOrder],
  };
  const text = buildOrderSummary(rentalOrder, db, { role: 'client' });

  assert.match(text, /Статус аренды: Забронирована/);
  assert.match(text, /Владелец: Петр @petr/);
  assert.match(text, /Условия аренды: Сутки/);
  assert.doesNotMatch(text, /Цена: не указана/);
  assert.doesNotMatch(text, /Срочность/);
  assert.doesNotMatch(text, /В работе/);
  assert.equal(rentalOrderStatusLabel('completed'), 'Возврат ожидает подтверждения');
});

test('profile text includes provider availability only for providers', () => {
  const providerProfile = profileText({ ...client, role: 'provider', phone: '+79991112233' }, house);
  const clientProfile = profileText({ ...client, role: 'client', phone: '+79991112233' }, house);

  assert.match(providerProfile, /Доступность/);
  assert.match(providerProfile, /Рейтинг: пока нет оценок/);
  assert.doesNotMatch(clientProfile, /Доступность:/);
});

test('listing text formats service and rental offers', () => {
  const serviceListing = {
    id: 'listing_1',
    type: 'service',
    status: 'active',
    title: 'Соберу шкаф',
    description: 'Помогу собрать шкаф после доставки',
    terms: '1000 ₽',
  };

  assert.equal(listingTypeLabel('rental'), '🧰 Аренда вещи');
  assert.match(listingCardText({ ...serviceListing, status: 'reserved' }, client), /Забронировано/);
  assert.match(listingCardText(serviceListing, client), /Соберу шкаф/);
  assert.match(listingCardText(serviceListing, client), /Контакт/);
  assert.match(listingCardText(serviceListing, client, { ownerRatingStats: { average: 4.7, count: 3 } }), /4.7 из 5/);
  assert.doesNotMatch(listingCardText(serviceListing, client, { showOwner: false }), /Контакт/);
  assert.match(listingInterestText(serviceListing, client), /Сосед откликнулся/);
  assert.match(listingInterestText(serviceListing, client), /Анна @anna/);
  assert.match(
    listingOrderCreatedText(serviceListing, { id: 'order_1', status: 'assigned' }, client),
    /создан запрос #order_1/
  );
  assert.match(
    listingOrderNextStepText({ ...serviceListing, type: 'rental' }, { username: 'petr', phone: '+79991112233' }),
    /забрать вещь[\s\S]*https:\/\/t\.me\/petr[\s\S]*\+79991112233/
  );
});
