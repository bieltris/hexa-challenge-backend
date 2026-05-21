-- Rodar este script no PostgreSQL do Render para inicializar o banco

CREATE TABLE IF NOT EXISTS scores (
  id         SERIAL PRIMARY KEY,
  sala       VARCHAR(20) NOT NULL UNIQUE,
  goals      INTEGER     NOT NULL DEFAULT 0,
  attempts   INTEGER     NOT NULL DEFAULT 0,
  updated_at TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- Inserir todas as salas com 0 pontos
INSERT INTO scores (sala, goals, attempts)
VALUES
  ('6ano',   0, 0),
  ('7ano',   0, 0),
  ('8ano',   0, 0),
  ('9ano',   0, 0),
  ('1medio', 0, 0),
  ('2medio', 0, 0),
  ('3medio', 0, 0)
ON CONFLICT (sala) DO NOTHING;
