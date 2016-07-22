var http, logger, throng, config, app;

http = require('http');
logger = require('logfmt');
throng = require('throng');

config = require('./config');
app = require('./app');

http.globalAgent.maxSockets = Infinity;
throng(start, { workers: config.worker_concurrency });

function start() {
  logger.log({
    type: 'info',
    msg: 'starting worker',
    concurrency: config.concurrency
  });

  var instance = app(config);

  instance.on('ready', beginWork);
  process.on('SIGTERM', shutdown);

  function beginWork() {
    instance.on('lost', shutdown);
    instance.startScraping();
  }

  function shutdown() {
    logger.log({ type: 'info', msg: 'shutting down' });
    process.exit();
  }
}