'use strict';

// Requirements
// ------------
const logger = require('../helpers/logger');

// Exports
// -------
let Validator = module.exports;

/**
 * @function parseNumber: Transforma um numero de padrão PT-BR (5.000,98) em um número padrão EN (5000.98).
 * @param arg_value
 * @returns {number}
 */
Validator.parseNumber = (arg_value) => {
    return Number( arg_value.replace(/[^0-9,-]/g,'').replace(',','.') );
};

/**
 * @function isEmpty: Retorna true caso @arg_value não exista (null, undefined) ou caso seja vazio.
 * @param arg_value
 * @returns {boolean}
 */
Validator.isEmpty = (arg_value) => {
    return (!arg_value || arg_value.length <= 0);
};

/**
 * @function isGt: Retorna true caso @arg_value seja maior que @arg_comparison.
 *                 Recomendado que @arg_value tenha passado anteriormente pelo método @parseNumber.
 *                 Ex: const val = validator.parseNumber(req.body.field).
 * @param arg_value
 * @param arg_comparison
 * @returns {boolean}
 */
Validator.isGt = (arg_value, arg_comparison) => {
    return arg_value > arg_comparison;
};

Validator.isLength = (arg_value, arg_comparison) =>
{
    let len = null;

    if( typeof arg_value === 'string' ) len = arg_value.length;
    else if( typeof arg_value === 'number' ) len = arg_value.toString().length;
    else if( typeof arg_value === 'object' ) {
        if( Array.isArray(arg_value) ) len = arg_value.length;
        else len = Object.keys(arg_value).length;
    }
    else { logger.error('Unknown lvalue length.'); return false; }

    if( typeof arg_comparison === 'object' )
    {
        let min_length, max_length;

        min_length = arg_comparison.hasOwnProperty('min') ? arg_comparison.min : null;
        max_length = arg_comparison.hasOwnProperty('max') ? arg_comparison.max : null;

        if( min_length === null && max_length === null )
        {
            logger.error("Validator 'isLength', when comparing lvalue with an object, needs this object to contains {min|max}.");
            return false;
        }
        else if( min_length !== null && max_length === null ){
            return len >= min_length;
        }
        else if( min_length === null && max_length !== null){
            return len <= max_length;
        }
        else{
            if( min_length > max_length ){
                logger.error("You've passed a {min} value greater than {max} to 'isLength'.");
                return false;
            }
            return (len >= min_length && len <= max_length)
        }
    }
    else if( typeof arg_comparison === 'number') {
        return len === arg_comparison;
    }
    else{
        logger.error("Validator 'isLength' needs a valid comparison rvalue.");
        return false;
    }
};

Validator.isCPF = (arg_value) =>
{
    const value = arg_value.replace(/[^0-9]/g,'');
    return this.isLength(value, 11); // tirando tudo que não for número, deve sobrar 11 caracteres.
};

Validator.isCNPJ = (arg_value) =>
{
    const value = arg_value.replace(/[^0-9]/g,'');
    return this.isLength(value, 14); // tirando tudo que não for número, deve sobrar 14 caracteres.
};

Validator.isPhone = (arg_value) =>
{
    const value = arg_value.replace(/[^0-9]/g,'');
    return this.isLength(value, {min: 10, max:11}); // 6130282236 ou 61999919137
};

Validator.isCEP = (arg_value) =>
{
    const value = arg_value.replace(/[^0-9]/g,'');
    return this.isLength(value, 8); // 72600623
};