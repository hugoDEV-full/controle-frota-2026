"use strict";

// Requirements
// ------------
const logger = require('../helpers/logger');

// Exports
// -------
module.exports = (myApp) =>
{
    // 404
    myApp.use( (req, res) =>
    {
        logger.warning('Not found: ' + req.url);
        res.status(404).send('<h1>404</h1><code>Are you lost?</code>');
    });

    // 500
    myApp.use( (req, res) => res.status(500).send('Something wrong were not right.') );

    // Segfault
    process.on('uncaughtException', (err) => logger.error("uncaughtException: " + err) );
};