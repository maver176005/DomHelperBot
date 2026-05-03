const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { DEFAULT_DB } = require('../config/seed-data');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const APP_STATE_ID = 'default';
const POSTGRES_CONNECT_RETRY_DELAYS_MS = [500, 1500, 3000];
const TRANSIENT_POSTGRES_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETUNREACH',
  'ETIMEDOUT',
  'EAI_AGAIN',
]);

let pool;

function cloneDb(db) {
  return JSON.parse(JSON.stringify(db));
}

function getDatabaseUrl() {
  return process.env.DATABASE_URL;
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      connectionTimeoutMillis: 5000,
      ssl: getDatabaseUrl().includes('sslmode=disable') ? false : { rejectUnauthorized: false },
    });
  }

  return pool;
}

function usesPostgres() {
  return Boolean(getDatabaseUrl());
}

function isTransientPostgresError(error) {
  if (!error) {
    return false;
  }

  if (TRANSIENT_POSTGRES_ERROR_CODES.has(error.code)) {
    return true;
  }

  if (Array.isArray(error.errors)) {
    return error.errors.some(isTransientPostgresError);
  }

  return false;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function resetPool() {
  if (!pool) {
    return;
  }

  const currentPool = pool;
  pool = null;
  await currentPool.end().catch(() => {});
}

async function connectPostgresClient() {
  let lastError;

  for (let attempt = 0; attempt <= POSTGRES_CONNECT_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await getPool().connect();
    } catch (error) {
      lastError = error;

      if (!isTransientPostgresError(error) || attempt === POSTGRES_CONNECT_RETRY_DELAYS_MS.length) {
        throw error;
      }

      await resetPool();
      await sleep(POSTGRES_CONNECT_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError;
}

function ensureJsonDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2));
  }
}

function readJsonDb() {
  ensureJsonDb();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeJsonDb(db) {
  ensureJsonDb();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

async function ensurePostgresDb() {
  const client = await connectPostgresClient();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_state (
        id text PRIMARY KEY,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await client.query(
      `
        INSERT INTO app_state (id, data)
        VALUES ($1, $2::jsonb)
        ON CONFLICT (id) DO NOTHING
      `,
      [APP_STATE_ID, JSON.stringify(DEFAULT_DB)]
    );
  } finally {
    client.release();
  }
}

async function readPostgresDb(client) {
  const result = await client.query('SELECT data FROM app_state WHERE id = $1', [APP_STATE_ID]);
  if (!result.rows.length) {
    return cloneDb(DEFAULT_DB);
  }

  return result.rows[0].data;
}

async function ensureDb() {
  if (!usesPostgres()) {
    ensureJsonDb();
    return;
  }

  await ensurePostgresDb();
}

async function readDb() {
  if (!usesPostgres()) {
    return readJsonDb();
  }

  await ensurePostgresDb();
  const client = await connectPostgresClient();
  try {
    return await readPostgresDb(client);
  } finally {
    client.release();
  }
}

async function writeDb(db) {
  if (!usesPostgres()) {
    writeJsonDb(db);
    return;
  }

  await ensurePostgresDb();
  await getPool().query(
    `
      UPDATE app_state
      SET data = $2::jsonb,
          updated_at = now()
      WHERE id = $1
    `,
    [APP_STATE_ID, JSON.stringify(db)]
  );
}

async function withDb(mutator) {
  if (!usesPostgres()) {
    const db = readJsonDb();
    const result = await mutator(db);
    writeJsonDb(db);
    return result;
  }

  await ensurePostgresDb();
  const client = await connectPostgresClient();

  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT data FROM app_state WHERE id = $1 FOR UPDATE', [APP_STATE_ID]);
    const db = result.rows.length ? result.rows[0].data : cloneDb(DEFAULT_DB);
    const mutatorResult = await mutator(db);

    await client.query(
      `
        INSERT INTO app_state (id, data, updated_at)
        VALUES ($1, $2::jsonb, now())
        ON CONFLICT (id)
        DO UPDATE SET data = EXCLUDED.data,
                      updated_at = now()
      `,
      [APP_STATE_ID, JSON.stringify(db)]
    );

    await client.query('COMMIT');
    return mutatorResult;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

function readDbSyncForTests() {
  return readJsonDb();
}

function writeDbSyncForTests(db) {
  writeJsonDb(db);
}

function withJsonDbForTests(mutator) {
  const db = readJsonDb();
  const result = mutator(db);
  writeJsonDb(db);
  return result;
}

module.exports = {
  DEFAULT_DB,
  DB_PATH,
  closeDb,
  ensureDb,
  isTransientPostgresError,
  readDb,
  readDbSyncForTests,
  withDb,
  withJsonDbForTests,
  writeDb,
  writeDbSyncForTests,
};
