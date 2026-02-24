'use strict';
const mysql = require('mysql2/promise');
const sqlstring = require('sqlstring');
const fs = require('fs');
const logger = require('./logger');
let pool = null;
let EQUIPES = {};
async function init() {
    const DB_SSL_CA = process.env.DB_SSL_CA;
    const DB_SSL_CERT = process.env.DB_SSL_CERT;
    const DB_SSL_KEY = process.env.DB_SSL_KEY;
    const is_dev = process.env.OS === 'Windows_NT';
    const host = is_dev ? process.env.GSP_DB_HOST_DEV : process.env.GSP_DB_HOST;
    const user = is_dev ? process.env.GSP_DB_USER_DEV : process.env.GSP_DB_USER;
    const password = is_dev ? process.env.GSP_DB_PASSWORD_DEV : process.env.GSP_DB_PASSWORD;
    const database = is_dev ? process.env.GSP_DB_NAME_DEV : process.env.GSP_DB_NAME;
    const port = is_dev ? process.env.GSP_DB_PORT_DEV : process.env.GSP_DB_PORT;
    const cfg = {
        host,
        user,
        password,
        database,
        port,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
    };
    if (DB_SSL_CA && DB_SSL_CERT && DB_SSL_KEY) {
        cfg.ssl = {
            ca: fs.readFileSync(DB_SSL_CA),
            cert: fs.readFileSync(DB_SSL_CERT),
            key: fs.readFileSync(DB_SSL_KEY),
        };
    }
    if (!cfg.host || !cfg.user || !cfg.database || !cfg.password) {
        console.log(cfg);
        logger.error('Erro nas configuracoes de acesso ao banco de dados.');
        return;
    }
    pool = mysql.createPool(cfg);
    const equipes = await call('equipes_get_all', [0]);
    for (let equipe of equipes) EQUIPES[equipe.EQUIPE_ID] = equipe.EQUIPE_NOME;
}
async function call(arg_sp, arg_args, arg_debug = false) {
    if (!arg_sp) return logger.error('ERR_NO_SP');
    const args = arg_args || [];
    if (!Array.isArray(args)) return logger.error('ARG_TYPE_NOT_SUPPORTED');
    let args_str = [];
    args.forEach(param => args_str.push(sqlstring.escape(param)));
    const query = `CALL ${arg_sp} (${args_str.join(', ')})`;
    if (arg_debug) console.log(query);
    const [res] = await pool.query(query);
    return res && res.length > 0 ? res[0] : [];
}
const team_id = arg_equipe_id => (EQUIPES[arg_equipe_id] ? `"${arg_equipe_id} - ${EQUIPES[arg_equipe_id]}"` : `#${arg_equipe_id}`);
module.exports = {
    escape: sqlstring.escape,
    init: init,
    call: call,
    team_id: team_id,
};
