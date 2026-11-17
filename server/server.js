'use strict';
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { createApp, cleanupInactive, INACTIVITY_DAYS } = require('./app');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  // Railway's internal network does not need TLS; public proxy URLs do.
  ssl: /sslmode=require/.test(connectionString) ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

async function main() {
  await pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  const runCleanup = async () => {
    try {
      const n = await cleanupInactive(pool);
      if (n) console.log(`cleanup: deleted ${n} room(s) inactive for ${INACTIVITY_DAYS}+ days`);
    } catch (e) {
      console.error('cleanup failed:', e.message);
    }
  };
  await runCleanup();
  setInterval(runCleanup, 6 * 3600_000).unref();

  const port = process.env.PORT || 3000;
  createApp(pool).listen(port, () => console.log(`Qatta rooms API listening on :${port}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
