'use strict';

var fs, env, envFile;

  fs = require('fs'),
  env = {},

if (!process.env.client_email || !process.env.private_key) {
  envFile = __dirname + 'env.json';
}

if (fs.existsSync(envFile)) {
  env = fs.readFileSync(envFile, 'utf-8');
  env = JSON.parse(env);
  Object.keys(env).forEach(function(key) {
    process.env[key] = env[key];
  });
}

module.exports = {
  client_email: process.env.client_email,
  private_key: process.env.private_key
};