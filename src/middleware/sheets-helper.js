import GoogleSpreadsheet from 'google-spreadsheet';
// import heapdump from 'heapdump';
import configAuth from '../config/auth.js';

const COL_COUNT = 2;

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
  let processCount = 0;

  existingUrlSheet.getRows((err, rows) => {
    if (err) {
      console.log(err);
      res.send(err.message);
    } else {
      processCount++;

      for (let i = rows.length - 1; i > 0; i--) {
        let thisRow = rows[i];

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
      setTimeout(checkRow(row), 0);
    } else {
      checkRow(row);
    }
  }

  function checkRow(row) {
    if (!row.url) {
      modifyRow(row.del);
    } else if (!row.status) {
      row.status = 200;
      modifyRow(row.save);
    }
  }

  function modifyRow(func) {
    processCount++;
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
      const newRowCount = newCells.length / COL_COUNT;
      const revisedRowCount = existingRowCount + newRowCount;
      const revisedColCount = Math.max(COL_COUNT, existingUrlSheet.colCount);

      sheet.resize({
        'rowCount': revisedRowCount,
        'colCount': revisedColCount
      }, err => {
        if (err) {
          console.log(err);
          res.send(err.message);
        }

        sheet.getCells({
          'min-row': existingRowCount + 1,
          'min-col': 1,
          'max-col': COL_COUNT,
          'return-empty': true
        }, (err, existingCells) => {
          if (err) {
            console.log(err);
            res.send(err.message);
          }

          for (let i = 0; i < existingCells.length; i++) {
            const thisExistingCell = existingCells[i];
            const thisNewCell = newCells[i];

            if (thisNewCell && thisNewCell.value && thisExistingCell) {
              thisExistingCell.value = thisNewCell.value;
            }
          }

          sheet.bulkUpdateCells(existingCells, err => {
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
  const rowCount = pagesCrawled.length;

  newUrlSheet.resize({
    'rowCount': rowCount + 1,
    'colCount': Math.max(COL_COUNT, newUrlSheet.colCount)
  }, err => {
    if (err) {
      console.log(err);
      res.send(err.message);
    }

    newUrlSheet.getCells({
      'min-row': 2,
      'min-col': 1,
      'max-col': COL_COUNT,
      'return-empty': true
    }, (err, cells) => {
      if (err) {
        console.log(err);
        res.send(err.message);
      } else {
        for (let i = 0; i < rowCount * COL_COUNT; i++) {
          let thisCell = cells[i];
          const pageIndex = Math.floor(i / COL_COUNT);
          const thisPage = pagesCrawled[pageIndex];

          if (thisCell && thisPage) {
            const column = thisCell.col;
            const value = column === 1 ?
              thisPage.url :
              thisPage.status;
            thisCell.value = value;
          }
        }

        newUrlSheet.bulkUpdateCells(cells, err => {
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
  const brokenLinkSheet = req.googleSheets.info.worksheets[3];

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

        // Add rows to broken links sheet, then go to 'getEmails'
        brokenLinkSheet.resize({
          'rowCount': req.brokenLinks + 1,
          'colCount': Math.max(COL_COUNT, brokenLinkSheet.colCount)
        }, err => {
          if (err) {
            console.log(err);
            res.send(err.message);
          }

          brokenLinkSheet.getCells({
            'min-row': 2,
            'min-col': 1,
            'max-col': COL_COUNT
          }, (err, cells) => {
            if (err) {
              console.log(err);
              res.send(err.message);
            }

            const {brokenLinks} = req;

            for (let i = 0; i < cells.length; i++) {
              const thisCell = cells[i];
              const column = thisCell.col;
              const thisLink = brokenLinks[i];

              if (thisLink && thisCell) {
                const value = column === 1 ?
                  thisLink.url :
                  thisLink.status;
                thisCell.value = value;
              }
            }

            brokenLinkSheet.bulkUpdateCells(cells, err => {
              getEmails(req, res, next);
            });
          });
        });
      }
    );
  });
}

// Function for adding rows to a given sheet
function appendRow(sheet, rowsArray, loopCount, params, callback) {
  const thisRow = rowsArray[loopCount];
  const {next, req, res, info} = params;
  loopCount++;

  // If there's another row to add, add it and repeat 'appendRow'
  if (thisRow) {
    sheet.addRow(thisRow, err => {
      if (err) {
        console.log(err);
      }

      // Only send e-mail notification if new rows are added
      req.notification = true;

      if (rowsArray.length % 500 === 0) {
        // heapdump.writeSnapshot((err, filename) => {
        //   if (err) console.log(err);
        //   console.log('dump written to', filename);
        // });

        setTimeout(appendRow(sheet, rowsArray, loopCount, params, callback), 0);
      } else {
        appendRow(sheet, rowsArray, loopCount, params, callback);
      }
    });
  // Otherwise, invoke callback
  } else {
    callback(req, res, next, info);
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

export default getSpreadsheet;
