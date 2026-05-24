-- Migration 001 — Sistema de cargos por jogador
-- Aplicar manualmente no Postgres do Render.
-- Reusa tabela player_scores existente (criada em initDatabase do server.js).

-- Adiciona contador de tentativas (já tinha goals)
ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_player_scores_sala_goals ON player_scores(sala, goals DESC);

-- Identidade real do autor do comentário (separado do player fictício do card)
ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_name VARCHAR(100);
ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_sala VARCHAR(20);

-- Backfill: sala do autor é a mesma do comentário antigo
UPDATE comments SET author_sala = sala WHERE author_sala IS NULL;
