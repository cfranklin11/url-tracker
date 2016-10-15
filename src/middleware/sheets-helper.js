import GoogleSpreadsheet from 'google-spreadsheet';
// import heapdump from 'heapdump';
import configAuth from '../config/auth.js';

// Start by getting the sheet by ID
function getSpreadsheet(req, res, next) {
  // First option is to use ID entered into the form, then any environment
  // variables
  const docId = /*configAuth.doc_id;*/req.body.sheet;
  const doc = new GoogleSpreadsheet(docId);
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
      res.send(err);
    } else {
      getWorksheets(req, res, next, doc);
    }
  });
}

// Get correct sheet, depending on whether your reading or writing
function getWorksheets(req, res, next, doc) {
  doc.getInfo((err, info) => {
    if (!info) {
      res.status(400).send('The Google Sheets ID was invalid.');
    } else if (err) {
      console.log(err);
      res.status(400).send(err);
    // If you've already crawled, write rows to new URLs sheet
    } else if (req.pagesCrawled) {
      setTimeout(function() {
        addChangedUrls(req, res, next, info);
      }, 0);
    // Otherwise, delete blank URL rows
    } else {
      // testCells(req, res, next, info);
      modifyErrorRows(req, res, next, info);
    }
  });
}

// function testCells(req, res, next, info) {
//   const sheet = info.worksheets[2];
//   sheet.getCells({'min-row': 10, 'min-col': 2, 'return-empty': true}, (err, cells) => {
//     if (err) console.log(err);
//     console.log(cells);
//     next();
//   });
// }

// Function for deleting rows that are missing URLs and adding status 200
// to rows without statuses
function modifyErrorRows(req, res, next, info) {
  const sheet = info.worksheets[1];

  sheet.getRows({offset: 1, orderby: 'col2'},
  (err, rows) => {
    if (err) {
      console.log(err);
    }

    let loopCount = 0;
    modifyRow(rows, loopCount);
  });

  // Function for modifying rows that can cause errors
  function modifyRow(rows, loopCount) {
    // Use last element, because row.del() will remove bottom row
    // with same url/status
    const thisRow = rows[rows.length - 1 - loopCount];
    loopCount++;

    if (thisRow) {
      // Delete rows without URLS, then call modifyRow again,
      // or moveNewUrls if no more rows
      if (!thisRow.url) {
        thisRow.del(err => {
          if (err) {
            console.log(err);
          }

          resetTimer(rows, loopCount);
        });
      // If row is complete, call modify Row again
      } else if (thisRow.status) {
        resetTimer(rows, loopCount);
      // Add '200' to rows with empty statuses
      } else {
        thisRow.status = 200;
        thisRow.save(err => {
          if (err) {
            console.log(err);
          }

          resetTimer(rows, loopCount);
        });
      }
    } else {
      moveNewUrls(req, res, next, info);
    }
  }

  // Reset timer every 500 rows to avoid timeout error
  function resetTimer(rowsArray, loopCount) {
    if (rowsArray.length % 500 === 0) {
      setTimeout(modifyRow(rowsArray), 0);
    } else {
      modifyRow(rowsArray, loopCount);
    }
  }
}

// Copy URLs from 'New/Modified URLs' over to 'Existing URLs'
function moveNewUrls(req, res, next, info) {
  const existingUrlSheet = info.worksheets[1];
  const params = {
    req: req,
    res: res,
    next: next,
    info: info
  };
  let newUrlSheet = info.worksheets[2];

  newUrlSheet.getRows(
    {offset: 1, orderby: 'col2'},
    (err, rows) => {
      if (err) {
        console.log(err);
      }

      // Rows array has a lot of extra data, so map to get
      // only URL and status code
      const newUrlRows = rows.map(row => {
        return {
          url: row.url,
          status: row.status
        };
      });

      newUrlSheet.clear(function(err) {
        if (err) {
          console.log(err);
        }

        // Clear removes everything, so put back column labels
        newUrlSheet.setHeaderRow(
          ['url', 'status'],
          err => {
            if (err) {
              console.log(err);
            }

            let loopCount = 0;
            appendRow(existingUrlSheet, newUrlRows, loopCount, params, getUrls);
          }
        );
      });
    }
  );
}

// Collect array of URLs that you want to check
// (found in 'Existing URLs' sheet)
function getUrls(req, res, next, info) {
  const urlSheet = info.worksheets[1];

  urlSheet.getRows(
    {offset: 1, orderby: 'col2'},
    (err, rows) => {
      if (err) {
        console.log(err);
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
function addChangedUrls(req, res, next, info) {
  const {pagesCrawled} = req;
  const COL_COUNT = 2;
  const newUrlSheet = info.worksheets[2];
  // const params = {
  //   req: req,
  //   res: res,
  //   next: next,
  //   info: info
  // };
  const rowCount = pagesCrawled.length;

  newUrlSheet.resize({
    'rowCount': rowCount + 1,
    'colCount': COL_COUNT
  }, err => {
    if (err) {
      console.log(err);
      next();
    }

    newUrlSheet.getCells({
      'min-row': 2,
      'min-col': 1,
      'max-col': COL_COUNT,
      'return-empty': true
    }, (err, cells) => {
      if (err) {
        console.log(err);
        next();
      } else {
        for (let i = 0; i < rowCount * COL_COUNT; i++) {
          let thisCell = cells[i];
          const pageIndex = Math.floor(i / COL_COUNT);
          const thisPage = pagesCrawled[pageIndex];

          if (thisCell && thisPage) {
            const column = thisCell.col;
            const value = column === 1 ?
              thisPage.url :
              thisPage.status.toString();
            thisCell.value = value;
          }
        }

        newUrlSheet.bulkUpdateCells(cells, err => {
          if (err) {
            console.log(err);
            next();
          } else {
            addBrokenLinks(req, res, next, info);
          }
        });
      }
    });
  });
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

        let loopCount = 0;
        // Add rows to broken links sheet, then go to 'getEmails'
        appendRow(
          brokenLinkSheet,
          req.brokenLinks,
          loopCount,
          params,
          getEmails
        );
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
function getEmails(req, res, next, info) {
  var infoSheet, emailRow, emails;

  infoSheet = info.worksheets[0];

  // heapdump.writeSnapshot((err, filename) => {
  //   if (err) console.log(err);
  //   console.log('dump written to', filename);
  // });

  // Only send an e-mail if there are new URLs or broken links
  if (req.notification) {
    infoSheet.getRows(
      {offset: 1, orderby: 'col2'},
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
        next();
      }
    );
  } else {
    console.log('No new info');
    next();
  }
}

export default getSpreadsheet;
