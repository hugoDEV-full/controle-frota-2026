'use strict';

const descriptor = require('../descriptor');
const AuthRequirements = require('../helpers/auth-requirements');
const logger = require('../helpers/logger');

class ParserAbstract
{
    constructor()
    {
        this._api_version = null;
        this._expiration_date = null;
        this._api_disabled = false;
        this._auth_requirements = AuthRequirements;

        // this._expiration_verify_interval = null;
        // this.verifyExpiration = this.verifyExpiration.bind(this);
    }

    /**
     * Versão da API.
     */
    setApiVersion(arg_version)
    {
        this._api_version = arg_version;
    }

    apiVersion()
    {
        return this._api_version;
    }

    /**
     * API desabilitada ou não.
     */
    setDisabled(arg)
    {
        this._api_disabled = arg;
    }

    isEnabled()
    {
        return !this._api_disabled;
    }

    /**
     * Data de expiração da API.
     * Importante: Após essa data/hora, a API pára de funcionar!
     */
    setExpirationDate(arg_year, arg_month, arg_day, arg_hour, arg_minute, arg_second)
    {
        if( !arg_year ||
            !arg_month ||
            !arg_day ||
            !arg_hour )
        {
            // Sem data de expiração.
            return;
        }

        if( arg_month < 1 || arg_month > 12 ){
            console.log("Invalid expiration month", arg_month);
            return;
        }

        arg_minute = arg_minute || 0;
        arg_second = arg_second || 0;

        const m_date = new Date(arg_year, arg_month-1, arg_day, arg_hour, arg_minute, arg_second);
        if( !isValidDate(m_date) )
        {
            console.log("Invalid expiration date", m_date);
            return;
        }

        this._expiration_date = m_date;
        // this._expiration_verify_interval = setInterval(this.verifyExpiration, 1000);
    }

    // verifyExpiration()
    // {
    //     const vApi = this.apiVersion();
    //
    //     console.log("Verificando se a API", vApi, "está expirada...");
    //     if( this.isExpired() )
    //     {
    //         console.log("API", vApi, "está SIM expirada desde", this._expiration_date);
    //         descriptor.listeners().forEach( listener =>
    //         {
    //             if( listener.vApi === vApi )
    //             {
    //                 this.unregisterRoute( this.normalizedRouteName(listener) );
    //             }
    //         });
    //
    //         clearInterval(this._expiration_verify_interval);
    //         this._expiration_verify_interval = null;
    //     }
    //     else{
    //         console.log("API", vApi, "não está expirada.");
    //     }
    // }

    isExpired()
    {
        return ( this._expiration_date !== null &&
                 new Date() > this._expiration_date );
    }

    /**
     * Exigências para uso da classe (auth requirements).
     * Ex: Dispositivo deve estar autenticado.
     */
    authRequirements()
    {
        return this._auth_requirements;
    }

    /**
     * @method registerRoute
     * Registra uma rota que será escutada pelo websocket.
     * @param arg.route[obrigatório]: Define a URI a ser chamada pelos clientes (ex: auth/auth-device).
     * @param arg.requires[obrigatório]: Define as regras para utilização desta chamada de API (ex: dispositivo deve estar autenticado).
     * @param arg.callback[obrigatório]: Função/método a ser executado para tratar a requisição feita pelo cliente.
     * @param arg.client_callback_key[obrigatório]: Nome do callback que será devolvido ao cliente para que o mesmo o trate.
     */
    registerRoute(arg)
    {
        let auth_requirements = arg.requires;

        if ( typeof auth_requirements === 'number' ) {
            auth_requirements = [auth_requirements];
        } // transforms number flag into array

        if ( !Array.isArray(auth_requirements) ) {
            throw new Error(`Route error on '${arg.route}': Please specify [requires.noAuth | requires.hostAuth | requires.userAuth].`);
        }

        descriptor.addListener({
            vApi: this.apiVersion(),
            route: this.normalizedRouteName(arg),
            socketIOEvent: arg.socketIOEvent || false,
            requires: auth_requirements,
            callback: arg.callback,
            client_callback_key: arg.client_callback_key || ''
        });
    }

    /**
     * @method unregisterRoute
     * Remove o registro de uma rota escutada pelo websocket. Utilizada quando uma API expira.
     * @param arg.route[obrigatório]: Define a URI a ser chamada pelos clientes (ex: auth/auth-device).
     */
    unregisterRoute( arg)
    {
        descriptor.removeListener(arg);
    }

    normalizedRouteName(arg)
    {
        const vApi = this.apiVersion();
        return arg.socketIOEvent === true ? arg.route : `api-${vApi}/${arg.route}`
    }

    initRoutes()
    {
        throw new Error("Parsers must rewrite 'initRoutes' method to register their own routes.");
    }
}

function isValidDate(d){
    return d instanceof Date && !isNaN(d);
}

module.exports = ParserAbstract;
