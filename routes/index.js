'use strict';

var express, router;

express = require('express');
router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', {title: 'Express'});
});
router.get('/crawl',
  //crawler.crawl,
  function(req, res, next) {
    res.json(req.urls);
});

module.exports = router;
