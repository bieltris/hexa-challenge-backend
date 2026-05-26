require('dotenv').config();

const http    = require('http');
const express = require('express');
const cors    = require('cors');
const compression = require('compression');
const { Server } = require('socket.io');
const path    = require('path');
const multer  = require('multer');
const { nanoid } = require('nanoid');
const pool = require('./db');
const { rankOf } = require('./ranks');
const r2 = require('./r2');
const {
  SALAS,
  ensureTodayMissions,
  startMissionScheduler,
  updateMissionProgress,
  notifyCompletion,
} = require('./missions');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*', methods: ['GET','POST'] } });
const PORT   = process.env.PORT || 3000;

app.set('trust proxy', 1); // Render fica atrás de proxy — pega IP real em req.ip
app.use(cors({ exposedHeaders: ['X-Has-More'] }));
app.use(compression()); // gzip responses ≥1KB (~70% redução em JSON)
app.use(express.json());

const SALA_NAMES = {
  '6ano': '6º Ano',
  '7ano': '7º Ano',
  '8ano': '8º Ano',
  '9ano': '9º Ano',
  '1medio': '1º Médio',
  '2medio': '2º Médio',
  '3medio': '3º Médio',
};
const MAP_REGION_IDS = [
  'south_america',
  'europe',
  'asia',
  'north_america',
  'africa',
  'oceania',
];

function toMissionDto(row) {
  return {
    id: row.id,
    date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : row.date,
    sala: row.sala,
    salaName: SALA_NAMES[row.sala] || row.sala,
    goalType: row.goal_type,
    target: row.target,
    reward: row.reward,
    progress: row.progress,
    completed: row.completed,
    completedAt: row.completed_at instanceof Date ? row.completed_at.toISOString() : row.completed_at,
    delivered: row.delivered,
  };
}

function requireAdmin(req, res, next) {
  const token = process.env.ADMIN_TOKEN;
  if (!token || req.get('x-admin-token') !== token) {
    return res.status(401).send('Não autorizado');
  }
  next();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function salaName(sala) {
  return SALA_NAMES[sala] || sala;
}

function buildMapRegions(rows) {
  const totalGoals = rows.reduce((sum, row) => sum + row.goals, 0);

  if (totalGoals <= 0) {
    return {
      totalGoals: 0,
      regions: Object.fromEntries(
        MAP_REGION_IDS.map((id) => [
          id,
          {
            sala: null,
            salaName: 'Ninguém conquistou ainda',
            percent: 0,
            goals: 0,
          },
        ])
      ),
    };
  }

  const seats = MAP_REGION_IDS.length;
  const quotas = rows.map((row) => {
    const exact = (row.goals / totalGoals) * seats;
    const floor = Math.floor(exact);
    return {
      sala: row.sala,
      salaName: salaName(row.sala),
      goals: row.goals,
      exact,
      floor,
      frac: exact - floor,
    };
  });

  let assigned = quotas.reduce((sum, item) => sum + item.floor, 0);
  const remaining = seats - assigned;
  quotas
    .slice()
    .sort((a, b) => {
      const byFrac = b.frac - a.frac;
      if (byFrac !== 0) return byFrac;
      const byGoals = b.goals - a.goals;
      if (byGoals !== 0) return byGoals;
      return a.sala.localeCompare(b.sala);
    })
    .slice(0, remaining)
    .forEach((item) => {
      item.floor += 1;
      assigned += 1;
    });

  const slots = [];
  quotas
    .slice()
    .sort((a, b) => {
      const byGoals = b.goals - a.goals;
      if (byGoals !== 0) return byGoals;
      return a.sala.localeCompare(b.sala);
    })
    .forEach((item) => {
      for (let i = 0; i < item.floor; i++) {
        slots.push({
          sala: item.sala,
          salaName: item.salaName,
          goals: item.goals,
          percent: Math.round((item.goals / totalGoals) * 100),
        });
      }
    });

  const regions = {};
  MAP_REGION_IDS.forEach((regionId, index) => {
    const slot = slots[index] || null;
    regions[regionId] = slot || {
      sala: null,
      salaName: 'Ninguém conquistou ainda',
      percent: 0,
      goals: 0,
    };
  });

  return { totalGoals, regions };
}

// ── Jogadores ─────────────────────────────────────────────────────────────────
const PLAYERS = [
  { id:1,  name:'Vinicius Jr.',    photo:'assets/images/vinicius_junior.jpeg',      is_pele:false },
  { id:2,  name:'Rodrygo',         photo:'assets/images/rodrygo.webp',               is_pele:false },
  { id:3,  name:'Endrick',         photo:'assets/images/endrick.webp',               is_pele:false },
  { id:4,  name:'Raphinha',        photo:'assets/images/raphinha.jpg',               is_pele:false },
  { id:5,  name:'Bruno Guimarães', photo:'assets/images/Bruno-Guimaraes.jpg',        is_pele:false },
  { id:6,  name:'Casemiro',        photo:'assets/images/casemiro.webp',              is_pele:false },
  { id:7,  name:'Marquinhos',      photo:'assets/images/marquinhos.webp',            is_pele:false },
  { id:8,  name:'Alisson',         photo:'assets/images/alysson.webp',               is_pele:false },
  { id:9,  name:'Martinelli',      photo:'assets/images/gabriel-martinelli-atacante-da-selecao-brasileira-comemora-gol-marcado-em-amistoso-contra-a-croacia-em-orlando-eua-1775695606855_v2_450x450.jpg', is_pele:false },
  { id:10, name:'Richarlison',     photo:'assets/images/RICHARLISON.jpg',            is_pele:false },
  { id:11, name:'Pelé',            photo:'assets/images/pelé.png',                   is_pele:true  },
  { id:12, name:'Ronaldo R9',      photo:'assets/images/ronaldo_r9.jpg',             is_pele:false },
  { id:13, name:'Ronaldinho',      photo:'assets/images/ronaldinho.webp',            is_pele:false },
  { id:14, name:'Zico',            photo:'assets/images/zico.jpg',                   is_pele:false },
  { id:15, name:'Sócrates',        photo:'assets/images/socrates.png',               is_pele:false },
  { id:16, name:'Cafu',            photo:'assets/images/cafu.jpg',                   is_pele:false },
  { id:17, name:'Roberto Carlos',  photo:'assets/images/roberto_carlos.webp',        is_pele:false },
  { id:18, name:'Rivaldo',         photo:'assets/images/rivaldo.webp',               is_pele:false },
  { id:19, name:'Garrincha',       photo:'assets/images/Garrincha.webp',             is_pele:false },
  { id:20, name:'Romário',         photo:'assets/images/romario.webp',               is_pele:false },
  { id:21, name:'Neymar',          photo:'assets/images/neymar.webp',                is_pele:false },
  { id:22, name:'Chico',           photo:'assets/images/chico.jpeg',                 is_pele:false },
];

// ── Perguntas ─────────────────────────────────────────────────────────────────
const QUESTIONS = [
  // ── BRASIL NA COPA (25) ───────────────────────────────────────────────────
  { text:'Em qual ano o Brasil conquistou seu primeiro título na Copa do Mundo?', opt_a:'1958', opt_b:'1950', opt_c:'1962', correct:'A', category:'brasil_copa' },
  { text:'Quantos títulos mundiais o Brasil conquistou até 2026?', opt_a:'5', opt_b:'4', opt_c:'6', correct:'A', category:'brasil_copa' },
  { text:'Quem marcou os dois gols do Brasil na final da Copa de 2002?', opt_a:'Ronaldo', opt_b:'Rivaldo', opt_c:'Ronaldinho', correct:'A', category:'brasil_copa' },
  { text:'Qual seleção derrotou o Brasil na final da Copa de 1998?', opt_a:'França', opt_b:'Alemanha', opt_c:'Itália', correct:'A', category:'brasil_copa' },
  { text:'Qual foi o placar do Brasil x Alemanha na semifinal de 2014?', opt_a:'1 x 7', opt_b:'0 x 3', opt_c:'2 x 5', correct:'A', category:'brasil_copa' },
  { text:'Em qual Copa o Brasil venceu a Itália nos pênaltis e se tornou pentacampeão?', opt_a:'1994', opt_b:'1990', opt_c:'1998', correct:'A', category:'brasil_copa' },
  { text:'Com quantos anos Pelé ganhou sua primeira Copa do Mundo?', opt_a:'17', opt_b:'16', opt_c:'19', correct:'A', category:'brasil_copa' },
  { text:'Qual é a cor principal da camisa titular da Seleção Brasileira?', opt_a:'Amarela', opt_b:'Verde', opt_c:'Azul', correct:'A', category:'brasil_copa' },
  { text:'Em que Copa do Mundo o Brasil foi eliminado pela Alemanha em casa?', opt_a:'2014', opt_b:'2010', opt_c:'2018', correct:'A', category:'brasil_copa' },
  { text:'O Brasil é o único país a ter participado de TODAS as edições da Copa do Mundo?', opt_a:'Sim', opt_b:'Não', opt_c:'Apenas nas últimas 20', correct:'A', category:'brasil_copa' },
  { text:'Qual foi o resultado da final de 1950 conhecido como Maracanazo?', opt_a:'Uruguai 2 x 1 Brasil', opt_b:'Brasil 1 x 2 Uruguai', opt_c:'Empate 1 x 1', correct:'A', category:'brasil_copa' },
  { text:'Quantos gols Ronaldo Fenômeno marcou na Copa de 2002?', opt_a:'8', opt_b:'6', opt_c:'5', correct:'A', category:'brasil_copa' },
  { text:'Em qual Copa do Mundo Pelé fez seu primeiro gol?', opt_a:'1958', opt_b:'1962', opt_c:'1970', correct:'A', category:'brasil_copa' },
  { text:'Quantos gols Pelé marcou na Copa de 1958?', opt_a:'6', opt_b:'8', opt_c:'4', correct:'A', category:'brasil_copa' },
  { text:'Qual país o Brasil enfrentou na final de 1970?', opt_a:'Itália', opt_b:'Alemanha', opt_c:'Holanda', correct:'A', category:'brasil_copa' },
  { text:'O Brasil venceu a final de 1970 por qual placar?', opt_a:'4 x 1', opt_b:'3 x 1', opt_c:'2 x 0', correct:'A', category:'brasil_copa' },
  { text:'Qual o maior artilheiro do Brasil em todas as Copas do Mundo?', opt_a:'Ronaldo (15 gols)', opt_b:'Pelé (12 gols)', opt_c:'Bebeto (8 gols)', correct:'A', category:'brasil_copa' },
  { text:'Em qual Copa Zico errou pênalti decisivo contra a França?', opt_a:'1986', opt_b:'1982', opt_c:'1978', correct:'A', category:'brasil_copa' },
  { text:'Qual foi o técnico do Brasil campeão em 2002?', opt_a:'Luiz Felipe Scolari', opt_b:'Mário Zagallo', opt_c:'Tite', correct:'A', category:'brasil_copa' },
  { text:'Em qual ano o Brasil sediou a Copa do Mundo pela segunda vez?', opt_a:'2014', opt_b:'2002', opt_c:'1998', correct:'A', category:'brasil_copa' },
  { text:'Qual seleção eliminou o Brasil na Copa de 2014?', opt_a:'Alemanha (semifinal)', opt_b:'Argentina (final)', opt_c:'Holanda (3º lugar)', correct:'A', category:'brasil_copa' },
  { text:'Quem foi o artilheiro do Brasil na Copa de 1994?', opt_a:'Romário', opt_b:'Bebeto', opt_c:'Cafu', correct:'A', category:'brasil_copa' },
  { text:'Em qual Copa do Mundo Ronaldinho deu aquela assistência genial contra a Inglaterra?', opt_a:'2002', opt_b:'1998', opt_c:'2006', correct:'A', category:'brasil_copa' },
  { text:'Pelé ganhou quantas Copas do Mundo ao longo da carreira?', opt_a:'3 (1958, 1962 e 1970)', opt_b:'2 (1958 e 1970)', opt_c:'4 (1958, 1962, 1966 e 1970)', correct:'A', category:'brasil_copa' },
  { text:'Em qual Copa Mário Zagallo foi campeão como jogador E como técnico?', opt_a:'Como jogador em 1958/62 e técnico em 1970', opt_b:'Como jogador em 1970 e técnico em 1994', opt_c:'Como jogador em 1950 e técnico em 1962', correct:'A', category:'brasil_copa' },
  // ── COPA DO MUNDO GERAL (25) ──────────────────────────────────────────────
  { text:'Qual foi a primeira Copa do Mundo da história?', opt_a:'Uruguai 1930', opt_b:'Brasil 1950', opt_c:'França 1938', correct:'A', category:'copa_geral' },
  { text:'Quantas seleções participam da Copa do Mundo de 2026?', opt_a:'48', opt_b:'32', opt_c:'36', correct:'A', category:'copa_geral' },
  { text:'Qual jogador marcou mais gols em Copas do Mundo na história?', opt_a:'Miroslav Klose (16)', opt_b:'Ronaldo R9 (15)', opt_c:'Pelé (12)', correct:'A', category:'copa_geral' },
  { text:'Em qual país a Copa de 2026 será sediada?', opt_a:'EUA, Canadá e México', opt_b:'Brasil e Argentina', opt_c:'Espanha e Portugal', correct:'A', category:'copa_geral' },
  { text:'Qual time venceu a Copa do Mundo de 2022?', opt_a:'Argentina', opt_b:'França', opt_c:'Marrocos', correct:'A', category:'copa_geral' },
  { text:'Quem ganhou a Bola de Ouro na Copa de 2022?', opt_a:'Lionel Messi', opt_b:'Kylian Mbappé', opt_c:'Luka Modrić', correct:'A', category:'copa_geral' },
  { text:'Qual foi o artilheiro da Copa de 2022?', opt_a:'Kylian Mbappé (8 gols)', opt_b:'Lionel Messi (7 gols)', opt_c:'Olivier Giroud (4 gols)', correct:'A', category:'copa_geral' },
  { text:'Quantas vezes a Alemanha venceu a Copa do Mundo?', opt_a:'4 (1954, 1974, 1990, 2014)', opt_b:'3', opt_c:'5', correct:'A', category:'copa_geral' },
  { text:'Em que ano a Copa do Mundo passou a ter 32 seleções?', opt_a:'1998', opt_b:'1994', opt_c:'2002', correct:'A', category:'copa_geral' },
  { text:'Qual país foi o primeiro bicampeão da Copa do Mundo?', opt_a:'Itália (1934 e 1938)', opt_b:'Brasil (1958 e 1962)', opt_c:'Uruguai (1930 e 1950)', correct:'A', category:'copa_geral' },
  { text:'Como se chama o troféu da Copa do Mundo antes de 1974?', opt_a:'Taça Jules Rimet', opt_b:'Troféu FIFA', opt_c:'Copa da Vitória', correct:'A', category:'copa_geral' },
  { text:'Por que o Brasil ficou com a Taça Jules Rimet definitivamente?', opt_a:'Foi tricampeão em 1970', opt_b:'Sediou mais Copas', opt_c:'Marcou mais gols', correct:'A', category:'copa_geral' },
  { text:'Em que ano a Copa do Mundo foi disputada pela primeira vez na Ásia?', opt_a:'2002', opt_b:'2010', opt_c:'1994', correct:'A', category:'copa_geral' },
  { text:'Quem foi o artilheiro da Copa de 2018?', opt_a:'Harry Kane (6 gols)', opt_b:'Romelu Lukaku', opt_c:'Antoine Griezmann', correct:'A', category:'copa_geral' },
  { text:'Qual seleção ganhou a Copa de 2018?', opt_a:'França', opt_b:'Croácia', opt_c:'Bélgica', correct:'A', category:'copa_geral' },
  { text:'Em que país foi realizada a Copa de 2010?', opt_a:'África do Sul', opt_b:'Egito', opt_c:'Nigéria', correct:'A', category:'copa_geral' },
  { text:'Em qual país a Copa de 1966 foi realizada?', opt_a:'Inglaterra', opt_b:'Alemanha Ocidental', opt_c:'França', correct:'A', category:'copa_geral' },
  { text:'Em qual estádio será a final da Copa do Mundo de 2026?', opt_a:'MetLife Stadium, Nova Jersey', opt_b:'Estádio Azteca, México', opt_c:'Rose Bowl, Los Angeles', correct:'A', category:'copa_geral' },
  { text:'Qual foi a maior goleada da história das Copas do Mundo?', opt_a:'Hungria 10 x 1 El Salvador (1982)', opt_b:'Alemanha 8 x 0 Arábia Saudita', opt_c:'Brasil 6 x 1 Bolívia', correct:'A', category:'copa_geral' },
  { text:'Qual foi a primeira Copa do Mundo feminina?', opt_a:'China 1991', opt_b:'EUA 1995', opt_c:'Suécia 1999', correct:'A', category:'copa_geral' },
  { text:'Qual seleção tem mais títulos de Copa, além do Brasil?', opt_a:'Alemanha e Itália (4 cada)', opt_b:'Argentina (3)', opt_c:'França (2)', correct:'A', category:'copa_geral' },
  { text:'Quantas edições da Copa do Mundo já foram realizadas até 2022?', opt_a:'22', opt_b:'21', opt_c:'20', correct:'A', category:'copa_geral' },
  { text:'Qual é o intervalo entre cada Copa do Mundo?', opt_a:'4 anos', opt_b:'2 anos', opt_c:'3 anos', correct:'A', category:'copa_geral' },
  { text:'Qual a quantidade de países que sediará a Copa de 2026?', opt_a:'3', opt_b:'2', opt_c:'1', correct:'A', category:'copa_geral' },
  { text:'Em 2022, qual foi a maior surpresa ao eliminar Portugal e chegar às semifinais?', opt_a:'Marrocos', opt_b:'Arábia Saudita', opt_c:'Japão', correct:'A', category:'copa_geral' },
  // ── COLÉGIO / PIRAJU (50) ─────────────────────────────────────────────────
  { text:'Qual é o nome completo do colégio Positivo em Piraju?', opt_a:'CEPI – Colégio Educacional de Piraju', opt_b:'Colégio Positivo de Piraju', opt_c:'Escola Estadual de Piraju', correct:'A', category:'colegio' },
  { text:'Em qual rua está localizado o CEPI?', opt_a:'Rua Dr. Washington Osório de Oliveira', opt_b:'Avenida Paulista', opt_c:'Rua XV de Novembro', correct:'A', category:'colegio' },
  { text:'Em que ano o CEPI foi fundado?', opt_a:'2004', opt_b:'1998', opt_c:'2010', correct:'A', category:'colegio' },
  { text:'Qual sistema de ensino o CEPI adota?', opt_a:'Sistema Positivo de Ensino', opt_b:'Sistema COC', opt_c:'Sistema Pearson', correct:'A', category:'colegio' },
  { text:'Qual o número do CEPI na Rua Washington Osório de Oliveira?', opt_a:'867', opt_b:'123', opt_c:'500', correct:'A', category:'colegio' },
  { text:'Qual é o telefone do CEPI?', opt_a:'(14) 3351-1502', opt_b:'(14) 3355-0001', opt_c:'(14) 3300-5555', correct:'A', category:'colegio' },
  { text:'Em qual bairro está localizado o CEPI?', opt_a:'Centro', opt_b:'Vila Nova', opt_c:'Jardim Paulista', correct:'A', category:'colegio' },
  { text:'Uma das diretoras do CEPI chama-se:', opt_a:'Cristiane Martignoni', opt_b:'Ana Paula Silva', opt_c:'Marcos Pereira', correct:'A', category:'colegio' },
  { text:'Em qual cidade e estado está localizado o CEPI?', opt_a:'Piraju, São Paulo', opt_b:'Piraju, Paraná', opt_c:'Piraju, Minas Gerais', correct:'A', category:'colegio' },
  { text:'Em qual DDD (código de área) está localizado o CEPI?', opt_a:'14', opt_b:'11', opt_c:'41', correct:'A', category:'colegio' },
  { text:'Qual é o significado do nome Piraju em tupi-guarani?', opt_a:'Peixe amarelo', opt_b:'Rio verde', opt_c:'Terra vermelha', correct:'A', category:'colegio' },
  { text:'Em que ano Piraju foi elevada à categoria de município?', opt_a:'1880', opt_b:'1900', opt_c:'1850', correct:'A', category:'colegio' },
  { text:'Qual é a população aproximada de Piraju?', opt_a:'30 mil habitantes', opt_b:'100 mil habitantes', opt_c:'5 mil habitantes', correct:'A', category:'colegio' },
  { text:'Piraju é uma Estância Turística desde que ano?', opt_a:'2002', opt_b:'1990', opt_c:'2010', correct:'A', category:'colegio' },
  { text:'Qual rio é o principal atrativo turístico de Piraju?', opt_a:'Rio Paranapanema', opt_b:'Rio Tietê', opt_c:'Rio Paraíba', correct:'A', category:'colegio' },
  { text:'A quantos km da capital São Paulo fica Piraju?', opt_a:'340 km', opt_b:'150 km', opt_c:'500 km', correct:'A', category:'colegio' },
  { text:'Piraju foi a primeira cidade brasileira a fazer o quê?', opt_a:'Abolir a escravidão (antes da Lei Áurea)', opt_b:'Ter água encanada', opt_c:'Ter energia solar', correct:'A', category:'colegio' },
  { text:'Em que ano Piraju foi a primeira cidade a ter luz elétrica (antes do Rio)?', opt_a:'1912', opt_b:'1920', opt_c:'1900', correct:'A', category:'colegio' },
  { text:'Qual a designação original de Piraju antes de receber esse nome?', opt_a:'Tijuco Preto', opt_b:'Rio Claro', opt_c:'Campos Verdes', correct:'A', category:'colegio' },
  { text:'Piraju atravessada por quantos km do Rio Paranapanema?', opt_a:'90,6 km', opt_b:'200 km', opt_c:'30 km', correct:'A', category:'colegio' },
  { text:'Em qual fazenda foi instalada a primeira usina elétrica de Piraju?', opt_a:'Fazenda Boa Vista', opt_b:'Fazenda Esperança', opt_c:'Fazenda Santa Cruz', correct:'A', category:'colegio' },
  { text:'Em qual região do estado de São Paulo fica Piraju?', opt_a:'Vale do Paranapanema', opt_b:'Vale do Ribeira', opt_c:'Litoral Sul', correct:'A', category:'colegio' },
  { text:'Qual o gentílico dos habitantes de Piraju?', opt_a:'Pirajuense', opt_b:'Pirajulense', opt_c:'Pirajuano', correct:'A', category:'colegio' },
  { text:'O turismo em Piraju se destaca principalmente por:', opt_a:'Pesca e ecoturismo no Rio Paranapanema', opt_b:'Montanhas e neve', opt_c:'Praias do Atlântico', correct:'A', category:'colegio' },
  { text:'Qual é a metodologia do Sistema Positivo de Ensino?', opt_a:'Interacionista com foco no protagonismo do aluno', opt_b:'Método Montessori', opt_c:'Ensino tradicional expositivo', correct:'A', category:'colegio' },
  { text:'O Sistema Positivo de Ensino foi fundado em qual cidade?', opt_a:'Curitiba, Paraná', opt_b:'São Paulo, SP', opt_c:'Rio de Janeiro, RJ', correct:'A', category:'colegio' },
  { text:'O Sistema Positivo valoriza o quê nos alunos?', opt_a:'O protagonismo e o aprendizado ativo', opt_b:'A memorização e repetição', opt_c:'O silêncio em sala', correct:'A', category:'colegio' },
  { text:'Qual tecnologia o Sistema Positivo integra ao aprendizado?', opt_a:'Plataformas digitais e material interativo', opt_b:'Apenas livros físicos', opt_c:'Televisão educativa', correct:'A', category:'colegio' },
  { text:'Como o Sistema Positivo apoia os professores?', opt_a:'Com formação continuada e assessoria pedagógica', opt_b:'Apenas com livros didáticos', opt_c:'Com testes mensais obrigatórios', correct:'A', category:'colegio' },
  { text:'O Sistema Positivo abrange quais níveis de ensino?', opt_a:'Educação Infantil ao Ensino Médio', opt_b:'Apenas Ensino Médio', opt_c:'Apenas Ensino Fundamental', correct:'A', category:'colegio' },
  { text:'O aprendizado no Sistema Positivo é promovido através de:', opt_a:'Jogos, atividades artísticas e desafios interativos', opt_b:'Provas semanais e exercícios repetitivos', opt_c:'Aulas apenas expositivas', correct:'A', category:'colegio' },
  { text:'Qual o objetivo do Sistema Positivo para os alunos?', opt_a:'Formar jovens preparados para os desafios do futuro', opt_b:'Preparar apenas para o vestibular', opt_c:'Ensinar conteúdos básicos', correct:'A', category:'colegio' },
  { text:'O Sistema Positivo oferece qual tipo de material didático?', opt_a:'Material apostilado e digital interativo', opt_b:'Apenas cópias xerocadas', opt_c:'Sem material impresso', correct:'A', category:'colegio' },
  { text:'O objetivo do desenvolvimento integral no Positivo inclui:', opt_a:'Aspectos cognitivos, emocionais e sociais', opt_b:'Apenas o aspecto acadêmico', opt_c:'Apenas atividades físicas', correct:'A', category:'colegio' },
  { text:'Qual exame nacional avalia os estudantes ao final do Ensino Médio?', opt_a:'ENEM', opt_b:'FUVEST', opt_c:'ENADE', correct:'A', category:'colegio' },
  { text:'O ENEM é realizado em quantos dias?', opt_a:'2 dias', opt_b:'1 dia', opt_c:'3 dias', correct:'A', category:'colegio' },
  { text:'Quantas áreas de conhecimento o ENEM avalia?', opt_a:'4', opt_b:'5', opt_c:'3', correct:'A', category:'colegio' },
  { text:'Qual programa usa a nota do ENEM para acesso às universidades públicas?', opt_a:'SISU', opt_b:'PROUNI', opt_c:'FIES', correct:'A', category:'colegio' },
  { text:'Qual lei regula a educação básica no Brasil?', opt_a:'LDB – Lei de Diretrizes e Bases', opt_b:'Constituição Federal', opt_c:'ECA', correct:'A', category:'colegio' },
  { text:'O Ensino Médio no Brasil dura quantos anos?', opt_a:'3 anos', opt_b:'4 anos', opt_c:'2 anos', correct:'A', category:'colegio' },
  { text:'Quantos dias letivos mínimos a LDB exige por ano?', opt_a:'200 dias', opt_b:'180 dias', opt_c:'220 dias', correct:'A', category:'colegio' },
  { text:'Piraju faz divisa com qual estado?', opt_a:'Paraná', opt_b:'Mato Grosso do Sul', opt_c:'Santa Catarina', correct:'A', category:'colegio' },
  { text:'O nome científico do peixe "pirá-yu" (peixe amarelo) é símbolo de Piraju. De qual língua vem esse nome?', opt_a:'Tupi-guarani', opt_b:'Latim', opt_c:'Português arcaico', correct:'A', category:'colegio' },
  { text:'Qual o CEP do CEPI?', opt_a:'18800-057', opt_b:'18000-100', opt_c:'18900-000', correct:'A', category:'colegio' },
  { text:'Em qual categoria turística Piraju se encaixa?', opt_a:'Estância Turística', opt_b:'Polo de ecoturismo', opt_c:'Cidade histórica tombada', correct:'A', category:'colegio' },
  { text:'Piraju está próxima à divisa com o Paraná, na região conhecida como:', opt_a:'Vale do Paranapanema', opt_b:'Serra da Mantiqueira', opt_c:'Serra do Mar', correct:'A', category:'colegio' },
  { text:'Qual o principal diferencial do CEPI em relação a escolas comuns?', opt_a:'Adoção do Sistema Positivo de Ensino com material apostilado', opt_b:'Ensino público gratuito', opt_c:'Escola técnica profissionalizante', correct:'A', category:'colegio' },
  { text:'O Ensino Médio começa após qual série?', opt_a:'9º ano do Ensino Fundamental', opt_b:'8º ano do Ensino Fundamental', opt_c:'7º ano do Ensino Fundamental', correct:'A', category:'colegio' },
  { text:'No calendário escolar brasileiro, em que mês geralmente começa o ano letivo?', opt_a:'Fevereiro', opt_b:'Janeiro', opt_c:'Março', correct:'A', category:'colegio' },
  { text:'O CEPI utiliza sistema de apostilas que abrangem todas as matérias. Esse sistema é chamado de:', opt_a:'Sistema Positivo de Ensino', opt_b:'Sistema Modular', opt_c:'Sistema Nacional', correct:'A', category:'colegio' },
  { text:'Qual a data de fundação do Centro Educacional de Piraju (CEPI)?', opt_a:'24 de março de 2004', opt_b:'15 de julho de 1998', opt_c:'01 de agosto de 2010', correct:'A', category:'colegio' },
];

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

// ── GET /api/map/regions ─────────────────────────────────────────────────────
app.get('/api/map/regions', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sala, goals
         FROM scores
        ORDER BY goals DESC, sala ASC`
    );
    const snapshot = buildMapRegions(result.rows);
    res.json(snapshot);
  } catch (err) {
    console.error('[GET /api/map/regions]', err.message);
    res.status(500).json({ error: 'Erro no banco de dados' });
  }
});

// Log de gols/tentativas (fire-and-forget; nao bloqueia resposta).
// Permite calcular gols/min retroativo e detectar anomalias.
function logGoalEvent({ name, sala, source, goals = 0, attempts = 0, ip }) {
  pool.query(
    `INSERT INTO goal_events(name, sala, source, goals, attempts, ip)
     VALUES($1, $2, $3, $4, $5, $6)`,
    [
      name && name.trim() ? name.trim().slice(0, 100) : null,
      sala,
      String(source || 'other').slice(0, 24),
      Number.isFinite(goals)    ? Math.trunc(goals)    : 0,
      Number.isFinite(attempts) ? Math.trunc(attempts) : 0,
      ip ? String(ip).slice(0, 64) : null,
    ]
  ).catch(err => console.error('[goal_events]', err.message));
}

// ── POST /api/shoot ───────────────────────────────────────────────────────────
// Body: { sala: "6ano", scored: true|false }
app.post('/api/shoot', async (req, res) => {
  const { sala, scored, name } = req.body;

  if (!sala || typeof scored !== 'boolean') {
    return res.status(400).json({ error: 'Campos obrigatórios: sala (string), scored (boolean)' });
  }

  if (!SALAS.includes(sala)) {
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

    // Registra pontuação individual se nome fornecido. Conta attempt sempre.
    if (name && typeof name === 'string') {
      const cleanName = name.trim().slice(0, 100);
      if (cleanName.length > 0) {
        const goalInc = scored ? 1 : 0;
        await pool.query(
          `INSERT INTO player_scores(name, sala, goals, attempts)
           VALUES($1, $2, $3, 1)
           ON CONFLICT(name, sala)
           DO UPDATE SET goals = player_scores.goals + $3,
                         attempts = player_scores.attempts + 1,
                         updated_at = NOW()`,
          [cleanName, sala, goalInc]
        );
      }
    }

    let mission = null;
    if (scored) {
      mission = await updateMissionProgress(sala, 1);
      if (mission) {
        const missionPayload = toMissionDto(mission);
        // Scope para a sala — só clientes daquela sala recebem
        io.to(`sala:${sala}`).emit('mission_update', missionPayload);
        if (mission.just_completed) {
          io.to(`sala:${sala}`).emit('mission_complete', missionPayload);
          notifyCompletion(sala).catch((err) => {
            console.error('[notifyCompletion]', err.message);
          });
        }
      }
    }

    logGoalEvent({
      name, sala, source: 'penalty',
      goals: scored ? 1 : 0, attempts: 1, ip: req.ip,
    });

    res.json({ ...result.rows[0], mission: mission ? toMissionDto(mission) : null });
  } catch (err) {
    console.error('[POST /api/shoot]', err.message);
    res.status(500).json({ error: 'Erro no banco de dados' });
  }
});

// ── Missões ──────────────────────────────────────────────────────────────────
app.get('/api/missions/today', async (req, res) => {
  try {
    await ensureTodayMissions();
    const result = await pool.query(
      `SELECT *
         FROM missions
        WHERE date = CURRENT_DATE
        ORDER BY CASE sala
          WHEN '6ano' THEN 1 WHEN '7ano' THEN 2 WHEN '8ano' THEN 3
          WHEN '9ano' THEN 4 WHEN '1medio' THEN 5 WHEN '2medio' THEN 6
          WHEN '3medio' THEN 7 ELSE 99 END`
    );
    res.json(result.rows.map(toMissionDto));
  } catch (err) {
    console.error('[GET /api/missions/today]', err.message);
    res.status(500).json({ error: 'Erro no banco de dados' });
  }
});

app.get('/api/missions/history', async (req, res) => {
  const sala = (req.query.sala || '').toString().trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
  if (!SALAS.includes(sala)) {
    return res.status(400).json({ error: 'sala inválida' });
  }
  try {
    const result = await pool.query(
      `SELECT *
         FROM missions
        WHERE sala = $1 AND completed = true
        ORDER BY date DESC
        LIMIT $2`,
      [sala, limit]
    );
    res.json(result.rows.map(toMissionDto));
  } catch (err) {
    console.error('[GET /api/missions/history]', err.message);
    res.status(500).json({ error: 'Erro no banco de dados' });
  }
});

app.get('/admin/missions/today', requireAdmin, async (req, res) => {
  try {
    await ensureTodayMissions();
    const result = await pool.query(
      `SELECT *
         FROM missions
        WHERE date = CURRENT_DATE
        ORDER BY completed DESC, delivered ASC, sala ASC`
    );
    const rows = result.rows.map((m) => `
      <tr>
        <td>${escapeHtml(SALA_NAMES[m.sala] || m.sala)}</td>
        <td>${m.progress}/${m.target}</td>
        <td>${m.completed ? 'Sim' : 'Não'}</td>
        <td>${m.delivered ? 'Entregue' : 'Pendente'}</td>
        <td><button onclick="deliverMission(${m.id})" ${m.delivered ? 'disabled' : ''}>marcar entregue</button></td>
      </tr>
    `).join('');
    res.type('html').send(`
      <!doctype html>
      <html lang="pt-BR">
        <head><meta charset="utf-8"><title>Missões de hoje</title></head>
        <body>
          <h1>Missões de hoje</h1>
          <table border="1" cellpadding="8" cellspacing="0">
            <thead>
              <tr><th>Sala</th><th>Progresso</th><th>Completa</th><th>Entrega</th><th>Ação</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <script>
            async function deliverMission(id) {
              const saved = localStorage.getItem('adminToken') || '';
              const token = saved || prompt('Token admin');
              if (!token) return;
              localStorage.setItem('adminToken', token);
              const res = await fetch('/admin/missions/' + id + '/deliver', {
                method: 'POST',
                headers: { 'x-admin-token': token }
              });
              if (res.ok) location.reload();
              else alert('Falha ao marcar entrega');
            }
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('[GET /admin/missions/today]', err.message);
    res.status(500).send('Erro no banco de dados');
  }
});

app.post('/admin/missions/:id/deliver', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });
  try {
    const result = await pool.query(
      `UPDATE missions
          SET delivered = true
        WHERE id = $1
        RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Missão não encontrada' });
    res.json(toMissionDto(result.rows[0]));
  } catch (err) {
    console.error('[POST /admin/missions/:id/deliver]', err.message);
    res.status(500).json({ error: 'Erro no banco de dados' });
  }
});

// ── GET /api/questions/random?count=5 ────────────────────────────────────────
app.get('/api/questions/random', async (req, res) => {
  const count = Math.min(parseInt(req.query.count) || 5, 10);
  try {
    const result = await pool.query(
      `SELECT id, text, opt_a, opt_b, opt_c, correct, category
         FROM questions
        ORDER BY RANDOM()
        LIMIT $1`, [count]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[GET /api/questions/random]', err.message);
    res.status(500).json({ error: 'Erro no banco de dados' });
  }
});

// ── POST /api/comments ────────────────────────────────────────────────────────
// Body: { sala, body }
app.post('/api/comments', async (req, res) => {
  const { sala, body, name } = req.body;
  const VALID_SALAS = ['6ano','7ano','8ano','9ano','1medio','2medio','3medio'];
  if (!sala || !body || typeof body !== 'string' || body.trim().length < 2) {
    return res.status(400).json({ error: 'Campos obrigatórios: sala, body (mín 2 chars)' });
  }
  if (!VALID_SALAS.includes(sala)) {
    return res.status(400).json({ error: 'Sala inválida' });
  }
  const player = PLAYERS[Math.floor(Math.random() * PLAYERS.length)];
  const authorName = (typeof name === 'string') ? name.trim().slice(0, 100) || null : null;
  try {
    const result = await pool.query(
      `INSERT INTO comments(sala, body, player_name, player_photo, is_pele, author_name, author_sala)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [sala, body.trim().slice(0, 500), player.name, player.photo, player.is_pele, authorName, sala]
    );
    let comment = result.rows[0];

    // Anexa cargo do autor se identificado
    if (comment.author_name) {
      const ps = await pool.query(
        `SELECT goals FROM player_scores WHERE name = $1 AND sala = $2`,
        [comment.author_name, comment.author_sala]
      );
      const goals = ps.rows[0]?.goals ?? 0;
      const rank = rankOf(goals);
      comment = { ...comment, author_goals: goals, author_rank_label: rank.label, author_rank_color: rank.color };
    }

    io.emit('new_comment', comment);
    res.status(201).json(comment);
  } catch (err) {
    console.error('[POST /api/comments]', err.message);
    res.status(500).json({ error: 'Erro no banco de dados' });
  }
});

// ── GET /api/comments ─────────────────────────────────────────────────────────
// Query params:
//   ?limit=20     → quantos retornar (default 20, max 50)
//   ?before=<id>  → cursor: retorna apenas comentários com id < <id>
// Sem cursor = primeira página (mais recentes).
app.get('/api/comments', async (req, res) => {
  try {
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(isNaN(limitRaw) ? 20 : limitRaw, 1), 50);
    const beforeRaw = parseInt(req.query.before, 10);
    const hasCursor = !isNaN(beforeRaw);

    const params = hasCursor ? [beforeRaw, limit] : [limit];
    const cursorClause = hasCursor ? 'AND c.id < $1' : '';
    const limitParam = hasCursor ? '$2' : '$1';

    const result = await pool.query(
      `SELECT c.id, c.sala, c.body, c.player_name, c.player_photo, c.is_pele,
              c.created_at, c.likes, c.author_name, c.author_sala,
              c.audio_url, c.audio_dur_ms,
              COALESCE(p.goals, 0) AS author_goals
         FROM comments c
         LEFT JOIN player_scores p
           ON p.name = c.author_name AND p.sala = c.author_sala
        WHERE c.moderation IN ('approved', 'pending')
          AND c.report_count < 3
          ${cursorClause}
        ORDER BY c.id DESC
        LIMIT ${limitParam}`,
      params
    );
    const rows = result.rows.map(r => {
      if (!r.author_name) return r;
      const rank = rankOf(r.author_goals);
      return { ...r, author_rank_label: rank.label, author_rank_color: rank.color };
    });
    // hasMore via header — mantém response array (backwards compat)
    res.set('X-Has-More', rows.length === limit ? '1' : '0');
    res.json(rows);
  } catch (err) {
    console.error('[GET /api/comments]', err.message);
    res.status(500).json({ error: 'Erro no banco de dados' });
  }
});

// ── POST /api/comments/audio ─────────────────────────────────────────────────
// multipart/form-data: campo "audio" (file), fields "sala" e "name"
// header "x-audio-duration-ms" obrigatório (500-5500)
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 250_000 }, // 250 KB max
  fileFilter: (req, file, cb) => {
    const allowed = ['audio/mp4', 'audio/m4a', 'audio/aac', 'audio/webm', 'audio/mpeg', 'audio/x-m4a'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`mimetype não suportado: ${file.mimetype}`));
  },
});

app.post('/api/comments/audio', (req, res) => {
  audioUpload.single('audio')(req, res, async (err) => {
    if (err) {
      console.error('[POST /api/comments/audio] upload err:', err.message);
      return res.status(400).json({ error: err.message });
    }
    if (!r2.enabled) {
      return res.status(503).json({ error: 'R2 não configurado no servidor' });
    }
    if (!req.file) return res.status(400).json({ error: 'Arquivo audio ausente' });

    const sala = (req.body.sala || '').toString().trim();
    const name = (req.body.name || '').toString().trim().slice(0, 100);
    const durMs = parseInt(req.headers['x-audio-duration-ms'] || '0', 10);
    const VALID = ['6ano','7ano','8ano','9ano','1medio','2medio','3medio'];

    if (!VALID.includes(sala)) return res.status(400).json({ error: 'Sala inválida' });
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
    if (durMs < 500 || durMs > 5500) {
      return res.status(400).json({ error: 'Duração inválida (500-5500 ms)' });
    }

    try {
      const id = nanoid(12);
      const { url } = await r2.uploadAudio(req.file.buffer, id, req.file.mimetype);
      if (!url) {
        return res.status(503).json({ error: 'R2_PUBLIC_BASE não configurado' });
      }

      const player = PLAYERS[Math.floor(Math.random() * PLAYERS.length)];
      const result = await pool.query(
        `INSERT INTO comments(sala, body, player_name, player_photo, is_pele,
                              author_name, author_sala, audio_url, audio_dur_ms, moderation)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'approved') RETURNING *`,
        [sala, '', player.name, player.photo, player.is_pele, name, sala, url, durMs]
      );
      let comment = result.rows[0];

      const ps = await pool.query(
        `SELECT goals FROM player_scores WHERE name = $1 AND sala = $2`,
        [name, sala]
      );
      const goals = ps.rows[0]?.goals ?? 0;
      const rank = rankOf(goals);
      comment = { ...comment, author_goals: goals, author_rank_label: rank.label, author_rank_color: rank.color };

      io.emit('new_comment', comment);
      res.status(201).json(comment);
    } catch (e) {
      console.error('[POST /api/comments/audio]', e.message);
      res.status(500).json({ error: 'Erro ao processar áudio' });
    }
  });
});

// ── POST /api/comments/:id/report ─────────────────────────────────────────────
app.post('/api/comments/:id/report', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });
  try {
    const result = await pool.query(
      `UPDATE comments
          SET report_count = report_count + 1,
              moderation = CASE WHEN report_count + 1 >= 3 THEN 'rejected' ELSE moderation END
        WHERE id = $1
        RETURNING id, report_count, moderation`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'não encontrado' });

    await pool.query(
      `INSERT INTO audit_log(comment_id, action, actor)
       VALUES($1, $2, $3)`,
      [id, 'report', (req.ip || 'unknown').slice(0, 80)]
    );

    if (result.rows[0].moderation === 'rejected') {
      io.emit('comment_removed', { id });
    }
    res.json(result.rows[0]);
  } catch (e) {
    console.error('[POST /api/comments/:id/report]', e.message);
    res.status(500).json({ error: 'Erro no banco' });
  }
});

// ── Admin: queue de moderação ─────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'admin only' });
  }
  next();
}

app.get('/admin/queue', requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, sala, body, audio_url, audio_dur_ms, author_name, author_sala,
              moderation, report_count, created_at
         FROM comments
        WHERE moderation = 'pending' OR report_count > 0
        ORDER BY report_count DESC, created_at DESC
        LIMIT 100`
    );
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Cartolina admin queue</title>
<style>
  body{font-family:system-ui;background:#0b0f1a;color:#eee;padding:20px;max-width:900px;margin:auto}
  .item{border:1px solid #333;border-radius:8px;padding:12px;margin-bottom:12px;background:#141a2b}
  .meta{color:#888;font-size:12px}
  .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold}
  .badge.rep{background:#dc2626}
  .badge.mod{background:#f59e0b;color:#000}
  audio{width:100%;margin:8px 0}
  button{background:#22c55e;border:0;color:#000;padding:6px 14px;border-radius:6px;cursor:pointer;font-weight:bold;margin-right:6px}
  button.reject{background:#dc2626;color:#fff}
  .body{margin:8px 0;color:#ddd}
</style></head><body>
<h1>Fila de moderação (${r.rows.length})</h1>
${r.rows.map(c => `
  <div class="item" id="c${c.id}">
    <div class="meta">
      #${c.id} · ${c.author_name || '(sem autor)'} · ${c.sala} · ${new Date(c.created_at).toLocaleString('pt-BR')}
      <span class="badge mod">${c.moderation}</span>
      ${c.report_count > 0 ? `<span class="badge rep">${c.report_count} report(s)</span>` : ''}
    </div>
    ${c.audio_url ? `<audio controls preload="metadata" src="${c.audio_url}"></audio>` : ''}
    ${c.body ? `<div class="body">${escapeHtml(c.body)}</div>` : ''}
    <button onclick="act(${c.id},'approve')">Aprovar</button>
    <button class="reject" onclick="act(${c.id},'reject')">Rejeitar</button>
  </div>
`).join('')}
<script>
const TOKEN = prompt('Admin token:');
async function act(id, action){
  const res = await fetch('/admin/comments/'+id+'/'+action, {
    method:'POST', headers:{'x-admin-token': TOKEN}
  });
  if(res.ok) document.getElementById('c'+id).style.display='none';
  else alert('falhou: '+res.status);
}
function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c])}
</script>
</body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    console.error('[GET /admin/queue]', e.message);
    res.status(500).json({ error: 'erro' });
  }
});

// Helper escape (server-side, usado pelo HTML acima)
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

app.post('/admin/comments/:id/approve', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await pool.query(
    `UPDATE comments SET moderation = 'approved', report_count = 0 WHERE id = $1`,
    [id]
  );
  await pool.query(
    `INSERT INTO audit_log(comment_id, action, actor) VALUES($1,'approve','admin')`, [id]
  );
  res.json({ ok: true });
});

app.post('/admin/comments/:id/reject', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await pool.query(
    `UPDATE comments SET moderation = 'rejected' WHERE id = $1`,
    [id]
  );
  await pool.query(
    `INSERT INTO audit_log(comment_id, action, actor) VALUES($1,'reject','admin')`, [id]
  );
  io.emit('comment_removed', { id });
  res.json({ ok: true });
});

// ── GET /api/comments/top-rooms ──────────────────────────────────────────────
app.get('/api/comments/top-rooms', async (req, res) => {
  try {
    const [pele, neymar, chico] = await Promise.all([
      pool.query(`SELECT sala, COUNT(*)::int AS count FROM comments WHERE is_pele = true GROUP BY sala ORDER BY count DESC LIMIT 1`),
      pool.query(`SELECT sala, COUNT(*)::int AS count FROM comments WHERE player_name = 'Neymar' GROUP BY sala ORDER BY count DESC LIMIT 1`),
      pool.query(`SELECT sala, COUNT(*)::int AS count FROM comments WHERE player_name = 'Chico'  GROUP BY sala ORDER BY count DESC LIMIT 1`),
    ]);
    res.json({
      pele:   pele.rows[0]   ?? null,
      neymar: neymar.rows[0] ?? null,
      chico:  chico.rows[0]  ?? null,
    });
  } catch (err) {
    console.error('[GET /api/comments/top-rooms]', err.message);
    res.status(500).json({ error: 'Erro no banco de dados' });
  }
});

// ── GET /api/comments/stats ───────────────────────────────────────────────────
app.get('/api/comments/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE is_pele = true)          AS pele,
        COUNT(*) FILTER (WHERE player_name = 'Neymar')  AS neymar,
        COUNT(*) FILTER (WHERE player_name = 'Chico')   AS chico
      FROM comments
    `);
    res.json({
      pele:   parseInt(result.rows[0].pele),
      neymar: parseInt(result.rows[0].neymar),
      chico:  parseInt(result.rows[0].chico),
    });
  } catch (err) {
    console.error('[GET /api/comments/stats]', err.message);
    res.status(500).json({ error: 'Erro no banco de dados' });
  }
});

// ── POST /api/suggestions ─────────────────────────────────────────────────────
app.post('/api/suggestions', async (req, res) => {
  const { body } = req.body;
  if (!body || typeof body !== 'string' || body.trim().length < 2) {
    return res.status(400).json({ error: 'body obrigatório (mín 2 chars)' });
  }
  try {
    await pool.query(
      'INSERT INTO suggestions(body) VALUES($1)',
      [body.trim().slice(0, 1000)]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[POST /api/suggestions]', err.message);
    res.status(500).json({ error: 'Erro no banco de dados' });
  }
});

// ── POST /api/penalty ─────────────────────────────────────────────────────────
app.post('/api/penalty', async (req, res) => {
  const { sala, name, points } = req.body;
  const VALID = ['6ano','7ano','8ano','9ano','1medio','2medio','3medio'];
  if (!sala || !VALID.includes(sala)) return res.status(400).json({ error: 'sala inválida' });
  const deduct = (typeof points === 'number' && points >= 0) ? Math.min(Math.floor(points), 100) : 2;
  if (deduct === 0) return res.json({ ok: true });
  try {
    await pool.query(
      `UPDATE scores SET goals = GREATEST(0, goals - $1), updated_at = NOW() WHERE sala = $2`,
      [deduct, sala]
    );
    if (name && typeof name === 'string') {
      const cleanName = name.trim().slice(0, 100);
      if (cleanName.length > 0) {
        await pool.query(
          `UPDATE player_scores SET goals = GREATEST(0, goals - $1), updated_at = NOW()
           WHERE name = $2 AND sala = $3`,
          [deduct, cleanName, sala]
        );
      }
    }
    logGoalEvent({
      name, sala, source: 'penalty_deduct',
      goals: -deduct, attempts: 0, ip: req.ip,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/penalty]', err.message);
    res.status(500).json({ error: 'Erro no banco' });
  }
});

// ── POST /api/award ───────────────────────────────────────────────────────────
app.post('/api/award', async (req, res) => {
  const { sala, points, name, source } = req.body;
  const VALID = ['6ano','7ano','8ano','9ano','1medio','2medio','3medio'];
  if (!sala || !VALID.includes(sala) || typeof points !== 'number' || points < 1) {
    return res.status(400).json({ error: 'sala e points obrigatórios' });
  }
  const safePoints = Math.min(points, 100);
  try {
    await pool.query(
      `UPDATE scores SET goals = goals + $1, updated_at = NOW() WHERE sala = $2`,
      [safePoints, sala]
    );
    if (name && typeof name === 'string') {
      const cleanName = name.trim().slice(0, 100);
      if (cleanName.length > 0) {
        await pool.query(
          `INSERT INTO player_scores(name, sala, goals)
           VALUES($1, $2, $3)
           ON CONFLICT(name, sala)
           DO UPDATE SET goals = player_scores.goals + $3, updated_at = NOW()`,
          [cleanName, sala, safePoints]
        );
      }
    }
    logGoalEvent({
      name, sala, source: source || 'award',
      goals: safePoints, attempts: 0, ip: req.ip,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/award]', err.message);
    res.status(500).json({ error: 'Erro no banco' });
  }
});

// ── GET /api/players/me ───────────────────────────────────────────────────────
// Query: ?name=Fulano&sala=6ano  → { goals, attempts, rank }
app.get('/api/players/me', async (req, res) => {
  const name = (req.query.name || '').toString().trim().slice(0, 100);
  const sala = (req.query.sala || '').toString().trim();
  const VALID = ['6ano','7ano','8ano','9ano','1medio','2medio','3medio'];
  if (!name || !VALID.includes(sala)) {
    return res.status(400).json({ error: 'Parâmetros: name (string), sala (válida)' });
  }
  try {
    const result = await pool.query(
      `SELECT goals, attempts FROM player_scores WHERE name = $1 AND sala = $2`,
      [name, sala]
    );
    const row = result.rows[0] || { goals: 0, attempts: 0 };
    res.json({
      name,
      sala,
      goals: row.goals,
      attempts: row.attempts,
      rank: rankOf(row.goals),
    });
  } catch (err) {
    console.error('[GET /api/players/me]', err.message);
    res.status(500).json({ error: 'Erro no banco' });
  }
});

// ── GET /api/players/scores ───────────────────────────────────────────────────
app.get('/api/players/scores', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT name, sala, goals
       FROM player_scores
       ORDER BY goals DESC, updated_at ASC
       LIMIT 50`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[GET /api/players/scores]', err.message);
    res.status(500).json({ error: 'Erro no banco' });
  }
});

// ── POST /api/comments/:id/like ───────────────────────────────────────────────
app.post('/api/comments/:id/like', async (req, res) => {
  const { id } = req.params;
  const { increment } = req.body; // true=like, false=unlike
  const delta = increment === false ? -1 : 1;
  try {
    const result = await pool.query(
      `UPDATE comments SET likes = GREATEST(0, likes + $1) WHERE id = $2 RETURNING likes`,
      [delta, parseInt(id)]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Comentário não encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[POST /api/comments/:id/like]', err.message);
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
      ('6ano',0,0),('7ano',0,0),('8ano',0,0),
      ('9ano',0,0),('1medio',0,0),('2medio',0,0),('3medio',0,0)
    ON CONFLICT (sala) DO NOTHING;

    CREATE TABLE IF NOT EXISTS questions (
      id       SERIAL PRIMARY KEY,
      text     TEXT        NOT NULL,
      opt_a    TEXT        NOT NULL,
      opt_b    TEXT        NOT NULL,
      opt_c    TEXT        NOT NULL,
      correct  CHAR(1)     NOT NULL CHECK(correct IN ('A','B','C')),
      category VARCHAR(20) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS suggestions (
      id         SERIAL PRIMARY KEY,
      body       TEXT      NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS player_scores (
      id         SERIAL PRIMARY KEY,
      name       VARCHAR(100) NOT NULL,
      sala       VARCHAR(20)  NOT NULL,
      goals      INTEGER      NOT NULL DEFAULT 0,
      attempts   INTEGER      NOT NULL DEFAULT 0,
      updated_at TIMESTAMP    NOT NULL DEFAULT NOW(),
      UNIQUE(name, sala)
    );

    CREATE INDEX IF NOT EXISTS idx_player_scores_sala_goals
      ON player_scores(sala, goals DESC);

    CREATE TABLE IF NOT EXISTS comments (
      id           SERIAL PRIMARY KEY,
      sala         VARCHAR(20)  NOT NULL,
      body         TEXT         NOT NULL,
      player_name  VARCHAR(100) NOT NULL,
      player_photo VARCHAR(500) NOT NULL,
      is_pele      BOOLEAN      NOT NULL DEFAULT FALSE,
      created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
      likes        INTEGER      NOT NULL DEFAULT 0,
      author_name  VARCHAR(100),
      author_sala  VARCHAR(20)
    );

    ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_name VARCHAR(100);
    ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_sala VARCHAR(20);

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

    -- Plano 3: áudio em comentários
    ALTER TABLE comments ADD COLUMN IF NOT EXISTS audio_url    TEXT;
    ALTER TABLE comments ADD COLUMN IF NOT EXISTS audio_dur_ms INTEGER;
    ALTER TABLE comments ADD COLUMN IF NOT EXISTS moderation   VARCHAR(16) NOT NULL DEFAULT 'approved';
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

    -- Plano 5: createdAt + log de eventos de gol para historico/telemetria
    ALTER TABLE scores        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();
    ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();

    -- Log imutavel de eventos de gol/tentativa. Permite calcular gols/min,
    -- detectar anomalias (ex: 100 gols em 1s = rajada), e auditoria.
    CREATE TABLE IF NOT EXISTS goal_events (
      id         BIGSERIAL PRIMARY KEY,
      name       VARCHAR(100),
      sala       VARCHAR(20) NOT NULL,
      source     VARCHAR(24) NOT NULL,  -- 'penalty' | 'precise' | 'arrow' | 'quiz' | 'duel' | 'admin' | 'other'
      goals      INTEGER NOT NULL DEFAULT 0,
      attempts   INTEGER NOT NULL DEFAULT 0,
      ip         VARCHAR(64),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_goal_events_created  ON goal_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_goal_events_name     ON goal_events(name, sala, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_goal_events_sala     ON goal_events(sala, created_at DESC);
  `);

  // Insere perguntas apenas se tabela estiver vazia
  const { rows: [{ count }] } = await pool.query('SELECT COUNT(*)::int AS count FROM questions');
  if (count === 0) {
    for (const q of QUESTIONS) {
      await pool.query(
        'INSERT INTO questions(text, opt_a, opt_b, opt_c, correct, category) VALUES($1,$2,$3,$4,$5,$6)',
        [q.text, q.opt_a, q.opt_b, q.opt_c, q.correct, q.category]
      );
    }
    console.log(`✅ ${QUESTIONS.length} perguntas inseridas`);
  }

  console.log('✅ Banco inicializado');
}

// ── DUEL SYSTEM ───────────────────────────────────────────────────────────────

const onlineUsers      = new Map(); // socketId → {name, sala, status, duelId}
const duelRooms        = new Map(); // duelId   → room object
const matchQueue       = [];        // [{socketId, sala}]
const disconnectedDuelMap = new Map(); // 'name:sala' → {duelId, timer}
const lastTauntAt      = new Map(); // socketId → timestamp ms

// Mensagens prontas para o duelo (provocações + comemorações)
const DUEL_TAUNTS = new Set([
  'taunt_fire', 'taunt_hurry', 'taunt_sleep', 'taunt_clown',
  'taunt_read', 'taunt_chicken',
  'celeb_goal', 'celeb_take', 'celeb_flex', 'celeb_clap',
  'celeb_gg',   'celeb_fly',
]);

function genId() { return Math.random().toString(36).slice(2, 9); }

// Throttle leading+trailing edge a 1Hz para broadcasts de presença.
// Vários connect/disconnect/status em <1s coalescem em 1 emissão final.
// Reduz custo de O(N²) por evento → O(N²) por segundo no máximo.
let _lastOnlineBroadcastAt = 0;
let _pendingOnlineBroadcast = null;

function _doBroadcastOnlineUsers() {
  const list = [...onlineUsers.values()].map(u => ({
    socketId: u.socketId, name: u.name, sala: u.sala, status: u.status,
  }));
  io.emit('duel_online_users', list);
  _lastOnlineBroadcastAt = Date.now();
}

function broadcastOnlineUsers() {
  const sinceLast = Date.now() - _lastOnlineBroadcastAt;
  if (sinceLast >= 1000) {
    // Leading edge — sai agora (responsivo no primeiro evento)
    if (_pendingOnlineBroadcast) {
      clearTimeout(_pendingOnlineBroadcast);
      _pendingOnlineBroadcast = null;
    }
    _doBroadcastOnlineUsers();
  } else if (!_pendingOnlineBroadcast) {
    // Dentro da janela — agenda trailing edge no fim do segundo
    _pendingOnlineBroadcast = setTimeout(() => {
      _pendingOnlineBroadcast = null;
      _doBroadcastOnlineUsers();
    }, 1000 - sinceLast);
  }
  // Se já tem pendente, ignora — vai sair com estado atual quando timer disparar
}

function startDuel(sid1, sid2, duelId = genId()) {
  const u1 = onlineUsers.get(sid1);
  const u2 = onlineUsers.get(sid2);
  if (!u1 || !u2) return;
  u1.status = 'in_duel'; u1.duelId = duelId;
  u2.status = 'in_duel'; u2.duelId = duelId;

  const room = {
    id: duelId,
    players: {
      [sid1]: { socketId: sid1, name: u1.name, sala: u1.sala, consecutive: 0 },
      [sid2]: { socketId: sid2, name: u2.name, sala: u2.sala, consecutive: 0 },
    },
    round: 1,
    kickerSid: sid1,
    choices: {},
    status: 'waiting',
    timer: null,
    disconnectTimers: {},
  };
  duelRooms.set(duelId, room);

  const sameSala = u1.sala === u2.sala;
  [sid1, sid2].forEach(sid => {
    const oppSid = sid === sid1 ? sid2 : sid1;
    const opp    = onlineUsers.get(oppSid);
    io.to(sid).emit('duel_start', {
      duelId, sameSala,
      opponent: { socketId: oppSid, name: opp.name, sala: opp.sala },
      kickerSid: sid1,
      round: 1,
    });
  });

  broadcastOnlineUsers();
  setTimeout(() => beginRound(duelId), 1000);
}

function beginRound(duelId) {
  const room = duelRooms.get(duelId);
  if (!room || room.status === 'ended') return;
  room.status  = 'waiting';
  room.choices = {};
  const pids   = Object.keys(room.players);

  pids.forEach(sid => {
    io.to(sid).emit('duel_round_start', {
      duelId,
      round:     room.round,
      kickerSid: room.kickerSid,
      consecutive: Object.fromEntries(pids.map(p => [p, room.players[p].consecutive])),
    });
  });

  room.timer = setTimeout(() => {
    pids.forEach(sid => {
      if (!room.choices[sid]) room.choices[sid] = Math.random() < 0.5 ? 'L' : 'R';
    });
    resolveRound(duelId);
  }, 5000);
}

function resolveRound(duelId) {
  const room = duelRooms.get(duelId);
  if (!room || room.status === 'ended') return;
  clearTimeout(room.timer); room.timer = null;

  const pids      = Object.keys(room.players);
  const keeperSid = pids.find(s => s !== room.kickerSid);
  const kChoice   = room.choices[room.kickerSid] || (Math.random() < 0.5 ? 'L' : 'R');
  const keepChoice= room.choices[keeperSid]       || (Math.random() < 0.5 ? 'L' : 'R');
  const scored    = kChoice !== keepChoice;

  const winnerId  = scored ? room.kickerSid : keeperSid;
  const loserId   = scored ? keeperSid      : room.kickerSid;

  room.players[winnerId].consecutive++;
  room.players[loserId].consecutive  = 0;

  const consecutive = Object.fromEntries(pids.map(p => [p, room.players[p].consecutive]));

  pids.forEach(sid => {
    io.to(sid).emit('duel_round_result', {
      duelId, round: room.round,
      kickerSid: room.kickerSid, keeperSid,
      kickerChoice: kChoice, keeperChoice: keepChoice,
      scored, winnerId, consecutive,
    });
  });

  if (room.players[winnerId].consecutive >= 2) {
    setTimeout(() => endDuel(duelId, winnerId, 'consecutive'), 2200);
    return;
  }

  room.round++;
  room.kickerSid = keeperSid; // alternate
  setTimeout(() => beginRound(duelId), 2500);
}

async function endDuel(duelId, winnerSid, reason) {
  const room = duelRooms.get(duelId);
  if (!room || room.status === 'ended') return;
  room.status = 'ended';
  clearTimeout(room.timer);
  Object.values(room.disconnectTimers).forEach(t => clearTimeout(t));

  const pids   = Object.keys(room.players);
  const winner = room.players[winnerSid];
  const loser  = room.players[pids.find(p => p !== winnerSid)];
  const diffSala = winner.sala !== loser.sala;
  const pts    = diffSala ? 10 : 0;

  if (diffSala) {
    try {
      await pool.query(
        'UPDATE scores SET goals = goals + $1, updated_at = NOW() WHERE sala = $2',
        [pts, winner.sala]
      );
      await pool.query(
        'UPDATE scores SET goals = GREATEST(goals - $1, 0), updated_at = NOW() WHERE sala = $2',
        [pts, loser.sala]
      );
      logGoalEvent({ name: winner.name, sala: winner.sala, source: 'duel_win',  goals:  pts });
      logGoalEvent({ name: loser.name,  sala: loser.sala,  source: 'duel_loss', goals: -pts });
    } catch(e) { console.error('[duel endDuel]', e.message); }
  }

  pids.forEach(sid => {
    io.to(sid).emit('duel_end', {
      duelId, winnerSid, reason, diffSala, pts,
      winner: { name: winner.name, sala: winner.sala },
      loser:  { name: loser.name,  sala: loser.sala  },
    });
    const u = onlineUsers.get(sid);
    if (u) { u.status = 'idle'; u.duelId = null; }
  });

  broadcastOnlineUsers();
  setTimeout(() => duelRooms.delete(duelId), 60000);
}

io.on('connection', socket => {
  socket.on('user_join', ({ name, sala }) => {
    if (!name || !sala) return;
    const key = `${name.trim().toLowerCase()}:${sala}`;

    // Reconnection to active duel?
    const pending = disconnectedDuelMap.get(key);
    if (pending) {
      clearTimeout(pending.timer);
      disconnectedDuelMap.delete(key);
      const room = duelRooms.get(pending.duelId);
      if (room && room.status !== 'ended') {
        // Re-register socket
        onlineUsers.set(socket.id, { socketId: socket.id, name: name.trim(), sala, status: 'in_duel', duelId: pending.duelId });
        // Update player socketId in room
        const oldSid = pending.oldSid;
        if (room.players[oldSid]) {
          room.players[socket.id] = { ...room.players[oldSid], socketId: socket.id };
          delete room.players[oldSid];
          if (room.kickerSid === oldSid) room.kickerSid = socket.id;
          Object.keys(room.choices).forEach(k => {
            if (k === oldSid) { room.choices[socket.id] = room.choices[k]; delete room.choices[k]; }
          });
        }
        // Notify opponent
        const oppSid = Object.keys(room.players).find(s => s !== socket.id);
        if (oppSid) io.to(oppSid).emit('duel_opponent_reconnected', { duelId: pending.duelId });
        socket.emit('duel_reconnected', { duelId: pending.duelId, room: {
          kickerSid: room.kickerSid, round: room.round,
          consecutive: Object.fromEntries(Object.entries(room.players).map(([s,p])=>[s,p.consecutive])),
        }});
        return;
      }
    }

    onlineUsers.set(socket.id, { socketId: socket.id, name: name.trim(), sala, status: 'idle', duelId: null });
    socket.join(`sala:${sala}`); // subscribe a eventos da sala
    // Envia lista atual direto pra esse socket (não espera o throttle)
    socket.emit('duel_online_users', [...onlineUsers.values()].map(u => ({
      socketId: u.socketId, name: u.name, sala: u.sala, status: u.status,
    })));
    broadcastOnlineUsers();
  });

  // Subscribe explícito a uma sala (usado pelo socket do home_screen,
  // que não chama user_join). Permite scoped broadcasts (mission_*, etc.)
  socket.on('subscribe_sala', ({ sala }) => {
    if (typeof sala !== 'string' || !sala) return;
    socket.join(`sala:${sala}`);
  });

  socket.on('duel_search_users', ({ query = '' }) => {
    const q  = query.trim().toLowerCase();
    const results = [...onlineUsers.values()]
      .filter(u => u.socketId !== socket.id && u.status === 'idle' &&
                   (q === '' || u.name.toLowerCase().includes(q)))
      .map(u => ({ socketId: u.socketId, name: u.name, sala: u.sala }));
    socket.emit('duel_search_results', results);
  });

  socket.on('duel_invite', ({ targetSocketId }) => {
    const from = onlineUsers.get(socket.id);
    const to   = onlineUsers.get(targetSocketId);
    if (!from || !to || to.status !== 'idle') return;
    const duelId = genId();
    io.to(targetSocketId).emit('duel_invite_received', {
      duelId,
      from: { socketId: socket.id, name: from.name, sala: from.sala },
    });
    // Store pending (30s expiry handled implicitly by invite_response)
  });

  socket.on('duel_invite_response', ({ duelId, fromSocketId, accepted }) => {
    const from = onlineUsers.get(fromSocketId);
    if (!accepted) {
      io.to(fromSocketId).emit('duel_invite_declined', { duelId, declinedBy: socket.id });
      return;
    }
    if (!from || from.status !== 'idle') {
      socket.emit('duel_invite_declined', { duelId, declinedBy: socket.id });
      return;
    }
    startDuel(fromSocketId, socket.id, duelId);
  });

  socket.on('duel_queue_join', () => {
    const me = onlineUsers.get(socket.id);
    if (!me || me.status !== 'idle') return;
    // Find cross-sala opponent
    const idx = matchQueue.findIndex(q => q.sala !== me.sala);
    if (idx !== -1) {
      const opp = matchQueue.splice(idx, 1)[0];
      const oppUser = onlineUsers.get(opp.socketId);
      if (oppUser) oppUser.status = 'idle';
      startDuel(socket.id, opp.socketId);
    } else {
      me.status = 'queued';
      matchQueue.push({ socketId: socket.id, sala: me.sala });
      socket.emit('duel_queued');
      broadcastOnlineUsers();
    }
  });

  socket.on('duel_queue_leave', () => {
    const idx = matchQueue.findIndex(q => q.socketId === socket.id);
    if (idx !== -1) matchQueue.splice(idx, 1);
    const me = onlineUsers.get(socket.id);
    if (me) me.status = 'idle';
    socket.emit('duel_queue_left');
    broadcastOnlineUsers();
  });

  socket.on('duel_choice', ({ duelId, choice }) => {
    const room = duelRooms.get(duelId);
    if (!room || room.status !== 'waiting' || !room.players[socket.id]) return;
    if (!['L','R'].includes(choice)) return;
    room.choices[socket.id] = choice;
    // Notify self (choice locked)
    socket.emit('duel_choice_locked', { choice });
    // Both chose?
    if (Object.keys(room.players).every(p => room.choices[p])) resolveRound(duelId);
  });

  socket.on('duel_taunt', ({ duelId, tauntId }) => {
    const me = onlineUsers.get(socket.id);
    if (!me || me.duelId !== duelId) return;
    if (typeof tauntId !== 'string' || !DUEL_TAUNTS.has(tauntId)) return;

    const now = Date.now();
    const last = lastTauntAt.get(socket.id) || 0;
    if (now - last < 1500) return; // rate limit 1.5s
    lastTauntAt.set(socket.id, now);

    const room = duelRooms.get(duelId);
    if (!room) return;
    const oppSid = Object.keys(room.players).find(s => s !== socket.id);
    if (!oppSid) return;

    io.to(oppSid).emit('duel_taunt_received', { tauntId, fromName: me.name });
  });

  socket.on('disconnect', () => {
    const me = onlineUsers.get(socket.id);
    lastTauntAt.delete(socket.id);
    if (!me) return;

    // Remove from queue
    const qi = matchQueue.findIndex(q => q.socketId === socket.id);
    if (qi !== -1) matchQueue.splice(qi, 1);

    if (me.duelId) {
      const room = duelRooms.get(me.duelId);
      if (room && room.status !== 'ended') {
        const key   = `${me.name.trim().toLowerCase()}:${me.sala}`;
        const oppSid = Object.keys(room.players).find(s => s !== socket.id);
        if (oppSid) io.to(oppSid).emit('duel_opponent_disconnected', { duelId: me.duelId, waitMs: 5000 });

        const timer = setTimeout(() => {
          disconnectedDuelMap.delete(key);
          if (oppSid) endDuel(me.duelId, oppSid, 'disconnect');
        }, 5000);

        disconnectedDuelMap.set(key, { duelId: me.duelId, oldSid: socket.id, timer });
      }
    }

    onlineUsers.delete(socket.id);
    broadcastOnlineUsers();
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
initDb()
  .then(async () => {
    await ensureTodayMissions();
    startMissionScheduler();
    server.listen(PORT, () => console.log(`⚽ Hexa Challenge API rodando na porta ${PORT}`));
  })
  .catch(err => { console.error('Falha ao iniciar:', err); process.exit(1); });
