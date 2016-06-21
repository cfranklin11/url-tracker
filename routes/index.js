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
router.get('/update',
  sheets.getSpreadsheet,
  crawler.crawlUrls,
  function(req, res, next) {
    res.json(req.pagesCrawled);
});
router.get('/crawl',
  crawler.crawlUrls,
  sheets.getSpreadsheet,
  function(req, res, next) {
    res.render('index', {title: 'Express'});
});

module.exports = router;
