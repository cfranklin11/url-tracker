'use strict';

var express, router, crawler, sheets, jwtHelper, postmarkHelper;

express = require('express');
router = express.Router();
crawler = require('../middleware/crawler.js');
sheets = require('../middleware/sheets-helper.js');
jwtHelper = require('../middleware/jwt-helper.js');
postmarkHelper = require('../middleware/postmark-helper.js')

router.get('/', function(req, res, next) {
  res.render('index', {
    title: 'Express',
    docId: req.query.id // Auto-fill text input with 'id' URL parameter
  });
});

// Start by creating a Javascript Web Tokein (JWT) and sending it to client
router.post('/api/token',
  jwtHelper.create, //Creates JWT
  function(req, res, next) {
    res.json({
      success: true,
      token: req.jwt,
      action: 'crawl'
    });
});

// With success above, proceed to crawl website(s), record info
// in Google Sheets, then send e-mail notification if there's new info
router.post('/api/crawl',
  jwtHelper.check, //Verifies JWT
  sheets.getSpreadsheet, //Reads existing info from Google Sheets
  crawler.checkUrls, //Crawls website(s)
  sheets.getSpreadsheet, //Writes new info to Google Sheets
  postmarkHelper.sendNotification, //Sends e-mail notification
  function(req, res, next) {
    res.redirect('/');
});

module.exports = router;
