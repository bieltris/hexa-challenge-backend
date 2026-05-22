require('dotenv').config();

const http    = require('http');
const express = require('express');
const cors    = require('cors');
const { Server } = require('socket.io');
const pool = require('./db');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*', methods: ['GET','POST'] } });
const PORT   = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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

// ── POST /api/shoot ───────────────────────────────────────────────────────────
// Body: { sala: "6ano", scored: true|false }
app.post('/api/shoot', async (req, res) => {
  const { sala, scored } = req.body;

  if (!sala || typeof scored !== 'boolean') {
    return res.status(400).json({ error: 'Campos obrigatórios: sala (string), scored (boolean)' });
  }

  const VALID_SALAS = ['6ano', '7ano', '8ano', '9ano', '1medio', '2medio', '3medio'];
  if (!VALID_SALAS.includes(sala)) {
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

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[POST /api/shoot]', err.message);
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
  const { sala, body } = req.body;
  const VALID_SALAS = ['6ano','7ano','8ano','9ano','1medio','2medio','3medio'];
  if (!sala || !body || typeof body !== 'string' || body.trim().length < 2) {
    return res.status(400).json({ error: 'Campos obrigatórios: sala, body (mín 2 chars)' });
  }
  if (!VALID_SALAS.includes(sala)) {
    return res.status(400).json({ error: 'Sala inválida' });
  }
  const player = PLAYERS[Math.floor(Math.random() * PLAYERS.length)];
  try {
    const result = await pool.query(
      `INSERT INTO comments(sala, body, player_name, player_photo, is_pele)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [sala, body.trim().slice(0, 500), player.name, player.photo, player.is_pele]
    );
    const comment = result.rows[0];
    io.emit('new_comment', comment);
    res.status(201).json(comment);
  } catch (err) {
    console.error('[POST /api/comments]', err.message);
    res.status(500).json({ error: 'Erro no banco de dados' });
  }
});

// ── GET /api/comments ─────────────────────────────────────────────────────────
app.get('/api/comments', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, sala, body, player_name, player_photo, is_pele, created_at, likes
         FROM comments
        ORDER BY is_pele DESC,
                 CASE WHEN player_name = 'Neymar'    THEN 0
                      WHEN player_name = 'Garrincha' THEN 1
                      ELSE 2 END,
                 created_at DESC
        LIMIT 200`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[GET /api/comments]', err.message);
    res.status(500).json({ error: 'Erro no banco de dados' });
  }
});

// ── GET /api/comments/stats ───────────────────────────────────────────────────
app.get('/api/comments/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE is_pele = true)          AS pele,
        COUNT(*) FILTER (WHERE player_name = 'Neymar')  AS neymar
      FROM comments
    `);
    res.json({
      pele:   parseInt(result.rows[0].pele),
      neymar: parseInt(result.rows[0].neymar),
    });
  } catch (err) {
    console.error('[GET /api/comments/stats]', err.message);
    res.status(500).json({ error: 'Erro no banco de dados' });
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

    CREATE TABLE IF NOT EXISTS comments (
      id           SERIAL PRIMARY KEY,
      sala         VARCHAR(20)  NOT NULL,
      body         TEXT         NOT NULL,
      player_name  VARCHAR(100) NOT NULL,
      player_photo VARCHAR(500) NOT NULL,
      is_pele      BOOLEAN      NOT NULL DEFAULT FALSE,
      created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
      likes        INTEGER      NOT NULL DEFAULT 0
    );
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

// ── Start ─────────────────────────────────────────────────────────────────────
initDb()
  .then(() => server.listen(PORT, () => console.log(`⚽ Hexa Challenge API rodando na porta ${PORT}`)))
  .catch(err => { console.error('Falha ao iniciar:', err); process.exit(1); });
