'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _googleSpreadsheet = require('google-spreadsheet');

var _googleSpreadsheet2 = _interopRequireDefault(_googleSpreadsheet);

var _auth = require('../config/auth.js');

var _auth2 = _interopRequireDefault(_auth);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var COL_COUNT = 2;

// Start by getting the sheet by ID

// import heapdump from 'heapdump';
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
          addChangedUrls(req, res, next);
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
  var processCount = 0;

  existingUrlSheet.getRows(function (err, rows) {
    if (err) {
      console.log(err);
      res.send(err.message);
    } else {
      processCount++;

      for (var i = rows.length - 1; i > 0; i--) {
        var thisRow = rows[i];

        resetTimer(thisRow, i);
      }

      processCount--;
      if (processCount === 0) {
        moveNewUrls(req, res, next);
      }
    }
  });

  // Reset timer every 500 rows to avoid timeout error
  function resetTimer(row, index) {
    if (index % 500 === 0) {
      processCount++;
      var timeout = true;

      setTimeout(checkRow(row, timeout), 0);
    } else {
      checkRow(row);
    }
  }

  function checkRow(row, timeout) {
    if (!row.url) {
      modifyRow(row.del, timeout);
    } else if (!row.status) {
      row.status = 200;
      modifyRow(row.save, timeout);
    } else if (processCount === 0) {
      moveNewUrls(req, res, next);
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
        processCount--;
        if (processCount === 0) {
          moveNewUrls(req, res, next);
        }
      }
    });
  }
}

// Copy URLs from 'New/Modified URLs' over to 'Existing URLs'
function moveNewUrls(req, res, next) {
  var info = req.googleSheets.info;

  var existingUrlSheet = info.worksheets[1];
  var newUrlSheet = info.worksheets[2];
  var processCount = 0;

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

    processCount += 2;
    cleanUpNewSheet(newUrlSheet);
    updateExistingSheet(existingUrlSheet, newCells);

    processCount--;
    if (processCount === 0) {
      getUrls(req, res, next);
    }
  });

  function cleanUpNewSheet(sheet) {
    sheet.clear(function (err) {
      if (err) {
        console.log(err);
        res.send(err.message);
      }

      // Clear removes everything, so put back column labels
      sheet.setHeaderRow(['url', 'status'], function (err) {
        if (err) {
          console.log(err);
          res.send(err.message);
        }

        processCount--;
        if (processCount === 0) {
          getUrls(req, res, next);
        }
      });
    });
  }

  function updateExistingSheet(sheet, newCells) {
    sheet.getRows({ offset: 1, orderby: 'col2' }, function (err, rows) {
      if (err) {
        console.log(err);
        res.send(err.message);
      }

      var existingRowCount = rows.length;
      var minRow = existingRowCount + 1;
      var newRowCount = newCells.length / COL_COUNT;
      var revisedRowCount = Math.max(existingRowCount + newRowCount, existingUrlSheet.rowCount);
      var revisedColCount = Math.max(COL_COUNT, existingUrlSheet.colCount);

      sheet.resize({
        'rowCount': revisedRowCount,
        'colCount': revisedColCount
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

          for (var i = 0; i < existingCells.length; i++) {
            var thisExistingCell = existingCells[i];
            var thisNewCell = newCells[i];

            if (thisNewCell && thisNewCell.value && thisExistingCell) {
              thisExistingCell.value = thisNewCell.value;
            }
          }

          sheet.bulkUpdateCells(existingCells, function (err) {
            if (err) {
              console.log(err);
              res.send(err.message);
            }

            processCount--;
            if (processCount === 0) {
              getUrls(req, res, next);
            }
          });
        });
      });
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

  var newUrlSheet = googleSheets.info.worksheets[2];
  var rowCount = Math.max(pagesCrawled.length + 1, newUrlSheet.rowCount);
  var colCount = Math.max(COL_COUNT, newUrlSheet.colCount);

  newUrlSheet.resize({
    'rowCount': rowCount,
    'colCount': colCount
  }, function (err) {
    if (err) {
      console.log(err);
      res.send(err.message);
    }

    newUrlSheet.getCells({
      'min-row': 2,
      'min-col': 1,
      'max-col': COL_COUNT,
      'return-empty': true
    }, function (err, cells) {
      if (err) {
        console.log(err);
        res.send(err.message);
      } else {
        for (var i = 0; i < rowCount * COL_COUNT; i++) {
          var thisCell = cells[i];
          var pageIndex = Math.floor(i / COL_COUNT);
          var thisPage = pagesCrawled[pageIndex];

          if (thisCell && thisPage) {
            var column = thisCell.col;
            var value = column === 1 ? thisPage.url : thisPage.status;
            thisCell.value = value;
          }
        }

        newUrlSheet.bulkUpdateCells(cells, function (err) {
          if (err) {
            console.log(err);
            res.send(err.message);
          } else {
            addBrokenLinks(req, res, next);
          }
        });
      }
    });
  });
}

// Add broken links info to 'Broken Links' sheet
function addBrokenLinks(req, res, next, info) {
  var brokenLinkSheet = req.googleSheets.info.worksheets[3];

  // Clear previous broken links from the sheet
  brokenLinkSheet.clear(function (err) {
    if (err) {
      console.log(err);
      res.send(err.message);
    }

    // Clear removes everything, so put back column labels
    brokenLinkSheet.setHeaderRow(['page_url', 'link_url'], function (err) {
      if (err) {
        console.log(err);
        res.send(err.message);
      }

      var rowCount = Math.max(req.brokenLinks + 1, brokenLinkSheet.rowCount);
      var colCount = Math.max(COL_COUNT, brokenLinkSheet.colCount);

      // Add rows to broken links sheet, then go to 'getEmails'
      brokenLinkSheet.resize({
        'rowCount': rowCount,
        'colCount': colCount
      }, function (err) {
        if (err) {
          console.log(err);
          res.send(err.message);
        }

        brokenLinkSheet.getCells({
          'min-row': 2,
          'min-col': 1,
          'max-col': COL_COUNT
        }, function (err, cells) {
          if (err) {
            console.log(err);
            res.send(err.message);
          }

          var brokenLinks = req.brokenLinks;


          for (var i = 0; i < cells.length; i++) {
            var thisCell = cells[i];
            var column = thisCell.col;
            var thisLink = brokenLinks[i];

            if (thisLink && thisCell) {
              var value = column === 1 ? thisLink.url : thisLink.status;
              thisCell.value = value;
            }
          }

          brokenLinkSheet.bulkUpdateCells(function (cells, err) {
            if (err) {
              console.log(err);
              res.send(err);
            }

            getEmails(req, res, next);
          });
        });
      });
    });
  });
}

// Function for adding rows to a given sheet
// function appendRow(sheet, rowsArray, loopCount, params, callback) {
//   const thisRow = rowsArray[loopCount];
//   const {next, req, res, info} = params;
//   loopCount++;
//
//   // If there's another row to add, add it and repeat 'appendRow'
//   if (thisRow) {
//     sheet.addRow(thisRow, err => {
//       if (err) {
//         console.log(err);
//       }
//
//       // Only send e-mail notification if new rows are added
//       req.notification = true;
//
//       if (rowsArray.length % 500 === 0) {
//         // heapdump.writeSnapshot((err, filename) => {
//         //   if (err) console.log(err);
//         //   console.log('dump written to', filename);
//         // });
//
//         setTimeout(appendRow(sheet, rowsArray, loopCount, params, callback), 0);
//       } else {
//         appendRow(sheet, rowsArray, loopCount, params, callback);
//       }
//     });
//   // Otherwise, invoke callback
//   } else {
//     callback(req, res, next, info);
//   }
// }

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

exports.default = getSpreadsheet;