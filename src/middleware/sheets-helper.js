const GoogleSpreadsheet = require('google-spreadsheet');
const configAuth = require('../config/auth.js');

const COL_COUNT = 2;
const INFO_SHEET_INDEX = 0;
const EXISTING_URL_INDEX = 1;
const NEW_URL_INDEX = 2;
const BROKEN_LINKS_INDEX = 2;
const BROKEN_LINKS_SHEET_ID = 4;

function prepareToCrawl(req, res, next) {
  const date = new Date();
  req.runTimer = date;
  console.log('Start', date.toTimeString());

  getDoc(req)
    .then(doc => {
      return getWorksheets(doc);
    })
    .then(info => {
      req.googleSheets = {info};
      const existingUrlsSheet = info.worksheets[EXISTING_URL_INDEX];
      return getSheetRows(existingUrlsSheet);
    })
    .then(rows => {
      return checkExistingRows(req.googleSheets.info, rows);
    })
    .then(info => {
      return moveNewUrls(info);
    })
    .then(info => {
      return getUrls(info, EXISTING_URL_INDEX);
    })
    .then(urlsArray => {
      req.pagesToCrawl = urlsArray;
      next();
    })
    .catch(err => {
      console.log(err);
      res.send(err.message);
    }
  );
}

function processPageData(req, res, next) {
  const date = new Date();
  console.log('Process Data', date.toTimeString());

  const {pagesCrawled, googleSheets: {info}, brokenLinks} = req;
  let updatePromise, linksPromise;

  if (pagesCrawled && pagesCrawled.length) {
    req.notification = true;
    const newUrlSheet = info.worksheets[NEW_URL_INDEX];
    const rowCount = Math.max(pagesCrawled.length + 1, newUrlSheet.rowCount);
    const colCount = Math.max(COL_COUNT, newUrlSheet.colCount);
    const newOptions = {
      sheet: newUrlSheet,
      rowCount,
      colCount,
      minRow: 2,
      newCells: pagesCrawled,
      isCellToCell: false
    };

    updatePromise = updateSheetCells(newOptions)
      .then(sheet => {
        return 'new urls added';
      })
      .catch(err => {
        throw err;
      }
    );
  }

  if (brokenLinks && brokenLinks.length) {
    req.notification = true;
    const brokenLinkSheet = info.worksheets[BROKEN_LINKS_INDEX];
    const rowCount =
      Math.max(brokenLinks + 1, brokenLinkSheet.rowCount);
    const colCount = Math.max(COL_COUNT, brokenLinkSheet.colCount);
    const clearLinksOptions = {
      sheet: brokenLinkSheet,
      headers: ['page_url', 'link_url']
    };
    const addLinksOptions = {
      sheet: brokenLinkSheet,
      rowCount,
      colCount,
      minRow: 2,
      newCells: brokenLinks,
      isCellToCell: false
    };

    linksPromise = clearSheet(clearLinksOptions)
      .then(msg => {
        return updateSheetCells(addLinksOptions);
      })
      .then(sheet => {
      })
      .catch(err => {
        throw err;
      }
    );
  }

  Promise.all([updatePromise, linksPromise])
    .then(results => {
      getEmails(req, res, next);
    })
    .catch(err => {
      console.log(err);
      res.send(err.message);
    }
  );
}

// Start by getting the sheet by ID
function getDoc(req) {
  // First option is to use ID entered into the form, then any environment
  // variables
  const {docId} = req.body;
  const doc = new GoogleSpreadsheet(docId);
  const {client_email, private_key} = configAuth;
  // Credentials obtained via environment variables imported to auth.js
  const credsJson = {client_email, private_key};

  return new Promise((resolve, reject) => {
    doc.useServiceAccountAuth(credsJson, err => {
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
  return new Promise((resolve, reject) => {
    doc.getInfo((err, info) => {
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
  const promiseArray = [];

  for (let i = rows.length - 1; i > 0; i--) {
    let thisRow = rows[i];

    // resetTimer(thisRow, i);
    if (i % 500 === 0) {
      const index = i;

      promiseArray[index] = timeout(thisRow)
        .then(row => {
          return checkRow(row);
        })
        .catch(err => {
          throw err;
        }
      );
    } else {
      promiseArray[i] = checkRow(thisRow);
    }
  }

  return Promise.all(promiseArray)
    .then(results => {
      return new Promise((resolve, reject) => {
        resolve(info);
      });
    })
    .catch(err => {
      throw err;
    }
  );

  function timeout(row) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(row);
      }, 0);
    });
  }

  function checkRow(row) {
    return new Promise((resolve, reject) => {
      if (row.url && row.status) {
        resolve();
      } else if (row.status) {
        row.del(err => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } else {
        row.status = 200;
        row.save(err => {
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

// Copy URLs = require('New/Modified URLs' over to 'Existing URLs'
function moveNewUrls(info) {
  const newUrlSheet = info.worksheets[NEW_URL_INDEX];

  return new Promise((resolve, reject) => {
    newUrlSheet.getCells({
      'min-row': 2,
      'min-col': 1,
      'max-col': COL_COUNT,
      'return-empty': false
    }, (err, newCells) => {
      if (err) {
        reject(err);
      }

      const clearOptions = {
        sheet: newUrlSheet,
        headers: ['url', 'status']
      };
      const clearPromise = clearSheet(clearOptions)
        .then(msg => {
          return msg;
        })
        .catch(err => {
          throw err;
        });
      const existingUrlsSheet = info.worksheets[EXISTING_URL_INDEX];
      const updatePromise = getSheetRows(existingUrlsSheet)
        .then(rows => {
          const existingUrlSheet = info.worksheets[EXISTING_URL_INDEX];
          const newRowCount = newCells.length / COL_COUNT;
          const existingRowCount = rows.length;
          const minRow = existingRowCount + 1;
          const revisedRowCount = Math.max(
            existingRowCount + newRowCount,
            existingUrlSheet.rowCount
          );
          const revisedColCount =
            Math.max(COL_COUNT, existingUrlSheet.colCount);
          const options = {
            sheet: existingUrlSheet,
            rowCount: revisedRowCount,
            colCount: revisedColCount,
            minRow,
            newCells,
            isCellToCell: true
          };

          return updateSheetCells(options);
        })
        .then(sheet => {
          return sheet;
        })
        .catch(err => {
          throw err;
        }
      );

      Promise.all([clearPromise, updatePromise])
        .then(results => {
          resolve(results[1]);
        })
        .catch(err => {
          throw err;
        }
      );
    });
  });
}

// Gets e-mail addresses listed in Google Sheets to send
// a notification e-mail
function getEmails(req, res, next) {
  const {googleSheets: {info}, notification} = req;

  // Only send an e-mail if there are new URLs or broken links
  if (notification) {
    const infoSheet = info.worksheets[INFO_SHEET_INDEX];
    getSheetRows(infoSheet)
      .then(rows => {
        // **** NOTE: 'getRows' removes '_' = require(column names ****
        const emailRow = rows[0].emailrecipients;

        if (emailRow) {
          // Save e-mail list as array to pass on to Postmark
          const emails = emailRow.split(/,\s*/g);
          req.emailList = emails;
        }
        next();
      })
      .catch(err => {
        console.log(err);
        res.send(err.message);
      });
  } else {
    const date = new Date();
    console.log(date.toTimeString(), 'No new info');
    next();
  }
}

// Collect array of URLs that you want to check
// (found in 'Existing URLs' sheet)
function getUrls(urlSheet) {
  return getSheetRows(urlSheet)
    .then(rows => {
      // Push all rows of 'Existing URLs' into 'pagesToCrawl' for use
      // by crawler.js
      const urlsArray = rows
        .filter(row => {
          return row.url && row;
        })
        .map(function(row) {
          return {
            url: row.url.replace(/\/$/, ''),
            status: parseFloat(row.status)
          };
        });

      return urlsArray;
    })
    .catch(err => {
      throw err;
    }
  );
}

function getSheetRows(sheet) {
  return new Promise((resolve, reject) => {
    sheet.getRows({offset: 1, orderby: 'col2'},
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
}

function clearSheet(options) {
  const {sheet, headers} = options;

  return new Promise((resolve, reject) => {
    sheet.clear(err => {
      if (err) {
        reject(err);
      } else {
        sheet.setHeaderRow(
        headers,
        err => {
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
  const {
    sheet,
    rowCount,
    colCount,
    minRow,
    newCells,
    isCellToCell
  } = options;

  return new Promise((resolve, reject) => {
    sheet.resize({
      'rowCount': rowCount,
      'colCount': colCount
    }, err => {
      if (err) {
        reject(err);
      }

      sheet.getCells({
        'min-row': minRow,
        'min-col': 1,
        'max-col': COL_COUNT,
        'return-empty': true
      }, (err, existingCells) => {
        if (err) {
          reject(err);
        }

        const properties = sheet.id === BROKEN_LINKS_SHEET_ID ?
          ['page_url', 'link_url'] :
          ['url', 'status'];

        for (let i = 0; i < existingCells.length; i++) {
          const thisExistingCell = existingCells[i];
          const thisNewCell = isCellToCell ?
            newCells[i] :
            newCells[Math.floor(i / COL_COUNT)];

          if (thisNewCell && thisExistingCell) {
            if (isCellToCell) {
              thisExistingCell.value = thisNewCell.value;
            } else {
              const propertyIndex = thisExistingCell.col - 1;
              const value = thisNewCell[properties[propertyIndex]];
              thisExistingCell.value = value;
            }
          }
        }

        sheet.bulkUpdateCells(existingCells, err => {
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

module.exports = {prepareToCrawl, processPageData};
