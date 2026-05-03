const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildHouseAddress,
  buildHouseInviteLink,
  buildHouseStartPayload,
  buildHouseTitle,
  buildNormalizedAddress,
  ensureHouseJoinCodes,
  findHouseByJoinCode,
  findHouseByNormalizedAddress,
  normalizeAddressPart,
  normalizeHouseNumber,
  parseHouseStartPayload,
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

test('house invite helpers build and parse Telegram start links', () => {
  const house = { joinCode: 'abc123ef' };

  assert.equal(buildHouseStartPayload(house), 'house_abc123ef');
  assert.equal(buildHouseInviteLink('YouDomHelperBot', house), 'https://t.me/YouDomHelperBot?start=house_abc123ef');
  assert.equal(parseHouseStartPayload('house_abc123ef'), 'abc123ef');
  assert.equal(parseHouseStartPayload('bad_payload'), null);
});

test('ensureHouseJoinCodes fills missing codes without replacing existing ones', () => {
  const db = {
    houses: [
      { id: 'house_1', joinCode: 'abc123ef' },
      { id: 'house_2' },
    ],
  };

  ensureHouseJoinCodes(db);

  assert.equal(db.houses[0].joinCode, 'abc123ef');
  assert.equal(typeof db.houses[1].joinCode, 'string');
  assert.equal(db.houses[1].joinCode.length, 8);
  assert.equal(findHouseByJoinCode(db, db.houses[1].joinCode).id, 'house_2');
});
