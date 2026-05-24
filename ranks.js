// Tabela de cargos por gols acumulados.
// Espelhada em frontend/lib/models/rank.dart — manter sincronizado.

const RANKS = [
  { min: 0,    label: 'Peneira',      color: '#9CA3AF' },
  { min: 6,    label: 'Base',         color: '#84CC16' },
  { min: 21,   label: 'Juvenil',      color: '#22C55E' },
  { min: 51,   label: 'Profissional', color: '#06B6D4' },
  { min: 101,  label: 'Titular',      color: '#3B82F6' },
  { min: 201,  label: 'Convocado',    color: '#8B5CF6' },
  { min: 401,  label: 'Camisa 10',    color: '#F59E0B' },
  { min: 701,  label: 'Craque',       color: '#EF4444' },
  { min: 1001, label: 'Lenda',        color: '#FFD700' },
];

function rankOf(goals) {
  const g = Math.max(0, goals | 0);
  let currentIdx = 0;
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (g >= RANKS[i].min) { currentIdx = i; break; }
  }
  const current = RANKS[currentIdx];
  const next = RANKS[currentIdx + 1] || null;
  const progress = next
    ? Math.min(1, (g - current.min) / (next.min - current.min))
    : 1;
  return {
    label: current.label,
    color: current.color,
    next: next ? { label: next.label, min: next.min } : null,
    progress,
    goals: g,
  };
}

module.exports = { RANKS, rankOf };
