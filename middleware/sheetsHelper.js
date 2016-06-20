'use strict';

var GoogleSpreadsheet, async, auth, crawler, sheetsHelper;

GoogleSpreadsheet = require('google-spreadsheet');
async = require('async');
auth = require('../config/auth.js');
crawler = require('./crawler.js');

sheetsHelper = {

  getSpreadsheet: function(req, res, next) {
    var doc;

    console.log('sheets');

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
      var sheet;

      if (err) {
        console.log(err);
        return;
      }

      if (req.pagesCrawled) {
        sheet = data.worksheets[1];
        sheetsHelper.createUrls(req, res, next, sheet);
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
        next();
    });
  },

  createUrls: function(req, res, next, sheet) {
    sheetsHelper.addRows(sheet, req.pagesCrawled)
  },

  addRows: function(sheet, array) {
    var i, arrayLength;

    req.clearTimeout();

    arrayLength = array.length;

    for (i = 0; i < arrayLength; i++) {
      if (i === arrayLength - 1) {
        sheet.addRow(array[i], lastCallback);
      } else {
        sheet.addRow(array[i], handleError);
      }
    }
  }
};

function handleError(err) {
  if (err) {
    console.log(err);
    next();
  }
}

function lastCallback(err) {
  if (err) {
    console.log(err);
  }
  next();
}

module.exports = sheetsHelper;