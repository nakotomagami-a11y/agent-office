// Required via NODE_OPTIONS=--require before next build on Windows CI.
// Several paths in C:\Users\runneradmin\... cannot be enumerated:
//   EPERM  – NTFS junction points (Application Data → AppData\Roaming)
//   EACCES – WindowsApps execution aliases (ActionsMcpHost.exe etc.)
// webpack/glob treat these as fatal build errors. Returning [] lets the
// build continue — these system paths are never needed by the bundler.
'use strict';
const fs = require('fs');

const _readdir = fs.readdir.bind(fs);
fs.readdir = function (path, opts, cb) {
  if (typeof opts === 'function') { cb = opts; opts = undefined; }
  function wrap(err, result) {
    if (err && (err.code === 'EPERM' || err.code === 'EACCES')) return cb(null, []);
    cb(err, result);
  }
  return opts !== undefined ? _readdir(path, opts, wrap) : _readdir(path, wrap);
};

const _readdirSync = fs.readdirSync.bind(fs);
fs.readdirSync = function (path, opts) {
  try { return _readdirSync(path, opts); }
  catch (err) { if (err.code === 'EPERM' || err.code === 'EACCES') return []; throw err; }
};

if (fs.promises && fs.promises.readdir) {
  const _readdirP = fs.promises.readdir.bind(fs.promises);
  fs.promises.readdir = async function (path, opts) {
    try { return await _readdirP(path, opts); }
    catch (err) { if (err.code === 'EPERM' || err.code === 'EACCES') return []; throw err; }
  };
}
