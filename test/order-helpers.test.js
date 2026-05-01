const assert = require('node:assert/strict');
const test = require('node:test');
const {
  getPopularServices,
  getProviderAvailabilityStats,
  priceLabel,
  statusLabel,
  urgencyPriority,
} = require('../src/domain/order-helpers');
const { PROVIDER_AVAILABILITY } = require('../src/config/app-data');

test('order helpers format known values', () => {
  assert.equal(statusLabel('created'), 'Создан');
  assert.equal(statusLabel('custom'), 'custom');
  assert.equal(priceLabel('300'), '300 ₽');
  assert.equal(priceLabel(''), 'не указана');
  assert.equal(urgencyPriority('within_hour') > urgencyPriority('flexible'), true);
});

test('provider availability stats are scoped by house', () => {
  const db = {
    users: [
      { houseId: 'house_1', role: 'provider', availabilityStatus: PROVIDER_AVAILABILITY.READY_NOW },
      { houseId: 'house_1', role: 'provider', availabilityStatus: PROVIDER_AVAILABILITY.LATER },
      { houseId: 'house_1', role: 'client', availabilityStatus: PROVIDER_AVAILABILITY.READY_NOW },
      { houseId: 'house_2', role: 'provider', availabilityStatus: PROVIDER_AVAILABILITY.READY_NOW },
      { houseId: 'house_1', role: 'provider' },
    ],
  };

  assert.deepEqual(getProviderAvailabilityStats(db, 'house_1'), {
    total: 3,
    readyNow: 1,
    later: 1,
    offline: 1,
  });
});

test('popular services are scoped by house', () => {
  const db = {
    orders: [
      { houseId: 'house_1', serviceKey: 'groceries' },
      { houseId: 'house_1', serviceKey: 'groceries' },
      { houseId: 'house_2', serviceKey: 'pharmacy_run' },
    ],
  };

  const services = getPopularServices(db, 'house_1');
  const groceries = services.find((service) => service.key === 'groceries');
  const pharmacy = services.find((service) => service.key === 'pharmacy_run');

  assert.equal(groceries.totalCount, 2);
  assert.equal(pharmacy.totalCount, 0);
});
