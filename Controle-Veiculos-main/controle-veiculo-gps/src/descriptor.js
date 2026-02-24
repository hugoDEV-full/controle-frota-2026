'use strict';
const AuthRequirements = require('./helpers/auth-requirements');
const connected_clients = require('./connected_clients');
const jsonr = require('./helpers/jsonr');
const logger = require('./helpers/logger');
let listeners = [];
module.exports = {
    addListener: new_obj => {
        listeners.forEach(obj => {
            if (obj.route === new_obj.route && !new_obj.socketIOEvent) {
                logger.warning(`Rota '${new_obj.route}' já tratada por outro componente.`);
                return;
            }
        });
        listeners.push(new_obj);
    },
    removeListener: arg_route => {
        listeners = listeners.filter(value => {
            return value.route !== arg_route;
        });
        Object.keys(connected_clients.list()).forEach(fd => {
            fd.off(arg_route);
        });
    },
    listen: fd => {
        const sock_id = fd.id;
        listeners.forEach(obj => {
            //console.log('[ON]', obj.route);
            fd.on(obj.route, arg_client_data => {
                //console.log('[RCVD]', obj.route, arg_client_data);
                if (obj.route === 'disconnect') {
                    console.log('[DISCONNECT]', fd.id);
                    obj.callback(fd, obj.client_callback_key, arg_client_data);
                    return;
                }
                if (typeof arg_client_data === 'string') {
                    console.log('[RCVD 1]', arg_client_data);
                    arg_client_data = JSON.parse(arg_client_data);
                }
                const REQ_ID = parseInt(arg_client_data.REQ_ID);
                if (isNaN(REQ_ID) || REQ_ID <= 0) {
                    console.log('[RCVD 2]', REQ_ID);
                    jsonr.sendError(fd, -1, obj.client_callback_key, 'Chave de requisição não informada.');
                    return;
                }
                if (obj.requires.indexOf(AuthRequirements.noAuthRequired) !== -1) {
                } else {
                    if (obj.requires.indexOf(AuthRequirements.deviceAuthRequired) !== -1 && connected_clients.getAuthHostStatus(sock_id) === false) {
                        console.log('[RCVD 3]', connected_clients.getAuthHostStatus(sock_id));
                        return;
                    }
                    if (obj.requires.indexOf(AuthRequirements.userAuthRequired) !== -1 && connected_clients.getAuthUserStatus(sock_id) === false) {
                        console.log('[RCVD 4]', connected_clients.getAuthUserStatus(sock_id));
                        jsonr.sendError(fd, REQ_ID, obj.client_callback_key, 'Usuário não autenticado.');
                        return;
                    }
                }
                obj.callback(fd, obj.client_callback_key, arg_client_data);
            });
        });
    },
    listeners: () => listeners,
};
