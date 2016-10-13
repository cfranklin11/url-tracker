import express from 'express';
const router = express.Router();
import checkUrls from '../middleware/crawler.js';
import getSpreadsheet from '../middleware/sheets-helper.js';
import {createToken, checkToken} from '../middleware/jwt-helper.js';
import sendNotification from '../middleware/postmark-helper.js';

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
  getSpreadsheet, // Reads existing info from Google Sheets
  checkUrls, // Crawls website(s)
  getSpreadsheet, // Writes new info to Google Sheets
  sendNotification, // Sends e-mail notification
  function(req, res, next) {
    res.redirect('/');
  }
);

export default router;
