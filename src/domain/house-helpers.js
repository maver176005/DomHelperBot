const crypto = require('crypto');

const DEFAULT_PILOT_CITY = 'Обнинск';
const ADD_HOUSE_TEXT = '➕ Моего дома нет';
const CONFIRM_HOUSE_TEXT = '✅ Добавить этот дом';
const CHANGE_HOUSE_TEXT = '🔄 Ввести адрес заново';
const ADDRESS_STOP_WORDS = new Set(['город', 'г', 'улица', 'ул', 'проспект', 'пр', 'переулок', 'пер', 'дом', 'д']);
const HOUSE_NUMBER_STOP_WORDS = new Set(['дом', 'д', 'корпус', 'корп', 'к', 'строение', 'стр']);

function normalizeAddressPart(value) {
  const prepared = String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/пр-кт/g, ' ')
    .replace(/[.,]/g, ' ');

  return prepared
    .split(/\s+/)
    .filter((part) => part && !ADDRESS_STOP_WORDS.has(part))
    .join(' ')
    .trim();
}

function normalizeHouseNumber(value) {
  const prepared = String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.,]/g, ' ');

  return prepared
    .split(/\s+/)
    .filter((part) => part && !HOUSE_NUMBER_STOP_WORDS.has(part))
    .join('')
    .trim();
}

function buildNormalizedAddress(city, street, houseNumber) {
  return [
    normalizeAddressPart(city),
    normalizeAddressPart(street),
    normalizeHouseNumber(houseNumber),
  ].join('|');
}

function buildHouseAddress(street, houseNumber) {
  return `ул. ${String(street).trim()}, ${String(houseNumber).trim()}`;
}

function buildHouseTitle(city, street, houseNumber) {
  return `${city}, ${buildHouseAddress(street, houseNumber)}`;
}

function findHouseByNormalizedAddress(db, normalizedAddress) {
  return db.houses.find((house) => {
    const houseNormalizedAddress = house.normalizedAddress ||
      buildNormalizedAddress(house.city, house.street || house.address, house.houseNumber || '');
    return houseNormalizedAddress === normalizedAddress;
  });
}

function generateJoinCode() {
  return crypto.randomBytes(4).toString('hex');
}

function ensureHouseJoinCodes(db) {
  if (!db || !Array.isArray(db.houses)) {
    return db;
  }

  const usedCodes = new Set(db.houses.map((house) => house.joinCode).filter(Boolean));

  for (const house of db.houses) {
    if (house.joinCode) {
      continue;
    }

    let joinCode = generateJoinCode();
    while (usedCodes.has(joinCode)) {
      joinCode = generateJoinCode();
    }

    house.joinCode = joinCode;
    usedCodes.add(joinCode);
  }

  return db;
}

function findHouseByJoinCode(db, joinCode) {
  if (!joinCode || !db || !Array.isArray(db.houses)) {
    return undefined;
  }

  return db.houses.find((house) => house.joinCode === joinCode);
}

function parseHouseStartPayload(payload) {
  const match = String(payload || '').match(/^house_([a-f0-9]{8})$/i);
  return match ? match[1].toLowerCase() : null;
}

function buildHouseStartPayload(house) {
  return house && house.joinCode ? `house_${house.joinCode}` : null;
}

function buildHouseInviteLink(botUsername, house) {
  const payload = buildHouseStartPayload(house);
  if (!payload) {
    return null;
  }

  return `https://t.me/${botUsername}?start=${payload}`;
}

module.exports = {
  ADD_HOUSE_TEXT,
  CHANGE_HOUSE_TEXT,
  CONFIRM_HOUSE_TEXT,
  DEFAULT_PILOT_CITY,
  buildHouseAddress,
  buildHouseInviteLink,
  buildHouseStartPayload,
  buildHouseTitle,
  buildNormalizedAddress,
  ensureHouseJoinCodes,
  findHouseByJoinCode,
  findHouseByNormalizedAddress,
  generateJoinCode,
  normalizeAddressPart,
  normalizeHouseNumber,
  parseHouseStartPayload,
};
