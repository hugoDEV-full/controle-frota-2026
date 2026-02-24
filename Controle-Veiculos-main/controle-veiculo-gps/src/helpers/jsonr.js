/** @format */

'use strict';

//!
// This helper is purposed to send JSON messages to the socket.
//

const logger = require('./logger');

/**
 * @function sendSuccess: Send a JSON success message to the user.
 * @param arg_req_id ID da requisição feita pelo cliente.
 * @param arg_fd Socket file descriptor.
 * @param arg_client_callback_key Chave do callback pro cliente.
 * @param arg_data Dados a serem enviados pro cliente.
 */

module.exports.sendSuccess = (arg_fd, arg_req_id, arg_client_callback_key, arg_data) => {
    if (!arg_fd) {
        logger.error('JSONR[sendSuccess] Error: Undefined socket fd.');
        return;
    }
    if (!arg_client_callback_key) {
        logger.error('JSONR[sendSuccess] Error: Undefined client callback key.');
        return;
    }
    if (typeof arg_req_id !== 'number') {
        logger.error('JSONR[sendSuccess] Error: REQ_ID (' + arg_req_id + ') must be a number.');
        return;
    }

    let obj = {
        header: {
            REQ_ID: arg_req_id,
            SUCCESS: 1,
        },
        DATA: arg_data || {},
    };
    logger.info(`[${arg_client_callback_key}] ${JSON.stringify(obj)}`);
    return arg_fd.emit(arg_client_callback_key, obj);
};

/**
 * @function sendError: Send an error JSON message to the user.
 * @param arg_fd Socket file descriptor.
 * @param arg_req_id ID da requisição feita pelo cliente.
 * @param arg_client_callback_key Chave do callback pro cliente.
 * @param arg_message Mensagem de erro a ser enviada pro cliente.
 * @param arg_aditional_fields Mensagem de erro detalhada contendo detalhes de desenvolvimento.
 */
module.exports.sendError = (arg_fd, arg_req_id, arg_client_callback_key, arg_message, arg_aditional_fields, debug = false) => {
    if (!arg_fd) {
        if (debug) logger.error('JSONR[sendError] Error: Undefined socket fd.');
        return;
    }
    if (!arg_client_callback_key) {
        if (debug) logger.error('JSONR[sendError] Error: Undefined client callback key.');
        return;
    }
    if (typeof arg_req_id !== 'number') {
        if (debug) logger.error('JSONR[sendError] Error: REQ_ID (' + arg_req_id + ') must be a number.');
        return;
    }
    arg_message = arg_message || 'Ocorreu um erro desconhecido';
    let obj = {
        header: {
            SUCCESS: 0,
            REQ_ID: arg_req_id || -1,
        },
        MESSAGE: arg_message,
    };
    if (typeof arg_aditional_fields !== 'undefined') {
        obj.DATA = arg_aditional_fields;
    }
    logger.danger(`[${arg_client_callback_key}] ${JSON.stringify(obj)}`);
    arg_fd.emit(arg_client_callback_key, obj);
};
