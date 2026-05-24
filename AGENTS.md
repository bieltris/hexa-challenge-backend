# AGENTS.md — instruções para Codex (e outros agentes não-Claude)

Backend do projeto **Cartolina / Hexa Challenge** (Copa do Mundo 2026). Stack: Node.js 18+ / Express / Socket.io / PostgreSQL.

## Antes de começar
1. Ler `PLANO_IMPLEMENTACAO.md` na raiz — 4 planos ativos com schema, endpoints, arquivos.
2. Ler `CLAUDE.md` se quiser entender o protocolo de coordenação completo (este AGENTS.md é o resumo).
3. Branch default: `master`.

## Convenções
- Branch por feature: `feat/plano-1-cargos`, `feat/plano-2-mapa`.
- Conventional Commits em português, sem emoji.
- 1 plano = 1 PR. Migrations em PR separado primeiro.

## Coordenação Discord

Ao **iniciar** plano, posta em `#codex-log` (webhook em env `CODEX_LOG_WEBHOOK`):
```
🟢 INÍCIO — Plano X (Nome)
Arquivos previstos: ...
Estimativa: Xh
Branch: feat/...
```

Ao **terminar**, posta em `#codex-log`:
```
✅ FIM — Plano X
Resultado: ...
Validação: ...
Commit/PR: <link>
```

Ao **passar bola** pra Claude, posta em `#handoff` (env `HANDOFF_WEBHOOK`):
```
👋 @Claude — Plano X mergeado. Pode começar Plano Y.
```

Decisões arquiteturais não-óbvias: posta em `#decisões` (env `DECISIONS_WEBHOOK`) ANTES de implementar.

## Webhooks (env vars)

| Canal | Variável env |
|---|---|
| `#codex-log` | `CODEX_LOG_WEBHOOK` |
| `#claude-log` | `CLAUDE_LOG_WEBHOOK` (só leitura/ref) |
| `#handoff` | `HANDOFF_WEBHOOK` |
| `#decisões` | `DECISIONS_WEBHOOK` |
| `#roadmap` | `ROADMAP_WEBHOOK` |

NUNCA colar URL de webhook em código commitado. Usar env vars sempre. URLs reais no `backend/.env` (gitignored).

Exemplo de POST via curl:
```bash
curl -H "Content-Type: application/json" \
  -d '{"content":"texto da mensagem"}' \
  "$CODEX_LOG_WEBHOOK"
```

## Validações antes de commitar
- `node -e "require('./db'); require('./server')"` para sintaxe
- Migration testada localmente
- Sem secrets em código
- Sem `console.log` de debug

## Áreas sensíveis
- LGPD menor de idade: app escolar, alunos 11-17 anos. UGC exige moderação + consentimento parental.
- Auth: hoje `name+sala` em SharedPreferences. Não inventar auth real sem alinhar em `#decisões` primeiro.
