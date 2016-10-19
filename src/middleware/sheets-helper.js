/* eslint no-trailing-spaces: 0 */
/* eslint no-unused-vars: 0 */

import GoogleSpreadsheet from 'google-spreadsheet';
// import heapdump from 'heapdump';
import configAuth from '../config/auth.js';

const COL_COUNT = 2;
const EXISTING_URL_INDEX = 1;
const NEW_URL_INDEX = 2;
const BROKEN_LINKS_SHEET_ID = 4;

function prepareToCrawl(req, res, next) {
  getDoc(req)
    .then(doc => {
      return getWorksheets(doc);
    })
    .then(info => {
      return getSheetRows(info, EXISTING_URL_INDEX);
    })
    .then((info, rows) => {
      return checkExistingRows(info, rows);
    })
    .then(info => {
      return moveNewUrls(info);
    })
    .then(sheet => {
      return getUrls(sheet);
    })
    .then(urlsArray => {
      req.pagesToCrawl = urlsArray;
      next();
    })
    .catch(err => {
      console.log(err);
      res.send(err.message);
    });
}

// Start by getting the sheet by ID
function getDoc(req, res, next) {
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
  // const {doc} = req.googleSheets;

  return new Promise((resolve, reject) => {
    doc.getInfo((err, info) => {
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

function getSheetRows(info, sheetIndex) {
  const sheet = info.worksheets[sheetIndex];

  return new Promise((resolve, reject) => {
    sheet.getRows({offset: 1, orderby: 'col2'},
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(info, rows);
        }
      }
    );
  });
}

// Function for deleting rows that are missing URLs and adding status 200
// to rows without statuses
function checkExistingRows(info, rows) {
  const existingUrlSheet = info.worksheets[1];
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
          console.log(err);
        });
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
      console.log(err);
    });

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

// Copy URLs from 'New/Modified URLs' over to 'Existing URLs'
function moveNewUrls(info) {
  const existingUrlSheet = info.worksheets[EXISTING_URL_INDEX];
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

      clearSheet(clearOptions)
        .then(msg => {
          return msg;
        })
        .catch(err => {
          console.log(err);
        });

      getSheetRows(info, EXISTING_URL_INDEX)
        .then((info, rows) => {
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
          console.log(err);
        });
    });
  });
}

// Collect array of URLs that you want to check
// (found in 'Existing URLs' sheet)
function getUrls(urlSheet) {
  return new Promise((resolve, reject) => {
    urlSheet.getRows(
      {offset: 1, orderby: 'col2'},
      (err, rows) => {
        if (err) {
          reject(err);
        }

        // Push all rows of 'Existing URLs' into 'pagesToCrawl' for use
        // by crawler.js
        const pagesToCrawl = rows
          .filter(row => {
            return row.url && row;
          })
          .map(function(row) {
            return {
              url: row.url.replace(/\/$/, ''),
              status: parseFloat(row.status)
            };
          });

        return pagesToCrawl;
      }
    );
  });
}

// After crawling, add 'pagesCrawled' info to new URLs sheet
// (only includes pages that have changed from those in 'Existing URLs')
function addChangedUrls(req, res, next) {
  const {pagesCrawled, googleSheets} = req;

  return new Promise((resolve, reject) => {
    if (pagesCrawled && pagesCrawled.length) {
      req.notification = true;
      const newUrlSheet = googleSheets.info.worksheets[2];
      const rowCount = Math.max(pagesCrawled.length + 1, newUrlSheet.rowCount);
      const colCount = Math.max(COL_COUNT, newUrlSheet.colCount);
      const options = {
        sheet: newUrlSheet,
        rowCount,
        colCount,
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

// Add broken links info to 'Broken Links' sheet
function addBrokenLinks(req, res, next) {
  const {info} = req.googleSheets;
  const brokenLinkSheet = info.worksheets[3];
  const options = {
    sheet: brokenLinkSheet,
    headers: ['page_url', 'link_url'],
    callback: updateBrokenLinks
  };

  clearSheet(options);

  function updateBrokenLinks(req, res, next) {
    const {brokenLinks, googleSheets: {info}} = req;
    const brokenLinkSheet = info.worksheets[3];

    if (brokenLinks && brokenLinks.length) {
      req.notification = true;
      const rowCount =
        Math.max(brokenLinks + 1, brokenLinkSheet.rowCount);
      const colCount = Math.max(COL_COUNT, brokenLinkSheet.colCount);
      const options = {
        sheet: brokenLinkSheet,
        rowCount,
        colCount,
        minRow: 2,
        newCells: brokenLinks,
        isCellToCell: false,
        callback: getEmails
      };

      updateSheetCells(req, res, next, options);
    }
  }
}

// Gets e-mail addresses listed in Google Sheets to send
// a notification e-mail
function getEmails(req, res, next) {
  const infoSheet = req.googleSheets.info.worksheets[0];

  // heapdump.writeSnapshot((err, filename) => {
  //   if (err) console.log(err);
  //   console.log('dump written to', filename);
  // });

  // Only send an e-mail if there are new URLs or broken links
  if (req.notification) {
    infoSheet.getRows(
      {offset: 1, orderby: 'col2'},
      (err, rows) => {
        if (err) {
          console.log(err);
          res.send(err.message);
        }

        // **** NOTE: 'getRows' removes '_' from column names ****
        const emailRow = rows[0].emailrecipients;

        if (emailRow) {
          // Save e-mail list as array to pass on to Postmark
          const emails = emailRow.split(/,\s*/g);
          req.emailList = emails;
        }
        next();
      }
    );
  } else {
    console.log('No new info');
    next();
  }
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

export {prepareToCrawl, processPageData};
