'use strict';

var express, router, crawler, sheets, jwtHelper;

express = require('express');
router = express.Router();
crawler = require('../middleware/crawler.js');
sheets = require('../middleware/sheets-helper.js');
jwtHelper = require('../middleware/jwt-helper.js');

router.param('action', function(req, res, next, action) {
  req.action = action;
  next();
});

router.get('/', function(req, res, next) {
  res.render('index', {title: 'Express'});
});

router.post('/api/token/:action',
  jwtHelper.create,
  function(req, res, next) {
    res.json({
      success: true,
      token: req.jwt,
      action: req.action
    });
});
router.post('/api/update',
  jwtHelper.check,
  sheets.getSpreadsheet,
  crawler.crawlUrls,
  function(req, res, next) {
    res.redirect('/');
});
router.post('/api/crawl',
  jwtHelper.check,
  crawler.crawlUrls,
  sheets.getSpreadsheet,
  function(req, res, next) {
    res.redirect('/');
});

module.exports = router;
