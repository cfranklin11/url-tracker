'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _googleSpreadsheet = require('google-spreadsheet');

var _googleSpreadsheet2 = _interopRequireDefault(_googleSpreadsheet);

var _auth = require('../config/auth.js');

var _auth2 = _interopRequireDefault(_auth);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* eslint no-trailing-spaces: 0 */

var COL_COUNT = 2;
// import heapdump from 'heapdump';

var processCount = 0;

// Start by getting the sheet by ID
function getSpreadsheet(req, res, next) {
  // First option is to use ID entered into the form, then any environment
  // variables
  var docId = req.body.docId;

  req.googleSheets = {
    doc: new _googleSpreadsheet2.default(docId)
  };

  setAuth(req, res, next);
}

// Get auth credentials to make changes to sheet
function setAuth(req, res, next) {
  var client_email = _auth2.default.client_email;
  var private_key = _auth2.default.private_key;
  // Credentials obtained via environment variables imported to auth.js

  var credsJson = { client_email: client_email, private_key: private_key };

  req.googleSheets.doc.useServiceAccountAuth(credsJson, function (err) {
    if (err) {
      console.log(err);
      res.send(err.message);
    } else {
      getWorksheets(req, res, next);
    }
  });
}

// Get correct sheet, depending on whether your reading or writing
function getWorksheets(req, res, next) {
  var doc = req.googleSheets.doc;


  doc.getInfo(function (err, info) {
    if (!info) {
      res.status(400).send('The Google Sheets ID was invalid.');
    } else if (err) {
      console.log(err);
      res.status(400).send(err.message);
      // If you've already crawled, write rows to new URLs sheet
    } else {
      req.googleSheets.info = info;

      if (req.pagesCrawled) {
        setTimeout(function () {
          processCount = 2;
          addChangedUrls(req, res, next);
          addBrokenLinks(req, res, next);
        }, 0);
        // Otherwise, delete blank URL rows
      } else {
        modifyErrorRows(req, res, next);
      }
    }
  });
}

// Function for deleting rows that are missing URLs and adding status 200
// to rows without statuses
function modifyErrorRows(req, res, next) {
  var existingUrlSheet = req.googleSheets.info.worksheets[1];

  existingUrlSheet.getRows(function (err, rows) {
    if (err) {
      console.log(err);
      res.send(err.message);
    } else {
      processCount++;

      for (var i = rows.length - 1; i > 0; i--) {
        var thisRow = rows[i];

        // resetTimer(thisRow, i);
        if (i % 500 === 0) {
          processCount++;
          var timeout = true;

          setTimeout(checkRow(thisRow, timeout), 0);
        } else {
          checkRow(thisRow);
        }
      }

      checkProcessCount(req, res, next, moveNewUrls);
    }
  });

  function checkRow(row, timeout) {
    if (!row.url) {
      modifyRow(row.del, timeout);
    } else if (!row.status) {
      row.status = 200;
      modifyRow(row.save, timeout);
    } else if (timeout) {
      checkProcessCount(req, res, next, moveNewUrls);
    }
  }

  function modifyRow(func, timeout) {
    if (!timeout) {
      processCount++;
    }

    func(function (err) {
      if (err) {
        console.log(err);
        res.send(err.message);
      } else {
        checkProcessCount(req, res, next, moveNewUrls);
      }
    });
  }
}

// Copy URLs from 'New/Modified URLs' over to 'Existing URLs'
function moveNewUrls(req, res, next) {
  var info = req.googleSheets.info;

  var existingUrlSheet = info.worksheets[1];
  var newUrlSheet = info.worksheets[2];

  newUrlSheet.getCells({
    'min-row': 2,
    'min-col': 1,
    'max-col': COL_COUNT,
    'return-empty': false
  }, function (err, newCells) {
    if (err) {
      console.log(err);
      res.send(err.message);
    }

    cleanUpNewSheet(newUrlSheet);
    updateExistingSheet(existingUrlSheet, newCells);
  });

  function cleanUpNewSheet(sheet) {
    var options = {
      sheet: sheet,
      headers: ['url', 'status']
    };
    clearSheet(req, res, next, options);
  }

  function updateExistingSheet(existingUrlSheet, newCells) {
    existingUrlSheet.getRows({ offset: 1, orderby: 'col2' }, function (err, rows) {
      if (err) {
        console.log(err);
        res.send(err.message);
      }

      var existingRowCount = rows.length;
      var minRow = existingRowCount + 1;
      var newRowCount = newCells.length / COL_COUNT;
      var revisedRowCount = Math.max(existingRowCount + newRowCount, existingUrlSheet.rowCount);
      var revisedColCount = Math.max(COL_COUNT, existingUrlSheet.colCount);
      var options = {
        sheet: existingUrlSheet,
        rowCount: revisedRowCount,
        colCount: revisedColCount,
        minRow: minRow,
        newCells: newCells,
        isCellToCell: true,
        callback: getUrls
      };

      updateSheetCells(req, res, next, options);
    });
  }
}

// Collect array of URLs that you want to check
// (found in 'Existing URLs' sheet)
function getUrls(req, res, next) {
  var urlSheet = req.googleSheets.info.worksheets[1];

  urlSheet.getRows({ offset: 1, orderby: 'col2' }, function (err, rows) {
    if (err) {
      console.log(err);
      res.send(err.message);
    }

    // Push all rows of 'Existing URLs' into 'pagesToCrawl' for use
    // by crawler.js
    req.pagesToCrawl = rows.filter(function (row) {
      return row.url && row;
    }).map(function (row) {
      return {
        url: row.url.replace(/\/$/, ''),
        status: row.status
      };
    });

    next();
  });
}

// After crawling, add 'pagesCrawled' info to new URLs sheet
// (only includes pages that have changed from those in 'Existing URLs')
function addChangedUrls(req, res, next) {
  var pagesCrawled = req.pagesCrawled;
  var googleSheets = req.googleSheets;


  if (pagesCrawled && pagesCrawled.length) {
    req.notification = true;
    var newUrlSheet = googleSheets.info.worksheets[2];
    var rowCount = Math.max(pagesCrawled.length + 1, newUrlSheet.rowCount);
    var colCount = Math.max(COL_COUNT, newUrlSheet.colCount);
    var options = {
      sheet: newUrlSheet,
      rowCount: rowCount,
      colCount: colCount,
      minRow: 2,
      newCells: pagesCrawled,
      isCellToCell: false,
      callback: getEmails
    };

    updateSheetCells(req, res, next, options);
  } else {
    checkProcessCount(req, res, next, getEmails);
  }
}

// Add broken links info to 'Broken Links' sheet
function addBrokenLinks(req, res, next) {
  var info = req.googleSheets.info;

  var brokenLinkSheet = info.worksheets[3];
  var options = {
    sheet: brokenLinkSheet,
    headers: ['page_url', 'link_url'],
    callback: updateBrokenLinks
  };

  clearSheet(req, res, next, options);

  function updateBrokenLinks(req, res, next) {
    var brokenLinks = req.brokenLinks;
    var info = req.googleSheets.info;

    var brokenLinkSheet = info.worksheets[3];

    if (brokenLinks && brokenLinks.length) {
      req.notification = true;
      var rowCount = Math.max(brokenLinks + 1, brokenLinkSheet.rowCount);
      var colCount = Math.max(COL_COUNT, brokenLinkSheet.colCount);
      var _options = {
        sheet: brokenLinkSheet,
        rowCount: rowCount,
        colCount: colCount,
        minRow: 2,
        newCells: brokenLinks,
        isCellToCell: false,
        callback: getEmails
      };

      updateSheetCells(req, res, next, _options);
    } else {
      checkProcessCount(req, res, next, getEmails);
    }
  }
}

// Gets e-mail addresses listed in Google Sheets to send
// a notification e-mail
function getEmails(req, res, next) {
  var infoSheet = req.googleSheets.info.worksheets[0];

  // heapdump.writeSnapshot((err, filename) => {
  //   if (err) console.log(err);
  //   console.log('dump written to', filename);
  // });

  // Only send an e-mail if there are new URLs or broken links
  if (req.notification) {
    infoSheet.getRows({ offset: 1, orderby: 'col2' }, function (err, rows) {
      if (err) {
        console.log(err);
        res.send(err.message);
      }

      // **** NOTE: 'getRows' removes '_' from column names ****
      var emailRow = rows[0].emailrecipients;

      if (emailRow) {
        // Save e-mail list as array to pass on to Postmark
        var emails = emailRow.split(/,\s*/g);
        req.emailList = emails;
      }
      next();
    });
  } else {
    console.log('No new info');
    next();
  }
}

function updateSheetCells(req, res, next, options) {
  var sheet = options.sheet;
  var rowCount = options.rowCount;
  var colCount = options.colCount;
  var minRow = options.minRow;
  var newCells = options.newCells;
  var isCellToCell = options.isCellToCell;
  var callback = options.callback;


  sheet.resize({
    'rowCount': rowCount,
    'colCount': colCount
  }, function (err) {
    if (err) {
      console.log(err);
      res.send(err.message);
    }

    sheet.getCells({
      'min-row': minRow,
      'min-col': 1,
      'max-col': COL_COUNT,
      'return-empty': true
    }, function (err, existingCells) {
      if (err) {
        console.log(err);
        res.send(err.message);
      }

      var properties = sheet.id === 4 ? ['page_url', 'link_url'] : ['url', 'status'];

      for (var i = 0; i < existingCells.length; i++) {
        var thisExistingCell = existingCells[i];
        var thisNewCell = isCellToCell ? newCells[i] : newCells[Math.floor(i / COL_COUNT)];

        if (thisNewCell && thisExistingCell) {
          if (isCellToCell) {
            thisExistingCell.value = thisNewCell.value;
          } else {
            var propertyIndex = thisExistingCell.col - 1;
            var value = thisNewCell[properties[propertyIndex]];
            thisExistingCell.value = value;
          }
        }
      }

      sheet.bulkUpdateCells(existingCells, function (err) {
        if (err) {
          console.log(err);
          res.send(err.message);
        }

        checkProcessCount(req, res, next, callback);
      });
    });
  });
}

function clearSheet(req, res, next, options) {
  var sheet = options.sheet;
  var headers = options.headers;
  var callback = options.callback;


  sheet.clear(function (err) {
    if (err) {
      console.log(err);
      res.send(err.message);
    }

    // Clear removes everything, so put back column labels
    sheet.setHeaderRow(headers, function (err) {
      if (err) {
        console.log(err);
        res.send(err.message);
      }

      if (callback) {
        callback(req, res, next);
      }
    });
  });
}

function checkProcessCount(req, res, next, callback) {
  if (processCount > 0) {
    processCount--;
  }

  if (processCount === 0) {
    callback(req, res, next);
  }
}

exports.default = getSpreadsheet;
