'use strict';
const Parser = require('../parser');
const connected_clients = require('../../../connected_clients');
class SocketDisconnectParser extends Parser {
    constructor() {
        super();
        this.handle_socket_disconnect = (arg_fd, arg_cbkey, arg_reason) => {
            const str = `Socket desconectado: ${arg_fd.id} - ${arg_fd.request.connection.remoteAddress} - ${arg_reason} - ${arg_cbkey}`;
            console.log(str);
            const sock_id = arg_fd.id;
            connected_clients.remove(sock_id);
        };
    }
    initRoutes() {
        this.registerRoute({
            route: 'disconnect',
            socketIOEvent: true,
            requires: [],
            callback: this.handle_socket_disconnect,
        });
    }
}
module.exports = SocketDisconnectParser;
