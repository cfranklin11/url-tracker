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

var _objectSizeof = require('object-sizeof');

var _objectSizeof2 = _interopRequireDefault(_objectSizeof);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// import heapdump from 'heapdump';

// Arrays for keeping track of page info as the crawler iterates through
// pages
/* eslint no-loop-func: 0 */

var pagesToVisit = [];
var changedPages = [];
var errorPages = [];
var brokenLinks = [];
var loopCount = 0;
var bandwidthUsed = 0;
// RegExps to skip unimportant pages (PAGE_REG_EXP) and not to crawl non-html
// pages for links (TYPE_REG_EXP), because that results in errors
var PAGE_REG_EXP = /permalink|visited-locations|transcripts|news/i;
var TYPE_REG_EXP = /\.zip|\.doc|\.ppt|\.csv|\.xls|\.jpg|\.ash|\.png|\.aspx/i;

// Starts the process by building the necessary page arrays
function crawlPages(req, res, next) {
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

  visitPages(req, res, next);
}

function visitPages(req, res, next) {
  var promises = [];

  for (loopCount; loopCount < pagesToVisit.length; loopCount++) {
    var thisPageToVisit = pagesToVisit[loopCount];

    if (thisPageToVisit) {
      var currentCount = loopCount;

      if (loopCount % 500 === 0) {
        // heapdump.writeSnapshot((err, filename) => {
        //   if (err) console.log(err);
        //   console.log('dump written to', filename);
        // });

        promises[promises.length] = timeout(thisPageToVisit, currentCount).then(function (url, index) {
          return requestPage(url, index, req.pagesToCrawl);
        }).then(function (url, body) {
          if (url && body) {
            collectLinks(url, body);
            return 'Links collected';
          }

          return 'No links';
        }).catch(function (err) {
          console.log(err);
        });
      } else {
        promises[promises.length] = requestPage(thisPageToVisit, currentCount, req.pagesToCrawl).then(function (url, body) {
          if (url && body) {
            collectLinks(url, body);
            return 'Links collected';
          }

          return 'No links';
        }).catch(function (err) {
          console.log(err);
        });
      }
    }
  }

  Promise.all(promises).then(function (results) {
    console.log('toCrawl: ' + req.pagesToCrawl.length, 'changed: ' + changedPages.length, 'toVisit: ' + pagesToVisit.length);

    if (req.pagesToCrawl.length + changedPages.length < pagesToVisit.length) {
      crawlPages(req, res, next);
    } else {
      var revisedBandwidth = bandwidthUsed >= 1000000 ? (Math.round(bandwidthUsed / 10000) / 100).toString() + 'MB' : (Math.round(bandwidthUsed / 10) / 100).toString() + 'KB';
      console.log(revisedBandwidth);
      req.pagesCrawled = changedPages;
      req.brokenLinks = brokenLinks;

      next();
    }
  }).catch(function (err) {
    console.log(err);
    next();
  });
}

function timeout(url, index) {
  return new Promise(function (resolve, reject) {
    setTimeout(function () {
      resolve(url, index);
    }, 0);
  });
}

// Makes HTTP requests
function requestPage(pageUrl, currentIndex, pagesToCrawl) {
  // Only request the page if you haven't visited it yet
  var wasVisited = pagesToVisit.indexOf(pageUrl) < currentIndex;

  return new Promise(function (resolve, reject) {
    if (pageUrl) {
      if (wasVisited) {
        reject(Error('Page was already visited.'));
      } else {
        (0, _request2.default)(pageUrl, function (err, response, body) {
          var headersMem = (0, _objectSizeof2.default)(response.headers);
          var bodyMem = (0, _objectSizeof2.default)(body);
          bandwidthUsed += headersMem + bodyMem;

          var date = new Date();
          console.log(currentIndex, date.toTimeString(), pageUrl);

          if (err) {
            changedPages[changedPages.length] = {
              url: pageUrl,
              status: 404
            };
            reject(err);
          } else {
            (function () {
              var redirects = response.request._redirect.redirects;


              if (redirects.length) {
                (function () {
                  var finalRedirect = redirects[redirects.length];
                  var finalDestination = finalRedirect && { url: finalRedirect.url, status: finalRedirect.statusCode };
                  var destIsInToVisit = finalDestination && pagesToVisit.findIndex(function (page) {
                    return finalDestination.url === page.url;
                  }) !== -1;

                  if (finalDestination && !destIsInToVisit) {
                    pagesToVisit[pagesToVisit.length] = finalDestination;
                  }
                })();
              }

              var redirectStatus = redirects[0] && redirects[0].statusCode;
              var status = redirectStatus ? redirectStatus : response.statusCode;
              var pageObj = {
                url: pageUrl,
                status: status
              };
              // If the page doesn't exist on Current URLs sheet,
              // add it to 'changedPages'
              var isInPagesToCrawl = pagesToCrawl.findIndex(function (page) {
                return page.url === pageObj.url && page.status === pageObj.status;
              }) !== -1;

              if (!isInPagesToCrawl) {
                pageObj.isChanged = !isInPagesToCrawl;
                changedPages[changedPages.length] = pageObj;
              }

              // If the page is working & the body is html,
              // collect links for other pages
              if (!/40\d/.test(status) && /<?\/?html>/.test(body)) {
                resolve(pageUrl, body);
              } else {
                resolve();
              }
            })();
          }
        });
      }
    } else {
      reject(Error('Page URL is undefined.'));
    }
  });
}

// Scrape page for internal links to add to 'pagesToVisit'
function collectLinks(pageUrl, body) {
  var $ = _cheerio2.default.load(body);
  var urlObj = new _urlParse2.default(pageUrl);
  var domainBaseUrl = urlObj.hostname;
  var domainRegExp = new RegExp(domainBaseUrl);
  var protocol = urlObj.protocol;
  // Collect URLs from link tags (adding current domain to relative links)
  var linkTagsObj = $('a[href]');

  var _loop = function _loop(i) {
    var link = linkTagsObj[i];
    var linkRef = $(link).attr('href');
    var isAbsolute = /http/i.test(linkRef);
    var revisedLinkRef = linkRef === '/' ? '' : linkRef.replace(/\?.*/, '').replace(/#.*/, '').replace(/\/$/, '');
    var linkUrl = isAbsolute ? revisedLinkRef : protocol + '//' + domainBaseUrl + revisedLinkRef;
    var linkObj = {
      page_url: pageUrl,
      link_url: linkUrl
    };
    var isCorrectLinkType = /^(?:\/|http)/i.test(revisedLinkRef);
    var isCorrectPageType = !PAGE_REG_EXP.test(revisedLinkRef) && !TYPE_REG_EXP.test(revisedLinkRef);
    var isCorrectDomain = isAbsolute ? domainRegExp.test(revisedLinkRef) : true;
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

  pageUrl = null;
  body = null;
}

exports.default = crawlPages;
//# sourceMappingURL=crawler.js.map