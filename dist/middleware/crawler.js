'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _request = require('request');

var _request2 = _interopRequireDefault(_request);

var _cheerio = require('cheerio');

var _cheerio2 = _interopRequireDefault(_cheerio);

var _urlParse = require('url-parse');

var _urlParse2 = _interopRequireDefault(_urlParse);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// import heapdump from 'heapdump';

// Arrays for keeping track of page info as the crawler iterates through
// pages
var pageArrays = {
  pagesToVisit: [],
  errorPages: [],
  pagesVisited: [],
  brokenLinks: []
};
var loopCount = 0;
var PAGE_REG_EXP = /permalink|visited-locations|transcripts|news/i;
var TYPE_REG_EXP = /\.zip|\.doc|\.ppt|\.csv|\.xls|\.jpg|\.ash|\.png|\.aspx/i;

// Starts the process by building the necessary page arrays
function checkUrls(req, res, next) {
  var pagesToCrawl = req.pagesToCrawl;

  // Loop through existing URLs pulled from Google Sheets,
  // adding them to 'pagesToVisit' and 'errorPages' arrays

  pageArrays.pagesToVisit = pagesToCrawl.map(function (page) {
    return page.url;
  });
  pageArrays.errorPages = pagesToCrawl.filter(function (page) {
    return (/40\d/.test(page.status)
    );
  }).map(function (page) {
    return page.url;
  });

  continueCrawling(req, res, next);
}

// The hub of the crawler, all functions loop back here until all pages
// have been crawled
function continueCrawling(req, res, next) {
  var thisPageToVisit = pageArrays.pagesToVisit[loopCount];

  if (thisPageToVisit) {
    // Periodically reset timeout to keep the crawler going
    if (loopCount % 100 === 0) {
      // heapdump.writeSnapshot((err, filename) => {
      //   if (err) console.log(err);
      //   console.log('dump written to', filename);
      // });

      setTimeout(function () {
        requestPage(req, res, next, thisPageToVisit);
      }, 0);
    } else {
      requestPage(req, res, next, thisPageToVisit);
    }

    // If there are no more pages to visit, move on to adding info
    // to Google Sheets
  } else {
    req.pagesCrawled = pageArrays.pagesVisited.filter(function (page) {
      return page.isChanged;
    });
    req.brokenLinks = pageArrays.brokenLinks;
    next();
  }
}

// Makes HTTP requests
function requestPage(req, res, next, pageUrl) {
  // Only request the page if you haven't visited it yet
  var isVisited = pageArrays.pagesVisited.findIndex(function (page) {
    return page.url === pageUrl;
  }) !== -1;
  loopCount++;

  if (pageUrl && !isVisited) {
    (0, _request2.default)(pageUrl, function (error, response, body) {
      if (error) {
        console.log(pageUrl);
        console.log(error);
        continueCrawling(req, res, next);
      } else {
        (function () {
          var statusCode = response.statusCode;

          var pageObj = {
            url: pageUrl,
            status: statusCode.toString()
          };

          console.log(pageObj);

          // If the page doesn't exist on Current URLs sheet,
          // add it to 'changedPages'
          var isInPagesToCrawl = req.pagesToCrawl.findIndex(function (page) {
            return page.url === pageObj.url && page.status === pageObj.status;
          }) !== -1;

          pageObj.isChanged = !isInPagesToCrawl;

          // Add this page to 'pagesVisited', so you don't make repeat visits
          pageArrays.pagesVisited.push(pageObj);

          // If the page is working & the body is html,
          // collect links for other pages
          if (parseFloat(statusCode) === 200 && /<?\/?html>/.test(body)) {
            collectLinks(req, res, next, pageUrl, body);
          } else {
            continueCrawling(req, res, next);
          }
        })();
      }
    });
  } else {
    // Remove the URL from 'pagesToVisit'
    continueCrawling(req, res, next);
  }
}

// Scrape page for internal links to add to 'pagesToVisit'
function collectLinks(req, res, next, pageUrl, body) {
  var $ = _cheerio2.default.load(body);
  var urlObj = new _urlParse2.default(pageUrl);
  var domainBaseUrl = urlObj.origin;
  var domainRegExp = new RegExp(domainBaseUrl);

  // Collect URLs from relative links and add current domain to complete
  // the URL
  var linksArray = createLinksArray('a[href]');

  // Loop through all relevant URLs, pushing them to page arrays

  var _loop = function _loop(i) {
    var thisLink = linksArray[i].replace(/\?.*/, '').replace(/\/$/, '');
    var linkObj = {
      page_url: pageUrl,
      link_url: thisLink
    };
    var isInError = pageArrays.errorPages.indexOf(thisLink) !== -1;
    var isInBroken = pageArrays.brokenLinks.findIndex(function (link) {
      return link.page_url === pageUrl && link.link_url === thisLink;
    }) !== -1;
    var isInToVisit = pageArrays.pagesToVisit.indexOf(thisLink) !== -1;
    var isInVisited = pageArrays.pagesVisited.findIndex(function (link) {
      return link.url === thisLink;
    }) !== -1;

    // If the URL is in 'errorPages' and not 'brokenLinks',
    // add it to 'brokenLinks'
    if (isInError && !isInBroken) {
      pageArrays.brokenLinks.push(linkObj);
      // Otherwise, add URL to 'pagesToVisit'
    } else if (!isInToVisit && !isInVisited) {
      pageArrays.pagesToVisit.push(thisLink);
    }
  };

  for (var i = 0; i < linksArray.length; i++) {
    _loop(i);
  }

  continueCrawling(req, res, next);

  function createLinksArray(selector) {
    var domObj = $(selector);
    var linksArray = [];

    for (var _i = 0; _i < domObj.length; _i++) {
      var link = domObj[_i];
      var linkRef = $(link).attr('href');
      var isAbsolute = /http/i.test(linkRef);
      var revisedLinkRef = linkRef === '/' ? '' : linkRef;
      var linkUrl = isAbsolute ? revisedLinkRef : '' + domainBaseUrl + revisedLinkRef;
      var isCorrectLinkType = /^(?:\/|http)/i.test(linkRef);
      var isCorrectPageType = !PAGE_REG_EXP.test(linkRef) && !TYPE_REG_EXP.test(linkRef);
      var isCorrectDomain = isAbsolute ? domainRegExp.test(linkRef) : true;

      if (isCorrectLinkType && isCorrectPageType && isCorrectDomain) {
        linksArray.push(linkUrl);
      }
    }

    return linksArray;
  }
}

exports.default = checkUrls;