-- Migration 002 — Áudio nos comentários (Plano 3)
-- Aplicar manualmente no Postgres do Render

ALTER TABLE comments ADD COLUMN IF NOT EXISTS audio_url    TEXT;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS audio_dur_ms INTEGER;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS moderation   VARCHAR(16) NOT NULL DEFAULT 'approved';
-- valores: pending | approved | rejected
ALTER TABLE comments ADD COLUMN IF NOT EXISTS report_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_comments_moderation ON comments(moderation, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id          SERIAL PRIMARY KEY,
  comment_id  INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  action      VARCHAR(32) NOT NULL,
  actor       VARCHAR(80),
  at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_comment ON audit_log(comment_id);
