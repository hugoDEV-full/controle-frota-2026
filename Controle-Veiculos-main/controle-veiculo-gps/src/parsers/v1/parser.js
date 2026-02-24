'use strict';

// Requirements
// ------------
const parserAbstract = require('../parserAbstract');

// Exports
// -------
class Parser extends parserAbstract
{
    constructor()
    {
        super();

        this.setApiVersion('v1');
        this.setExpirationDate(null); // Versão atual não tem data pra expirar.
    }
}

module.exports = Parser;
