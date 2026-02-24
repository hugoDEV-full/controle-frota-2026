'use strict';
const path = require('path');
const descriptor = require('./descriptor');
const logger = require('./helpers/logger');
const fs = require('fs');
const connected_clients = require('./connected_clients');
const Tester = require('./tester');
let io;
function initialize_parsers() {
    const parsers_path = __dirname + '/parsers';
    fs.readdirSync(parsers_path, {
        withFileTypes: true,
    }).forEach(obj => {
        if (obj.isDirectory()) {
            const parser_path = `${parsers_path}/${obj.name}/classes/`;
            fs.readdirSync(parser_path).forEach(parser => {
                try {
                    const id = path.resolve(`${parser_path}/${parser}`);
                    const ParserClass = require(id);
                    const api = new ParserClass();
                    if (!api.isExpired() && api.isEnabled()) {
                        api.initRoutes();
                        //console.log(`API [${id}] carregada.`);
                    }
                } catch (e) {
                    logger.error(`[ERROR]: ${parser_path}/${parser} - ${e.toString()}`);
                    console.log(e);
                }
            });
        }
    });
    // const is_dev = process.env.OS === 'Windows_NT';
    // if (is_dev) Tester(io);
}
function handle_init(server) {
    let id_to_ip = new Map();
    io = require('socket.io')(server, {
        cors: {
            origin: '*',
            pingTimeout: 60000,
            pingInterval: 30000,
        },
    });
    io.on('connection', function (fd) {
        let ip = fd.request.headers['x-forwarded-for'] || fd.request.connection.remoteAddress;
        if (ip && ip.indexOf(',') !== -1) ip = ip.split(',')[0].trim();
        console.log('\x1b[36m%s\x1b[0m \x1b[33m%s\x1b[0m \x1b[35m%s\x1b[0m', '> IP:', ip, '| FD: ' + fd.id);
        const sock_id = fd.id;
        connected_clients.append(sock_id);
        descriptor.listen(fd);
        id_to_ip.set(sock_id, ip);
    });
    initialize_parsers();
}
module.exports = {
    init: handle_init,
};
