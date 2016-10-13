'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.checkToken = exports.createToken = undefined;

var _jsonwebtoken = require('jsonwebtoken');

var _jsonwebtoken2 = _interopRequireDefault(_jsonwebtoken);

var _auth = require('../config/auth.js');

var _auth2 = _interopRequireDefault(_auth);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function createToken(req, res, next) {
  req.jwt = _jsonwebtoken2.default.sign({ action: 'crawl' }, _auth2.default.secret, { expiresIn: 30 });
  next();
}

function checkToken(req, res, next) {
  var token = req.body.token || req.query.token || req.headers['x-access-token'];

  // If token exists and is valid, start crawling the website,
  // otherwise return success = false to API call, preventing redundant
  // calls creating multiple, parallel crawling processes
  if (token) {
    _jsonwebtoken2.default.verify(token, _auth2.default.secret, function (err, decoded) {
      if (err) {
        res.json({
          success: false,
          message: 'Failed to authenticate token.'
        });
      } else {
        next();
      }
    });
  } else {
    res.status(403).send({
      success: false,
      message: 'No token provided.'
    });
  }
}

exports.createToken = createToken;
exports.checkToken = checkToken;