// Preload (node --import) used by poc-serve.mjs: forces every server.listen(port[, cb]) in the
// process onto 127.0.0.1, so a script that would bind all interfaces (apps/web/scripts/serve.mjs,
// finding SEC-04) can be tested without exposing it to the LAN.
import net from 'node:net';

const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  if (typeof args[0] === 'number' || (typeof args[0] === 'string' && /^\d+$/.test(args[0]))) {
    if (typeof args[1] !== 'string') args.splice(1, 0, '127.0.0.1');
    else args[1] = '127.0.0.1';
  } else if (args[0] && typeof args[0] === 'object' && !('path' in args[0])) {
    args[0] = { ...args[0], host: '127.0.0.1' };
  }
  return listen.apply(this, args);
};
