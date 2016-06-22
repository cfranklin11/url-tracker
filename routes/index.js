'use strict';

var express, router, crawler, sheets;

express = require('express');
router = express.Router();
crawler = require('../middleware/crawler.js');
sheets = require('../middleware/sheetsHelper.js');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', {title: 'Express'});
});
router.post('/update',
  sheets.getSpreadsheet,
  crawler.crawlUrls,
  function(req, res, next) {
    res.redirect('/');
});
router.post('/crawl',
  crawler.crawlUrls,
  sheets.getSpreadsheet,
  function(req, res, next) {
    res.redirect('/');
});

module.exports = router;
