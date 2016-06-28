'use strict';

var GoogleSpreadsheet, auth, crawler, sheetsHelper;

GoogleSpreadsheet = require('google-spreadsheet');
auth = require('../config/auth.js');
crawler = require('./crawler.js');

sheetsHelper = {

  getSpreadsheet: function(req, res, next) {
    var doc;

    doc = new GoogleSpreadsheet(auth.doc_id);
    sheetsHelper.setAuth(req, res, next, doc);
  },

  setAuth: function(req, res, next, doc) {
    var credsJson;

    credsJson = {
      client_email: auth.client_email,
      private_key: auth.private_key
    };

    doc.useServiceAccountAuth(credsJson, function() {
      sheetsHelper.getWorksheets(req, res, next, doc);
    });
  },

  getWorksheets: function(req, res, next, doc) {
    doc.getInfo(function(err, data) {
      var urlSheet, linkSheet, urlArray, linkArray, sheet;

      if (err) {
        console.log(err);
        return;
      }

      if (req.pagesCrawled) {
        sheetsHelper.addChangedUrls(next, data, req.pagesCrawled);

      } else {
        sheet = data.worksheets[0];
        sheetsHelper.getUrls(req, res, next, sheet);
      }
    });
  },

  getUrls: function(req, res, next, sheet) {
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

  addChangedUrls: function(next, doc, urlArray) {
    var thisSheet, thisArray, thisRow;

    thisSheet = doc.worksheets[1]
    thisArray = urlArray;

    (function appendRow() {
      thisRow = thisArray.shift();

      console.log(thisRow);

      thisSheet.addRow(thisRow, function(err) {
        if (err) {
          console.log(err);
          return next();
        }

        if (thisArray.length === 0) {
          sheetsHelper.addBrokenLinks(next, doc, req.brokenLinks);
        } else {
          if (thisArray.length % 500 === 0) {
            setTimeout(appendRow(), 0);
          } else {
            appendRow();
          }
        }
      });
    })();
  },

  addBrokenLinks: function(next, sheet, array) {
    var thisArray, thisRow;

  }
};

module.exports = sheetsHelper;