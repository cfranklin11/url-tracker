'use strict';

var GoogleSpreadsheet, async, auth, crawler, sheetsHelper;

GoogleSpreadsheet = require('google-spreadsheet');
async = require('async');
auth = require('../config/auth.js');
crawler = require('./crawler.js');

sheetsHelper = {

  getSpreadsheet: function(req, res, next) {
    var doc;

    doc = new GoogleSpreadsheet('1mngkbi1Qcllg6VFwX24qHPk9c9x35koCv_K-gVdMq4I');
    sheetsHelper.setAuth(req, res, next, doc);
  },

  setAuth: function(req, res, next, doc) {
    var creds_json;

    creds_json = {
      client_email: auth.client_email,
      private_key: auth.private_key
    };

    doc.useServiceAccountAuth(creds_json, function(doc) {
      sheetsHelper.getWorksheets(req, res, next, doc);
    });
  },

  getWorksheets: function(req, res, next, doc) {
    doc.getInfo(function(err, data) {
      var sheet;

      if (err) {
        console.log(err);
        return;
      }

      sheet = data.worksheets[0];

      if (req.updateUrls) {
        sheetsHelper.updateUrls(req, res, next, sheet);
      } else {
        sheetsHelper.createUrls(req, res, next, sheet);
      }
    });
  },

  updateUrls: function(req, res, next, sheet) {
    sheet.getRows(
      {
        offset: 1,
        orderby: 'col2'
      },
      function(err, rows) {
        var test;

        test = [
          {url: 'stuff.com', status: 404},
          {url: 'morestuff.com', status: 404},
          {url: 'evenmorestuff.com', status: 404},
          {url: 'stillmorestuff.com', status: 404}
        ];

        rows = test;
        rows.save();
        next();
      });
  },

  createUrls: function(req, res, next, sheet) {
    sheet.getRows(
      {
        offset: 1,
        orderby: 'col2'
      },
      function(err, rows) {
        var pagesCrawled;

        if (err) {
          console.log(err);
          return;
        }

        if (!req.pagesCrawled) {
          console.log("Error: Couldn't find pagesCrawled");
          return;
        } else {
          pagesCrawled = req.pagesCrawled;


        }

      });
  }
};

module.exports = sheetsHelper;