/* eslint no-trailing-spaces: 0 */

import GoogleSpreadsheet from 'google-spreadsheet';
// import heapdump from 'heapdump';
import configAuth from '../config/auth.js';

const COL_COUNT = 2;
let processCount = 0;

// Start by getting the sheet by ID
function getSpreadsheet(req, res, next) {
  // First option is to use ID entered into the form, then any environment
  // variables
  const {docId} = req.body;
  req.googleSheets = {
    doc: new GoogleSpreadsheet(docId)
  };

  setAuth(req, res, next);
}

// Get auth credentials to make changes to sheet
function setAuth(req, res, next) {
  const {client_email, private_key} = configAuth;
  // Credentials obtained via environment variables imported to auth.js
  const credsJson = {client_email, private_key};

  req.googleSheets.doc.useServiceAccountAuth(credsJson, err => {
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
  const {doc} = req.googleSheets;

  doc.getInfo((err, info) => {
    if (!info) {
      res.status(400).send('The Google Sheets ID was invalid.');
    } else if (err) {
      console.log(err);
      res.status(400).send(err.message);
    // If you've already crawled, write rows to new URLs sheet
    } else {
      req.googleSheets.info = info;

      if (req.pagesCrawled) {
        setTimeout(() => {
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
  const existingUrlSheet = req.googleSheets.info.worksheets[1];

  existingUrlSheet.getRows((err, rows) => {
    if (err) {
      console.log(err);
      res.send(err.message);
    } else {
      processCount++;

      for (let i = rows.length - 1; i > 0; i--) {
        let thisRow = rows[i];

        // resetTimer(thisRow, i);
        if (i % 500 === 0) {
          processCount++;
          const timeout = true;

          setTimeout(checkRow(thisRow, timeout), 0);
        } else {
          checkRow(thisRow);
        }
      }

      processCount--;
      if (processCount === 0) {
        moveNewUrls(req, res, next);
      }
    }
  });

  // Reset timer every 500 rows to avoid timeout error
  // function resetTimer(row, index) {
  //
  // }

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

    func(err => {
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
  const {info} = req.googleSheets;
  const existingUrlSheet = info.worksheets[1];
  const newUrlSheet = info.worksheets[2];
  let processCount = 0;

  newUrlSheet.getCells({
    'min-row': 2,
    'min-col': 1,
    'max-col': COL_COUNT,
    'return-empty': false
  }, (err, newCells) => {
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
    sheet.clear(err => {
      if (err) {
        console.log(err);
        res.send(err.message);
      }

      // Clear removes everything, so put back column labels
      sheet.setHeaderRow(
        ['url', 'status'],
        err => {
          if (err) {
            console.log(err);
            res.send(err.message);
          }

          processCount--;
          if (processCount === 0) {
            getUrls(req, res, next);
          }
        }
      );
    });
  }

  function updateExistingSheet(sheet, newCells) {
    sheet.getRows({offset: 1, orderby: 'col2'},
      (err, rows) => {
        if (err) {
          console.log(err);
          res.send(err.message);
        }

        const existingRowCount = rows.length;
        const minRow = existingRowCount + 1;
        const newRowCount = newCells.length / COL_COUNT;
        const revisedRowCount =
          Math.max(existingRowCount + newRowCount, existingUrlSheet.rowCount);
        const revisedColCount = Math.max(COL_COUNT, existingUrlSheet.colCount);
        const options = {
          sheet,
          rowCount: revisedRowCount,
          colCount: revisedColCount,
          minRow,
          newCells,
          isCellToCell: true,
          callback: getUrls
        };

        updateSheetCells(req, res, next, options);
      }
    );
  }
}

// Collect array of URLs that you want to check
// (found in 'Existing URLs' sheet)
function getUrls(req, res, next) {
  const urlSheet = req.googleSheets.info.worksheets[1];

  urlSheet.getRows(
    {offset: 1, orderby: 'col2'},
    (err, rows) => {
      if (err) {
        console.log(err);
        res.send(err.message);
      }

      // Push all rows of 'Existing URLs' into 'pagesToCrawl' for use
      // by crawler.js
      req.pagesToCrawl = rows
        .filter(row => {
          return row.url && row;
        })
        .map(function(row) {
          return {
            url: row.url.replace(/\/$/, ''),
            status: row.status
          };
        });

      next();
    }
  );
}

// After crawling, add 'pagesCrawled' info to new URLs sheet
// (only includes pages that have changed from those in 'Existing URLs')
function addChangedUrls(req, res, next) {
  const {pagesCrawled, googleSheets} = req;
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
    callback: addBrokenLinks
  };

  updateSheetCells(req, res, next, options);

  // newUrlSheet.resize({
  //   'rowCount': rowCount,
  //   'colCount': colCount
  // }, err => {
  //   if (err) {
  //     console.log(err);
  //     res.send(err.message);
  //   }
  //
  //   newUrlSheet.getCells({
  //     'min-row': 2,
  //     'min-col': 1,
  //     'max-col': COL_COUNT,
  //     'return-empty': true
  //   }, (err, cells) => {
  //     if (err) {
  //       console.log(err);
  //       res.send(err.message);
  //     } else {
  //       for (let i = 0; i < rowCount * COL_COUNT; i++) {
  //         let thisCell = cells[i];
  //         const pageIndex = Math.floor(i / COL_COUNT);
  //         const thisPage = pagesCrawled[pageIndex];
  //
  //         if (thisCell && thisPage) {
  //           const column = thisCell.col;
  //           const value = column === 1 ?
  //             thisPage.url :
  //             thisPage.status;
  //           thisCell.value = value;
  //         }
  //       }
  //
  //       newUrlSheet.bulkUpdateCells(cells, err => {
  //         if (err) {
  //           console.log(err);
  //           res.send(err.message);
  //         } else {
  //           addBrokenLinks(req, res, next);
  //         }
  //       });
  //     }
  //   });
  // });
}

// Add broken links info to 'Broken Links' sheet
function addBrokenLinks(req, res, next) {
  const {brokenLinks, googleSheets: {info}} = req;
  const brokenLinkSheet = info.worksheets[3];

  // Clear previous broken links from the sheet
  brokenLinkSheet.clear(function(err) {
    if (err) {
      console.log(err);
      res.send(err.message);
    }

    // Clear removes everything, so put back column labels
    brokenLinkSheet.setHeaderRow(
      ['page_url', 'link_url'],
      err => {
        if (err) {
          console.log(err);
          res.send(err.message);
        }

        const rowCount =
          Math.max(req.brokenLinks + 1, brokenLinkSheet.rowCount);
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

        // Add rows to broken links sheet, then go to 'getEmails'
        // brokenLinkSheet.resize({
        //   'rowCount': rowCount,
        //   'colCount': colCount
        // }, err => {
        //   if (err) {
        //     console.log(err);
        //     res.send(err.message);
        //   }
        //
        //   brokenLinkSheet.getCells({
        //     'min-row': 2,
        //     'min-col': 1,
        //     'max-col': COL_COUNT
        //   }, (err, cells) => {
        //     if (err) {
        //       console.log(err);
        //       res.send(err.message);
        //     }
        //
        //     const {brokenLinks} = req;
        //
        //     for (let i = 0; i < cells.length; i++) {
        //       const thisCell = cells[i];
        //       const column = thisCell.col;
        //       const linkIndex = Math.floor(i / COL_COUNT);
        //       const thisLink = brokenLinks[linkIndex];
        //
        //       if (thisLink && thisCell) {
        //         const value = column === 1 ?
        //           thisLink.page_url :
        //           thisLink.link_url;
        //         thisCell.value = value;
        //       }
        //     }
        //
        //     brokenLinkSheet.bulkUpdateCells(cells, err => {
        //       if (err) {
        //         console.log(err);
        //         res.send(err);
        //       }
        //
        //       getEmails(req, res, next);
        //     });
        //   });
        // });
      }
    );
  });
}

function updateSheetCells(req, res, next, options) {
  const {
    sheet,
    rowCount,
    colCount,
    minRow,
    newCells,
    isCellToCell,
    callback
  } = options;

  sheet.resize({
    'rowCount': rowCount,
    'colCount': colCount
  }, err => {
    if (err) {
      console.log(err);
      res.send(err.message);
    }

    sheet.getCells({
      'min-row': minRow,
      'min-col': 1,
      'max-col': COL_COUNT,
      'return-empty': true
    }, (err, existingCells) => {
      if (err) {
        console.log(err);
        res.send(err.message);
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
          console.log(err);
          res.send(err.message);
        }

        processCount--;
        if (processCount === 0) {
          callback(req, res, next);
        }
      });
    });
  });
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

export default getSpreadsheet;
