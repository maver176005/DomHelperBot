const assert = require('node:assert/strict');
const test = require('node:test');
const { DEFAULT_DB, DEFAULT_HOUSES } = require('../src/config/seed-data');
const { DB_PATH, readDb } = require('../src/storage/json-store');

test('default db shape contains required collections', () => {
  assert.equal(DEFAULT_HOUSES.length >= 1, true);
  assert.equal(Array.isArray(DEFAULT_DB.houses), true);
  assert.equal(Array.isArray(DEFAULT_DB.users), true);
  assert.equal(Array.isArray(DEFAULT_DB.orders), true);
  assert.equal(Array.isArray(DEFAULT_DB.listings), true);
});

test('json store reads current local db', () => {
  const db = readDb();

  assert.equal(DB_PATH.endsWith('data/db.json'), true);
  assert.equal(Array.isArray(db.houses), true);
  assert.equal(Array.isArray(db.users), true);
  assert.equal(Array.isArray(db.orders), true);
  assert.equal(Array.isArray(db.listings), true);
});
