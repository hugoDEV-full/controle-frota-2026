1- Sessões seguras: ``` app.use(session({ secret: process.env.SECRET_SESSION, cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' } })) ``` Protege sessão contra roubo.

2- Autenticação: ``` passport.use(new LocalStrategy(...)); app.use(passport.initialize(), passport.session()); ``` Garante identidade do usuário.

3- Proteção CSRF: ```const csrfProtection = csurf(); app.post('/rota', csrfProtection, handler); ``` Evita requisições forjadas.

4- Rate limit : ``` ingrateLimit({ windowMs:..., max:... }) ``` Limita tentativas de acesso.

5- Cabeçalhos: ``` HTTPapp.use... ```Define políticas de segurança.

6- Sanitização: ``` globalreq.body[field] = validator.escape(val); ```Previne execução de scripts.

7- Validação de dados: ``` body('email').isEmail(), body('cpf').isLength({ min:11,max:11 }) ``` Garante formato correto.

8- Hash de senha: ``` bcrypt.hash(password,10,...) ``` Armazena credenciais criptografadas.

9- Uploads controlados: ``` multer({ limits:{ fileSize }, fileFilter }) ```Bloqueia arquivos maliciosos.

10- Queries parametrizadas: ``` db.query('SELECT * FROM usuarios WHERE email = ?', [email]); ```Impede SQL injection.

11- Whitelist CORS: ``` const TRUSTED_ORIGINS=[...]; origin:(origin,cb)=>{...} ```Restringe origens autorizadas.

12- Tokens em .env: ``` require('dotenv').config(); ```Segredos fora do código.

13- Token reset válido: ``` WHERE password_reset_expires > Date.now() ``` Evita uso de token expirado.

14- Socket.IO ``` origin: if(!origin||TRUSTED_ORIGINS.includes(origin)) ``` Protege canal WebSocket.

15- Cookie Secure: ```secure: process.env.NODE_ENV==='production' ``` Exige HTTPS em produção.

16- Nonce para scripts: ```res.locals.nonce = crypto.randomBytes(16).toString('base64');``` Suporte a CSP  proteger contra ataques XSS.

17- HTTPS: Servidor configurado com TLS usando certificados em `/certs/fullchain.pem` e `/certs/privkey.pem`.

