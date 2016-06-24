var jwt, config, jwtHelper;

jwt = require('jsonwebtoken');
config = require('../config/auth.js')

jwtHelper = {
    create: function(req, res, next) {
      var token;

      token = jwt.sign(req.action,
        config.secret,
        {expiresIn: 30}
      );
      next();
  };
};

module.exports = jwtHelper;