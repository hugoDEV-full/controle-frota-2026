const argv = require('yargs').argv;
module.exports = {
    express: {
        port: 4999,
    },
    session: {
        timeout: 3600,
    },
    onDev: process.env.NODE_ENV === 'development' || argv.dev === 1,
};
