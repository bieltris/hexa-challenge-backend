# Plano de Implementação — Cartolina / Hexa Challenge

Documento técnico para IAs implementadoras (Claude, Codex, outras). Cada plano é autocontido: schema, endpoints, arquivos, deps, critério de done.

**Stack atual confirmado:**
- Backend: Node.js 18+ / Express / Socket.io / PostgreSQL (Render)
- Frontend: Flutter 3.3+ (Material)
- Identidade: SharedPreferences (`hexa_name`, `hexa_sala`) — sem auth real
- Salas fixas: `6ano, 7ano, 8ano, 9ano, 1medio, 2medio, 3medio`
- Backend entry: `backend/server.js`
- Frontend entry: `frontend/lib/main.dart`

**Ordem de execução recomendada:**
1. Rodar todas migrations juntas (001, 002, 003)
2. Plano 1 (Hierarquia) — desbloqueia 3 e 4
3. Plano 2 (Mapa) — paralelo
4. Plano 4 (Missão) — depende plano 1
5. Plano 3 (Áudio) — exige R2 provisionado antes

---

## PLANO 1 — Hierarquia / Cargos por gols

**Estimativa:** 4h
**Bloqueia:** Planos 3 e 4

### Objetivo
Cada usuário tem cargo derivado do total acumulado de gols. Badge no avatar do feed + no duelo + na home.

### Schema novo
```sql
-- backend/migrations/001_players.sql
CREATE TABLE IF NOT EXISTS players (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(40) NOT NULL,
  sala        VARCHAR(20) NOT NULL,
  goals       INTEGER NOT NULL DEFAULT 0,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(name, sala)
);
CREATE INDEX idx_players_sala_goals ON players(sala, goals DESC);

ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_name VARCHAR(40);
ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_sala VARCHAR(20);
UPDATE comments SET author_sala = sala WHERE author_sala IS NULL;
```

### Tabela de cargos (constante compartilhada)
Criar `backend/ranks.js` e `frontend/lib/models/rank.dart` com mesma tabela:

| Min gols | Cargo         | Cor hex   |
|----------|---------------|-----------|
| 0        | Peneira       | `#9CA3AF` |
| 6        | Base          | `#84CC16` |
| 21       | Juvenil       | `#22C55E` |
| 51       | Profissional  | `#06B6D4` |
| 101      | Titular       | `#3B82F6` |
| 201      | Convocado     | `#8B5CF6` |
| 401      | Camisa 10     | `#F59E0B` |
| 701      | Craque        | `#EF4444` |
| 1001     | Lenda         | `#FFD700` |

Função `rankOf(goals): {label, color, next, progress}` espelhada em JS e Dart.

### Backend
1. **Editar** `backend/server.js` POST `/api/shoot` (linha 174):
   - Aceitar `name` no body.
   - `INSERT INTO players(name,sala,goals,attempts) VALUES (...) ON CONFLICT (name,sala) DO UPDATE SET goals = players.goals + EXCLUDED.goals, attempts = players.attempts + 1, updated_at = NOW()`
   - Mesmo update em `/api/award` e `/api/penalty`.
2. **Novo** `GET /api/players/me?name=X&sala=Y` → `{ goals, attempts, rank: {label, color, progress, next} }`
3. **Editar** `GET /api/comments`: JOIN com `players` por `(author_name, author_sala)`, retornar `author_goals` e `author_rank_label`.
4. **Editar** `POST /api/comments` (linha 241): receber `name` do body, gravar em `author_name`/`author_sala`.

### Frontend
1. **Novo** `frontend/lib/models/rank.dart` — `Rank.of(int goals)` com mesma tabela.
2. **Editar** `frontend/lib/models/comment_model.dart`: adicionar `authorName`, `authorSala`, `authorGoals`, computed `rank`.
3. **Novo** `frontend/lib/widgets/rank_badge.dart`: chip arredondado, ícone bola, label, progress bar fina até próximo cargo.
4. **Editar** `frontend/lib/widgets/comment_card.dart`: badge ao lado do nome + tooltip `Cargo · X gols`.
5. **Editar** `frontend/lib/services/api_service.dart`: passar `name` no `postComment`; criar `getMe(name, sala)`.
6. **Editar** `frontend/lib/screens/home_screen.dart`: cargo do user no topo (perto de chutes restantes).
7. **Editar** `frontend/lib/screens/duel_game_screen.dart`: cargo ao lado do nome do oponente.

### Critério done
- User com 0 gols vê "Peneira"; marca 6 → vira "Base" no refresh.
- Badge aparece no feed e no duelo.
- Cargo persiste cross-device (server-side).

---

## PLANO 2 — Mapa-múndi territorial

**Estimativa:** 1-2 dias
**Bloqueia:** nada

### Objetivo
Home mostra mapa-múndi SVG. Cada região colorida pela sala que detém maior % de gols globais. Tap região → BottomSheet com sala dominante + ranking.

### Decisão técnica
SVG com paths por **continente** (não país-a-país, vira ilegível em mobile). 6 regiões grandes: `south_america, north_america, europe, africa, asia, oceania`.

Pacotes Flutter:
```yaml
flutter_svg: ^2.0.10
xml: ^6.5.0
```

### Source do SVG
Baixar `world-continents.svg` de Wikimedia Commons (CC-BY). Salvar em `frontend/assets/maps/continents.svg`. Cada `<path id="south_america" ... />`.

### Backend
1. **Novo** `GET /api/map/regions`:
   ```js
   // Distribuição via largest-remainder method
   const regions = ['south_america','north_america','europe','africa','asia','oceania'];
   const total = (await pool.query(`SELECT SUM(goals)::int AS t FROM scores`)).rows[0].t || 0;
   const salas = (await pool.query(`SELECT sala, goals FROM scores ORDER BY goals DESC`)).rows;
   // calcula percent por sala, aloca 6 regiões via largest-remainder
   // tiebreak: alfabético do código de sala
   // retorna { regions: { id: { sala, salaName, percent, goals } }, totalGoals }
   ```
2. Cache 30s in-memory: `let mapCache = { data, ts }`.

### Algoritmo de alocação
- Calcula `pct[sala] = goals[sala] / total * 6`
- `int[sala] = floor(pct[sala])`
- Sobra = `6 - sum(int)`; distribui pelas maiores frações de `pct - int`
- Sala 0% não pega região (cor cinza neutra)
- Sala com mais gols recebe primeiro as regiões maiores: SA, EU, AS, NA, AF, OC (ordem de prioridade)

### Frontend
1. **Asset:** `frontend/assets/maps/continents.svg` (listar em `pubspec.yaml`).
2. **Novo widget** `frontend/lib/widgets/world_map_widget.dart`:
   - Carrega SVG via `flutter_svg`.
   - Parse XML, substitui `fill` de cada path pela cor da sala dominante.
   - Cores fixas por sala:
     ```dart
     const Map<String, Color> kSalaColors = {
       '6ano':   Color(0xFFEF4444),
       '7ano':   Color(0xFFF59E0B),
       '8ano':   Color(0xFF22C55E),
       '9ano':   Color(0xFF06B6D4),
       '1medio': Color(0xFF3B82F6),
       '2medio': Color(0xFF8B5CF6),
       '3medio': Color(0xFFEC4899),
     };
     ```
   - `GestureDetector` por região via bounding boxes calculados de cada path.
3. **Editar** `frontend/lib/screens/home_screen.dart`: inserir `WorldMapWidget` no topo (após chutes restantes, antes do feed). Altura fixa 220px.
4. **BottomSheet** ao tocar região: `Região X — dominada por 6º Ano (32% gols globais)` + miniatura ranking top 3.
5. **Polling** a cada 30s OU listener socket `score_update` → re-busca.

### Edge cases
- Total = 0: mapa cinza, label "Ninguém conquistou ainda".
- Empate: alfabético do código de sala.
- SVG falha carregar: fallback `Image.asset('mapamundi-br.jpg')` (asset já existe).

### Critério done
- Home abre → mapa colorido.
- Marca 10 gols pelo 8º ano → eventualmente 8º ano pega uma região.
- Tap região → sheet com sala.

---

## PLANO 3 — Áudio 5s nos comentários

**Estimativa:** 3 dias
**Pré-requisito externo:** Cloudflare R2 provisionado
**Depende de:** Plano 1 (precisa `author_name`/`author_sala`)

### Objetivo
Botão mic ao lado do input. Long-press para gravar (max 5s). No feed: botão play + waveform. Sem foto, apenas áudio. Moderação obrigatória.

### Storage
**Não usar Postgres BLOB.** Cloudflare R2:
- Bucket: `cartolina-audio`
- Path: `comments/{id}.m4a`
- Acesso público read-only via subdomain custom

Vars de ambiente (`backend/.env`):
```
R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com
R2_ACCESS_KEY=...
R2_SECRET_KEY=...
R2_BUCKET=cartolina-audio
R2_PUBLIC_BASE=https://audio.cartolina.app
ADMIN_TOKEN=<gerar string aleatória de 32 chars>
```

### Schema
```sql
-- backend/migrations/002_audio_comments.sql
ALTER TABLE comments ADD COLUMN IF NOT EXISTS audio_url    TEXT;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS audio_dur_ms INTEGER;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS moderation   VARCHAR(16) NOT NULL DEFAULT 'approved';
-- valores: pending | approved | rejected
ALTER TABLE comments ADD COLUMN IF NOT EXISTS report_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS audit_log (
  id          SERIAL PRIMARY KEY,
  comment_id  INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  action      VARCHAR(32) NOT NULL,
  actor       VARCHAR(80),
  at          TIMESTAMP DEFAULT NOW()
);
```
`body` aceita string vazia quando `audio_url` existe.

### Backend
Deps:
```bash
npm i multer @aws-sdk/client-s3 nanoid
```

1. **Novo** `backend/r2.js`: helper com `S3Client` apontando para R2 endpoint + função `uploadAudio(buffer, id)` retornando URL pública.
2. **Novo** `POST /api/comments/audio` (multipart):
   - `multer.memoryStorage()`, `limits: { fileSize: 200_000 }`
   - mimetype aceito: `audio/mp4|m4a|aac|webm|mpeg`
   - Valida duração via header `x-audio-duration-ms` (`>= 500 && <= 5500`)
   - Gera `id = nanoid(12)`, upload R2
   - INSERT comment com `audio_url`, `audio_dur_ms`, `body` opcional, `author_name`, `author_sala`, `moderation='approved'` (MVP libera direto, campo existe pra moderação futura)
   - `io.emit('new_comment', comment)`
3. **Editar** `GET /api/comments`: `WHERE moderation IN ('approved') AND report_count < 3 ORDER BY created_at DESC LIMIT 200`
4. **Novo** `POST /api/comments/:id/report`: incrementa `report_count`. Se `>= 3`, seta `moderation='rejected'`, registra `audit_log`.
5. **Painel admin** (rota protegida por header `x-admin-token`):
   - `GET /admin/queue` → comentários `pending` + áudios reportados
   - `POST /admin/comments/:id/approve|reject`
   - HTML simples server-side, `<audio src controls>` + 2 botões

### Frontend
Deps (`pubspec.yaml`):
```yaml
record: ^5.1.2
audioplayers: ^6.1.0
permission_handler: ^11.3.1
path_provider: ^2.1.4
```

Permissões:
- `android/app/src/main/AndroidManifest.xml`:
  ```xml
  <uses-permission android:name="android.permission.RECORD_AUDIO"/>
  ```
- `ios/Runner/Info.plist`:
  ```xml
  <key>NSMicrophoneUsageDescription</key>
  <string>Para gravar áudio de até 5 segundos no comentário</string>
  ```

1. **Novo widget** `frontend/lib/widgets/audio_recorder_button.dart`:
   - `GestureDetector.onLongPressStart` → `record.start(RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 64000, sampleRate: 44100), path: tmpPath)`
   - Auto-stop em 5000ms via `Timer`
   - `onLongPressEnd` → `record.stop()`, valida `durMs >= 500`, devolve `File`
   - Visual: overlay vermelho pulsante + contador regressivo "5..4..3..2..1"
2. **Editar** `frontend/lib/screens/home_screen.dart`: ícone mic ao lado do botão enviar comentário.
3. **Editar** `frontend/lib/services/api_service.dart`:
   ```dart
   static Future<CommentModel> postAudioComment({
     required String sala,
     required String name,
     required File audio,
     required int durMs,
   }) async {
     final req = http.MultipartRequest('POST', Uri.parse('$_base/api/comments/audio'));
     req.headers['x-audio-duration-ms'] = '$durMs';
     req.fields['sala'] = sala;
     req.fields['name'] = name;
     req.files.add(await http.MultipartFile.fromPath('audio', audio.path));
     final res = await http.Response.fromStream(await req.send());
     if (res.statusCode == 201) {
       return CommentModel.fromJson(jsonDecode(res.body));
     }
     throw Exception('Erro ao enviar áudio: ${res.statusCode}');
   }
   ```
4. **Editar** `frontend/lib/widgets/comment_card.dart`: se `audioUrl != null`, renderiza `_AudioBubble`:
   - Botão play/pause central
   - Waveform fake (5 barras verticais animando ao tocar)
   - `AudioPlayer().play(UrlSource(audioUrl))`
   - Long-press → menu: "Denunciar áudio" (POST `/report`)

### Moderação política (CRÍTICO — não pular)
- Banner permanente no app: "Áudios denunciados 3x somem automaticamente. Conteúdo ofensivo = banimento."
- Termo aceito no onboarding: adicionar checkbox em `frontend/lib/screens/onboarding_screen.dart`.
- Log auditável já contemplado na tabela `audit_log`.

### Critério done
- Long-press mic, grava 3s, solta, comentário aparece no feed com player.
- Toca, ouve áudio.
- Denuncia 3x de contas diferentes, comentário some.
- Admin abre `/admin/queue` com header `x-admin-token`, vê reportados.

---

## PLANO 4 — Missão diária da sala + recompensa Bis

**Estimativa:** 1 dia código + operação contínua
**Depende de:** Plano 1
**Pré-requisito externo:** Webhook Discord/Slack + acordo com coordenação

### Objetivo
Card na home: "Missão de hoje: 6º ano marcar 200 gols. Recompensa: caixa de Bis. Faltam 137." Progresso ao vivo. Coordenação recebe notificação via webhook quando alvo é batido.

### Schema
```sql
-- backend/migrations/003_missions.sql
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
CREATE INDEX idx_missions_date ON missions(date);
```

### Geração de missão
Job no boot + de hora em hora. Sem cron lib externa.

```js
// backend/missions.js
const SALAS = ['6ano','7ano','8ano','9ano','1medio','2medio','3medio'];
const TARGETS = {
  '6ano': 150, '7ano': 150, '8ano': 180, '9ano': 200,
  '1medio': 200, '2medio': 220, '3medio': 220,
};

async function ensureTodayMissions() {
  const today = new Date().toISOString().slice(0,10);
  for (const sala of SALAS) {
    await pool.query(`
      INSERT INTO missions(date, sala, goal_type, target, reward)
      VALUES ($1, $2, 'goals_count', $3, 'Caixa de Bis')
      ON CONFLICT (date, sala) DO NOTHING
    `, [today, sala, TARGETS[sala]]);
  }
}

setInterval(ensureTodayMissions, 60 * 60 * 1000);
ensureTodayMissions();

module.exports = { ensureTodayMissions };
```

### Endpoints
1. **Editar** `POST /api/shoot`: após gravar gol, executar
   ```sql
   UPDATE missions
      SET progress = progress + 1,
          completed = (progress + 1 >= target),
          completed_at = CASE WHEN progress + 1 >= target AND NOT completed THEN NOW() ELSE completed_at END
    WHERE date = CURRENT_DATE AND sala = $1
   RETURNING completed, target, progress
   ```
   Se virou completed agora → `io.emit('mission_complete', { sala, target })` + `notifyCompletion(sala)`.
2. **Novo** `GET /api/missions/today` → array com 7 missões `{sala, target, progress, completed, reward}`.
3. **Novo** `GET /api/missions/history?sala=X&limit=30` → cronológico de missões batidas.
4. **Novo** `GET /admin/missions/today` (header `x-admin-token`) → status + botão "marcar entregue".
5. **Novo** `POST /admin/missions/:id/deliver` → `UPDATE missions SET delivered = true`.

### Webhook entrega
```js
async function notifyCompletion(sala) {
  if (!process.env.WEBHOOK_URL) return;
  await fetch(process.env.WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `🍫 Sala **${sala}** bateu missão de hoje! Entregar Caixa de Bis.`
    })
  });
}
```

### Frontend
1. **Novo widget** `frontend/lib/widgets/mission_card.dart`:
   - Header "🎯 Missão de hoje — {salaName}"
   - Texto: "Marcar X gols juntos · Recompensa: Caixa de Bis 🍫"
   - Barra de progresso animada (`flutter_animate` já presente)
   - Se completa: confete (`confetti` já presente) + badge "✅ Conquistada — fala com a coordenação"
2. **Socket** em `home_screen.dart`: escuta `mission_complete` → se for sala do user, full-screen celebração + share button "Conta pra galera: nossa sala bateu a missão!"
3. **Nova tela** `frontend/lib/screens/missions_history_screen.dart` linkada do `mission_card` → lista cronológica.

### Operação (parte humana — sem código)
- Combinar com coordenação ANTES de lançar.
- Adicionar `WEBHOOK_URL` no `.env` do Render.
- Quem vê webhook = coordenação, entrega Bis manualmente, marca `delivered=true` via `/admin`.

### Critério done
- Card aparece na home com progresso ao vivo.
- Marca gol → barra anda em tempo real via socket.
- Bate alvo → celebração + webhook dispara.
- Histórico mostra missões antigas.

---

## Pré-requisitos externos (responsabilidade do usuário)

- [ ] Conta Cloudflare R2 + bucket `cartolina-audio` criado (Plano 3)
- [ ] Custom domain R2 público (Plano 3) ou usar URL padrão
- [ ] Webhook Discord/Slack pra coordenação (Plano 4) — ver seção Discord abaixo
- [ ] Acordo escrito com coordenação sobre entrega de Bis (Plano 4)
- [ ] Termo de consentimento parental atualizado pra uso de microfone (Plano 3)
- [ ] `ADMIN_TOKEN` gerado e guardado fora do repo (Plano 3)

---

## Convenções de commit para IAs

Todas mudanças seguem Conventional Commits:
- `feat(rank): adiciona sistema de cargos por gols`
- `feat(map): mapa-múndi territorial na home`
- `feat(audio): comentário em áudio até 5s`
- `feat(mission): missão diária com webhook`
- `fix(...)`, `chore(...)`, `docs(...)`

Cada plano = 1 PR. Migrations em PR separado, mergeado primeiro.

---

## Ordem final de execução

1. **PR 0:** rodar migrations `001`, `002`, `003` no Render
2. **PR 1:** Plano 1 (Hierarquia)
3. **PR 2:** Plano 2 (Mapa) — paralelo ao PR 1
4. **PR 3:** Plano 4 (Missão) — depende PR 1 mergeado
5. **PR 4:** Plano 3 (Áudio) — depende PR 1 + R2 provisionado
