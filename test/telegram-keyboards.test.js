const assert = require('node:assert/strict');
const test = require('node:test');
const { MENU } = require('../src/config/ui-copy');
const {
  CANCEL_TEXT,
  CHANGE_URGENCY_TEXT,
  FORCE_CREATE_TEXT,
  getAvailabilityWarningKeyboard,
  getListingInlineKeyboard,
  getListingsInlineKeyboard,
  getMainKeyboard,
  getOrderInlineKeyboard,
  getPaymentKeyboard,
  getProfileInlineKeyboard,
  getRequestTypeInlineKeyboard,
} = require('../src/presentation/telegram-keyboards');

function keyboardRows(markup) {
  return markup.reply_markup.keyboard;
}

function inlineRows(markup) {
  return markup.reply_markup.inline_keyboard;
}

test('main keyboard shows registration for anonymous users', () => {
  const rows = keyboardRows(getMainKeyboard(null));

  assert.deepEqual(rows, [[MENU.START_REGISTRATION]]);
});

test('main keyboard includes provider-only actions for providers', () => {
  const rows = keyboardRows(getMainKeyboard({ role: 'provider' }));
  const flat = rows.flat();

  assert.equal(flat.includes(MENU.HOUSE_REQUESTS), true);
  assert.equal(flat.includes(MENU.AVAILABILITY), true);
});

test('payment keyboard includes cancel action', () => {
  const rows = keyboardRows(getPaymentKeyboard());

  assert.equal(rows.flat().includes(CANCEL_TEXT), true);
});

test('availability warning keyboard exposes all warning actions', () => {
  const rows = keyboardRows(getAvailabilityWarningKeyboard());
  const flat = rows.flat();

  assert.equal(flat.includes(FORCE_CREATE_TEXT), true);
  assert.equal(flat.includes(CHANGE_URGENCY_TEXT), true);
  assert.equal(flat.includes(CANCEL_TEXT), true);
});

test('request type inline keyboard maps services to callback data', () => {
  const rows = inlineRows(getRequestTypeInlineKeyboard());

  assert.equal(rows[0][0].callback_data, 'request_type:trash_removal');
});

test('profile inline keyboard switches to the opposite role', () => {
  const rows = inlineRows(getProfileInlineKeyboard({ role: 'client' }));

  assert.equal(rows[0][0].callback_data, 'switch_role:provider');
  assert.match(rows[0][0].text, /исполнитель/);
});

test('order inline keyboard reflects order actions for client', () => {
  const order = {
    id: 'order_1',
    type: 'trash_removal',
    status: 'created',
    clientUserId: 'user_1',
  };

  const rows = inlineRows(getOrderInlineKeyboard(order, { id: 'user_1' }));
  const callbacks = rows.flat().map((button) => button.callback_data);

  assert.deepEqual(callbacks, ['view_order:order_1', 'cancel_order:order_1']);
});

test('order inline keyboard adds repeat for finished client orders', () => {
  const order = {
    id: 'order_1',
    type: 'service',
    status: 'confirmed',
    clientUserId: 'user_1',
  };

  const rows = inlineRows(getOrderInlineKeyboard(order, { id: 'user_1' }));
  const callbacks = rows.flat().map((button) => button.callback_data);

  assert.equal(callbacks.includes('repeat_order:order_1'), true);
});

test('listings hub exposes browse, create and my actions', () => {
  const callbacks = inlineRows(getListingsInlineKeyboard()).flat().map((button) => button.callback_data);

  assert.deepEqual(callbacks, [
    'listings:browse',
    'listings:create_service',
    'listings:create_rental',
    'listings:my',
  ]);
});

test('listing inline keyboard allows owner to close active listing', () => {
  const listing = {
    id: 'listing_1',
    ownerUserId: 'user_1',
    houseId: 'house_1',
    status: 'active',
  };

  const ownerRows = inlineRows(getListingInlineKeyboard(listing, { id: 'user_1' }));
  assert.equal(ownerRows[0][0].callback_data, 'listing_close:listing_1');

  const neighborRows = inlineRows(getListingInlineKeyboard(listing, { id: 'user_2', houseId: 'house_1' }));
  const neighborCallbacks = neighborRows.flat().map((button) => button.callback_data);
  assert.deepEqual(neighborCallbacks, ['listing_interest:listing_1', 'listing_create_order:listing_1']);

  assert.equal(getListingInlineKeyboard(listing, { id: 'user_2', houseId: 'house_2' }), undefined);
  assert.equal(getListingInlineKeyboard({ ...listing, status: 'closed' }, { id: 'user_1' }), undefined);
});
