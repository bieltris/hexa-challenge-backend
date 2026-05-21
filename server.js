require('dotenv').config();

const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── GET /api/scores ───────────────────────────────────────────────────────────
// Returns all rooms ranked by goals desc, then attempts asc (fewer = better)
app.get('/api/scores', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sala, goals, attempts, updated_at
         FROM scores
        ORDER BY goals DESC, attempts ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[GET /api/scores]', err.message);
    res.status(500).json({ error: 'Erro no banco de dados' });
  }
});

// ── POST /api/shoot ───────────────────────────────────────────────────────────
// Body: { sala: "6ano", scored: true|false }
app.post('/api/shoot', async (req, res) => {
  const { sala, scored } = req.body;

  if (!sala || typeof scored !== 'boolean') {
    return res.status(400).json({ error: 'Campos obrigatórios: sala (string), scored (boolean)' });
  }

  const VALID_SALAS = ['6ano', '7ano', '8ano', '9ano', '1medio', '2medio', '3medio'];
  if (!VALID_SALAS.includes(sala)) {
    return res.status(400).json({ error: 'Sala inválida' });
  }

  try {
    const result = await pool.query(
      `UPDATE scores
          SET goals      = goals + $1,
              attempts   = attempts + 1,
              updated_at = NOW()
        WHERE sala = $2
        RETURNING sala, goals, attempts`,
      [scored ? 1 : 0, sala]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sala não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[POST /api/shoot]', err.message);
    res.status(500).json({ error: 'Erro no banco de dados' });
  }
});

// ── DB Init ───────────────────────────────────────────────────────────────────
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scores (
      id         SERIAL PRIMARY KEY,
      sala       VARCHAR(20) NOT NULL UNIQUE,
      goals      INTEGER     NOT NULL DEFAULT 0,
      attempts   INTEGER     NOT NULL DEFAULT 0,
      updated_at TIMESTAMP   NOT NULL DEFAULT NOW()
    );
    INSERT INTO scores (sala, goals, attempts) VALUES
      ('6ano',   0, 0), ('7ano',  0, 0), ('8ano',  0, 0),
      ('9ano',   0, 0), ('1medio',0, 0), ('2medio',0, 0), ('3medio',0, 0)
    ON CONFLICT (sala) DO NOTHING;
  `);
  console.log('✅ Banco inicializado');
}

// ── Start ─────────────────────────────────────────────────────────────────────
initDb()
  .then(() => app.listen(PORT, () => console.log(`⚽ Hexa Challenge API rodando na porta ${PORT}`)))
  .catch(err => { console.error('Falha ao iniciar:', err); process.exit(1); });
