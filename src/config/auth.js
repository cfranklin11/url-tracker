'use strict';

import path from 'path';
import fs from 'fs';
let env = {};
let envFile;

if (!process.env.client_email || !process.env.private_key) {
  envFile = path.join(__dirname, '../../src/config/env.json');
}

if (fs.existsSync(envFile)) {
  env = fs.readFileSync(envFile, 'utf-8');
  env = JSON.parse(env);
  Object.keys(env).forEach(function(key) {
    process.env[key] = env[key];
  });
}

const configAuth = {
  client_email: process.env.client_email,
  private_key: process.env.private_key.replace(/_/g, ' '),
  secret: process.env.secret,
  doc_id: process.env.doc_id,
  postmark_key: process.env.postmark_key
};

export default configAuth;
