'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _crawler = require('../middleware/crawler.js');

var _crawler2 = _interopRequireDefault(_crawler);

var _sheetsHelper = require('../middleware/sheets-helper.js');

var _jwtHelper = require('../middleware/jwt-helper.js');

var _postmarkHelper = require('../middleware/postmark-helper.js');

var _postmarkHelper2 = _interopRequireDefault(_postmarkHelper);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var router = _express2.default.Router();


router.get('/', function (req, res, next) {
  res.render('index', {
    title: 'Express',
    docId: req.query.id // Auto-fill text input with 'id' URL parameter
  });
});

// Start by creating a Javascript Web Tokein (JWT) and sending it to client
router.post('/api/token', _jwtHelper.createToken, // Creates JWT
function (req, res, next) {
  res.json({
    success: true,
    token: req.jwt,
    action: 'crawl'
  });
});

// With success above, proceed to crawl website(s), record info
// in Google Sheets, then send e-mail notification if there's new info
router.post('/api/crawl', _jwtHelper.checkToken, // Verifies JWT
_sheetsHelper.prepareToCrawl, // Reads existing info from Google Sheets
_crawler2.default, // Crawls website(s)
_sheetsHelper.processPageData, // Writes new info to Google Sheets
_postmarkHelper2.default, // Sends e-mail notification
function (req, res, next) {
  res.redirect('/');
});

exports.default = router;
//# sourceMappingURL=index.js.map