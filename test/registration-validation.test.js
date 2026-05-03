const assert = require('node:assert/strict');
const test = require('node:test');
const {
  isValidFloor,
  isValidName,
  isValidPhone,
  isValidShortAddressPart,
  normalizePhone,
} = require('../src/domain/registration-validation');

test('registration validation accepts normal profile values', () => {
  assert.equal(isValidName('Иван Петров'), true);
  assert.equal(normalizePhone('+7 (999) 111-22-33'), '+79991112233');
  assert.equal(normalizePhone('8 (999) 111-22-33'), '+79991112233');
  assert.equal(normalizePhone('9991112233'), '+79991112233');
  assert.equal(isValidPhone('+79991112233'), true);
  assert.equal(isValidShortAddressPart('12А'), true);
  assert.equal(isValidFloor('9'), true);
});

test('registration validation rejects obviously invalid values', () => {
  assert.equal(isValidName(''), false);
  assert.equal(isValidName('12'), false);
  assert.equal(normalizePhone('12'), '');
  assert.equal(normalizePhone('абвгд'), '');
  assert.equal(normalizePhone('phone +7 999 111 22 33'), '');
  assert.equal(isValidPhone(normalizePhone('12')), false);
  assert.equal(isValidPhone('12345'), false);
  assert.equal(isValidShortAddressPart(''), false);
  assert.equal(isValidFloor('101'), false);
  assert.equal(isValidFloor('2.5'), false);
});
