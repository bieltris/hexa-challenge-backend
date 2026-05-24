# CLAUDE.md — instruções para Claude neste repo

Backend do projeto **Cartolina / Hexa Challenge** (Copa do Mundo 2026). Stack: Node.js 18+ / Express / Socket.io / PostgreSQL.

## Antes de começar
1. Ler `PLANO_IMPLEMENTACAO.md` na raiz — contém os 4 planos ativos.
2. Verificar branch atual: `git status` e `git branch --show-current` (default: `master`).
3. Conferir migrations já aplicadas no Render antes de assumir schema.

## Convenções
- Branch por feature: `feat/plano-1-cargos`, `feat/plano-2-mapa`, etc.
- Commits em Conventional Commits, português, sem emoji.
- 1 plano = 1 PR. Migrations em PR separado, mergeado primeiro.

## Coordenação via Discord (OBRIGATÓRIO)

Ao **iniciar** trabalho num plano, posta em `#claude-log`:
```powershell
$body = @{
  embeds = @(@{
    title = "🟢 INÍCIO — Plano X (Nome)"
    color = 5763719
    fields = @(
      @{ name = "Arquivos previstos"; value = "lista"; inline = $false }
      @{ name = "Estimativa"; value = "Xh"; inline = $true }
      @{ name = "Branch"; value = "feat/..."; inline = $true }
    )
    footer = @{ text = "Claude" }
  })
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri $env:CLAUDE_LOG_WEBHOOK -Method Post -ContentType 'application/json' -Body $body
```

Ao **terminar** (PR aberto ou pushed), posta em `#claude-log`:
```
✅ FIM — Plano X
Resultado: N arquivos modificados, migration aplicada
Validação: build local OK, testes manuais executados
Commit/PR: <link>
```

Ao **passar bola** pra outra IA (ex: Plano 1 mergeado, libera Plano 4), posta em `#handoff`:
```
👋 @Codex — Plano X mergeado. Pode começar Plano Y.
Pré-req: nenhum. Branch base: master.
```

Quando houver **decisão arquitetural não-óbvia** (escolha de lib, mudança de schema fora do plano, etc.), posta em `#decisões` ANTES de implementar:
```
🤔 Decisão: usar lib X ao invés de Y
Motivo: ...
Alternativas consideradas: ...
Impacto: ...
```

Se o usuário deixar **comando** em `#comandos`, ele lerá manualmente ou via MCP. Não tentar fazer polling automático sem MCP configurado.

## Webhooks (use as variáveis de ambiente, NUNCA cole URL no código)

| Canal | Variável env | Quando usar |
|---|---|---|
| `#claude-log` | `CLAUDE_LOG_WEBHOOK` | Início/fim de cada plano |
| `#codex-log` | `CODEX_LOG_WEBHOOK` | (Codex usa, não Claude) |
| `#handoff` | `HANDOFF_WEBHOOK` | Passar bola entre IAs |
| `#decisões` | `DECISIONS_WEBHOOK` | Decisões arquiteturais |
| `#roadmap` | `ROADMAP_WEBHOOK` | Mudanças no plano mestre |
| `#mission-completa` | `WEBHOOK_URL` | Backend usa, Plano 4 |
| `#admin-alerts` | `ADMIN_WEBHOOK` | Backend usa, erros prod |

URLs reais ficam no `backend/.env` (gitignored). Quando trabalhando local, exporta:
```powershell
$env:CLAUDE_LOG_WEBHOOK = "..."
$env:HANDOFF_WEBHOOK = "..."
```

## Validações antes de commitar
- `node -e "require('./db'); require('./server')"` para sintaxe
- Migration aplicada localmente em DB de teste antes de subir
- Sem `console.log` de debug
- Sem secrets em código

## Áreas sensíveis
- **LGPD menor de idade**: app é escolar, alunos 11-17 anos. Qualquer feature UGC (áudio Plano 3) exige moderação + termo de consentimento parental.
- **Auth**: hoje é só `name+sala` em SharedPreferences. Não inventar auth real sem alinhamento prévio em `#decisões`.
