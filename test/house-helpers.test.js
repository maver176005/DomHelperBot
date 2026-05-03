const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildHouseAddress,
  buildHouseTitle,
  buildNormalizedAddress,
  findHouseByNormalizedAddress,
  normalizeAddressPart,
  normalizeHouseNumber,
} = require('../src/domain/house-helpers');

test('house helpers normalize common Obninsk address forms', () => {
  assert.equal(normalizeAddressPart('ул. Ленина'), 'ленина');
  assert.equal(normalizeAddressPart('Проспект Маркса'), 'маркса');
  assert.equal(normalizeHouseNumber('10 корпус 1'), '101');
  assert.equal(buildNormalizedAddress('Обнинск', 'ул. Ленина', 'д. 10'), 'обнинск|ленина|10');
});

test('house helpers build display labels', () => {
  assert.equal(buildHouseAddress('Ленина', '10к1'), 'ул. Ленина, 10к1');
  assert.equal(buildHouseTitle('Обнинск', 'Ленина', '10к1'), 'Обнинск, ул. Ленина, 10к1');
});

test('findHouseByNormalizedAddress detects existing houses', () => {
  const db = {
    houses: [
      {
        city: 'Обнинск',
        street: 'Ленина',
        houseNumber: '10',
        normalizedAddress: 'обнинск|ленина|10',
      },
    ],
  };

  assert.equal(Boolean(findHouseByNormalizedAddress(db, 'обнинск|ленина|10')), true);
  assert.equal(findHouseByNormalizedAddress(db, 'обнинск|курчатова|1'), undefined);
});
