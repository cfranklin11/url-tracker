'use strict';

var GoogleSpreadsheet, auth, crawler, sheetsHelper, self;

GoogleSpreadsheet = require('google-spreadsheet');
auth = require('../config/auth.js');
crawler = require('./crawler.js');

sheetsHelper = self = {

  // Start by getting the sheet by ID
  getSpreadsheet: function(req, res, next) {
    var doc, docId;

    // First option is to use ID entered into the form, then any environment
    // variables
    docId = req.body.id || auth.doc_id;

    doc = new GoogleSpreadsheet(auth.doc_id);
    self.setAuth(req, res, next, doc);
  },

  // Get auth credentials to make changes to sheet
  setAuth: function(req, res, next, doc) {
    var credsJson;

    // Credentials obtained via environment variables imported to auth.js
    credsJson = {
      client_email: auth.client_email,
      private_key: auth.private_key
    };

    doc.useServiceAccountAuth(credsJson, function() {
      self.getWorksheets(req, res, next, doc);
    });
  },

  // Get correct sheet, depending on whether your reading or writing
  getWorksheets: function(req, res, next, doc) {
    doc.getInfo(function(err, info) {

      if (err) {
        console.log(err);
        return;
      }

      // If you've already crawled, write rows to new URLs sheet
      if (req.pagesCrawled) {
        self.addChangedUrls(req, res, next, info);

      // Otherwise, collect new/modified URLs to move to existing URLs
      } else {
        self.moveNewUrls(req, res, next, info);
      }
    });
  },

  // Copy URLs from 'New/Modified URLs' over to 'Existing URLs'
  moveNewUrls: function(req, res, next, info) {
    var newUrlSheet;

    newUrlSheet = info.worksheets[2];
    newUrlSheet.getRows(
      {
        offset: 1,
        orderby: 'col2'
      },
      function(err, rows) {
        var newUrlRows, existingUrlSheet, params;

        if (err) {
          console.log(err);
          return next();
        }

        // Rows array has a lot of extra data, so filter to get
        // only URL and status code
        newUrlRows = rows.map(function(item) {
          return {
            url: item.url,
            status: item.status
          };
        });

        existingUrlSheet = info.worksheets[1];
        params = {
          req: req,
          res: res,
          next: next,
          info: info
        };
        self.appendRow(existingUrlSheet, newUrlRows, params, self.getUrls);
    });
  },

  // Collect array of URLs that you want to check
  // (found in 'Existing URLs' sheet)
  getUrls: function(req, res, next, info) {
    var urlSheet, pagesToCrawl, thisRow;

    urlSheet = info.worksheets[1];
    pagesToCrawl = [];

    urlSheet.getRows(
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

        // Push all rows of 'Existing URLs' into 'pagesToCrawl' for use
        // by crawler.js
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

  // After crawling, add 'pagesCrawled' info to new URLs sheet
  // (only includes pages that have changed from those in 'Existing URLs')
  addChangedUrls: function(req, res, next, info) {
    var newUrlSheet;

    newUrlSheet = info.worksheets[2];
    newUrlSheet.clear(function(err) {

      if (err) {
        console.log(err);
        return next();
      }

      // Clear removes everything, so put back column labels
      newUrlSheet.setHeaderRow(
        ['page_url', 'link_url'],
        function(err) {
          var params;

          if (err) {
            console.log(err);
            return next();
          }

          params = {
            req: req,
            res: res,
            next: next,
            info: info
          };

          // Add rows to new URL sheet, then go to 'addBrokenLinks'
          self.appendRow(newUrlSheet, req.pagesCrawled, params, self.addBrokenLinks);
      });
    });
  },

  // Add broken links info to 'Broken Links' sheet
  addBrokenLinks: function(req, res, next, info) {
    var brokenLinkSheet;

    brokenLinkSheet = info.worksheets[3];

    // Clear previous broken links from the sheet
    brokenLinkSheet.clear(function(err) {

      if (err) {
        console.log(err);
        return next();
      }

      // Clear removes everything, so put back column labels
      brokenLinkSheet.setHeaderRow(
        ['page_url', 'link_url'],
        function(err) {
          var params;

          if (err) {
            console.log(err);
            return next();
          }

          params = {
            req: req,
            res: res,
            next: next,
            info: info
          };

          // Add rows to broken links sheet, then go to 'getEmails'
          self.appendRow(brokenLinkSheet, req.brokenLinks, params, self.getEmails);
      });
    });
  },

  // Function for adding rows to a given sheet
  appendRow: function(sheet, rowArray, params, callback) {
          var thisArray, thisRow, req, res, next, info;

          thisArray = rowArray.slice(0);
          thisRow = thisArray.shift();
          next = params.next;
          req = params.req;

          // If there's another row to add, add it and repeat 'appendRow'
          if (thisRow) {
            sheet.addRow(thisRow, function(err) {

              if (err) {
                console.log(err);
                return next();
              }

              // Only send e-mail notification if new rows are added
              req.notification = true;

              if (rowArray.length % 500 === 0) {
                setTimeout(self.appendRow(sheet, thisArray, params, callback), 0);

              } else {
                self.appendRow(sheet, thisArray, params, callback);
              }
            });

          // Otherwise, invoke callback
          } else {
            res = params.res;
            info = params.info;
            callback(req, res, next, info);
          }
  },

  // Gets e-mail addresses listed in Google Sheets to send
  // a notification e-mail
  getEmails: function(req, res, next, info) {
    var infoSheet, emailRow, emails;

    infoSheet = info.worksheets[0];

    // Only send an e-mail if there are new URLs or broken links
    if (req.notification) {
      infoSheet.getRows(
        {
          offset: 1,
          orderby: 'col2'
        },
        function(err, rows) {
          if (err) {
            console.log(err);
            return next();
          }

          // **** NOTE: 'getRows' removes '_' from column names ****
          emailRow = rows[0].emailrecipients;

          if (emailRow) {

            // Save e-mail list as array to pass on to Postmark
            emails = emailRow.split(/,\s*/g);
            req.emailList = emails;
          }
          return next();
      });

    } else {
      console.log('No new info');
      return next();
    }
  }
};

module.exports = sheetsHelper;