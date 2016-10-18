/* eslint no-trailing-spaces: 0 */

import GoogleSpreadsheet from 'google-spreadsheet';
// import heapdump from 'heapdump';
import configAuth from '../config/auth.js';

const COL_COUNT = 2;

// Start by getting the sheet by ID
function getSpreadsheet(req, res, next) {
  // First option is to use ID entered into the form, then any environment
  // variables
  const {docId} = req.body;
  req.googleSheets = {doc: new GoogleSpreadsheet(docId)};
  const expressObjects = [req, res, next];

  setAuth(...expressObjects)
    .then(updatedExpressObjects => {
      return getWorksheets(...updatedExpressObjects);
    })
    .then(updatedExpressObjects => {
      const [updatedReq] = updatedExpressObjects;

      if (updatedReq.pagesCrawled) {
        updateUrls(...updatedExpressObjects);
      // Otherwise, delete blank URL rows
      } else {
        modifyErrorRows(...updatedExpressObjects);
      }
    })
    .catch(err => {
      console.log(err);
    });
}

function updateUrls(req, res, next) {
  const updatedExpressObjects = [req, res, next];

  setTimeout(() => {
    addChangedUrls(...updatedExpressObjects);
    addBrokenLinks(...updatedExpressObjects);
  }, 0);
}

// Get auth credentials to make changes to sheet
function setAuth(req, res, next) {
  const {client_email, private_key} = configAuth;
  // Credentials obtained via environment variables imported to auth.js
  const credsJson = {client_email, private_key};

  return new Promise((resolve, reject) => {
    req.googleSheets.doc.useServiceAccountAuth(credsJson, err => {
      if (err) {
        reject(err);
      } else {
        const updatedExpressObjects = [req, res, next];
        resolve(updatedExpressObjects);
      }
    });
  });
}

// Get correct sheet, depending on whether your reading or writing
function getWorksheets(req, res, next) {
  const {doc} = req.googleSheets;

  return new Promise((resolve, reject) => {
    doc.getInfo((err, info) => {
      if (!info) {
        reject(Error('The Google Sheets ID was invalid.'));
      } else if (err) {
        reject(err);
      // If you've already crawled, write rows to new URLs sheet
      } else {
        req.googleSheets.info = info;
        const updatedExpressObjects = [req, res, next];
        resolve(updatedExpressObjects);
      }
    });
  });
}

// Function for deleting rows that are missing URLs and adding status 200
// to rows without statuses
function modifyErrorRows(req, res, next) {
  const existingUrlSheet = req.googleSheets.info.worksheets[1];
  const promiseArray = [];

  return new Promise((resolve, reject) => {
    existingUrlSheet.getRows((err, rows) => {
      if (err) {
        reject(err);
      } else {
        for (let i = rows.length - 1; i > 0; i--) {
          let thisRow = rows[i];

          // resetTimer(thisRow, i);
          if (i % 500 === 0) {
            const timeout = true;
            const index = i;

            setTimeout(() => {
              promiseArray[index] = checkRow(thisRow, timeout);
            }, 0);
          } else {
            promiseArray[i] = checkRow(thisRow);
          }
        }

        Promise.all(promiseArray)
          .then(results => {
            resolve(req, res, next);
          })
          .catch(err => {
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
    return new Promise((resolve, reject) => {
      func(err => {
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
function moveNewUrls(info) {
  const existingUrlSheet = info.worksheets[1];
  const newUrlSheet = info.worksheets[2];

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
          console.log(msg);
        })
        .catch(err => {
          console.log(err);
        });
      const updatePromise = updateExistingSheet(existingUrlSheet, newCells)
        .then(options => {
          return updateSheetCells(options);
        })
        .then(sheet => {
          return getUrls(sheet);
        })
        .catch(err => {
          console.log(err);
        });

      Promise.all([clearPromise, updatePromise])
        .then(results => {
          console.log(results[0]);
          resolve(results[1]);
        });
    });
  });

  function updateExistingSheet(existingUrlSheet, newCells) {
    return new Promise((resolve, reject) => {
      existingUrlSheet.getRows({offset: 1, orderby: 'col2'},
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            const existingRowCount = rows.length;
            const minRow = existingRowCount + 1;
            const newRowCount = newCells.length / COL_COUNT;
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
              isCellToCell: true,
              callback: getUrls
            };

            resolve(options);
            // updateSheetCells(req, res, next, options);
          }
        }
      );
    });
  }
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

  clearSheet(req, res, next, options);

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

        const properties = sheet.id === 4 ?
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

          // checkProcessCount(req, res, next, callback);
        });
      });
    });
  });
}

function clearSheet(options) {
  const {sheet, headers} = options;

  return new Promise((resolve, reject) => {
    gsClear(sheet)
      .then(() => {
        return gsSetHeaderRow(headers);
      })
      .catch(err => {
        console.log(err);
      });
  });

  function gsClear(sheet) {
    return new Promise((resolve, reject) => {
      sheet.clear(err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  function gsSetHeaderRow(headers) {
    return new Promise((resolve, reject) => {
      sheet.setHeaderRow(
      headers,
      err => {
        if (err) {
          reject(err);
        } else {
          resolve('clear done');
        }
      });
    });
  }
}

// function checkProcessCount(req, res, next, callback) {
//   if (processCount > 0) {
//     processCount--;
//   }
//
//   if (processCount === 0) {
//     callback(req, res, next);
//   }
// }

export default getSpreadsheet;
