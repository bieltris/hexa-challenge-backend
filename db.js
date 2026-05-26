const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  max: 20,                       // sobe de 10 (default) para 20
  idleTimeoutMillis: 30_000,     // libera conexão ociosa após 30s
  connectionTimeoutMillis: 5_000 // erro rápido se DB tá fora
});

module.exports = pool;
