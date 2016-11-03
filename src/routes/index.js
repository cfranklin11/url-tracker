const express = require('express');
const router = express.Router();
const crawlPages = require('../middleware/crawler.js');
const {prepareToCrawl, processPageData} =
  require('../middleware/sheets-helper.js');
const {createToken, checkToken} = require('../middleware/jwt-helper.js');
const sendNotification = require('../middleware/postmark-helper.js');

router.get('/', function(req, res, next) {
  res.render('index', {
    title: 'Express',
    docId: req.query.id // Auto-fill text input with 'id' URL parameter
  });
});

// Start by creating a Javascript Web Tokein (JWT) and sending it to client
router.post('/api/token',
  createToken, // Creates JWT
  function(req, res, next) {
    res.json({
      success: true,
      token: req.jwt,
      action: 'crawl'
    });
  }
);

// With success above, proceed to crawl website(s), record info
// in Google Sheets, then send e-mail notification if there's new info
router.post('/api/crawl',
  checkToken, // Verifies JWT
  prepareToCrawl, // Reads existing info = require(Google Sheets
  crawlPages, // Crawls website(s)
  processPageData, // Writes new info to Google Sheets
  sendNotification, // Sends e-mail notification
  function(req, res, next) {
    res.redirect('/');
  }
);

module.exports = router;
