'use strict';

const api_version = 'v1';

let req_id = 1;
const sended = 0x1, received = 0x2, none = 0x3;
let socket;
let jsonPorKey = {};

$(document).ready( () =>
{
    const server_addr = window.location.hostname + ":4999";
    socket = io(server_addr);

    socket.on('connect', () => {
        addMessage(none, 'Connected to the server');
        $('form').removeClass('disabled').addClass('enabled');
    });
    socket.on('disconnect', () => {
        addMessage(none, 'Disconnected from the server');
        $('form').removeClass('enabled').addClass('disabled');
    });

    addMessage(none, "Opening connection to server (" + server_addr + ")...");

    //
    $('#btn-send').click(send);

    $('#btn-clear-logs').click( function(){
        $('#messages').html('');
    });

    $('#btn-automatic-auths').click( function()
    {
        $('#k').val('auth-device').trigger('change');
        setTimeout(send, 100);

        setTimeout( function(){
            $('#k').val('auth-user').trigger('change');
            setTimeout(send, 300);
        }, 500);
    });

    $('#v').keypress( (e) =>
    {
        if(e.which === 13) {
            send();
            e.preventDefault();
        }
    });

    //
    addOptions({
        '': [''],
        'Auth': [
            ['auth-device', {IMEI: '354136072366713', KEY: '354136072366713', TYPE: 3, PLATFORM: 'Android', OS: 2, OS_V: 'Pie', ARCH: 'ARM64', EXEC: 'SAU Celular', VERSION: 'v0.0.1', DIR: 'samu', TAG: 'unstable'}, 'auth-device-result'],
            ['auth-user', {LOGIN: "candre", PWD: "5ceb8a430ddc59953ef1127660ca263f", DEVICE_ID: 135468468}, 'auth-user-result'],
        ],
        'Dados da equipe': [
            ['dados-equipe/por-dispositivo', {DEVICE_ID: 1354727657}, 'dados-equipe-por-dispositivo-result'],
            ['dados-equipe/recuperar-status-atual', {EQUIPE_ID: 30090}, 'recuperar-status-equipe-result'],
            ['dados-equipe/alterar-status', {EQUIPE_ID: 30090, NOVO_STATUS: 26, OBSERVACAO: "Observação da equipe", USUARIO_ID: 1002, DEVICE_ID:1354727657}, 'alteracao-status-equipe-result'],
            ['dados-equipe/maca-retida', {EQUIPE_ID: 30303}, 'recuperar-maca-retida-result'],
        ],
        'Botoes p/ alteracao status': [
            ['botoes-status/recuperar', {}, 'recuperar-botoes-status-result'],
        ],
        'Ocorrencia': [
            ['ocorrencia/verificar', {EQUIPE_ID: 30090},  'verificar-ocorrencia-result'],
            ['ocorrencia/recuperar-dados', {CHAMADO_ID: 2}, 'recuperar-dados-ocorrencia-result'],
        ],
        'Segunda Regulacao': [
            ['segunda-regulacao/recuperar-opcoes-estados-consciencia', {}, 'recuperar-estados-consciencia-result'],
            ['segunda-regulacao/recuperar-opcoes-vias-aereas', {}, 'recuperar-vias-aereas-result'],
            ['segunda-regulacao/recuperar-opcoes-pulso', {}, 'recuperar-pulsos-result'],
            ['segunda-regulacao/recuperar-opcoes-exposicao', {}, 'recuperar-exposicao-result'],
            ['segunda-regulacao/salvar', {CHAMADO_ID: 2, EQUIPE_ID: 30090, EXAME_FISICO: {ESTADO_CONSCIENCIA: 4, VIAS_AEREAS_OXIGENACAO: 1, PULSO: 2, EXPOSICAO: 3}, EVOLUCAO_TRANSLADO: 'Paciente evoluiu bem, graças a Deus.', USUARIO_ID: 2, DEVICE_ID: 1354727657}, 'salvar-segunda-regulacao-result'],
            ['sinais-vitais/salvar', {CHAMADO_ID: 2, PAS: 10, PAD: 4, FC: 9, FR: 20, SATO2: 3, TEMPAX: 36, GLICEMIA: 14, GLASGOW: 12, RTS: 8, RTSP: 0, USUARIO_ID: 1002}, 'salvar-sinais-vitais-result'],
        ],
        'Formacao equipe': [
            ['formacao-equipe/recuperar-atual', {EQUIPE_ID: 30090}, 'recuperar-formacao-atual-equipe-result'],
            ['formacao-equipe/salvar', {EQUIPE_ID: 30090, INTEGRANTES: [10002,11065,11079], VEICULO_ID: 3, OXIGENIO: {CILINDRO_GRANDE_01: 10, CILINDRO_GRANDE_02: 12, CILINDRO_PORTATIL: 8, CILINDRO_RESERVA: 0, RESPIRADOR: 15, INCUBADORA: 10}, CIRCUITOS: 2, CFR: 1, USUARIO_ID: 1002, DEVICE_ID: 1354727657}, 'salvar-formacao-equipe-result'],
            ['formacao-equipe/dados-integrante', {MATRICULA: 'candre', CAMPO_IDX: 3}, 'recuperar-dados-integrante-result'],
            ['formacao-equipe/dados-veiculo', {PLACA: 'INV-0001'}, 'recuperar-dados-veiculo-result'],
        ],
        'Checklist Viatura': [
            ['checklist-viatura/recuperar-opcoes-externas', {}, 'recuperar-clvt-opcoes-externas-result'],
            ['checklist-viatura/recuperar-estados-externas', {}, 'recuperar-clvt-estados-externas-result'],
            ['checklist-viatura/recuperar-opcoes-ead', {}, 'recuperar-clvt-opcoes-ead-result'],
            ['checklist-viatura/recuperar-estados-ead', {}, 'recuperar-clvt-estados-ead-result'],
            ['checklist-viatura/recuperar-opcoes-pneus', {}, 'recuperar-clvt-opcoes-pneus-result'],
            ['checklist-viatura/recuperar-estados-pneus', {}, 'recuperar-clvt-estados-pneus-result'],
            ['checklist-viatura/recuperar-opcoes-higienizacao', {}, 'recuperar-clvt-opcoes-higienizacao-result'],
            ['checklist-viatura/verificar-credenciais-condutor', {MATRICULA: "candre", SENHA: "5ceb8a430ddc59953ef1127660ca263f"}, 'verificar-credenciais-condutor-result'],
            ['checklist-viatura/verificar-pendencias', {EQUIPE_ID: 30090, VEICULO_ID: 3}, 'verificar-pendencias-checklist-result'],
            ['checklist-viatura/salvar-finalizacao-pendencia', {CHECKLIST_ID: 2, CONDUTOR_UID: 4, HORA_FINAL: '19:06', KM_FINAL: 9999, OBS: 'Desculpa entregar depois da hora.'}, 'salvar-finalizacao-pendencia-clvt-result'],
            ['checklist-viatura/salvar', {EQUIPE_ID: 30090, VEICULO_ID: 3, HORA_INICIO: '07:00', KM_INICIO: 1000, HIGIENIZACAO: 3, NIVEL_COMBUSTIVEL: 76, NIVEL_OLEO: 80, OBS: 'Banco do motorista com problema no encosto.', USUARIO_ID: 3, PARTES_EXTERNAS: [{ID: 1, ESTADO: 3}, {ID: 8, ESTADO: 1}], EAD: [{ID: 8, ESTADO: 3}, {ID: 4, ESTADO: 1}], PNEUS: [{ID: 1, ESTADO: 2}, {ID: 2, ESTADO: 3}, {ID: 3, ESTADO: 3}, {ID: 4, ESTADO: 3}] }, 'salvar-clvt-result'],
        ],
        'Historico de ocorrencias': [
            ['historico-ocorrencias/recuperar', {EQUIPE_ID: 30090}, 'recuperar-historico-ocorrencias-result'],
        ],
        'Testes': [
            ['testes/teste1', {NOME: 'ANDRE'}, 'teste1-result'],
            ['testes/teste2', {NOME: 'GRAZI'}, 'teste2-result'],
            ['testes/teste3', {NOME: 'DANI'}, 'teste3-result'],
        ]
    });

    $('#k').change( function()
    {
        const key = $(this).find("option:selected").text();
        const json = jsonPorKey[key] || {};
        json.REQ_ID = req_id++;

        $('#v').val( JSON.stringify(json) );
    });
});

//
function send()
{
    const key = $('#k').val();
    const client_callback = $('#k option:selected').data('callback-key');
    const value = $('#v').val();
    if( !key || !value ) return;

    socket.emit(`api-${api_version}/${key}`, JSON.parse(value));

    addMessage(sended, '<b>' + key + '</b> <span style="color: gray; font-style: italic;">(callback: ' + client_callback + '</span>)<br />&nbsp;&nbsp;&nbsp;&nbsp;' + value);
}

function addMessage(arg_method, arg_message)
{
    const text = document.createElement('span');
    text.innerHTML = arg_message;

    const messages = document.getElementById('messages'),
          wrapper = document.getElementById('messages-wrapper');

    const li = document.createElement('li');
    li.appendChild(text);
    li.className = ( arg_method === sended ? 'sended' : ( arg_method === received ? 'received' : 'none' ) );

    messages.appendChild(li);
    wrapper.scrollTop = wrapper.scrollHeight;
}

function addOptions(obj)
{
    for(const i in obj) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = ( i || '-' );

        const options = obj[i];
        options.forEach( val =>
        {
            const sendToServerKey = val[0]; // auth-host
            const sendToServerJson = val[1]; // {imei: 123, ...}
            const clientCallback = val[2]; // auth-host-result

            const option = document.createElement('option');
            option.innerText = sendToServerKey || '';
            option.setAttribute('data-callback-key', clientCallback);
            optgroup.appendChild(option);

            // client callback
            socket.on( clientCallback, (r) => {
                addMessage(received, JSON.stringify(r) );
            });

            //
            jsonPorKey[sendToServerKey] = sendToServerJson;
        });

        document.getElementById('k').appendChild(optgroup);
    }
}