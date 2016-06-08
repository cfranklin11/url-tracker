'use strict';

var GoogleSpreadsheet, async, auth, crawler, sheetsHelper;

GoogleSpreadsheet = require('google-spreadsheet');
async = require('async');
auth = require('../config/auth.js');
crawler = require('./crawler.js');

sheetsHelper = {

  getUrls: function(req, res, next) {
    var doc, sheet;

    // spreadsheet key is the long id in the sheets URL
    doc = new GoogleSpreadsheet('1mngkbi1Qcllg6VFwX24qHPk9c9x35koCv_K-gVdMq4I');

    async.series([
      function setAuth(step) {
        var creds_json;

        creds_json = {
          client_email: auth.client_email,
          private_key: auth.private_key
        };

        doc.useServiceAccountAuth(creds_json, step);
      },
      function getWorksheets(step) {
          doc.getInfo(function(err, data) {
            sheet = data.worksheets[0];
            step();
          });
        },
        function workingWithRows(step) {
          sheet.getRows({
            offset: 1,
            limit: 20,
            orderby: 'col2'
          }, function( err, rows ){
            req.urlRows = rows;
            next();
          });
        }
    ]);
  }
};

module.exports = sheetsHelper;