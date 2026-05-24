CREATE TABLE IF NOT EXISTS missions (
  id           SERIAL PRIMARY KEY,
  date         DATE NOT NULL,
  sala         VARCHAR(20) NOT NULL,
  goal_type    VARCHAR(32) NOT NULL,
  target       INTEGER NOT NULL,
  reward       VARCHAR(120) NOT NULL,
  progress     INTEGER NOT NULL DEFAULT 0,
  completed    BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMP,
  delivered    BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(date, sala)
);

CREATE INDEX IF NOT EXISTS idx_missions_date ON missions(date);
