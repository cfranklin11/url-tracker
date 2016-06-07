'use strict';

var GoogleSpreadsheet, async, auth, sheetsHelper;

GoogleSpreadsheet = require('google-spreadsheet');
async = require('async');
auth = require('../config/auth.js');

sheetsHelper = {

  start: function(req, res, next) {
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
      function getInfoAndWorksheets(step) {
          doc.getInfo(function(err, info) {
            console.log('Loaded doc: '+info.title+' by '+info.author.email);
            sheet = info.worksheets[0];
            console.log('sheet 1: '+sheet.title+' '+sheet.rowCount+'x'+sheet.colCount);
            step();
          });
        },
        function workingWithRows(step) {
          // google provides some query options
          sheet.getRows({
            offset: 1,
            limit: 20,
            orderby: 'col2'
          }, function( err, rows ){
            console.log('Read '+rows.length+' rows');
            rows[0].url = 'new url';
            rows[0].status = 'new status';
            rows[0].save(); // this is async
            next();
          });
        }
    ]);
  }
};

module.exports = sheetsHelper;