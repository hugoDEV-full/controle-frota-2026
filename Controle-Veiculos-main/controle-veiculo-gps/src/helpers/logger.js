'use strict';
let Logger = function () {};
let DEBUG = false;
let APP_ID;
Logger.init = async function () {
    APP_ID = process.env.GPS_APP_NAME || '';
    if (!APP_ID) throw new Error('GPS_APP_NAME not set');
    DEBUG = process.env.NODE_ENV !== 'production';
    if (DEBUG) {
        Logger.yellow('DEBUG is enabled');
    } else {
        Logger.blue('DEBUG is disabled');
    }
};
const colors = {
    Reset: '\x1b[0m',
    Bright: '\x1b[1m',
    Dim: '\x1b[2m',
    Underscore: '\x1b[4m',
    Blink: '\x1b[5m',
    Reverse: '\x1b[7m',
    Hidden: '\x1b[8m',
    fg: {
        Black: '\x1b[30m',
        Red: '\x1b[31m',
        Green: '\x1b[32m',
        Yellow: '\x1b[33m',
        Blue: '\x1b[34m',
        Magenta: '\x1b[35m',
        Cyan: '\x1b[36m',
        White: '\x1b[37m',
        Crimson: '\x1b[38m',
    },
    bg: {
        Black: '\x1b[40m',
        Red: '\x1b[41m',
        Green: '\x1b[42m',
        Yellow: '\x1b[43m',
        Blue: '\x1b[44m',
        Magenta: '\x1b[45m',
        Cyan: '\x1b[46m',
        White: '\x1b[47m',
        Crimson: '\x1b[48m',
        Gray: '\x1b[100m',
    },
};
Logger.blue = function (arg_str, arg_tag) {
    stdout(colors.bg.Blue, colors.fg.White, arg_tag, this.prefix, arg_str);
};
Logger.red = function (arg_str, arg_tag) {
    stdout(colors.bg.Red, colors.fg.Yellow, arg_tag, this.prefix, arg_str);
};
Logger.green = function (arg_str, arg_tag) {
    stdout(colors.bg.Green, colors.fg.Black, arg_tag, this.prefix, arg_str);
};
Logger.yellow = function (arg_str, arg_tag) {
    stdout(colors.bg.Yellow, colors.fg.Black, arg_tag, this.prefix, arg_str);
};
Logger.gray = function (arg_str, arg_tag) {
    stdout(colors.bg.Gray, colors.fg.White, arg_tag, this.prefix, arg_str);
};
Logger.magenta = function (arg_str, arg_tag) {
    stdout(colors.bg.Magenta, colors.fg.Black, arg_tag, this.prefix, arg_str);
};
Logger.debug = function (arg_str, arg_tag, arg_force = false) {
    const canSend = arg_force || DEBUG;
    if (!canSend) return;
    const tag = _tag(arg_tag, arg_str);
    stdout(colors.bg.Crimson, colors.fg.White, tag, this.prefix, arg_str);
};
Logger.log = function (arg_str, arg_tag) {
    const tag = _tag(arg_tag, arg_str);
    stdout(colors.bg.Gray, colors.fg.White, tag, this.prefix, arg_str);
};
Logger.info = function (arg_str, arg_tag) {
    const tag = _tag(arg_tag, arg_str);
    stdout(colors.bg.Green, colors.fg.Black, tag, this.prefix, arg_str);
};

Logger.warning = Logger.warn = function (arg_str, arg_tag) {
    const tag = _tag(arg_tag, arg_str);
    stdout(colors.bg.Yellow, colors.fg.Black, tag, this.prefix, arg_str);
};

Logger.danger = function (arg_str, arg_tag) {
    const tag = _tag(arg_tag, arg_str);
    stdout(colors.bg.Red, colors.fg.Yellow, tag, this.prefix, arg_str);
};
Logger.error = function (arg_str, arg_tag) {
    const tag = _tag(arg_tag, arg_str);
    stdout(colors.bg.Red, colors.fg.Yellow, tag, this.prefix, arg_str);
};

Logger.success = function (arg_str, arg_tag) {
    const tag = _tag(arg_tag, arg_str);
    stdout(colors.bg.Green, colors.fg.Black, tag, this.prefix, arg_str);
};

Logger.fatal = async function (arg_str, arg_tag) {
    const tag = _tag(arg_tag, arg_str);
    stdout(colors.bg.Red, colors.fg.Yellow, tag, this.prefix, arg_str);
    console.log(new Error().stack);
    await new Promise(resolve => setTimeout(resolve, 2000));
    process.exit(-1);
};
function stdout(arg_bg, arg_fg, arg_tag, arg_prefix, arg_str) {
    let str = null;
    if (typeof arg_str === 'object') str = JSON.stringify(arg_str);
    else str = arg_str;
    let output = '';
    if (arg_tag) output += arg_tag + ' ';
    let caller = new Error().stack;
    caller = caller.split('\n')[3];
    caller = caller.match(/([A-Za-z_-]+\.js)\:([0-9]+)/);
    const callerfile = caller ? caller[1] : '';
    const callerline = caller ? caller[2] : '';
    if (arg_prefix) output += arg_prefix;
    else output += callerfile;
    output += ':' + callerline + ' ';
    output += str;
    const logline = arg_bg + arg_fg + output + colors.Reset;
    console.log(logline.trim());
}
function _tag(arg_tag) {
    return arg_tag ? '[' + arg_tag + ']' : '';
}
module.exports = Logger;
