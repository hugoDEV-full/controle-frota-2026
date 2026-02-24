'use strict';
const Parser = require('../parser');
const logger = require('../../../helpers/logger');
const db = require('../../../helpers/mysql');
const connected_clients = require('../../../connected_clients');
const jsonr = require('../../../helpers/jsonr');
class AuthDeviceParser extends Parser {
    constructor() {
        super();
        this.handle_auth_device = (arg_fd, arg_cbkey, arg_client_data) => {
            const sock_id = arg_fd.id;
            if (connected_clients.getAuthHostStatus(sock_id)) {
                jsonr.sendError(arg_fd, arg_client_data.REQ_ID, arg_cbkey, 'Dispositivo já autenticado.', false);
                return;
            }
            const ip = arg_fd.request.connection.remoteAddress;
            const IMEI = arg_client_data.IMEI;
            if (!arg_client_data.hasOwnProperty('IMEI') || !IMEI) {
                console.log('IMEI não informado: ', ip);
                console.log({ arg_client_data });
                jsonr.sendError(arg_fd, arg_client_data.REQ_ID, arg_cbkey, 'IMEI não informado.');
                return;
            }
            let args = [IMEI];
            db.call('device_auth', args)
                .then(arg_resultset => {
                    const r = arg_resultset[0];
                    if (!r) {
                        jsonr.sendError(arg_fd, arg_client_data.REQ_ID, arg_cbkey, `Dispositivo ${IMEI} não encontrado.`);
                        return;
                    }
                    if (!r.hasOwnProperty('AUTH_OK') || parseInt(r.AUTH_OK) !== 1) {
                        connected_clients.setAuthHostStatus(sock_id, false);
                        jsonr.sendError(arg_fd, arg_client_data.REQ_ID, arg_cbkey, `Dispositivo ${IMEI} não autorizado.`);
                        return;
                    }
                    connected_clients.setAuthHostStatus(sock_id, true);
                    connected_clients.setPublicData(sock_id, 'fn_sock', {
                        sendSuccess: (req_id, client_callback_key, data) => jsonr.sendSuccess(arg_fd, req_id, client_callback_key, data),
                        sendError: (req_id, client_callback_key, message, aditional_fields) => jsonr.sendError(arg_fd, req_id, client_callback_key, message, aditional_fields),
                    });
                    const stats = `IMEI=${IMEI} dev_name=${r.dev_name} dev_id=${r.dev_id}`;
                    console.info('\x1b[35m%s\x1b[0m', stats);
                    jsonr.sendSuccess(arg_fd, arg_client_data.REQ_ID, arg_cbkey, {
                        DEVICE_ID: r.dev_id,
                        DEVICE_TYPE: r.device_type,
                        AUTH_HASH: r.auth_hash_type,
                    });
                })
                .catch(err => {
                    const errstr = err && err.toString ? err.toString() : 'Erro desconhecido';
                    logger.error(errstr);
                    jsonr.sendError(arg_fd, arg_client_data.REQ_ID, arg_cbkey, errstr);
                });
        };
    }
    initRoutes() {
        this.registerRoute({
            route: 'auth-device',
            requires: this.authRequirements().noAuthRequired,
            callback: this.handle_auth_device,
            client_callback_key: 'auth-device-result',
        });
    }
}

module.exports = AuthDeviceParser;
