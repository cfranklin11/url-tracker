'use strict';

var jwt, config, jwtHelper;

jwt = require('jsonwebtoken');
config = require('../config/auth.js');

jwtHelper = {
  create: function(req, res, next) {
    var token;

    req.jwt = jwt.sign(req.action,
      config.secret,
      {expiresIn: 30}
    );
    next();
  },

  check: function(req, res, next) {
    var token;

    token = req.body.token || req.query.token || req.headers['x-access-token'];

    if (token) {
      jwt.verify(token, config.secret, function(err, decoded) {
        if (err) {
          return res.json({success: false, message: 'Failed to authenticate token.'});
        } else {
          return next();
        }
      });

    } else {
      return res.status(403).send({
          success: false,
          message: 'No token provided.'
      });
    }
  }
};

module.exports = jwtHelper;