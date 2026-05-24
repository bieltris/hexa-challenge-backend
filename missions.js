const pool = require('./db');

const SALAS = ['6ano', '7ano', '8ano', '9ano', '1medio', '2medio', '3medio'];
const TARGETS = {
  '6ano': 150,
  '7ano': 150,
  '8ano': 180,
  '9ano': 200,
  '1medio': 200,
  '2medio': 220,
  '3medio': 220,
};
const REWARD = 'Caixa de Bis';

let scheduler = null;

async function ensureTodayMissions() {
  for (const sala of SALAS) {
    await ensureTodayMissionForSala(sala);
  }
}

async function ensureTodayMissionForSala(sala) {
  if (!SALAS.includes(sala)) return;
  await pool.query(
    `INSERT INTO missions(date, sala, goal_type, target, reward)
     VALUES(CURRENT_DATE, $1, 'goals_count', $2, $3)
     ON CONFLICT(date, sala) DO NOTHING`,
    [sala, TARGETS[sala], REWARD]
  );
}

async function updateMissionProgress(sala, amount = 1) {
  if (!SALAS.includes(sala) || amount <= 0) return null;
  await ensureTodayMissionForSala(sala);

  const result = await pool.query(
    `WITH current AS (
       SELECT id, completed
         FROM missions
        WHERE date = CURRENT_DATE AND sala = $1
        FOR UPDATE
     ),
     updated AS (
       UPDATE missions m
          SET progress = progress + $2,
              completed = (progress + $2 >= target),
              completed_at = CASE
                WHEN progress + $2 >= target AND NOT completed THEN NOW()
                ELSE completed_at
              END
         FROM current c
        WHERE m.id = c.id
        RETURNING m.*, c.completed AS was_completed
     )
     SELECT *,
            (completed = true AND was_completed = false) AS just_completed
       FROM updated`,
    [sala, amount]
  );

  return result.rows[0] || null;
}

async function notifyCompletion(sala) {
  if (!process.env.WEBHOOK_URL) return;
  await fetch(process.env.WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `🍫 Sala **${sala}** bateu missão de hoje! Entregar Caixa de Bis.`,
    }),
  });
}

function startMissionScheduler() {
  if (scheduler) return;
  scheduler = setInterval(() => {
    ensureTodayMissions().catch((err) => {
      console.error('[missions scheduler]', err.message);
    });
  }, 60 * 60 * 1000);
}

module.exports = {
  SALAS,
  TARGETS,
  ensureTodayMissions,
  startMissionScheduler,
  updateMissionProgress,
  notifyCompletion,
};
