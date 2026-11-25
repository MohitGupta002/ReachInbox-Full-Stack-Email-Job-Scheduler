const { Sequelize } = require('sequelize');
const { execFileSync } = require('child_process');
const path = require('path');
require('dotenv').config();

/**
 * Probes whether a TCP host:port (such as PostgreSQL) is reachable within timeoutMs.
 * Uses a fast isolated Node child check so Sequelize receives the final dialect synchronously.
 */
function isTcpPortReachableSync(host, port, timeoutMs = 600) {
  const probeScript = `
    const net = require('net');
    const socket = net.createConnection({
      host: process.env.PROBE_HOST,
      port: Number(process.env.PROBE_PORT),
    });
    const timer = setTimeout(() => { socket.destroy(); process.exit(1); }, ${Number(timeoutMs)});
    socket.on('connect', () => { clearTimeout(timer); socket.end(); process.exit(0); });
    socket.on('error', () => { clearTimeout(timer); process.exit(1); });
  `;

  try {
    execFileSync(process.execPath, ['-e', probeScript], {
      env: {
        ...process.env,
        PROBE_HOST: host,
        PROBE_PORT: String(port),
      },
      stdio: 'ignore',
      timeout: timeoutMs + 500,
    });
    return true;
  } catch (err) {
    return false;
  }
}

function createSequelizeInstance() {
  const dbUrl = process.env.DATABASE_URL;
  const forcePostgres = process.env.DB_FORCE_POSTGRES === 'true';
  const explicitSqlite =
    process.env.DB_DIALECT === 'sqlite' ||
    process.env.USE_SQLITE === 'true' ||
    (dbUrl && dbUrl.startsWith('sqlite')) ||
    !dbUrl;

  const isPostgresUrl = dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'));

  if (!explicitSqlite && isPostgresUrl) {
    let host = '127.0.0.1';
    let port = 5432;
    try {
      const parsed = new URL(dbUrl);
      host = parsed.hostname || host;
      port = Number(parsed.port) || 5432;
    } catch (e) {
      // Fallback to defaults if URL parsing fails
    }

    if (forcePostgres || process.env.NODE_ENV === 'production' || isTcpPortReachableSync(host, port)) {
      console.log(`[DB] Using PostgreSQL dialect (${host}:${port}).`);
      const useSsl = process.env.DB_SSL === 'true';
      return new Sequelize(dbUrl, {
        dialect: 'postgres',
        logging: false,
        ...(useSsl
          ? {
              dialectOptions: {
                ssl: { require: true, rejectUnauthorized: false },
              },
            }
          : {}),
        pool: {
          max: 10,
          min: 0,
          acquire: 5000,
          idle: 10000,
        },
      });
    }

    console.warn(`[DB] PostgreSQL unreachable at ${host}:${port} — falling back cleanly to SQLite.`);
  }

  const storagePath = process.env.SQLITE_PATH
    ? path.resolve(process.env.SQLITE_PATH)
    : path.resolve(__dirname, '../../email_scheduler.sqlite');

  return new Sequelize({
    dialect: 'sqlite',
    storage: storagePath,
    logging: false,
    retry: {
      max: 5,
    },
  });
}

const sequelize = createSequelizeInstance();

async function testAndInitDb() {
  await sequelize.authenticate();
  const dialect = sequelize.getDialect();

  if (dialect === 'sqlite') {
    // Enable WAL mode and busy timeout so API + Worker processes safely share SQLite
    await sequelize.query('PRAGMA journal_mode = WAL;');
    await sequelize.query('PRAGMA busy_timeout = 5000;');
  }

  console.log(`[DB] Database connection active using dialect '${dialect}'.`);
}

// Serializes SQLite write transactions within a Node process to prevent SQLITE_BUSY / nested transactions
let sqliteWriteChain = Promise.resolve();
function withSqliteWriteLock(fn) {
  if (sequelize.getDialect() !== 'sqlite') {
    return fn();
  }
  const next = sqliteWriteChain.then(fn, fn);
  sqliteWriteChain = next.catch(() => {});
  return next;
}

module.exports = {
  sequelize,
  testAndInitDb,
  isTcpPortReachableSync,
  withSqliteWriteLock,
};
