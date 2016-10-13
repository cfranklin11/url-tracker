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
var pagesToVisit = [];
var changedPages = [];
var errorPages = [];
var brokenLinks = [];
var loopCount = 0;
var PAGE_REG_EXP = /permalink|visited-locations|transcripts|news/i;
var TYPE_REG_EXP = /\.zip|\.doc|\.ppt|\.csv|\.xls|\.jpg|\.ash|\.png|\.aspx/i;

// Starts the process by building the necessary page arrays
function checkUrls(req, res, next) {
  var pagesToCrawl = req.pagesToCrawl;

  // Loop through existing URLs pulled from Google Sheets,
  // adding them to 'pagesToVisit' and 'errorPages' arrays

  for (var i = 0; i < pagesToCrawl.length; i++) {
    var thisPage = pagesToCrawl[i];

    pagesToVisit[pagesToVisit.length] = thisPage.url;

    if (/40\d/.test(thisPage.status)) {
      errorPages[errorPages.length] = thisPage.url;
    }
  }

  continueCrawling(req, res, next);
}

// The hub of the crawler, all functions loop back here until all pages
// have been crawled
function continueCrawling(req, res, next) {
  var thisPageToVisit = pagesToVisit[loopCount];

  if (thisPageToVisit) {
    // Periodically reset timeout to keep the crawler going
    if (loopCount % 500 === 0) {
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
    req.pagesCrawled = changedPages;
    req.brokenLinks = brokenLinks;
    next();
  }
}

// Makes HTTP requests
function requestPage(req, res, next, pageUrl) {
  // Only request the page if you haven't visited it yet
  var wasVisited = pagesToVisit.indexOf(pageUrl) < loopCount;
  loopCount++;

  if (pageUrl && !wasVisited) {
    (0, _request2.default)(pageUrl, function (error, response, body) {
      if (error) {
        console.log(pageUrl);
        console.log(error);
        continueCrawling(req, res, next);
      } else {
        console.log(pageUrl);
        (function () {
          var statusCode = response.statusCode;

          var pageObj = {
            url: pageUrl,
            status: statusCode.toString()
          };
          // If the page doesn't exist on Current URLs sheet,
          // add it to 'changedPages'
          var isInPagesToCrawl = req.pagesToCrawl.findIndex(function (page) {
            return page.url === pageObj.url && page.status === pageObj.status;
          }) !== -1;

          if (!isInPagesToCrawl) {
            pageObj.isChanged = !isInPagesToCrawl;
            changedPages[changedPages.length] = pageObj;
          }

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
  // Collect URLs from link tags (adding current domain to relative links)
  var linkTagsObj = $('a[href]');

  var _loop = function _loop(i) {
    var link = linkTagsObj[i];
    var linkRef = $(link).attr('href');
    var isAbsolute = /http/i.test(linkRef);
    var revisedLinkRef = linkRef === '/' ? '' : linkRef.replace(/\?.*/, '').replace(/\/$/, '');
    var linkUrl = isAbsolute ? revisedLinkRef : '' + domainBaseUrl + revisedLinkRef;
    var linkObj = {
      page_url: pageUrl,
      link_url: linkUrl
    };
    var isCorrectLinkType = /^(?:\/|http)/i.test(linkRef);
    var isCorrectPageType = !PAGE_REG_EXP.test(linkRef) && !TYPE_REG_EXP.test(linkRef);
    var isCorrectDomain = isAbsolute ? domainRegExp.test(linkRef) : true;
    var isInError = errorPages.indexOf(linkUrl) !== -1;
    var isInBroken = brokenLinks.findIndex(function (link) {
      return link.page_url === pageUrl && link.link_url === linkUrl;
    }) !== -1;
    var toVisitIndex = pagesToVisit.indexOf(linkUrl);
    var isInToVisit = toVisitIndex !== -1;

    if (isCorrectLinkType && isCorrectPageType && isCorrectDomain) {
      // If the URL is in 'errorPages' and not 'brokenLinks',
      // add it to 'brokenLinks'
      if (isInError && !isInBroken) {
        brokenLinks[brokenLinks.length] = linkObj;
        // Otherwise, add URL to 'pagesToVisit'
      } else if (!isInToVisit) {
        pagesToVisit[pagesToVisit.length] = linkUrl;
      }
    }
  };

  for (var i = 0; i < linkTagsObj.length; i++) {
    _loop(i);
  }

  continueCrawling(req, res, next);
}

exports.default = checkUrls;
