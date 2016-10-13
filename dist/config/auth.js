'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var env = {};
var envFile = void 0;

if (!process.env.client_email || !process.env.private_key) {
  envFile = _path2.default.join(__dirname, '../../src/config/env.json');
}

if (_fs2.default.existsSync(envFile)) {
  env = _fs2.default.readFileSync(envFile, 'utf-8');
  env = JSON.parse(env);
  Object.keys(env).forEach(function (key) {
    process.env[key] = env[key];
  });
}

var configAuth = {
  client_email: process.env.client_email,
  private_key: process.env.private_key.replace(/_/g, ' '),
  secret: process.env.secret,
  doc_id: process.env.doc_id,
  postmark_key: process.env.postmark_key
};

exports.default = configAuth;