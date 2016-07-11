'use strict';

var GoogleSpreadsheet, auth, crawler, sheetsHelper, self;

GoogleSpreadsheet = require('google-spreadsheet');
auth = require('../config/auth.js');
crawler = require('./crawler.js');

sheetsHelper = self = {

  getSpreadsheet: function(req, res, next) {
    var doc;

    doc = new GoogleSpreadsheet(auth.doc_id);
    self.setAuth(req, res, next, doc);
  },

  setAuth: function(req, res, next, doc) {
    var credsJson;

    credsJson = {
      client_email: auth.client_email,
      private_key: auth.private_key
    };

    doc.useServiceAccountAuth(credsJson, function() {
      self.getWorksheets(req, res, next, doc);
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
        self.addChangedUrls(req, res, next, data);

      } else {
        sheet = data.worksheets[1];
        self.getUrls(req, res, next, sheet);
      }
    });
  },

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

      newUrlSheet.addRow(thisRow, function(err) {
        if (err) {
          console.log(err);
          return next();
        }

        if (newUrls.length === 0) {
          self.addBrokenLinks(req, res, next, doc);
        } else {
          if (newUrls.length % 500 === 0) {
            setTimeout(appendRow(), 0);
          } else {
            appendRow();
          }
        }
      });
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
        var i;

        if (err) {
          console.log(err);
          return next();
        }

        for (i = 0; i < rows.length; i++) {
          thisRow = rows[i];
          thisData = {
            page_url: thisRow.page_url,
            link_url: thisRow.link_url
          }

          index = brokenLinks.indexOf(thisData);

          if (index !== -1) {
            brokenLinks.splice(index, 1);
          }
        }

        (function appendRow() {
          thisLink = brokenLinks.shift();

          brokenLinkSheet.addRow(thisLink, function(err) {
            if (err) {
              console.log(err);
              return next();
            }

            if (brokenLinks.length === 0) {
              self.getEmails(req, res, next, doc);
            } else {
              if (brokenLinks.length % 500 === 0) {
                setTimeout(appendRow(), 0);
              } else {
                appendRow();
              }
            }
          });
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
        emails = emailRow.split(/,\s*/g);

        req.emailList = emails;
        return next();
    });
  }
};

module.exports = sheetsHelper;