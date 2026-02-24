'use strict';

const logger = require('./logger');

/**
 * @function add: Recupera a data/hora atual e adiciona nela uma fatia de tempo.
 * @param arg_valor: Quantidade a ser adicionada (1..N)
 * @param arg_unidade: Unidade de tempo a ser adicionada (segundo, minuto, hora, dia, etc)
 * @returns {Date}
 */
module.exports.add = function(arg_valor, arg_unidade)
{
    let soma = 0;
    switch (arg_unidade)
    {
        case 's':
        case 'sec':
        case 'second':
        case 'seconds':
            soma = ( arg_valor * 1000 );
            break;

        case 'm':
        case 'min':
        case 'minute':
        case 'minutes':
            soma = ( arg_valor * 60000 ); /* 60 * 1000 */
            break;

        case 'h':
        case 'hour':
        case 'hours':
            soma = ( arg_valor * 3600000 ); /* 60 * 60 * 1000 */
            break;

        case 'd':
        case 'day':
        case 'days':
            soma = ( arg_valor * 86400000 ); /* 60 * 60 * 1000 * 24 */
            break;

        case 'M':
        case 'month':
        case 'months':
            soma = ( arg_valor * 2592000000 ); /* 60 * 60 * 1000 * 24 * 30 */
            break;

        case 'Y':
        case 'year':
        case 'years':
            soma = ( arg_valor * 31104000000 ); /* 60 * 60 * 1000 * 24 * 30 * 12 */
            break;

        default:
            logger.warning('Unidade desconhecida: ' + arg_unidade);
            soma = 0;
            break;
    }

    return new Date( Date.now() + soma );
};

module.exports.format = function(arg_datahora, arg_lang)
{
    const day = arg_datahora.getDate(),
        month = arg_datahora.getMonth(),
        year  = arg_datahora.getFullYear(),
        hour  = arg_datahora.getHours(),
        min   = arg_datahora.getMinutes(),
        secs  = arg_datahora.getSeconds(),
        msecs = arg_datahora.getMilliseconds();

    switch (arg_lang)
    {
        case 'en':
        default:
            return year + '-' + month + '-' + day + 'T' + hour + ':' + min + ':' + secs + '.' + msecs;
            break;

        case 'pt-br':
            return day + '/' + month + '/' + year + ' ' + hour + ':' + min + ':' + secs;
            break;
    }
}