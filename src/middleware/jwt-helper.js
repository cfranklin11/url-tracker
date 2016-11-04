const jwt = require('jsonwebtoken');
const auth = require('../config/auth.js');

function createToken(req, res, next) {
  req.jwt = jwt.sign({action: 'crawl'},
    auth.secret,
    {expiresIn: 30}
  );
  next();
}

function checkToken(req, res, next) {
  const token =
    req.body.token || req.query.token || req.headers['x-access-token'];

  // If token exists and is valid, start crawling the website,
  // otherwise return success = false to API call, preventing redundant
  // calls creating multiple, parallel crawling processes
  if (token) {
    jwt.verify(token, auth.secret, function(err, decoded) {
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

module.exports = {createToken, checkToken};
