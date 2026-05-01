const assert = require('node:assert/strict');
const test = require('node:test');
const { buildOrderFromListing } = require('../src/domain/listing-helpers');

test('buildOrderFromListing creates assigned service order from listing', () => {
  const listing = {
    id: 'listing_1',
    type: 'service',
    houseId: 'house_1',
    ownerUserId: 'provider_1',
    title: 'Соберу шкаф',
    description: 'Помогу собрать шкаф',
    terms: '1000 ₽',
  };
  const client = { id: 'client_1' };

  const order = buildOrderFromListing(listing, client, {
    id: 'order_1',
    now: '2026-05-01T10:00:00.000Z',
  });

  assert.equal(order.id, 'order_1');
  assert.equal(order.type, 'service');
  assert.equal(order.serviceKey, 'listing_service');
  assert.equal(order.status, 'assigned');
  assert.equal(order.houseId, 'house_1');
  assert.equal(order.clientUserId, 'client_1');
  assert.equal(order.providerUserId, 'provider_1');
  assert.equal(order.listingId, 'listing_1');
  assert.equal(order.paymentMethod, '1000 ₽');
  assert.equal(order.assignedAt, '2026-05-01T10:00:00.000Z');
});

test('buildOrderFromListing marks rental requests', () => {
  const order = buildOrderFromListing(
    {
      id: 'listing_1',
      type: 'rental',
      houseId: 'house_1',
      ownerUserId: 'provider_1',
      title: 'Дрель',
      description: 'Дам дрель',
      terms: '',
    },
    { id: 'client_1' },
    { id: 'order_1', now: '2026-05-01T10:00:00.000Z' }
  );

  assert.equal(order.serviceKey, 'rental_request');
  assert.equal(order.listingType, 'rental');
  assert.equal(order.paymentMethod, 'договоримся');
});
