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
/* eslint no-unused-vars: 0 */

var COL_COUNT = 2;
// import heapdump from 'heapdump';


function prepareToCrawl(req, res, next) {
  getDoc(req).then(function (doc) {
    return getWorksheets(doc);
  }).then(function (info) {
    console.log(req);
    next();
  }).catch(function (err) {
    console.log(err);
  });
}

// Start by getting the sheet by ID
function getDoc(req, res, next) {
  // First option is to use ID entered into the form, then any environment
  // variables
  var docId = _auth2.default.doc_id; // req.body;
  var doc = new _googleSpreadsheet2.default(docId);
  var client_email = _auth2.default.client_email;
  var private_key = _auth2.default.private_key;
  // Credentials obtained via environment variables imported to auth.js

  var credsJson = { client_email: client_email, private_key: private_key };

  return new Promise(function (resolve, reject) {
    doc.useServiceAccountAuth(credsJson, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve(doc);
      }
    });
  });

  // setAuth(req, res, next)
  //   .then((req, res, next) => {
  //     return getWorksheets(req, res, next);
  //   })
  //   .then((req, res, next) => {
  //     if (req.pagesCrawled) {
  //       timeout(req, res, next)
  //         .then((req, res, next) => {
  //           const urlsPromise = addChangedUrls(req, res, next);
  //           const linksPromise = addBrokenLinks(req, res, next);
  //
  //           Promise.all([urlsPromise, linksPromise])
  //             .then(results => {
  //               getEmails(req, res, next);
  //             });
  //         });
  //     // Otherwise, delete blank URL rows
  //     } else {
  //       modifyErrorRows(req, res, next)
  //         .then((req, res, next) => {
  //           return moveNewUrls(req, res, next);
  //         })
  //         .then((req, res, next) => {
  //           next();
  //         })
  //         .catch(err => {
  //           console.log(err);
  //         });
  //     }
  //   })
  //   .catch(err => {
  //     console.log(err);
  //   });
}

function timeout(req, res, next) {
  return new Promise(function (resolve, reject) {
    setTimeout(function () {
      resolve(req, res, next);
    }, 0);
  });
}

// Get auth credentials to make changes to sheet
// function setAuth(req, res, next) {
//   const {client_email, private_key} = configAuth;
//   // Credentials obtained via environment variables imported to auth.js
//   const credsJson = {client_email, private_key};
//
//   return new Promise((resolve, reject) => {
//     req.googleSheets.doc.useServiceAccountAuth(credsJson, err => {
//       if (err) {
//         reject(err);
//       } else {
//         const updatedExpressObjects = [req, res, next];
//         resolve(updatedExpressObjects);
//       }
//     });
//   });
// }

// Get correct sheet, depending on whether your reading or writing
function getWorksheets(doc) {
  // const {doc} = req.googleSheets;

  return new Promise(function (resolve, reject) {
    doc.getInfo(function (err, info) {
      if (!info) {
        reject(Error('The Google Sheets ID was invalid.'));
      } else if (err) {
        reject(err);
        // If you've already crawled, write rows to new URLs sheet
      } else {
        // req.googleSheets.info = info;
        // const updatedExpressObjects = [req, res, next];
        resolve(info);
      }
    });
  });
}

// Function for deleting rows that are missing URLs and adding status 200
// to rows without statuses
function modifyErrorRows(req, res, next) {
  var existingUrlSheet = req.googleSheets.info.worksheets[1];
  var promiseArray = [];

  return new Promise(function (resolve, reject) {
    existingUrlSheet.getRows(function (err, rows) {
      if (err) {
        reject(err);
      } else {
        var _loop = function _loop(i) {
          var thisRow = rows[i];

          // resetTimer(thisRow, i);
          if (i % 500 === 0) {
            (function () {
              var timeout = true;
              var index = i;

              setTimeout(function () {
                promiseArray[index] = checkRow(thisRow, timeout);
              }, 0);
            })();
          } else {
            promiseArray[i] = checkRow(thisRow);
          }
        };

        for (var i = rows.length - 1; i > 0; i--) {
          _loop(i);
        }

        Promise.all(promiseArray).then(function (results) {
          resolve(req, res, next);
        }).catch(function (err) {
          console.log(err);
        });
      }
    });
  });

  function checkRow(row) {
    if (!row.url) {
      return modifyRow(row.del);
    }
    if (!row.status) {
      row.status = 200;
      return modifyRow(row.save);
    }
    return 'all done';
  }

  function modifyRow(func) {
    return new Promise(function (resolve, reject) {
      func(function (err) {
        if (err) {
          reject(err);
        } else {
          resolve('all done');
        }
      });
    });
  }
}

// Copy URLs from 'New/Modified URLs' over to 'Existing URLs'
function moveNewUrls(req, res, next) {
  var info = req.googleSheets.info;

  var existingUrlSheet = info.worksheets[1];
  var newUrlSheet = info.worksheets[2];

  return new Promise(function (resolve, reject) {
    newUrlSheet.getCells({
      'min-row': 2,
      'min-col': 1,
      'max-col': COL_COUNT,
      'return-empty': false
    }, function (err, newCells) {
      if (err) {
        reject(err);
      }

      var clearOptions = {
        sheet: newUrlSheet,
        headers: ['url', 'status']
      };

      var clearPromise = clearSheet(clearOptions).then(function (msg) {
        return msg;
      }).catch(function (err) {
        console.log(err);
      });
      var updatePromise = updateExistingSheet(existingUrlSheet, newCells).then(function (options) {
        return updateSheetCells(options);
      }).then(function (sheet) {
        return getUrls(sheet);
      }).catch(function (err) {
        console.log(err);
      });

      Promise.all([clearPromise, updatePromise]).then(function (results) {
        console.log(results[0]);
        req.pagesToCrawl = results[1];
        resolve(req, res, next);
      });
    });
  });

  function updateExistingSheet(existingUrlSheet, newCells) {
    return new Promise(function (resolve, reject) {
      existingUrlSheet.getRows({ offset: 1, orderby: 'col2' }, function (err, rows) {
        if (err) {
          reject(err);
        } else {
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

          resolve(options);
          // updateSheetCells(req, res, next, options);
        }
      });
    });
  }
}

// Collect array of URLs that you want to check
// (found in 'Existing URLs' sheet)
function getUrls(urlSheet) {
  return new Promise(function (resolve, reject) {
    urlSheet.getRows({ offset: 1, orderby: 'col2' }, function (err, rows) {
      if (err) {
        reject(err);
      }

      // Push all rows of 'Existing URLs' into 'pagesToCrawl' for use
      // by crawler.js
      var pagesToCrawl = rows.filter(function (row) {
        return row.url && row;
      }).map(function (row) {
        return {
          url: row.url.replace(/\/$/, ''),
          status: parseFloat(row.status)
        };
      });

      return pagesToCrawl;
    });
  });
}

// After crawling, add 'pagesCrawled' info to new URLs sheet
// (only includes pages that have changed from those in 'Existing URLs')
function addChangedUrls(req, res, next) {
  var pagesCrawled = req.pagesCrawled;
  var googleSheets = req.googleSheets;


  return new Promise(function (resolve, reject) {
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

      return updateSheetCells(req, res, next, options);
    }
    // else {
    //   checkProcessCount(req, res, next, getEmails);
    // }
  });
}

// TODO

// Add broken links info to 'Broken Links' sheet
function addBrokenLinks(req, res, next) {
  var info = req.googleSheets.info;

  var brokenLinkSheet = info.worksheets[3];
  var options = {
    sheet: brokenLinkSheet,
    headers: ['page_url', 'link_url'],
    callback: updateBrokenLinks
  };

  clearSheet(options);

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

function updateSheetCells(options) {
  var sheet = options.sheet;
  var rowCount = options.rowCount;
  var colCount = options.colCount;
  var minRow = options.minRow;
  var newCells = options.newCells;
  var isCellToCell = options.isCellToCell;


  return new Promise(function (resolve, reject) {
    sheet.resize({
      'rowCount': rowCount,
      'colCount': colCount
    }, function (err) {
      if (err) {
        reject(err);
      }

      sheet.getCells({
        'min-row': minRow,
        'min-col': 1,
        'max-col': COL_COUNT,
        'return-empty': true
      }, function (err, existingCells) {
        if (err) {
          reject(err);
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
            reject(err);
          } else {
            resolve(sheet);
          }
        });
      });
    });
  });
}

function clearSheet(options) {
  var sheet = options.sheet;
  var headers = options.headers;


  return new Promise(function (resolve, reject) {
    sheet.clear(function (err) {
      if (err) {
        reject(err);
      } else {
        sheet.setHeaderRow(headers, function (err) {
          if (err) {
            reject(err);
          } else {
            resolve('clear done');
          }
        });
      }
    });
  });
}

exports.default = prepareToCrawl;