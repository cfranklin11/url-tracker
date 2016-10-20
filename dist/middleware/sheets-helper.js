'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.processPageData = exports.prepareToCrawl = undefined;

var _googleSpreadsheet = require('google-spreadsheet');

var _googleSpreadsheet2 = _interopRequireDefault(_googleSpreadsheet);

var _auth = require('../config/auth.js');

var _auth2 = _interopRequireDefault(_auth);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var COL_COUNT = 2;
// import heapdump from 'heapdump';

var INFO_SHEET_INDEX = 0;
var EXISTING_URL_INDEX = 1;
var NEW_URL_INDEX = 2;
var BROKEN_LINKS_INDEX = 2;
var BROKEN_LINKS_SHEET_ID = 4;

function prepareToCrawl(req, res, next) {
  var date = new Date();
  console.log('Start', date.toTimeString());

  getDoc(req).then(function (doc) {
    return getWorksheets(doc);
  }).then(function (info) {
    req.googleSheets = { info: info };
    var existingUrlsSheet = info.worksheets[EXISTING_URL_INDEX];
    return getSheetRows(existingUrlsSheet);
  }).then(function (rows) {
    return checkExistingRows(req.googleSheets.info, rows);
  }).then(function (info) {
    return moveNewUrls(info);
  }).then(function (info) {
    return getUrls(info, EXISTING_URL_INDEX);
  }).then(function (urlsArray) {
    req.pagesToCrawl = urlsArray;
    next();
  }).catch(function (err) {
    console.log(err);
    res.send(err.message);
  });
}

function processPageData(req, res, next) {
  var date = new Date();
  console.log('Process Data', date.toTimeString());

  var pagesCrawled = req.pagesCrawled;
  var info = req.googleSheets.info;
  var brokenLinks = req.brokenLinks;

  var updatePromise = void 0,
      linksPromise = void 0;

  if (pagesCrawled && pagesCrawled.length) {
    req.notification = true;
    var newUrlSheet = info.worksheets[NEW_URL_INDEX];
    var rowCount = Math.max(pagesCrawled.length + 1, newUrlSheet.rowCount);
    var colCount = Math.max(COL_COUNT, newUrlSheet.colCount);
    var newOptions = {
      sheet: newUrlSheet,
      rowCount: rowCount,
      colCount: colCount,
      minRow: 2,
      newCells: pagesCrawled,
      isCellToCell: false
    };

    updatePromise = updateSheetCells(newOptions).then(function (sheet) {
      return 'new urls added';
    }).catch(function (err) {
      throw err;
    });
  }

  if (brokenLinks && brokenLinks.length) {
    (function () {
      req.notification = true;
      var brokenLinkSheet = info.worksheets[BROKEN_LINKS_INDEX];
      var rowCount = Math.max(brokenLinks + 1, brokenLinkSheet.rowCount);
      var colCount = Math.max(COL_COUNT, brokenLinkSheet.colCount);
      var clearLinksOptions = {
        sheet: brokenLinkSheet,
        headers: ['page_url', 'link_url']
      };
      var addLinksOptions = {
        sheet: brokenLinkSheet,
        rowCount: rowCount,
        colCount: colCount,
        minRow: 2,
        newCells: brokenLinks,
        isCellToCell: false
      };

      linksPromise = clearSheet(clearLinksOptions).then(function (msg) {
        return updateSheetCells(addLinksOptions);
      }).then(function (sheet) {}).catch(function (err) {
        throw err;
      });
    })();
  }

  Promise.all([updatePromise, linksPromise]).then(function (results) {
    getEmails(req, res, next);
  }).catch(function (err) {
    console.log(err);
    res.send(err.message);
  });
}

// Start by getting the sheet by ID
function getDoc(req) {
  // First option is to use ID entered into the form, then any environment
  // variables
  var docId = req.body.docId;

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
}

// Get correct sheet, depending on whether your reading or writing
function getWorksheets(doc) {
  return new Promise(function (resolve, reject) {
    doc.getInfo(function (err, info) {
      if (!info) {
        reject(Error('The Google Sheets ID was invalid.'));
      } else if (err) {
        reject(err);
        // If you've already crawled, write rows to new URLs sheet
      } else {
        resolve(info);
      }
    });
  });
}

// Function for deleting rows that are missing URLs and adding status 200
// to rows without statuses
function checkExistingRows(info, rows) {
  var promiseArray = [];

  for (var i = rows.length - 1; i > 0; i--) {
    var thisRow = rows[i];

    // resetTimer(thisRow, i);
    if (i % 500 === 0) {
      var index = i;

      promiseArray[index] = timeout(thisRow).then(function (row) {
        return checkRow(row);
      }).catch(function (err) {
        throw err;
      });
    } else {
      promiseArray[i] = checkRow(thisRow);
    }
  }

  return Promise.all(promiseArray).then(function (results) {
    return new Promise(function (resolve, reject) {
      resolve(info);
    });
  }).catch(function (err) {
    throw err;
  });

  function timeout(row) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        resolve(row);
      }, 0);
    });
  }

  function checkRow(row) {
    return new Promise(function (resolve, reject) {
      if (row.url && row.status) {
        resolve();
      } else if (row.status) {
        row.del(function (err) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } else {
        row.status = 200;
        row.save(function (err) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      }
    });
  }
}

// Copy URLs from 'New/Modified URLs' over to 'Existing URLs'
function moveNewUrls(info) {
  var newUrlSheet = info.worksheets[NEW_URL_INDEX];

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
        throw err;
      });
      var existingUrlsSheet = info.worksheets[EXISTING_URL_INDEX];
      var updatePromise = getSheetRows(existingUrlsSheet).then(function (rows) {
        var existingUrlSheet = info.worksheets[EXISTING_URL_INDEX];
        var newRowCount = newCells.length / COL_COUNT;
        var existingRowCount = rows.length;
        var minRow = existingRowCount + 1;
        var revisedRowCount = Math.max(existingRowCount + newRowCount, existingUrlSheet.rowCount);
        var revisedColCount = Math.max(COL_COUNT, existingUrlSheet.colCount);
        var options = {
          sheet: existingUrlSheet,
          rowCount: revisedRowCount,
          colCount: revisedColCount,
          minRow: minRow,
          newCells: newCells,
          isCellToCell: true
        };

        return updateSheetCells(options);
      }).then(function (sheet) {
        return sheet;
      }).catch(function (err) {
        throw err;
      });

      Promise.all([clearPromise, updatePromise]).then(function (results) {
        resolve(results[1]);
      }).catch(function (err) {
        throw err;
      });
    });
  });
}

// Gets e-mail addresses listed in Google Sheets to send
// a notification e-mail
function getEmails(req, res, next) {
  var info = req.googleSheets.info;
  var notification = req.notification;

  // heapdump.writeSnapshot((err, filename) => {
  //   if (err) console.log(err);
  //   console.log('dump written to', filename);
  // });

  // Only send an e-mail if there are new URLs or broken links

  if (notification) {
    var infoSheet = info.worksheets[INFO_SHEET_INDEX];
    getSheetRows(infoSheet).then(function (rows) {
      // **** NOTE: 'getRows' removes '_' from column names ****
      var emailRow = rows[0].emailrecipients;

      if (emailRow) {
        // Save e-mail list as array to pass on to Postmark
        var emails = emailRow.split(/,\s*/g);
        req.emailList = emails;
      }
      next();
    }).catch(function (err) {
      console.log(err);
      res.send(err.message);
    });
  } else {
    var date = new Date();
    console.log(date.toTimeString(), 'No new info');
    next();
  }
}

// Collect array of URLs that you want to check
// (found in 'Existing URLs' sheet)
function getUrls(urlSheet) {
  return getSheetRows(urlSheet).then(function (rows) {
    // Push all rows of 'Existing URLs' into 'pagesToCrawl' for use
    // by crawler.js
    var urlsArray = rows.filter(function (row) {
      return row.url && row;
    }).map(function (row) {
      return {
        url: row.url.replace(/\/$/, ''),
        status: parseFloat(row.status)
      };
    });

    return urlsArray;
  }).catch(function (err) {
    throw err;
  });
}

function getSheetRows(sheet) {
  return new Promise(function (resolve, reject) {
    sheet.getRows({ offset: 1, orderby: 'col2' }, function (err, rows) {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
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

        var properties = sheet.id === BROKEN_LINKS_SHEET_ID ? ['page_url', 'link_url'] : ['url', 'status'];

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

exports.prepareToCrawl = prepareToCrawl;
exports.processPageData = processPageData;
//# sourceMappingURL=sheets-helper.js.map