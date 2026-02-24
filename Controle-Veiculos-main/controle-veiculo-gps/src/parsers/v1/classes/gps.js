'use strict';
const Parser = require('../parser');
const db = require('../../../helpers/mysql');
const fs = require('fs');
const stats_dir = '/stats';
function day_str(ts) {
    const d = new Date(ts);
    return d.getFullYear().toString() + (d.getMonth() + 1).toString().padStart(2, '0') + d.getDate().toString().padStart(2, '0');
}
function stats_file_for_day(day) {
    return stats_dir + '/gps_stats_' + day + '.json';
}
class GpsParser extends Parser {
    global_stats = {
        devices: new Set(),
        gps_count: 0,
        speed_sum: 0,
        temp_sum: 0,
        battery_sum: 0,
        speed_max: 0,
        temp_max: 0,
        battery_min: 100,
        all_devices: new Set(),
        all_gps_count: 0,
        all_speed_sum: 0,
        all_temp_sum: 0,
        all_battery_sum: 0,
        all_speed_max: 0,
        all_temp_max: 0,
        all_battery_min: 100,
        all_data: [],
    };
    constructor() {
        super();
        if (!fs.existsSync(stats_dir)) fs.mkdirSync(stats_dir, { recursive: true });
        const now = Date.now();
        const days = [];
        for (let i = 0; i < 7; ++i) days.push(day_str(now - i * 86400000));
        this.global_stats.all_data = [];
        for (const day of days) {
            const f = stats_file_for_day(day);
            if (fs.existsSync(f)) {
                try {
                    const d = JSON.parse(fs.readFileSync(f));
                    if (Array.isArray(d)) this.global_stats.all_data.push(...d);
                } catch (e) {}
            }
        }
        let last_gps = 0;
        setInterval(() => {
            const d = this.global_stats;
            const now = Date.now();
            d.all_data = d.all_data.filter(x => now - x.t < 604800000);
            d.all_devices = new Set(d.all_data.map(x => x.s));
            d.all_gps_count = d.all_data.length;
            d.all_speed_sum = d.all_data.reduce((a, x) => a + x.v, 0);
            d.all_temp_sum = d.all_data.reduce((a, x) => a + x.tp, 0);
            d.all_battery_sum = d.all_data.reduce((a, x) => a + x.b, 0);
            d.all_speed_max = d.all_data.reduce((a, x) => (x.v > a ? x.v : a), 0);
            d.all_temp_max = d.all_data.reduce((a, x) => (x.tp > a ? x.tp : a), 0);
            d.all_battery_min = d.all_data.reduce((a, x) => (x.b < a ? x.b : a), 100);
            const device_count = d.devices.size;
            const gps_count = d.gps_count;
            if (gps_count == last_gps) return;
            last_gps = gps_count;
            const avg_speed = gps_count ? (d.speed_sum / gps_count).toFixed(2) : 0;
            const avg_temp = gps_count ? (d.temp_sum / gps_count).toFixed(2) : 0;
            const avg_battery = gps_count ? (d.battery_sum / gps_count).toFixed(2) : 0;
            const all_device_count = d.all_devices.size;
            const all_gps_count = d.all_gps_count;
            const all_avg_speed = all_gps_count ? (d.all_speed_sum / all_gps_count).toFixed(2) : 0;
            const all_avg_temp = all_gps_count ? (d.all_temp_sum / all_gps_count).toFixed(2) : 0;
            const all_avg_battery = all_gps_count ? (d.all_battery_sum / all_gps_count).toFixed(2) : 0;
            const pct_gps = all_gps_count ? ((gps_count / all_gps_count) * 100).toFixed(1) : 0;
            const pct_devices = all_device_count ? ((device_count / all_device_count) * 100).toFixed(1) : 0;
            const msg1 = `24h: devices=${all_device_count} gps=${all_gps_count} avg_speed=${all_avg_speed} max_speed=${d.all_speed_max} avg_temp=${all_avg_temp} max_temp=${d.all_temp_max} avg_battery=${all_avg_battery} min_battery=${d.all_battery_min}`;
            const msg2 = `min: devices=${device_count} (${pct_devices}%) gps=${gps_count} (${pct_gps}%) avg_speed=${avg_speed} max_speed=${d.speed_max} avg_temp=${avg_temp} max_temp=${d.temp_max} avg_battery=${avg_battery} min_battery=${d.battery_min}`;
            const by_day = {};
            for (const x of d.all_data) {
                const day = day_str(x.t);
                if (!by_day[day]) by_day[day] = { day, devices: new Set(), gps: 0, speed_sum: 0, temp_sum: 0, battery_sum: 0, speed_max: 0, temp_max: 0, battery_min: 100 };
                const b = by_day[day];
                b.devices.add(x.s);
                b.gps++;
                b.speed_sum += x.v;
                b.temp_sum += x.tp;
                b.battery_sum += x.b;
                if (x.v > b.speed_max) b.speed_max = x.v;
                if (x.tp > b.temp_max) b.temp_max = x.tp;
                if (x.b < b.battery_min) b.battery_min = x.b;
            }
            const table = Object.values(by_day).map(b => ({
                day: b.day,
                devices: b.devices.size,
                gps: b.gps,
                avg_speed: b.gps ? (b.speed_sum / b.gps).toFixed(2) : 0,
                max_speed: b.speed_max,
                avg_temp: b.gps ? (b.temp_sum / b.gps).toFixed(2) : 0,
                max_temp: b.temp_max,
                avg_battery: b.gps ? (b.battery_sum / b.gps).toFixed(2) : 0,
                min_battery: b.battery_min,
            }));
            console.table(table);
            console.info('\x1b[36m%s\x1b[0m', msg1);
            console.info('\x1b[35m%s\x1b[0m', msg2);
            d.devices.clear();
            d.gps_count = 0;
            d.speed_sum = 0;
            d.temp_sum = 0;
            d.battery_sum = 0;
            d.speed_max = 0;
            d.temp_max = 0;
            d.battery_min = 100;
            try {
                const today = day_str(now);
                fs.writeFileSync(stats_file_for_day(today), JSON.stringify(d.all_data.filter(x => day_str(x.t) === today)));
            } catch (e) {}
        }, 60000);
        this.handle_gps = async (arg_fd, arg_cbkey, r) => {
            arg_fd;
            arg_cbkey;
            if (!r || typeof r !== 'object') return console.error('Invalid GPS data received:', r);
            const servidor_id = parseInt(r.servidor_id) || 0;
            const debug = r.debug || servidor_id === 1354729156;
            const latitude = typeof r.latitude === 'number' ? r.latitude : 0;
            const longitude = typeof r.longitude === 'number' ? r.longitude : 0;
            const velocidade = typeof r.velocidade === 'number' ? r.velocidade : 0;
            const temperatura = typeof r.temperatura === 'number' ? r.temperatura : 0;
            const bateria = typeof r.bateria === 'number' ? r.bateria : 0;
            const stats = `servidor_id=${servidor_id} latitude=${latitude} longitude=${longitude} velocidade=${velocidade} temperatura=${temperatura} bateria=${bateria}`;
            if (debug) console.info('\x1b[35m%s\x1b[0m', stats);
            if (latitude === 0 && longitude === 0) return console.warn(`${stats} - Skipping GPS data with invalid coordinates`, r);
            this.global_stats.devices.add(servidor_id);
            this.global_stats.gps_count++;
            this.global_stats.speed_sum += velocidade;
            this.global_stats.temp_sum += temperatura;
            this.global_stats.battery_sum += bateria;
            if (velocidade > this.global_stats.speed_max) this.global_stats.speed_max = velocidade;
            if (temperatura > this.global_stats.temp_max) this.global_stats.temp_max = temperatura;
            if (bateria < this.global_stats.battery_min) this.global_stats.battery_min = bateria;
            this.global_stats.all_data.push({ t: Date.now(), s: servidor_id, v: velocidade, tp: temperatura, b: bateria });
            const args = [servidor_id, latitude, longitude, velocidade, temperatura, bateria];
            try {
                const result = await db.call('gps_data_insert', args);
                if (!result || !Array.isArray(result) || !result[0]) return console.warn(`${stats} - Invalid response from database: ${result}`);
                const rr = result[0];
                const device_exe_version = rr._device_exe_version || '-';
                const device_name = rr._device_name || '-';
                const equipe_nome = rr._equipe_nome || '-';
                const lat = latitude.toFixed(6);
                const lon = longitude.toFixed(6);
                let bash_speed_color = `\x1b[34m`;
                if (velocidade > 100) bash_speed_color = `\x1b[31m`;
                else if (velocidade > 80) bash_speed_color = `\x1b[33m`;
                let bash_temp_color = `\x1b[34m`;
                if (temperatura < 30) bash_temp_color = `\x1b[32m`;
                else if (temperatura <= 50) bash_temp_color = `\x1b[33m`;
                else bash_temp_color = `\x1b[31m`;
                let bash_battery_color = `\x1b[34m`;
                if (bateria > 80) bash_battery_color = `\x1b[32m`;
                else if (bateria > 50) bash_battery_color = `\x1b[33m`;
                else bash_battery_color = `\x1b[31m`;
                const equipInfo = `GPS #${equipe_nome}`.padEnd(20);
                const coordInfo = `${lat}, ${lon}`;
                const speedInfo = `${bash_speed_color}${velocidade.toFixed(2)}km/h\x1b[0m`;
                const tempInfo = `${bash_temp_color}${temperatura.toFixed(2)}°\x1b[0m`;
                const batteryInfo = `${bash_battery_color}${bateria.toFixed(2)}%\x1b[0m`;
                const versionInfo = `${device_exe_version.padEnd(15)}`;
                const deviceInfo = `${device_name.padEnd(15)}`;
                const logMessage = [equipInfo, coordInfo, speedInfo, tempInfo, batteryInfo, versionInfo, deviceInfo].join(' | ');
                if (debug > 0) console.info('\x1b[35m%s\x1b[0m', logMessage);
            } catch (error) {
                if (debug) console.error(`${stats} - Error processing GPS data: ${error}`);
            }
        };
    }
    initRoutes() {
        this.registerRoute({
            route: 'gps',
            requires: this.authRequirements().noAuthRequired,
            callback: this.handle_gps,
            client_callback_key: 'gps-result',
        });
    }
}
module.exports = GpsParser;
