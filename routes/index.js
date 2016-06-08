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
router.get('/crawl',
  crawler.crawlUrls,
  function(req, res, next) {
    res.json(req.pagesCrawled);
});
router.get('/sheet',
  sheets.getUrls,
  crawler.checkUrls,
  function(req, res, next) {
    res.json(req.pagesCrawled);
});

module.exports = router;
