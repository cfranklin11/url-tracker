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

    doc.useServiceAccountAuth(creds_json, function() {
      sheetsHelper.getWorksheets(req, res, next, doc);
    });
  },

  getWorksheets: function(req, res, next, doc) {
    doc.getInfo(function(err, data) {
      var sheet, urlArray;

      if (err) {
        console.log(err);
        return;
      }

      if (req.pagesCrawled) {
        sheet = data.worksheets[1];
        urlArray = req.pagesCrawled;
        sheetsHelper.addRows(next, sheet, urlArray);
      } else {
        sheet = data.worksheets[0];
        sheetsHelper.updateUrls(req, res, next, sheet);
      }
    });
  },

  updateUrls: function(req, res, next, sheet) {
    var pagesToCrawl, thisRow;

    pagesToCrawl = [];

    sheet.getRows(
      {
        offset: 1,
        orderby: 'col2'
      },
      function(err, rows) {
        var i;

        if (err) {
          console.log(err);
          return next();
        }

        for (i = 0; i < rows.length; i++) {
          thisRow = rows[i];

          pagesToCrawl.push({
            url: thisRow.url,
            status: thisRow.status
          });
        }

        req.pagesToCrawl = pagesToCrawl;
        return next();
    });
  },

  createUrls: function(req, res, next, sheet) {
    sheetsHelper.addRows(next, sheet, req.pagesCrawled);
  },

  addRows: function(next, sheet, array) {
    var thisArray, thisRow;

    console.log('ADD ROWS');

    thisArray = array.slice(0);

    (function appendRow() {
      thisRow = thisArray.shift();

      console.log(thisRow);

      sheet.addRow(thisRow, function(err) {
        if (err) {
          console.log(err);
          return next();
        }

        if (thisArray.length === 0) {
          return next();
        } else {
          if (thisArray.length % 500 === 0) {
            setTimeout(appendRow(), 0);
          } else {
            appendRow();
          }
        }
      });
    })();
  }
};

module.exports = sheetsHelper;