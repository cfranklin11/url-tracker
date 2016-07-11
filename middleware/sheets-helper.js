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

  addChangedUrls: function(req, res, next, doc) {
    var newUrlSheet, newUrls, thisRow;

    newUrlSheet = doc.worksheets[2];
    newUrls = req.pagesCrawled;

    (function appendRow() {
      thisRow = newUrls.shift();

      if (thisRow) {
        newUrlSheet.addRow(thisRow, function(err) {
          if (err) {
            console.log(err);
            return next();
          }

          if (newUrls.length % 500 === 0) {
            setTimeout(appendRow(), 0);
          } else {
            appendRow();
          }
        });

      } else {
        self.addBrokenLinks(req, res, next, doc);
      }
    })();
  },

  addBrokenLinks: function(req, res, next, doc) {
    var brokenLinkSheet, brokenLinks, thisRow;

    brokenLinkSheet = doc.worksheets[3];
    brokenLinks = req.brokenLinks;

    brokenLinkSheet.getRows(
      {
        offset: 1,
        orderby: 'col2'
      },
      function(err, rows) {
        var i, thisData, index, thisLink;

        if (err) {
          console.log(err);
          return next();
        }

        for (i = 0; i < rows.length; i++) {
          thisRow = rows[i];
          thisData = {
            page_url: thisRow.page_url,
            link_url: thisRow.link_url
          };

          index = brokenLinks.indexOf(thisData);

          if (index !== -1) {
            brokenLinks.splice(index, 1);
          }
        }

        (function appendRow() {
          thisLink = brokenLinks.shift();

          if (thisLink) {
            brokenLinkSheet.addRow(thisLink, function(err) {
              if (err) {
                console.log(err);
                return next();
              }

              if (brokenLinks.length % 500 === 0) {
                setTimeout(appendRow(), 0);

              } else {
                appendRow();
              }
            });

          } else {
            self.getEmails(req, res, next, doc);
          }
        })();
    });
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

        console.log(rows);

        emailRow = rows[0].email_recipients;

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