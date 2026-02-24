process.on('unhandledRejection', (reason, promise) => {
    logger.error(reason);
    console.error(reason);
});
('use strict');
const is_dev = process.env.OS === 'Windows_NT';
let env_file = is_dev ? '../../.env' : '/.env';
const envparser = require('dotenv').config({
    path: env_file,
});
if (envparser.error) {
    console.error(envparser.error);
    return;
}
const websocket_server = require('./websocket-server.js');
const http_server = require('./http-server');
const mysql = require('./helpers/mysql');
const logger = require('./helpers/logger');
(async function () {
    await logger.init();
    await mysql
        .init()
        .then(() => http_server.init())
        .then(http_instance => websocket_server.init(http_instance))
        .catch(err => console.error(err));
})();
