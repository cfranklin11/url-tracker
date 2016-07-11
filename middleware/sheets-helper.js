'use strict';

var GoogleSpreadsheet, auth, crawler, sheetsHelper, self;

GoogleSpreadsheet = require('google-spreadsheet');
auth = require('../config/auth.js');
crawler = require('./crawler.js');

sheetsHelper = self = {

  // Start by getting the sheet by ID
  getSpreadsheet: function(req, res, next) {
    var doc;

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
    doc.getInfo(function(err, data) {
      var sheet;

      if (err) {
        console.log(err);
        return;
      }

      // If you've already crawled, write rows to new URLs sheet
      if (req.pagesCrawled) {
        self.addChangedUrls(req, res, next, data);

      // Otherwise, collect existing URLs to crawl
      } else {
        sheet = data.worksheets[1];
        self.getUrls(req, res, next, sheet);
      }
    });
  },

  // Collect array of URLs that you want to check
  // (found in 'Existing URLs' sheet)
  getUrls: function(req, res, next, urlSheet) {
    var pagesToCrawl, thisRow;

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
  addChangedUrls: function(req, res, next, doc) {
    var newUrlSheet, newUrls, params;

    newUrlSheet = doc.worksheets[2];
    newUrls = req.pagesCrawled;

    params = {
      req: req,
      res: res,
      next: next,
      doc: doc
    };
    self.appendRow(newUrlSheet, newUrls, params, self.addBrokenLinks);
  },

  // Add broken links info to 'Broken Links' sheet
  addBrokenLinks: function(req, res, next, doc) {
    var brokenLinkSheet, brokenLinks, thisRow;

    brokenLinkSheet = doc.worksheets[3];
    brokenLinks = req.brokenLinks;

    // First, get existing rows to avoid duplication
    brokenLinkSheet.getRows(
      {
        offset: 1,
        orderby: 'col2'
      },
      function(err, rows) {
        var i, thisData, index, params;

        if (err) {
          console.log(err);
          return next();
        }

        // Loop through existing broken links rows to check if they're in
        // the new broken links array
        for (i = 0; i < rows.length; i++) {
          thisRow = rows[i];

          // **** NOTE: 'getRows' removes '_' from column names ****
          thisData = {
            page_url: thisRow.pageurl,
            link_url: thisRow.linkurl
          };

          index = brokenLinks.indexOf(thisData);

          // If the existing link info is in the new broken links array,
          // remove it from the array
          if (index !== -1) {
            brokenLinks.splice(index, 1);
          }
        }

        params = {
          req: req,
          res: res,
          next: next,
          doc: doc
        };
        self.appendRow(brokenLinkSheet, brokenLinks, params, self.getEmails);
    });
  },

  appendRow: function(sheet, rowArray, params, callback) {
          var thisArray, thisRow, req, res, next, doc;

          thisArray = rowArray.slice(0);
          thisRow = thisArray.shift();

          if (thisRow) {
            sheet.addRow(thisRow, function(err) {
              if (err) {
                console.log(err);
                return next();
              }

              if (rowArray.length % 500 === 0) {
                setTimeout(self.appendRow(sheet, thisArray, params, callback), 0);

              } else {
                self.appendRow(sheet, thisArray, params, callback);
              }
            });

          } else {
            req = params.req;
            res = params.res;
            next = params.next;
            doc = params.doc;
            callback(req, res, next, doc);
          }
  },

  getEmails: function(req, res, next, doc) {
    var infoSheet, emailRow, emails;

    infoSheet = doc.worksheets[0];

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
          emails = emailRow.split(/,\s*/g);
          req.emailList = emails;

        } else {
          return next();
        }
    });
  }
};

module.exports = sheetsHelper;