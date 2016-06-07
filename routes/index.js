'use strict';

var express, router, crawler;

express = require('express');
router = express.Router();
crawler = require('../middleware/crawler.js');
sheets = require('../middleware/sheetsHelper.js');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', {title: 'Express'});
});
router.get('/crawl',
  crawler.start,
  function(req, res, next) {
    res.json(req.pagesCrawled);
});
router.get('/sheet',
  sheets,
  function(req, res, next) {
    res.render('index');
});

module.exports = router;
