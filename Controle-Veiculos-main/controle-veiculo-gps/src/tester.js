('use strict');
const sio = require('socket.io-client');
function test() {
    let REQ_ID = 1;
    let DEVICE_ID = 0;
    const is_dev = process.env.NODE_ENV !== 'production';
    const port = is_dev ? process.env.GPS_PORT_DEV : process.env.GPS_PORT;
    console.log('testing', port);
    const socket = sio(`http://localhost:${port}`);
    const send = (ev, data, callback) => {
        data = data || {};
        data.REQ_ID = REQ_ID++;
        console.log('send', ev, data);
        socket.emit(ev, data, callback);
    };
    const auth = imei => {
        send(
            'api-v1/auth-device',
            {
                IMEI: imei,
            },
            (err, res) => {
                console.log('auth-device', err, res);
            }
        );
    };
    const gps = () => {
        if (!DEVICE_ID) return console.log('no device id');
        const data = {
            servidor_id: DEVICE_ID,
            latitude: 123.456,
            longitude: 789.123,
            velocidade: 10,
            temperatura: 20,
            bateria: 50,
        };
        send('api-v1/gps', data);
    };
    socket.on('connect', () => {
        console.log('tester connected');
        const GPS_TEST_IMEI = process.env.GPS_TEST_IMEI;
        setTimeout(() => auth(GPS_TEST_IMEI), 1000);
    });
    socket.on('auth-device-result', data => {
        DEVICE_ID = data.DATA.DEVICE_ID;
        console.log('auth-device-result', data);
        gps();
    });
    socket.on('gps-result', data => {
        console.log('gps-result', data);
    });
}
module.exports = test;
