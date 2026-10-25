/**
 * Pure JavaScript shim for react-native-background-timer.
 * Uses globalThis timer APIs to prevent recursive call stack loops.
 */

const _setTimeout = (typeof globalThis !== 'undefined' ? globalThis.setTimeout : setTimeout).bind(globalThis || undefined);
const _clearTimeout = (typeof globalThis !== 'undefined' ? globalThis.clearTimeout : clearTimeout).bind(globalThis || undefined);
const _setInterval = (typeof globalThis !== 'undefined' ? globalThis.setInterval : setInterval).bind(globalThis || undefined);
const _clearInterval = (typeof globalThis !== 'undefined' ? globalThis.clearInterval : clearInterval).bind(globalThis || undefined);

const BackgroundTimer = {
  setTimeout: (fn, ms = 0) => _setTimeout(fn, ms),
  clearTimeout: (id) => _clearTimeout(id),
  setInterval: (fn, ms = 0) => _setInterval(fn, ms),
  clearInterval: (id) => _clearInterval(id),
  runBackgroundTimer: (fn, ms = 0) => _setInterval(fn, ms),
  stopBackgroundTimer: () => {},
  start: () => {},
  stop: () => {},
};

module.exports = BackgroundTimer;
module.exports.default = BackgroundTimer;
