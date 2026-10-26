'use strict';

// Простой журнал: консоль + файл data/bot.log с ротацией на 2 МБ.

const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');

let logFile = null;
let verbose = false;
const MAX_SIZE = 2 * 1024 * 1024;

function init(file, options) {
  logFile = file;
  verbose = !!(options && options.debug);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_SIZE) {
      const old = file + '.1';
      try { fs.rmSync(old, { force: true }); } catch (e) { /* ignore */ }
      fs.renameSync(file, old);
    }
  } catch (e) { /* файл не критичен */ }
}

function format(value) {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack || value.message;
  return util.inspect(value, { depth: 3, breakLength: 140, colors: false });
}

function write(level, prefix, args) {
  const time = new Date().toISOString().slice(11, 19);
  const tag = prefix ? '[' + prefix + '] ' : '';
  const line = time + ' ' + level.toUpperCase().padEnd(5) + ' ' + tag + args.map(format).join(' ');
  console.log(line);
  if (logFile) {
    try { fs.appendFileSync(logFile, line + '\n', 'utf8'); } catch (e) { /* ignore */ }
  }
}

function make(prefix) {
  return {
    debug: function () { if (verbose) write('debug', prefix, Array.prototype.slice.call(arguments)); },
    info: function () { write('info', prefix, Array.prototype.slice.call(arguments)); },
    warn: function () { write('warn', prefix, Array.prototype.slice.call(arguments)); },
    error: function () { write('error', prefix, Array.prototype.slice.call(arguments)); }
  };
}

const root = make('');

module.exports = {
  init: init,
  debug: root.debug,
  info: root.info,
  warn: root.warn,
  error: root.error,
  child: make,
  isDebug: function () { return verbose; }
};
