import GoogleSpreadsheet from 'google-spreadsheet';
import configAuth from '../config/auth.js';

// Start by getting the sheet by ID
function getSpreadsheet(req, res, next) {
  var doc, docId;

  // First option is to use ID entered into the form, then any environment
  // variables
  docId = req.body.sheet;

  doc = new GoogleSpreadsheet(docId);
  setAuth(req, res, next, doc);
}

// Get auth credentials to make changes to sheet
function setAuth(req, res, next, doc) {
  const {client_email, private_key} = configAuth;
  // Credentials obtained via environment variables imported to auth.js
  const credsJson = {client_email, private_key};

  doc.useServiceAccountAuth(credsJson, function(err) {
    if (err) {
      console.log(err);
      return res.send(err);
    }

    getWorksheets(req, res, next, doc);
  });
}

// Get correct sheet, depending on whether your reading or writing
function getWorksheets(req, res, next, doc) {
  doc.getInfo(function(err, info) {
    if (!info) {
      return res.status(400).send('The Google Sheets ID was invalid.');
    }

    if (err) {
      console.log(err);
      return res.status(400).send(err);
    }

    // If you've already crawled, write rows to new URLs sheet
    if (req.pagesCrawled) {
      setTimeout(function() {
        addChangedUrls(req, res, next, info);
      }, 0);

    // Otherwise, delete blank URL rows
    } else {
      modifyErrorRows(req, res, next, info);
    }
  });
}

// Function for deleting rows that are missing URLs and adding status 200
// to rows without statuses
function modifyErrorRows(req, res, next, info) {
  var sheet;

  sheet = info.worksheets[1];

  sheet.getRows({
    offset: 1,
    orderby: 'col2'
  },
  function(err, rows) {
    if (err) {
      console.log(err);
    }

    modifyRow(rows);
  });

  // Function for modifying rows that can cause errors
  function modifyRow(rows) {
    var rowsArray, thisRow;

    rowsArray = rows.slice(0);
    // Use last element, because row.del() will remove bottom row
    // with same url/status
    thisRow = rowsArray.pop();

    // Delete rows without URLS, then call modifyRow again,
    // or moveNewUrls if no more rows
    if (!thisRow.url) {
      thisRow.del(function(err) {
        if (err) {
          console.log(err);
        }

        if (rowsArray.length > 0) {
          resetTimer(rowsArray);
        } else {
          moveNewUrls(req, res, next, info);
        }
      });

    // Add '200' to rows with empty statuses
    } else if (!thisRow.status) {
      thisRow.status = 200;
      thisRow.save(function(err) {
        if (err) {
          console.log(err);
        }

        if (rowsArray.length > 0) {
          resetTimer(rowsArray);
        } else {
          moveNewUrls(req, res, next, info);
        }
      });

    // If row is complete, call modify Row again
    } else if (rowsArray.length > 0) {
      resetTimer(rowsArray);
    } else {
      moveNewUrls(req, res, next, info);
    }
  }

  // Reset timer every 200 rows to avoid timeout error
  function resetTimer(rowsArray) {
    if (rowsArray.length % 200 === 0) {
      setTimeout(modifyRow(rowsArray), 0);
    } else {
      modifyRow(rowsArray);
    }
  }
}

// Copy URLs from 'New/Modified URLs' over to 'Existing URLs'
function moveNewUrls(req, res, next, info) {
  var newUrlSheet, existingUrlSheet, params;

  existingUrlSheet = info.worksheets[1];
  params = {
    req: req,
    res: res,
    next: next,
    info: info
  };

  newUrlSheet = info.worksheets[2];
  newUrlSheet.getRows(
    {
      offset: 1,
      orderby: 'col2'
    },
    function(err, rows) {
      var newUrlRows;

      if (err) {
        console.log(err);
      }

      // Rows array has a lot of extra data, so filter to get
      // only URL and status code
      newUrlRows = rows.map(function(item) {
        return {
          url: item.url,
          status: item.status
        };
      });

      newUrlSheet.clear(function(err) {
        if (err) {
          console.log(err);
        }

        // Clear removes everything, so put back column labels
        newUrlSheet.setHeaderRow(
          ['url', 'status'],
          function(err) {
            if (err) {
              console.log(err);
            }

            appendRow(
              existingUrlSheet,
              newUrlRows,
              params,
              getUrls
            );
          }
        );
      });
    }
  );
}

// Collect array of URLs that you want to check
// (found in 'Existing URLs' sheet)
function getUrls(req, res, next, info) {
  var urlSheet, pagesToCrawl;

  urlSheet = info.worksheets[1];

  urlSheet.getRows(
    {
      offset: 1,
      orderby: 'col2'
    },
    function(err, rows) {
      if (err) {
        console.log(err);
      }

      // Push all rows of 'Existing URLs' into 'pagesToCrawl' for use
      // by crawler.js
      pagesToCrawl = rows
        .filter(row => {
          return row.url && row;
        })
        .map(function(row) {
          return {
            url: row.url.replace(/\/$/, ''),
            status: row.status
          };
        });

      req.pagesToCrawl = pagesToCrawl;
      next();
    }
  );
}

// After crawling, add 'pagesCrawled' info to new URLs sheet
// (only includes pages that have changed from those in 'Existing URLs')
function addChangedUrls(req, res, next, info) {
  var newUrlSheet, params;

  newUrlSheet = info.worksheets[2];
  params = {
    req: req,
    res: res,
    next: next,
    info: info
  };

  // Add rows to new URL sheet, then go to 'addBrokenLinks'
  appendRow(newUrlSheet, req.pagesCrawled, params, addBrokenLinks);
}

// Add broken links info to 'Broken Links' sheet
function addBrokenLinks(req, res, next, info) {
  var brokenLinkSheet;

  brokenLinkSheet = info.worksheets[3];

  // Clear previous broken links from the sheet
  brokenLinkSheet.clear(function(err) {
    if (err) {
      console.log(err);
    }

    // Clear removes everything, so put back column labels
    brokenLinkSheet.setHeaderRow(
      ['page_url', 'link_url'],
      function(err) {
        var params;

        if (err) {
          console.log(err);
        }

        params = {
          req: req,
          res: res,
          next: next,
          info: info
        };

        // Add rows to broken links sheet, then go to 'getEmails'
        appendRow(brokenLinkSheet, req.brokenLinks, params, getEmails);
      }
    );
  });
}

// Function for adding rows to a given sheet
function appendRow(sheet, rowsArray, params, callback) {
  var thisArray, thisRow, req, res, next, info;

  thisArray = rowsArray.slice(0);
  thisRow = thisArray.shift();
  next = params.next;
  req = params.req;

  // If there's another row to add, add it and repeat 'appendRow'
  if (thisRow) {
    sheet.addRow(thisRow, function(err) {
      if (err) {
        console.log(err);
      }

      // Only send e-mail notification if new rows are added
      req.notification = true;

      if (rowsArray.length % 200 === 0) {
        setTimeout(appendRow(sheet, thisArray, params, callback), 0);
      } else {
        appendRow(sheet, thisArray, params, callback);
      }
    });

  // Otherwise, invoke callback
  } else {
    res = params.res;
    info = params.info;
    callback(req, res, next, info);
  }
}

// Gets e-mail addresses listed in Google Sheets to send
// a notification e-mail
function getEmails(req, res, next, info) {
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
        }

        // **** NOTE: 'getRows' removes '_' from column names ****
        emailRow = rows[0].emailrecipients;

        if (emailRow) {
          // Save e-mail list as array to pass on to Postmark
          emails = emailRow.split(/,\s*/g);
          req.emailList = emails;
        }
        return next();
      }
    );
  } else {
    console.log('No new info');
    return next();
  }
}

export default getSpreadsheet;
