const logger = require('./helpers/logger');
let connected_clients = {};
module.exports = {
    append: arg_sid => {
        if (connected_clients.hasOwnProperty(arg_sid)) {
            logger.warning(`Cliente ${arg_sid} ja esta na lista.`);
            return;
        }
        connected_clients[arg_sid] = {
            private: {
                device_auth_status: false,
                user_auth_status: false,
            },
            public: {},
        };
    },
    findByTeamId(arg_team_id) {
        let list = [];
        Object.keys(connected_clients).forEach(sock_id => {
            const client = connected_clients[sock_id];
            if (client.public && client.public.team && client.public.team.id === arg_team_id) {
                list.push(client.public);
            }
        });

        return list;
    },
    remove: arg_client => {
        if (!connected_clients[arg_client]) return;
        connected_clients[arg_client] = null;
        delete connected_clients[arg_client];
    },
    list: () => connected_clients,
    setAuthHostStatus: (arg_client, arg_status) => {
        if (!connected_clients[arg_client]) return;
        connected_clients[arg_client].private.device_auth_status = arg_status;
    },
    getAuthHostStatus: arg_client => (connected_clients[arg_client] ? connected_clients[arg_client].private.device_auth_status : undefined),
    setAuthUserStatus: (arg_client, arg_status) => {
        if (!connected_clients[arg_client]) return;
        connected_clients[arg_client].private.user_auth_status = arg_status;
    },
    getAuthUserStatus: arg_client => {
        if (!connected_clients[arg_client]) {
            logger.warning(`Cliente ${arg_client} nao encontrado.`);
            return;
        }
        return connected_clients[arg_client].private.user_auth_status;
    },
    setPublicData: (arg_client, arg_key, arg_data) => {
        if (!connected_clients[arg_client]) return;
        if (!connected_clients[arg_client].public) {
            connected_clients[arg_client].public = {};
        }
        if (!connected_clients[arg_client].public.hasOwnProperty(arg_key)) {
            connected_clients[arg_client].public[arg_key] = {};
        }
        connected_clients[arg_client].public[arg_key] = arg_data;
    },
};
