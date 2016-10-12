'use strict';

var jwt, auth, jwtHelper;

jwt = require('jsonwebtoken');
auth = require('../config/auth.js');

jwtHelper = {
  create: function(req, res, next) {
    var token;

    req.jwt = jwt.sign({action: 'crawl'},
      auth.secret,
      {expiresIn: 30}
    );
    next();
  },

  check: function(req, res, next) {
    var token;

    token = req.body.token || req.query.token || req.headers['x-access-token'];

    // If token exists and is valid, start crawling the website,
    // otherwise return success = false to API call, preventing redundant
    // calls creating multiple, parallel crawling processes
    if (token) {
      jwt.verify(token, auth.secret, function(err, decoded) {
        if (err) {
          return res.json({
            success: false,
            message: 'Failed to authenticate token.'
          });

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