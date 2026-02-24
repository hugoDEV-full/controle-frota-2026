"use strict";

// Requirements
// ------------
const helmet = require('helmet');

// Variables
// ---------
const isHttps = process.env.HTTPS_ENABLED | false;

// Exports
// -------
module.exports = (myApp) =>
{
    myApp.use( helmet.expectCt() );
    myApp.use( helmet.dnsPrefetchControl() );
    myApp.use( helmet.frameguard() );
    myApp.use( helmet.hidePoweredBy() );

    if( isHttps )
    {
        myApp.use( helmet.hpkp() );
        myApp.use( helmet.hsts() );
    }

    myApp.use( helmet.ieNoOpen() );
    // myApp.use( helmet.noCache() );
    myApp.use( helmet.noSniff() );
    myApp.use( helmet.xssFilter() );
    myApp.use( helmet.contentSecurityPolicy({
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: [
                "'self'",
                "'unsafe-inline'"
            ],
            fontSrc: [
                "'self'"
            ],
            scriptSrc: [
                "'self'"
            ],
            imgSrc: [
                "'self'"
            ]
        }
    }) );
};