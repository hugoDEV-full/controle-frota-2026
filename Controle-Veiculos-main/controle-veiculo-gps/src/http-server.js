'use strict';
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const moment = require('moment');
const express = require('express');
const db = require('./helpers/mysql');
const path = require('path');
const logger = require('./helpers/logger');
const ejs = require('ejs');
const http = require('http');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const fs = require('fs');
let auth_password_cache = {};
const token_auth = process.env.API_SECRET_KEY;
const _supported_hash_types = [null, 'md4', 'md5', 'sha1', 'sha256', 'sha384', 'sha512', 'sha224', 'sha256', 'sha384', 'sha512', 'sha512'];
const apiEndpoints = [];
function init() {
    const app = express();
    const public_endpoint = (path, handler, description = '', icon = 'fa-globe') => {
        apiEndpoints.push({
            path,
            requiresAuth: false,
            handler: handler.name || 'anonymous',
            description,
            icon,
        });
        app.all(path, handler);
    };
    const private_endpoint = (path, handler, description = '', icon = 'fa-lock') => {
        apiEndpoints.push({
            path,
            requiresAuth: true,
            handler: handler.name || 'anonymous',
            description,
            icon,
        });
        app.all(path, isAuthenticated, handler);
    };
    const public_dir = path.join(__dirname, 'public');
    if (!fs.existsSync(public_dir)) {
        console.log('Public directory not found:', public_dir);
        process.exit(1);
    } else {
        app.use(express.static(public_dir));
    }
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));
    app.set('view cache', true);
    app.use((req, res, next) => {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        next();
    });
    const session_cache = '/src/sessions';
    if (!fs.existsSync(session_cache)) fs.mkdirSync(session_cache, { recursive: true });
    app.use(
        session({
            secret: process.env.SECRET_SESSION || 'ds783halswdfa6sdf78sdafadkfa',
            resave: false,
            saveUninitialized: true,
            cookie: {
                maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year in milliseconds
                httpOnly: true,
            },
            store: new FileStore({
                path: session_cache,
                ttl: 365 * 24 * 60 * 60, // 1 year in seconds
                reapInterval: 86400, // 1 day in seconds
            }),
        })
    );
    app.use(passport.initialize());
    app.use(passport.session());
    passport.use(
        new LocalStrategy(
            {
                usernameField: 'email',
                passwordField: 'password',
            },
            async (email, password, done) => {
                try {
                    const results = await db.call('auth', [email], true);
                    if (results.length <= 0) {
                        const str = `[3] Usuário ou senha incorretos.`;
                        return done(null, false, { message: str });
                    }
                    const user = results[0];
                    const UID = user['UID'];
                    if (!!parseInt(UID)) {
                        const user = results[0];
                        bcrypt.compare(password, user.senha, (err, isMatch) => {
                            if (err) {
                                console.log('[LOGIN 5]', { err });
                                return done(err);
                            }
                            if (isMatch) {
                                console.log('[LOGIN 6]', { user });
                                return done(null, user);
                            }
                            console.log('[LOGIN 7]', { isMatch });
                            return done(null, false, { message: 'Senha incorreta.' });
                        });
                    } else {
                        const str = `[4] Usuário ou senha incorretos.`;
                        return done(null, false, { message: str });
                    }
                } catch (err) {
                    const str = err.message;
                    console.log('[LOGIN 4]', { str });
                    return done(null, false, { message: str });
                }
            }
        )
    );
    passport.serializeUser((user, done) => {
        done(null, user.UID);
    });
    passport.deserializeUser(async (id, done) => {
        try {
            const user = { UID: id };
            done(null, user);
        } catch (err) {
            done(err);
        }
    });
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());
    public_endpoint('/', home, 'Página inicial', 'fa-home');
    public_endpoint(
        '/login',
        async (req, res, next) => {
            const is_dev = process.env.OS === 'Windows_NT' || process.env.DEVCONTAINER === 'true';
            console.log('[LOGIN 1]', req.body, is_dev);
            /*
        if (!is_dev) {
            try {
                const GPS_RECAPTCHA_SECRET_KEY = process.env.GPS_RECAPTCHA_SECRET_KEY;
                const recaptcha = req.body?.recaptcha;
                if (!recaptcha) {
                    console.log('[LOGIN 10]', req.body);
                    return res.json({ error: '[1] reCAPTCHA verification failed.' });
                }
                const verification_url = `https://www.google.com/recaptcha/api/siteverify?secret=${GPS_RECAPTCHA_SECRET_KEY}&response=${recaptcha}`;
                const r = await fetch(verification_url, { method: 'POST' }).then(response => response.json());
                if (!r.success || r.score < 0.5) {
                    const str = `[2] reCAPTCHA verification failed. Score: ${r.score}, need: 0.5`;
                    console.log(r);
                    return res.json({ error: str });
                } else {
                    console.log('[LOGIN]', { r });
                    return res.json({ success: true });
                }
            } catch (err) {
                console.log(err);
                return res.json({ error: err.message });
            }
        }
        */
            console.log('[LOGIN 2]', { is_dev });
            passport.authenticate('local', function (err, user, info) {
                console.log('[LOGIN 3]', { err, user, info });
                if (err) return res.json({ error: err.message });
                console.log('[LOGIN 4]', { err, user, info });
                const error = info?.message || 'Invalid username or password.';
                if (!user) return res.json({ error });
                req.logIn(user, function (err) {
                    if (err) {
                        console.log('Login error:', err);
                        return res.json({ error: err.message });
                    }
                    return res.json({ success: true });
                });
            })(req, res, next);
        },
        'Página de login'
    );
    private_endpoint(
        '/logout',
        (req, res) => {
            req.logout(function (err) {
                if (err) {
                    console.log('Logout error:', err);
                    return res.json({ error: err.message });
                }
                res.redirect('/');
            });
        },
        'Logout'
    );
    private_endpoint('/dispositivos', dispositivos, 'Lista de dispositivos', 'fa-mobile-screen-button');
    public_endpoint('/login', login, 'Página de login', 'fa-user');
    private_endpoint('/device/:id', device, 'Dispositivo', 'fa-mobile-screen-button');
    private_endpoint('/mapa/:type', mapa, 'Mapa', 'fa-map');
    private_endpoint('/gps/:type', gps, 'GPS', 'fa-map-marker-alt');
    public_endpoint('/mapa/img/:id/:bg', mapa_img, 'Imagem do mapa', 'fa-image');
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('X-Frame-Options', 'DENY');
        next();
    });

    app.get('/api', (req, res) => {
        render(req, res, 'api', { endpoints: apiEndpoints });
    });
    app.use((req, res, next) => {
        const ignore_extension = /\.(?:jpe?g|png|gif|css|ico)$/i;
        const ignore_ajax = /ajax/i;
        res.on('finish', () => {
            if (ignore_extension.test(req.url) || ignore_ajax.test(req.url)) return next();
            const all_ips = [req.headers['x-forwarded-for'], req.headers['X-Real-IP'], req.connection.remoteAddress];
            const remote_ip = all_ips.find(ip => ip !== undefined) || 'unknown';
            const statusCode = res.statusCode;
            const logMessage = `${req.method} ${req.url} ${statusCode} ${remote_ip}`;
            if (statusCode >= 200 && statusCode < 300) logger.green(logMessage, 'HTTP');
            else if (statusCode >= 300 && statusCode < 400) logger.blue(logMessage, 'HTTP');
            else if (statusCode >= 400 && statusCode < 500) logger.yellow(logMessage, 'HTTP');
            else if (statusCode >= 500) logger.red(logMessage, 'HTTP');
            else logger.gray(logMessage, 'HTTP');
        });
        next();
    });
    app.use((err, req, res, next) => {
        logger.error('Express error:', err);
        res.status(500).send({ error: err.message });
    });
    const is_dev = process.env.NODE_ENV !== 'production';
    const port = is_dev ? process.env.GPS_PORT_DEV : process.env.GPS_PORT;
    const server = http.createServer({}, app);
    server.listen(port, '0.0.0.0', function (err) {
        if (err) logger.error('http-server error: ' + err);
        else logger.info(`http-server listening on port ${port} (${is_dev ? 'DEV' : 'PROD'} mode)`);
        if (is_dev) test(port);
    });
    return server;
}

async function render(req, res, view, data, init = '') {
    data = data || {};
    const is_dev = process.env.OS === 'Windows_NT' || process.env.DEVCONTAINER === 'true';
    data.is_dev = is_dev;
    data.GPS_RECAPTCHA_SITE_KEY = process.env.GPS_RECAPTCHA_SITE_KEY;
    const file = path.join(__dirname, 'views', view + '.ejs');
    const body = await ejs.renderFile(file, data);
    const index_file = path.join(__dirname, 'views', 'index.ejs');
    data = {
        is_dev: is_dev,
        GPS_RECAPTCHA_SITE_KEY: process.env.GPS_RECAPTCHA_SITE_KEY,
        user: req.user,
        APP_TITLE: process.env.APP_TITLE,
        APP_ICON: process.env.APP_ICON,
        body,
        init,
        no_footer: data.no_footer || false,
    };
    const index_html = await ejs.renderFile(index_file, data);
    res.send(index_html);
}

async function dispositivos(req, res) {
    if (req.xhr || req.headers?.accept?.includes('application/json')) {
        const celular = req.query.celular === '1' ? 1 : 0;
        const dev_mode = req.query.dev_mode === '1' ? 1 : 0;
        const equipes = await db.call('dispositivos', [celular, dev_mode]);
        return res.json(equipes);
    }
    render(req, res, 'dispositivos');
}

async function home(req, res) {
    render(req, res, 'home');
}

async function device(req, res) {
    if (req.xhr || req.headers?.accept?.includes('application/json')) {
        const id = req.params.id;
        let date = req.query.date;
        if (!date) date = new Date().toISOString().split('T')[0];
        const avg = await db.call('sico_ims.recupera_consolidado_gps_dispositivo_por_hora', [id, date]);
        const all = await db.call('sico_ims.recupera_gps_dispositivo_do_dia', [id, date]);
        return res.json({ avg, all });
    }
    render(req, res, 'device', {}, '', 'Dispositivo');
}

async function login(req, res) {
    const referrer = req.query.referrer;
    render(req, res, 'login', { referrer }, '', 'Login');
}

async function mapa_img(req, res) {
    const id = req.params.id;
    const bg = req.params.bg;
    if (!id || !bg) return res.status(400).send(`Missing icon ID or background color: id=${id}, bg=${bg}`);
    const width = 28;
    const height = 34;
    const markers_base_dir = path.join(__dirname, '/markers');
    const cache_dir = path.join(markers_base_dir, 'cache');
    const over_ico_dir = path.join(markers_base_dir, 'over_icons');
    const def_ico = path.join(over_ico_dir, 'question.png');
    const cache_file = `${id}_${bg}-v3.png`;
    const cache_path = path.join(cache_dir, cache_file);
    const forceRefresh = req.query.refresh === '1' || req.headers['cache-control'] === 'no-cache';
    if (!fs.existsSync(cache_dir)) {
        try {
            fs.mkdirSync(cache_dir, { recursive: true });
        } catch (err) {
            logger.error('Failed to create cache directory:', err);
            return res.status(500).send('Server error creating cache directory.');
        }
    }
    if (fs.existsSync(cache_path) && !forceRefresh) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('ETag', `"${id}_${bg}_v3"`);
        return res.sendFile(cache_path);
    }
    let ico_path = path.join(over_ico_dir, `${id}.png`);
    if (!fs.existsSync(ico_path)) {
        logger.warn(`Icon not found: ${id}.png. Using default question.png`);
        ico_path = def_ico;
        if (!fs.existsSync(ico_path)) {
            const str = `Default icon not found: "${def_ico}"`;
            logger.error(str);
            return res.status(500).send(str);
        }
    }
    try {
        const sharp = require('sharp');
        const ic_meta = await sharp(ico_path).metadata();
        const w = ic_meta.width;
        const h = ic_meta.height;
        await sharp({
            create: {
                width: width,
                height: height,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 },
            },
        })
            .png()
            .composite([
                {
                    input: Buffer.from(`
                    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
                        <path d="M${width / 2},${height - 2} C-${width},${-(height * 0.33)} ${width * 2},${-(height * 0.33)} ${width / 2},${height - 2}" fill="#${bg}" />
                    </svg>`),
                    gravity: 'center',
                },
                {
                    input: ico_path,
                    left: Math.floor((width - w) / 2 + 1),
                    top: Math.floor((height - h) / 2 - 4),
                },
            ])
            .png({ compressionLevel: 9 })
            .toFile(cache_path);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('ETag', `"${id}_${bg}_v3"`);
        res.sendFile(cache_path);
    } catch (err) {
        if (fs.existsSync(cache_path)) {
            try {
                fs.unlinkSync(cache_path);
            } catch (e) {
                logger.error('Failed to remove corrupted cache file:', e);
            }
        }
        logger.error('Error generating marker image:', err);
        return res.status(500).send(err.message);
    }
}
const gen_google_map_addr = r => {
    const addressParts = [r.ENDERECO_LOGRADOURO, r.ENDERECO_BAIRRO, r.ENDERECO_CIDADE, r.localidade_uf_abbr || r.localidade_uf_label, 'Brasil'].filter(part => part && part.trim());
    const address = addressParts.join(', ');
    if (r.ENDERECO_REFERENCIA && r.ENDERECO_REFERENCIA.trim()) return `${address} (Referência: ${r.ENDERECO_REFERENCIA.trim()})`;
    return address;
};
async function mapa(req, res) {
    const type = req.params.type;
    const id = parseInt(req.query.id || 0);
    if (id === 0) return res.json({ error: `Invalid request: id=${id}` });
    const [r] = await db.call('chamado_get_by_id_v4_2_0', [id]);
    if (!r || Object.keys(r).length === 0) return res.json({ error: `Invalid request: id=${id}` });
    const args = {
        MAP_KEY: process.env.GPS_MAP_KEY,
        no_footer: true,
        is_test: req.query.test === '1' || req.query['x-test'] === '1',
        type,
        chamado_homologacao: r.chamado_homologacao || 0,
        ENDERECO_UF: r.localidade_uf_label || '', // Distrito Federal
        ENDERECO_CIDADE: r.ENDERECO_CIDADE || '', // CEILÂNDIA
        ENDERECO_BAIRRO: r.ENDERECO_BAIRRO || '', // CEILÂNDIA CENTRO
        ENDERECO_BAIRRO_ID: r.ENDERECO_BAIRRO_ID || 0, // 51
        ENDERECO_LOGRADOURO: r.ENDERECO_LOGRADOURO || '', // TESTE INOVA
        ENDERECO_REFERENCIA: r.ENDERECO_REFERENCIA || '', // TESTE
        dst_lat: r.ENDERECO_GPS_LATITUDE, // -15.8301
        dst_lon: r.ENDERECO_GPS_LONGITUDE, // -48.0336
        default_lat: -15.8018427,
        default_lon: -47.9932764,
        src_lat: r.equipe_lat || 0,
        src_lon: r.equipe_lon || 0,
        src_addr: gen_google_map_addr(r),
        src_gps_last: r.equipe_gps_last || 0,
        base_nome: r.base_nome || '', //
        base_end: r.base_end || '', //
        base_lat: r.base_lat || 0, // 0
        base_lon: r.base_lon || 0, // 0
        x_auth: req.query['x-auth'] || '0',
        x_uid: req.query['x-uid'] || '0',
        x_hash_type: req.query['x-hash-type'] || '0',
    };
    const file = path.join(__dirname, 'views', 'mapa.ejs');
    const index_html = await ejs.renderFile(file, args);
    res.send(index_html);
}

async function gps(req, res) {
    const id = parseInt(req.query.id || 0);
    const homologacao = parseInt(req.query.homologacao || 0);
    const data = await db.call('sico_ims.recupera_coordenadas_viaturas_ativas_v2', [id, homologacao, 1]);
    return res.json(data);
}
async function test(port) {
    // const uri = '?x-test=1&id=17119802&x-auth=6863d9496a77e12d70262f0d081d10554f18f17254c7c46ccab7a2ed4e56126c&x-uid=11291&x-hash-type=2';
    // const url = `http://localhost:${port}/mapa/medicos${uri}`;
    // logger.magenta(`Testing ${url}`);
    // const response = await fetch(url);
    // const data = await response.text();
    // console.log(data.slice(0, 100));
}
async function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    const authHeader = req.headers.authorization;
    const authQuery = req.query['x-auth'];
    const hash_type = parseInt(req.query['x-hash-type']) || 0;
    const auth_token = authHeader || authQuery;
    const uid = req.headers['x-uid'] || req.query['x-uid'];
    if (auth_token && uid) {
        const token = auth_token.startsWith('Bearer ') ? auth_token.substring(7) : auth_token;
        try {
            let pwdkey;
            if (auth_password_cache[uid] && Object.keys(auth_password_cache[uid]).length > 0) {
                if (hash_type === 2) pwdkey = auth_password_cache[uid].pwd_md5;
                else if (hash_type === 3) pwdkey = auth_password_cache[uid].pwd_sha1;
                else if (hash_type === 6) pwdkey = auth_password_cache[uid].pwd_sha512;
                else if (hash_type === 4) pwdkey = auth_password_cache[uid].pwd_sha256;
            } else {
                const [user] = await db.call('sico_server_user_by_uid', [uid]);
                if (!user) return res.json({ error: `Invalid UID="${uid}"` });
                if (hash_type === 2) pwdkey = _hash(hash_type, uid, user.senha);
                else if (hash_type === 3) pwdkey = _hash(hash_type, uid, user.pwd_sha1);
                else if (hash_type === 6) pwdkey = _hash(hash_type, uid, user.pwd_sha512);
                else if (hash_type === 4) pwdkey = _hash(hash_type, uid, user.pwd_sha256);
            }
            if (pwdkey && token === pwdkey) {
                auth_password_cache[uid] = pwdkey;
                return next();
            } else {
                const [user] = await db.call('sico_server_user_by_uid', [uid]);
                if (!user) return res.json({ error: 'Invalid UID.' });
                if (hash_type === 2) pwdkey = _hash(hash_type, uid, user.senha);
                else if (hash_type === 3) pwdkey = _hash(hash_type, uid, user.pwd_sha1);
                else if (hash_type === 6) pwdkey = _hash(hash_type, uid, user.pwd_sha512);
                else if (hash_type === 4) pwdkey = _hash(hash_type, uid, user.pwd_sha256);
                if (pwdkey && token === pwdkey) {
                    auth_password_cache[uid] = pwdkey;
                    return next();
                } else {
                    console.log({ user, pwdkey, token, hash_type, uid });
                }
            }
            return res.json({ error: `Invalid token. UID="${uid}"` });
        } catch (err) {
            logger.error(err);
            return res.json({ error: err.message });
        }
    }
    res.redirect('/login');
}
const _hash = (type, uid, pw, algorithm = 'sha256') => {
    if (!pw) {
        logger.warning(`Invalid password for UID="${uid}"`);
        return null;
    }
    const hash_type = _supported_hash_types[type];
    if (!hash_type) {
        logger.warning(`Invalid hash type for type="${type}" UID="${uid}"`);
        return null;
    }
    const str = uid + '.' + pw + '.' + token_auth;
    const s = crypto.createHash(algorithm).update(str).digest('hex');
    // console.log('_hash:', hash_type, algorithm);
    // console.log(' - src: ', str);
    // console.log(' - dst: ', s);
    return s;
};
module.exports = {
    init: init,
};
