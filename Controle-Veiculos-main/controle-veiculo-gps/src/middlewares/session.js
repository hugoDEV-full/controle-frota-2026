'use strict';

// Requirements
// ------------
const session = require('express-session');
const app_config = require('../config.app');
const logger = require('../helpers/logger');

// Variables
// ---------
const sessionTimeout = app_config.session.timeout || 9999;
const sessionSecret = process.env.SECRET_SESSION;
if (!sessionSecret) {
    logger.error('Favor informar um valor em .ENV.SECRET_SESSION.');
    process.exit(1);
}

// Exports
// -------
module.exports = myApp => {
    myApp.use(
        session({
            name: 'session-id',
            secret: sessionSecret,
            keys: ['key1', 'key2'],
            saveUninitialized: false,
            resave: false,
            rolling: true, //!
            unset: 'destroy',
            cookie: {
                httpOnly: true, //! Importante
                secure: 'auto',
                domain: app_config.host,
                path: 'api',
                sameSite: 'strict',
                maxAge: sessionTimeout * 1000,
            },
        })
    );
};
