require('dotenv').config();
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const mysql = require('mysql2');
//const mysql = require('mysql2/promise');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const nodemailer = require('nodemailer');
const crypto = require('crypto');



// coloque isto IMEDIATAMENTE APÓS: const multer = require('multer');
const storageMemory = multer.memoryStorage();
const uploadMemory = multer({
  storage: storageMemory,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB por arquivo (ajuste se precisar)
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new Error('Apenas imagens são permitidas'), false);
    }
    cb(null, true);
  }
});



//time zone
process.env.TZ = 'America/Sao_Paulo';
// servidor HTTP  , Socket.IO
const https = require('https');

const app = express();

// Confiar apenas no proxy do Railway (1 hop) para rate limit funcionar corretamente
app.set('trust proxy', 1);

let server;

const HTTPS_ENABLED = process.env.HTTPS_ENABLED === 'false';

if (HTTPS_ENABLED) {
  const sslKeyPath = process.env.SSL_KEY_PATH || '/certs/privkey.pem';
  const sslCertPath = process.env.SSL_CERT_PATH || '/certs/fullchain.pem';

  const privateKey = fs.readFileSync(sslKeyPath, 'utf8');
  const certificate = fs.readFileSync(sslCertPath, 'utf8');

  const credentials = { key: privateKey, cert: certificate };

  const https = require('https');
  server = https.createServer(credentials, app);

  console.log("Servidor HTTPS configurado.");
} else {
  const http = require('http');
  server = http.createServer(app);

  console.log("Servidor HTTP configurado.");
}

const { Server } = require('socket.io');

const io = new Server(server, {
  cors: {
    origin: ["https://frota.inova.in"],
    methods: ["GET", "POST"],
    credentials: true
  }
});



const port = 3000;


// Se a pasta 'uploads' não existir, cria ela
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Se a pasta '.sessions' não existir, cria ela
if (!fs.existsSync('.sessions')) {
  fs.mkdirSync('.sessions');
}

// Parse MYSQL_URL para o pool principal também
const appMysqlUrl = process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL;
let poolConfig = {};

if (appMysqlUrl) {
  const url = new URL(appMysqlUrl);
  poolConfig = {
    host: url.hostname,
    user: url.username,
    password: url.password,
    database: url.pathname.substring(1),
    port: url.port || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  };
}

// Cria um pool de conexões usando MYSQL_URL parseado
const pool = mysql.createPool(poolConfig);

const util = require('util');

// Auto-executar seed se necessário (apenas na primeira inicialização)
const query = util.promisify(pool.query).bind(pool);

async function ensureTablesExist() {
  console.log('>> [INIT] Executando seed automático (sempre)...');
  try {
    // Executa o seed via spawn para sempre atualizar as tabelas
    const { spawn } = require('child_process');
    await new Promise((resolve, reject) => {
      const child = spawn('node', ['seed-database.js'], { 
        stdio: 'inherit',
        cwd: __dirname 
      });
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Seed exited with code ${code}`));
      });
    });
    console.log('>> [INIT] Seed automático executado com sucesso!');
  } catch (seedErr) {
    console.error('>> [INIT] Erro ao executar seed automático:', seedErr.message);
    // Não para o app se o seed falhar, apenas loga o erro
  }
}

// Executa verificação assíncrona
ensureTablesExist();


// compatibilidade nas requisições
const db = pool;

// ===== Início do Servidor =====
//const express = require('express');
//const app = express();


/* Inicia o servidor imediatamente; o pool cuidadas conexões

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`App rodando na porta ${PORT}`);
}); */
/*
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`App rodando na porta ${PORT}`);
});

*/

// Middleware pra checar se o usuário é admin
function isAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.role === 'admin') {
    return next();
  }
  // 403 Forbidden: não sou admin
  return res.status(403).render('oops', {
    title: 'Acesso Negado',
    layout: 'layout-oops',
    message: 'Você não tem permissão para acessar esta página. Somente administradores podem entrar.',
    linkUrl: '/',           // ou outra rota que faça sentido
    linkText: 'Voltar ao Início'
  });
}




// Config do multer pra upload de imagens
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.gif'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens PNG/JPG/GIF são permitidas'), false);
    }
  }
});
const uploadMultiple = multer({
  storage: storage,
  limits: { fileSize: 1000 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido'), false);
    }
  }
}).array('foto_km');

// Configura o EJS e define a pasta das views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

//app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const helmet = require('helmet');
//const crypto = require('crypto');

app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});



app.use(
  helmet({

    contentSecurityPolicy: false,

    crossOriginEmbedderPolicy: false
  })
);





/*
app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
  
          // Scripts de Bootstrap, jQuery, DataTables, Leaflet, Socket.IO…
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://cdn.jsdelivr.net',
            'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/js/bootstrap.bundle.min.js',
            'https://cdn.datatables.net',
            'https://code.jquery.com',
            'https://maps.googleapis.com',
            'https://maps.gstatic.com',
            'https://unpkg.com',
            'https://cdn.socket.io'
          ],
  
          // Estilos de Bootstrap, DataTables, Google Fonts, Leaflet…
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://cdn.jsdelivr.net',
            'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css',
            'https://cdn.datatables.net',
            'https://fonts.googleapis.com',
            'https://maps.googleapis.com',
            'https://unpkg.com'
          ],
  
          // Imagens: placeholders, tiles do OSM, logos e ícones
          imgSrc: [
            "'self'",
            'data:',
            'blob:',
            'https://via.placeholder.com',
            'https://maps.googleapis.com',
            'https://maps.gstatic.com',
            'https://www.inova.in',
            'https://cdn-icons-png.flaticon.com',
            'https://*.tile.openstreetmap.org'
          ],
  
          // XHR / WebSocket (socket.io no mesmo host e possíveis tiles por XHR)
          connectSrc: [
            "'self'",
            'https://maps.googleapis.com',
            'https://maps.gstatic.com',
            'wss://' + process.env.HOSTNAME,
            'https://cdn.socket.io'
          ],
  
          frameSrc: [
            "'self'",
            'https://www.google.com',
            'https://maps.googleapis.com'
          ],
  
          objectSrc: ["'none'"],
          frameAncestors: ["'self'"]
        }
      },
      crossOriginEmbedderPolicy: false
    })
  );
  */



const isProduction = process.env.NODE_ENV === 'production';

/*
app.use(session({
  secret: process.env.SECRET_SESSION,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 1 dia
    secure: HTTPS_ENABLED, // Se HTTPS, cookie só via HTTPS
    httpOnly: true,
    sameSite: HTTPS_ENABLED ? 'none' : 'lax'
  }
}));
*/

app.use(session({
  store: new FileStore({
    path: path.join(__dirname, '.sessions'),
    retries: 1,
    fileExtension: '.json',
    ttl: 24 * 60 * 60 // 1 dia (segundos)
  }),
  secret: process.env.SECRET_SESSION,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 1 dia (ms)
    secure: HTTPS_ENABLED,
    httpOnly: true,
    sameSite: HTTPS_ENABLED ? 'none' : 'lax'
  }
}));


// sanitização global POST
app.use((req, res, next) => {
  if (req.method === 'POST') {
    Object.keys(req.body).forEach(field => {
      const val = req.body[field];
      if (typeof val === 'string') {
        // escapa <, >, &, ', " e / para evitar XSS
        req.body[field] = validator.escape(val);
      }
    });
  }
  next();
});
// Rate limiting
const rateLimit = require('express-rate-limit');
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100,                  // até 10 tentativas
  message: "Muitas tentativas, aguarde 15 minutos."
});

app.use('/login', authLimiter);
app.use('/forgot-password', authLimiter);


// Body-parsers e sanitização
const { body, validationResult } = require('express-validator');
const validator = require('validator');


//app.use(multer().none());
// CSRF
const csurf = require('csurf');
const csrfProtection = csurf();
//app.use(csrfProtection);
/* Em todas as views, expor req.csrfToken()
app.use((req, res, next) => {
  
    res.locals.csrfToken = req.csrfToken();
    next();
});
*/


// Inicializa o Passport e vincula à sessão
app.use(passport.initialize());
app.use(passport.session());

// Configuração da estratégia local do Passport
passport.use(new LocalStrategy(
  { usernameField: 'email', passwordField: 'password' },
  (email, password, done) => {
    db.query("SELECT * FROM usuarios WHERE email = ?", [email], (err, results) => {
      if (err) return done(err);
      if (results.length === 0) {
        return done(null, false, { message: 'Usuário não encontrado.' });
      }
      const user = results[0];
      bcrypt.compare(password, user.senha, (err, isMatch) => {
        if (err) return done(err);
        if (isMatch) return done(null, user);
        return done(null, false, { message: 'Senha incorreta.' });
      });
    });
  }
));

// Serializa o usuário, armazenando apenas seu ID na sessão
passport.serializeUser((user, done) => {
  //console.log("Serializando usuário:", user);
  done(null, user.id);
});

// Desserializa o usuário a partir do ID armazenado, consultando o banco
passport.deserializeUser((id, done) => {
  db.query("SELECT * FROM usuarios WHERE id = ?", [id], (err, results) => {
    if (err) return done(err);
    if (results.length === 0) return done(null, false);
    //console.log("Desserializando usuário:", results[0]);
    return done(null, results[0]);
  });
});


// Middleware para garantir que o usuário esteja autenticado
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  // 401 Unauthorized: preciso estar logado
  return res.status(401).render('oops', {
    title: 'Acesso Negado',
    layout: 'layout-oops',
    message: 'Você precisa estar logado para acessar esta página.',
    linkUrl: '/login',
    linkText: 'Ir para Login'
  });
}

// so user autenticado acesso /uploads
app.use(
  '/uploads',
  isAuthenticated,  // só quem estiver logado cai aqui
  express.static(path.join(__dirname, 'uploads'))
);

// middleware de auditoria
app.use(async (req, res, next) => {
  try {

    if (!req.path.startsWith('/public') && req.user) {
      const usuario = req.user.email;
      const rota = req.originalUrl;
      const metodo = req.method;
      // detalhes do body/query:
      const detalhes = JSON.stringify({ body: req.body, query: req.query });
      await query(
        'INSERT INTO auditoria (usuario, rota, metodo, detalhes) VALUES (?, ?, ?, ?)',
        [usuario, rota, metodo, detalhes]
      );
    }
  } catch (err) {
    console.error('Erro ao gravar auditoria', err);
  }
  next();
});

// depois de app.use(session(...))
app.use((req, res, next) => {
  // expõe mensagens e limpa da sessão
  res.locals.flash = req.session.flash || {};
  delete req.session.flash;

  // helper para setar mensagens
  req.setFlash = (type, message) => {
    if (!req.session.flash) req.session.flash = {};
    if (!req.session.flash[type]) req.session.flash[type] = [];
    req.session.flash[type].push(message);
  };

  next();
});


// Rota auditoria 
app.get(
  '/auditoria',
  isAuthenticated,
  isAdmin,
  csrfProtection,
  async (req, res) => {
    try {
      const { usuario, data, rota, metodo } = req.query;
      const filtros = [];
      const valores = [];

      if (usuario) {
        filtros.push('usuario LIKE ?');
        valores.push(`%${usuario}%`);
      }
      if (data) {
        filtros.push('DATE(criado_em) = ?');
        valores.push(data);
      }
      if (rota) {
        filtros.push('rota LIKE ?');
        valores.push(`%${rota}%`);
      }
      if (metodo) {
        filtros.push('metodo = ?');
        valores.push(metodo);
      }

      const where = filtros.length
        ? 'WHERE ' + filtros.join(' AND ')
        : '';

      const logs = await query(
        `SELECT
           usuario,
           rota,
           metodo,
           detalhes,
           DATE_FORMAT(criado_em, "%d/%m/%Y %H:%i:%s") AS criado_em
         FROM auditoria
         ${where}
         ORDER BY criado_em DESC
         LIMIT 1000`,
        valores
      );

      res.render('auditoria', {
        logs,
        filtro: req.query,
        csrfToken: req.csrfToken(),
        user: req.user,
        activePage: 'auditoria'
      });
    } catch (err) {
      console.error('Erro na rota /auditoria:', err);
      res.status(500).send('Erro ao carregar auditoria');
    }
  }
);


// GET /login — gera e envia o token para a view
app.get('/login',
  csrfProtection,
  (req, res) => {
    res.render('login', {
      layout: 'login',
      csrfToken: req.csrfToken()    // passa o token aqui
    });
  }
);


async function salvarAuditoriaManual({ usuario, rota, metodo, descricao }) {
  try {
    await query(
      'INSERT INTO auditoria (usuario, rota, metodo, detalhes) VALUES (?, ?, ?, ?)',
      [usuario, rota, metodo, descricao]
    );
  } catch (err) {
    console.error('Erro ao salvar auditoria manual:', err);
  }
}


// POST /login
// POST /login
app.post('/login',
  authLimiter,
  express.urlencoded({ extended: true }),
  csrfProtection,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 })
  ],
  (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
      if (err) return next(err);
      if (!user) return res.redirect('/login');

      req.session.regenerate(async (err) => {
        if (err) return next(err);

        req.logIn(user, async (err) => {
          if (err) return next(err);

          // Armazena o timestamp de início na sessão
          req.session.startTime = Date.now();

          // Garante que o session-store persista startTime antes do redirect
          req.session.save(async (err) => {
            if (err) return next(err);

            // SALVA AUDITORIA LOGIN
            await salvarAuditoriaManual({
              usuario: user.email,
              rota: '/login',
              metodo: 'LOGIN',
              descricao: 'Usuário entrou no sistema.'
            });

            return res.redirect('/');
          });
        });
      });
    })(req, res, next);
  }
);




// GET /logout — só para quem está autenticado
app.get(
  '/logout',
  isAuthenticated,    // só entra se req.user existir
  async (req, res, next) => {
    const usuario = req.user.email;

    // Descreve claramente que foi logout manual
    await salvarAuditoriaManual({
      usuario,
      rota: '/logout',
      metodo: 'LOGOUT',
      descricao: 'Logout manual pelo usuário.'
    });

    req.logout(async (err) => {
      if (err) return next(err);

      req.session.destroy(() => {
        console.log("Sessão encerrada. Usuário deslogado manualmente.");
        authLimiter.resetKey(req.ip);
        res.redirect('/login');
      });
    });
  }
);

// Rota que captura tentativa de logout quando não autenticado (sessão inválida/expirada)
app.get('/logout', async (req, res, next) => {
  // Se chegou aqui, isAuthenticated falhou — sessão ausente/expirada
  const usuario = 'Desconhecido';
  await salvarAuditoriaManual({
    usuario,
    rota: '/logout',
    metodo: 'LOGOUT',
    descricao: 'Logout automático: sessão ausente ou expirada.'
  });

  // Não há req.logout nem destroy de sessão — simplesmente redireciona
  console.log("Tentativa de logout sem sessão ativa.");
  res.redirect('/login?expired=1');
});

// --- SESSION INFO ---
// rota GET que devolve JSON com elapsed e remaining
app.get('/session-info/json', isAuthenticated, (req, res) => {
  const now = Date.now();
  const start = req.session.startTime || now;
  const elapsedMs = now - start;
  const remainingMs = Math.max(0, req.session.cookie.maxAge - elapsedMs);

  return res.json({
    elapsed: {
      minutes: Math.floor(elapsedMs / 60000),
      seconds: Math.floor((elapsedMs % 60000) / 1000)
    },
    remaining: {
      minutes: Math.floor(remainingMs / 60000),
      seconds: Math.floor((remainingMs % 60000) / 1000)
    }
  });
});



app.get(
  '/active-sessions',
  isAuthenticated,
  isAdmin,
  csrfProtection,
  async (req, res, next) => {
    try {
      const now = Date.now();

      // Usa o wrapper de promises
      const [rows] = await pool.promise().query(
        'SELECT session_id, expires, data FROM sessions'
      );

      const sessions = [];
      for (let row of rows) {
        let sess;
        try {
          sess = JSON.parse(row.data);
        } catch {
          continue;
        }
        const userId = sess.passport?.user;
        const start = sess.startTime;
        if (!userId || !start) continue;
        sessions.push({ userId, start, expires: row.expires });
      }

      // Busca e-mails dos usuários em batch
      const userIds = [...new Set(sessions.map(s => s.userId))];
      const [users] = await pool.promise().query(
        'SELECT id, email FROM usuarios WHERE id IN (?)',
        [userIds]
      );
      const lookup = Object.fromEntries(users.map(u => [u.id, u.email]));

      // Monta o array de dados para a view
      const data = sessions.map(s => {
        const elapsedMs = now - s.start;
        const remainingMs = Math.max(0, s.expires - now);
        return {
          email: lookup[s.userId] || `#${s.userId}`,
          elapsed: `${Math.floor(elapsedMs / 60000)}m ${Math.floor((elapsedMs % 60000) / 1000)}s`,
          remaining: `${Math.floor(remainingMs / 60000)}m ${Math.floor((remainingMs % 60000) / 1000)}s`
        };
      });

      return res.render('active-sessions', {
        csrfToken: req.csrfToken(),
        user: req.user,
        activePage: 'active-sessions',
        sessions: data
      });
    } catch (err) {
      next(err);
    }
  }
);
/* Funções de notificação */

// Manda um email avisando que o veículo precisa de troca de óleo
function sendOilChangeEmail(veiculo) {
  const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
  const mailOptions = {
    to: process.env.NOTIFY_EMAIL || process.env.EMAIL_USER,
    from: process.env.EMAIL_USER,
    subject: `Troca de Óleo Necessária: ${veiculo.nome} - ${veiculo.placa}`,
    text: `O veículo ${veiculo.nome} (Placa: ${veiculo.placa}) atingiu ${veiculo.km} km, com a última troca de óleo em ${veiculo.ultimaTrocaOleo}. Bora agendar a manutenção!`
  };
  transporter.sendMail(mailOptions, (err, info) => {
    if (err) console.error("Erro ao enviar email:", err);
    else console.log("Email troca de oleo enviado:", info.response);
  });
}

// Checa se o veículo já rodou o suficiente pra precisar de troca de óleo
function checkOilChangeForVehicle(veiculo_id) {
  const query = `SELECT * FROM veiculos WHERE id = ?`;
  db.query(query, [veiculo_id], (err, results) => {
    if (err) {
      console.error("Erro na checagem de óleo:", err);
      return;
    }
    if (results.length > 0) {
      const veiculo = results[0];
      const km = Number(veiculo.km);
      const ultimaTroca = Number(veiculo.ultimaTrocaOleo);
      // console.log(`Checando veículo ${veiculo.id}: km=${km}, última troca=${ultimaTroca}, diff=${km - ultimaTroca}`);
      if ((km - ultimaTroca) >= 10000) {
        io.emit('oilChangeNotification', veiculo);
        // Também registra na tabela de notificacoes para o sininho
        try {
          const msg = `Troca de óleo necessária: ${veiculo.nome} (Placa: ${veiculo.placa}) atingiu ${km} km. Última troca: ${veiculo.ultimaTrocaOleo}.`;
          db.query(
            "INSERT INTO notificacoes (mensagem, data_hora, lida, tipo, user_id) VALUES (?, NOW(), 0, ?, ?)",
            [msg, 'oleo', null],
            (e) => { if (e) console.warn('Falha ao registrar notificação de óleo:', e); }
          );
          io.emit('newNotification', { mensagem: msg, tipo: 'oleo' });
        } catch (e) {
          console.warn('Erro ao registrar/emitir notificação de óleo:', e);
        }
        sendOilChangeEmail(veiculo);
      }
    }
  });
}



// injetar active page global caso nao tenha 

app.use((req, res, next) => {
  res.locals.activePage = res.locals.activePage || '';
  next();
});


app.use((req, res, next) => {
  //  `user` fique disponível em todas as views EJS
  res.locals.user = req.user;
  next();
});
app.use(passport.initialize());
app.use(passport.session());

//const util = require('util');
//const query = util.promisify(db.query).bind(db);

app.get('/', isAuthenticated, csrfProtection, async (req, res) => {
  try {
    // Consultas para motoristas (contagem e dados)
    const validosResult = await query(
      'SELECT COUNT(*) AS totalValidos FROM motoristas WHERE data_validade >= CURDATE()'
    );
    const invalidosResult = await query(
      'SELECT COUNT(*) AS totalInvalidos FROM motoristas WHERE data_validade < CURDATE()'
    );
    const motoristasValidosList = await query(
      'SELECT nome, email, DATE_FORMAT(data_validade, "%d/%m/%Y") AS validade FROM motoristas WHERE data_validade >= CURDATE()'
    );
    const motoristasInvalidosList = await query(
      'SELECT nome, email, DATE_FORMAT(data_validade, "%d/%m/%Y") AS validade FROM motoristas WHERE data_validade < CURDATE()'
    );

    // Consultas para veículos e outras estatísticas
    const veiculosResult = await query('SELECT * FROM veiculos');
    const totalVeiculosResult = await query('SELECT COUNT(*) AS totalVeiculos FROM veiculos');
    const totalMultasResult = await query('SELECT COUNT(*) AS totalMultas FROM multas');
    const totalUsoResult = await query('SELECT COUNT(*) AS totalUso FROM uso_veiculos');
    const totalMotoristasResult = await query(
      'SELECT COUNT(DISTINCT motorista) AS totalMotoristasAtivos FROM uso_veiculos'
    );

    // Relatório: Uso por Dia
    const usoDiaResult = await query(`
          SELECT 
            DATE(data_criacao) AS dia, 
            COUNT(*) AS totalUsoDia,
            MIN(TIME(data_criacao)) AS primeiroUso,
            MAX(TIME(data_criacao)) AS ultimoUso
          FROM uso_veiculos
          GROUP BY DATE(data_criacao)
          ORDER BY dia DESC
        `);

    // Relatório: Uso por Mês
    const usoMesResult = await query(`
          SELECT DATE_FORMAT(data_criacao, '%Y-%m') AS mes, COUNT(*) AS totalUsoMes
          FROM uso_veiculos
          GROUP BY DATE_FORMAT(data_criacao, '%Y-%m')
          ORDER BY mes DESC
        `);

    // Relatório: Uso por Ano
    const usoAnoResult = await query(`
          SELECT YEAR(data_criacao) AS ano, COUNT(*) AS totalUsoAno
          FROM uso_veiculos
          GROUP BY YEAR(data_criacao)
          ORDER BY ano DESC
        `);

    // Relatório: Total de Uso no Ano Corrente
    const currentYear = new Date().getFullYear();
    const usoAnoAtualResult = await query(
      `SELECT COUNT(*) AS totalUsoAnoAtual FROM uso_veiculos WHERE YEAR(data_criacao) = ?`,
      [currentYear]
    );

    // Relatório: Multas por Mês
    const multasMesResult = await query(`
          SELECT DATE_FORMAT(data, '%Y-%m') AS mes, COUNT(*) AS totalMultasMes
          FROM multas
          GROUP BY DATE_FORMAT(data, '%Y-%m')
          ORDER BY mes DESC
        `);

    // Relatório: Multas por Ano
    const multasAnoResult = await query(`
          SELECT YEAR(data) AS ano, COUNT(*) AS totalMultasAno
          FROM multas
          GROUP BY YEAR(data)
          ORDER BY ano DESC
        `);

    // Relatório: Multas por Motorista
    const multasMotoristaResult = await query(`
          SELECT uv.motorista, COUNT(multas.id) AS totalMultasMotorista
          FROM multas
          LEFT JOIN uso_veiculos uv ON multas.uso_id = uv.id
          GROUP BY uv.motorista
          ORDER BY totalMultasMotorista DESC
        `);

    // Relatório: Tempo de Uso por Dia
    const tempoUsoDiaResult = await query(`
          SELECT 
            DATE(data_hora_inicial) AS dia, 
            SEC_TO_TIME(SUM(TIMESTAMPDIFF(SECOND, data_hora_inicial, data_hora_final))) AS totalTempoUsoDia
          FROM uso_veiculos
          GROUP BY DATE(data_hora_inicial)
          ORDER BY dia DESC
        `);

    // Relatório: Tempo de Uso por Mês
    const tempoUsoMesResult = await query(`
          SELECT 
            DATE_FORMAT(data_hora_inicial, '%Y-%m') AS mes, 
            SEC_TO_TIME(SUM(TIMESTAMPDIFF(SECOND, data_hora_inicial, data_hora_final))) AS totalTempoUsoMes
          FROM uso_veiculos
          GROUP BY DATE_FORMAT(data_hora_inicial, '%Y-%m')
          ORDER BY mes DESC
        `);

    // Relatório: Tempo de Uso por Ano
    const tempoUsoAnoResult = await query(`
          SELECT 
            YEAR(data_hora_inicial) AS ano, 
            SEC_TO_TIME(SUM(TIMESTAMPDIFF(SECOND, data_hora_inicial, data_hora_final))) AS totalTempoUsoAno
          FROM uso_veiculos
          GROUP BY YEAR(data_hora_inicial)
          ORDER BY ano DESC
        `);

    // Relatório: Tempo de Uso por Motorista
    const tempoUsoMotoristaResult = await query(`
          SELECT 
            motorista, 
            SEC_TO_TIME(SUM(TIMESTAMPDIFF(SECOND, data_hora_inicial, data_hora_final))) AS totalTempoUsoMotorista
          FROM uso_veiculos
          GROUP BY motorista
          ORDER BY totalTempoUsoMotorista DESC
        `);

    // Manutenções pendentes
    const manutencoesPendentes = await query(`
          SELECT m.*, v.placa, v.nome as veiculo_nome 
          FROM manutencoes m
          JOIN veiculos v ON m.veiculo_id = v.id
          WHERE m.status = 'pendente'
          ORDER BY m.data_agendada ASC
        `);

    // Estatísticas de viagens utilizando a tabela uso_veiculos e a coluna "finalidade"
    // Agrupamento por Dia
    const viagensTrabalhoDiaResult = await query(`
          SELECT DATE(data_criacao) AS dia, COUNT(*) AS totalViagensTrabalho
          FROM uso_veiculos
          WHERE finalidade = 'trabalho'
          GROUP BY DATE(data_criacao)
          ORDER BY dia DESC
        `);
    const viagensPessoalDiaResult = await query(`
          SELECT DATE(data_criacao) AS dia, COUNT(*) AS totalViagensPessoal
          FROM uso_veiculos
          WHERE finalidade = 'pessoal'
          GROUP BY DATE(data_criacao)
          ORDER BY dia DESC
        `);

    // Agrupamento por Mês
    const viagensTrabalhoMesResult = await query(`
          SELECT DATE_FORMAT(data_criacao, '%Y-%m') AS mes, COUNT(*) AS totalViagensTrabalho
          FROM uso_veiculos
          WHERE finalidade = 'trabalho'
          GROUP BY DATE_FORMAT(data_criacao, '%Y-%m')
          ORDER BY mes DESC
        `);
    const viagensPessoalMesResult = await query(`
          SELECT DATE_FORMAT(data_criacao, '%Y-%m') AS mes, COUNT(*) AS totalViagensPessoal
          FROM uso_veiculos
          WHERE finalidade = 'pessoal'
          GROUP BY DATE_FORMAT(data_criacao, '%Y-%m')
          ORDER BY mes DESC
        `);

    // Agrupamento por Ano
    const viagensTrabalhoAnoResult = await query(`
          SELECT YEAR(data_criacao) AS ano, COUNT(*) AS totalViagensTrabalho
          FROM uso_veiculos
          WHERE finalidade = 'trabalho'
          GROUP BY YEAR(data_criacao)
          ORDER BY ano DESC
        `);
    const viagensPessoalAnoResult = await query(`
          SELECT YEAR(data_criacao) AS ano, COUNT(*) AS totalViagensPessoal
          FROM uso_veiculos
          WHERE finalidade = 'pessoal'
          GROUP BY YEAR(data_criacao)
          ORDER BY ano DESC
        `);

    // Estatísticas de viagens por motorista, agrupando por finalidade
    const viagensMotoristaResult = await query(`
          SELECT motorista, finalidade, COUNT(*) AS totalViagens
          FROM uso_veiculos
          WHERE finalidade IN ('trabalho', 'pessoal')
          GROUP BY motorista, finalidade
          ORDER BY motorista, totalViagens DESC
        `);



    // KM Rodados por motorista (top 10)
    const kmMotoristaResult = await query(`
    SELECT 
      motorista, 
      SUM(km_final - km_inicial) AS totalKm
    FROM uso_veiculos
    GROUP BY motorista
    ORDER BY totalKm DESC
    LIMIT 10
  `);

    // KM Rodados por viagem (últimas 10 viagens)
    const kmViagemResult = await query(`
    SELECT 
      id AS viagemId, 
      (km_final - km_inicial) AS kmViagem
    FROM uso_veiculos
    ORDER BY data_criacao DESC
    LIMIT 10
  `);

    // KM Rodados por dia (últimos 7 dias)
    const kmDiaResult = await query(`
    SELECT 
      DATE(data_criacao) AS dia, 
      SUM(km_final - km_inicial) AS totalKmDia
    FROM uso_veiculos
    WHERE data_criacao >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    GROUP BY DATE(data_criacao)
    ORDER BY dia DESC
  `);

    // KM Rodados por mês (últimos 6 meses)
    const kmMesResult = await query(`
    SELECT 
      DATE_FORMAT(data_criacao, '%Y-%m') AS mes, 
      SUM(km_final - km_inicial) AS totalKmMes
    FROM uso_veiculos
    WHERE data_criacao >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
    GROUP BY DATE_FORMAT(data_criacao, '%Y-%m')
    ORDER BY mes DESC
  `);

    // KM Rodados por ano (últimos 5 anos)
    const kmAnoResult = await query(`
    SELECT 
      YEAR(data_criacao) AS ano, 
      SUM(km_final - km_inicial) AS totalKmAno
    FROM uso_veiculos
    WHERE data_criacao >= DATE_SUB(CURDATE(), INTERVAL 5 YEAR)
    GROUP BY YEAR(data_criacao)
    ORDER BY ano DESC
  `);

    // session info
    const now = Date.now();
    const start = req.session.startTime || now;
    const elapsedMs = now - start;
    const remainingMs = Math.max(0, req.session.cookie.maxAge - elapsedMs);

    res.render('dashboard', {
      title: 'Dashboard',
      csrfToken: req.csrfToken(),
      layout: 'layout',
      activePage: 'dashboard',
      elapsed: {
        minutes: Math.floor(elapsedMs / 60000),
        seconds: Math.floor((elapsedMs % 60000) / 1000)
      },
      remaining: {
        minutes: Math.floor(remainingMs / 60000),
        seconds: Math.floor((remainingMs % 60000) / 1000)
      },
      veiculos: veiculosResult,
      user: req.user,
      totalVeiculos: totalVeiculosResult[0].totalVeiculos,
      totalMultas: totalMultasResult[0].totalMultas,
      totalUso: totalUsoResult[0].totalUso,
      totalMotoristasAtivos: totalMotoristasResult[0].totalMotoristasAtivos,
      totalMotoristasValidos: validosResult[0].totalValidos,
      totalMotoristasInvalidos: invalidosResult[0].totalInvalidos,
      motoristasValidosList,   // Lista com nome e email dos motoristas com CNH válida
      motoristasInvalidosList, // Lista com nome e email dos motoristas com CNH vencida
      usoDia: usoDiaResult,
      usoMes: usoMesResult,
      usoAno: usoAnoResult,
      totalUsoAnoAtual: usoAnoAtualResult[0].totalUsoAnoAtual,
      multasMes: multasMesResult,
      multasAno: multasAnoResult,
      multasMotorista: multasMotoristaResult,
      tempoUsoDia: tempoUsoDiaResult,             // Estatística: tempo de uso por dia
      tempoUsoMes: tempoUsoMesResult,             // Estatística: tempo de uso por mês
      tempoUsoAno: tempoUsoAnoResult,             // Estatística: tempo de uso por ano
      tempoUsoMotorista: tempoUsoMotoristaResult, // Estatística: tempo de uso por motorista
      manutencoesPendentes,   // Dados das manutenções pendentes
      // Estatísticas de viagens (usando uso_veiculos e coluna "finalidade")
      viagensTrabalhoDia: viagensTrabalhoDiaResult,
      viagensPessoalDia: viagensPessoalDiaResult,
      viagensTrabalhoMes: viagensTrabalhoMesResult,
      viagensPessoalMes: viagensPessoalMesResult,
      viagensTrabalhoAno: viagensTrabalhoAnoResult,
      viagensPessoalAno: viagensPessoalAnoResult,
      viagensMotorista: viagensMotoristaResult,
      kmMotorista: kmMotoristaResult,
      kmViagem: kmViagemResult,
      kmDia: kmDiaResult,
      kmMes: kmMesResult,
      kmAno: kmAnoResult,

    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro no servidor');
  }
});



// Tela de esqueci minha senha
app.get('/forgot-password', csrfProtection, (req, res) => {
  res.render('forgot-password', { layout: 'forgot-password', csrfToken: req.csrfToken() });
});
app.post('/forgot-password', authLimiter, csrfProtection, (req, res) => {
  const email = validator.normalizeEmail(req.body.email || '');
  if (!email) return res.status(400).send("Email é obrigatório.");

  crypto.randomBytes(20, (err, buffer) => {
    if (err) return res.status(500).send("Erro ao gerar token.");
    const token = buffer.toString('hex');
    const expires = Date.now() + 3600000; // 1 hora

    db.query("UPDATE usuarios SET password_reset_token = ?, password_reset_expires = ? WHERE email = ?", [token, expires, email], (err, result) => {
      if (err) return res.status(500).send("Erro no servidor.");
      if (result.affectedRows === 0) return res.status(400).send("Usuário não encontrado.");

      const transporter = nodemailer.createTransport({
        service: 'Gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });

      const mailOptions = {
        to: email,
        from: process.env.EMAIL_USER,
        subject: 'Redefinição de Senha',
        text: `Você pediu pra resetar sua senha.\n\n` +
          `Clica ou copia esse link no seu navegador:\n\n` +
          `http://${req.headers.host}/reset-password/${token}\n\n` +
          `Se não foi você, ignora esse email.\n`
      };

      transporter.sendMail(mailOptions, (err) => {
        if (err) return res.status(500).send("Erro ao enviar email.");
        res.send("Email enviado com instruções pra resetar sua senha.");
      });
    });
  });
});

// Tela de reset de senha
app.get('/reset-password/:token', csrfProtection, (req, res) => {
  const { token } = req.params;
  db.query("SELECT * FROM usuarios WHERE password_reset_token = ? AND password_reset_expires > ?", [token, Date.now()], (err, results) => {
    if (err) return res.status(500).send("Erro no servidor.");
    if (results.length === 0) return res.status(400).send("Token inválido ou expirado.");
    res.render('reset-password', { layout: 'reset-password', token, csrfToken: req.csrfToken() });
  });
});

// Função para checar a força da senha
function validatePasswordStrength(password) {
  // A senha deve ter no mínimo 8 caracteres, ao menos uma letra minúscula, uma maiúscula, um dígito e um caractere especial.
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#()\-_=+{}[\]|;:'",.<>\/?])[A-Za-z\d@$!%*?&#()\-_=+{}[\]|;:'",.<>\/?]{8,}$/;
  return regex.test(password);
}

app.post('/reset-password/:token', csrfProtection, (req, res) => {
  const { token } = req.params;
  const { password } = req.body;
  if (!password) return res.status(400).send("Senha é obrigatória.");

  // Checagem de senha forte
  if (!validatePasswordStrength(password)) {
    return res.status(400).send("A senha deve ter pelo menos 8 caracteres, incluindo uma letra maiúscula, uma letra minúscula, um número e um caractere especial.");
  }

  db.query("SELECT * FROM usuarios WHERE password_reset_token = ? AND password_reset_expires > ?", [token, Date.now()], (err, results) => {
    if (err) return res.status(500).send("Erro no servidor.");
    if (results.length === 0) return res.status(400).send("Token inválido ou expirado.");
    const user = results[0];

    bcrypt.hash(password, 10, (err, hash) => {
      if (err) return res.status(500).send("Erro ao atualizar senha.");
      db.query("UPDATE usuarios SET senha = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?", [hash, user.id], (err, result) => {
        if (err) return res.status(500).send("Erro ao atualizar senha.");
        res.send(`
                    <!DOCTYPE html>
                    <html lang="pt-br">
                    <head>
                      <meta charset="UTF-8">
                      <title>Senha Atualizada</title>
                      <script>
                        setTimeout(function() {
                          window.location.href = '/login';
                        }, 3000); // Redireciona após 3 segundos
                      </script>
                    </head>
                    <body style="background-color: #222; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                      <div>
                        <h1>Senha atualizada! Já pode fazer login.</h1>
                        <p>Você será redirecionado para a página de login em instantes.</p>
                      </div>
                    </body>
                    </html>
                  `);

      });
    });
  });
});


/*
app.get('/perfil', isAuthenticated, (req, res) => {
    res.render('perfil', { user: req.user });
});
app.get('/index2', isAuthenticated, (req, res) => {
    res.render('index2', { user: req.user });
}); */

/* Rotas de uso, veículos, multas, etc. */
// (A rota pra registrar uso do veículo tá comentada aqui, mas fica aí como referência)

/*
app.post('/usar/:id', isAuthenticated, upload.single('foto_km'), (req, res) => {
    // Código pra registrar uso do veículo...
});
*/

app.get('/relatorio-uso', isAuthenticated, csrfProtection, async (req, res) => {
  try {
    let usoData;
    if (req.user.role === 'user') {
      // Para usuários com role "user", filtra os registros pelo email ou outro identificador
      usoData = await query(
        'SELECT * FROM uso_veiculos WHERE motorista = ? ORDER BY data_criacao DESC',
        [req.user.email]
      );
    } else {
      // Para administradores, traz todos os registros
      usoData = await query(
        'SELECT * FROM uso_veiculos ORDER BY data_criacao DESC'
      );
    }

    res.render('relatorio_uso', {
      title: 'Relatório de uso de veículos',
      csrfToken: req.csrfToken(),
      layout: 'layout',
      activePage: 'relatorio_uso',
      user: req.user,
      usoData: usoData
    });
  } catch (err) {
    console.error('Erro ao buscar registros de uso:', err);
    res.status(500).send('Erro no servidor ao obter relatório de uso.');
  }
});

app.get('/api/relatorio-uso', isAuthenticated, csrfProtection, (req, res) => {
  // Parâmetros do DataTables
  let draw = req.query.draw || 0;
  let start = parseInt(req.query.start) || 0;
  let length = parseInt(req.query.length) || 10;
  let searchValue = req.query.search ? req.query.search.value : '';

  // Mapeamento dos índices para as colunas ordenáveis (conforme ordem visual)
  let columns = [
    null,
    'veiculos.placa',
    'uso_veiculos.motorista',
    'uso_veiculos.km_inicial',
    'uso_veiculos.km_final',
    'uso_veiculos.finalidade', // novo campo
    'uso_veiculos.descricao',  // novo campo
    'data_hora_inicial',
    'data_hora_final',
    'data_criacao'
  ];

  // Parâmetros para ordenação
  let orderColumnIndex = 1; // padrão
  let orderDir = 'asc'; // padrão
  if (req.query.order && req.query.order[0]) {
    orderColumnIndex = parseInt(req.query.order[0].column);
    orderDir = req.query.order[0].dir || 'asc';
  }
  if (orderColumnIndex < 1 || orderColumnIndex > 9) {
    orderColumnIndex = 7; // padrão: data_hora_inicial
  }
  let orderColumn = columns[orderColumnIndex] || 'data_hora_inicial';

  // Constrói a cláusula WHERE base:
  // Se o usuário for "user", restringe os registros ao email do motorista (ou outro identificador)
  let whereClause = '';
  let params = [];
  if (req.user.role === 'user') {
    whereClause = 'WHERE uso_veiculos.motorista = ?';
    params.push(req.user.email);
  }

  // Se existir termo de busca, adiciona à cláusula WHERE utilizando AND se já houver filtro
  if (searchValue) {
    const searchCondition = ` (veiculos.placa LIKE ? OR uso_veiculos.motorista LIKE ? OR uso_veiculos.km_inicial LIKE ? OR uso_veiculos.km_final LIKE ? OR uso_veiculos.finalidade LIKE ? OR uso_veiculos.descricao LIKE ? OR uso_veiculos.id LIKE ?)`;
    if (whereClause) {
      whereClause += ' AND' + searchCondition;
    } else {
      whereClause = 'WHERE' + searchCondition;
    }
    const searchParam = '%' + searchValue + '%';
    // Adiciona os parâmetros de busca (7 vezes)
    params.push(searchParam, searchParam, searchParam, searchParam, searchParam, searchParam, searchParam);
  }

  // Consulta principal (com joins e agrupamento)
  let sql = `
       SELECT uso_veiculos.*, 
              veiculos.placa, 
              uso_veiculos.data_criacao, 
              GROUP_CONCAT(multas.multa SEPARATOR ", ") AS multas
       FROM uso_veiculos
       JOIN veiculos ON uso_veiculos.veiculo_id = veiculos.id
       LEFT JOIN multas ON uso_veiculos.id = multas.uso_id
       ${whereClause}
       GROUP BY uso_veiculos.id
       ORDER BY ${orderColumn} ${orderDir}
       LIMIT ? OFFSET ?
     `;
  // Adiciona os parâmetros para LIMIT e OFFSET
  params.push(length, start);

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error("Erro na consulta principal:", err);
      return res.status(500).json({ error: "Erro na consulta principal" });
    }

    // Consulta para a contagem dos registros filtrados
    let countSql = `
         SELECT COUNT(DISTINCT uso_veiculos.id) AS total 
         FROM uso_veiculos
         JOIN veiculos ON uso_veiculos.veiculo_id = veiculos.id
         LEFT JOIN multas ON uso_veiculos.id = multas.uso_id
         ${whereClause}
       `;
    // Os parâmetros para contagem são os mesmos que os usados para a condição WHERE
    let countParams = [];
    if (req.user.role === 'user') {
      countParams.push(req.user.email);
    }
    if (searchValue) {
      const searchParam = '%' + searchValue + '%';
      countParams.push(searchParam, searchParam, searchParam, searchParam, searchParam, searchParam, searchParam);
    }

    db.query(countSql, countParams, (err, countResult) => {
      if (err) {
        console.error("Erro na consulta de contagem filtrada:", err);
        return res.status(500).json({ error: "Erro na consulta de contagem filtrada" });
      }
      let totalRecords = countResult[0].total;

      // Consulta para o total de registros sem filtro:

      let totalSql = '';
      let totalParams = [];
      if (req.user.role === 'user') {
        totalSql = 'SELECT COUNT(*) AS total FROM uso_veiculos WHERE motorista = ?';
        totalParams.push(req.user.email);
      } else {
        totalSql = 'SELECT COUNT(*) AS total FROM uso_veiculos';
      }
      db.query(totalSql, totalParams, (err, totalResult) => {
        if (err) {
          console.error("Erro na consulta de contagem total:", err);
          return res.status(500).json({ error: "Erro na consulta de contagem total" });
        }
        let totalRecordsUnfiltered = totalResult[0].total;
        res.json({
          draw: parseInt(draw),
          recordsTotal: totalRecordsUnfiltered,
          recordsFiltered: totalRecords,
          data: results
        });
      });
    });
  });
});


////////////////////////////////////INICIO REGISTRAR VECULO//////////////////////////////////////////////////////////////////


// GET /registrar-veiculo — busca lista de devices e exibe o formulário
app.get(
  '/registrar-veiculo',
  isAuthenticated,
  isAdmin,
  csrfProtection,
  async (req, res) => {
    try {
      // traz do banco GPS todos os dispositivos disponíveis
      const devices = await queryGps(
        `SELECT dev_id, dev_name
           FROM devices
          ORDER BY dev_name`
      );
      res.render('registrar-veiculo', {
        layout: 'layout',
        title: 'Registrar veículo',
        activePage: 'registrar-veiculo',
        user: req.user,
        csrfToken: req.csrfToken(),
        devices,               // lista de GPS
        errors: [],       // sem erros inicialmente
        errorFields: [],       // nenhum campo marcado
        data: {}        // valores vazios
      });
    } catch (err) {
      console.error('Erro ao buscar dispositivos GPS:', err);
      res.status(500).send('Erro interno ao carregar formulário');
    }
  }
);

// POST /registrar-veiculo — valida e grava, incluindo o device_id
// POST /registrar-veiculo — valida e grava, incluindo todos os campos novos (sem "emUsoPor")
// GET /registrar-veiculo — busca lista de devices e exibe o formulário
app.get(
  '/registrar-veiculo',
  isAuthenticated,
  isAdmin,
  csrfProtection,
  async (req, res) => {
    try {
      // traz do banco GPS todos os dispositivos disponíveis
      const devices = await queryGps(
        `SELECT dev_id, dev_name
           FROM devices
          ORDER BY dev_name`
      );

      res.render('registrar-veiculo', {
        layout: 'layout',
        title: 'Registrar veículo',
        activePage: 'registrar-veiculo',
        user: req.user,
        csrfToken: req.csrfToken(),
        devices,               // lista de GPS
        errors: [],            // sem erros inicialmente
        errorFields: [],       // nenhum campo marcado
        data: {}               // valores vazios
      });
    } catch (err) {
      console.error('Erro ao buscar dispositivos GPS:', err);
      res.status(500).send('Erro interno ao carregar formulário');
    }
  }
);



// POST /registrar-veiculo — valida e grava, agora com imagens (frente/traseira/banco)
// Nota: upload.fields(...) DEVE ficar antes do csrfProtection
// POST /registrar-veiculo — valida e grava, agora com imagens (frente/traseira/banco)

app.post(
  '/registrar-veiculo',
  isAuthenticated,
  // multer EM MEMÓRIA ANTES do csrfProtection
  uploadMemory.fields([
    { name: 'foto_frente', maxCount: 1 },
    { name: 'foto_traseira', maxCount: 1 },
    { name: 'foto_banco', maxCount: 1 }
  ]),
  isAdmin,
  csrfProtection,
  async (req, res) => {
    try {
      // campos do form (req.body está preenchido pelo multer)
      const {
        nome,
        placa,
        km,
        ultimaTrocaOleo,
        modelo,
        ano,
        cor,
        device_id,
        marca,
        dispositivo,
        renavam,
        chassi,
        ano_fabricacao,
        ano_modelo,
        tipologia,
        licenciamento,
        seguro_dpvat,
        crlv,
        status_ipva,
        tipo_combustivel,
        capacidade_carga,
        capacidade_passageiros,
        potencia_motor,
        dimensoes,
        calibragem_pneus,
        venc_extintor,
        venc_triangulo,
        venc_colete
      } = req.body;

      // arquivos (buffers) — multer populou req.files
      const fotoFrenteFile = req.files?.foto_frente?.[0] || null;
      const fotoTraseiraFile = req.files?.foto_traseira?.[0] || null;
      const fotoBancoFile = req.files?.foto_banco?.[0] || null;

      const foto_frente = fotoFrenteFile ? fotoFrenteFile.buffer : null;
      const foto_traseira = fotoTraseiraFile ? fotoTraseiraFile.buffer : null;
      const foto_banco = fotoBancoFile ? fotoBancoFile.buffer : null;

      // Validação básica dos obrigatórios
      const missing = [];
      const errorFields = [];

      if (!nome || !String(nome).trim()) { missing.push('Nome é obrigatório'); errorFields.push('nome'); }
      if (!placa || !String(placa).trim()) { missing.push('Placa é obrigatória'); errorFields.push('placa'); }
      if (km === undefined || km === null || String(km).trim() === '') { missing.push('KM é obrigatório'); errorFields.push('km'); }
      if (ultimaTrocaOleo === undefined || ultimaTrocaOleo === null || String(ultimaTrocaOleo).trim() === '') { missing.push('Última Troca de Óleo é obrigatória'); errorFields.push('ultimaTrocaOleo'); }
      if (!modelo || !String(modelo).trim()) { missing.push('Modelo é obrigatório'); errorFields.push('modelo'); }

      // tenta limpar ano caso venha em formato FIPE (ex: "2014-5")
      let anoClean = ano;
      if (ano !== undefined && ano !== null && String(ano).trim() !== '') {
        const s = String(ano).trim();
        const firstPart = s.split(/[-\/\s]/)[0];
        const digits = firstPart.replace(/\D/g, '');
        anoClean = digits ? parseInt(digits, 10) : ano;
      }
      if ((anoClean === undefined || anoClean === null || String(anoClean).trim() === '')) {
        missing.push('Ano é obrigatório');
        errorFields.push('ano');
      }

      if (!cor || !String(cor).trim()) { missing.push('Cor é obrigatória'); errorFields.push('cor'); }
      if (!device_id || String(device_id).trim() === '') { missing.push('Dispositivo GPS é obrigatório'); errorFields.push('device_id'); }

      if (missing.length) {
        // busca devices para re-render (se falhar, renderiza sem devices)
        let devices = [];
        try {
          const [rows] = await db.promise().query('SELECT * FROM devices');
          devices = rows || [];
        } catch (innerErr) {
          console.error('Erro ao buscar devices para re-render:', innerErr);
        }

        return res.status(400).render('registrar-veiculo', {
          layout: 'layout',
          title: 'Registrar veículo',
          activePage: 'registrar-veiculo',
          user: req.user,
          csrfToken: req.csrfToken(),
          devices,
          errors: missing,
          errorFields,
          data: req.body
        });
      }

      // helper normalize para datas vazias
      const normalize = v => (v === '' ? null : v);

      // --- Nova lógica: resolver nome_marca e nome_modelo (via FIPE quando for código) ---
      const BASE_FIPE = 'https://parallelum.com.br/fipe/api/v1';
      let nome_marca = null;
      let nome_modelo = null;

      async function resolveFipeNames(marcaVal, modeloVal) {
        // tenta resolver nomes usando a API FIPE; faz fallback para os valores recebidos
        try {
          if (!marcaVal) return { nome_marca: null, nome_modelo: null };

          const marcaIsCode = /^[0-9]+$/.test(String(marcaVal).trim());
          const modeloIsCode = /^[0-9]+$/.test(String(modeloVal || '').trim());

          // resolve nome da marca
          if (marcaIsCode) {
            try {
              const resp = await axios.get(`${BASE_FIPE}/carros/marcas`);
              const marcas = Array.isArray(resp.data) ? resp.data : [];
              const found = marcas.find(m => String(m.codigo) === String(marcaVal) || String(m.id) === String(marcaVal));
              if (found && (found.nome || found.name)) nome_marca = found.nome || found.name || null;
            } catch (e) {
              console.warn('FIPE: falha ao buscar lista de marcas', e && e.message);
            }
          } else {
            // já veio o nome
            nome_marca = marcaVal || null;
          }

          // resolve nome do modelo (se possível)
          if (modeloVal) {
            if (modeloIsCode && marcaIsCode) {
              try {
                const resp = await axios.get(`${BASE_FIPE}/carros/marcas/${marcaVal}/modelos`);
                const modelos = Array.isArray(resp.data) ? resp.data : (Array.isArray(resp.data.modelos) ? resp.data.modelos : []);
                const foundM = modelos.find(m => String(m.codigo) === String(modeloVal) || String(m.id) === String(modeloVal));
                if (foundM && (foundM.nome || foundM.name || foundM.modelName)) nome_modelo = foundM.nome || foundM.name || foundM.modelName || null;
              } catch (e) {
                console.warn('FIPE: falha ao buscar modelos da marca', marcaVal, e && e.message);
              }
            } else {
              // já veio como nome do modelo
              nome_modelo = modeloVal || null;
            }
          }

          // fallback para os valores recebidos quando não conseguiu resolver via FIPE
          if (!nome_marca && marcaVal) nome_marca = String(marcaVal).trim();
          if (!nome_modelo && modeloVal) nome_modelo = String(modeloVal).trim();

          return { nome_marca, nome_modelo };
        } catch (e) {
          console.warn('Erro inesperado ao resolver FIPE names:', e && e.message);
          return { nome_marca: (marca || null), nome_modelo: (modelo || null) };
        }
      }

      try {
        const resolved = await resolveFipeNames(marca, modelo);
        nome_marca = resolved.nome_marca;
        nome_modelo = resolved.nome_modelo;
      } catch (e) {
        console.warn('Erro resolvendo FIPE (fallback):', e && e.message);
        nome_marca = marca || null;
        nome_modelo = modelo || null;
      }

      // SQL: agora com 33 placeholders (28 originais + 3 imagens + 2 nomes FIPE)
      const insertSql = `INSERT INTO veiculos
  (
    nome, placa, km, ultimaTrocaOleo, modelo, nome_modelo, ano, cor,
    device_id, marca, nome_marca, dispositivo, renavam, chassi,
    ano_fabricacao, ano_modelo, tipologia,
    licenciamento, seguro_dpvat, crlv, status_ipva,
    tipo_combustivel, capacidade_carga, capacidade_passageiros,
    potencia_motor, dimensoes,
    calibragem_pneus, venc_extintor, venc_triangulo, venc_colete,
    foto_frente, foto_traseira, foto_banco
  )
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

      const params = [
        String(nome).trim(),                                  // nome
        String(placa).trim(),                                 // placa
        isNaN(Number(km)) ? km : Number(km),                 // km
        isNaN(Number(ultimaTrocaOleo)) ? ultimaTrocaOleo : Number(ultimaTrocaOleo), // ultimaTrocaOleo
        String(modelo || '').trim(),                         // modelo (valor recebido, código ou nome)
        (nome_modelo ? String(nome_modelo).trim() : null),   // nome_modelo (resolvido FIPE)
        anoClean,                                            // ano
        String(cor).trim(),                                  // cor
        device_id,                                           // device_id
        marca || null,                                       // marca (valor recebido: código ou nome)
        (nome_marca ? String(nome_marca).trim() : null),     // nome_marca (resolvido FIPE)
        dispositivo || null,                                 // dispositivo
        renavam || null,
        chassi || null,
        ano_fabricacao || null,
        ano_modelo || null,
        tipologia || null,
        normalize(licenciamento),
        normalize(seguro_dpvat),
        normalize(crlv),
        status_ipva || null,
        tipo_combustivel || null,
        capacidade_carga || null,
        capacidade_passageiros || null,
        potencia_motor || null,
        dimensoes || null,
        calibragem_pneus || null,
        normalize(venc_extintor),
        normalize(venc_triangulo),
        normalize(venc_colete),
        foto_frente,
        foto_traseira,
        foto_banco
      ];

      // DEBUG
      console.log('>>> Registrar Veículo: placeholders =', (insertSql.match(/\?/g) || []).length, 'params =', params.length);
      if ((insertSql.match(/\?/g) || []).length !== params.length) {
        console.error('Mismatch placeholders vs params length! Aborting INSERT.');
        return res.status(500).send('Erro interno: mismatch SQL params.');
      }

      // executa insert
      db.query(insertSql, params, async (err, result) => {
        if (err) {
          console.error('Erro ao registrar veículo:', err);

          db.promise().query('SELECT * FROM devices')
            .then(([devices]) => {
              return res.status(500).render('registrar-veiculo', {
                layout: 'layout',
                title: 'Registrar veículo',
                activePage: 'registrar-veiculo',
                user: req.user,
                csrfToken: req.csrfToken(),
                devices,
                errors: ['Erro ao registrar veículo. Por favor, tente novamente.'],
                errorFields: [],
                data: req.body
              });
            })
            .catch((fetchErr) => {
              console.error('Erro ao buscar devices após falha no INSERT:', fetchErr);
              return res.status(500).render('registrar-veiculo', {
                layout: 'layout',
                title: 'Registrar veículo',
                activePage: 'registrar-veiculo',
                user: req.user,
                csrfToken: req.csrfToken(),
                devices: [],
                errors: ['Erro ao registrar veículo. Por favor, tente novamente.'],
                errorFields: [],
                data: req.body
              });
            });

          return;
        }

        // 🚀 Inserção das manutenções padrão — agora em manutencoes_manuais com objetos compatíveis com a tabela
        try {
          const veiculoId = result.insertId;

          // cada objeto já tem os nomes dos campos da tabela manutencoes_manuais
          const defaults = [
            { tipo: 'Troca do Óleo do Motor', descricao: 'Troca do óleo conforme especificação do fabricante', prioridade: 'media', status: 'pendente', km_agendado: 10000 },
            { tipo: 'Troca do Filtro de Óleo', descricao: 'Substituição do filtro de óleo', prioridade: 'media', status: 'pendente', km_agendado: 10000 },
            { tipo: 'Troca do Filtro de Ar (motor)', descricao: 'Troca do filtro de ar do motor', prioridade: 'media', status: 'pendente', km_agendado: 15000 },
            { tipo: 'Troca do Filtro de Combustível', descricao: 'Troca do filtro de combustível', prioridade: 'media', status: 'pendente', km_agendado: 15000 },
            { tipo: 'Troca do Filtro de Cabine (pólen)', descricao: 'Troca do filtro de cabine / pólen', prioridade: 'media', status: 'pendente', km_agendado: 15000 },
            { tipo: 'Troca das Velas de Ignição', descricao: 'Substituição das velas conforme quilometragem', prioridade: 'media', status: 'pendente', km_agendado: 20000 },
            { tipo: 'Inspeção/Limpeza dos Injetores', descricao: 'Limpeza e teste dos injetores', prioridade: 'media', status: 'pendente', km_agendado: 30000 },
            { tipo: 'Limpeza do TBI / Corpo de Borboleta', descricao: 'Limpeza do corpo de borboleta/TBI', prioridade: 'media', status: 'pendente', km_agendado: 30000 },
            { tipo: 'Troca da Correia Dentada', descricao: 'Substituição da correia dentada', prioridade: 'alta', status: 'pendente', km_agendado: 60000 },
            { tipo: 'Troca da Correia Alternador/Serpentina', descricao: 'Substituição da correia serpentina/alternador', prioridade: 'media', status: 'pendente', km_agendado: 60000 },

            { tipo: 'Tensionador/Polias (inspeção/substituição)', descricao: 'Verificar e substituir tensionadores/polias se necessário', prioridade: 'media', status: 'pendente', km_agendado: 60000 },
            { tipo: 'Troca do Óleo da Transmissão', descricao: 'Troca do óleo da transmissão (AT/MT)', prioridade: 'media', status: 'pendente', km_agendado: 60000 },
            { tipo: 'Troca do Fluido do Diferencial', descricao: 'Troca do fluido do diferencial', prioridade: 'media', status: 'pendente', km_agendado: 60000 },
            { tipo: 'Troca do Fluido da Caixa de Transferência', descricao: 'Troca do fluido da caixa de transferência (4x4)', prioridade: 'media', status: 'pendente', km_agendado: 60000 },
            { tipo: 'Troca do Fluido de Freio', descricao: 'Troca do fluido de freio', prioridade: 'media', status: 'pendente', km_agendado: 40000 },
            { tipo: 'Troca do Líquido de Arrefecimento', descricao: 'Troca do coolant / revisão do sistema de arrefecimento', prioridade: 'media', status: 'pendente', km_agendado: 40000 },
            { tipo: 'Troca do Líquido da Direção Hidráulica', descricao: 'Troca do fluido da direção hidráulica', prioridade: 'media', status: 'pendente', km_agendado: 30000 },
            { tipo: 'Inspeção da Bateria', descricao: 'Teste de carga e inspeção da bateria', prioridade: 'baixa', status: 'pendente', km_agendado: 12000 },
            { tipo: 'Substituição da Bateria', descricao: 'Troca da bateria quando necessário', prioridade: 'media', status: 'pendente', km_agendado: 60000 },
            { tipo: 'Verificação de Cabos e Correias', descricao: 'Inspeção de cabos e correias auxiliares', prioridade: 'baixa', status: 'pendente', km_agendado: 20000 },

            { tipo: 'Inspeção do Sistema de Escape', descricao: 'Cheque de vazamentos, suportes e silencioso', prioridade: 'baixa', status: 'pendente', km_agendado: 30000 },
            { tipo: 'Revisão do Sistema Elétrico / Fusíveis', descricao: 'Verificar fusíveis e circuitos elétricos', prioridade: 'baixa', status: 'pendente', km_agendado: 20000 },
            { tipo: 'Pastilhas de Freio (Dianteiras)', descricao: 'Inspeção/troca de pastilhas dianteiras', prioridade: 'media', status: 'pendente', km_agendado: 20000 },
            { tipo: 'Pastilhas de Freio (Traseiras)', descricao: 'Inspeção/troca de pastilhas traseiras', prioridade: 'media', status: 'pendente', km_agendado: 20000 },
            { tipo: 'Discos de Freio', descricao: 'Inspeção/substituição de discos', prioridade: 'media', status: 'pendente', km_agendado: 30000 },
            { tipo: 'Alinhamento e Balanceamento', descricao: 'Alinhamento e balanceamento das rodas', prioridade: 'media', status: 'pendente', km_agendado: 10000 },
            { tipo: 'Rodízio de Pneus', descricao: 'Rodízio e inspeção de desgaste dos pneus', prioridade: 'media', status: 'pendente', km_agendado: 10000 },
            { tipo: 'Troca de Pneus', descricao: 'Substituição de pneus desgastados', prioridade: 'alta', status: 'pendente', km_agendado: 40000 },
            { tipo: 'Verificação/Calibragem Pneus (TPMS)', descricao: 'Verificar pressão e sensores TPMS', prioridade: 'baixa', status: 'pendente', km_agendado: 5000 },
            { tipo: 'Inspeção da Suspensão e Amortecedores', descricao: 'Inspeção de suspensão e amortecedores', prioridade: 'media', status: 'pendente', km_agendado: 20000 },

            { tipo: 'Substituição de Amortecedores', descricao: 'Troca de amortecedores quando gasto', prioridade: 'media', status: 'pendente', km_agendado: 60000 },
            { tipo: 'Inspeção de Buchas e Coxins', descricao: 'Verificar buchas, coxins e buchas de direção', prioridade: 'media', status: 'pendente', km_agendado: 20000 },
            { tipo: 'Verificação de Rolamentos de Roda', descricao: 'Checar folgas e ruídos em rolamentos', prioridade: 'media', status: 'pendente', km_agendado: 30000 },
            { tipo: 'Inspeção do Sistema de Arrefecimento', descricao: 'Verificar mangueiras, termostato e conexões', prioridade: 'media', status: 'pendente', km_agendado: 20000 },
            { tipo: 'Limpeza/Verificação do Radiador', descricao: 'Limpeza e inspeção do radiador', prioridade: 'media', status: 'pendente', km_agendado: 40000 },
            { tipo: 'Inspeção do Sistema de Ignição', descricao: 'Verificar bobinas, cabos e conexões', prioridade: 'media', status: 'pendente', km_agendado: 20000 },
            { tipo: 'Verificação/Serviço da Embreagem', descricao: 'Inspeção do platô, disco e rolamento', prioridade: 'media', status: 'pendente', km_agendado: 60000 },
            { tipo: 'Serviço na Caixa de Câmbio', descricao: 'Manutenção preventiva na transmissão', prioridade: 'media', status: 'pendente', km_agendado: 80000 },
            { tipo: 'Serviço no Diferencial', descricao: 'Revisão preventiva do diferencial', prioridade: 'media', status: 'pendente', km_agendado: 80000 },
            { tipo: 'Revisão do Sistema de Injeção', descricao: 'Checagem profunda do sistema de injeção', prioridade: 'media', status: 'pendente', km_agendado: 30000 },

            { tipo: 'Limpeza do Filtro DPF (diesel)', descricao: 'Limpeza do DPF quando aplicável', prioridade: 'media', status: 'pendente', km_agendado: 80000 },
            { tipo: 'Verificação AdBlue (diesel SCR)', descricao: 'Verificar nível e sistema AdBlue', prioridade: 'baixa', status: 'pendente', km_agendado: 10000 },
            { tipo: 'Inspeção e Limpeza do A/C', descricao: 'Limpeza do sistema de ar-condicionado', prioridade: 'media', status: 'pendente', km_agendado: 20000 },
            { tipo: 'Recarga de Gás do Ar-condicionado', descricao: 'Recarga do fluido do A/C', prioridade: 'media', status: 'pendente', km_agendado: 20000 },
            { tipo: 'Troca do Compressor / Componentes A/C', descricao: 'Substituição de compressor e peças do A/C', prioridade: 'media', status: 'pendente', km_agendado: 60000 },
            { tipo: 'Verificação do Sistema de Direção', descricao: 'Cheque caixa, terminais e folgas', prioridade: 'media', status: 'pendente', km_agendado: 20000 },
            { tipo: 'Reparo/Substituição da Caixa de Direção', descricao: 'Troca ou reparo da caixa de direção', prioridade: 'alta', status: 'pendente', km_agendado: 80000 },
            { tipo: 'Inspeção do Sistema de Segurança', descricao: 'Checar airbags, cintos e sensores', prioridade: 'alta', status: 'pendente', km_agendado: 30000 },
            { tipo: 'Verificação/Limpeza de Faróis', descricao: 'Ajuste e limpeza dos faróis', prioridade: 'baixa', status: 'pendente', km_agendado: 10000 },
            { tipo: 'Substituição de Lâmpadas', descricao: 'Troca de lâmpadas queimadas', prioridade: 'baixa', status: 'pendente', km_agendado: 10000 },

            { tipo: 'Troca de Palhetas do Para-brisa', descricao: 'Substituição das palhetas', prioridade: 'baixa', status: 'pendente', km_agendado: 10000 },
            { tipo: 'Verificação de Nível e Vazamentos', descricao: 'Checar níveis e possíveis vazamentos', prioridade: 'baixa', status: 'pendente', km_agendado: 5000 },
            { tipo: 'Revisão Geral Pré-viagem', descricao: 'Checklist pré-viagem (fluídos, pneus, luzes)', prioridade: 'baixa', status: 'pendente', km_agendado: 5000 },
            { tipo: 'Inspeção de Corrosão e Proteção', descricao: 'Verificar corrosão e realizar proteção', prioridade: 'baixa', status: 'pendente', km_agendado: 20000 },
            { tipo: 'Lubrificação de Portas e Travas', descricao: 'Lubrificar dobradiças, travas e borrachas', prioridade: 'baixa', status: 'pendente', km_agendado: 15000 },
            { tipo: 'Verificação do Freio de Estacionamento', descricao: 'Ajuste e inspeção do freio de estacionamento', prioridade: 'baixa', status: 'pendente', km_agendado: 20000 },
            { tipo: 'Verificação do Sistema de Emissões', descricao: 'Checar sensores O2, EGR e emissões', prioridade: 'media', status: 'pendente', km_agendado: 30000 },
            { tipo: 'Substituição do Sensor de Oxigênio (O2)', descricao: 'Troca do sensor O2 quando necessário', prioridade: 'media', status: 'pendente', km_agendado: 60000 },
            { tipo: 'Verificação/Manutenção do Catalisador', descricao: 'Inspeção do catalisador e desempenho', prioridade: 'media', status: 'pendente', km_agendado: 100000 },
            { tipo: 'Inspeção e Limpeza do Sistema de Admissão', descricao: 'Limpeza do coletor e corpo de admissão', prioridade: 'media', status: 'pendente', km_agendado: 30000 },

            { tipo: 'Verificação do Alternador', descricao: 'Teste e inspeção do alternador', prioridade: 'media', status: 'pendente', km_agendado: 60000 },
            { tipo: 'Verificação do Motor de Partida', descricao: 'Teste do motor de partida', prioridade: 'media', status: 'pendente', km_agendado: 60000 },
            { tipo: 'Checagem/Atualização de Software (ECU)', descricao: 'Verificar atualizações e recalibração da ECU', prioridade: 'media', status: 'pendente', km_agendado: 50000 },
            { tipo: 'Inspeção de Cabos e Conexões', descricao: 'Limpeza e aperto de terminais da bateria e cabos', prioridade: 'baixa', status: 'pendente', km_agendado: 10000 },
            { tipo: 'Teste e Limpeza de Terminais', descricao: 'Limpeza de terminais e prevenção de oxidação', prioridade: 'baixa', status: 'pendente', km_agendado: 10000 },
            { tipo: 'Check-up de Segurança', descricao: 'Verificação de itens básicos de segurança', prioridade: 'baixa', status: 'pendente', km_agendado: 5000 },
            { tipo: 'Revisão do Sistema de Iluminação Interna', descricao: 'Inspeção das lâmpadas internas e painel', prioridade: 'baixa', status: 'pendente', km_agendado: 15000 },
            { tipo: 'Serviço Estético (Polimento/Proteção)', descricao: 'Polimento e aplicação de proteção', prioridade: 'baixa', status: 'pendente', km_agendado: 20000 },
            { tipo: 'Reposição de Fluidos Auxiliares', descricao: 'Verificar e repor fluídos de lavador, arrefecimento etc.', prioridade: 'baixa', status: 'pendente', km_agendado: 5000 },
            { tipo: 'Substituição de Cabos de Velas', descricao: 'Troca de cabos de ignição quando aplicável', prioridade: 'media', status: 'pendente', km_agendado: 60000 },

            { tipo: 'Inspeção/Substituição de Juntas e Selantes', descricao: 'Verificar vazamentos e substituir selantes', prioridade: 'media', status: 'pendente', km_agendado: 50000 },
            { tipo: 'Manutenção de Sensores (MAP/MAF/TPS)', descricao: 'Limpeza/verificação de sensores de admissão', prioridade: 'media', status: 'pendente', km_agendado: 30000 },
            { tipo: 'Substituição do Filtro de Transmissão', descricao: 'Troca do filtro de transmissão quando aplicável', prioridade: 'media', status: 'pendente', km_agendado: 60000 },
            { tipo: 'Inspeção/Substituição de Homocinéticas e Junta CV', descricao: 'Verificar e substituir juntas homocinéticas', prioridade: 'media', status: 'pendente', km_agendado: 60000 },
            { tipo: 'Balanceamento Dinâmico de Roda', descricao: 'Balanceamento avançado de rodas', prioridade: 'media', status: 'pendente', km_agendado: 20000 },
            { tipo: 'Verificação do Sistema de Refrigeração do Turbo', descricao: 'Inspeção do circuito de refrigeração do turbo', prioridade: 'media', status: 'pendente', km_agendado: 40000 },
            { tipo: 'Substituição do Reservatório/Tampa do Radiador', descricao: 'Troca de componentes do radiador', prioridade: 'media', status: 'pendente', km_agendado: 40000 },
            { tipo: 'Verificação Direção Assistida Elétrica', descricao: 'Inspeção e diagnóstico da direção elétrica', prioridade: 'media', status: 'pendente', km_agendado: 40000 },
            { tipo: 'Verificação do Sistema de Freios ABS', descricao: 'Checar sensores e unidade ABS', prioridade: 'media', status: 'pendente', km_agendado: 30000 },
            { tipo: 'Tratamento de Odor/Manutenção do HVAC', descricao: 'Limpeza e tratamento do sistema HVAC', prioridade: 'baixa', status: 'pendente', km_agendado: 20000 },

            { tipo: 'Verificação do Painel de Instrumentos', descricao: 'Diagnóstico de indicadores e falhas no painel', prioridade: 'baixa', status: 'pendente', km_agendado: 20000 },
            { tipo: 'Verificação de Sistema de Segurança Pós-colisão', descricao: 'Inspeção de estratégia pós-colisão e sensores', prioridade: 'alta', status: 'pendente', km_agendado: 30000 },
            { tipo: 'Inspeção de Estruturas e Chassis', descricao: 'Verificação de fissuras e integridade estrutural', prioridade: 'alta', status: 'pendente', km_agendado: 50000 },
            { tipo: 'Serviço de Recuperação Estética (restauração)', descricao: 'Reparos estéticos e restauração de pintura', prioridade: 'baixa', status: 'pendente', km_agendado: 60000 },
            { tipo: 'Verificação do Sistema de Travas Elétricas', descricao: 'Checar atuação das travas e central', prioridade: 'baixa', status: 'pendente', km_agendado: 15000 },
            { tipo: 'Inspeção de Sistema de Som e Conectividade', descricao: 'Verificar alto-falantes, conectividade e antena', prioridade: 'baixa', status: 'pendente', km_agendado: 20000 },
            { tipo: 'Revisão do Sistema de Iluminação Externa', descricao: 'Checar faróis, setas, iluminação externa', prioridade: 'baixa', status: 'pendente', km_agendado: 15000 },
            { tipo: 'Verificação de Sensores de Estacionamento', descricao: 'Teste e limpeza de sensores de estacionamento', prioridade: 'baixa', status: 'pendente', km_agendado: 15000 },
            { tipo: 'Inspeção de Sistemas de Assistência ao Motorista', descricao: 'Checar ADAS, câmeras e sensores', prioridade: 'alta', status: 'pendente', km_agendado: 30000 },
            { tipo: 'Verificação do Sistema de Ar Inflável/Bag', descricao: 'Inspeção e códigos de falha do airbag', prioridade: 'alta', status: 'pendente', km_agendado: 30000 }
          ];

          // identificar usuário que criou (se disponível)
          const criadoPor = (req.user && (req.user.name || req.user.username || req.user.email)) || null;

          for (const def of defaults) {
            try {
              await db.promise().query(
                `INSERT INTO manutencoes_manuais
                  (veiculo_id, tipo, descricao, prioridade, status, km_agendado, data_agendada, data_inicio, data_realizada, custo_estimado, custo_real, fornecedor, responsavel, criado_por, criado_em, realizado_em, realizado_por)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
                [
                  veiculoId,
                  def.tipo || null,
                  def.descricao || def.tipo || null,
                  def.prioridade || 'media',
                  def.status || 'pendente',
                  def.km_agendado || null,
                  def.data_agendada || null,
                  def.data_inicio || null,
                  def.data_realizada || null,
                  (def.custo_estimado !== undefined ? def.custo_estimado : null),
                  (def.custo_real !== undefined ? def.custo_real : null),
                  def.fornecedor || null,
                  def.responsavel || null,
                  criadoPor,
                  def.realizado_em || null,
                  def.realizado_por || null
                ]
              );
            } catch (innerErr) {
              // loga mas não interrompe a criação das demais manutenções
              console.error('Erro ao inserir manutenção manual padrão:', innerErr, '->', def);
            }
          }

          console.log(`Manutenções padrão criadas (manutencoes_manuais) para veículo ${veiculoId}`);
        } catch (e) {
          console.error('Erro ao criar manutenções padrão em manutencoes_manuais:', e);
        }
        // sucesso
        return res.redirect('/');
      });

    } catch (err) {
      console.error('Erro inesperado em /registrar-veiculo:', err);
      if (err instanceof multer.MulterError) {
        const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo muito grande (limite 5MB)' : 'Erro no upload do arquivo';
        try {
          const [devices] = await db.promise().query('SELECT * FROM devices');
          return res.status(400).render('registrar-veiculo', {
            layout: 'layout',
            title: 'Registrar veículo',
            activePage: 'registrar-veiculo',
            user: req.user,
            csrfToken: req.csrfToken(),
            devices,
            errors: [msg],
            errorFields: [],
            data: req.body
          });
        } catch (e) {
          return res.status(400).send(msg);
        }
      }
      res.status(500).send('Erro interno no servidor');
    }
  }
);


///////////////////////////////////FIM REGISTRAR////////////////////////////////////////////////



app.get('/devices-com-veiculo', isAuthenticated, async (req, res) => {
  try {
    // 1) Pego todos os device_id usados pelos veículos, junto com placa/nome/modelo/marca
    const [usos] = await db.promise().query(`
      SELECT DISTINCT
        v.device_id   AS id,
        v.placa       AS placa,
        v.nome        AS veiculoNome,
        v.modelo      AS modelo,
        v.marca       AS marca
      FROM veiculos v
      WHERE v.device_id IS NOT NULL
      ORDER BY v.device_id
    `);

    const ids = usos.map(u => u.id);
    if (ids.length === 0) {
      return res.json([]);
    }

    // 2) Pego os nomes dos devices no banco GPS
    const devices = await queryGps(
      `SELECT dev_id AS id, dev_name AS name
         FROM devices
        WHERE dev_id IN (?)
        ORDER BY dev_name`,
      [ids]
    );

    // 3) Merge: para cada device, ache o uso correspondente
    const merged = devices.map(d => {
      const u = usos.find(u => u.id === d.id) || {};
      return {
        id: d.id,
        name: d.name,
        placa: u.placa,
        veiculoNome: u.veiculoNome,
        marca: u.marca,      // <-- agora vem do banco
        modelo: u.modelo
      };
    });

    res.json(merged);

  } catch (err) {
    console.error('Erro ao buscar devices com veículos:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// --- Relatório de Veículos (server-side) ---
app.get('/relatorio-veiculos', isAuthenticated, csrfProtection, async (req, res) => {
  try {
    // Renderiza a página; os dados dinâmicos virão via AJAX da rota /api/relatorio-veiculos
    res.render('relatorio-veiculos', {
      layout: 'layout',
      title: 'Relatório da Frota',
      activePage: 'relatorio-veiculos',
      user: req.user,
      csrfToken: req.csrfToken()
    });
  } catch (err) {
    console.error('Erro ao renderizar relatório de veículos:', err);
    res.status(500).send('Erro interno');
  }
});

// API que retorna dados agregados e lista (usada pelo frontend)
app.get('/api/relatorio-veiculos', isAuthenticated, async (req, res) => {
  try {
    // parâmetros opcionais
    const upcomingDays = parseInt(req.query.upcomingDays || '90', 10); // expirations dentro de X dias
    const maintenanceKmThreshold = parseInt(req.query.maintenanceKm || '10000', 10); // km desde ultima troca de óleo

    // 1) Totais e estatísticas de KM (REMOVIDA qualquer referência a emUsoPor)
    const [totals] = await db.promise().query(`
      SELECT
        COUNT(*) AS total,
        AVG(km) AS avg_km,
        MIN(km) AS min_km,
        MAX(km) AS max_km
      FROM veiculos
    `);

    // 2) Distribuição por combustível
    const [byFuel] = await db.promise().query(`
      SELECT IFNULL(tipo_combustivel, 'Não informado') AS fuel, COUNT(*) AS cnt
      FROM veiculos
      GROUP BY IFNULL(tipo_combustivel, 'Não informado')
    `);

    // 3) Veículos com documentos vencendo nos próximos X dias
    const [upcoming] = await db.promise().query(
      `SELECT id, placa, nome,
              licenciamento, seguro_dpvat, crlv,
              venc_extintor, venc_triangulo, venc_colete
       FROM veiculos
       WHERE
         (licenciamento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY))
         OR (seguro_dpvat BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY))
         OR (crlv BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY))
         OR (venc_extintor BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY))
         OR (venc_triangulo BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY))
         OR (venc_colete BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY))
       ORDER BY LEAST(
         IFNULL(licenciamento, '9999-12-31'),
         IFNULL(seguro_dpvat, '9999-12-31'),
         IFNULL(crlv, '9999-12-31'),
         IFNULL(venc_extintor, '9999-12-31'),
         IFNULL(venc_triangulo, '9999-12-31'),
         IFNULL(venc_colete, '9999-12-31')
       ) ASC
      `, [upcomingDays, upcomingDays, upcomingDays, upcomingDays, upcomingDays, upcomingDays]
    );

    // 4) Veículos com manutenção preventiva (ex.: km - ultimaTrocaOleo >= maintenanceKmThreshold)
    const [maintenanceDue] = await db.promise().query(
      `SELECT id, placa, nome, km, ultimaTrocaOleo, (km - ultimaTrocaOleo) AS km_since_oil
       FROM veiculos
       WHERE ultimaTrocaOleo IS NOT NULL AND km IS NOT NULL
         AND (km - ultimaTrocaOleo) >= ?
       ORDER BY km_since_oil DESC
       LIMIT 200
      `, [maintenanceKmThreshold]
    );

    // 5) Lista compacta para tabela (removido campo emUsoPor)
    const [list] = await db.promise().query(`
      SELECT id, placa, nome, marca, modelo, tipologia, km, ultimaTrocaOleo,
             tipo_combustivel, status_ipva, device_id
      FROM veiculos
      ORDER BY placa ASC
      LIMIT 1000
    `);

    res.json({
      ok: true,
      totals: totals[0] || {},
      byFuel,
      upcoming,
      maintenanceDue,
      list
    });
  } catch (err) {
    console.error('Erro /api/relatorio-veiculos:', err);
    res.status(500).json({ ok: false, error: 'Erro interno' });
  }
});




app.post('/multar/:uso_id', isAuthenticated, csrfProtection, (req, res) => {
  const { uso_id } = req.params;
  const multa = validator.escape(req.body.multa || '');

  if (!multa) {
    return res.status(400).send("Descrição da multa é obrigatória.");
  }

  // Busca o uso pra saber o motorista e o veículo
  db.query("SELECT * FROM uso_veiculos WHERE id = ?", [uso_id], (err, usoResult) => {
    if (err) {
      console.error("Erro ao buscar uso:", err);
      return res.status(500).send("Erro ao buscar o uso.");
    }
    if (usoResult.length === 0) {
      return res.status(404).send("Uso não encontrado.");
    }

    const uso = usoResult[0];
    const motoristaProvavel = uso.motorista;
    const veiculo_id = uso.veiculo_id;

    // Insere a multa associando o uso e o motorista
    db.query(
      "INSERT INTO multas (veiculo_id, motorista, multa, uso_id) VALUES (?, ?, ?, ?)",
      [veiculo_id, motoristaProvavel, multa, uso_id],
      (err, result) => {
        if (err) {
          console.error("Erro ao registrar a multa:", err);
          return res.status(500).send("Erro ao registrar a multa.");
        }
        res.redirect("/relatorio-uso");
      }
    );
  });
});

// Rotas para registrar multa (GET mostra o form; POST insere)

app.get('/registrar-multa/:veiculo_id', isAuthenticated, csrfProtection, (req, res) => {
  const { veiculo_id } = req.params;

  // buscar só as colunas necessárias (inclui nome_marca/nome_modelo)
  const qVeiculo = "SELECT id, placa, nome_marca, nome_modelo, marca, modelo FROM veiculos WHERE id = ?";
  const qTipos = "SELECT id, codigo, descricao FROM tipos_infracoes ORDER BY descricao";

  db.query(qVeiculo, [veiculo_id], (err, veiculoResult) => {
    if (err) {
      console.error("Erro ao buscar veículo:", err);
      return res.status(500).send("Erro ao buscar o veículo.");
    }
    if (veiculoResult.length === 0) {
      return res.status(404).send("Veículo não encontrado.");
    }

    const veiculo = veiculoResult[0];

    // monta display_name com fallback para marca/modelo antigos
    veiculo.display_name = ((veiculo.nome_marca || veiculo.marca) || '').toString().trim()
      + ((veiculo.nome_modelo || veiculo.modelo) ? ' ' + (veiculo.nome_modelo || veiculo.modelo) : '');

    // log para debug: verifique o console do servidor
    console.log('GET /registrar-multa — veiculo para render:', veiculo);

    db.query(qTipos, (err2, tiposResult) => {
      if (err2) {
        console.error("Erro ao buscar tipos de infração:", err2);
        return res.status(500).send("Erro ao buscar tipos de infração.");
      }

      return res.render('registrarMulta', {
        veiculo,
        tipos_infracoes: tiposResult,
        csrfToken: req.csrfToken(),
        mensagemErro: null,
        title: 'Registro de Multa',
        layout: 'layout',
        activePage: 'registrarMulta',
        user: req.user,
        formValues: {} // vazio por padrão
      });
    });
  });
});



app.post('/registrar-multa/:veiculo_id',
  isAuthenticated,
  isAdmin,
  csrfProtection,
  (req, res) => {
    const { veiculo_id } = req.params;

    // campos do form
    const {
      orgao_autuador,
      numero_auto,
      data_multa,
      multa, // descrição curta/observação
      placa,
      condutor,
      infrator,
      local_infracao,
      tipo_infracao_id,
      limite_via,
      medicao_realizada,
      valor_considerado,
      valor,
      desconto_percentual,
      data_vencimento,
      data_recurso
    } = req.body;

    // Validações mínimas
    if (!orgao_autuador || !numero_auto || !data_multa || !multa || !valor) {
      // primeiro busca o veículo para podermos mostrar nome_marca/nome_modelo na re-renderização
      const qVeiculo = "SELECT id, placa, nome_marca, nome_modelo, marca, modelo FROM veiculos WHERE id = ?";
      db.query(qVeiculo, [veiculo_id], (errVeic, veicRows) => {
        if (errVeic) {
          console.error("Erro ao buscar veículo (validação):", errVeic);
          return res.status(500).send("Erro no servidor.");
        }
        const veiculoParaRender = (veicRows && veicRows.length > 0) ? veicRows[0] : { id: veiculo_id, placa };

        const qTipos = "SELECT id, codigo, descricao FROM tipos_infracoes ORDER BY descricao";
        return db.query(qTipos, (errTipos, tiposResult) => {
          if (errTipos) {
            console.error(errTipos);
            return res.status(500).send("Erro no servidor.");
          }
          return res.render('registrarMulta', {
            veiculo: veiculoParaRender,
            tipos_infracoes: tiposResult,
            csrfToken: req.csrfToken(),
            mensagemErro: "Preencha os campos obrigatórios: órgão autuador, nº do auto, data e valor.",
            title: 'Registro de Multa',
            layout: 'layout',
            activePage: 'registrarMulta',
            user: req.user,
            formValues: req.body
          });
        });
      });
      return; // importante para não continuar a execução
    }

    // Converte valores numéricos (segurança)
    const valorNum = parseFloat(String(valor).replace(',', '.')) || 0.0;
    const descontoNum = parseFloat(String(desconto_percentual || '0').replace(',', '.')) || 0.0;
    const limiteViaNum = limite_via ? parseFloat(String(limite_via).replace(',', '.')) : null;
    const medicaoNum = medicao_realizada ? parseFloat(String(medicao_realizada).replace(',', '.')) : null;
    const valorConsideradoNum = valor_considerado ? parseFloat(String(valor_considerado).replace(',', '.')) : null;

    // calcula valor com desconto
    const valorComDesconto = Number((valorNum * (1 - (descontoNum / 100))).toFixed(2));

    // procura uso do veículo para associar motorista/uso_id (mesma lógica sua)
    const dataMulta = new Date(data_multa);
    const queryUso = `
      SELECT * FROM uso_veiculos 
      WHERE veiculo_id = ? 
        AND data_hora_inicial <= ? 
        AND (data_hora_final IS NULL OR data_hora_final >= ?)
      ORDER BY data_hora_inicial DESC 
      LIMIT 1
    `;

    db.query(queryUso, [veiculo_id, dataMulta, dataMulta], (errUso, usoResult) => {
      if (errUso) {
        console.error("Erro ao buscar uso do veículo:", errUso);
        return res.status(500).send("Erro ao buscar o uso.");
      }

      const uso_id = usoResult.length > 0 ? usoResult[0].id : null;
      const motoristaProvavel = usoResult.length > 0 ? usoResult[0].motorista : null;

      // Se não encontrou uso válido, renderiza mensagem de erro informando a necessidade de cadastrar um uso
      if (!uso_id) {
        const qTipos = "SELECT id, codigo, descricao FROM tipos_infracoes ORDER BY descricao";
        return db.query(qTipos, (errTipos, tiposResult) => {
          if (errTipos) {
            console.error(errTipos);
            return res.status(500).send("Erro no servidor.");
          }
          return res.render('mensagemMulta', {
            mensagem: "Não foi possível associar um motorista automaticamente. Cadastre um uso para esse período ou preencha o campo 'Condutor'.",
            csrfToken: req.csrfToken(),
            layout: 'layout',
            activePage: 'registrar-multa',
            user: req.user
          });
        });
      }

      // Insere a multa com todos os campos
      const insertQuery = `
        INSERT INTO multas
          (veiculo_id, orgao_autuador, numero_auto, placa, motorista, condutor, infrator, data, multa,
           uso_id, local_infracao, tipo_infracao_id, limite_via, medicao_realizada,
           valor_considerado, valor, desconto_percentual, valor_com_desconto, data_vencimento, data_recurso)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      // Condutor: usa campo do form se preenchido, senão motorista provavel do uso
      const condutorFinal = (condutor && condutor.trim().length > 0) ? condutor.trim() : motoristaProvavel;

      db.query(insertQuery, [
        veiculo_id,
        orgao_autuador,
        numero_auto,
        placa || usoResult[0].placa || '', // placa do form ou do uso/veiculo
        motoristaProvavel,
        condutorFinal,
        infrator || condutorFinal,
        data_multa,
        multa,
        uso_id,
        local_infracao || null,
        tipo_infracao_id || null,
        limiteViaNum,
        medicaoNum,
        valorConsideradoNum,
        valorNum,
        descontoNum,
        valorComDesconto,
        data_vencimento || null,
        data_recurso || null
      ], (errInsert) => {
        if (errInsert) {
          console.error("Erro ao registrar a multa:", errInsert);
          return res.status(500).send("Erro ao registrar a multa.");
        }
        // Redireciona para relatório ou página de sucesso
        return res.redirect("/relatorio-multas");
      });
    });
  }
);



app.get('/relatorio-multas', isAuthenticated, csrfProtection, (req, res) => {
  const query = `
      SELECT m.*, v.placa, u.data_hora_inicial, u.data_hora_final
      FROM multas m
      JOIN veiculos v ON m.veiculo_id = v.id
      LEFT JOIN uso_veiculos u ON m.uso_id = u.id
      ORDER BY m.data DESC
    `;
  db.query(query, (err, multasResult) => {
    if (err) {
      console.error("Erro ao buscar multas:", err);
      return res.status(500).send("Erro ao buscar multas.");
    }
    res.render('relatorioMultas', {
      multas: multasResult,
      csrfToken: req.csrfToken(),
      title: 'Relatório de Multas',
      layout: 'layout',
      activePage: 'relatorio-multas',
      user: req.user
    });
  });
});

app.get('/editar-uso/:id', isAuthenticated, csrfProtection, (req, res) => {
  const { id } = req.params;
  db.query('SELECT * FROM uso_veiculos WHERE id = ?', [id], (err, usoResult) => {
    if (err) {
      console.error('Erro ao buscar uso:', err);
      return res.status(500).send('Erro ao buscar dados do uso');
    }
    if (usoResult.length === 0) {
      return res.status(404).send('Uso não encontrado');
    }
    const uso = usoResult[0];
    // Pega as multas relacionadas a esse uso
    db.query('SELECT * FROM multas WHERE uso_id = ?', [id], (err, multasResult) => {
      if (err) {
        console.error('Erro ao buscar multas:', err);
        return res.status(500).send('Erro ao buscar multas');
      }
      res.render('editarUso', {
        uso,
        csrfToken: req.csrfToken(),
        multas: multasResult,
        title: 'Editar Uso',
        layout: 'layout',
        activePage: 'editarUso',
        user: req.user,
        csrfToken: req.csrfToken()
      });
    });
  });
});


app.get('/usar/:id', isAuthenticated, csrfProtection, (req, res) => {
  const { id } = req.params;
  const userId = req.user.id; // Pega o ID do usuário autenticado

  // Busca o email do usuário autenticado
  db.query('SELECT email FROM usuarios WHERE id = ?', [userId], (err, userResult) => {
    if (err) {
      console.error("Erro ao buscar usuário:", err);
      return res.status(500).send("Erro ao buscar usuário.");
    }
    if (userResult.length === 0) {
      return res.status(404).send("Usuário não encontrado");
    }

    const motoristaEmail = userResult[0].email; // Email do usuário autenticado

    // Busca os dados do veículo
    db.query('SELECT * FROM veiculos WHERE id = ?', [id], (err, veiculoResult) => {
      if (err) {
        console.error("Erro ao buscar veículo:", err);
        return res.status(500).send("Erro ao buscar o veículo.");
      }
      if (veiculoResult.length === 0) {
        return res.status(404).send("Veículo não encontrado");
      }

      const veiculo = veiculoResult[0];
      const kmInicial = veiculo.km || 0;

      res.render('usar', {
        veiculo,
        csrfToken: req.csrfToken(),
        kmInicial,
        motoristaEmail, // Passa o email do usuário autenticado
        title: 'Usar Veículo',
        layout: 'layout',
        activePage: 'usar',
        user: req.user
      });
    });
  });
});

//rota para auto gerar manutenção
// ---------- util: ler/atualizar threshold ----------
async function getKmThreshold(veiculo_id, tipo, defaultInterval) {
  try {
    const [rows] = await db.promise().query(
      'SELECT km_threshold FROM manutencoes_config WHERE veiculo_id = ? AND tipo = ? LIMIT 1',
      [veiculo_id, tipo]
    );
    if (rows && rows.length && rows[0].km_threshold != null) {
      return Number(rows[0].km_threshold);
    }
  } catch (e) {
    console.error('Erro getKmThreshold:', e);
  }
  return Number(defaultInterval);
}

async function setKmThreshold(veiculo_id, tipo, kmThreshold) {
  const val = (kmThreshold === null || kmThreshold === undefined) ? null : Number(kmThreshold);
  const sql = `
    INSERT INTO manutencoes_config (veiculo_id, tipo, km_threshold)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE km_threshold = VALUES(km_threshold), atualizado_em = NOW()
  `;
  return db.promise().query(sql, [veiculo_id, tipo, val]);
}

// ---------- autoGenerateMaintenance (melhorada, usa thresholds por veículo) ----------
async function autoGenerateMaintenance(veiculo) {
  if (!veiculo || typeof veiculo.km === 'undefined' || veiculo.km === null) return;

  // regras padrão (mantive a lista; troque apenas os kmIntervalo padrão se quiser)
  const regrasManutencao = [
    { tipo: 'Rodízio de Pneus', kmIntervalo: 10000 },
    { tipo: 'Troca de Pneus', kmIntervalo: 40000 },
    { tipo: 'Troca de Pastilhas', kmIntervalo: 30000 },
    { tipo: 'Troca de Discos de Freio', kmIntervalo: 60000 },
    { tipo: 'Troca da Correia Dentada', kmIntervalo: 80000 },
    { tipo: 'Troca do Óleo do Motor', kmIntervalo: 10000 },
    { tipo: 'Troca do Filtro de Óleo', kmIntervalo: 10000 },
    { tipo: 'Troca do Filtro de Ar', kmIntervalo: 20000 },
    { tipo: 'Troca do Filtro de Combustível', kmIntervalo: 20000 },
    { tipo: 'Alinhamento e Balanceamento', kmIntervalo: 10000 },
    { tipo: 'Verificação do Sistema de Arrefecimento', kmIntervalo: 20000 },
    { tipo: 'Revisão do Sistema Elétrico', kmIntervalo: 30000 },
    // ... mantenha ou adicione regras conforme desejar
  ];

  // itera regras e usa km_threshold configurado (se houver) para o veículo
  for (const regra of regrasManutencao) {
    try {
      const threshold = await getKmThreshold(veiculo.id, regra.tipo, regra.kmIntervalo);
      if (Number(veiculo.km) >= Number(threshold)) {
        const queryVerifica = `
          SELECT * FROM manutencoes 
          WHERE veiculo_id = ? AND tipo = ? AND status = 'pendente'
        `;
        const [existing] = await db.promise().query(queryVerifica, [veiculo.id, regra.tipo]);
        if (!existing || existing.length === 0) {
          const descricao = `Manutenção automática gerada ao atingir ${veiculo.km} km (threshold: ${threshold} km).`;
          const queryInsert = `
            INSERT INTO manutencoes (veiculo_id, tipo, descricao, km_agendado, status)
            VALUES (?, ?, ?, ?, 'pendente')
          `;
          await db.promise().query(queryInsert, [veiculo.id, regra.tipo, descricao, threshold]);
          try { sendMaintenanceNotification(veiculo, { tipo: regra.tipo, descricao }); } catch (e) { console.warn('notify fail', e); }
        }
      }
    } catch (e) {
      console.error(`Erro processando regra ${regra.tipo} para veículo ${veiculo.id}:`, e);
    }
  }
}
/*
app.get('/manutencoes', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const [veiculos] = await db.promise().query(
      'SELECT id, placa, nome, km FROM veiculos ORDER BY placa'
    );

    res.render('manutencoes-config', {
      title: 'Manutenções - Escolher Veículo',
      layout: 'layout',
      veiculos,
      user: req.user
    });
  } catch (err) {
    console.error('GET /manutencoes', err);
    res.status(500).send('Erro interno');
  }
});

*/

// -----------------------------
// Helpers: coloque isto antes das rotas
// -----------------------------
function safeReturnTo(r) {
  if (!r || typeof r !== 'string') return null;
  // só permite redirecionar para /manutencoes/config/:id
  if (r.startsWith('/manutencoes/config/')) return r;
  return null;
}

function extractVeiculoIdFromReferer(req) {
  try {
    const ref = req.get('referer') || '';
    const m = ref.match(/\/manutencoes\/config\/(\d+)/);
    if (m) return Number(m[1]);
  } catch (e) { /* ignore */ }
  return null;
}
// -----------------------------
// Rota para listar todas as manutenções (de todos os veículos)
/*
app.get('/manutencoes-todos', isAuthenticated, csrfProtection, (req, res) => {
  const query = `
      SELECT m.*, v.placa, v.nome as veiculo_nome 
      FROM manutencoes m
      JOIN veiculos v ON m.veiculo_id = v.id
      ORDER BY m.status, m.data_agendada
    `;
  db.query(query, (err, results) => {
    if (err) {
      console.error("Erro ao buscar manutenções:", err);
      return res.status(500).send("Erro ao buscar manutenções.");
    }
    res.render('manutencoes', {
      title: 'Manutenções',
      csrfToken: req.csrfToken(),
      layout: 'layout',
      activePage: 'manutencoes',
      manutencoes: results,
      user: req.user // Passa o usuário autenticado para o template
    });
  });
});

// Listar e configurar (já carrega thresholds + manutenções)
app.get('/manutencoes/config/:veiculo_id',
  isAuthenticated, isAdmin, csrfProtection,
  async (req, res) => {
    try {
      const veiculoId = Number(req.params.veiculo_id || 0);
      if (!veiculoId) return res.status(400).send('Veículo inválido');

      // thresholds existentes
      const [rows] = await db.promise().query(
        'SELECT tipo, km_threshold FROM manutencoes_config WHERE veiculo_id = ?',
        [veiculoId]
      );

      const regrasPadrao = [
        { tipo: 'Rodízio de Pneus', kmIntervalo: 10000 },
        { tipo: 'Troca de Pneus', kmIntervalo: 40000 },
        { tipo: 'Troca de Pastilhas', kmIntervalo: 30000 },
        { tipo: 'Troca de Discos de Freio', kmIntervalo: 60000 },
        { tipo: 'Troca da Correia Dentada', kmIntervalo: 80000 },
        { tipo: 'Troca do Óleo do Motor', kmIntervalo: 10000 },
        { tipo: 'Troca do Filtro de Óleo', kmIntervalo: 10000 },
        { tipo: 'Troca do Filtro de Ar', kmIntervalo: 20000 },
        { tipo: 'Troca do Filtro de Combustível', kmIntervalo: 20000 },
        { tipo: 'Alinhamento e Balanceamento', kmIntervalo: 10000 },
        { tipo: 'Verificação do Sistema de Arrefecimento', kmIntervalo: 20000 },
        { tipo: 'Revisão do Sistema Elétrico', kmIntervalo: 30000 }
      ];

      const map = {};
      (rows || []).forEach(r => { map[r.tipo] = r.km_threshold; });

      const lista = regrasPadrao.map(r => ({
        tipo: r.tipo,
        default: r.kmIntervalo,
        configured: (map[r.tipo] === null || typeof map[r.tipo] === 'undefined') ? null : map[r.tipo]
      }));

      // dados do veículo
      const [vrows] = await db.promise().query(
        'SELECT id, placa, nome, km FROM veiculos WHERE id = ? LIMIT 1',
        [veiculoId]
      );
      if (!vrows || !vrows.length) return res.status(404).send('Veículo não encontrado');
      const veiculo = vrows[0];

      // manutenções cadastradas
      const [mrows] = await db.promise().query(
        'SELECT * FROM manutencoes WHERE veiculo_id = ? ORDER BY data_agendada DESC, id DESC',
        [veiculoId]
      );

      res.render('manutencoes-config', {
        title: `Manutenções - ${veiculo.nome || veiculo.placa}`,
        csrfToken: req.csrfToken && req.csrfToken(),
        layout: 'layout',
        veiculo,
        lista,
        manutencoes: mrows,
        user: req.user,
        returnTo: `/manutencoes/config/${veiculo.id}`
      });

    } catch (err) {
      console.error('GET /manutencoes/config/:veiculo_id', err);
      return res.status(500).send('Erro interno');
    }
  }
);

// Criar manutenção
app.post('/manutencoes', isAuthenticated, isAdmin, csrfProtection, async (req, res) => {
  try {
    const { veiculo_id, tipo, descricao, km_agendado, data_agendada, returnTo } = req.body;

    // debug rápido — remova depois
    console.log('POST /manutencoes body:', { veiculo_id, tipo });

    // tenta recuperar veiculo_id: body -> referer fallback
    let vid = Number(veiculo_id || 0);
    if (!vid) vid = extractVeiculoIdFromReferer(req);
    if (!vid) {
      console.warn('POST /manutencoes sem veiculo_id e sem referer válido');
      return res.status(400).send('Veículo inválido');
    }

    await db.promise().query(
      'INSERT INTO manutencoes (veiculo_id, tipo, descricao, km_agendado, data_agendada, status) VALUES (?,?,?,?,?, "pendente")',
      [vid, tipo, descricao || null, km_agendado || null, data_agendada || null]
    );

    const redirectTo = safeReturnTo(returnTo) || `/manutencoes/config/${vid}`;
    return res.redirect(redirectTo);
  } catch (err) {
    console.error('Erro POST /manutencoes', err);
    // se você estiver em produção, pode redirecionar pra lista com flash, aqui só informa
    return res.status(500).send('Erro ao criar manutenção');
  }
});


// Editar manutenção
app.post('/manutencoes/:id/edit', isAuthenticated, isAdmin, csrfProtection, async (req, res) => {
  try {
    const { tipo, descricao, km_agendado, data_agendada, data_realizada, status, veiculo_id, returnTo } = req.body;
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).send('ID inválido');

    // tenta recuperar veiculo_id se não enviado
    let vid = Number(veiculo_id || 0);
    if (!vid) vid = extractVeiculoIdFromReferer(req);

    await db.promise().query(
      'UPDATE manutencoes SET tipo=?, descricao=?, km_agendado=?, data_agendada=?, data_realizada=?, status=? WHERE id=?',
      [tipo, descricao || null, km_agendado || null, data_agendada || null, data_realizada || null, status || null, id]
    );

    const redirectTo = safeReturnTo(returnTo) || (vid ? `/manutencoes/config/${vid}` : '/manutencoes');
    return res.redirect(redirectTo);
  } catch (err) {
    console.error('Erro POST /manutencoes/:id/edit', err);
    return res.status(500).send('Erro ao salvar manutenção');
  }
});


// Excluir manutenção
app.post('/manutencoes/:id/delete', isAuthenticated, isAdmin, csrfProtection, async (req, res) => {
  try {
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).send('ID inválido');

    const [rows] = await db.promise().query('SELECT veiculo_id FROM manutencoes WHERE id=?', [id]);
    if (!rows.length) return res.status(404).send('Não encontrada');

    await db.promise().query('DELETE FROM manutencoes WHERE id=?', [id]);

    const redirectTo = safeReturnTo(req.body.returnTo) || `/manutencoes/config/${rows[0].veiculo_id}`;
    return res.redirect(redirectTo);
  } catch (err) {
    console.error('Erro POST /manutencoes/:id/delete', err);
    return res.status(500).send('Erro ao excluir manutenção');
  }
});


// POST: salva ou reseta um threshold (ação via botão name="action")
app.post('/manutencoes/config',
  isAuthenticated, isAdmin, csrfProtection,
  async (req, res) => {
    try {
      const { veiculo_id, tipo, km_threshold, action } = req.body;
      const vid = Number(veiculo_id || 0);
      if (!vid || !tipo) return res.status(400).send('Dados inválidos');

      if (action === 'reset') {
        await db.promise().query(
          'INSERT INTO manutencoes_config (veiculo_id, tipo, km_threshold) VALUES (?, ?, NULL) ON DUPLICATE KEY UPDATE km_threshold = NULL',
          [vid, tipo]
        );
        return res.redirect(`/manutencoes/config/${vid}`);
      }

      // salvar (km vazio => NULL)
      const km = (km_threshold === '' || typeof km_threshold === 'undefined' || km_threshold === null) ? null : Number(km_threshold);
      await db.promise().query(
        `INSERT INTO manutencoes_config (veiculo_id, tipo, km_threshold)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE km_threshold = VALUES(km_threshold)`,
        [vid, tipo, km]
      );
      return res.redirect(`/manutencoes/config/${vid}`);
    } catch (err) {
      console.error('POST /manutencoes/config', err);
      // se erro de CSRF chegar aqui, csurf já lançou ForbiddenError antes de entrar no try
      return res.status(500).send('Erro ao salvar configuração');
    }
  }
);

// GET /manutencoes/config  -> lista veículos para escolher
app.get('/manutencoes/config', isAuthenticated, isAdmin, csrfProtection, async (req, res) => {
  try {
    const [veiculos] = await db.promise().query('SELECT id, nome, placa FROM veiculos ORDER BY nome, placa LIMIT 500');
    res.render('manutencoes-config-list', {
      title: 'Configurar thresholds - Selecionar veículo',
      layout: 'layout',
      activePage: 'manutencoes-config',
      csrfToken: req.csrfToken(),
      veiculos,
      user: req.user
    });
  } catch (e) {
    console.error('Erro /manutencoes/config listar veículos:', e);
    return res.status(500).send('Erro interno');
  }
});
*/
//////////////////////////////////////////////////////////MANUTENCOES //////////////////////////////////////////////////////////
const REGRAS_PADRAO = [
  { tipo: 'Troca do Óleo do Motor', descricao: 'Troca do Óleo do Motor', defaultKm: 10000 },
  { tipo: 'Troca do Filtro de Óleo', descricao: 'Troca do Filtro de Óleo', defaultKm: 10000 },
  { tipo: 'Troca do Filtro de Ar (motor)', descricao: 'Troca do Filtro de Ar (motor)', defaultKm: 15000 },
  { tipo: 'Troca do Filtro de Combustível', descricao: 'Troca do Filtro de Combustível', defaultKm: 15000 },
  { tipo: 'Troca do Filtro de Cabine (ar-condicionado)', descricao: 'Troca do Filtro de Cabine (ar-condicionado)', defaultKm: 15000 },
  { tipo: 'Troca do Filtro de Pólen', descricao: 'Troca do Filtro de Pólen', defaultKm: 15000 },
  { tipo: 'Troca das Velas de Ignição', descricao: 'Troca das Velas de Ignição', defaultKm: 20000 },
  { tipo: 'Inspeção/limpeza dos Injetores', descricao: 'Inspeção/limpeza dos Injetores', defaultKm: 30000 },
  { tipo: 'Limpeza do TBI / Corpo de Borboleta', descricao: 'Limpeza do TBI / Corpo de Borboleta', defaultKm: 30000 },
  { tipo: 'Troca da Correia Dentada', descricao: 'Troca da Correia Dentada', defaultKm: 60000 },
  { tipo: 'Troca da Correia Alternador/Serpentina', descricao: 'Troca da Correia Alternador/Serpentina', defaultKm: 60000 },
  { tipo: 'Tensionador/Polias (inspeção/substituição)', descricao: 'Tensionador/Polias (inspeção/substituição)', defaultKm: 60000 },
  { tipo: 'Troca do Óleo da Transmissão (AT/MT)', descricao: 'Troca do Óleo da Transmissão (AT/MT)', defaultKm: 60000 },
  { tipo: 'Troca do Fluido do Diferencial', descricao: 'Troca do Fluido do Diferencial', defaultKm: 60000 },
  { tipo: 'Troca do Fluido da Caixa de Transferência (4x4)', descricao: 'Troca do Fluido da Caixa de Transferência (4x4)', defaultKm: 60000 },
  { tipo: 'Troca do Fluido de Freio', descricao: 'Troca do Fluido de Freio', defaultKm: 40000 },
  { tipo: 'Troca do Líquido de Arrefecimento (coolant)', descricao: 'Troca do Líquido de Arrefecimento (coolant)', defaultKm: 40000 },
  { tipo: 'Troca do Líquido da Direção Hidráulica', descricao: 'Troca do Líquido da Direção Hidráulica', defaultKm: 30000 },
  { tipo: 'Inspeção da Bateria (teste/carga)', descricao: 'Inspeção da Bateria (teste/carga)', defaultKm: 12000 },
  { tipo: 'Substituição da Bateria', descricao: 'Substituição da Bateria', defaultKm: 60000 },
  { tipo: 'Verificação/Inspeção dos Cabos e Correias', descricao: 'Verificação/Inspeção dos Cabos e Correias', defaultKm: 20000 },
  { tipo: 'Verificação do Sistema de Escape', descricao: 'Verificação do Sistema de Escape', defaultKm: 30000 },
  { tipo: 'Revisão do Sistema Elétrico / Fusíveis', descricao: 'Revisão do Sistema Elétrico / Fusíveis', defaultKm: 20000 },
  { tipo: 'Inspeção e Substituição de Pastilhas de Freio (Dianteiras)', descricao: 'Inspeção e Substituição de Pastilhas de Freio (Dianteiras)', defaultKm: 20000 },
  { tipo: 'Inspeção e Substituição de Pastilhas de Freio (Traseiras)', descricao: 'Inspeção e Substituição de Pastilhas de Freio (Traseiras)', defaultKm: 20000 },
  { tipo: 'Troca/Inspeção de Discos de Freio', descricao: 'Troca/Inspeção de Discos de Freio', defaultKm: 30000 },
  { tipo: 'Alinhamento e Balanceamento', descricao: 'Alinhamento e Balanceamento', defaultKm: 10000 },
  { tipo: 'Rodízio de Pneus', descricao: 'Rodízio de Pneus', defaultKm: 10000 },
  { tipo: 'Troca de Pneus', descricao: 'Troca de Pneus', defaultKm: 40000 },
  { tipo: 'Verificação/Calibragem de Pneus (TPMS)', descricao: 'Verificação/Calibragem de Pneus (TPMS)', defaultKm: 5000 },
  { tipo: 'Inspeção da Suspensão e Amortecedores', descricao: 'Inspeção da Suspensão e Amortecedores', defaultKm: 20000 },
  { tipo: 'Substituição de Amortecedores/Suspensão', descricao: 'Substituição de Amortecedores/Suspensão', defaultKm: 60000 },
  { tipo: 'Inspeção de Buchas e Coxins', descricao: 'Inspeção de Buchas e Coxins', defaultKm: 20000 },
  { tipo: 'Verificação de Rolamentos de Roda', descricao: 'Verificação de Rolamentos de Roda', defaultKm: 30000 },
  { tipo: 'Inspeção do Sistema de Arrefecimento (mangueiras/termóstato)', descricao: 'Inspeção do Sistema de Arrefecimento (mangueiras/termóstato)', defaultKm: 20000 },
  { tipo: 'Verificação do Radiador / Limpeza', descricao: 'Verificação do Radiador / Limpeza', defaultKm: 40000 },
  { tipo: 'Inspeção do Sistema de Ignição (bobinas/fios)', descricao: 'Inspeção do Sistema de Ignição (bobinas/fios)', defaultKm: 20000 },
  { tipo: 'Verificação/serviço da Embreagem', descricao: 'Verificação/serviço da Embreagem', defaultKm: 60000 },
  { tipo: 'Serviço na Caixa de Câmbio (manutenção geral)', descricao: 'Serviço na Caixa de Câmbio (manutenção geral)', defaultKm: 80000 },
  { tipo: 'Serviço no Diferencial', descricao: 'Serviço no Diferencial', defaultKm: 80000 },
  { tipo: 'Revisão do Sistema de Injeção (diesel/gasolina)', descricao: 'Revisão do Sistema de Injeção (diesel/gasolina)', defaultKm: 30000 },
  { tipo: 'Limpeza do Filtro DPF (diesel)', descricao: 'Limpeza do Filtro DPF (diesel)', defaultKm: 80000 },
  { tipo: 'Abastecimento/Verificação AdBlue (diesel SCR)', descricao: 'Abastecimento/Verificação AdBlue (diesel SCR)', defaultKm: 10000 },
  { tipo: 'Inspeção e Limpeza do Sistema de Ar-condicionado', descricao: 'Inspeção e Limpeza do Sistema de Ar-condicionado', defaultKm: 20000 },
  { tipo: 'Recarga de Gás do Ar-condicionado', descricao: 'Recarga de Gás do Ar-condicionado', defaultKm: 20000 },
  { tipo: 'Troca do Compressor / Componentes A/C', descricao: 'Troca do Compressor / Componentes A/C', defaultKm: 60000 },
  { tipo: 'Verificação do Sistema de Direção (caixa/rack)', descricao: 'Verificação do Sistema de Direção (caixa/rack)', defaultKm: 20000 },
  { tipo: 'Reparo/Substituição da Caixa de Direção', descricao: 'Reparo/Substituição da Caixa de Direção', defaultKm: 80000 },
  { tipo: 'Inspeção do Sistema de Segurança (airbags, cintos)', descricao: 'Inspeção do Sistema de Segurança (airbags, cintos)', defaultKm: 30000 },
  { tipo: 'Verificação/ajuste de Luzes e Faróis (alinhamento)', descricao: 'Verificação/ajuste de Luzes e Faróis (alinhamento)', defaultKm: 10000 },
  { tipo: 'Substituição de Lâmpadas (faróis, setas, ré)', descricao: 'Substituição de Lâmpadas (faróis, setas, ré)', defaultKm: 10000 },
  { tipo: 'Troca de Palhetas/limpadores de para-brisa', descricao: 'Troca de Palhetas/limpadores de para-brisa', defaultKm: 10000 },
  { tipo: 'Verificação de Nivel e Vazamentos (óleo/fluídos)', descricao: 'Verificação de Nivel e Vazamentos (óleo/fluídos)', defaultKm: 5000 },
  { tipo: 'Revisão Geral Pré-viagem (checklist)', descricao: 'Revisão Geral Pré-viagem (checklist)', defaultKm: 5000 },
  { tipo: 'Inspeção de Corrosão e Proteção (baixo do carro)', descricao: 'Inspeção de Corrosão e Proteção (baixo do carro)', defaultKm: 20000 },
  { tipo: 'Lubrificação de Portas, Dobradiças e Travas', descricao: 'Lubrificação de Portas, Dobradiças e Travas', defaultKm: 15000 },
  { tipo: 'Verificação do Sistema de Freio de Estacionamento', descricao: 'Verificação do Sistema de Freio de Estacionamento', defaultKm: 20000 },
  { tipo: 'Verificação do Sistema de Emissões (sensores O2, EGR)', descricao: 'Verificação do Sistema de Emissões (sensores O2, EGR)', defaultKm: 30000 },
  { tipo: 'Substituição do Sensor de Oxigênio (O2)', descricao: 'Substituição do Sensor de Oxigênio (O2)', defaultKm: 60000 },
  { tipo: 'Verificação/Manutenção do Catalisador', descricao: 'Verificação/Manutenção do Catalisador', defaultKm: 100000 },
  { tipo: 'Inspeção e Limpeza do Sistema de Admissão', descricao: 'Inspeção e Limpeza do Sistema de Admissão', defaultKm: 30000 },
  { tipo: 'Verificação/Serviço do Alternador', descricao: 'Verificação/Serviço do Alternador', defaultKm: 60000 },
  { tipo: 'Verificação/Serviço do Motor de Partida', descricao: 'Verificação/Serviço do Motor de Partida', defaultKm: 60000 },
  { tipo: 'Checagem/Atualização de Software (ECU)', descricao: 'Checagem/Atualização de Software (ECU)', defaultKm: 50000 },
  { tipo: 'Inspeção de Cabos/Conexões (correntes elétricas)', descricao: 'Inspeção de Cabos/Conexões (correntes elétricas)', defaultKm: 20000 },
  { tipo: 'Teste e Limpeza de Terminais da Bateria', descricao: 'Teste e Limpeza de Terminais da Bateria', defaultKm: 10000 },
  { tipo: 'Check-up de Segurança (faróis, cintos, pneus)', descricao: 'Check-up de Segurança (faróis, cintos, pneus)', defaultKm: 5000 },
  { tipo: 'Revisão de Sistema de Iluminação Interna e Painel', descricao: 'Revisão de Sistema de Iluminação Interna e Painel', defaultKm: 15000 },
  { tipo: 'Serviço de Recuperação Estética (polimento, proteção)', descricao: 'Serviço de Recuperação Estética (polimento, proteção)', defaultKm: 20000 },
  { tipo: 'Inspeção e Reposição de Fluidos Auxiliares (limpador, arrefecimento)', descricao: 'Inspeção e Reposição de Fluidos Auxiliares (limpador, arrefecimento)', defaultKm: 5000 },
  { tipo: 'Substituição de Cabos de Velas / Cabos de Ignição', descricao: 'Substituição de Cabos de Velas / Cabos de Ignição', defaultKm: 60000 },
  { tipo: 'Inspeção/Substituição de Juntas e Selantes (vazamentos)', descricao: 'Inspeção/Substituição de Juntas e Selantes (vazamentos)', defaultKm: 50000 },
  { tipo: 'Verificação/Manutenção de Sensores (MAP, MAF, TPS)', descricao: 'Verificação/Manutenção de Sensores (MAP, MAF, TPS)', defaultKm: 30000 },
  { tipo: 'Substituição do Filtro de Transmissão (quando aplicável)', descricao: 'Substituição do Filtro de Transmissão (quando aplicável)', defaultKm: 60000 },
  { tipo: 'Inspeção/Substituição de Homocinéticas e Junta CV', descricao: 'Inspeção/Substituição de Homocinéticas e Junta CV', defaultKm: 60000 },
  { tipo: 'Balanceamento Dinâmico de Roda', descricao: 'Balanceamento Dinâmico de Roda', defaultKm: 20000 },
  { tipo: 'Verificação do Sistema de Refrigeração do Turbo', descricao: 'Verificação do Sistema de Refrigeração do Turbo', defaultKm: 40000 },
  { tipo: 'Substituição do Reservatório e Tampa do Radiador', descricao: 'Substituição do Reservatório e Tampa do Radiador', defaultKm: 40000 },
  { tipo: 'Verificação/Inspeção do Sistema de Direção Assistida Elétrica', descricao: 'Verificação/Inspeção do Sistema de Direção Assistida Elétrica', defaultKm: 40000 },
  { tipo: 'Inspeção de Estruturas e Soldas (rebites, suportes)', descricao: 'Inspeção de Estruturas e Soldas (rebites, suportes)', defaultKm: 80000 }
];

// expose as regrasPadrao se seu código usa essa variável
const regrasPadrao = REGRAS_PADRAO;

// coloque ESTA rota ANTES de todas as rotas com "/manutencoes/:id"
app.get('/manutencoes/estatisticas', isAuthenticated, isAdmin, csrfProtection, async (req, res) => {
  try {
    // total por status
    const [statusStats] = await db.promise().query(`
      SELECT status, COUNT(*) as total
      FROM manutencoes_manuais
      GROUP BY status
    `);

    // total por tipo
    const [tipoStats] = await db.promise().query(`
      SELECT tipo, COUNT(*) as total
      FROM manutencoes_manuais
      GROUP BY tipo
      ORDER BY total DESC
    `);

    // total por veículo
    const [veiculoStats] = await db.promise().query(`
      SELECT v.nome, v.placa, COUNT(m.id) as total
      FROM manutencoes_manuais m
      JOIN veiculos v ON v.id = m.veiculo_id
      GROUP BY v.id, v.nome, v.placa
      ORDER BY total DESC
      LIMIT 10
    `);

    // média de tempo (dias) entre agendamento e realização
    const [tempoRows] = await db.promise().query(`
      SELECT ROUND(AVG(DATEDIFF(data_realizada, data_agendada)),1) as media_dias
      FROM manutencoes_manuais
      WHERE data_realizada IS NOT NULL AND data_agendada IS NOT NULL
    `);

    const tempoStats = (tempoRows && tempoRows.length) ? tempoRows[0] : { media_dias: null };

    res.render('manutencoes-estatisticas', {
      layout: 'layout',
      title: 'Estatísticas de Manutenções',
      csrfToken: req.csrfToken(),
      statusStats: statusStats || [],
      tipoStats: tipoStats || [],
      veiculoStats: veiculoStats || [],
      tempoStats,
      activePage: 'manutencoes-estatisticas',
      user: req.user
    });
  } catch (err) {
    console.error('GET /manutencoes/estatisticas', err);
    res.status(500).send('Erro interno ao carregar estatísticas');
  }
});


// LISTAR todas as manutenções (agregadora) - atualizado com filtros q, date_from, date_to, date_field e paginação
app.get('/manutencoes', isAuthenticated, csrfProtection, async (req, res) => {
  try {
    // filtros recebidos via query
    const veiculoFilter = Number(req.query.veiculo_id || 0) || null;
    const q = req.query.q && String(req.query.q).trim() ? String(req.query.q).trim() : null;
    const date_from = req.query.date_from && String(req.query.date_from).trim() ? String(req.query.date_from).trim() : null; // espera YYYY-MM-DD
    const date_to = req.query.date_to && String(req.query.date_to).trim() ? String(req.query.date_to).trim() : null;     // espera YYYY-MM-DD
    // date_field: 'agendada' (default) or 'realizada'
    const date_field = (req.query.date_field === 'realizada') ? 'realizada' : 'agendada';

    // paginação
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.max(1, Math.min(200, Number(req.query.pageSize || 25))); // limite 200 para segurança
    const offset = (page - 1) * pageSize;

    // lista veículos para sidebar
    const [vehicles] = await db.promise().query('SELECT id, nome, placa FROM veiculos ORDER BY nome, placa');

    // monta where dinamicamente usando parâmetros preparados
    const params = [];
    const whereParts = [];

    if (veiculoFilter) {
      whereParts.push('m.veiculo_id = ?');
      params.push(veiculoFilter);
    }

    if (q) {
      whereParts.push('(m.descricao LIKE ? OR m.tipo LIKE ? OR v.nome LIKE ? OR v.placa LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }

    // escolhe a coluna de data a filtrar
    const dateColumn = (date_field === 'realizada') ? 'm.data_realizada' : 'm.data_agendada';

    if (date_from) {
      whereParts.push(`${dateColumn} >= ?`);
      params.push(date_from);
    }

    if (date_to) {
      whereParts.push(`${dateColumn} <= ?`);
      params.push(date_to);
    }

    const where = whereParts.length ? ('WHERE ' + whereParts.join(' AND ')) : '';

    // total (para paginação)
    const [countRows] = await db.promise().query(
      `SELECT COUNT(*) AS total
       FROM manutencoes_manuais m
       JOIN veiculos v ON v.id = m.veiculo_id
       ${where}`,
      params
    );
    const totalRows = (countRows && countRows[0] && Number(countRows[0].total)) || 0;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const safePage = Math.min(page, totalPages);

    // consulta paginada (aplica LIMIT OFFSET)
    const paramsForList = params.slice(); // clone
    paramsForList.push(pageSize, (safePage - 1) * pageSize);

    const [manutencoes] = await db.promise().query(
      `SELECT m.id, m.veiculo_id, m.tipo, m.descricao, m.km_agendado,
              DATE_FORMAT(m.data_agendada, '%Y-%m-%d') AS data_agendada,
              DATE_FORMAT(m.data_realizada, '%Y-%m-%d') AS data_realizada,
              m.status, v.nome AS veiculo_nome, v.placa
       FROM manutencoes_manuais m
       JOIN veiculos v ON v.id = m.veiculo_id
       ${where}
       ORDER BY FIELD(m.status,'pendente','em_manutencao','realizada','cancelada'),
                CASE
                  WHEN m.data_agendada IS NOT NULL THEN m.data_agendada
                  WHEN m.data_realizada IS NOT NULL THEN m.data_realizada
                  ELSE m.id
                END DESC
       LIMIT ? OFFSET ?`,
      paramsForList
    );

    // pega anexos (manutencoes_arquivos referencia manutencoes_manuais)
    const ids = manutencoes.map(m => m.id);
    let arquivosMap = {};
    if (ids.length) {
      const [arquivos] = await db.promise().query(
        `SELECT id, manutencao_id, filename, original_name, mime, size, DATE_FORMAT(criado_em, '%Y-%m-%d %H:%i') as criado_em
         FROM manutencoes_arquivos WHERE manutencao_id IN (?) ORDER BY criado_em DESC`,
        [ids]
      );
      arquivosMap = arquivos.reduce((acc, a) => {
        acc[a.manutencao_id] = acc[a.manutencao_id] || [];
        acc[a.manutencao_id].push(a);
        return acc;
      }, {});
    }

    res.render('manutencoes-por-veiculo', {
      layout: 'layout',
      csrfToken: req.csrfToken(),
      vehicles,
      manutencoes,
      arquivosMap,
      selectedVehicle: veiculoFilter,
      // filtros e paginação
      q,
      date_from,
      date_to,
      date_field,
      page: safePage,
      pageSize,
      totalRows,
      totalPages,
      user: req.user
    });
  } catch (err) {
    console.error('GET /manutencoes', err);
    res.status(500).send('Erro interno');
  }
});



// rota compatível — redireciona para listagem com filtro
app.get('/veiculos/:veiculo_id/manutencoes', isAuthenticated, csrfProtection, async (req, res) => {
  const veiculoId = Number(req.params.veiculo_id || 0);
  if (!veiculoId) return res.status(400).send('Veículo inválido');
  return res.redirect(`/manutencoes?veiculo_id=${veiculoId}`);
});

// FORMULÁRIO NOVA manutenção (GET)
app.get('/veiculos/:veiculo_id/manutencoes/novo', isAuthenticated, isAdmin, csrfProtection, async (req, res) => {
  try {
    const veiculoId = Number(req.params.veiculo_id || 0);
    if (!veiculoId) return res.status(400).send('Veículo inválido');
    const [vrows] = await db.promise().query('SELECT id, nome, placa FROM veiculos WHERE id = ? LIMIT 1', [veiculoId]);
    if (!vrows.length) return res.status(404).send('Veículo não encontrado');

    res.render('manutencao-nova', {
      layout: 'layout',
      csrfToken: req.csrfToken(),
      veiculo: vrows[0],
      tipos: ['Rodízio de Pneus', 'Troca de Pneus', 'Troca de Pastilhas', 'Troca de Discos de Freio', 'Outros'],
      user: req.user
    });
  } catch (err) {
    console.error('GET novo manutencao', err);
    res.status(500).send('Erro interno');
  }
});

// CRIAR manutenção (POST) — grava em manutencoes_manuais
app.post(
  '/veiculos/:veiculo_id/manutencoes',
  isAuthenticated,
  isAdmin,
  uploadMemory.array('fotos', 10),
  csrfProtection,
  async (req, res) => {
    try {
      const veiculoId = Number(req.params.veiculo_id || 0);
      if (!veiculoId) return res.status(400).send('Veículo inválido');

      let { tipo, descricao, km_agendado, data_agendada } = req.body;
      tipo = tipo && tipo.trim() ? tipo.trim() : 'Outros';
      descricao = descricao || null;
      km_agendado = km_agendado ? Number(km_agendado) : null;
      data_agendada = data_agendada && data_agendada.trim() ? data_agendada : null;

      // Insere na tabela manutencoes_manuais
      const [insertResult] = await db.promise().query(
        `INSERT INTO manutencoes_manuais (veiculo_id, tipo, descricao, km_agendado, data_agendada, status, criado_por, criado_em)
         VALUES (?, ?, ?, ?, ?, 'pendente', ?, NOW())`,
        [veiculoId, tipo, descricao, km_agendado, data_agendada, (req.user && (req.user.email || req.user.nome)) || null]
      );
      const manutencaoId = insertResult.insertId;

      const files = req.files || [];
      if (files.length) {
        try {
          const rows = files.map(f => [
            manutencaoId,
            'foto',
            `${f.originalname}-${Date.now()}`,
            f.originalname,
            f.mimetype,
            f.size,
            f.buffer,
            (req.user && (req.user.email || req.user.nome)) || null,
            new Date()
          ]);
          await db.promise().query(
            `INSERT INTO manutencoes_arquivos (manutencao_id, tipo, filename, original_name, mime, size, data, criado_por, criado_em) VALUES ?`,
            [rows]
          );
        } catch (err) {
          console.error('[manutencoes] erro insert arquivos:', err);
          await saveFilesToDiskFallback(files, manutencaoId);
        }
      }

      res.redirect(`/veiculos/${veiculoId}/manutencoes`);
    } catch (err) {
      console.error('POST /veiculos/:veiculo_id/manutencoes', err);
      try { if (req.files && req.files.length) await saveFilesToDiskFallback(req.files, req.params.veiculo_id); } catch (e) { }
      return res.status(500).send('Erro ao criar manutenção');
    }
  }
);

// FORM EDIT (GET) — carrega da manutencoes_manuais
app.get('/manutencoes/:id/edit', isAuthenticated, isAdmin, csrfProtection, async (req, res) => {
  try {
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).send('ID inválido');

    const [rows] = await db.promise().query('SELECT * FROM manutencoes_manuais WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return res.status(404).send('Manutenção não encontrada');
    const manut = rows[0];

    res.render('manutencao-edit', {
      layout: 'layout',
      csrfToken: req.csrfToken(),
      manut,
      tipos: ['Rodízio de Pneus', 'Troca de Pneus', 'Troca de Pastilhas', 'Troca de Discos de Freio', 'Outros'],
      user: req.user
    });
  } catch (err) {
    console.error('GET /manutencoes/:id/edit', err);
    res.status(500).send('Erro interno');
  }
});

// UPDATE manutenção (POST) — atualiza manutencoes_manuais
app.post('/manutencoes/:id/edit', isAuthenticated, isAdmin, uploadMemory.array('fotos', 10), csrfProtection, async (req, res) => {
  try {
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).send('ID inválido');

    let { tipo, descricao, km_agendado, data_agendada, data_realizada, status } = req.body;
    tipo = tipo && tipo.trim() ? tipo.trim() : 'Outros';
    descricao = descricao || null;
    km_agendado = km_agendado ? Number(km_agendado) : null;
    data_agendada = data_agendada && data_agendada.trim() ? data_agendada : null;
    data_realizada = data_realizada && data_realizada.trim() ? data_realizada : null;
    status = ['pendente', 'em_manutencao', 'realizada', 'cancelada'].includes(status) ? status : 'pendente';

    await db.promise().query(
      `UPDATE manutencoes_manuais SET tipo = ?, descricao = ?, km_agendado = ?, data_agendada = ?, data_realizada = ?, status = ? WHERE id = ?`,
      [tipo, descricao, km_agendado, data_agendada, data_realizada, status, id]
    );

    // Se vieram arquivos novos, insere na tabela de arquivos
    const files = req.files || [];
    if (files.length) {
      try {
        const rows = files.map(f => [
          id,
          'foto',
          `${f.originalname}-${Date.now()}`,
          f.originalname,
          f.mimetype,
          f.size,
          f.buffer,
          (req.user && (req.user.email || req.user.nome)) || null,
          new Date()
        ]);
        await db.promise().query(
          `INSERT INTO manutencoes_arquivos (manutencao_id, tipo, filename, original_name, mime, size, data, criado_por, criado_em) VALUES ?`,
          [rows]
        );
      } catch (err) {
        console.error('Erro inserindo arquivos no edit:', err);
        await saveFilesToDiskFallback(files, id);
      }
    }

    res.redirect(`/manutencoes/${id}`);
  } catch (err) {
    console.error('POST /manutencoes/:id/edit', err);
    res.status(500).send('Erro ao atualizar manutenção');
  }
});

// EXCLUIR manutenção (POST)
app.post('/manutencoes/:id/delete', isAuthenticated, isAdmin, csrfProtection, async (req, res) => {
  try {
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).send('ID inválido');

    // Remove arquivos do DB (e opcionalmente do disco se você salvar lá)
    await db.promise().query('DELETE FROM manutencoes_arquivos WHERE manutencao_id = ?', [id]);
    await db.promise().query('DELETE FROM manutencoes_manuais WHERE id = ?', [id]);

    try { if (typeof io !== 'undefined') io.emit('maintenanceDeleted', { id }); } catch (e) { }

    res.redirect('/manutencoes');
  } catch (err) {
    console.error('POST /manutencoes/:id/delete', err);
    res.status(500).send('Erro ao excluir manutenção');
  }
});

// VER detalhe + anexos
app.get('/manutencoes/:id', isAuthenticated, csrfProtection, async (req, res) => {
  try {
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).send('ID inválido');

    const [rows] = await db.promise().query(
      `SELECT m.*, v.placa, v.nome as veiculo_nome
       FROM manutencoes_manuais m JOIN veiculos v ON m.veiculo_id = v.id
       WHERE m.id = ? LIMIT 1`, [id]
    );
    if (!rows.length) return res.status(404).send('Manutenção não encontrada');
    const manut = rows[0];

    const [arquivos] = await db.promise().query(
      `SELECT id, tipo, filename, original_name, mime, size, DATE_FORMAT(criado_em, '%Y-%m-%d %H:%i') AS criado_em
       FROM manutencoes_arquivos WHERE manutencao_id = ? ORDER BY criado_em DESC`, [id]
    );

    res.render('manutencao-detalhe', {
      layout: 'layout',
      csrfToken: req.csrfToken(),
      manut,
      arquivos,
      user: req.user
    });
  } catch (err) {
    console.error('GET /manutencoes/:id', err);
    res.status(500).send('Erro interno');
  }
});

// UPLOAD extra (rota para anexar arquivos separadamente)
app.post('/manutencoes/:id/upload', isAuthenticated, isAdmin, uploadMemory.array('fotos', 10), csrfProtection, async (req, res) => {
  try {
    const manutencaoId = Number(req.params.id || 0);
    if (!manutencaoId) return res.status(400).send('ID inválido');

    // garante que a manutenção exista em manutencoes_manuais
    const [exists] = await db.promise().query('SELECT id FROM manutencoes_manuais WHERE id = ? LIMIT 1', [manutencaoId]);
    if (!exists.length) return res.status(404).send('Manutenção não encontrada (não é possível anexar)');

    const files = req.files || [];
    if (!files.length) return res.redirect(`/manutencoes/${manutencaoId}`);

    try {
      const rows = files.map(f => [
        manutencaoId,
        'foto',
        `${f.originalname}-${Date.now()}`,
        f.originalname,
        f.mimetype,
        f.size,
        f.buffer,
        (req.user && (req.user.email || req.user.nome)) || null,
        new Date()
      ]);
      await db.promise().query(
        `INSERT INTO manutencoes_arquivos (manutencao_id, tipo, filename, original_name, mime, size, data, criado_por, criado_em) VALUES ?`,
        [rows]
      );
      try { if (typeof io !== 'undefined') io.emit('maintenanceFileUploaded', { manutencaoId }); } catch (e) { }
      res.redirect(`/manutencoes/${manutencaoId}`);
    } catch (err) {
      console.error('POST /manutencoes/:id/upload', err);
      await saveFilesToDiskFallback(files, manutencaoId);
      return res.status(500).send('Não foi possível salvar anexos no banco. Arquivos salvos em disco (fallback).');
    }
  } catch (err) {
    console.error('POST /manutencoes/:id/upload outer', err);
    res.status(500).send('Erro ao enviar arquivos');
  }
});

// EXCLUIR arquivo (POST)
app.post('/manutencoes/:id/arquivo/:arquivoId/delete', isAuthenticated, isAdmin, csrfProtection, async (req, res) => {
  try {
    const manutencaoId = Number(req.params.id || 0);
    const arquivoId = Number(req.params.arquivoId || 0);
    if (!manutencaoId || !arquivoId) return res.status(400).send('IDs inválidos');

    const [rows] = await db.promise().query('SELECT id FROM manutencoes_arquivos WHERE id = ? AND manutencao_id = ? LIMIT 1', [arquivoId, manutencaoId]);
    if (!rows.length) return res.status(404).send('Arquivo não encontrado');

    await db.promise().query('DELETE FROM manutencoes_arquivos WHERE id = ?', [arquivoId]);
    try { if (typeof io !== 'undefined') io.emit('maintenanceFileDeleted', { manutencaoId, arquivoId }); } catch (e) { }
    res.redirect(`/manutencoes/${manutencaoId}`);
  } catch (err) {
    console.error('POST delete arquivo', err);
    res.status(500).send('Erro ao excluir arquivo');
  }
});




// rota para download/visualização de arquivo de manutenção
app.get('/manutencoes/arquivo/:id/download', isAuthenticated, async (req, res) => {
  try {
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).send('ID inválido');

    // Busca no DB
    const [rows] = await db.promise().query(
      `SELECT id, manutencao_id, tipo, filename, original_name, mime, size, data
       FROM manutencoes_arquivos WHERE id = ? LIMIT 1`, [id]
    );

    if (!rows.length) return res.status(404).send('Arquivo não encontrado');

    const file = rows[0];
    const isInline = String(req.query.inline || '') === '1'; // ?inline=1 para visualizar no browser

    // Caso o blob esteja preenchido no DB (data -> Buffer)
    if (file.data && file.data.length) {
      const buf = file.data; // mysql2 já retorna Buffer para BLOB
      const mime = file.mime || 'application/octet-stream';
      const originalName = file.original_name || file.filename || `arquivo-${file.id}`;
      const safeAscii = encodeURIComponent(originalName).replace(/['()]/g, escape);

      // Cabeçalhos
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Length', (file.size && Number(file.size)) || buf.length);
      // Content-Disposition: inline para visualização (images/pdf), attachment para download
      if (isInline) {
        res.setHeader('Content-Disposition', `inline; filename="${originalName.replace(/"/g, '')}" ; filename*=UTF-8''${safeAscii}`);
      } else {
        res.setHeader('Content-Disposition', `attachment; filename="${originalName.replace(/"/g, '')}" ; filename*=UTF-8''${safeAscii}`);
      }
      res.setHeader('Cache-Control', 'private, max-age=86400');
      return res.send(buf);
    }

    // Se não há blob no DB, tentar servir do disco (ajuste a pasta conforme seu app)
    // Ex: se você armazena em /uploads/manutencoes/
    const diskPath = path.join(__dirname, 'uploads', file.filename || '');
    if (file.filename && fs.existsSync(diskPath)) {
      if (isInline) return res.sendFile(diskPath);
      return res.download(diskPath, file.original_name || file.filename);
    }

    // Nenhum conteúdo encontrado
    return res.status(404).send('Arquivo não encontrado (nenhum blob e arquivo em disco ausente)');
  } catch (err) {
    console.error('Erro /manutencoes/arquivo/:id/download', err);
    return res.status(500).send('Erro ao recuperar arquivo');
  }
});







//////////////////////////////////////////////////////////////////////////////////////////////////////////////////




//////////////////////////////////////////////////////////////////////HELPER PARA ENDEREÇOS USADOS ////////////////////////
// Helper: garante que exista display_name para lat/lng na tabela enderecos_usados.
// Retorna Promise<string> com display_name (ou "lat, lng" fallback)
function getOrCreateDisplayName(db, lat, lng) {
  return new Promise((resolve, reject) => {
    if (lat == null || lng == null || lat === '' || lng === '') return resolve(null);

    const lat7 = Number(lat).toFixed(7);
    const lng7 = Number(lng).toFixed(7);

    // 1) procura no DB
    db.query('SELECT id, display_name FROM enderecos_usados WHERE lat = ? AND lng = ? LIMIT 1', [lat7, lng7], async (err, rows) => {
      if (err) return reject(err);
      if (rows && rows.length) {
        const rec = rows[0];
        // atualiza uso
        db.query('UPDATE enderecos_usados SET usage_count = usage_count + 1, last_used_at = NOW() WHERE id = ?', [rec.id], () => {
          // ignorar callback de update
          return resolve(rec.display_name);
        });
        return;
      }

      // 2) se não existe, chama Nominatim (uma única vez)
      const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat7}&lon=${lng7}&addressdetails=0`;
      let display = `${lat7}, ${lng7}`;
      try {
        const r = await fetch(nomUrl, {
          headers: {
            'User-Agent': 'SeuAppNome/1.0 (seu-email@exemplo.com)',
            'Referer': 'https://seu-dominio.com'
          },
          timeout: 8000
        });
        if (r.ok) {
          const js = await r.json();
          if (js && js.display_name) display = ('' + js.display_name).substring(0, 1020);
        }
      } catch (e) {
        console.warn('Nominatim falhou (server-side):', e && e.message ? e.message : e);
      }

      // 3) insere no DB (tratando race condition)
      db.query('INSERT INTO enderecos_usados (lat, lng, display_name, usage_count, last_used_at) VALUES (?, ?, ?, 1, NOW())', [lat7, lng7, display], (insErr) => {
        if (insErr) {
          // possivelmente outra request inseriu antes -> tentar atualizar contador
          db.query('UPDATE enderecos_usados SET usage_count = usage_count + 1, last_used_at = NOW() WHERE lat = ? AND lng = ?', [lat7, lng7], (updErr) => {
            if (updErr) {
              // se falhar, ainda retornamos o display calculado
              console.warn('Erro atualizando enderecos_usados pós-insert:', updErr);
            }
            return resolve(display);
          });
        } else {
          return resolve(display);
        }
      });
    });
  });
}

////////////////////////////////////////////////////////////INICIO USO VEICULOS  ////////////////////
// Parser Multer para um único arquivo foto_km
const uploadSingleFoto = multer({
  storage,
  limits: { fileSize: 1000 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Só imagens são permitidas'), false);
    }
    cb(null, true);
  }
}).single('foto_km');


app.post('/usar/:id', isAuthenticated, uploadSingleFoto, csrfProtection, (req, res) => {
  const { id } = req.params; // ID do veículo

  // Campos vindos do formulário (incluindo os novos start/end lat/lng)
  const {
    km_inicial,
    km_final,
    data_hora_inicial,
    data_hora_final,
    finalidade,
    descricao,
    start_lat,
    start_lng,
    end_lat,
    end_lng
  } = req.body;

  const foto_km = req.file ? req.file.filename : null;
  const motoristaEmail = req.user.email; // Email do usuário autenticado

  if (!km_inicial) {
    return res.status(400).send('Campos obrigatórios faltando');
  }

  // Busca os dados do veículo
  db.query('SELECT * FROM veiculos WHERE id = ?', [id], (err, veiculoResult) => {
    if (err) {
      console.error("Erro ao buscar veículo:", err);
      return res.status(500).send("Erro ao buscar o veículo.");
    }
    if (veiculoResult.length === 0) {
      return res.status(404).send("Veículo não encontrado");
    }
    const veiculo = veiculoResult[0];

    // Valida o km_inicial
    const expectedKmInicial = veiculo.km;
    const kmInicialParsed = parseInt(km_inicial, 10);
    if (kmInicialParsed !== expectedKmInicial) {
      return res.status(400).send("Erro: O km inicial deve ser igual ao km atual do veículo.");
    }

    // Converte e valida o km_final
    const kmFinalParsed = parseInt(km_final, 10);
    const kmFinalValue = (km_final === '' || isNaN(kmFinalParsed)) ? null : kmFinalParsed;
    if (kmFinalValue !== null && kmFinalValue < kmInicialParsed) {
      return res.status(400).send("Erro: km final não pode ser menor que km inicial");
    }

    const dataHoraInicial = new Date(data_hora_inicial);
    const dataHoraFinal = data_hora_final ? new Date(data_hora_final) : null;
    const newEnd = dataHoraFinal ? dataHoraFinal : new Date('9999-12-31');

    // Verifica o cadastro de motoristas
    db.query('SELECT * FROM motoristas WHERE email = ?', [motoristaEmail], (err, motoristaResult) => {
      if (err) {
        console.error("Erro ao buscar motorista:", err);
        return res.status(500).send("Erro ao buscar o motorista.");
      }
      if (motoristaResult.length === 0) {
        return res.status(400).send("Erro: Usuário não possui cadastro de motorista.");
      }
      const motoristasComCNHValida = motoristaResult.filter(m => {
        return new Date(m.data_validade) >= new Date();
      });
      if (motoristasComCNHValida.length === 0) {
        return res.status(400).send("Erro: A CNH do motorista está vencida.");
      }

      // Verifica sobreposição de uso
      db.query(
        `SELECT * FROM uso_veiculos 
         WHERE (veiculo_id = ? OR motorista = ?)
           AND (data_hora_inicial < ?)
           AND ((data_hora_final IS NULL) OR (data_hora_final > ?))`,
        [id, motoristaEmail, newEnd, dataHoraInicial],
        (err, overlapResult) => {
          if (err) {
            console.error("Erro na verificação de sobreposição:", err);
            return res.status(500).send("Erro interno");
          }
          if (overlapResult.length > 0) {
            return res.status(400).send("Erro: Já existe um uso nesse período.");
          }

          // ---------- AQUI: garantimos display_name em enderecos_usados para start e end ----------
          // Usamos Promises para orquestrar as chamadas Nominatim/DB sem bloquear demais.
          Promise.all([
            getOrCreateDisplayName(db, start_lat, start_lng),
            getOrCreateDisplayName(db, end_lat, end_lng)
          ]).then(([startDisplay, endDisplay]) => {
            // startDisplay / endDisplay podem ser null se lat/lng não vierem preenchidos — tudo ok

            // Insere o registro de uso incluindo os novos campos start/end
            db.query(
              `INSERT INTO uso_veiculos
                (veiculo_id, motorista, km_inicial, km_final,
                 data_hora_inicial, data_hora_final, foto_km,
                 finalidade, descricao,
                 start_lat, start_lng, end_lat, end_lng)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                id,
                motoristaEmail,
                km_inicial,
                kmFinalValue,
                dataHoraInicial,
                dataHoraFinal,
                foto_km,
                finalidade,
                descricao,
                start_lat || null,
                start_lng || null,
                end_lat || null,
                end_lng || null
              ],
              (err, result) => {
                if (err) {
                  console.error("Erro ao inserir uso de veículo:", err);
                  return res.status(500).send("Erro interno ao registrar uso.");
                }

                // Se km_final for informado, atualiza o km do veículo e dispara verificações
                if (kmFinalValue !== null) {
                  db.query(
                    'UPDATE veiculos SET km = ? WHERE id = ?',
                    [kmFinalValue, id],
                    (err) => {
                      if (err) console.error("Erro ao atualizar km:", err);
                      else {
                        checkOilChangeForVehicle(id);
                        db.query('SELECT * FROM veiculos WHERE id = ?', [id], (err, updatedResult) => {
                          if (!err && updatedResult.length > 0) {
                            autoGenerateMaintenance(updatedResult[0]);
                          }
                        });
                      }
                    }
                  );
                }

                // opcional: você pode retornar startDisplay/endDisplay para logs ou auditoria
                // console.log('startDisplay', startDisplay, 'endDisplay', endDisplay);

                res.redirect('/');
              }
            );

          }).catch(e => {
            console.error('Erro gerando/consultando enderecos_usados:', e);
            return res.status(500).send('Erro interno ao processar endereços.');
          });

        }
      );
    });
  });
});

const uploadOptionalFoto = multer({
  storage,
  limits: { fileSize: 1000 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Só imagens são permitidas'), false);
    }
    cb(null, true);
  }
}).single('foto_km');

//////////////////////////////////////////////////FIM USO DE VEÍCULOS///////////////////////////////////////////////////////


///////////////////////ULTIMOS ENDEREÇOS///////////////////////////////////////
// GET /api/enderecos-recentes/:veiculoId?
// retorna { start: [{lat,lng,date},...], end: [{lat,lng,date},...] }
app.get('/api/enderecos-recentes/:veiculoId?', isAuthenticated, (req, res) => {
  const veiculoId = req.params.veiculoId || null;
  const paramsStart = [];
  const paramsEnd = [];

  let whereStart = 'WHERE start_lat IS NOT NULL AND start_lng IS NOT NULL';
  let whereEnd = 'WHERE end_lat IS NOT NULL AND end_lng IS NOT NULL';

  if (veiculoId) {
    whereStart += ' AND veiculo_id = ?';
    whereEnd += ' AND veiculo_id = ?';
    paramsStart.push(veiculoId);
    paramsEnd.push(veiculoId);
  }

  // Queries separadas para garantir 30 últimos de cada tipo
  const sqlStart = `SELECT start_lat AS lat, start_lng AS lng, data_criacao AS dt
                    FROM uso_veiculos ${whereStart}
                    GROUP BY start_lat, start_lng, dt
                    ORDER BY dt DESC LIMIT 30`;

  const sqlEnd = `SELECT end_lat AS lat, end_lng AS lng, data_criacao AS dt
                  FROM uso_veiculos ${whereEnd}
                  GROUP BY end_lat, end_lng, dt
                  ORDER BY dt DESC LIMIT 30`;

  db.query(sqlStart, paramsStart, (err, startRows) => {
    if (err) {
      console.error('Erro ao buscar recentes (start):', err);
      return res.status(500).json({ error: 'Erro interno' });
    }
    db.query(sqlEnd, paramsEnd, (err2, endRows) => {
      if (err2) {
        console.error('Erro ao buscar recentes (end):', err2);
        return res.status(500).json({ error: 'Erro interno' });
      }

      // Normalizar floats e remover nulos
      const start = (startRows || [])
        .filter(r => r.lat != null && r.lng != null)
        .map(r => ({ lat: parseFloat(r.lat), lng: parseFloat(r.lng), date: r.dt }));

      const end = (endRows || [])
        .filter(r => r.lat != null && r.lng != null)
        .map(r => ({ lat: parseFloat(r.lat), lng: parseFloat(r.lng), date: r.dt }));

      return res.json({ start, end });
    });
  });
});




///////////////////////////////////////EDITAR USO/////////////////////
app.post(
  '/editar-uso/:id',
  isAuthenticated,
  uploadOptionalFoto,   // Multer parseia multipart/form-data
  csrfProtection,      // depois valida CSRF
  (req, res) => {
    const { id } = req.params;
    const {
      motorista,
      km_final,
      data_hora_final,
      multas_id,
      multas_descricao,
      finalidade,
      descricao
    } = req.body;

    // 1) Permissão: só o próprio motorista
    if (req.user && req.user.email !== motorista) {
      return res.status(403).send('Você não tem permissão para editar este uso.');
    }

    // 2) Novas multas em array
    const novasMultas = req.body.novasMultas
      ? [].concat(req.body.novasMultas).filter(m => m.trim().length > 0)
      : [];

    // 3) Função auxiliar de render de erro
    function renderError(message) {
      db.query("SELECT * FROM uso_veiculos WHERE id = ?", [id], (err, results) => {
        if (err || results.length === 0) {
          return res.status(500).send("Erro ao carregar dados para exibição de erro.");
        }
        const uso = results[0];
        res.render('editarUso', {
          uso,
          errorMessage: message,
          csrfToken: req.csrfToken()
        });
      });
    }

    // 4) Validações pré-update
    if ((km_final && km_final !== '') || (data_hora_final && data_hora_final !== '')) {
      db.query(
        "SELECT km_inicial, data_hora_inicial FROM uso_veiculos WHERE id = ?",
        [id],
        (err, resultSelect) => {
          if (err) {
            console.error("Erro na verificação:", err);
            return renderError("Erro interno ao verificar os dados.");
          }
          const row = resultSelect[0];
          const kmInicialValue = parseInt(row.km_inicial, 10);

          // KM final inválido / menor que o inicial
          if (km_final && km_final !== '') {
            const kmParsed = parseInt(km_final, 10);
            if (isNaN(kmParsed)) {
              return renderError('KM final inválido.');
            }
            if (kmParsed <= kmInicialValue) {
              return renderError('KM final não pode ser menor que KM inicial.');
            }
            // limite de autonomia
            const autonomiaUno = 700;
            if (kmParsed - kmInicialValue > autonomiaUno) {
              return renderError(`O consumo (${kmParsed - kmInicialValue} km) ultrapassa a autonomia (${autonomiaUno} km).`);
            }
          }

          // Data final antes da inicial
          if (data_hora_final && data_hora_final !== '') {
            const dtFinal = new Date(data_hora_final);
            const dtInicial = new Date(row.data_hora_inicial);
            if (dtFinal < dtInicial) {
              return renderError('A data final não pode ser antes da data inicial.');
            }
          }

          // Se passou nas validações, continua
          executeUpdate();
        }
      );
    } else {
      executeUpdate();
    }

    // 5) Monta e executa o UPDATE
    function executeUpdate() {
      // a) Decide se atualiza a foto pela existência de req.file
      let updateQuery, params;
      if (req.file) {
        updateQuery = `
            UPDATE uso_veiculos
            SET motorista = ?, km_final = ?, data_hora_final = ?, foto_km = ?, finalidade = ?, descricao = ?
            WHERE id = ?
          `;
        params = [
          motorista,
          km_final === '' ? null : km_final,
          data_hora_final === '' ? null : data_hora_final,
          req.file.filename,
          finalidade,
          descricao,
          id
        ];
      } else {
        updateQuery = `
            UPDATE uso_veiculos
            SET motorista = ?, km_final = ?, data_hora_final = ?, finalidade = ?, descricao = ?
            WHERE id = ?
          `;
        params = [
          motorista,
          km_final === '' ? null : km_final,
          data_hora_final === '' ? null : data_hora_final,
          finalidade,
          descricao,
          id
        ];
      }

      // b) Executa o UPDATE principal
      db.query(updateQuery, params, (err) => {
        if (err) {
          console.error("Erro ao atualizar uso:", err);
          return renderError('Erro ao atualizar o uso. Por favor, tente novamente.');
        }

        // c) Atualiza multas já existentes
        if (multas_id && multas_descricao) {
          const ids = Array.isArray(multas_id) ? multas_id : [multas_id];
          const descr = Array.isArray(multas_descricao)
            ? multas_descricao
            : [multas_descricao];
          ids.forEach((mId, idx) => {
            db.query(
              'UPDATE multas SET multa = ? WHERE id = ?',
              [descr[idx], mId],
              err => {
                if (err) console.error(`Erro ao atualizar multa ${mId}:`, err);
              }
            );
          });
        }

        // d) Se km_final veio, atualiza o km do veículo e dispara notificações
        if (km_final && km_final !== '') {
          const kmParsed = parseInt(km_final, 10);
          if (!isNaN(kmParsed)) {
            db.query(
              "SELECT veiculo_id FROM uso_veiculos WHERE id = ?",
              [id],
              (err, r2) => {
                if (!err && r2.length) {
                  const veiculo_id = r2[0].veiculo_id;
                  db.query(
                    "UPDATE veiculos SET km = ? WHERE id = ?",
                    [kmParsed, veiculo_id],
                    err => {
                      if (err) console.error("Erro ao atualizar km do veículo:", err);
                      else {
                        checkOilChangeForVehicle(veiculo_id);
                        db.query(
                          "SELECT * FROM veiculos WHERE id = ?",
                          [veiculo_id],
                          (err, up) => {
                            if (!err && up.length) {
                              autoGenerateMaintenance(up[0]);
                            }
                          }
                        );
                      }
                    }
                  );
                }
              }
            );
          }
        }

        // e) Insere novas multas, se houver
        if (novasMultas.length > 0) {
          db.query(
            "SELECT veiculo_id FROM uso_veiculos WHERE id = ?",
            [id],
            (err, r5) => {
              if (err || !r5.length) {
                return renderError("Erro ao buscar veículo para novas multas.");
              }
              const veiculo_id = r5[0].veiculo_id;
              const valores = novasMultas.map(m => [id, veiculo_id, m.trim()]);
              db.query(
                "INSERT INTO multas (uso_id, veiculo_id, multa) VALUES ?",
                [valores],
                err => {
                  if (err) {
                    console.error("Erro ao registrar novas multas:", err);
                    return renderError("Erro ao registrar novas multas.");
                  }
                  return res.redirect('/relatorio-uso');
                }
              );
            }
          );
        } else {
          // f) Se não há novas multas, só redireciona
          res.redirect('/relatorio-uso');
        }
      });
    }
  }
);






// Rota pra marcar que a troca de óleo foi feita
app.post('/troca-feita/:id', isAuthenticated, isAdmin, csrfProtection, (req, res) => {
  const { id } = req.params;
  // Atualiza a última troca com o km atual
  db.query('UPDATE veiculos SET ultimaTrocaOleo = km WHERE id = ?', [id], (err, result) => {
    if (err) {
      console.error("Erro ao atualizar troca de óleo:", err);
      return res.status(500).send("Erro ao atualizar troca de óleo.");
    }
    console.log(`Veículo ${id}: troca de óleo registrada.`);
    res.redirect('/notificacoes');
  });
});

// Rota pra excluir uma multa
app.post('/excluir-multa/:id', isAuthenticated, isAdmin, csrfProtection, (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM multas WHERE id = ?", [id], (err, result) => {
    if (err) {
      console.error("Erro ao excluir multa:", err);
      return res.status(500).send("Erro ao excluir multa.");
    }
    res.redirect('back');
  });
});

// Rota pra excluir uso e suas multas
app.post('/excluir-uso/:id', isAuthenticated, isAdmin, csrfProtection, (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM multas WHERE uso_id = ?", [id], (err, result) => {
    if (err) {
      console.error("Erro ao excluir multas:", err);
      return res.status(500).send("Erro ao excluir multas.");
    }
    db.query("DELETE FROM uso_veiculos WHERE id = ?", [id], (err, result) => {
      if (err) {
        console.error("Erro ao excluir uso:", err);
        return res.status(500).send("Erro ao excluir uso.");
      }
      res.redirect('/relatorio-uso');
    });
  });
});

app.post('/excluir-multiplos-usos', isAuthenticated, isAdmin, csrfProtection, (req, res) => {
  let { ids } = req.body;

  if (!ids) {
    return res.status(400).json({ message: 'IDs inválidos.' });
  }

  // Certifica  que `ids` seja um array de números
  if (typeof ids === 'string') {
    ids = ids.split(',').map(id => Number(id.trim()));
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'IDs inválidos.' });
  }

  //console.log('IDs para exclusão:', ids);

  // Obtém uma conexão do pool
  db.getConnection((err, connection) => {
    if (err) {
      console.error('Erro ao obter conexão:', err);
      return res.status(500).json({ message: 'Erro ao obter conexão.' });
    }

    connection.beginTransaction(err => {
      if (err) {
        connection.release();
        console.error('Erro ao iniciar transação:', err);
        return res.status(500).json({ message: 'Erro ao iniciar transação.' });
      }

      // Corrige a query de DELETE para múltiplos IDs
      const placeholders = ids.map(() => '?').join(',');
      const queryMultas = `DELETE FROM multas WHERE uso_id IN (${placeholders})`;

      connection.query(queryMultas, ids, (err, resultMultas) => {
        if (err) {
          console.error('Erro ao excluir multas:', err);
          return connection.rollback(() => {
            connection.release();
            res.status(500).json({ message: 'Erro ao excluir multas.' });
          });
        }

        const queryUso = `DELETE FROM uso_veiculos WHERE id IN (${placeholders})`;

        connection.query(queryUso, ids, (err, resultUso) => {
          if (err) {
            console.error('Erro ao excluir usos:', err);
            return connection.rollback(() => {
              connection.release();
              res.status(500).json({ message: 'Erro ao excluir usos.' });
            });
          }

          if (resultUso.affectedRows === 0) {
            return connection.rollback(() => {
              connection.release();
              res.status(404).json({ message: 'Nenhum registro encontrado.' });
            });
          }

          connection.commit(err => {
            if (err) {
              console.error('Erro ao commitar transação:', err);
              return connection.rollback(() => {
                connection.release();
                res.status(500).json({ message: 'Erro ao finalizar exclusão.' });
              });
            }
            connection.release();
            res.json({ message: 'Registros excluídos com sucesso.' });
          });
        });
      });
    });
  });
});




// util
function detectImageMime(buffer) {
  if (!buffer || buffer.length < 4) return 'application/octet-stream';
  const hex = buffer.slice(0, 4).toString('hex').toLowerCase();
  if (hex.startsWith('ffd8')) return 'image/jpeg';
  if (hex === '89504e47') return 'image/png';
  if (hex.startsWith('47494638')) return 'image/gif';
  try {
    const head = buffer.slice(0, 12).toString('utf8');
    if (head.includes('WEBP')) return 'image/webp';
  } catch (e) { }
  return 'application/octet-stream';
}

// ▶️ Rota GET /editar-veiculo/:id — carrega veículo + lista de devices
app.get('/editar-veiculo/:id', isAuthenticated, csrfProtection, async (req, res) => {
  const id = req.params.id;
  try {
    // 1) Busca dados do veículo no controle_frota
    const [rows] = await db.promise().query(
      "SELECT * FROM veiculos WHERE id = ?", [id]
    );
    if (rows.length === 0) {
      return res.status(404).send("Veículo não encontrado.");
    }
    const veiculo = rows[0];

    // 2) Busca todos os devices no banco GPS (sua função queryGps)
    const devices = await queryGps(
      `SELECT dev_id, dev_name
         FROM devices
        ORDER BY dev_name`
    );

    // 3) Renderiza a view passando veiculo + devices
    res.render('editar-veiculo', {
      layout: 'layout',
      title: 'Editar Veículo',
      activePage: 'editar-veiculo',
      user: req.user,
      csrfToken: req.csrfToken(),
      veiculo,
      devices
    });
  } catch (err) {
    console.error("Erro ao carregar edição de veículo:", err);
    res.status(500).send("Erro interno ao carregar formulário.");
  }
});


// Serve foto da frente
app.get('/veiculos/:id/foto_frente', isAuthenticated, async (req, res) => {
  try {
    const id = req.params.id;
    const [rows] = await db.promise().query('SELECT foto_frente FROM veiculos WHERE id = ?', [id]);
    if (!rows || rows.length === 0 || !rows[0].foto_frente) return res.status(404).send('No image');
    const buffer = rows[0].foto_frente;
    res.type(detectImageMime(buffer));
    return res.send(buffer);
  } catch (err) {
    console.error('Erro ao servir foto_frente:', err);
    return res.status(500).send('Erro');
  }
});

app.get('/veiculos/:id/foto_traseira', isAuthenticated, async (req, res) => {
  try {
    const id = req.params.id;
    const [rows] = await db.promise().query('SELECT foto_traseira FROM veiculos WHERE id = ?', [id]);
    if (!rows || rows.length === 0 || !rows[0].foto_traseira) return res.status(404).send('No image');
    const buffer = rows[0].foto_traseira;
    res.type(detectImageMime(buffer));
    return res.send(buffer);
  } catch (err) {
    console.error('Erro ao servir foto_traseira:', err);
    return res.status(500).send('Erro');
  }
});

app.get('/veiculos/:id/foto_banco', isAuthenticated, async (req, res) => {
  try {
    const id = req.params.id;
    const [rows] = await db.promise().query('SELECT foto_banco FROM veiculos WHERE id = ?', [id]);
    if (!rows || rows.length === 0 || !rows[0].foto_banco) return res.status(404).send('No image');
    const buffer = rows[0].foto_banco;
    res.type(detectImageMime(buffer));
    return res.send(buffer);
  } catch (err) {
    console.error('Erro ao servir foto_banco:', err);
    return res.status(500).send('Erro');
  }
});


// ▶️ Rota POST /editar-veiculo/:id — aceita upload de imagens e mantém lógica
app.post(
  '/editar-veiculo/:id',
  isAuthenticated,
  // multer EM MEMÓRIA ANTES do csrfProtection
  uploadMemory.fields([
    { name: 'foto_frente', maxCount: 1 },
    { name: 'foto_traseira', maxCount: 1 },
    { name: 'foto_banco', maxCount: 1 }
  ]),
  csrfProtection,
  async (req, res) => {
    const id = req.params.id;

    // aceita ambos nomes de campo (frontend: km_justificativa). Mantém compatibilidade.
    const {
      nome,
      placa,
      km,
      ultimaTrocaOleo,
      modelo,
      ano,
      cor,
      device_id,
      marca,
      dispositivo,
      renavam,
      chassi,
      ano_fabricacao,
      ano_modelo,
      tipologia,
      licenciamento,
      seguro_dpvat,
      crlv,
      status_ipva,
      tipo_combustivel,
      capacidade_carga,
      capacidade_passageiros,
      potencia_motor,
      dimensoes,
      calibragem_psi,
      calibragem_data,
      calibragem_notes,
      calibragem_pneus: clientHiddenCalib,
      venc_extintor,
      venc_triangulo,
      venc_colete
    } = req.body;

    // pega justificativa aceitando os dois nomes possíveis
    const justificativaKm = (req.body.km_justificativa || req.body.justificativaKm || '').trim();

    // buffers enviados (opcionais)
    const foto_frente_buf = req.files?.foto_frente?.[0]?.buffer || null;
    const foto_traseira_buf = req.files?.foto_traseira?.[0]?.buffer || null;
    const foto_banco_buf = req.files?.foto_banco?.[0]?.buffer || null;

    const toNullIfEmpty = v => (v === undefined || v === null || String(v).trim() === '' ? null : v);
    const toInt = v => {
      if (v === undefined || v === null || String(v).trim() === '') return null;
      const num = parseInt(String(v).replace(/\D/g, ''), 10);
      return Number.isFinite(num) ? num : null;
    };

    function buildCalibStringServer(psi, date, notes) {
      const parts = [];
      if (psi && String(psi).trim() !== '') parts.push(`${String(psi).trim()} PSI`);
      if (date && String(date).trim() !== '') parts.push(`em ${String(date).trim()}`);
      if (notes && String(notes).trim() !== '') parts.push(`- ${String(notes).trim()}`);
      return parts.length ? parts.join(' ') : null;
    }

    // helper normalize (mantém compat com a rota /registrar-veiculo)
    const normalize = v => (v === '' ? null : v);

    // função para resolver nomes FIPE
    const BASE_FIPE = 'https://parallelum.com.br/fipe/api/v1';
    async function resolveFipeNames(marcaVal, modeloVal) {
      let nome_marca = null;
      let nome_modelo = null;
      try {
        if (!marcaVal && !modeloVal) return { nome_marca: null, nome_modelo: null };

        const marcaIsCode = marcaVal && /^[0-9]+$/.test(String(marcaVal).trim());
        const modeloIsCode = modeloVal && /^[0-9]+$/.test(String(modeloVal).trim());

        // resolve nome da marca
        if (marcaVal) {
          if (marcaIsCode) {
            try {
              const resp = await axios.get(`${BASE_FIPE}/carros/marcas`);
              const marcas = Array.isArray(resp.data) ? resp.data : [];
              const found = marcas.find(m => String(m.codigo) === String(marcaVal) || String(m.id) === String(marcaVal));
              if (found) nome_marca = found.nome || found.name || null;
            } catch (e) {
              console.warn('FIPE: falha ao buscar marcas', e && e.message);
            }
          } else {
            nome_marca = marcaVal || null;
          }
        }

        // resolve nome do modelo (precisa do código da marca para endpoint específico)
        if (modeloVal) {
          if (modeloIsCode && marcaIsCode) {
            try {
              const resp = await axios.get(`${BASE_FIPE}/carros/marcas/${marcaVal}/modelos`);
              const modelos = Array.isArray(resp.data) ? resp.data : (Array.isArray(resp.data.modelos) ? resp.data.modelos : []);
              const foundM = modelos.find(m => String(m.codigo) === String(modeloVal) || String(m.id) === String(modeloVal));
              if (foundM) nome_modelo = foundM.nome || foundM.name || foundM.modelName || null;
            } catch (e) {
              console.warn('FIPE: falha ao buscar modelos da marca', marcaVal, e && e.message);
            }
          } else {
            nome_modelo = modeloVal || null;
          }
        }

        // fallback para os valores recebidos quando não conseguiu resolver via FIPE
        if (!nome_marca && marcaVal) nome_marca = String(marcaVal).trim();
        if (!nome_modelo && modeloVal) nome_modelo = String(modeloVal).trim();

        return { nome_marca, nome_modelo };
      } catch (e) {
        console.warn('Erro resolvendo FIPE names:', e && e.message);
        return { nome_marca: (marcaVal || null), nome_modelo: (modeloVal || null) };
      }
    }

    const conn = await db.promise().getConnection();
    try {
      await conn.beginTransaction();

      // busca dados necessários do veículo (para comparação e fallback)
      const [rowsVehicle] = await conn.query(
        "SELECT km, placa, modelo, ultimaTrocaOleo, marca, nome_marca, nome_modelo FROM veiculos WHERE id = ? FOR UPDATE",
        [id]
      );
      if (!rowsVehicle || rowsVehicle.length === 0) {
        await conn.rollback(); conn.release();
        return res.status(404).send("Veículo não encontrado.");
      }
      const vehicle = rowsVehicle[0];
      const currentKm = (vehicle.km === null || vehicle.km === undefined) ? null : parseInt(vehicle.km, 10);
      const newKmInt = toInt(km);

      // justificativa obrigatória se KM final for diferente do atual (inclui null -> número)
      const kmsDifferent = (newKmInt !== currentKm);
      if (kmsDifferent) {
        if (!justificativaKm) {
          await conn.rollback(); conn.release();
          return res.status(400).send("Justificativa obrigatória ao alterar quilometragem.");
        }
      }

      // checa uso em andamento
      const [usageRows] = await conn.query(
        `SELECT COUNT(*) AS count FROM uso_veiculos
         WHERE veiculo_id = ? AND (km_final IS NULL OR data_hora_final IS NULL)`,
        [id]
      );
      if (usageRows[0].count > 0) {
        await conn.rollback(); conn.release();
        return res.status(400).send("Não é possível editar: uso em andamento.");
      }

      // monta calibragem (prioriza campos individuais; senão usa hidden legacy)
      let finalCalib = buildCalibStringServer(calibragem_psi, calibragem_data, calibragem_notes);
      if (!finalCalib && clientHiddenCalib && String(clientHiddenCalib).trim() !== '') {
        finalCalib = String(clientHiddenCalib).trim();
      }

      // fallback ultimaTrocaOleo se não enviado (evita inserir NULL em campo NOT NULL)
      const finalUltimaTrocaOleo = (ultimaTrocaOleo !== undefined && String(ultimaTrocaOleo).trim() !== '')
        ? ultimaTrocaOleo
        : vehicle.ultimaTrocaOleo;

      // --- resolve nomes FIPE para gravação: usa valor recebido quando presente, senão usa o existente no DB ---
      const marcaToResolve = (marca && String(marca).trim() !== '') ? marca : vehicle.marca;
      const modeloToResolve = (modelo && String(modelo).trim() !== '') ? modelo : vehicle.modelo;

      let resolvedNames = { nome_marca: vehicle.nome_marca || null, nome_modelo: vehicle.nome_modelo || null };
      try {
        // só chama FIPE se houver algo a resolver (marcaToResolve/modeloToResolve podem ser null)
        resolvedNames = await resolveFipeNames(marcaToResolve, modeloToResolve);
      } catch (e) {
        console.warn('Erro ao resolver FIPE no editar (fallback):', e && e.message);
        // mantém resolvedNames como os existentes (vehicle.nome_marca/nome_modelo)
        resolvedNames = {
          nome_marca: vehicle.nome_marca || (marcaToResolve ? String(marcaToResolve).trim() : null),
          nome_modelo: vehicle.nome_modelo || (modeloToResolve ? String(modeloToResolve).trim() : null)
        };
      }
      const nome_marca_resolved = resolvedNames.nome_marca;
      const nome_modelo_resolved = resolvedNames.nome_modelo;

      // monta UPDATE dinâmico com nome_modelo e nome_marca
      const setParts = [
        'nome = ?',                // 1
        'placa = ?',               // 2
        'km = ?',                  // 3
        'ultimaTrocaOleo = ?',     // 4
        'modelo = ?',              // 5
        'nome_modelo = ?',         // 6  <-- novo
        'ano = ?',                 // 7
        'cor = ?',                 // 8
        'device_id = ?',           // 9
        'marca = ?',               // 10
        'nome_marca = ?',          // 11 <-- novo
        'dispositivo = ?',         // 12
        'renavam = ?',             // 13
        'chassi = ?',              // 14
        'ano_fabricacao = ?',      // 15
        'ano_modelo = ?',          // 16
        'tipologia = ?',           // 17
        'licenciamento = ?',       // 18
        'seguro_dpvat = ?',        // 19
        'crlv = ?',                // 20
        'status_ipva = ?',         // 21
        'tipo_combustivel = ?',    // 22
        'capacidade_carga = ?',    // 23
        'capacidade_passageiros = ?',// 24
        'potencia_motor = ?',      // 25
        'dimensoes = ?',           // 26
        'calibragem_pneus = ?',    // 27
        'venc_extintor = ?',       // 28
        'venc_triangulo = ?',      // 29
        'venc_colete = ?'         // 30
      ];

      const params = [
        toNullIfEmpty(nome),                                   // 1
        toNullIfEmpty(placa),                                  // 2
        newKmInt,                                              // 3
        finalUltimaTrocaOleo,                                  // 4
        toNullIfEmpty(modelo),                                 // 5
        (nome_modelo_resolved ? String(nome_modelo_resolved).trim() : null), //6
        toNullIfEmpty(ano),                                    //7
        toNullIfEmpty(cor),                                    //8
        toNullIfEmpty(device_id),                              //9
        toNullIfEmpty(marca),                                  //10
        (nome_marca_resolved ? String(nome_marca_resolved).trim() : null), //11
        toNullIfEmpty(dispositivo),                            //12
        toNullIfEmpty(renavam),                                //13
        toNullIfEmpty(chassi),                                 //14
        toNullIfEmpty(ano_fabricacao),                         //15
        toNullIfEmpty(ano_modelo),                             //16
        toNullIfEmpty(tipologia),                              //17
        normalize(licenciamento),                              //18
        normalize(seguro_dpvat),                               //19
        normalize(crlv),                                       //20
        status_ipva || null,                                   //21
        tipo_combustivel || null,                              //22
        capacidade_carga || null,                              //23
        capacidade_passageiros || null,                        //24
        potencia_motor || null,                                //25
        dimensoes || null,                                     //26
        finalCalib,                                            //27
        toNullIfEmpty(venc_extintor),                          //28
        toNullIfEmpty(venc_triangulo),                         //29
        toNullIfEmpty(venc_colete)                             //30
      ];

      // inclui colunas de foto apenas se novos arquivos foram enviados (substituem a existente)
      if (foto_frente_buf) { setParts.push('foto_frente = ?'); params.push(foto_frente_buf); }
      if (foto_traseira_buf) { setParts.push('foto_traseira = ?'); params.push(foto_traseira_buf); }
      if (foto_banco_buf) { setParts.push('foto_banco = ?'); params.push(foto_banco_buf); }

      // WHERE id
      const sql = `UPDATE veiculos SET ${setParts.join(', ')} WHERE id = ?`;
      params.push(id);

      // execução
      await conn.query(sql, params);

      // notificação / log se km mudou
      if (kmsDifferent) {
        const userEmail = (req.user && req.user.email) ? req.user.email : 'usuário desconhecido';
        const placaVal = vehicle.placa || placa || '';
        const modeloVal = vehicle.modelo || modelo || '';
        const msg = `Usuário (${userEmail}) alterou quilometragem do veículo ${placaVal} (${modeloVal}) de ${currentKm === null ? 'nulo' : currentKm} para ${newKmInt}. Justificativa: ${justificativaKm}`;
        // exemplo: substituir inserção simples por:
        await conn.query(
          "INSERT INTO notificacoes (mensagem, data_hora, lida, tipo, user_id) VALUES (?, NOW(), 0, ?, ?)",
          [msg, 'manutencao', null] // ajuste tipo/user_id conforme necessidade
        );


        // opcional: gravar histórico de mudanças (recomendo ter tabela km_logs)
        try {
          await conn.query(
            `INSERT INTO km_logs (veiculo_id, km_antigo, km_novo, justificativa, usuario_email, data_hora)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [id, currentKm, newKmInt, justificativaKm, (req.user && req.user.email) ? req.user.email : null]
          );
        } catch (e) {
          // não falha a transação apenas por falta de tabela de logs
          console.warn('km_logs insert falhou (tabela pode não existir):', e.message || e);
        }
      }

      await conn.commit();
      conn.release();
      return res.redirect('/');
    } catch (err) {
      try { await conn.rollback(); } catch (e) { /* ignore */ }
      conn.release();
      console.error("Erro ao atualizar veículo (editar):", err);
      if (err && err.name === 'MulterError') {
        return res.status(400).send(err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo excede limite' : 'Erro no upload');
      }
      return res.status(500).send("Erro interno ao atualizar.");
    }
  }
);







/*
app.post(
  '/excluir-veiculo/:id',
  isAuthenticated,
  isAdmin,
  csrfProtection,
  async (req, res) => {
    const id = req.params.id;
    try {
      // 1) Exclui manutenções
      await query('DELETE FROM manutencoes    WHERE veiculo_id = ?', [id]);
      // 2) Exclui multas
      await query('DELETE FROM multas         WHERE veiculo_id = ?', [id]);
      // 3) Exclui usos de veículo
      await query('DELETE FROM uso_veiculos   WHERE veiculo_id = ?', [id]);

      // 4) Agora sim exclui o veículo
      await query('DELETE FROM veiculos       WHERE id = ?', [id]);

      return res.redirect('/');
    } catch (err) {
      console.error('Erro ao excluir veículo:', err);
      // Se for erro de FK, avise de outro jeito:
      if (err.code === 'ER_ROW_IS_REFERENCED_2') {
        return res.status(400).send('Ainda existem dados dependentes. Limpe multas, manutenções e usos antes.');
      }
      return res.status(500).send('Erro ao excluir veículo.');
    }
  }
);
*/
app.post('/excluir-veiculo/:id', isAuthenticated, isAdmin, csrfProtection, async (req, res) => {
  const id = req.params.id;
  const conn = await db.promise().getConnection();
  try {
    await conn.beginTransaction();

    await conn.query('DELETE FROM manutencoes WHERE veiculo_id = ?', [id]);
    await conn.query('DELETE FROM manutencoes_manuais WHERE veiculo_id = ?', [id]);

    await conn.query(
      `DELETE ma FROM manutencoes_arquivos ma
       LEFT JOIN manutencoes m ON m.id = ma.manutencao_id
       LEFT JOIN manutencoes_manuais mm ON mm.id = ma.manutencao_id
       WHERE COALESCE(m.veiculo_id, mm.veiculo_id) = ?`,
      [id]
    );

    await conn.query('DELETE FROM multas WHERE veiculo_id = ?', [id]);
    await conn.query('DELETE FROM uso_veiculos WHERE veiculo_id = ?', [id]);
    await conn.query('DELETE FROM veiculos WHERE id = ?', [id]);

    await conn.commit();
    conn.release();
    return res.redirect('/');
  } catch (err) {
    await conn.rollback().catch(() => { });
    conn.release();
    console.error('Erro ao excluir veículo (transação):', err);
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).send('Ainda existem dados dependentes. Limpe multas, manutenções e usos antes.');
    }
    return res.status(500).send('Erro ao excluir veículo.');
  }
});


// ----------------------
// ROTA /notificacoes (corrigida)
// ----------------------
app.get('/notificacoes', isAuthenticated, isAdmin, csrfProtection, async (req, res) => {
  try {
    // Query para veículos que precisam trocar óleo
    const oilQuery = `
      SELECT id, placa, nome, km, ultimaTrocaOleo, (km - ultimaTrocaOleo) AS kmDesdeUltimaTroca
      FROM veiculos
      WHERE (km - ultimaTrocaOleo) >= 10000
    `;

    // Query para notificações de km editado (mantém todos os campos, incluindo lida)
    const notifQuery = `
      SELECT id, mensagem, data_hora, lida, tipo, user_id
      FROM notificacoes
      ORDER BY data_hora DESC
      LIMIT 500
    `;

    // Buscar veículos e notificações em paralelo
    const [oilResults] = await db.promise().query(oilQuery);
    const [notifResults] = await db.promise().query(notifQuery);

    // Para cada veículo, procurar a notificação de óleo mais recente que contenha a placa no texto
    // (se não houver, deixamos notificacao_id = '' e lida = 0)
    // Usamos Promise.all para paralelizar as pequenas queries
    const vehiclesWithNotif = await Promise.all(oilResults.map(async (v) => {
      try {
        const [rows] = await db.promise().query(
          `SELECT id, lida FROM notificacoes
           WHERE (tipo IN ('oleo','oil') OR tipo LIKE '%oleo%')
             AND mensagem LIKE ?
           ORDER BY data_hora DESC
           LIMIT 1`,
          [`%${v.placa}%`]
        );

        if (rows && rows[0]) {
          v.notificacao_id = rows[0].id;
          v.lida = Number(rows[0].lida) === 1 ? 1 : 0;
        } else {
          v.notificacao_id = '';
          v.lida = 0;
        }
      } catch (e) {
        // se der erro na subquery, não travamos a renderização; apenas registramos e seguimos
        console.warn('Erro ao buscar notificação por placa para veículo', v.id, e && e.message ? e.message : e);
        v.notificacao_id = '';
        v.lida = 0;
      }
      return v;
    }));

    // Renderiza a view com veículos já anotados com notificacao_id e lida
    return res.render('notificacoes', {
      oilVehicles: vehiclesWithNotif,
      csrfToken: req.csrfToken(),
      kmNotifications: notifResults,
      title: 'Notificações',
      layout: 'layout',
      activePage: 'notificacoes',
      user: req.user
    });
  } catch (err) {
    console.error('Erro rota /notificacoes:', err);
    return res.status(500).send('Erro no servidor');
  }
});

// ----------------------
// createNotification (apenas 1 cópia, sem erros de sintaxe)
// ----------------------
async function createNotification(mensagem, tipo = 'geral', user_id = null, extra = {}) {
  try {
    await db.promise().query(
      "INSERT INTO notificacoes (mensagem, data_hora, lida, tipo, user_id) VALUES (?, NOW(), 0, ?, ?)",
      [mensagem, tipo, user_id]
    );

    const payload = Object.assign({ mensagem, tipo, user_id }, extra || {});
    try { if (typeof io !== 'undefined' && io && typeof io.emit === 'function') io.emit('newNotification', payload); } catch (e) { /* ignore */ }

    if (tipo === 'oleo') {
      try { if (typeof io !== 'undefined' && io && typeof io.emit === 'function') io.emit('oilChangeNotification', payload); } catch (e) { /* ignore */ }
    } else if (tipo === 'manutencao') {
      try { if (typeof io !== 'undefined' && io && typeof io.emit === 'function') io.emit('manutencao:criada', payload); } catch (e) { /* ignore */ }
    } else if (tipo === 'manutencao_realizada') {
      try { if (typeof io !== 'undefined' && io && typeof io.emit === 'function') io.emit('manutencao:realizada', payload); } catch (e) { /* ignore */ }
    }
  } catch (err) {
    console.error('createNotification error:', err);
  }
}



// Helper: filtrar por usuário autenticado (user_id OR user_id IS NULL)
function buildUserFilter(req) {
  if (req && req.user && Number.isInteger(req.user.id)) {
    return { clause: 'AND (user_id = ? OR user_id IS NULL)', params: [req.user.id] };
  }
  return { clause: '', params: [] };
}

// GET /notifications/unread-count
app.get('/notifications/unread-count', isAuthenticated, async (req, res) => {
  try {
    const uf = buildUserFilter(req);
    const [rows] = await db.promise().query(
      `SELECT COUNT(*) AS cnt FROM notificacoes WHERE lida = 0 ${uf.clause}`,
      uf.params
    );
    return res.json({ count: rows && rows[0] ? Number(rows[0].cnt || 0) : 0 });
  } catch (err) {
    console.error('GET /notifications/unread-count error:', err);
    return res.status(500).json({ count: 0 });
  }
});

// GET /notifications/list
app.get('/notifications/list', isAuthenticated, async (req, res) => {
  try {
    const uf = buildUserFilter(req);
    const sql = `
      SELECT id, mensagem, lida, tipo, user_id, COALESCE(data_hora, NOW()) AS criado_em
      FROM notificacoes
      WHERE 1=1 ${uf.clause}
      ORDER BY COALESCE(data_hora, criado_em) DESC
      LIMIT 500
    `;
    const [rows] = await db.promise().query(sql, uf.params);
    return res.json(Array.isArray(rows) ? rows : []);
  } catch (err) {
    console.error('GET /notifications/list error:', err);
    return res.status(500).json([]);
  }
});

// POST /notifications/mark-read/:id
app.post('/notifications/mark-read/:id', isAuthenticated, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ ok: false, error: 'ID inválido' });

    const uf = buildUserFilter(req);
    const sql = `UPDATE notificacoes SET lida = 1 WHERE id = ? ${uf.clause}`;
    const params = [id, ...uf.params];

    const [result] = await db.promise().query(sql, params);
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: 'Notificação não encontrada ou sem permissão' });
    }

    // opcional: emitir evento socket para clients conectados
    try { if (typeof io !== 'undefined' && io && typeof io.emit === 'function') io.emit('notificationMarkedRead', { id }); } catch (e) { /* ignore */ }

    return res.json({ ok: true, id });
  } catch (err) {
    console.error('POST /notifications/mark-read/:id error:', err);
    return res.status(500).json({ ok: false, error: 'Erro ao marcar como lida' });
  }
});

// POST /notifications/mark-read-oil/:veiculoId
app.post('/notifications/mark-read-oil/:veiculoId', isAuthenticated, async (req, res) => {
  try {
    const veiculoId = req.params.veiculoId;
    if (!veiculoId) return res.status(400).json({ ok: false, error: 'veiculoId inválido' });

    // 1) obtém placa/nome do veículo (se disponível)
    let placa = null, nomeVeiculo = null;
    try {
      const [vrows] = await db.promise().query('SELECT placa, nome FROM veiculos WHERE id = ? LIMIT 1', [veiculoId]);
      if (vrows && vrows[0]) {
        placa = vrows[0].placa || null;
        nomeVeiculo = vrows[0].nome || null;
      }
    } catch (e) {
      console.warn('mark-read-oil: erro ao buscar veículo:', e && e.message ? e.message : e);
    }

    const uf = buildUserFilter(req); // mantém a sua função de filtro por usuário
    let notifRow = null;

    async function tryFindByLike(pattern) {
      const sql = `
        SELECT id, mensagem, lida FROM notificacoes
        WHERE lida = 0
          AND ( tipo IN ('oleo','oil') OR tipo LIKE '%oleo%' )
          AND mensagem LIKE ?
        ${uf.clause}
        ORDER BY COALESCE(data_hora, NOW()) DESC
        LIMIT 1
      `;
      const params = [pattern, ...uf.params];
      const [rows] = await db.promise().query(sql, params);
      return rows && rows[0] ? rows[0] : null;
    }

    // heurística: placa -> nome -> id -> fallback última 'oleo' não-lida
    if (placa) notifRow = await tryFindByLike(`%${placa}%`);
    if (!notifRow && nomeVeiculo) notifRow = await tryFindByLike(`%${nomeVeiculo}%`);
    if (!notifRow) notifRow = await tryFindByLike(`%${veiculoId}%`);

    if (!notifRow) {
      const sqlRecent = `
        SELECT id, mensagem, lida FROM notificacoes
        WHERE lida = 0 AND ( tipo IN ('oleo','oil') OR tipo LIKE '%oleo%' )
        ${uf.clause}
        ORDER BY COALESCE(data_hora, NOW()) DESC
        LIMIT 1
      `;
      const [rowsRecent] = await db.promise().query(sqlRecent, uf.params);
      if (rowsRecent && rowsRecent.length) notifRow = rowsRecent[0];
    }

    if (!notifRow) {
      return res.status(404).json({ ok: false, error: 'Nenhuma notificação de óleo não-lida encontrada' });
    }

    const notifId = notifRow.id;
    const [upd] = await db.promise().query('UPDATE notificacoes SET lida = 1 WHERE id = ?', [notifId]);
    if (!upd || upd.affectedRows === 0) {
      return res.status(500).json({ ok: false, error: 'Erro ao marcar notificação como lida' });
    }

    // opcional: emitir socket
    try { if (io && typeof io.emit === 'function') io.emit('notificationMarkedRead', { id: notifId, veiculoId }); } catch (e) { /* ignore */ }

    // RETORNA o id da notificação marcada (muito importante para o front atualizar o data-notif-id)
    return res.json({ ok: true, id: notifId, veiculoId });
  } catch (err) {
    console.error('POST /notifications/mark-read-oil/:veiculoId error:', err);
    return res.status(500).json({ ok: false, error: 'Erro ao marcar notificação de óleo' });
  }
});



// POST /notifications/mark-all-read
app.post('/notifications/mark-all-read', isAuthenticated, async (req, res) => {
  try {
    const uf = buildUserFilter(req);
    const sql = `UPDATE notificacoes SET lida = 1 WHERE lida = 0 ${uf.clause}`;
    const [result] = await db.promise().query(sql, uf.params || []);

    try { if (typeof io !== 'undefined' && io && typeof io.emit === 'function') io.emit('notificationsMarkedReadBulk', { userId: req.user ? req.user.id : null }); } catch (e) { /* ignore */ }

    return res.json({ ok: true, affectedRows: result.affectedRows || 0 });
  } catch (err) {
    console.error('POST /notifications/mark-all-read error:', err);
    return res.status(500).json({ ok: false, error: 'Erro ao marcar todas notificações' });
  }
});

//////////////////////////////////////////////////////////////////////////////////////////////////////


app.post('/excluir-notificacao-alteracao-km/:id', isAuthenticated, isAdmin, csrfProtection, async (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM notificacoes WHERE id = ?', [id], (err, results) => {
    if (err) {
      console.error('Erro ao excluir notificação:', err);
      return res.status(500).send('Erro ao excluir notificação.');
    }
    // Após a exclusão, redireciona para a página de notificações
    res.redirect('/notificacoes');
  });
});
const moment = require('moment');

// Função para validar CPF
function validarCPF(cpf) {
  // Remove pontos e traços
  cpf = cpf.replace(/[^\d]+/g, '');
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) {
    return false;
  }
  let soma = 0, resto;
  for (let i = 1; i <= 9; i++) {
    soma += parseInt(cpf.substring(i - 1, i)) * (11 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) {
    resto = 0;
  }
  if (resto !== parseInt(cpf.substring(9, 10))) {
    return false;
  }
  soma = 0;
  for (let i = 1; i <= 10; i++) {
    soma += parseInt(cpf.substring(i - 1, i)) * (12 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) {
    resto = 0;
  }
  if (resto !== parseInt(cpf.substring(10, 11))) {
    return false;
  }
  return true;
}

const storageBanco = multer.memoryStorage();

const uploadFotoBanco = multer({
  storage: storageBanco,           // <- aqui
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Só imagens são permitidas'));
    }
    cb(null, true);
  }
}).single('foto');


app.get('/registro-motorista', isAuthenticated, csrfProtection, async (req, res) => {
  try {
    // Busca dados do motorista pelo email
    const resultados = await query(
      'SELECT * FROM motoristas WHERE email = ?',
      [req.user.email]
    );

    const jaCadastrado = resultados.length > 0;
    let motorista = null;
    let fotoBase64 = null;

    if (jaCadastrado) {
      motorista = resultados[0];
      // Converte BLOB em base64 se existir
      if (motorista.foto_cnh) {
        fotoBase64 = Buffer.from(motorista.foto_cnh).toString('base64');
      }
    }

    res.render('registro-motorista', {
      activePage: 'registro-motorista',
      user: req.user,
      csrfToken: req.csrfToken(),
      title: 'Cadastro de Motorista',
      layout: 'layout',
      isMotorista: jaCadastrado,
      motorista,
      fotoCNH: fotoBase64,   // passe pro EJS para exibir <img src="data:image/jpeg;base64,...">
      errors: [],
      errorFields: [],
      data: {}
    });

  } catch (err) {
    console.error('Erro ao buscar motorista:', err);
    res.status(500).send('Erro interno');
  }
});






// Rota para cadastro de motoristas
app.post(
  '/api/cadastro-motorista',
  isAuthenticated,
  uploadFotoBanco,
  csrfProtection,
  async (req, res) => {
    try {
      const { nome, cpf, cnh, dataValidade, categoria } = req.body;
      const bufferFoto = req.file ? req.file.buffer : null;
      const email = req.user.email;

      // 1) Validações
      if (!nome || !cpf || !cnh || !dataValidade || !categoria) {
        return res.status(400).json({ success: false, message: 'Preencha todos os campos.' });
      }
      if (moment(dataValidade).isBefore(moment(), 'day')) {
        return res.status(400).json({ success: false, message: 'CNH vencida. Cadastro não permitido.' });
      }
      if (!validarCPF(cpf)) {
        return res.status(400).json({ success: false, message: 'CPF inválido.' });
      }

      // 2) Verifica duplicidade de CPF
      const rowsCPF = await query(
        'SELECT id FROM motoristas WHERE cpf = ?',
        [cpf]
      );
      if (rowsCPF.length > 0) {
        return res.status(400).json({ success: false, message: 'CPF já cadastrado.' });
      }

      // 3) Insere novo motorista (com BLOB)
      const sql = `
          INSERT INTO motoristas
            (nome, email, cpf, cnh, data_validade, categoria, foto_cnh)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
      const params = [nome, email, cpf, cnh, dataValidade, categoria, bufferFoto];
      await query(sql, params);

      return res.status(200).json({ success: true, message: 'Motorista cadastrado com sucesso!' });

    } catch (err) {
      console.error('Erro ao cadastrar motorista:', err);
      return res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  }
);


// servir foto cnh 
// GET /api/motorista/:id/cnh
app.get(
  '/api/motorista/:id/cnh',
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      // busca apenas o campo foto_cnh
      const rows = await query(
        'SELECT foto_cnh FROM motoristas WHERE id = ?',
        [id]
      );
      if (!rows.length || !rows[0].foto_cnh) {
        return res.status(404).json({ success: false, message: 'CNH não encontrada.' });
      }
      const blob = rows[0].foto_cnh;
      // transforma em base64 e já coloca o prefixo data URI
      const base64 = `data:image/jpeg;base64,${Buffer.from(blob).toString('base64')}`;
      res.json({ success: true, fotoCNH: base64 });
    } catch (err) {
      console.error('Erro ao buscar CNH:', err);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  }
);


// GET /motoristas/fotos-cnh  exibir pagina fotos cnh
app.get(
  '/motoristas/fotos-cnh',
  isAuthenticated,
  isAdmin,
  csrfProtection,
  async (req, res) => {
    try {
      const motoristas = await query(
        `SELECT
             id,
             nome,
             cpf,
             cnh,
             data_validade,
             categoria,
             foto_cnh
           FROM motoristas
           ORDER BY nome`,
        []
      );

      // Renderiza o EJS fotosCnh.ejs
      res.render('fotosCnh', {
        motoristas,
        csrfToken: req.csrfToken(),
        user: req.user,
        activePage: 'fotos-cnh',
      });
    } catch (err) {
      console.error('Erro ao buscar motoristas para fotosCnh:', err);
      res.status(500).send('Erro interno ao carregar fotos de CNH.');
    }
  }
);

// DELETE /api/deletar-motorista/:id
app.delete(
  '/api/deletar-motorista/:id',
  isAuthenticated,
  csrfProtection,
  async (req, res) => {
    try {
      const { id } = req.params;
      // verificar que o motorista existe antes de apagar
      const rows = await query(
        'SELECT id FROM motoristas WHERE id = ?',
        [id]
      );
      if (!rows.length) {
        return res.status(404).json({ success: false, message: 'Motorista não encontrado.' });
      }

      // apaga o motorista
      await query(
        'DELETE FROM motoristas WHERE id = ?',
        [id]
      );
      return res.json({ success: true, message: 'Motorista excluído com sucesso!' });
    } catch (err) {
      console.error('Erro ao excluir motorista:', err);
      return res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  }
);



//  Manutenções adicionais (rodízio de pneus, troca de pneus, pastilhas e discos de freio) //

// Função para enviar notificação de manutenção (por email e via Socket.IO)
function sendMaintenanceNotification(veiculo, manutencao) {
  const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
  const mailOptions = {
    to: process.env.NOTIFY_EMAIL || process.env.EMAIL_USER,
    from: process.env.EMAIL_USER,
    subject: `Manutenção Pendente (${manutencao.tipo}): ${veiculo.nome} - ${veiculo.placa}`,
    text: `O veículo ${veiculo.nome} (Placa: ${veiculo.placa}) necessita de ${manutencao.tipo}. ` +
      `Detalhes: ${manutencao.descricao || 'Sem descrição.'}`
  };
  transporter.sendMail(mailOptions, (err, info) => {
    if (err) console.error("Erro ao enviar email de manutenção:", err);
    else console.log("Email de manutenção enviado:", info.response);
  });
  io.emit('maintenanceNotification', { veiculo, manutencao });
}

// Função para checar manutenções pendentes para um veículo
function checkMaintenanceForVehicle(veiculo_id) {
  const queryVeiculo = `SELECT * FROM veiculos WHERE id = ?`;
  db.query(queryVeiculo, [veiculo_id], (err, results) => {
    if (err) {
      console.error("Erro ao buscar veículo para manutenção:", err);
      return;
    }
    if (results.length > 0) {
      const veiculo = results[0];
      // Busca manutenções pendentes para este veículo
      const queryManutencoes = `
                SELECT * FROM manutencoes 
                WHERE veiculo_id = ? AND status = 'pendente'
            `;
      db.query(queryManutencoes, [veiculo_id], (err, manutencoes) => {
        if (err) {
          console.error("Erro ao buscar manutenções:", err);
          return;
        }
        const hoje = new Date();
        manutencoes.forEach(manutencao => {
          let precisaNotificar = false;
          // Se tiver km agendado e a quilometragem atual for maior ou igual
          if (manutencao.km_agendado && Number(veiculo.km) >= Number(manutencao.km_agendado)) {
            precisaNotificar = true;
          }
          // Se tiver data agendada e hoje for igual ou depois
          if (manutencao.data_agendada && hoje >= new Date(manutencao.data_agendada)) {
            precisaNotificar = true;
          }
          if (precisaNotificar) {
            console.log(`Manutenção pendente detectada: ${manutencao.tipo} para veículo ${veiculo.placa}`);
            sendMaintenanceNotification(veiculo, manutencao);
          }
        });
      });
    }
  });
}

/* Rotas para manutenção */

// Rota para exibir formulário de cadastro de manutenção para um veículo
app.get('/registrar-manutencao/:veiculo_id', isAuthenticated, isAdmin, csrfProtection, (req, res) => {
  const { veiculo_id } = req.params;
  db.query("SELECT * FROM veiculos WHERE id = ?", [veiculo_id], (err, results) => {
    if (err || results.length === 0) {
      return res.status(404).send("Veículo não encontrado.");
    }
    const veiculo = results[0];
    res.render('registrar-manutencao', {
      title: 'Registrar Manutenção',
      csrfToken: req.csrfToken(),
      layout: 'layout',
      activePage: 'manutencao',
      veiculo,
      tipos: ['Rodízio de Pneus', 'Troca de Pneus', 'Troca de Pastilhas', 'Troca de Discos de Freio']
    });
  });
});

// Rota para processar cadastro de manutenção
app.post('/registrar-manutencao/:veiculo_id', isAuthenticated, isAdmin, csrfProtection, (req, res) => {
  const { veiculo_id } = req.params;
  const { tipo, descricao, km_agendado, data_agendada } = req.body;
  const query = `
        INSERT INTO manutencoes (veiculo_id, tipo, descricao, km_agendado, data_agendada)
        VALUES (?, ?, ?, ?, ?)
    `;
  db.query(query, [veiculo_id, tipo, descricao, km_agendado || null, data_agendada || null], (err, result) => {
    if (err) {
      console.error("Erro ao registrar manutenção:", err);
      return res.status(500).send("Erro ao registrar manutenção.");
    }
    res.redirect('/manutencoes');
  });
});

// GET /manutencoes  — lista (sem depender de criado_em)
app.get('/manutencoes', isAuthenticated, csrfProtection, async (req, res) => {
  try {
    const veiculoId = req.query.veiculo_id ? Number(req.query.veiculo_id) : null;

    // lista de veículos para a sidebar
    const [vehicles] = await db.promise().query('SELECT id, nome, placa FROM veiculos ORDER BY nome ASC');

    // busca manutenções (sem usar criado_em)
    let sql = `SELECT m.id, m.tipo, m.descricao, m.km_agendado,
                      DATE_FORMAT(m.data_agendada, '%Y-%m-%d') AS data_agendada,
                      DATE_FORMAT(m.data_realizada, '%Y-%m-%d') AS data_realizada,
                      m.status, m.veiculo_id, v.nome AS veiculo_nome, v.placa
               FROM manutencoes m
               JOIN veiculos v ON v.id = m.veiculo_id`;
    const params = [];
    if (veiculoId) {
      sql += ' WHERE m.veiculo_id = ?';
      params.push(veiculoId);
    }

    // Ordena por status, depois por data_agendada, depois por data_realizada, se nada existir usa id
    sql += ' ORDER BY FIELD(m.status, "pendente","realizada","cancelada"), COALESCE(m.data_agendada, m.data_realizada, m.id) DESC';

    const [manutencoes] = await db.promise().query(sql, params);

    // conta anexos
    const manutIds = manutencoes.map(m => m.id);
    let arquivosMap = {};
    if (manutIds.length) {
      const [arquivos] = await db.promise().query(
        `SELECT manutencao_id, COUNT(*) AS total FROM manutencoes_arquivos WHERE manutencao_id IN (?) GROUP BY manutencao_id`,
        [manutIds]
      );
      arquivosMap = arquivos.reduce((acc, a) => {
        acc[a.manutencao_id] = a.total;
        return acc;
      }, {});
    }

    res.render('manutencoes', {
      title: 'Manutenções',
      vehicles,
      manutencoes,
      arquivosMap,
      selectedVehicle: veiculoId || null,
      csrfToken: req.csrfToken(),
      user: req.user
    });
  } catch (err) {
    console.error('GET /manutencoes', err);
    res.status(500).send('Erro interno');
  }
});



// Rota para marcar uma manutenção como realizada
app.post('/manutencoes/realizada/:id', isAuthenticated, isAdmin, csrfProtection, (req, res) => {
  const { id } = req.params;
  const updateQuery = `
      UPDATE manutencoes 
      SET status = 'realizada', data_realizada = CURDATE() 
      WHERE id = ?
    `;
  db.query(updateQuery, [id], (err, result) => {
    if (err) {
      console.error("Erro ao atualizar manutenção:", err);
      return res.status(500).send("Erro ao atualizar manutenção.");
    }
    res.redirect('/manutencoes');
  });
});

// =========================
// MANUTENÇÕES MANUAIS
// =========================
// =========================
// MANUTENÇÕES MANUAIS (corrigido / endurecido)
// =========================

// =========================
// MANUTENÇÕES MANUAIS (sem sanitize)
// =========================

// LISTAR manutenções manuais (render server-side)
app.get('/manutencoes-manuais', isAuthenticated, csrfProtection, (req, res) => {
  const filtro = {
    status: (req.query.status || '').trim(),
    veiculo: (req.query.veiculo || '').trim()
  };

  let where = 'WHERE 1=1';
  const params = [];

  if (filtro.status) {
    where += ' AND m.status = ?';
    params.push(filtro.status);
  }
  if (filtro.veiculo) {
    where += ' AND (v.placa LIKE ? OR v.nome LIKE ?)';
    params.push(`%${filtro.veiculo}%`, `%${filtro.veiculo}%`);
  }

  const sql = `
    SELECT m.id, m.veiculo_id, m.tipo, m.descricao, m.km_agendado, 
           DATE_FORMAT(m.data_agendada, '%Y-%m-%d') AS data_agendada,
           m.status, DATE_FORMAT(m.criado_em, '%Y-%m-%d %H:%i') AS criado_em,
           v.nome AS veiculo_nome, v.placa
    FROM manutencoes_manuais m
    JOIN veiculos v ON v.id = m.veiculo_id
    ${where}
    ORDER BY 
      FIELD(m.status, 'pendente','em_manutencao','realizada') ASC,
      COALESCE(m.data_agendada, m.criado_em) DESC,
      m.id DESC
    LIMIT 100
  `;

  db.query(sql, params, (err, manutencoes) => {
    if (err) {
      console.error('Erro ao buscar manutenções manuais:', err);
      return res.status(500).send('Erro ao buscar manutenções');
    }

    // sem sanitização — usamos valores brutos
    manutencoes = manutencoes.map(m => ({
      ...m,
      tipo: m.tipo || '',
      descricao: m.descricao || ''
    }));

    res.render('manutencoes-manuais', {
      title: 'Manutenções Manuais',
      layout: 'layout',
      activePage: 'manutencoes-manuais',
      csrfToken: req.csrfToken(),
      manutencoes,
      filtro,
      user: req.user
    });
  });
});

// FORM EDITAR
app.get('/manutencoes-manuais/:id/editar', isAuthenticated, isAdmin, csrfProtection, (req, res) => {
  const manutencaoId = Number(req.params.id || 0);
  if (!manutencaoId) return res.status(400).send('ID inválido');

  db.query(
    `SELECT m.*, v.nome AS veiculo_nome, v.placa 
     FROM manutencoes_manuais m
     JOIN veiculos v ON v.id = m.veiculo_id
     WHERE m.id = ? LIMIT 1`,
    [manutencaoId],
    (err, rows) => {
      if (err) {
        console.error('Erro ao buscar manutenção:', err);
        return res.status(500).send('Erro ao buscar manutenção');
      }
      if (!rows.length) return res.status(404).send('Manutenção não encontrada');

      const manu = rows[0];
      // sem sanitização — usamos valores brutos (atenção ao usar <%- %> nas views)
      manu.tipo = manu.tipo || '';
      manu.descricao = manu.descricao || '';

      db.query(
        'SELECT id, tipo, filename, original_name, mime, size, DATE_FORMAT(criado_em, "%Y-%m-%d %H:%i") as criado_em FROM manutencoes_arquivos WHERE manutencao_id = ? ORDER BY criado_em DESC',
        [manutencaoId],
        (err2, arquivos) => {
          if (err2) {
            console.error('Erro ao buscar arquivos:', err2);
            return res.status(500).send('Erro ao buscar arquivos');
          }

          res.render('manutencoes-manuais-editar', {
            title: 'Editar Manutenção Manual',
            layout: 'layout',
            activePage: 'manutencoes-manuais',
            csrfToken: req.csrfToken(),
            manu,
            arquivos,
            user: req.user
          });
        }
      );
    }
  );
});

// UPLOAD arquivos (usando multer memory)
// middleware order: isAuthenticated, isAdmin, multer -> csrfProtection -> handler
app.post(
  '/manutencoes-manuais/:id/upload',
  isAuthenticated,
  isAdmin,
  uploadMemory.array('arquivos', 10), // <<-- multer antes do csurf
  csrfProtection,
  (req, res) => {
    const manutencaoId = Number(req.params.id || 0);
    if (!manutencaoId) return res.status(400).send('ID inválido');

    const files = req.files || [];
    if (!files.length) {
      return res.status(400).send('Nenhum arquivo enviado.');
    }

    const tipoFormulario = req.body.tipo || null;
    const criadoPor = req.user && (req.user.email || req.user.nome) || null;

    const sql = `
      INSERT INTO manutencoes_arquivos
        (manutencao_id, tipo, filename, original_name, mime, size, data, criado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    let i = 0;
    function inserirProximo() {
      if (i >= files.length) {
        try { if (typeof io !== 'undefined') io.emit('maintenanceFilesUploaded', { manutencaoId: Number(manutencaoId) }); } catch (e) { }
        return res.redirect('/manutencoes-manuais/' + manutencaoId + '/editar');
      }

      const f = files[i];
      const tipoFinal = tipoFormulario || (f.mimetype === 'application/pdf' ? 'documento' : 'foto');

      const timestamp = Date.now();
      const safeOriginal = (f.originalname || 'arquivo').replace(/[^a-zA-Z0-9.\-_]/g, '_').slice(0, 200);
      const filenameSimbolico = `${timestamp}-${safeOriginal}`;

      db.query(sql, [
        manutencaoId,
        tipoFinal,
        filenameSimbolico,
        safeOriginal,
        f.mimetype || 'application/octet-stream',
        f.size || 0,
        f.buffer,
        criadoPor
      ], (err) => {
        if (err) {
          console.error('Erro ao salvar arquivo no DB:', err);
          return res.status(500).send('Erro ao salvar arquivo.');
        }
        i++;
        inserirProximo();
      });
    }

    inserirProximo();
  }
);


// DOWNLOAD / PREVIEW arquivo
app.get('/manutencoes-manuais/:id/arquivo/:arquivoId', isAuthenticated, csrfProtection, (req, res) => {
  const manutencaoId = Number(req.params.id || 0);
  const arquivoId = Number(req.params.arquivoId || 0);
  if (!manutencaoId || !arquivoId) return res.status(400).send('IDs inválidos');

  db.query(
    'SELECT id, original_name, mime, size, data FROM manutencoes_arquivos WHERE id = ? AND manutencao_id = ? LIMIT 1',
    [arquivoId, manutencaoId],
    (err, rows) => {
      if (err) {
        console.error('Erro ao buscar arquivo:', err);
        return res.status(500).send('Erro ao buscar arquivo');
      }
      if (!rows.length) return res.status(404).send('Arquivo não encontrado');

      const arq = rows[0];
      const mime = arq.mime || 'application/octet-stream';
      const inlineTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
      const disposition = inlineTypes.includes(mime) ? 'inline' : 'attachment';

      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Length', arq.size);
      const safeName = (arq.original_name || 'arquivo').replace(/["\\]/g, '');
      res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`);
      res.send(arq.data);
    }
  );
});

// DELETE arquivo (usa POST para compatibilidade com formulários)
app.post('/manutencoes-manuais/:id/arquivo/:arquivoId/delete', isAuthenticated, isAdmin, csrfProtection, (req, res) => {
  const manutencaoId = Number(req.params.id || 0);
  const arquivoId = Number(req.params.arquivoId || 0);
  if (!manutencaoId || !arquivoId) return res.status(400).send('IDs inválidos');

  db.query('SELECT id FROM manutencoes_arquivos WHERE id = ? AND manutencao_id = ? LIMIT 1', [arquivoId, manutencaoId], (err, rows) => {
    if (err) {
      console.error('Erro ao verificar arquivo:', err);
      return res.status(500).send('Erro');
    }
    if (!rows.length) return res.status(404).send('Arquivo não encontrado');

    db.query('DELETE FROM manutencoes_arquivos WHERE id = ?', [arquivoId], (err2) => {
      if (err2) {
        console.error('Erro ao excluir arquivo:', err2);
        return res.status(500).send('Erro ao excluir');
      }

      try { if (typeof io !== 'undefined') io.emit('maintenanceFileDeleted', { manutencaoId: Number(manutencaoId), arquivoId: Number(arquivoId) }); } catch (e) { }
      res.redirect('/manutencoes-manuais/' + manutencaoId + '/editar');
    });
  });
});

// --- NOVA rota: formulário de criação (GET)
app.get('/manutencoes-manuais/novo', isAuthenticated, isAdmin, csrfProtection, (req, res) => {
  db.query('SELECT id, nome, placa FROM veiculos ORDER BY nome, placa LIMIT 200', (err, veiculos) => {
    if (err) {
      console.error('Erro ao buscar veículos para novo:', err);
      return res.status(500).send('Erro ao buscar veículos');
    }

    const manu = {
      id: null,
      veiculo_id: '',
      veiculo_nome: '',
      placa: '',
      tipo: '',
      descricao: '',
      km_agendado: '',
      data_agendada: '',
      status: 'pendente'
    };

    res.render('manutencoes-manuais-novo', {
      title: 'Nova Manutenção Manual',
      layout: 'layout',
      activePage: 'manutencoes-manuais',
      csrfToken: req.csrfToken(),
      manu,
      veiculos,
      user: req.user
    });
  });
});

// --- POST criar nova manutenção (sem sanitize)
app.post('/manutencoes-manuais/novo', isAuthenticated, isAdmin, csrfProtection, (req, res) => {
  try {
    const veiculo_id = Number(req.body.veiculo_id || 0);
    const tipo = (req.body.tipo || '').toString().trim().slice(0, 255);
    const descricao = (req.body.descricao || '').toString().trim();
    const km_agendado = req.body.km_agendado ? Number(req.body.km_agendado) : null;
    const data_agendada = req.body.data_agendada ? req.body.data_agendada : null;
    const status = req.body.status && ['pendente', 'em_manutencao', 'realizada'].includes(req.body.status) ? req.body.status : 'pendente';
    const criadoPor = req.user && (req.user.email || req.user.nome) || null;

    if (!veiculo_id || isNaN(veiculo_id)) {
      return res.status(400).send('Veículo inválido.');
    }
    if (!tipo) {
      return res.status(400).send('Informe o tipo da manutenção.');
    }

    const descricaoSafe = descricao || null; // salvo bruto
    const tipoSafe = tipo; // salvo bruto

    const sql = `
      INSERT INTO manutencoes_manuais
        (veiculo_id, tipo, descricao, km_agendado, data_agendada, status, criado_em, criado_por)
      VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)
    `;

    db.query(sql, [veiculo_id, tipoSafe, descricaoSafe, km_agendado, data_agendada, status, criadoPor], (err, result) => {
      if (err) {
        console.error('Erro ao criar manutenção manual:', err);
        return res.status(500).send('Erro ao criar manutenção');
      }

      const novoId = result.insertId;

      try { if (typeof io !== 'undefined') io.emit('manutencao:criada', { manutencaoId: novoId, veiculoId: veiculo_id }); } catch (e) { }

      return res.redirect('/manutencoes-manuais/' + novoId + '/editar');
    });

  } catch (e) {
    console.error('Exception POST /manutencoes-manuais/novo', e);
    return res.status(500).send('Erro interno');
  }
});


// handler reutilizável
async function handleMarcarRealizada(req, res) {
  const manutencaoId = Number(req.params.id || 0);
  if (!manutencaoId) return res.status(400).send('ID inválido');

  const toInt = v => {
    if (v === undefined || v === null || String(v).trim() === '') return null;
    const n = parseInt(String(v).replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  };
  const kmRealizado = toInt(req.body.km_realizado);
  const realizadoPor = req.user && (req.user.email || req.user.nome) ? (req.user.email || req.user.nome) : null;

  const conn = await db.promise().getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query('SELECT * FROM manutencoes_manuais WHERE id = ? FOR UPDATE', [manutencaoId]);
    if (!rows || rows.length === 0) {
      await conn.rollback(); conn.release();
      return res.status(404).send('Manutenção não encontrada');
    }
    const manu = rows[0];

    if (manu.status === 'realizada') {
      await conn.rollback(); conn.release();
      return res.status(400).send('Manutenção já está marcada como realizada');
    }

    await conn.query(
      `UPDATE manutencoes_manuais
       SET status = 'realizada', realizado_em = NOW(), realizado_por = ?
       WHERE id = ?`,
      [realizadoPor, manutencaoId]
    );

    if (kmRealizado !== null && manu.veiculo_id) {
      const [vrows] = await conn.query('SELECT km FROM veiculos WHERE id = ? FOR UPDATE', [manu.veiculo_id]);
      if (vrows && vrows.length) {
        const curKm = (vrows[0].km === null || vrows[0].km === undefined) ? null : parseInt(vrows[0].km, 10);
        if (curKm === null || kmRealizado > curKm) {
          await conn.query('UPDATE veiculos SET km = ? WHERE id = ?', [kmRealizado, manu.veiculo_id]);
        }
      }
    }

    // notificação (não falha se der problema)
    try {
      const msg = `Manutenção ${manutencaoId} marcada como realizada por ${realizadoPor || 'usuário desconhecido'}`;
      // exemplo: substituir inserção simples por:
      await conn.query(
        "INSERT INTO notificacoes (mensagem, data_hora, lida, tipo, user_id) VALUES (?, NOW(), 0, ?, ?)",
        [msg, 'manutencao', null] // ajuste tipo/user_id conforme necessidade
      );

    } catch (e) { console.warn('notificacao failed', e.message || e); }

    await conn.commit();
    conn.release();

    try { if (typeof io !== 'undefined') io.emit('manutencao:realizada', { manutencaoId }); } catch (e) { }

    return res.redirect(`/manutencoes-manuais/${manutencaoId}/editar`);
  } catch (err) {
    try { await conn.rollback(); } catch (e) { }
    conn.release();
    console.error('Erro marcar realizada:', err);
    return res.status(500).send('Erro ao marcar manutenção como realizada.');
  }
}

// registra duas rotas (compatibilidade com templates antigos/novos)
app.post('/manutencoes-manuais/:id/marcar-realizada', isAuthenticated, isAdmin, csrfProtection, handleMarcarRealizada);
app.post('/manutencoes-manuais/:id/realizada', isAuthenticated, isAdmin, csrfProtection, handleMarcarRealizada);





/* Fim das funcionalidades de manutenção */

// Rota para cadastro de novo reembolso
app.post('/reembolsos', upload.single('comprovante'), isAuthenticated, csrfProtection, async (req, res) => {
  try {
    const { motorista_id, valor } = req.body;
    // Se um arquivo foi enviado, obtenha o caminho
    const comprovante = req.file ? req.file.filename : null;

    await query(
      'INSERT INTO reembolsos (motorista_id, valor, comprovante) VALUES (?, ?, ?)',
      [motorista_id, valor, comprovante]
    );

    res.redirect('/reembolsos');
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao cadastrar reembolso');
  }
});
// Rota para exibir o formulário, a lista de reembolsos detalhados, os dados para o gráfico e os reembolsos agregados
app.get('/reembolsos', isAuthenticated, csrfProtection, async (req, res) => {
  try {
    // Consulta para buscar os reembolsos detalhados com os dados do motorista
    const reembolsos = await query(`
            SELECT r.*, m.nome as motorista_nome 
            FROM reembolsos r 
            JOIN motoristas m ON r.motorista_id = m.id 
            ORDER BY r.criado_em ASC
        `);

    // Consulta para buscar motoristas para o formulário
    const motoristas = await query('SELECT id, nome FROM motoristas');

    // Agregação diária: soma dos valores de reembolso por motorista e por dia
    const reembolsoDiario = await query(`
            SELECT 
              m.nome as motorista_nome,
              DATE(r.criado_em) AS dia,
              ROUND(SUM(r.valor), 2) AS total_reembolso
            FROM reembolsos r
            JOIN motoristas m ON r.motorista_id = m.id
            GROUP BY m.nome, DATE(r.criado_em)
            ORDER BY DATE(r.criado_em) DESC, m.nome
        `);

    // Agregação mensal: soma dos valores de reembolso por motorista e por mês
    const reembolsoMensal = await query(`
            SELECT 
              m.nome as motorista_nome,
              DATE_FORMAT(r.criado_em, '%Y-%m') AS mes,
              ROUND(SUM(r.valor), 2) AS total_reembolso
            FROM reembolsos r
            JOIN motoristas m ON r.motorista_id = m.id
            GROUP BY m.nome, DATE_FORMAT(r.criado_em, '%Y-%m')
            ORDER BY DATE_FORMAT(r.criado_em, '%Y-%m') DESC, m.nome
        `);

    // Agregação anual: soma dos valores de reembolso por motorista e por ano
    const reembolsoAnual = await query(`
            SELECT 
              m.nome as motorista_nome,
              YEAR(r.criado_em) AS ano,
              ROUND(SUM(r.valor), 2) AS total_reembolso
            FROM reembolsos r
            JOIN motoristas m ON r.motorista_id = m.id
            GROUP BY m.nome, YEAR(r.criado_em)
            ORDER BY YEAR(r.criado_em) DESC, m.nome
        `);

    // Renderiza a view enviando os dados para a tabela detalhada, gráfico e agregações
    res.render('reembolsos', {
      reembolsos,
      csrfToken: req.csrfToken(),
      motoristas,
      reembolsosGrafico: reembolsos, // mesma lista utilizada para o gráfico
      reembolsoDiario,
      reembolsoMensal,
      reembolsoAnual,
      title: 'Gerenciar Reembolsos',
      activePage: 'reembolsos',
      user: req.user // Passa o usuário autenticado para o template
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro no servidor');
  }
});


app.get('/relatorio-consumo', isAuthenticated, csrfProtection, async (req, res) => {
  try {
    // 1) Parâmetros de busca
    const { motorista, startDate, endDate } = req.query;

    // 2) Constantes de negócio
    const eficiencia = 10;       // km por litro
    const precoGasolina = 6.45;  // R$

    // 3) Carrega a lista de motoristas (id e email) para popular o <select>
    const motoristasList = await query(
      'SELECT id, email FROM motoristas ORDER BY email'
    );

    // 4) Constrói os filtros dinâmicos
    const filters = ['uso.km_final IS NOT NULL'];
    const params = [];

    if (motorista) {
      filters.push('LOWER(TRIM(motoristas.email)) = LOWER(TRIM(?))');
      params.push(motorista);
    }
    if (startDate) {
      filters.push('DATE(uso.data_criacao) >= ?');
      params.push(startDate);
    }
    if (endDate) {
      filters.push('DATE(uso.data_criacao) <= ?');
      params.push(endDate);
    }
    const whereClause = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

    // 5) Função auxiliar para agregar consumo e custo (reembolso) por período
    const agregar = async (groupExpr, label) => {
      const sql = `
          SELECT
            motoristas.email AS motorista,
            ${groupExpr} AS ${label},
            ROUND(SUM((uso.km_final - uso.km_inicial) / ?), 2) AS consumo_estimado,
            ROUND(SUM((uso.km_final - uso.km_inicial) / ? * ?), 2) AS custo_estimado
          FROM uso_veiculos AS uso
          JOIN veiculos ON uso.veiculo_id = veiculos.id
          JOIN motoristas ON motoristas.email = uso.motorista
          ${whereClause}
          GROUP BY motoristas.email, ${groupExpr}
          ORDER BY ${groupExpr} DESC, motoristas.email
            `;
      //console.log('SQL:', sql);
      return await query(sql, [eficiencia, eficiencia, precoGasolina, ...params]);
    };

    // 6) Função auxiliar para agregar apenas reembolso (baseado no custo)
    const agregarReembolso = async (groupExpr, label) => {
      const sql = `
          SELECT
            motoristas.email AS motorista,
            ${groupExpr} AS ${label},
            ROUND(SUM((uso.km_final - uso.km_inicial) / ? * ?), 2) AS reembolso
          FROM uso_veiculos AS uso
          JOIN veiculos ON uso.veiculo_id = veiculos.id
          JOIN motoristas ON motoristas.email = uso.motorista
          ${whereClause}
          GROUP BY motoristas.email, ${groupExpr}
          ORDER BY ${groupExpr} DESC, motoristas.email
            `;
      //console.log('SQL Reembolso:', sql);
      return await query(sql, [eficiencia, precoGasolina, ...params]);
    };

    // 7) Executa as agregações para consumo/custo e para reembolso
    const resumoDiario = await agregar("DATE(uso.data_criacao)", "dia");
    const resumoMensal = await agregar("DATE_FORMAT(uso.data_criacao, '%Y-%m')", "mes");
    const resumoAnual = await agregar("YEAR(uso.data_criacao)", "ano");

    const reembolsoDiario = await agregarReembolso("DATE(uso.data_criacao)", "dia");
    const reembolsoMensal = await agregarReembolso("DATE_FORMAT(uso.data_criacao, '%Y-%m')", "mes");
    const reembolsoAnual = await agregarReembolso("YEAR(uso.data_criacao)", "ano");

    // 8) Renderiza a view, passando os resumos de consumo e reembolso
    res.render('relatorioConsumo', {
      title: 'Relatório de Consumo e Reembolso por Motorista',
      activePage: 'relatorioConsumo',
      filtro: { motorista, startDate, endDate },
      csrfToken: req.csrfToken(),
      motoristasList,
      resumoDiario,
      resumoMensal,
      resumoAnual,
      reembolsoDiario,
      reembolsoMensal,
      reembolsoAnual,
      user: req.user,
      // Passa o usuário autenticado para o template
      activePage: 'relatorio-consumo',
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Erro no servidor ao gerar relatório.');
  }
});




////////////////////////////////////////////////////////////////////////////////////

app.get('/search', isAuthenticated, csrfProtection, async (req, res) => {
  const q = (req.query.q || '').trim();

  //  o que a busca abrange, para exibir no front
  const searchInfo = [
    { name: 'Veículos', fields: ['id', 'nome', 'placa'] },
    { name: 'Usos de Veículos', fields: ['id', 'motorista', 'km_inicial', 'km_final'] },
    { name: 'Multas', fields: ['id', 'multa', 'motorista', 'email'] },
    { name: 'Motoristas', fields: ['id', 'nome', 'email'] },
  ];

  // Se não digitar nada, renderiza apenas a ajuda
  if (!q) {
    return res.render('searchResults', {
      q,
      results: {},
      user: req.user,
      csrfToken: req.csrfToken(),
      searchInfo
    });
  }

  try {
    // Busca em Veículos
    const veiculos = await query(
      `SELECT id, nome, placa
       FROM veiculos
       WHERE id = ?
         OR nome LIKE ?
         OR placa LIKE ?`,
      [q, `%${q}%`, `%${q}%`]
    );

    // Busca em Usos de Veículos
    const usos = await query(
      `SELECT id, motorista, km_inicial, km_final
       FROM uso_veiculos
       WHERE id = ?
         OR motorista LIKE ?`,
      [q, `%${q}%`]
    );

    // Busca em Multas – com JOIN para trazer o email do motorista
    const multas = await query(
      `SELECT m.id,
              m.multa,
              m.motorista,
              mot.email
       FROM multas AS m
       LEFT JOIN motoristas AS mot
         ON mot.nome = m.motorista
       WHERE m.id = ?
         OR m.multa LIKE ?
         OR m.motorista LIKE ?
         OR mot.email LIKE ?`,
      [q, `%${q}%`, `%${q}%`, `%${q}%`]
    );

    // Busca em Motoristas
    const motoristas = await query(
      `SELECT id, nome, email
       FROM motoristas
       WHERE id = ?
         OR nome LIKE ?
         
         OR email LIKE ?`,
      [q, `%${q}%`, `%${q}%`, `%${q}%`]
    );

    const results = { veiculos, usos, multas, motoristas };

    res.render('searchResults', {
      q,
      results,
      user: req.user,
      csrfToken: req.csrfToken(),
      searchInfo
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Erro no servidor ao realizar busca.");
  }
});
/*
/// API FIPE
const axios = require('axios');

// Função auxiliar para converter preço formatado ("R$ 10.000,00") em número
function parsePrice(priceStr) {
    // Remove "R$" e espaços, remove pontos e troca vírgula por ponto
    const numStr = priceStr.replace('R$', '').trim().replace(/\./g, '').replace(',', '.');
    return parseFloat(numStr);
  }
  
  // Rota para exibir dados dos veículos e a análise de custo de conserto vs. valor FIPE
  app.get('/veiculos', async (req, res) => {
    try {
      // Para fins de demonstração usamos:
      // Tipo: "cars"
      // Marca: código 59 (VW - VolksWagen)
      // Modelo: código 5940 (um modelo específico)
      const vehicleType = 'cars';
      const brandId = 59;
      const modelId = 5940;
  
      // Endpoint para obter os anos disponíveis para este modelo
      const yearsUrl = `https://parallelum.com.br/fipe/api/v2/${vehicleType}/brands/${brandId}/models/${modelId}/years`;
      const yearsResponse = await axios.get(yearsUrl);
      const years = yearsResponse.data; // array de objetos com { code, name }
  
      // Array para armazenar os dados finais dos veículos
      const veiculos = [];
  
      // Para cada ano disponível, obtenha os detalhes (FIPE info)
      for (let yearObj of years) {
        const yearId = yearObj.code; // ex: "2014-3"
        const infoUrl = `https://parallelum.com.br/fipe/api/v2/${vehicleType}/brands/${brandId}/models/${modelId}/years/${yearId}`;
        const infoResponse = await axios.get(infoUrl);
        const fipeInfo = infoResponse.data;
        
        // Obtenha o valor FIPE em número
        const fipeValue = parsePrice(fipeInfo.price);
  
        // Para simular o custo de conserto, vamos gerar um valor aleatório entre 50% e 120% do valor FIPE
        const randomFactor = Math.random() * (1.20 - 0.50) + 0.50; // valor entre 0.50 e 1.20
        const custoConserto = fipeValue * randomFactor;
        const percentualConserto = (custoConserto / fipeValue) * 100;
  
        // Se o custo do conserto for menor ou igual a 70% do valor FIPE, vale a pena consertar; senão, leilão
        const decision = percentualConserto <= 70 ? 'Vale a pena consertar' : 'Indicado para leilão';
  
        veiculos.push({
          brand: fipeInfo.brand,
          modelo: fipeInfo.model,
          ano: fipeInfo.modelYear,
          precoFipe: fipeInfo.price,
          custoConserto: custoConserto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
          percentualConserto: percentualConserto.toFixed(2),
          decision
        });
      }
  
      // Gerar HTML com uma tabela para exibir os resultados
      let html = `
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Veículos FIPE e Análise de Conserto</title>
            <style>
              table { border-collapse: collapse; width: 80%; margin: 20px auto; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
              th { background-color: #f2f2f2; }
            </style>
          </head>
          <body>
            <h1 style="text-align: center;">Dados dos Veículos (FIPE) e Análise de Conserto/Leilão</h1>
            <table>
              <thead>
                <tr>
                  <th>Marca</th>
                  <th>Modelo</th>
                  <th>Ano</th>
                  <th>Valor FIPE</th>
                  <th>Custo de Conserto</th>
                  <th>% Custo Conserto</th>
                  <th>Decisão</th>
                </tr>
              </thead>
              <tbody>
      `;
  
      veiculos.forEach(v => {
        html += `
          <tr>
            <td>${v.brand}</td>
            <td>${v.modelo}</td>
            <td>${v.ano}</td>
            <td>${v.precoFipe}</td>
            <td>${v.custoConserto}</td>
            <td>${v.percentualConserto}%</td>
            <td>${v.decision}</td>
          </tr>
        `;
      });
  
      html += `
              </tbody>
            </table>
          </body>
        </html>
      `;
  
      res.send(html);
    } catch (error) {
      console.error('Erro ao buscar dados da API FIPE:', error);
      res.status(500).send('Erro ao buscar dados da API FIPE');
    }
  });

  app.get('/api/marcas', async (req, res) => {
    try {
      const response = await axios.get('https://parallelum.com.br/fipe/api/v2/cars/brands');
      res.json(response.data);
    } catch (error) {
      console.error('Erro ao consultar marcas:', error);
      res.status(500).json({ error: 'Erro ao carregar marcas' });
    }
  });
  app.get('/api/modelos', async (req, res) => {
    const { marca } = req.query;
    if (!marca) {
      return res.status(400).json({ error: 'Marca não informada' });
    }
    try {
      const response = await axios.get(`https://parallelum.com.br/fipe/api/v2/cars/brands/${marca}/models`);
      // Se a resposta for um array, use-a diretamente, caso contrário, tente usar response.data.modelos
      const modelos = Array.isArray(response.data) ? response.data : response.data.modelos;
      res.json(modelos);
    } catch (error) {
      console.error('Erro ao consultar modelos:', error);
      res.status(500).json({ error: 'Erro ao carregar modelos' });
    }
  });
  
  app.get('/api/anos', async (req, res) => {
    const { marca, modelo } = req.query;
    if (!marca || !modelo) {
      return res.status(400).json({ error: 'Marca e modelo são obrigatórios' });
    }
    try {
      const response = await axios.get(`https://parallelum.com.br/fipe/api/v2/cars/brands/${marca}/models/${modelo}/years`);
      res.json(response.data);
    } catch (error) {
      console.error('Erro ao consultar anos:', error);
      res.status(500).json({ error: 'Erro ao carregar anos' });
    }
  });


  */
////////////////////////////////////////////////////////////////conserto viavel ou nao
const axios = require('axios');

//
// --- ROTA GET /conserto-viavel ---
//  query tem que trazer os campos marca e marca_nome
app.get('/conserto-viavel', isAuthenticated, csrfProtection, async (req, res) => {
  try {
    const registros = await query(`
        SELECT 
          id, marca, marca_nome, modelo, modelo_nome,
          ano, valor_fipe, custo_conserto, conserto_viavel, dataCadastro
        FROM carro_reparo
        ORDER BY dataCadastro DESC
      `);

    // render de sucesso: inclui user
    res.render('conserto-viavel', {
      user: req.user,
      csrfToken: req.csrfToken(),
      registros,
      activePage: 'conserto-viavel',
    });
  } catch (err) {
    console.error('Erro ao buscar registros:', err);
    // render de erro:  inclui user
    res.render('conserto-viavel', {
      user: req.user,
      csrfToken: req.csrfToken(),
      registros: [],
      activePage: 'conserto-viavel',
    });
  }
});


// --- ROTA POST /salvar-avaliacao ---
app.post('/salvar-avaliacao', isAuthenticated, csrfProtection, (req, res) => {
  // Extração dos dados incluindo os dois campos para a marca
  const { marca, marca_nome, modelo, modelo_nome, ano, valor_fipe, custo_conserto, conserto_viavel } = req.body;

  const sql = `
    INSERT INTO carro_reparo (marca, marca_nome, modelo, modelo_nome, ano, valor_fipe, custo_conserto, conserto_viavel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [marca, marca_nome, modelo, modelo_nome, ano, valor_fipe, custo_conserto, conserto_viavel];

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("Erro ao salvar avaliação:", err);
      return res.status(500).json({ error: 'Erro ao salvar avaliação.' });
    }
    res.json({ sucesso: true, mensagem: 'Avaliação salva com sucesso.' });
  });
});

// --- ROTA POST /conserto-viavel (Avalia viabilidade sem salvar) ---

app.post('/conserto-viavel', isAuthenticated, csrfProtection, async (req, res) => {
  try {
    const { marca, modelo, ano: anoCodigo, custo_conserto } = req.body;
    if (!marca || !modelo || !anoCodigo || !custo_conserto) {
      return res.status(400).json({ sucesso: false, error: 'Dados incompletos.' });
    }

    // Consulta FIPE
    const urlFipe = `https://parallelum.com.br/fipe/api/v1/carros/marcas/${marca}/modelos/${modelo}/anos/${anoCodigo}`;
    const { data: fipeData } = await axios.get(urlFipe);
    const valorStr = fipeData.Valor; // ex: "R$ 50.000,00"
    const valor_fipe = parseFloat(
      valorStr.replace(/[R$\s.]/g, '').replace(',', '.')
    );

    const percentual = (parseFloat(custo_conserto) / valor_fipe) * 100;
    const conserto_viavel = percentual <= 70;
    // extrai só o ano numérico do código "1992-1"
    const ano_numero = parseInt(anoCodigo.split('-')[0], 10);

    return res.json({
      sucesso: true,
      csrfToken: req.csrfToken(),
      valor_fipe,
      percentual_custo: percentual,
      conserto_viavel,
      mensagem: conserto_viavel
        ? 'Vale a pena fazer o conserto.'
        : 'Não vale a pena o conserto, pois o custo ultrapassa 70% do valor do carro.',
      ano_numero,
      //user: req.user // Passa o usuário autenticado para o template
    });
  } catch (error) {
    console.error('Erro na rota /conserto-viavel:', error);
    return res.status(500).json({ sucesso: false, error: error.message });
  }
});

// --- Rotas da API FIPE  ---
app.get('/api/marcas', isAuthenticated, csrfProtection, async (req, res) => {
  try {
    const { data } = await axios.get(
      'https://parallelum.com.br/fipe/api/v1/carros/marcas'
    );
    res.json({ sucesso: true, marcas: data });
  } catch (error) {
    res.status(500).json({ sucesso: false, error: error.message });
  }
});


app.get('/api/modelos', isAuthenticated, csrfProtection, async (req, res) => {
  const { marca } = req.query;
  if (!marca) {
    return res.status(400).json({ sucesso: false, error: 'Marca obrigatória.' });
  }
  try {
    const { data } = await axios.get(
      `https://parallelum.com.br/fipe/api/v1/carros/marcas/${marca}/modelos`
    );
    res.json({ sucesso: true, modelos: data.modelos });
  } catch (error) {
    res.status(500).json({ sucesso: false, error: error.message });
  }
});

app.get('/api/anos', isAuthenticated, csrfProtection, async (req, res) => {
  const { marca, modelo } = req.query;
  if (!marca || !modelo) {
    return res
      .status(400)
      .json({ sucesso: false, error: 'Marca e modelo obrigatórios.' });
  }
  try {
    const { data } = await axios.get(
      `https://parallelum.com.br/fipe/api/v1/carros/marcas/${marca}/modelos/${modelo}/anos`
    );
    res.json({ sucesso: true, anos: data });
  } catch (error) {
    res.status(500).json({ sucesso: false, error: error.message });
  }
});

app.post('/excluir-avaliacao/:id', isAuthenticated, csrfProtection, async (req, res) => {
  const { id } = req.params;
  //console.log("Tentando excluir avaliação com id:", id);
  try {
    const result = await query("DELETE FROM carro_reparo WHERE id = ?", [id]);
    //console.log("Resultado da exclusão:", result);
    // Verifica se algum registro foi afetado
    if (result.affectedRows === 0) {
      return res.status(404).json({ sucesso: false, error: "Registro não encontrado." });
    }
    res.json({ sucesso: true, mensagem: "Registro excluído com sucesso!" });
  } catch (err) {
    console.error("Erro ao excluir avaliação:", err);
    res.status(500).json({ sucesso: false, error: "Erro interno no servidor." });
  }
});
/////////////////////////////// registro do user
app.get('/register', isAuthenticated, isAdmin, csrfProtection, (req, res) => {
  res.render('register', {
    erros: [],
    csrfToken: req.csrfToken(),
    email: '',
    senha: '',
    senha2: '',
    role: 'user',
    success_msg: '',
    error_msg: '',
    user: req.user,
    activePage: 'register'
  });
});

// ROTA POST - processar registro com validação de senha forte
app.post('/register', isAuthenticated, isAdmin, csrfProtection, (req, res) => {
  const { email, senha, senha2, role = 'user' } = req.body;
  const erros = [];
  let success_msg = '';
  let error_msg = '';

  // Regex de senha forte: mínimo 6 caracteres, com ao menos:
  // - 1 letra maiúscula
  // - 1 letra minúscula
  // - 1 número
  // - 1 caractere especial
  const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{6,}$/;

  // Validações básicas
  if (!email || !senha || !senha2) {
    erros.push({ msg: 'Preencha todos os campos.' });
  }
  if (senha !== senha2) {
    erros.push({ msg: 'As senhas não coincidem.' });
  }
  if (!strongPasswordRegex.test(senha)) {
    erros.push({
      msg: 'Senha fraca: use no mínimo 6 caracteres, incluindo letras maiúsculas, letras minúsculas, números e caracteres especiais.'
    });
  }
  if (!['user', 'admin'].includes(role)) {
    erros.push({ msg: 'Tipo de usuário inválido.' });
  }

  if (erros.length > 0) {
    return res.render('register', {
      erros,
      csrfToken: req.csrfToken(),
      email,
      senha: '',
      senha2: '',
      role,
      success_msg,
      error_msg,
      user: req.user
    });
  }

  // Verifica se o e-mail já existe
  pool.query('SELECT id FROM usuarios WHERE email = ?', [email], (err, results) => {
    if (err) {
      console.error(err);
      error_msg = 'Erro ao consultar o banco de dados.';
      return res.render('register', {
        erros,
        email,
        senha: '',
        senha2: '',
        role,
        success_msg,
        error_msg,
        user: req.user
      });
    }

    if (results.length > 0) {
      erros.push({ msg: 'E-mail já cadastrado.' });
      return res.render('register', {
        erros,
        email,
        senha: '',
        senha2: '',
        role,
        success_msg,
        error_msg,
        user: req.user
      });
    }

    // Hash da senha e inserção
    bcrypt.hash(senha, 12, (hashErr, hash) => {
      if (hashErr) {
        console.error(hashErr);
        error_msg = 'Erro ao gerar hash da senha.';
        return res.render('register', {
          erros,
          email,
          senha: '',
          senha2: '',
          role,
          success_msg,
          error_msg,
          user: req.user
        });
      }

      pool.query(
        'INSERT INTO usuarios (email, senha, role) VALUES (?, ?, ?)',
        [email, hash, role],
        (insertErr) => {
          if (insertErr) {
            console.error(insertErr);
            error_msg = 'Erro ao cadastrar usuário.';
            return res.render('register', {
              erros,
              email,
              senha: '',
              senha2: '',
              role,
              success_msg,
              error_msg,
              user: req.user
            });
          }

          success_msg = 'Usuário cadastrado com sucesso!';
          return res.render('register', {
            erros: [],
            csrfToken: req.csrfToken(),
            email: '',
            senha: '',
            senha2: '',
            role: 'user',
            success_msg,
            error_msg: '',
            user: req.user
          });
        }
      );
    });
  });
});


///////////////////////////////// fim registro user


//////////////////////////////////inicio editar usuasrios e motoristas

// LISTAR USUÁRIOS
app.get('/usuarios', isAuthenticated, csrfProtection, (req, res) => {
  pool.query('SELECT id, email, role FROM usuarios ORDER BY id', (err, results) => {
    if (err) {
      console.error(err);
      return res.sendStatus(500);
    }
    res.render('usuarios', {
      user: req.user,
      csrfToken: req.csrfToken(),
      usuarios: results,
      activePage: 'usuarios'
    });
  });
});

// LISTAR MOTORISTAS
app.get('/motoristas', isAuthenticated, csrfProtection, (req, res) => {
  pool.query(`
      SELECT 
        id, nome, email, cpf, cnh, DATE_FORMAT(data_validade, '%Y-%m-%d') AS data_validade, categoria
      FROM motoristas
      ORDER BY id
    `, (err, results) => {
    if (err) {
      console.error(err);
      return res.sendStatus(500);
    }
    res.render('motoristas', {
      user: req.user,
      csrfToken: req.csrfToken(),
      motoristas: results,
      activePage: 'motoristas'
    });
  });
});

app.delete(
  '/api/deletar-motorista/:id',
  isAuthenticated,
  csrfProtection,
  async (req, res) => {
    const { id } = req.params;
    try {
      // 1) Apaga todos os reembolsos desse motorista
      await query('DELETE FROM reembolsos WHERE motorista_id = ?', [id]);

      // 2) Em seguida, apaga o motorista
      await query('DELETE FROM motoristas WHERE id = ?', [id]);

      return res.json({
        success: true,
        message: 'Motorista e reembolsos associados excluídos com sucesso.'
      });
    } catch (err) {
      console.error('Erro ao excluir motorista:', err);
      return res
        .status(500)
        .json({ success: false, message: 'Não foi possível excluir o motorista.' });
    }
  }
);


// === EDITAR USUÁRIO ===
//  exibe formulário com email e role
app.get('/usuarios/:id/edit', isAuthenticated, csrfProtection, (req, res) => {
  const { id } = req.params;
  pool.query('SELECT id, email, role FROM usuarios WHERE id = ?', [id], (err, results) => {
    if (err || !results.length) {
      return res.redirect('/usuarios');
    }
    res.render('edit-usuario', {
      user: req.user,
      csrfToken: req.csrfToken(),
      erros: [],
      usuario: results[0]
    });
  });
});

//  valida e atualiza email e role
app.post('/usuarios/:id/edit', isAuthenticated, csrfProtection, (req, res) => {
  const { id } = req.params;
  const { email, role } = req.body;
  const erros = [];

  if (!email || !role) {
    erros.push({ msg: 'Preencha todos os campos.' });
  }
  if (!['user', 'admin'].includes(role)) {
    erros.push({ msg: 'Role inválido.' });
  }

  if (erros.length) {
    return res.render('edit-usuario', { user: req.user, erros, usuario: { id, email, role } });
  }

  // Verifica duplicidade de email
  pool.query('SELECT id FROM usuarios WHERE email = ? AND id <> ?', [email, id], (err, rows) => {
    if (err) {
      console.error(err);
      erros.push({ msg: 'Erro no servidor.' });
      return res.render('edit-usuario', { user: req.user, erros, usuario: { id, email, role } });
    }
    if (rows.length) {
      erros.push({ msg: 'E-mail já em uso.' });
      return res.render('edit-usuario', { user: req.user, erros, usuario: { id, email, role } });
    }

    // Atualiza
    pool.query(
      'UPDATE usuarios SET email = ?, role = ? WHERE id = ?',
      [email, role, id],
      updateErr => {
        if (updateErr) {
          console.error(updateErr);
          erros.push({ msg: 'Erro ao atualizar.' });
          return res.render('edit-usuario', { user: req.user, erros, usuario: { id, email, role } });
        }
        res.redirect('/usuarios');
      }
    );
  });
});




// === EDITAR MOTORISTA ===

//const methodOverride = require('method-override');
//app.use(methodOverride('_method'));

// exibe formulário com todos os campos, incluindo fotoCNH
app.get(
  '/motoristas/:id/edit',
  isAuthenticated,
  csrfProtection,
  async (req, res) => {
    const { id } = req.params;
    try {
      const resultados = await query(
        'SELECT * FROM motoristas WHERE id = ?',
        [id]
      );
      if (!resultados.length) {
        return res.redirect('/motoristas');
      }

      const motorista = resultados[0];
      let fotoCNH = null;
      if (motorista.foto_cnh) {
        fotoCNH = Buffer
          .from(motorista.foto_cnh)
          .toString('base64');
      }

      res.render('edit-motorista', {
        user: req.user,
        csrfToken: req.csrfToken(),
        erros: [],
        motorista,
        fotoCNH
      });

    } catch (err) {
      console.error('Erro ao buscar motorista para edição:', err);
      res.redirect('/motoristas');
    }
  }
);


/*const uploadFotoBanco = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Só imagens são permitidas'), false);
    }
    cb(null, true);
  }
}).single('foto');*/

app.post(
  '/api/editar-motorista/:id',
  isAuthenticated,
  uploadFotoBanco,
  csrfProtection,
  async (req, res) => {
    const { id } = req.params;
    const { nome, cpf, cnh, dataValidade, categoria } = req.body;
    const bufferFoto = req.file ? req.file.buffer : null;
    const email = req.user.email;

    // validações
    if (!nome || !cpf || !cnh || !dataValidade || !categoria) {
      return res.status(400).json({ success: false, message: 'Preencha todos os campos.' });
    }
    if (moment(dataValidade).isBefore(moment(), 'day')) {
      return res.status(400).json({ success: false, message: 'CNH vencida.' });
    }
    if (!validarCPF(cpf)) {
      return res.status(400).json({ success: false, message: 'CPF inválido.' });
    }
    if (!/^[0-9]{9}$/.test(cnh.replace(/\D/g, ''))) {
      return res.status(400).json({ success: false, message: 'CNH inválida.' });
    }

    try {
      // duplicidade CPF
      const existingCPF = await query(
        'SELECT id FROM motoristas WHERE cpf = ? AND id <> ?',
        [cpf, id]
      );
      if (existingCPF.length) {
        return res.status(400).json({ success: false, message: 'CPF já cadastrado.' });
      }

      // duplicidade CNH
      const existingCNH = await query(
        'SELECT id FROM motoristas WHERE cnh = ? AND id <> ?',
        [cnh, id]
      );
      if (existingCNH.length) {
        return res.status(400).json({ success: false, message: 'CNH já cadastrada.' });
      }

      // build do UPDATE
      const fields = [nome, email, cpf, cnh, dataValidade, categoria];
      let sql = 'UPDATE motoristas SET nome=?, email=?, cpf=?, cnh=?, data_validade=?, categoria=?';

      if (bufferFoto) {
        sql += ', foto_cnh = ?';
        fields.push(bufferFoto);
      }

      sql += ' WHERE id = ?';
      fields.push(id);

      await query(sql, fields);
      res.json({ success: true, message: 'Motorista atualizado!' });

    } catch (err) {
      console.error('Erro ao atualizar motorista:', err);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  }
);



//////////////////////////////////fim editar ususarios e motoristas

/////////////////////////////////////////////GPS conecção com os dados recebidos em database GPS, tabela gps_history
// Parse MYSQL_URL ou MYSQL_PUBLIC_URL para obter conexão (Railway)
const mysqlUrl = process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL;
let gpsHost, gpsUser, gpsPassword, gpsDatabase, gpsPort;

if (mysqlUrl) {
  const url = new URL(mysqlUrl);
  gpsHost = url.hostname;
  gpsUser = url.username;
  gpsPassword = url.password;
  gpsDatabase = url.pathname.substring(1);
  gpsPort = url.port || 3306;
}

// Debug: mostrar o que será usado para GPS
console.log('>> [DEBUG] Configuração GPS:');
console.log('  Host:', gpsHost ? '✅' : '❌');
console.log('  User:', gpsUser ? '✅' : '❌');
console.log('  Password:', gpsPassword ? '✅' : '❌');
console.log('  Database:', gpsDatabase ? '✅' : '❌');
console.log('  Port:', gpsPort || '❌ não definido');

const GPS_ENABLED = Boolean(gpsHost && gpsUser && gpsPassword && gpsDatabase);

let poolGps;
let queryGps;

if (GPS_ENABLED) {
  // Pool GPS
  // Usa GSP_DB_* se existir, senão usa DB_* (mesmo banco do sistema)
  poolGps = mysql.createPool({
    host: gpsHost,
    port: gpsPort ? Number(gpsPort) : undefined,
    user: gpsUser,
    password: gpsPassword,
    database: gpsDatabase,
    waitForConnections: true,
    connectionLimit: 5
  });
  queryGps = util.promisify(poolGps.query).bind(poolGps);

  // Teste de conexão
  poolGps.getConnection((err, conn) => {
    if (err) {
      console.error('>> [SERVER] Falha ao conectar no DB GPS:', err.stack);
      console.log('>> [SERVER] Usando banco principal como fallback para GPS');
      // Fallback: usar o banco principal
      queryGps = util.promisify(db.query).bind(db);
      return;
    }
    console.log('>> [SERVER] Conexão ao DB GPS OK');
    conn.release();
  });
} else {

  // Rota para consumir histórico GPS, aceita ?device=ID
  app.get('/gps-history', async (req, res) => {
    try {
      const devId = req.query.device;
      if (!devId) {
        return res.status(400).json({ error: 'Falta o parâmetro device' });
      }

      // Busca os 1000 pontos mais recentes (ORDER BY DESC)
      const rows = await queryGps(
        `SELECT latitude, longitude, datahora_recebido
           FROM gps_history
          WHERE fk_device = ?
          ORDER BY datahora_recebido DESC
          LIMIT 1000`,
        [devId]
      );

      // Inverte para ordem cronológica (do mais antigo ao mais novo)
      const ordered = rows.reverse();

      console.log(`>> [SERVER] Dados GPS consumidos para device ${devId}:`, ordered.length, 'pontos');
      res.json(ordered);
    } catch (err) {
      console.error('>> [SERVER] Erro ao buscar histórico GPS:', err);
      res.status(500).json({ error: 'Erro ao buscar histórico GPS' });
    }
  });
} else {
  console.log('>> [SERVER] GPS desabilitado, usando banco principal como fallback');
  // Fallback: usar o banco principal
  queryGps = util.promisify(db.query).bind(db);
}

// Rota para exibir o mapa com layout próprio
app.get(
  '/mapa-gps',
  isAuthenticated,
  (req, res) => {
    if (!GPS_ENABLED) {
      return res.status(503).send('GPS desabilitado');
    }
    console.log(`>> [SERVER] GET /mapa-gps por user=${req.user.id}`);
    res.render('gps-history', {
      layout: 'layout-gps',      // usa views/layout-gps.ejs
      title: 'Mapa GPS em Tempo Real',
      user: req.user             // se precisar de dados de usuário
      // note: não passamos csrfToken
    });
  }
);


//////////////////////////////////////////////////////////////////////// FIM - GPS conecção com os dados recebidos em database GPS, tabela gps_history
// suposição: você já tem a queryGps(id) que retorna o último ponto do device
// Função que traz, em uma única query, o último ponto de cada device
async function getLatestPositions() {
  if (!GPS_ENABLED) return [];
  return queryGps(
    `SELECT
       g.fk_device   AS deviceId,
       g.latitude,
       g.longitude,
       g.datahora_recebido
     FROM gps_history AS g
     INNER JOIN (
       SELECT fk_device, MAX(datahora_recebido) AS max_datahora
       FROM gps_history
       GROUP BY fk_device
     ) AS aux
       ON g.fk_device = aux.fk_device
       AND g.datahora_recebido = aux.max_datahora;`
  );
}

io.on('connection', socket => {
  console.log('>> [SERVER] Cliente conectado via Socket.IO');

  socket.on('subscribeToDevice', async devId => {
    if (!GPS_ENABLED) return;
    socket.join(devId);
    console.log(`>> [SERVER] Cliente inscrito para device ${devId}`);

    // envio imediato do último ponto daquele device
    const rows = await queryGps(
      `SELECT latitude, longitude, datahora_recebido, fk_device AS deviceId
         FROM gps_history
        WHERE fk_device = ?
        ORDER BY datahora_recebido DESC
        LIMIT 1`,
      [devId]
    );
    if (rows.length) {
      socket.to(devId).emit('locationUpdate', rows[0]);
    }
  });

  socket.on('disconnect', () => {
    console.log('>> [SERVER] Cliente desconectado');
  });
});

// broadcast em lote a cada 1s, usando UMA ÚNICA query para TODOS os devices
setInterval(async () => {
  if (!GPS_ENABLED) return;
  const latestPoints = await getLatestPositions();
  // para cada ponto retornado, emite na sala correspondente
  for (const pt of latestPoints) {
    io.to(String(pt.deviceId)).emit('locationUpdate', pt);
  }
}, 1000);


////-----------------GPS via api  --------------------------
const jwt = require('jsonwebtoken');
const deviceSecrets = {
  'DIEGO-DEVICE-001': process.env.DEVICE_SECRET
};

// ====== 1) Endpoint de autenticação do dispositivo ======
app.post('/auth-device', (req, res) => {
  const { deviceId, deviceSecret } = req.body;
  const expected = deviceSecrets[deviceId];

  if (!expected || expected !== deviceSecret) {
    return res.status(401).json({ error: 'Credenciais do dispositivo inválidas' });
  }

  // gera um JWT de 24h para o dispositivo
  const accessToken = jwt.sign(
    { deviceId },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ accessToken });
});

// ====== 2) Middleware de validação do JWT de acesso ======
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];
  if (!token)
    return res.status(401).json({ error: 'Token não fornecido' });

  jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
    if (err)
      return res.status(403).json({ error: 'Token inválido ou expirado' });
    req.deviceId = payload.deviceId;
    next();
  });
}

// ====== 3) Rota protegida que recebe dados de GPS ======
app.post('/update-location', authenticateToken, (req, res) => {
  const { vehicleId, latitude, longitude } = req.body;

  // Emite via Socket.IO para todos inscritos
  io.emit('locationUpdate', { vehicleId, latitude, longitude });

  // Gera um token de operação para registro/auditoria
  const operationToken = jwt.sign(
    {
      deviceId: req.deviceId,
      vehicleId,
      latitude,
      longitude,
      ts: Date.now()
    },
    process.env.JWT_SECRET,
    // opcional: expiresIn: '1h'
  );

  res.json({
    status: 'ok',
    received: { vehicleId, latitude, longitude },
    operationToken
  });

  console.log(`GPS de ${req.deviceId}: veículo ${vehicleId} → ${latitude},${longitude}`);
});
////////////////////////////////////////////////////////// Relação uso + gps_history + device
app.get('/trips-history-view', isAuthenticated, (req, res) => {
  res.render('trips-history', { layout: 'layout-gps', title: 'Histórico de Viagens' });
});

// Helper para formatar duração em HH:mm:ss
function formatDuration(sec) {
  const h = Math.floor(sec / 3600).toString().padStart(2, '0');
  const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// Helper Haversine
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = v => v * Math.PI / 180;
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1), Δλ = toRad(lon2 - lon1);
  const a = Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

app.get('/trips-history', isAuthenticated, async (req, res) => {
  try {
    if (!GPS_ENABLED) {
      return res.status(503).json({ error: 'GPS desabilitado' });
    }
    const rows = await queryGps(`
      SELECT latitude, longitude, datahora_recebido AS ts
      FROM gps_history
      ORDER BY datahora_recebido ASC
    `);

    const trips = [];
    let current = null;

    for (const pt of rows) {
      const t = new Date(pt.ts).getTime();
      if (!current) {
        current = { points: [pt], distance: 0 };
      } else {
        const last = current.points[current.points.length - 1];
        const tLast = new Date(last.ts).getTime();
        if (t - tLast > 5 * 60 * 1000) {
          trips.push(current);
          current = { points: [pt], distance: 0 };
        } else {
          // acumulando distância
          current.distance += haversineDistance(
            last.latitude, last.longitude,
            pt.latitude, pt.longitude
          );
          current.points.push(pt);
        }
      }
    }
    if (current) trips.push(current);

    // formata saída
    const result = trips.map((trip, idx) => {
      const start = trip.points[0].ts;
      const end = trip.points[trip.points.length - 1].ts;
      const durationSec = (new Date(end) - new Date(start)) / 1000;
      const distanceKm = +(trip.distance / 1000).toFixed(2);
      const avgKmh = +((distanceKm) / (durationSec / 3600)).toFixed(2);
      return {
        tripId: idx + 1,
        start, end,
        durationSec,
        durationStr: formatDuration(durationSec),
        distanceKm,
        avgKmh,
        points: trip.points.map(p => ({
          latitude: p.latitude,
          longitude: p.longitude,
          timestamp: p.ts
        }))
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar histórico de viagens' });
  }
});

// ====== Controller: app.get('/viagensComUso', …) ======

app.get(
  '/viagensComUso',
  isAdmin,
  isAuthenticated,
  csrfProtection,
  async (req, res) => {
    try {
      // 1) Extrai filtros + paginação
      const {
        veiculo: filtroVeiculo,
        device: filtroDevice,
        motorista,
        dataInicio,
        dataFim,
        buscaTexto,
        page: rawPage,
        pageSize: rawPageSize
      } = req.query;

      const page = Math.max(1, parseInt(rawPage, 10) || 1);
      const pageSize = Math.max(1, parseInt(rawPageSize, 10) || 1);

      // 2) Buscar todos os veículos
      const [veiculos] = await db.promise().query(`
        SELECT
          id          AS veiculoId,
          placa,
          modelo,
          dispositivo,
          device_id
        FROM veiculos
        ORDER BY id DESC
      `);

      // 3) Monta WHERE e params
      const where = [
        'u.data_hora_inicial IS NOT NULL',
        'u.data_hora_final   IS NOT NULL'
      ];
      const params = [];

      if (filtroVeiculo) {
        where.push('u.veiculo_id = ?');
        params.push(Number(filtroVeiculo));
      }
      if (filtroDevice) {
        where.push('v.dispositivo = ?');
        params.push(filtroDevice);
      }
      if (motorista) {
        where.push('LOWER(u.motorista) LIKE ?');
        params.push(`%${motorista.toLowerCase()}%`);
      }
      if (dataInicio) {
        where.push('u.data_hora_inicial >= ?');
        params.push(`${dataInicio} 00:00:00`);
      }
      if (dataFim) {
        where.push('u.data_hora_final <= ?');
        params.push(`${dataFim} 23:59:59`);
      }
      if (buscaTexto) {
        where.push('(u.finalidade LIKE ? OR u.descricao LIKE ?)');
        params.push(`%${buscaTexto}%`, `%${buscaTexto}%`);
      }

      // 4) Contar total
      const countSql = `
        SELECT COUNT(*) AS total
        FROM uso_veiculos u
        JOIN veiculos v ON v.id = u.veiculo_id
        WHERE ${where.join(' AND ')}
      `;
      const [[{ total }]] = await db.promise().query(countSql, params);

      // 5) Buscar página atual
      const totalPages = Math.ceil(total / pageSize);
      const offset = (page - 1) * pageSize;

      const usosSql = `
        SELECT
          u.id                AS usoId,
          u.veiculo_id        AS veiculoId,
          u.motorista,
          u.finalidade,
          u.descricao,
          u.km_inicial        AS kmInicial,
          u.km_final          AS kmFinal,
          u.data_hora_inicial AS inicio,
          u.data_hora_final   AS fim,
          u.start_lat,
          u.start_lng,
          u.end_lat,
          u.end_lng
        FROM uso_veiculos u
        JOIN veiculos v ON v.id = u.veiculo_id
        WHERE ${where.join(' AND ')}
        ORDER BY u.data_hora_inicial DESC
        LIMIT ? OFFSET ?
      `;
      const [usos] = await db.promise().query(
        usosSql,
        params.concat([pageSize, offset])
      );

      // 6) Processar cada uso
      const viagens = [];
      for (let uso of usos) {
        const veic = veiculos.find(v => v.veiculoId === uso.veiculoId);
        if (!veic || !veic.device_id) continue;

        // 6.1) Pontos GPS
        const pontos = await queryGps(`
          SELECT latitude, longitude, datahora_recebido AS timestamp
          FROM gps_history
          WHERE fk_device = ?
            AND datahora_recebido BETWEEN ? AND ?
          ORDER BY datahora_recebido ASC
        `, [veic.device_id, uso.inicio, uso.fim]);

        // 6.2) Distância real
        let totalDist = 0;
        for (let i = 1; i < pontos.length; i++) {
          totalDist += haversineDistance(
            pontos[i - 1].latitude,
            pontos[i - 1].longitude,
            pontos[i].latitude,
            pontos[i].longitude
          );
        }
        const kmGps = +(totalDist / 1000).toFixed(2);

        // 6.3) Distância ideal
        let idealKm = 0;
        if (
          uso.start_lat != null && uso.start_lng != null &&
          uso.end_lat != null && uso.end_lng != null
        ) {
          const osrmUrl = `https://router.project-osrm.org/route/v1/driving/`
            + `${uso.start_lng},${uso.start_lat};${uso.end_lng},${uso.end_lat}`
            + `?overview=false`;

          const osrmRes = await fetch(osrmUrl);
          const osrmJson = await osrmRes.json();
          if (osrmJson.routes?.[0]) {
            idealKm = +(osrmJson.routes[0].distance / 1000).toFixed(2);
          }
        }

        // 6.4) Cálculos finais
        const percDesvio = idealKm > 0
          ? +(((kmGps - idealKm) / idealKm) * 100).toFixed(2)
          : 0;
        const kmInformado = uso.kmFinal - uso.kmInicial;
        const diferencaKm = +(kmInformado - kmGps).toFixed(2);
        const durationSec = (new Date(uso.fim) - new Date(uso.inicio)) / 1000;
        const avgKmh = durationSec > 0
          ? +(kmGps / (durationSec / 3600)).toFixed(2)
          : 0;

        viagens.push({
          ...uso,
          placa: veic.placa,
          modelo: veic.modelo,
          deviceId: veic.device_id,
          kmGps,
          idealKm,
          percDesvio,
          kmInformado,
          diferencaKm,
          durationSec,
          durationStr: formatDuration(durationSec),
          avgKmh,
          points: pontos
        });
      }

      // 7) Renderiza view
      res.render('viagensComUso', {
        layout: 'layout',
        title: 'Viagens com Uso',
        viagens,
        veiculos,
        query: req.query,   // passa query para a view
        page,
        pageSize,
        totalPages,
        total,
        csrfToken: req.csrfToken(),
        activePage: 'viagensComUso',
        user: req.user
      });

    } catch (err) {
      console.error('Erro em /viagensComUso:', err);
      res.status(500).send('Erro interno');
    }
  }
);


app.get('/tutorial', isAuthenticated, csrfProtection, (req, res) => {
  res.render('tutorial', { title: 'Tutorial de Uso', activePage: 'tutorial', csrfToken: req.csrfToken(), user: req.user });
});


/*
// deu certo com filtro por device/ placa
app.get('/viagensComUso', isAuthenticated, async (req, res) => {
  try {
    const filtroVeiculo = req.query.veiculo ? Number(req.query.veiculo) : null;

    // 1) Buscar veículos (com deviceId) do banco de FROTA
    const [veiculos] = await db.promise().query(`
      SELECT id AS veiculoId, placa, device_id AS deviceId
      FROM veiculos
      ORDER BY placa
    `);

    // 2) WHERE dinâmico
    const where = ['u.data_hora_inicial IS NOT NULL', 'u.data_hora_final IS NOT NULL'];
    const params = [];

    if (filtroVeiculo) {
      where.push('u.veiculo_id = ?');
      params.push(filtroVeiculo);
    }

    // 3) Buscar os usos de veículos (com km e datas)
    const [usos] = await db.promise().query(`
      SELECT 
        u.id                AS usoId,
        u.veiculo_id        AS veiculoId,
        v.placa             AS placa,
        u.motorista,
        u.finalidade,
        u.descricao,
        u.km_inicial        AS kmInicial,
        u.km_final          AS kmFinal,
        u.data_hora_inicial AS inicio,
        u.data_hora_final   AS fim,
        u.start_lat         AS startLat,
        u.start_lng         AS startLng,
        u.end_lat           AS endLat,
        u.end_lng           AS endLng
      FROM uso_veiculos u
      JOIN veiculos v ON v.id = u.veiculo_id
      WHERE ${where.join(' AND ')}
      ORDER BY u.data_hora_inicial DESC
      LIMIT 10
    `, params);

    // 4) Montar as viagens com pontos GPS
    const viagens = [];

    for (const uso of usos) {
      const veiculo = veiculos.find(v => v.veiculoId === uso.veiculoId);
      if (!veiculo) continue;

      let pontos = [];
      
      // Tentar buscar pontos GPS se tiver device_id
      if (veiculo.deviceId) {
        const devId = veiculo.deviceId;
        try {
          console.log(`>> [GPS] Buscando pontos para device ${devId} entre ${uso.inicio} e ${uso.fim}`);
          pontos = await queryGps(`
            SELECT latitude, longitude, datahora_recebido AS timestamp
            FROM gps_history
            WHERE fk_device = ?
              AND datahora_recebido BETWEEN ? AND ?
            ORDER BY datahora_recebido ASC
          `, [devId, uso.inicio, uso.fim]);
          console.log(`>> [GPS] Encontrados ${pontos.length} pontos para ${devId}`);
        } catch (err) {
          console.warn('>> [GPS] Erro ao buscar GPS:', err.message);
          console.log('>> [GPS] Usando coordenadas start/end como fallback');
        }
      } else {
        console.log(`>> [GPS] Veículo ${uso.placa} não tem device_id, usando start/end`);
      }

      // Se não tiver pontos GPS suficientes, usar coordenadas start/end do uso
      if (pontos.length < 2) {
        console.log(`>> [GPS] Pontos GPS insuficientes (${pontos.length})`);
        if (uso.startLat && uso.startLng && uso.endLat && uso.endLng) {
          console.log(`>> [GPS] Usando coordenadas start/end: (${uso.startLat}, ${uso.startLng}) → (${uso.endLat}, ${uso.endLng})`);
          pontos = [
            { latitude: uso.startLat, longitude: uso.startLng, timestamp: uso.inicio },
            { latitude: uso.endLat, longitude: uso.endLng, timestamp: uso.fim }
          ];
        } else {
          console.log(`>> [GPS] Coordenadas start/end não encontradas para uso ${uso.usoId}`);
          console.log(`>> [GPS] startLat: ${uso.startLat}, startLng: ${uso.startLng}, endLat: ${uso.endLat}, endLng: ${uso.endLng}`);
        }
      }

      if (pontos.length < 2) {
        console.log(`>> [GPS] Pulando uso ${uso.usoId} - sem pontos suficientes`);
        continue;
      }

      // Cálculo de distância
      let totalDist = 0;
      for (let i = 1; i < pontos.length; i++) {
        totalDist += haversineDistance(
          pontos[i - 1].latitude, pontos[i - 1].longitude,
          pontos[i].latitude, pontos[i].longitude
        );
      }

      const distanceKm = totalDist / 1000;
      const durationSec = (new Date(uso.fim) - new Date(uso.inicio)) / 1000;
      const avgKmh = durationSec > 0
        ? +(distanceKm / (durationSec / 3600)).toFixed(2)
        : 0;

      viagens.push({
        usoId: uso.usoId,
        veiculoId: uso.veiculoId,
        placa: uso.placa,
        motorista: uso.motorista,
        finalidade: uso.finalidade,
        descricao: uso.descricao,
        kmInicial: uso.kmInicial,
        kmFinal: uso.kmFinal,
        inicio: uso.inicio,
        fim: uso.fim,
        durationSec,
        durationStr: formatDuration(durationSec),
        distanceKm: +distanceKm.toFixed(2),
        avgKmh,
        points: pontos
      });
    }

    // 5) Renderiza com os dados
    res.render('viagensComUso', {
      layout: 'layout-gps',
      title: 'Viagens com Uso',
      viagens,
      veiculos,
      selectedVeiculo: filtroVeiculo,
      user: req.user
    });

  } catch (err) {
    console.error('Erro ao buscar viagens com uso:', err);
    res.status(500).send('Erro interno ao montar viagens');
  }
}); */

////////////////////////////////////////////////////////

// GET /uso-veiculo-rota?veiculoId=...
app.get('/uso-veiculo-rota', isAuthenticated, (req, res) => {
  const veiculoId = req.query.veiculoId;
  db.query(
    `SELECT start_lat, start_lng, end_lat, end_lng
     FROM uso_veiculos
     WHERE veiculo_id = ?
       AND km_final IS NULL
     ORDER BY data_hora_inicial DESC
     LIMIT 1`,
    [veiculoId],
    (err, rows) => {
      if (err) {
        console.error('Erro ao buscar rota ideal:', err);
        return res.status(500).json({ error: 'Erro interno' });
      }
      res.json(rows[0] || {});
    }
  );
});


//////////////////////////////////////////////////////////////
// Rotas pra servir o manifest e o service worker (PWA)
//app.get('/manifest.json', (req, res) => {
//res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
//});

//app.get('/service-worker.js', (req, res) => {
// res.sendFile(path.join(__dirname, 'public', 'service-worker.js'));
//});

/* //Código de registro do service worker (lembre: isso roda no browser!)
if ('serviceWorker' in navigator) {
   window.addEventListener('load', () => {
     navigator.serviceWorker.register('/service-worker.js')
       .then(registration => {
         console.log('Service Worker registrado com sucesso:', registration.scope);
       })
       .catch(error => {
         console.error('Falha ao registrar o Service Worker:', error);
       });
   });
} */

/*
// Código para iniciar o servidor com Socket.IO (opcional)
// server.listen(port, () => {
//     console.log(`Servidor rodando na porta ${port}`);
// });
*/
///////////////////////////////////////////////////////////////////////GEOFENCES 


// Rota GET /admin/gps-controle
app.get('/admin/gps-controle', isAuthenticated, isAdmin, csrfProtection, async (req, res) => {
  try {
    // 1) Buscar veículos com deviceId
    const [veiculos] = await db.promise().query(`
      SELECT
        v.id         AS veiculoId,
        v.placa,
        v.modelo,
        v.device_id  AS deviceId
      FROM veiculos v
      WHERE v.device_id IS NOT NULL
      ORDER BY v.placa
    `);

    // 2) Última posição de cada dispositivo (banco GPS)
    let ultimasPosicoes = [];
    try {
      const sqlUltima = `
        SELECT
          g.fk_device         AS deviceId,
          g.latitude,
          g.longitude,
          g.datahora_recebido AS timestamp
        FROM gps_history g
        INNER JOIN (
          SELECT fk_device, MAX(datahora_recebido) AS max_ts
          FROM gps_history
          GROUP BY fk_device
        ) ult ON ult.fk_device = g.fk_device
               AND ult.max_ts    = g.datahora_recebido
      `;
      ultimasPosicoes = await queryGps(sqlUltima);
    } catch (err) {
      console.warn('gps_history inacessível:', err.message);
      ultimasPosicoes = [];
    }

    // 3) Buscar geofences (banco principal: controle_frota)
    const [geofences] = await db.promise().query(`
      SELECT
        id,
        nome,
        ST_AsText(geom) AS wkt_polygon
      FROM geofences
      ORDER BY nome
    `);

    // 4) Histórico de GPS (se veio ?device=xxx)
    let historico = [];
    if (req.query.device) {
      const deviceSel = req.query.device;
      try {
        const sqlHist = `
          SELECT latitude, longitude, datahora_recebido AS timestamp
          FROM gps_history
          WHERE fk_device = ?
          ORDER BY datahora_recebido DESC
          LIMIT 50
        `;
        const pontos = await queryGps(sqlHist, [deviceSel]);
        historico = pontos.reverse();
      } catch (err) {
        console.warn('Não foi possível carregar histórico para device:', deviceSel);
        historico = [];
      }
    }

    // 5) Carregar notificações recentes
    let notificacoes = [];
    try {
      const [rows] = await db.promise().query(`
        SELECT n.id, n.mensagem, n.criado_em
        FROM notificacoes n
        ORDER BY n.criado_em DESC
        LIMIT 10
      `);
      notificacoes = rows;
    } catch (err) {
      console.warn("Erro ao buscar notificações:", err.message);
    }

    // 6) Renderizar a view
    res.render('adminGpsControle', {
      title: 'Controle GPS - Admin',
      csrfToken: req.csrfToken(),
      veiculos,
      ultimasPosicoes,
      geofences,
      historico,
      selectedDevice: req.query.device || null,
      user: req.user,
      activePage: 'gps-controle',
      notificacoes   // <-- importante
    });
  } catch (err) {
    console.error('Erro geral em /admin/gps-controle:', err);
    res.status(500).send('Erro interno');
  }
});


app.post('/admin/geofences/criar', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { nome, wkt_polygon } = req.body;
    if (!nome || !wkt_polygon) {
      return res.status(400).send('Nome e WKT obrigatórios.');
    }
    // Insere no banco controle_frota.geofences
    await db.promise().query(
      `INSERT INTO geofences (nome, geom) VALUES (?, ST_GeomFromText(?))`,
      [nome, wkt_polygon]
    );
    res.status(200).send('OK');
  } catch (err) {
    console.error('Erro ao criar geofence:', err);
    res.status(500).send('Erro ao criar geofence');
  }
});

// Exemplo de rota para buscar geofences em JSON
app.get('/geofences-json', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const [geofences] = await db.promise().query(`
      SELECT
        id,
        nome,
        ST_AsText(geom) AS wkt_polygon
      FROM geofences
      ORDER BY nome
    `);
    // Retorna o array de objetos: { id, nome, wkt_polygon }
    res.json(geofences);
  } catch (err) {
    console.error('Erro ao buscar geofences em JSON:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Rota POST para deletar geofence
app.post('/admin/geofences/excluir/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    await db.promise().query(`DELETE FROM geofences WHERE id = ?`, [id]);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir geofence:', err);
    res.status(500).json({ success: false, message: 'Erro ao excluir' });
  }
});



// Rota de teste mínimo para Leaflet
app.get('/test-map', isAuthenticated, isAdmin, (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Teste Leaflet Simples</title>

        <!-- Leaflet CSS via cdnjs (sem integrity) -->
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.3/leaflet.css"
        />

        <style>
          /* Sem altura o DIV ficará invisível */
          #mapTest {
            height: 400px;
            width: 100%;
          }
          body {
            margin: 0;
          }
        </style>
      </head>
      <body>
        <h3 style="text-align:center; margin:10px 0">
          Se você vê este título, o HTML foi carregado.
        </h3>
        <div id="mapTest"></div>

        <!-- Leaflet JS via cdnjs (sem integrity) -->
        <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.3/leaflet.js"></script>
        <script>
          document.addEventListener('DOMContentLoaded', () => {
            const map = L.map('mapTest').setView([-23.55, -46.63], 12);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              attribution: '&copy; OpenStreetMap Contributors'
            }).addTo(map);
          });
        </script>
      </body>
    </html>
  `);
});


app.get('/cadastrar-dispositivo', isAdmin, isAuthenticated, csrfProtection, (req, res) => {
  const randomHash = crypto.randomBytes(16).toString('hex');

  res.render('cadastrar-dispositivo', {
    csrfToken: req.csrfToken(),
    title: 'Controle GPS - Admin',
    formData: {
      dev_name: '',
      dev_key: randomHash
    },
    error: null,
    activePage: 'cadastrar-dispositivo'
  });
});

app.post(
  '/cadastrar-dispositivo',
  isAdmin,
  isAuthenticated,
  csrfProtection,
  async (req, res) => {
    let { dev_name, dev_key } = req.body;

    // Valida e gera hash aleatório se necessário
    if (!dev_key || typeof dev_key !== 'string' || dev_key.trim().length === 0) {
      dev_key = crypto.randomBytes(16).toString('hex');
    }

    try {
      const sql = `
        INSERT INTO devices
          (dev_name, dev_key, dev_status, dev_created)
        VALUES (?, ?, 0, NOW())
      `;
      await queryGps(sql, [dev_name, dev_key]);

      return res.redirect('/listar-dispositivos');
    } catch (err) {
      console.error('Erro ao cadastrar dispositivo:', err);
      return res.render('cadastrar-dispositivo', {
        csrfToken: req.csrfToken(),
        title: 'Controle GPS - Admin',
        error: 'Falha ao cadastrar dispositivo. Tente novamente.',
        formData: { dev_name, dev_key },
        activePage: 'cadastrar-dispositivo'
      });
    }
  }
);


// lista todos os dispositivos
app.get(
  '/listar-dispositivos',
  isAdmin,
  isAuthenticated,
  csrfProtection,
  async (req, res) => {
    try {
      const sql = `
        SELECT dev_id, dev_name, dev_key, dev_status, dev_created
          FROM devices
         ORDER BY dev_created DESC
      `;
      const devices = await queryGps(sql);
      res.render('listar-dispositivos', {
        title: 'Controle GPS - Admin',
        csrfToken: req.csrfToken(),
        devices,
        activePage: 'listar-dispositivos'
      });
    } catch (err) {
      console.error('Erro ao listar dispositivos:', err);
      res.status(500).send('Erro interno');
    }
  }
);

app.get(
  '/editar-dispositivo/:id',
  isAdmin,
  isAuthenticated,
  csrfProtection,
  async (req, res) => {
    const { id } = req.params;
    try {
      const rows = await queryGps(
        'SELECT dev_id, dev_name, dev_key, dev_status FROM devices WHERE dev_id = ?',
        [id]
      );
      if (!rows.length) {
        return res.redirect('/listar-dispositivos');
      }
      res.render('editar-dispositivo', {
        title: 'Editar Dispositivo',
        csrfToken: req.csrfToken(),
        device: rows[0],
        error: null      // <— adiciona error para não dar ReferenceError
      });
    } catch (err) {
      console.error('Erro ao buscar dispositivo:', err);
      res.status(500).send('Erro interno');
    }
  }
);


// processa edição
app.post(
  '/editar-dispositivo/:id',
  isAdmin,
  isAuthenticated,
  csrfProtection,
  async (req, res) => {
    const { id } = req.params;
    const { dev_name, dev_key, dev_status } = req.body;
    try {
      await queryGps(
        `UPDATE devices
            SET dev_name   = ?,
                dev_key    = ?,
                dev_status = ?
          WHERE dev_id = ?`,
        [dev_name, dev_key, dev_status, id]
      );
      res.redirect('/listar-dispositivos');
    } catch (err) {
      console.error('Erro ao editar dispositivo:', err);
      // em caso de erro, renderiza novamente o form com mensagem
      res.render('editar-dispositivo', {
        title: 'Editar Dispositivo',
        csrfToken: req.csrfToken(),
        error: 'Falha ao atualizar, tente novamente.',
        device: { dev_id: id, dev_name, dev_key, dev_status }
      });
    }
  }
);

// exclui dispositivo
app.post(
  '/excluir-dispositivo/:id',
  isAdmin,
  isAuthenticated,
  csrfProtection,
  async (req, res) => {
    const { id } = req.params;
    try {
      await queryGps('DELETE FROM devices WHERE dev_id = ?', [id]);
      res.redirect('/listar-dispositivos');
    } catch (err) {
      console.error('Erro ao excluir dispositivo:', err);
      res.status(500).send('Erro interno');
    }
  }
);
////////////////////////////////////////////// auth gps


// Rota que carrega a tela de autenticação
app.get(
  '/auth',
  csrfProtection,
  isAdmin,
  isAuthenticated,
  (req, res) => {
    res.render('auth', {
      csrfToken: req.csrfToken()
    });
  }
);
///////////////////////////////////////////mostrar todos os veiculos no  mapa /////////////////////

// Exemplo em Node.js (ajuste à sua lógica)
app.get('/ultimas-localizacoes', async (req, res) => {
  const [rows] = await db.query(`
    SELECT d.dev_id, d.dev_name AS veiculoNome, d.dev_key,
           v.placa, v.modelo,
           h.latitude, h.longitude, h.datahora_recebido
    FROM devices d
    JOIN veiculos v ON v.device_id = d.dev_id
    JOIN (
      SELECT fk_device, MAX(datahora_recebido) as ultima
      FROM gps_history
      GROUP BY fk_device
    ) ult ON ult.fk_device = d.dev_id
    JOIN gps_history h ON h.fk_device = d.dev_id AND h.datahora_recebido = ult.ultima
    WHERE d.dev_status = 1
  `);

  res.json(rows);
});

////////////////////////////////////////////relatorio velocidades

const speedLimitCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

async function getSpeedLimit(lat, lng) {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const entry = speedLimitCache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) {
    return entry.limit;
  }

  const query = `
    [out:json];
    way(around:10,${lat},${lng})["maxspeed"];
    out tags 1;
  `;

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: query
  }).then(r => r.json());

  const tag = res.elements[0]?.tags?.maxspeed;
  const limit = tag ? parseFloat(tag.replace(/\D/g, '')) : null;
  speedLimitCache.set(key, { limit, ts: Date.now() });
  return limit;
}
// Distância entre dois pontos (em metros)
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = v => v * Math.PI / 180;
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1), Δλ = toRad(lon2 - lon1);
  const a = Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const reportCache = new Map();
const REPORT_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

app.get('/relatorio-violacoes', csrfProtection, isAuthenticated, isAdmin, (req, res) => {
  res.render('relatorioViolacoes', {
    csrfToken: req.csrfToken(),
    filtro: { motorista: '', veiculo: '', from: '', to: '' },
    dados: []
  });
});

app.post('/relatorio-violacoes', csrfProtection, isAuthenticated, isAdmin, async (req, res) => {
  const { motorista, veiculo, from, to } = req.body;
  const cacheKey = JSON.stringify({ motorista, veiculo, from, to });
  const cached = reportCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < REPORT_CACHE_TTL) {
    return res.render('relatorioViolacoes', {
      csrfToken: req.csrfToken(), filtro: { motorista, veiculo, from, to }, dados: cached.data
    });
  }

  // Filtros dinâmicos
  let where = 'WHERE u.data_hora_inicial IS NOT NULL AND u.data_hora_final IS NOT NULL';
  const params = [];
  if (motorista) { where += ' AND u.motorista = ?'; params.push(motorista); }
  if (veiculo) { where += ' AND v.placa = ?'; params.push(veiculo); }
  if (from) { where += ' AND u.data_hora_inicial >= ?'; params.push(`${from} 00:00:00`); }
  if (to) { where += ' AND u.data_hora_final <= ?'; params.push(`${to} 23:59:59`); }

  const [usos] = await db.promise().query(
    `SELECT u.id AS usoId, u.motorista, v.placa, v.device_id AS gpsDeviceId,
            u.data_hora_inicial AS inicio, u.data_hora_final AS fim
     FROM uso_veiculos u
     JOIN veiculos v ON v.id = u.veiculo_id
     ${where}`, params
  );

  const resultado = [];
  for (const uso of usos) {
    if (!uso.gpsDeviceId) continue;

    const pontos = await queryGps(
      `SELECT latitude, longitude, velocidade_ms AS velocidade, datahora_recebido AS ts
       FROM gps_history
       WHERE fk_device = ? AND datahora_recebido BETWEEN ? AND ?
       ORDER BY datahora_recebido ASC`,
      [uso.gpsDeviceId, uso.inicio, uso.fim]
    );

    let speedViol = 0, harshEvents = 0, stops = 0;
    let prev = null;
    for (const p of pontos) {
      const currTime = new Date(p.ts);
      if (prev) {
        const dt = (currTime - prev.time) / 1000;
        if (dt > 0) {
          const dv = (p.velocidade - prev.speed) / dt;
          if (Math.abs(dv) > 3) harshEvents++;
          if (p.velocidade === 0 && prev.speed === 0 && dt > 30) stops++;
          const dist = haversineDistance(prev.lat, prev.lng, p.latitude, p.longitude);
          const kmh = (dist / dt) * 3.6;
          const limit = await getSpeedLimit(prev.lat, prev.lng);
          if (limit && kmh > limit) speedViol++;
        }
      }
      prev = { lat: p.latitude, lng: p.longitude, time: currTime, speed: p.velocidade };
    }

    resultado.push({
      usoId: uso.usoId,
      motorista: uso.motorista,
      placa: uso.placa,
      inicio: uso.inicio,
      fim: uso.fim,
      pontos: pontos.length,
      speedViol,
      harshEvents,
      stops,
      houveViolacao: speedViol > 0 || harshEvents > 0 || stops > 0
    });
  }

  reportCache.set(cacheKey, { data: resultado, ts: Date.now() });
  res.render('relatorioViolacoes', {
    csrfToken: req.csrfToken(), filtro: { motorista, veiculo, from, to }, dados: resultado
  });
});
////////////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////stats gps estatisticas gps

// Rota de estatísticas GPS
app.get(
  '/stats-gps',
  isAuthenticated,
  isAdmin,
  csrfProtection,
  async (req, res) => {
    try {
      // 1) Lê todos os pontos de gps_history
      const rows = await queryGps(`
        SELECT fk_device, latitude, longitude, velocidade_ms, datahora_recebido
        FROM gps_history
        ORDER BY fk_device, datahora_recebido
      `);

      // 2) Inicia o objeto de stats
      const stats = {
        totalRegistros: rows.length,
        dispositivosUnicos: new Set(rows.map(r => r.fk_device)).size,
        registrosPorDispositivo: {},
        maxVelocidade: 0,
        somaVelocidades: 0,
        totalDistanciaKm: 0,
        tempoEmMovimentoMin: 0,
        totalParadas: 0,
        porHora: Array(24).fill(0),
        heatmap: []
      };
      const ultimo = {};

      // 3) Processa cada registro
      for (const r of rows) {
        const id = r.fk_device;
        const lat = parseFloat(r.latitude);
        const lng = parseFloat(r.longitude);
        const vel = (parseFloat(r.velocidade_ms) || 0) * 3.6; // de m/s para km/h
        const ts = new Date(r.datahora_recebido);
        const hr = ts.getHours();

        stats.somaVelocidades += vel;
        stats.maxVelocidade = Math.max(stats.maxVelocidade, vel);
        stats.porHora[hr]++;
        stats.registrosPorDispositivo[id] = (stats.registrosPorDispositivo[id] || 0) + 1;
        stats.heatmap.push([lat, lng, 0.5]);

        if (ultimo[id]) {
          const prev = ultimo[id];
          const dist = haversineDistance(
            prev.latitude, prev.longitude,
            lat, lng
          ) / 1000; // converte para km

          const dtMin = (ts - new Date(prev.datahora_recebido)) / 60000;
          if (vel > 2 && dist > 0.05) {
            stats.totalDistanciaKm += dist;
            stats.tempoEmMovimentoMin += dtMin;
          } else if (dtMin >= 5) {
            stats.totalParadas++;
          }
        }

        ultimo[id] = r;
      }

      // 4) Estatísticas finais
      stats.velocidadeMedia = stats.somaVelocidades / stats.totalRegistros;
      const maisAtivoEntry = Object.entries(stats.registrosPorDispositivo)
        .sort((a, b) => b[1] - a[1])[0];
      stats.maisAtivo = maisAtivoEntry
        ? { id: maisAtivoEntry[0], total: maisAtivoEntry[1] }
        : null;

      // 5) Renderiza a view EJS
      res.render('stats-gps', {
        stats: JSON.stringify(stats),
        csrfToken: req.csrfToken(),
        user: req.user,
        activePage: 'stats-gps'
      });
    } catch (err) {
      console.error('Erro em /stats-gps:', err);
      res.status(500).send('Erro ao carregar estatísticas GPS');
    }
  }
);


app.get(
  '/stats-gps-usos',
  isAuthenticated,
  isAdmin,
  csrfProtection,
  async (req, res) => {
    try {
      // 1) Estatísticas GPS via queryGps (promise)
      const gpsRows = await queryGps(`
        SELECT fk_device, latitude, longitude, velocidade_ms, datahora_recebido
        FROM gps_history
        ORDER BY fk_device, datahora_recebido
      `);

      const stats = {
        totalRegistros: gpsRows.length,
        dispositivosUnicos: new Set(gpsRows.map(r => r.fk_device)).size,
        registrosPorDispositivo: {},
        maxVelocidade: 0,
        somaVelocidades: 0,
        totalDistanciaKm: 0,
        tempoEmMovimentoMin: 0,
        totalParadas: 0,
        porHora: Array(24).fill(0),
        heatmap: []
      };
      const ultimo = {};

      for (const r of gpsRows) {
        const id = r.fk_device;
        const lat = parseFloat(r.latitude);
        const lng = parseFloat(r.longitude);
        const vel = (parseFloat(r.velocidade_ms) || 0) * 3.6; // km/h
        const ts = new Date(r.datahora_recebido);
        const hr = ts.getHours();

        stats.somaVelocidades += vel;
        stats.maxVelocidade = Math.max(stats.maxVelocidade, vel);
        stats.porHora[hr]++;
        stats.registrosPorDispositivo[id] = (stats.registrosPorDispositivo[id] || 0) + 1;
        stats.heatmap.push([lat, lng, 0.5]);

        if (ultimo[id]) {
          const prev = ultimo[id];
          const dist = haversineDistance(prev.latitude, prev.longitude, lat, lng) / 1000;
          const dtMin = (ts - new Date(prev.datahora_recebido)) / 60000;
          if (vel > 2 && dist > 0.05) {
            stats.totalDistanciaKm += dist;
            stats.tempoEmMovimentoMin += dtMin;
          } else if (dtMin >= 5) {
            stats.totalParadas++;
          }
        }
        ultimo[id] = r;
      }

      stats.velocidadeMedia = stats.somaVelocidades / stats.totalRegistros;
      const mais = Object.entries(stats.registrosPorDispositivo)
        .sort((a, b) => b[1] - a[1])[0];
      stats.maisAtivo = mais ? { id: mais[0], total: mais[1] } : null;

      // 2) Lista de Usos via db.promise().query
      const [usos] = await db.promise().query(`
        SELECT id, motorista, km_inicial, km_final, finalidade,
               data_hora_inicial, data_hora_final
        FROM uso_veiculos
        ORDER BY data_criacao DESC
        LIMIT 50
      `);

      // 3) Renderiza tudo junto
      res.render('stats-gps-usos', {
        stats: JSON.stringify(stats),
        usos,
        csrfToken: req.csrfToken(),
        user: req.user,
        activePage: 'stats-gps-usos'
      });
    } catch (err) {
      console.error('Erro em /stats-gps-usos:', err);
      res.status(500).send('Erro ao carregar estatísticas e usos');
    }
  }
);
////////////////////////////////////////////////////////////////////////////////////////////
// ------------------ ROTAS: Rotas de Usos (mapa + APIs) ------------------
// --- GET view: /mapa-usos ------------------------------------------------
app.get(
  '/mapa-usos',
  isAuthenticated,
  isAdmin,        // comente/remova se quiser permitir todos usuários autenticados
  csrfProtection,
  async (req, res) => {
    try {
      res.render('mapa-usos', {
        layout: 'layout',
        title: 'Mapa de Usos',
        user: req.user,
        csrfToken: req.csrfToken(),
        activePage: 'mapa-usos'
      });
    } catch (err) {
      console.error('Erro em /mapa-usos:', err);
      res.status(500).send('Erro interno');
    }
  }
);



// helpers (pode colar no topo do arquivo se ainda não tiver)
function normalizeTsToMs(ts) {
  if (ts === null || ts === undefined) return null;
  if (typeof ts === 'number') {
    if (ts > 1e12) return ts;
    if (ts > 1e9) return ts * 1000;
    return null;
  }
  const n = Number(ts);
  if (!Number.isNaN(n)) {
    if (n > 1e12) return n;
    if (n > 1e9) return n * 1000;
  }
  const p = Date.parse(ts);
  return isNaN(p) ? null : p;
}
function haversine(a, b) {
  const R = 6371000; const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const sinDlat = Math.sin(dLat / 2), sinDlon = Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(sinDlat * sinDlat + Math.cos(lat1) * Math.cos(lat2) * sinDlon * sinDlon), Math.sqrt(1 - (sinDlat * sinDlat + Math.cos(lat1) * Math.cos(lat2) * sinDlon * sinDlon)));
  return R * c;
}
function totalDistanceKm(points) {
  if (!points || points.length < 2) return 0;
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversine(points[i - 1], points[i]);
  return d / 1000;
}

// Substitua /api/mapa-usos existente por esta versão (Node.js + Express)
// Pré-requisitos: axios, db.promise(), queryGps(), normalizeTsToMs(), totalDistanceKm()

app.get('/api/mapa-usos', isAuthenticated, async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10) || 1;
    const perPage = Math.max(1, Math.min(200, parseInt(req.query.perPage || '25', 10)));
    const search = (req.query.search || '').trim();
    const offset = (page - 1) * perPage;

    // filtra só usos que tem coords (mesma lógica original)
    let where = `((start_lat IS NOT NULL AND start_lng IS NOT NULL) OR (end_lat IS NOT NULL AND end_lng IS NOT NULL))`;
    const params = [];
    if (search) {
      where += ` AND (u.motorista LIKE ? OR u.finalidade LIKE ? OR v.placa LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // total para paginação
    const [[{ total }]] = await db.promise().query(
      `SELECT COUNT(*) AS total FROM uso_veiculos u LEFT JOIN veiculos v ON u.veiculo_id = v.id WHERE ${where}`,
      params
    );

    // pegar registros da página (inclui v.placa)
    const [usos] = await db.promise().query(`
      SELECT
        u.id,
        u.veiculo_id,
        u.motorista,
        u.km_inicial,
        u.km_final,
        u.start_lat, u.start_lng,
        u.end_lat, u.end_lng,
        u.finalidade,
        u.descricao,
        u.data_hora_inicial AS inicio_raw,
        u.data_hora_final   AS fim_raw,
        DATE_FORMAT(u.data_hora_inicial, '%Y-%m-%d %H:%i:%s') AS inicio,
        DATE_FORMAT(u.data_hora_final,   '%Y-%m-%d %H:%i:%s') AS fim,
        DATE_FORMAT(u.data_criacao,      '%Y-%m-%d %H:%i:%s') AS criado_em,
        v.placa
      FROM uso_veiculos u
      LEFT JOIN veiculos v ON u.veiculo_id = v.id
      WHERE ${where}
      ORDER BY u.data_criacao DESC
      LIMIT ? OFFSET ?
    `, [...params, perPage, offset]);

    if (!usos.length) {
      return res.json({
        usos: [],
        total: total || 0,
        stats: { total: total || 0, byFinalidade: {}, topDrivers: [] },
        meta: { fetchedTrajetoria: false, page, perPage, total: total || 0 }
      });
    }

    // mapa veiculo -> device_id (busca em lote)
    const veiculoIds = [...new Set(usos.map(u => u.veiculo_id).filter(Boolean))];
    let veiculoMap = {};
    if (veiculoIds.length) {
      const [veiculos] = await db.promise().query(
        `SELECT id, device_id, dispositivo FROM veiculos WHERE id IN (${veiculoIds.map(() => '?').join(',')})`,
        veiculoIds
      );
      veiculos.forEach(v => { veiculoMap[v.id] = v.device_id || v.dispositivo || null; });
    }

    const MAX_POINTS = 5000; // limite por uso (ajustável)
    const usoPromises = usos.map(async (u) => {
      const usoObj = { ...u, trajeto: [], distance_km: null, bounds: null, ideal_route: null, auditorias: [] };

      const deviceId = veiculoMap[u.veiculo_id];

      // 1) buscar pontos GPS (se tiver device e intervalo)
      if (deviceId && u.inicio_raw && u.fim_raw) {
        try {
          const pontos = await queryGps(`
            SELECT latitude AS lat, longitude AS lng, datahora_recebido AS ts
            FROM gps_history
            WHERE fk_device = ?
              AND datahora_recebido BETWEEN ? AND ?
            ORDER BY datahora_recebido ASC
            LIMIT ${MAX_POINTS}
          `, [deviceId, u.inicio_raw, u.fim_raw]);

          if (Array.isArray(pontos) && pontos.length) {
            const norm = pontos
              .map(p => ({ lat: Number(p.lat), lng: Number(p.lng), ts: normalizeTsToMs(p.ts) }))
              .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
            usoObj.trajeto = norm;
            usoObj.distance_km = Number(totalDistanceKm(norm).toFixed(3));
            usoObj.points_count = norm.length;
            if (norm.length) {
              const lats = norm.map(p => p.lat), lngs = norm.map(p => p.lng);
              usoObj.bounds = { minLat: Math.min(...lats), minLng: Math.min(...lngs), maxLat: Math.max(...lats), maxLng: Math.max(...lngs) };
            }
          }
        } catch (errGps) {
          console.warn(`Erro GPS (uso ${u.id}):`, errGps && errGps.message ? errGps.message : errGps);
        }
      }

      // 2) fallback: usar start/end se não houver trajeto
      if ((!usoObj.trajeto || usoObj.trajeto.length === 0)
        && Number(u.start_lat) && Number(u.start_lng)
        && Number(u.end_lat) && Number(u.end_lng)) {
        const a = { lat: Number(u.start_lat), lng: Number(u.start_lng), ts: normalizeTsToMs(u.inicio_raw) };
        const b = { lat: Number(u.end_lat), lng: Number(u.end_lng), ts: normalizeTsToMs(u.fim_raw) };
        usoObj.trajeto = [a, b];
        usoObj.distance_km = Number(totalDistanceKm(usoObj.trajeto).toFixed(3));
        usoObj.points_count = usoObj.trajeto.length;
        usoObj.bounds = { minLat: Math.min(a.lat, b.lat), minLng: Math.min(a.lng, b.lng), maxLat: Math.max(a.lat, b.lat), maxLng: Math.max(a.lng, b.lng) };
      }

      // 3) markerLatLng (último ponto preferencial)
      if (usoObj.trajeto && usoObj.trajeto.length) {
        const last = usoObj.trajeto[usoObj.trajeto.length - 1];
        usoObj.marker_lat = Number(last.lat);
        usoObj.marker_lng = Number(last.lng);
        usoObj.last_point = { lat: usoObj.marker_lat, lng: usoObj.marker_lng, ts: last.ts || null };
      } else if (Number.isFinite(u.end_lat) && Number.isFinite(u.end_lng)) {
        usoObj.marker_lat = Number(u.end_lat);
        usoObj.marker_lng = Number(u.end_lng);
        usoObj.last_point = { lat: usoObj.marker_lat, lng: usoObj.marker_lng, ts: normalizeTsToMs(u.fim_raw) || null };
      } else if (Number.isFinite(u.start_lat) && Number.isFinite(u.start_lng)) {
        usoObj.marker_lat = Number(u.start_lat);
        usoObj.marker_lng = Number(u.start_lng);
        usoObj.last_point = { lat: usoObj.marker_lat, lng: usoObj.marker_lng, ts: normalizeTsToMs(u.inicio_raw) || null };
      } else {
        usoObj.marker_lat = null;
        usoObj.marker_lng = null;
        usoObj.last_point = null;
      }

      // 4) ideal route (OSRM) - server-side (não crítico)
      try {
        if (Number(u.start_lat) && Number(u.start_lng) && Number(u.end_lat) && Number(u.end_lng)) {
          const sLat = Number(u.start_lat), sLng = Number(u.start_lng), eLat = Number(u.end_lat), eLng = Number(u.end_lng);
          const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${sLng},${sLat};${eLng},${eLat}?overview=full&geometries=geojson`;
          const r = await axios.get(osrmUrl, { timeout: 5000 });
          if (r.status === 200 && r.data && r.data.routes && r.data.routes[0] && r.data.routes[0].geometry && r.data.routes[0].geometry.coordinates) {
            const coords = r.data.routes[0].geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] }));
            usoObj.ideal_route = { coords, distance_m: r.data.routes[0].distance || null, duration_s: r.data.routes[0].duration || null };
            // expand bounds if not present
            if (!usoObj.bounds && coords && coords.length) {
              const lats = coords.map(c => c.lat), lngs = coords.map(c => c.lng);
              usoObj.bounds = { minLat: Math.min(...lats), minLng: Math.min(...lngs), maxLat: Math.max(...lats), maxLng: Math.max(...lngs) };
            }
          }
        }
      } catch (errOsrm) {
        console.warn(`OSRM falhou (uso ${u.id}):`, errOsrm && errOsrm.message ? errOsrm.message : errOsrm);
      }

      // 5) auditorias relacionadas (opcional): buscar poucas entradas para exibir
      try {
        const [auditorias] = await db.promise().query(`
          SELECT id AS auditoria_id, usuario, rota, detalhes,
                 DATE_FORMAT(criado_em, '%Y-%m-%d %H:%i:%s') AS criado_em
          FROM auditoria
          WHERE detalhes LIKE ?
          ORDER BY criado_em DESC
          LIMIT 20
        `, [`%${u.id}%`]);
        usoObj.auditorias = auditorias || [];
      } catch (_) {
        usoObj.auditorias = [];
      }

      return usoObj;
    }); // end map

    // aguarda todas as promises (paraleliza busca GPS e OSRM por uso)
    const usosComTrajeto = await Promise.all(usoPromises);

    // montar heatPoints global (um ponto por uso = último ponto ou todos os pontos agregado leve)
    const heatPoints = [];
    usosComTrajeto.forEach(uc => {
      if (Array.isArray(uc.trajeto) && uc.trajeto.length) {
        // empilha todos os pontos com peso reduzido
        uc.trajeto.forEach(p => { if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) heatPoints.push([p.lat, p.lng, 0.4]); });
      } else if (uc.marker_lat && uc.marker_lng) {
        heatPoints.push([uc.marker_lat, uc.marker_lng, 0.6]);
      }
    });

    // stats (mesma lógica do front)
    const byFinalidade = usos.reduce((acc, u) => { const f = u.finalidade || '—'; acc[f] = (acc[f] || 0) + 1; return acc; }, {});
    const topDrivers = Object.entries(usos.reduce((acc, u) => { const m = u.motorista || 'Desconhecido'; acc[m] = (acc[m] || 0) + 1; return acc; }, {}))
      .map(([driver, cnt]) => ({ driver, cnt }))
      .sort((a, b) => b.cnt - a.cnt).slice(0, 5);

    // retorno: mantém shape antigo, mas com trajetos prontos + heatPoints + marker last point
    return res.json({
      usos: usosComTrajeto,
      total,
      stats: { total, byFinalidade, topDrivers },
      meta: { fetchedTrajetoria: true, page, perPage, total },
      heatPoints // opcional no front; não quebra se o front ignorar
    });

  } catch (err) {
    console.error('Erro /api/mapa-usos:', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Erro interno' });
  }
});



// Rota nova / atualizada: /api/mapa-usos/ultimos (aceita start / end)
app.get('/api/mapa-usos/ultimos', isAuthenticated, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const perPage = Math.max(1, Math.min(200, parseInt(req.query.perPage || '10', 10)));
    const search = (req.query.search || '').trim();
    const offset = (page - 1) * perPage;

    // aceita start/startDate e end/endDate
    const rawStart = (req.query.start || req.query.startDate || '').trim();
    const rawEnd = (req.query.end || req.query.endDate || '').trim();

    // helper: transforma 'YYYY-MM-DD' -> 'YYYY-MM-DD 00:00:00' e end -> 'YYYY-MM-DD 23:59:59'
    const normalizeDate = (s, isEnd = false) => {
      if (!s) return null;
      // se for só data YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return isEnd ? `${s} 23:59:59` : `${s} 00:00:00`;
      }
      // tenta parse - se contiver T ou espaço, assume que é datetime válido
      const parsed = Date.parse(s);
      if (!isNaN(parsed)) {
        // formata para yyyy-mm-dd HH:ii:ss MySQL-style
        const d = new Date(parsed);
        const pad = n => String(n).padStart(2, '0');
        const str = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        return str;
      }
      return null;
    };

    const startDate = normalizeDate(rawStart, false);
    const endDate = normalizeDate(rawEnd, true);

    // Monta WHERE com parametros
    let where = `1=1`;
    const params = [];

    if (search) {
      where += ` AND (u.motorista LIKE ? OR u.finalidade LIKE ? OR v.placa LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (startDate && endDate) {
      where += ` AND u.data_criacao BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    } else if (startDate) {
      where += ` AND u.data_criacao >= ?`;
      params.push(startDate);
    } else if (endDate) {
      where += ` AND u.data_criacao <= ?`;
      params.push(endDate);
    }

    // total
    const [[{ total }]] = await db.promise().query(
      `SELECT COUNT(*) AS total
       FROM uso_veiculos u
       LEFT JOIN veiculos v ON u.veiculo_id = v.id
       WHERE ${where}`,
      params
    );

    // select paginado (campos reduzidos para lista rápida)
    const [rows] = await db.promise().query(
      `SELECT
         u.id,
         u.veiculo_id,
         u.motorista,
         u.finalidade,
         u.descricao,
         DATE_FORMAT(u.data_criacao, '%Y-%m-%d %H:%i:%s') AS criado_em,
         DATE_FORMAT(u.data_hora_inicial, '%Y-%m-%d %H:%i:%s') AS inicio,
         DATE_FORMAT(u.data_hora_final, '%Y-%m-%d %H:%i:%s') AS fim,
         u.start_lat, u.start_lng, u.end_lat, u.end_lng,
         v.placa
       FROM uso_veiculos u
       LEFT JOIN veiculos v ON u.veiculo_id = v.id
       WHERE ${where}
       ORDER BY u.data_criacao DESC
       LIMIT ? OFFSET ?`,
      [...params, perPage, offset]
    );

    res.json({
      usos: rows,
      meta: { page, perPage, total: Number(total || 0), start: rawStart || null, end: rawEnd || null }
    });

  } catch (err) {
    console.error('Erro /api/mapa-usos/ultimos:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});





// ------------------ FIM: ROTAS: Rotas de Usos ------------------

//////////////////////////////  ABASTECIMENTOS  ////////////////////////////////////
//////////////////////////////  ABASTECIMENTOS  ////////////////////////////////////

// GET /abastecimento/novo
app.get('/abastecimento/novo', isAuthenticated, csrfProtection, async (req, res) => {
  try {
    const [veiculos] = await db.promise().query(
      `SELECT id, nome, placa, marca, modelo
       FROM veiculos
       ORDER BY nome IS NULL, nome, id DESC`
    );

    return res.render('abastecimento-novo', {
      layout: 'layout',
      title: 'Registrar Abastecimento',
      user: req.user,
      csrfToken: req.csrfToken(),
      vehicles: veiculos || [],
      data: {},
      errors: [],
      errorFields: []
    });
  } catch (err) {
    console.error('GET /abastecimento/novo erro:', err);
    return res.status(500).send('Erro ao carregar formulário de abastecimento.');
  }
});

// POST /abastecimento
app.post('/abastecimento', isAuthenticated, csrfProtection, async (req, res) => {
  const {
    data_hora, veiculo_id, placa, posto, tipo_combustivel,
    litros, preco_litro, preco_total, km_atual, condutor
  } = req.body;

  const errors = [];
  const errorFields = [];

  if (!data_hora || String(data_hora).trim() === '') {
    errors.push('Data e hora do abastecimento é obrigatória.');
    errorFields.push('data_hora');
  }
  if ((!veiculo_id || String(veiculo_id).trim() === '') && (!placa || String(placa).trim() === '')) {
    errors.push('Selecione um veículo ou informe a placa.');
    errorFields.push('veiculo_id', 'placa');
  }
  if (!litros || isNaN(Number(String(litros).replace(',', '.'))) || Number(String(litros).replace(',', '.')) <= 0) {
    errors.push('Quantidade em litros inválida.');
    errorFields.push('litros');
  }
  if (!preco_litro || isNaN(Number(String(preco_litro).replace(',', '.'))) || Number(String(preco_litro).replace(',', '.')) <= 0) {
    errors.push('Preço por litro inválido.');
    errorFields.push('preco_litro');
  }

  if (errors.length) {
    try {
      const [veiculos] = await db.promise().query(
        `SELECT id, nome, placa, nome_marca, nome_modelo FROM veiculos ORDER BY nome IS NULL, nome, id DESC`
      );
      return res.status(400).render('abastecimento-novo', {
        layout: 'layout',
        title: 'Registrar Abastecimento',
        user: req.user,
        csrfToken: req.csrfToken(),
        vehicles: veiculos || [],
        data: req.body,
        errors,
        errorFields
      });
    } catch (e) {
      console.error('Erro re-render abastecimento com errors:', e);
      return res.status(400).send(errors.join('\n'));
    }
  }

  const parseNumber = v => {
    if (v === undefined || v === null || String(v).trim() === '') return null;
    return Number(String(v).replace(',', '.'));
  };

  const litrosNum = parseNumber(litros);
  const precoLitroNum = parseNumber(preco_litro);
  const precoTotalNum = (preco_total && String(preco_total).trim() !== '') ? parseNumber(preco_total) : +(litrosNum * precoLitroNum).toFixed(2);
  const kmAtualInt = (km_atual && String(km_atual).trim() !== '') ? parseInt(String(km_atual).replace(/\D/g, ''), 10) : null;

  const conn = await db.promise().getConnection();
  try {
    await conn.beginTransaction();

    const insertSql = `INSERT INTO abastecimentos
      (veiculo_id, placa, data_hora, posto, tipo_combustivel, litros, preco_litro, preco_total, km_atual, condutor, criado_por, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`;

    const criadoPor = (req.user && (req.user.name || req.user.username || req.user.email)) || null;

    await conn.query(insertSql, [
      veiculo_id || null,
      placa ? String(placa).trim() : null,
      (typeof data_hora === 'string' && data_hora.indexOf('T') !== -1) ? data_hora.replace('T', ' ') + ':00' : data_hora,
      posto ? String(posto).trim() : null,
      tipo_combustivel ? String(tipo_combustivel).trim() : null,
      litrosNum,
      precoLitroNum,
      precoTotalNum,
      kmAtualInt,
      condutor ? String(condutor).trim() : null,
      criadoPor
    ]);

    if (veiculo_id && kmAtualInt !== null) {
      const [vrows] = await conn.query('SELECT km FROM veiculos WHERE id = ? FOR UPDATE', [veiculo_id]);
      if (vrows && vrows[0]) {
        const currentKm = (vrows[0].km === null || vrows[0].km === undefined) ? null : parseInt(vrows[0].km, 10);
        if (kmAtualInt !== null && (currentKm === null || kmAtualInt > currentKm)) {
          await conn.query('UPDATE veiculos SET km = ? WHERE id = ?', [kmAtualInt, veiculo_id]);
        }
      }
    }

    await conn.commit();
    conn.release();

    return res.redirect('/abastecimentos');
  } catch (err) {
    try { await conn.rollback(); } catch (e) { /* ignore */ }
    conn.release();
    console.error('POST /abastecimento erro:', err);
    return res.status(500).send('Erro ao registrar abastecimento.');
  }
});

// GET /abastecimentos (listagem)
app.get('/abastecimentos', isAuthenticated, csrfProtection, async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT a.id, a.data_hora, a.placa, a.posto, a.tipo_combustivel, a.litros, a.preco_litro, a.preco_total, a.km_atual, a.condutor, a.criado_por, a.criado_em,
              v.nome AS veiculo_nome, v.marca, v.modelo
       FROM abastecimentos a
       LEFT JOIN veiculos v ON v.id = a.veiculo_id
       ORDER BY a.data_hora DESC
       LIMIT 200`
    );
    return res.render('abastecimentos', {
      layout: 'layout',
      title: 'Abastecimentos',
      user: req.user,
      rows,
      csrfToken: req.csrfToken()
    });
  } catch (err) {
    console.error('GET /abastecimentos erro:', err);
    return res.status(500).send('Erro ao buscar abastecimentos.');
  }
});

//////////////////////////////////FIM ABASTECIMENTO//////////////////////////////////////





////////////////////////////////////INICIO ESTATISTICAS 2////////////////////////////////////
// =========================
// Dashboard completo: /estatisticas-avancada
// Cole este bloco direto no app.js (após declarar `app`, `db`, middlewares, etc.)
// =========================

/* Helpers de mascaramento */
const maskEmail = (e) => {
  if (!e) return '';
  const parts = String(e).split('@');
  if (parts.length !== 2) return '***';
  const name = parts[0], domain = parts[1];
  if (name.length <= 2) return '***@' + domain;
  return name[0] + '***' + name.slice(-1) + '@' + domain;
};
const maskCPF = (c) => {
  if (!c) return '';
  const clean = String(c).replace(/\D/g, '');
  if (clean.length < 2) return '***.***.***-**';
  return '***.***.***-' + clean.slice(-2);
};
const maskChassi = (s) => {
  if (!s) return '';
  const str = String(s);
  return '***' + str.slice(-4);
};

/* ROTA PRINCIPAL: renderiza a view com agregados */
app.get('/estatisticas-avancada', isAuthenticated, isAdmin, csrfProtection, async (req, res) => {
  try {
    const { start_date, end_date, tabela } = req.query || {};

    // helper para range de datas (retorna 'AND ...' ou '')
    const dateWhere = (col) => {
      const parts = [];
      if (start_date) parts.push(`${col} >= ${db.escape(start_date + ' 00:00:00')}`);
      if (end_date) parts.push(`${col} <= ${db.escape(end_date + ' 23:59:59')}`);
      return parts.length ? ('AND ' + parts.join(' AND ')) : '';
    };

    // whitelist de tabelas para contagem/tamanho
    const tables = [
      'abastecimentos', 'auditoria', 'carro_reparo', 'geofences', 'manutencoes', 'manutencoes_arquivos',
      'manutencoes_config', 'manutencoes_manuais', 'motoristas', 'multas', 'multas_backup_automatic',
      'notificacoes', 'reembolsos', 'senha_redefinicoes', 'tipos_infracoes', 'uso_veiculos',
      'uso_veiculos_imagens', 'usuarios', 'veiculos'
    ];

    // 1) Contagens por tabela (paralelo)
    const countsPromises = tables.map(t => db.promise().query(`SELECT COUNT(*) AS cnt FROM \`${t}\``));
    const countsResults = await Promise.all(countsPromises);
    const counts = {};
    tables.forEach((t, i) => { counts[t] = Number(countsResults[i][0][0].cnt || 0); });

    // 2) Tamanho físico das tabelas (bytes)
    const [sizeRows] = await db.promise().query(`
      SELECT TABLE_NAME, DATA_LENGTH+INDEX_LENGTH AS bytes
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN (${tables.map(t => db.escape(t)).join(',')})
    `);
    const tableSizes = {};
    sizeRows.forEach(r => tableSizes[r.TABLE_NAME] = Number(r.bytes || 0));

    // 3) Última atividade por tabela (heurística)
    const dateColsByTable = {
      abastecimentos: 'data_hora', auditoria: 'criado_em', manutencoes_arquivos: 'criado_em',
      manutencoes: 'data_realizada', manutencoes_manuais: 'atualizado_em', motoristas: 'data_cadastro',
      multas: 'data', uso_veiculos: 'data_hora_inicial', notificacoes: 'data_hora', reembolsos: 'criado_em', usuarios: 'id'
    };
    const lastActivity = {};
    await Promise.all(Object.entries(dateColsByTable).map(async ([t, col]) => {
      try {
        const [r] = await db.promise().query(`SELECT MAX(${col}) AS mx FROM \`${t}\``);
        lastActivity[t] = r && r[0] ? r[0].mx : null;
      } catch (err) {
        lastActivity[t] = null;
      }
    }));

    // 4) Abastecimentos agregados
    const abasteWhere = (start_date || end_date) ? `WHERE 1 ${dateWhere('data_hora')}` : '';
    const [abStatsRows] = await db.promise().query(`
      SELECT
        COUNT(*) AS total_abastecimentos,
        SUM(litros) AS litros_total,
        SUM(preco_total) AS gasto_total,
        AVG(preco_litro) AS preco_medio_litro
      FROM abastecimentos
      ${abasteWhere}
    `);
    const abStats = abStatsRows[0] || { total_abastecimentos: 0, litros_total: 0, gasto_total: 0, preco_medio_litro: 0 };

    // 5) Manutenções por status
    const [manStatsRows] = await db.promise().query(`
      SELECT status, COUNT(*) AS qt, AVG(custo_real) AS custo_medio
      FROM manutencoes_manuais
      WHERE 1
      ${start_date || end_date ? dateWhere('data_realizada') : ''}
      GROUP BY status
    `);
    const manutencaoPorStatus = manStatsRows || [];

    // 6) Uso de veículos: totais, média
    const [usoTotalsRows] = await db.promise().query(`
      SELECT
        SUM(CASE WHEN km_final IS NOT NULL AND km_inicial IS NOT NULL THEN (km_final - km_inicial) ELSE 0 END) AS km_total,
        AVG(CASE WHEN km_final IS NOT NULL AND km_inicial IS NOT NULL THEN (km_final - km_inicial) ELSE NULL END) AS km_medio
      FROM uso_veiculos
      WHERE 1
      ${start_date || end_date ? dateWhere('data_hora_inicial') : ''}
    `);
    const usoTotals = usoTotalsRows[0] || { km_total: 0, km_medio: 0 };

    // 7) Multas por tipo
    const [multasStats] = await db.promise().query(`
      SELECT tipo_infracao_id, COUNT(*) AS qt, SUM(valor_com_desconto) AS soma_valores
      FROM multas
      GROUP BY tipo_infracao_id
      ORDER BY qt DESC
      LIMIT 20
    `);

    // 8) Contagem de arquivos
    const [arquivosCounts] = await db.promise().query(`
      SELECT
        (SELECT COUNT(*) FROM manutencoes_arquivos) AS manutencoes_arquivos,
        (SELECT COUNT(*) FROM uso_veiculos_imagens) AS uso_veiculos_imagens
    `);

    // 9) Auditoria (amostra)
    const [audRecent] = await db.promise().query(
      `SELECT id, usuario, rota, metodo, DATE_FORMAT(criado_em,'%Y-%m-%d %H:%i') AS criado_em FROM auditoria ORDER BY criado_em DESC LIMIT 25`
    );
    const auditoriaSample = audRecent.map(a => ({
      id: a.id,
      usuario: a.usuario ? (String(a.usuario).slice(0, 3) + '***') : '—',
      rota: a.rota,
      metodo: a.metodo,
      criado_em: a.criado_em
    }));

    // 10) Amostras de motoristas / veículos (mascaradas)
    const [recentMotoristas] = await db.promise().query(`
      SELECT id, nome, email, cpf, DATE_FORMAT(data_cadastro,'%Y-%m-%d') AS data_cadastro
      FROM motoristas ORDER BY data_cadastro DESC LIMIT 15
    `);
    const recentMotoristasMasked = recentMotoristas.map(r => ({
      id: r.id, nome: r.nome, email: maskEmail(r.email), cpf: maskCPF(r.cpf), data_cadastro: r.data_cadastro
    }));

    const [recentVeiculos] = await db.promise().query(`
      SELECT id, nome, placa, renavam, chassi, km FROM veiculos ORDER BY id DESC LIMIT 15
    `);
    const recentVeiculosMasked = recentVeiculos.map(v => ({
      id: v.id, nome: v.nome, placa: v.placa, renavam: v.renavam ? ('****' + String(v.renavam).slice(-4)) : '', chassi: maskChassi(v.chassi), km: v.km
    }));

    // -----------------------------
    // Estatísticas avançadas adicionais
    // -----------------------------
    const usoDateAnd = (start_date || end_date) ? dateWhere('data_hora_inicial') : '';

    // Resumo de uso
    const [usoResumoRows] = await db.promise().query(`
      SELECT
        COUNT(*) AS viagens_total,
        SUM(CASE WHEN km_final IS NOT NULL AND km_inicial IS NOT NULL THEN (km_final - km_inicial) ELSE 0 END) AS km_total,
        AVG(CASE WHEN km_final IS NOT NULL AND km_inicial IS NOT NULL THEN (km_final - km_inicial) ELSE NULL END) AS km_medio_por_viagem,
        SUM(CASE WHEN data_hora_inicial IS NOT NULL AND data_hora_final IS NOT NULL THEN TIMESTAMPDIFF(SECOND, data_hora_inicial, data_hora_final) ELSE 0 END) AS tempo_total_segundos,
        AVG(NULLIF(TIMESTAMPDIFF(SECOND, data_hora_inicial, data_hora_final),0)) AS tempo_medio_segundos
      FROM uso_veiculos
      WHERE 1 ${usoDateAnd}
    `);
    const usoResumo = usoResumoRows[0] || { viagens_total: 0, km_total: 0, km_medio_por_viagem: 0, tempo_total_segundos: 0, tempo_medio_segundos: 0 };

    const totalKm = Number(usoResumo.km_total || 0);
    const totalHours = Number((usoResumo.tempo_total_segundos || 0) / 3600);
    const velocidade_media_frota = totalHours > 0 ? (totalKm / totalHours) : 0;

    // Trips por hora e por dia da semana (usado pelos charts)
    const [tripsHora] = await db.promise().query(`
      SELECT HOUR(data_hora_inicial) AS hora, COUNT(*) AS qt
      FROM uso_veiculos WHERE 1 ${usoDateAnd}
      GROUP BY hora ORDER BY hora
    `);
    const [tripsWeekday] = await db.promise().query(`
      SELECT DAYOFWEEK(data_hora_inicial) AS dia_semana, COUNT(*) AS qt
      FROM uso_veiculos WHERE 1 ${usoDateAnd}
      GROUP BY dia_semana ORDER BY dia_semana
    `);

    // Top veículos / motoristas
    const [topVeiculosKm] = await db.promise().query(`
      SELECT veiculo_id, COUNT(*) AS viagens, SUM(CASE WHEN km_final IS NOT NULL AND km_inicial IS NOT NULL THEN (km_final - km_inicial) ELSE 0 END) AS km
      FROM uso_veiculos WHERE 1 ${usoDateAnd}
      GROUP BY veiculo_id ORDER BY km DESC LIMIT 10
    `);
    const [topMotoristasKm] = await db.promise().query(`
      SELECT motorista, COUNT(*) AS viagens, SUM(CASE WHEN km_final IS NOT NULL AND km_inicial IS NOT NULL THEN (km_final - km_inicial) ELSE 0 END) AS km
      FROM uso_veiculos WHERE 1 ${usoDateAnd}
      GROUP BY motorista ORDER BY km DESC LIMIT 10
    `);

    // Median/percentis de distância (cálculo seguro: pega count, depois busca offset)
    let median_distance = null, p75_distance = null;
    const [countDistRows] = await db.promise().query(`
      SELECT COUNT(*) AS cnt FROM (
        SELECT (km_final - km_inicial) AS dist
        FROM uso_veiculos
        WHERE km_final IS NOT NULL AND km_inicial IS NOT NULL ${usoDateAnd}
      ) t
    `);
    const cntDist = Number(countDistRows[0].cnt || 0);
    if (cntDist > 0) {
      if (cntDist === 1) {
        const [one] = await db.promise().query(`
          SELECT (km_final - km_inicial) AS dist FROM uso_veiculos
          WHERE km_final IS NOT NULL AND km_inicial IS NOT NULL ${usoDateAnd} LIMIT 1
        `);
        median_distance = Number(one[0].dist || 0);
      } else {
        const offset = Math.floor((cntDist - 1) / 2);
        if (cntDist % 2 === 1) {
          const [mrow] = await db.promise().query(`
            SELECT dist FROM (
              SELECT (km_final - km_inicial) AS dist
              FROM uso_veiculos
              WHERE km_final IS NOT NULL AND km_inicial IS NOT NULL ${usoDateAnd}
              ORDER BY dist
            ) t LIMIT ${offset},1
          `);
          median_distance = Number(mrow[0].dist || 0);
        } else {
          const [mrows] = await db.promise().query(`
            SELECT dist FROM (
              SELECT (km_final - km_inicial) AS dist
              FROM uso_veiculos
              WHERE km_final IS NOT NULL AND km_inicial IS NOT NULL ${usoDateAnd}
              ORDER BY dist
            ) t LIMIT ${offset},2
          `);
          const v1 = Number(mrows[0].dist || 0), v2 = Number(mrows[1].dist || 0);
          median_distance = (v1 + v2) / 2;
        }
        // 75th percentile offset
        const p75off = Math.max(0, Math.floor(cntDist * 0.75) - 1);
        const [p75rows] = await db.promise().query(`
          SELECT dist FROM (
            SELECT (km_final - km_inicial) AS dist
            FROM uso_veiculos
            WHERE km_final IS NOT NULL AND km_inicial IS NOT NULL ${usoDateAnd}
            ORDER BY dist
          ) t LIMIT ${p75off},1
        `);
        p75_distance = p75rows && p75rows[0] ? Number(p75rows[0].dist || 0) : null;
      }
    }

    // Durations: média e mediana (segundos -> minutos)
    let median_duration_sec = null;
    const [countDurRows] = await db.promise().query(`
      SELECT COUNT(*) AS cnt FROM (
        SELECT TIMESTAMPDIFF(SECOND, data_hora_inicial, data_hora_final) AS dur
        FROM uso_veiculos
        WHERE data_hora_inicial IS NOT NULL AND data_hora_final IS NOT NULL ${usoDateAnd}
      ) t
    `);
    const cntDur = Number(countDurRows[0].cnt || 0);
    if (cntDur > 0) {
      if (cntDur === 1) {
        const [one] = await db.promise().query(`
          SELECT TIMESTAMPDIFF(SECOND, data_hora_inicial, data_hora_final) AS dur
          FROM uso_veiculos WHERE data_hora_inicial IS NOT NULL AND data_hora_final IS NOT NULL ${usoDateAnd} LIMIT 1
        `);
        median_duration_sec = Number(one[0].dur || 0);
      } else {
        const off = Math.floor((cntDur - 1) / 2);
        if (cntDur % 2 === 1) {
          const [mrow] = await db.promise().query(`
            SELECT dur FROM (
              SELECT TIMESTAMPDIFF(SECOND, data_hora_inicial, data_hora_final) AS dur
              FROM uso_veiculos
              WHERE data_hora_inicial IS NOT NULL AND data_hora_final IS NOT NULL ${usoDateAnd}
              ORDER BY dur
            ) t LIMIT ${off},1
          `);
          median_duration_sec = Number(mrow[0].dur || 0);
        } else {
          const [mrows] = await db.promise().query(`
            SELECT dur FROM (
              SELECT TIMESTAMPDIFF(SECOND, data_hora_inicial, data_hora_final) AS dur
              FROM uso_veiculos
              WHERE data_hora_inicial IS NOT NULL AND data_hora_final IS NOT NULL ${usoDateAnd}
              ORDER BY dur
            ) t LIMIT ${off},2
          `);
          const a = Number(mrows[0].dur || 0), b = Number(mrows[1].dur || 0);
          median_duration_sec = (a + b) / 2;
        }
      }
    }

    // Tempo ocioso entre viagens (LAG) - tenta MySQL8, fallback proxy
    let idleByVehicle = [];
    try {
      const [idleRows] = await db.promise().query(`
        SELECT veiculo_id,
               SUM(CASE WHEN gap_seconds > 0 THEN gap_seconds ELSE 0 END) AS idle_total_segundos,
               AVG(CASE WHEN gap_seconds > 0 THEN gap_seconds ELSE NULL END) AS idle_medio_segundos
        FROM (
          SELECT veiculo_id,
                 data_hora_inicial,
                 LAG(data_hora_final) OVER (PARTITION BY veiculo_id ORDER BY data_hora_inicial) AS prev_end,
                 TIMESTAMPDIFF(SECOND, LAG(data_hora_final) OVER (PARTITION BY veiculo_id ORDER BY data_hora_inicial), data_hora_inicial) AS gap_seconds
          FROM uso_veiculos WHERE 1 ${usoDateAnd}
        ) x
        GROUP BY veiculo_id
        ORDER BY idle_total_segundos DESC LIMIT 10
      `);
      idleByVehicle = idleRows;
    } catch (e) {
      const [diasUso] = await db.promise().query(`
        SELECT veiculo_id, COUNT(DISTINCT DATE(data_hora_inicial)) AS dias_uso
        FROM uso_veiculos WHERE 1 ${usoDateAnd}
        GROUP BY veiculo_id ORDER BY dias_uso DESC LIMIT 10
      `);
      idleByVehicle = diasUso.map(r => ({ veiculo_id: r.veiculo_id, dias_uso: r.dias_uso }));
    }

    // Percentual de viagens com imagens/anexos
    const [withImages] = await db.promise().query(`
      SELECT
        (SELECT COUNT(*) FROM uso_veiculos WHERE imagens IS NOT NULL AND imagens <> '' ${usoDateAnd}) AS viagens_com_campo_imagens,
        (SELECT COUNT(DISTINCT u.uso_veiculo_id) FROM uso_veiculos_imagens u JOIN uso_veiculos uv ON uv.id = u.uso_veiculo_id WHERE 1 ${usoDateAnd}) AS viagens_com_anexos,
        (SELECT COUNT(*) FROM uso_veiculos WHERE 1 ${usoDateAnd}) AS viagens_total_periodo
    `);
    const viagens_com_campo_imagens = Number(withImages[0].viagens_com_campo_imagens || 0);
    const viagens_com_anexos = Number(withImages[0].viagens_com_anexos || 0);
    const viagens_total_periodo = Number(withImages[0].viagens_total_periodo || 0);
    const pct_viagens_com_imagens = viagens_total_periodo > 0 ? ((Math.max(viagens_com_campo_imagens, viagens_com_anexos) / viagens_total_periodo) * 100) : 0;

    // Eficiência combustível e custo por km
    const [abTot] = await db.promise().query(`
      SELECT SUM(litros) AS litros_total, SUM(preco_total) AS gasto_total
      FROM abastecimentos
      WHERE 1 ${(start_date || end_date) ? dateWhere('data_hora') : ''}
    `);
    const litros_total = Number(abTot[0].litros_total || 0);
    const gasto_total_combustivel = Number(abTot[0].gasto_total || 0);
    const litros_por_100km = (totalKm > 0 && litros_total > 0) ? ((litros_total / totalKm) * 100) : null;
    const custo_por_km = (totalKm > 0 && gasto_total_combustivel > 0) ? (gasto_total_combustivel / totalKm) : null;

    // Veículos com troca de óleo (threshold)
    const OLEO_THRESHOLD = 10000;
    const [veicTroca] = await db.promise().query(`
      SELECT id, nome, placa, km, ultimaTrocaOleo, (km - ultimaTrocaOleo) AS km_desde_oleo
      FROM veiculos WHERE ultimaTrocaOleo IS NOT NULL
      HAVING km_desde_oleo >= ${OLEO_THRESHOLD}
      ORDER BY km_desde_oleo DESC LIMIT 20
    `);

    // Utilização (dias com uso / dias no período)
    let utilizacao_frota = null;
    if (start_date && end_date) {
      const [diasUsoTotal] = await db.promise().query(`
        SELECT COUNT(DISTINCT DATE(data_hora_inicial)) AS dias_uso
        FROM uso_veiculos WHERE DATE(data_hora_inicial) BETWEEN ${db.escape(start_date)} AND ${db.escape(end_date)}
      `);
      const dias_periodo = (function () {
        const sd = new Date(start_date), ed = new Date(end_date);
        return Math.max(1, Math.floor((ed - sd) / (1000 * 60 * 60 * 24)) + 1);
      })();
      const dias_uso = Number(diasUsoTotal[0].dias_uso || 0);
      utilizacao_frota = { dias_periodo, dias_uso, pct_dias_com_uso: (dias_periodo > 0 ? (dias_uso / dias_periodo * 100) : 0) };
    }

    // Monta extraStats
    const extraStats = {
      usoResumo: {
        viagens_total: Number(usoResumo.viagens_total || 0),
        km_total: totalKm,
        km_medio_por_viagem: Number(usoResumo.km_medio_por_viagem || 0),
        tempo_total_segundos: Number(usoResumo.tempo_total_segundos || 0),
        tempo_medio_segundos: Number(usoResumo.tempo_medio_segundos || 0),
        velocidade_media_frota
      },
      tripsHora: tripsHora || [],
      tripsWeekday: tripsWeekday || [],
      topVeiculosKm: topVeiculosKm || [],
      topMotoristasKm: topMotoristasKm || [],
      median_distance,
      p75_distance,
      median_duration_sec,
      idleByVehicle,
      pct_viagens_com_imagens,
      litros_total,
      gasto_total_combustivel,
      litros_por_100km,
      custo_por_km,
      veicTroca,
      utilizacao_frota
    };

    // RENDER
    res.render('estatisticas-avancada', {
      layout: 'layout',
      title: 'Estatísticas avançadas',
      csrfToken: req.csrfToken ? req.csrfToken() : null,
      counts, tableSizes, lastActivity,
      abStats, manutencaoPorStatus, usoTotals,
      multasStats, arquivosCounts: arquivosCounts[0] || {}, auditoriaSample,
      recentMotoristasMasked, recentVeiculosMasked,
      filters: { start_date, end_date, tabela },
      activePage: 'estatisticas',
      extraStats
    });

  } catch (err) {
    console.error('GET /estatisticas-avancada erro:', err);
    res.status(500).send('Erro ao carregar estatísticas');
  }
});

/* Endpoint AJAX: /estatisticas-avancada/charts -> retorna séries para os gráficos (respeita filtros) */
app.get('/estatisticas-avancada/charts', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { start_date, end_date } = req.query || {};
    const dateWhere = (col) => {
      const parts = [];
      if (start_date) parts.push(`${col} >= ${db.escape(start_date + ' 00:00:00')}`);
      if (end_date) parts.push(`${col} <= ${db.escape(end_date + ' 23:59:59')}`);
      return parts.length ? ('AND ' + parts.join(' AND ')) : '';
    };
    const usoDateAnd = (start_date || end_date) ? dateWhere('data_hora_inicial') : '';

    const [tripsHora] = await db.promise().query(`
      SELECT HOUR(data_hora_inicial) AS hora, COUNT(*) AS qt
      FROM uso_veiculos WHERE 1 ${usoDateAnd}
      GROUP BY hora ORDER BY hora
    `);
    const [tripsWeekday] = await db.promise().query(`
      SELECT DAYOFWEEK(data_hora_inicial) AS dia_semana, COUNT(*) AS qt
      FROM uso_veiculos WHERE 1 ${usoDateAnd}
      GROUP BY dia_semana ORDER BY dia_semana
    `);
    const [topVeiculosKm] = await db.promise().query(`
      SELECT veiculo_id, SUM(CASE WHEN km_final IS NOT NULL AND km_inicial IS NOT NULL THEN (km_final - km_inicial) ELSE 0 END) AS km
      FROM uso_veiculos WHERE 1 ${usoDateAnd}
      GROUP BY veiculo_id ORDER BY km DESC LIMIT 10
    `);
    const [topMotoristasKm] = await db.promise().query(`
      SELECT motorista, SUM(CASE WHEN km_final IS NOT NULL AND km_inicial IS NOT NULL THEN (km_final - km_inicial) ELSE 0 END) AS km
      FROM uso_veiculos WHERE 1 ${usoDateAnd}
      GROUP BY motorista ORDER BY km DESC LIMIT 10
    `);

    res.json({
      ok: true,
      tripsHora,
      tripsWeekday,
      topVeiculosKm,
      topMotoristasKm
    });
  } catch (err) {
    console.error('GET /estatisticas-avancada/charts error', err);
    res.status(500).json({ ok: false, error: 'Erro ao gerar dados dos charts' });
  }
});

/* Endpoint para DataTables (já existente mas reforçado): /estatisticas-avancada/data/:table
   (mantive conforme padrão anterior, adaptado apenas para compatibilidade com novos campos)
*/
app.get('/estatisticas-avancada/data/:table', isAuthenticated, isAdmin, async (req, res) => {
  const table = req.params.table;
  const allowed = {
    motoristas: ['id', 'nome', 'email', 'cpf', 'data_cadastro'],
    veiculos: ['id', 'nome', 'placa', 'km', 'marca', 'modelo', 'dispositivo', 'renavam', 'chassi'],
    multas: ['id', 'veiculo_id', 'placa', 'motorista', 'valor_com_desconto', 'data'],
    uso_veiculos: ['id', 'veiculo_id', 'motorista', 'km_inicial', 'km_final', 'finalidade', 'data_hora_inicial', 'data_hora_final', 'data_criacao'],
    abastecimentos: ['id', 'veiculo_id', 'placa', 'data_hora', 'litros', 'preco_total']
  };
  if (!allowed[table]) return res.status(400).json({ error: 'Tabela não permitida' });

  const draw = parseInt(req.query.draw) || 1;
  const start = parseInt(req.query.start) || 0;
  const length = Math.min(parseInt(req.query.length) || 10, 1000);
  const search = req.query.search ? req.query.search.value : '';
  const orderColIdx = req.query.order ? parseInt(req.query.order[0].column) : 0;
  const orderDir = req.query.order ? (req.query.order[0].dir === 'desc' ? 'DESC' : 'ASC') : 'ASC';

  const cols = allowed[table];
  const orderCol = cols[orderColIdx] || cols[0];

  const { start_date, end_date } = req.query;
  const dateColMap = { motoristas: 'data_cadastro', veiculos: 'id', multas: 'data', uso_veiculos: 'data_hora_inicial', abastecimentos: 'data_hora' };

  const whereParts = [];
  if (search) {
    const searchable = cols.filter(c => ['nome', 'placa', 'motorista', 'email'].includes(c));
    if (searchable.length) whereParts.push('(' + searchable.map(c => `${c} LIKE ${db.escape('%' + search + '%')}`).join(' OR ') + ')');
  }
  if (start_date && dateColMap[table]) whereParts.push(`${dateColMap[table]} >= ${db.escape(start_date + ' 00:00:00')}`);
  if (end_date && dateColMap[table]) whereParts.push(`${dateColMap[table]} <= ${db.escape(end_date + ' 23:59:59')}`);

  const whereSQL = whereParts.length ? ('WHERE ' + whereParts.join(' AND ')) : '';
  try {
    const [totalRows] = await db.promise().query(`SELECT COUNT(*) AS cnt FROM \`${table}\``);
    const recordsTotal = totalRows[0].cnt || 0;

    const [filteredRows] = await db.promise().query(`SELECT COUNT(*) AS cnt FROM \`${table}\` ${whereSQL}`);
    const recordsFiltered = filteredRows[0] ? filteredRows[0].cnt : recordsTotal;

    const dataQ = `SELECT ${cols.join(',')} FROM \`${table}\` ${whereSQL} ORDER BY ${db.escapeId(orderCol)} ${orderDir} LIMIT ${start}, ${length}`;
    const [dataRows] = await db.promise().query(dataQ);

    const masked = dataRows.map(r => {
      if (table === 'motoristas') {
        return { ...r, email: r.email ? (String(r.email).split('@')[0].slice(0, 3) + '***@' + (String(r.email).split('@')[1] || '')) : '', cpf: r.cpf ? ('***.***.***-' + String(r.cpf).replace(/\D/g, '').slice(-2)) : '' };
      }
      if (table === 'veiculos') {
        return { ...r, renavam: r.renavam ? ('****' + String(r.renavam).slice(-4)) : undefined, chassi: r.chassi ? ('***' + String(r.chassi).slice(-4)) : undefined };
      }
      return r;
    });

    res.json({ draw, recordsTotal, recordsFiltered, data: masked });
  } catch (err) {
    console.error('/estatisticas-avancada/data error', err);
    res.status(500).json({ error: 'Erro ao buscar dados' });
  }
});



////////////////////////////////////////FIm estatisticas 2///////////////



///////////////////////inicio estatisticas KPI///////////////////

// ----------------------
// Rotas: /admin/stats + /admin/stats/driver/:id
// ----------------------
// ATENÇÃO: cole APÓS definição do helper `query` (util.promisify(db.query).bind(db))

// helper sanitização (reaproveitável)
const toPlain = v => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'bigint') return v.toString();
  if (Buffer && Buffer.isBuffer(v)) return '<binary>';
  return v;
};
const safeRow = row => {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const k of Object.keys(row)) out[k] = toPlain(row[k]);
  return out;
};
const safeRows = rows => Array.isArray(rows) ? rows.map(safeRow) : [];

// MAIN dashboard (mantém KPIs antigos + lista de motoristas)
app.get('/admin/stats', isAuthenticated, isAdmin, async (req, res) => {
  try {
    if (typeof query !== 'function') {
      console.error('[admin/stats] helper query não encontrado');
      return res.status(500).send('Erro interno: helper de DB não encontrado.');
    }

    // filtros
    const start = req.query.start || null;
    const end = req.query.end || null;
    const veiculo_id = req.query.veiculo_id || null;
    const motoristaFilter = req.query.motorista || null;

    // where para abastecimentos usando DATE(data_hora)
    const whereParts = [];
    const whereParams = [];
    if (start) { whereParts.push('DATE(data_hora) >= ?'); whereParams.push(start); }
    if (end) { whereParts.push('DATE(data_hora) <= ?'); whereParams.push(end); }
    const abastecWhere = whereParts.length ? ('WHERE ' + whereParts.join(' AND ')) : '';

    // KPIs gerais
    const kpiRows = await query(`
      SELECT
        (SELECT COUNT(*) FROM veiculos) AS total_veiculos,
        (SELECT COUNT(*) FROM motoristas) AS total_motoristas,
        (SELECT COUNT(*) FROM uso_veiculos) AS total_usos,
        (SELECT COUNT(*) FROM multas) AS total_multas,
        (SELECT IFNULL(SUM(valor),0) FROM multas) AS total_valor_multas,
        (SELECT IFNULL(SUM(valor),0) FROM reembolsos) AS total_reembolsos
    `);
    const kpi = safeRow(kpiRows && kpiRows[0] ? kpiRows[0] : {});

    // Abastecimentos agregados
    const abRows = await query(
      `SELECT
         COUNT(*) AS qtd,
         IFNULL(SUM(litros),0) AS litros,
         IFNULL(SUM(preco_total),0) AS gasto,
         IFNULL(AVG(preco_litro),0) AS preco_litro_medio,
         MAX(data_hora) AS ultimo_abastecimento
       FROM abastecimentos
       ${abastecWhere}
      `, whereParams
    );
    const abastecimentos_totais = safeRow(abRows && abRows[0] ? abRows[0] : {});

    // KM total (uso_veiculos) - opcional filtro por veículo
    const kmParams = [];
    let kmSql = 'SELECT IFNULL(SUM(km_final - km_inicial),0) AS km_total FROM uso_veiculos WHERE km_final IS NOT NULL';
    if (veiculo_id) { kmSql += ' AND veiculo_id = ?'; kmParams.push(veiculo_id); }
    const kmRows = await query(kmSql, kmParams);
    const km_total = Number((kmRows && kmRows[0] && kmRows[0].km_total) || 0);

    // litros / gasto no período
    const litRows = await query(`
      SELECT IFNULL(SUM(litros),0) AS litros_total, IFNULL(SUM(preco_total),0) AS gasto_total
      FROM abastecimentos
      ${abastecWhere}
    `, whereParams);
    const litros_total = Number((litRows && litRows[0] && litRows[0].litros_total) || 0);
    const gasto_total_abastecimento = Number((litRows && litRows[0] && litRows[0].gasto_total) || 0);

    const consumo_medio_l_km = km_total > 0 ? (litros_total / km_total) : null;
    const custo_por_km = km_total > 0 ? (gasto_total_abastecimento / km_total) : null;

    // Top veículos por gasto
    const topVeicRows = await query(`
      SELECT placa, IFNULL(SUM(preco_total),0) AS gasto, IFNULL(SUM(litros),0) AS litros, COUNT(*) AS qtd
      FROM abastecimentos
      ${abastecWhere}
      GROUP BY placa
      ORDER BY gasto DESC
      LIMIT 10
    `, whereParams);

    // Manutenções
    const manutWhere = [];
    const manutParams = [];
    if (start) { manutWhere.push("realizado_em >= ?"); manutParams.push(start + ' 00:00:00'); }
    if (end) { manutWhere.push("realizado_em <= ?"); manutParams.push(end + ' 23:59:59'); }
    const manutWhereClause = manutWhere.length ? ('WHERE ' + manutWhere.join(' AND ')) : '';

    const manutRows = await query(`
      SELECT IFNULL(SUM(custo_real),0) AS custo_total, COUNT(*) AS qtd
      FROM manutencoes_manuais
      ${manutWhereClause}
    `, manutParams);
    const manut_totais = safeRow(manutRows && manutRows[0] ? manutRows[0] : {});

    const manutPorVeicRows = await query(`
      SELECT veiculo_id, IFNULL(SUM(custo_real),0) AS custo, COUNT(*) AS qtd
      FROM manutencoes_manuais
      ${manutWhereClause}
      GROUP BY veiculo_id
      ORDER BY custo DESC
      LIMIT 10
    `, manutParams);

    // Multas
    const multasWhere = [];
    const multasParams = [];
    if (start) { multasWhere.push("data >= ?"); multasParams.push(start + ' 00:00:00'); }
    if (end) { multasWhere.push("data <= ?"); multasParams.push(end + ' 23:59:59'); }
    if (motoristaFilter) { multasWhere.push("motorista = ?"); multasParams.push(motoristaFilter); }
    if (veiculo_id) { multasWhere.push("veiculo_id = ?"); multasParams.push(veiculo_id); }
    const multasWhereClause = multasWhere.length ? ('WHERE ' + multasWhere.join(' AND ')) : '';

    const multasMotoristaRows = await query(`
      SELECT motorista, COUNT(*) AS qtd, IFNULL(SUM(valor),0) AS total_valor
      FROM multas
      ${multasWhereClause}
      GROUP BY motorista
      ORDER BY qtd DESC
      LIMIT 10
    `, multasParams);

    const multasTipoRows = await query(`
      SELECT t.descricao, COUNT(*) AS qtd
      FROM multas m
      LEFT JOIN tipos_infracoes t ON t.id = m.tipo_infracao_id
      ${multasWhereClause}
      GROUP BY m.tipo_infracao_id
      ORDER BY qtd DESC
      LIMIT 10
    `, multasParams);

    // Geofences e pontos (tratamento defensivo como antes)
    let geofences = [], geofence_violations = [];
    try {
      const grows = await query(`SELECT id, nome, descricao, ST_AsGeoJSON(geom) AS geojson FROM geofences`);
      geofences = (grows || []).map(r => {
        let parsed = null;
        try {
          if (r.geojson === null || r.geojson === undefined) parsed = null;
          else if (typeof r.geojson === 'string') parsed = JSON.parse(r.geojson);
          else if (Buffer && Buffer.isBuffer(r.geojson)) { const s = r.geojson.toString('utf8'); parsed = s ? JSON.parse(s) : null; }
          else if (typeof r.geojson === 'object') parsed = r.geojson;
        } catch (e) { parsed = null; }
        return { id: r.id, nome: r.nome, descricao: r.descricao, geojson: parsed };
      });

      const gviol = await query(`
        SELECT g.id AS geofence_id, g.nome, COUNT(*) AS qtd_viols
        FROM geofences g
        JOIN uso_veiculos u ON ST_Contains(g.geom, ST_GeomFromText(CONCAT('POINT(', u.start_lng, ' ', u.start_lat, ')')))
        GROUP BY g.id
        ORDER BY qtd_viols DESC
      `);
      geofence_violations = Array.isArray(gviol) ? safeRows(gviol) : [];
    } catch (e) {
      geofences = []; geofence_violations = [];
    }

    const pontosRows = await query(`
      SELECT id AS uso_id, veiculo_id, motorista, data_hora_inicial AS ts, start_lat, start_lng
      FROM uso_veiculos
      WHERE start_lat IS NOT NULL AND start_lng IS NOT NULL
      ORDER BY data_hora_inicial DESC
      LIMIT 200
    `);

    // Abastecimentos por dia (chart)
    const moment = require('moment');
    const periodStart = start || moment().subtract(29, 'days').format('YYYY-MM-DD');
    const periodEnd = end || moment().format('YYYY-MM-DD');

    const abPorDiaRows = await query(`
      SELECT DATE(data_hora) AS dia, IFNULL(SUM(preco_total),0) AS gasto, IFNULL(SUM(litros),0) AS litros, COUNT(*) AS qtd
      FROM abastecimentos
      WHERE DATE(data_hora) BETWEEN ? AND ?
      GROUP BY DATE(data_hora)
      ORDER BY dia ASC
    `, [periodStart, periodEnd]);

    // listas para filtros
    const veiculosList = await query(`SELECT id, placa, nome FROM veiculos ORDER BY nome IS NULL, nome`);
    const motoristasList = await query(`SELECT id, nome, cpf FROM motoristas ORDER BY nome`);

    // montar stats
    const stats = {
      kpi_frota: kpi,
      abastecimentos_totais: safeRow(abastecimentos_totais),
      km_total,
      litros_total,
      consumo_medio_l_km,
      custo_por_km,
      top_veiculos_abastecimento: safeRows(topVeicRows),
      manut_totais: safeRow(manut_totais),
      manut_por_veiculo: safeRows(manutPorVeicRows),
      multas_por_motorista: safeRows(multasMotoristaRows),
      multas_por_tipo: safeRows(multasTipoRows),
      geofences,
      geofence_violations,
      pontos_recentes: safeRows(pontosRows),
      abastecPorDia: safeRows(abPorDiaRows)
    };

    return res.render('admin-stats', {
      layout: 'layout',
      title: 'Estatísticas (Admin)',
      user: req.user,
      stats,
      filters: { start: start || '', end: end || '', veiculo_id: veiculo_id || '', motorista: motoristaFilter || '' },
      veiculosList: safeRows(veiculosList),
      motoristasList: safeRows(motoristasList),
      activePage: 'admin-stats',
      csrfToken: req.csrfToken ? req.csrfToken() : null
    });

  } catch (err) {
    console.error('GET /admin/stats erro:', err && (err.stack || err.message || err));
    return res.status(500).render('oops', {
      title: 'Erro',
      layout: 'layout-oops',
      message: 'Erro ao gerar estatísticas do admin. Veja logs do servidor.',
      linkUrl: '/',
      linkText: 'Voltar'
    });
  }
});


// Rota robusta: GET /admin/stats/driver/:id
app.get('/admin/stats/driver/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    if (typeof query !== 'function') return res.status(500).json({ error: 'helper query não configurado' });

    const param = req.params.id;
    const start = req.query.start || null;
    const end = req.query.end || null;

    // helpers locais
    const toPlain = v => {
      if (v === null || v === undefined) return null;
      if (typeof v === 'bigint') return v.toString();
      if (Buffer && Buffer.isBuffer(v)) return '<binary>';
      return v;
    };
    const safeRow = row => {
      if (!row || typeof row !== 'object') return row;
      const out = {};
      for (const k of Object.keys(row)) out[k] = toPlain(row[k]);
      return out;
    };
    const safeRows = rows => Array.isArray(rows) ? rows.map(safeRow) : [];

    // 1) Obtém motorista pelo id (se for numérico) ou tenta buscar por id/texto
    let mrows;
    // primeiro tenta por id numérico
    const numericId = /^\d+$/.test(String(param)) ? Number(param) : null;
    if (numericId !== null) {
      mrows = await query('SELECT id, nome, cpf FROM motoristas WHERE id = ?', [numericId]);
    } else {
      // se não for numérico, tenta buscar por nome direto (usuário pode ter clicado passando nome)
      mrows = await query('SELECT id, nome, cpf FROM motoristas WHERE nome = ? LIMIT 1', [param]);
      // se não achar por nome, tenta pelo idstring mesmo assim
      if ((!Array.isArray(mrows) || mrows.length === 0) && /^\d+$/.test(String(param))) {
        mrows = await query('SELECT id, nome, cpf FROM motoristas WHERE id = ?', [Number(param)]);
      }
    }

    if (!Array.isArray(mrows) || !mrows.length) {
      return res.status(404).json({ error: 'Motorista não encontrado', debug: { param } });
    }
    const motorista = safeRow(mrows[0]);

    // Função auxiliar: tenta executar a query de usage (por campo motorista) com value.
    const getUsage = async (value) => {
      const sql = `
        SELECT
          COUNT(*) AS total_viagens,
          IFNULL(SUM(CASE WHEN km_final IS NOT NULL THEN (km_final - km_inicial) ELSE 0 END),0) AS distancia_total_km,
          IFNULL(AVG(CASE WHEN km_final IS NOT NULL THEN (km_final - km_inicial) ELSE NULL END),0) AS distancia_media_km,
          IFNULL(SUM(TIMESTAMPDIFF(MINUTE, data_hora_inicial, data_hora_final)),0) AS tempo_total_minutos,
          IFNULL(AVG(TIMESTAMPDIFF(MINUTE, data_hora_inicial, data_hora_final)),0) AS tempo_medio_minutos
        FROM uso_veiculos
        WHERE motorista = ?
          AND (? IS NULL OR DATE(data_hora_inicial) >= ?)
          AND (? IS NULL OR DATE(data_hora_inicial) <= ?)
      `;
      const params = [value, start, start, end, end];
      const rows = await query(sql, params);
      return rows && rows[0] ? safeRow(rows[0]) : null;
    };

    // Função auxiliar: consumo/gasto via abastecimentos (prioriza condutor field)
    const getAbastecimentos = async (value) => {
      const sql = `
        SELECT
          IFNULL(COUNT(*),0) AS qtd_abastec,
          IFNULL(SUM(litros),0) AS litros_total,
          IFNULL(SUM(preco_total),0) AS gasto_total
        FROM abastecimentos
        WHERE condutor = ?
          AND (? IS NULL OR DATE(data_hora) >= ?)
          AND (? IS NULL OR DATE(data_hora) <= ?)
      `;
      const params = [value, start, start, end, end];
      const rows = await query(sql, params);
      return rows && rows[0] ? safeRow(rows[0]) : { qtd_abastec: 0, litros_total: 0, gasto_total: 0 };
    };

    // Substituir pela função abaixo dentro da rota /admin/stats/driver/:id
    const getMultas = async (value) => {
      // procura multas diretamente por m.motorista OU por uso_veiculos.motorista (via m.uso_id -> uso_veiculos.id)
      const sql = [
        "SELECT",
        "  IFNULL(COUNT(DISTINCT m.id),0) AS qtd_multas,",
        "  IFNULL(SUM(m.valor),0) AS valor_total",
        "FROM multas m",
        "LEFT JOIN uso_veiculos u ON m.uso_id = u.id",
        "WHERE (m.motorista = ? OR u.motorista = ?)",
        "  AND ( ? IS NULL OR DATE(m.data) >= ? )",
        "  AND ( ? IS NULL OR DATE(m.data) <= ? )"
      ].join(' ');

      const params = [value, value, start, start, end, end];

      try {
        const rows = await query(sql, params);
        return (rows && rows[0]) ? safeRow(rows[0]) : { qtd_multas: 0, valor_total: 0 };
      } catch (err) {
        // log pra diagnóstico — depois podemos remover esse log
        console.error('[admin/stats][getMultas] SQL ERROR', { err: err && (err.stack || err.message), sql, params });
        // devolve zero em caso de problema (não quebra o modal)
        return { qtd_multas: 0, valor_total: 0, _error: String(err && (err.message || err)) };
      }
    };



    // Função auxiliar: reembolsos por motorista_id
    const getReembolsos = async (motorista_id) => {
      const sql = `
        SELECT IFNULL(SUM(valor),0) AS total_reembolsos, COUNT(*) AS qtd_reembolsos
        FROM reembolsos
        WHERE motorista_id = ?
          AND (? IS NULL OR DATE(criado_em) >= ?)
          AND (? IS NULL OR DATE(criado_em) <= ?)
      `;
      const params = [motorista_id, start, start, end, end];
      const rows = await query(sql, params);
      return rows && rows[0] ? safeRow(rows[0]) : { total_reembolsos: 0, qtd_reembolsos: 0 };
    };

    // 2) Estratégia: tentar por motorista.id (se uso_veiculos.motorista armazena id), senão por nome
    let usage = await getUsage(String(motorista.id)); // tenta id primeiro (como string)
    let abaste = await getAbastecimentos(String(motorista.id));
    let multas = await getMultas(String(motorista.id));
    let method = 'by_id';

    // Se não encontrou viagens nem abastecimentos por id, tenta por nome (modelo atual do seu schema)
    const noUsage = !usage || Number(usage.total_viagens || 0) === 0;
    const noAb = !abaste || Number(abaste.qtd_abastec || 0) === 0;
    if (noUsage && noAb) {
      // tenta por nome
      usage = await getUsage(motorista.nome);
      abaste = await getAbastecimentos(motorista.nome);
      multas = await getMultas(motorista.nome);
      method = 'by_name';
    }

    // sempre buscar reembolsos por motorista.id (motorista_id é bigint unsigned)
    const reembolsos = await getReembolsos(motorista.id);

    // derived metrics
    const distKm = Number(usage.distancia_total_km || 0);
    const gastoTotal = Number(abaste.gasto_total || 0);
    const qtdMultas = Number(multas.qtd_multas || 0);
    const multasPor10k = distKm > 0 ? (qtdMultas / (distKm / 10000)) : null;
    const gastoPorKm = distKm > 0 ? (gastoTotal / distKm) : null;

    // score simples (ajustável)
    const normMultas = multasPor10k != null ? Math.min(10, multasPor10k) / 10 : 0;
    const normGasto = gastoPorKm != null ? Math.min(2, gastoPorKm) / 2 : 0;
    const score = Math.round((normMultas * 0.4 + normGasto * 0.6) * 100);

    // 3) série temporal: abastecimentos por dia (prioriza condutor=name, se vazio tenta condutor=id)
    let seriesRows = [];
    try {
      const seriesSql = `
        SELECT DATE(data_hora) AS dia, IFNULL(SUM(preco_total),0) AS gasto, IFNULL(SUM(litros),0) AS litros, COUNT(*) AS qtd
        FROM abastecimentos
        WHERE condutor = ?
          AND (? IS NULL OR DATE(data_hora) >= ?)
          AND (? IS NULL OR DATE(data_hora) <= ?)
        GROUP BY DATE(data_hora)
        ORDER BY dia ASC
      `;
      let sparams = [motorista.nome, start, start, end, end];
      const sres = await query(seriesSql, sparams);
      if (Array.isArray(sres) && sres.length) seriesRows = safeRows(sres);
      else {
        // tenta por id
        const sres2 = await query(seriesSql, [String(motorista.id), start, start, end, end]);
        seriesRows = safeRows(sres2 || []);
      }
    } catch (e) {
      // não crítico
      seriesRows = [];
    }

    return res.json({
      motorista,
      usage,
      abaste,
      multas,
      reembolsos,
      derived: {
        distancia_km: distKm,
        gasto_total: gastoTotal,
        multas_por_10k_km: multasPor10k,
        gasto_por_km: gastoPorKm,
        score
      },
      series: seriesRows,
      debug: { methodUsed: method }
    });

  } catch (err) {
    console.error('GET /admin/stats/driver/:id erro:', err && (err.stack || err.message || err));
    return res.status(500).json({ error: 'Erro ao gerar estatísticas do motorista', message: err && err.message });
  }
});




////////////////////////fim estatisticas KPI////////////////////
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`App rodando na porta ${PORT} ${HTTPS_ENABLED ? '(HTTPS)' : '(HTTP)'}`);
});
