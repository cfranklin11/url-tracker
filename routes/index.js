'use strict';

var express, router, crawler, sheets;

express = require('express');
router = express.Router();
crawler = require('../middleware/crawler.js');
sheets = require('../middleware/sheets-helper.js');

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
      token: req.jwtToken,
      action: req.action
    });
});
router.post('/api/update',
  sheets.getSpreadsheet,
  crawler.crawlUrls,
  function(req, res, next) {
    res.redirect('/');
});
router.post('/api/crawl',
  crawler.crawlUrls,
  sheets.getSpreadsheet,
  function(req, res, next) {
    res.redirect('/');
});

module.exports = router;
