'use strict';

var request, cheerio, urlParse, crawler, self;

request = require('request');
cheerio = require('cheerio');
urlParse = require('url-parse');

crawler = self = {

  // Arrays for keeping track of page info as the crawler iterates through
  // pages
  changedPages: [],
  pagesToVisit: [],
  pagesVisited: [],
  errorPages: [],
  brokenLinks: [],
  loopCount: 0,

  // Starts the process by building the necessary page arrays
  checkUrls: function(req, res, next) {
    var urlRows, i, thisUrl, thisStatus;

    urlRows = req.pagesToCrawl;

    // Loop through existing URLs pulled from Google Sheets,
    // adding them to 'pagesToVisit' and 'errorPages' arrays
    for (i = 0; i < urlRows.length; i++) {
      thisUrl = urlRows[i].url;
      thisStatus = urlRows[i].status;
      self.pagesToVisit.push(thisUrl);

      if (/40\d/.test(thisStatus)) {
        self.errorPages.push(thisUrl);
      }
    }
    self.continue(req, res, next);
  },

  // The hub of the crawler, all functions loop back here until all pages
  // have been crawled
  continue: function(req, res, next) {
    var thisPageToVisit;

    thisPageToVisit = self.pagesToVisit[0];
    self.loopCount++;

    if (thisPageToVisit) {

      // Periodically reset timeout to keep the crawler going
      if (self.loopCount % 500 === 0) {
        setTimeout(function() {
          self.requestPage(req, res, next, thisPageToVisit);
        }, 0);

      } else {
        self.requestPage(req, res, next, thisPageToVisit);
      }

    // If there are no more pages to visit, move on to adding info
    // to Google Sheets
    } else {
      req.pagesCrawled = self.changedPages;
      req.brokenLinks = self.brokenLinks;
      return next();
    }
  },

  // Makes HTTP requests
  requestPage: function(req, res, next, pageUrl) {

    // Only request the page if you haven't visited it yet
    if (self.pagesVisited.indexOf(pageUrl) === -1) {
      request(pageUrl, function(error, response, body) {
        var pageStatus, pageObj, urlIndex;

        if (error) {
          console.log(error);
          return next();
        }

        pageStatus = response.statusCode;
        pageObj = {
          url: pageUrl,
          status: pageStatus.toString()
        };

        // If the page doesn't exist on Current URLs sheet,
        // add it to 'changedPages'
        urlIndex = req.pagesToCrawl.findIndex(function(item) {
          return item.url === pageObj.url && item.status === pageObj.status;
        });

        if (urlIndex === -1) {
          self.changedPages.push(pageObj);
        }

        // Add this page to 'pagesVisited', so you don't make repeat visits
        self.pagesVisited.push(pageUrl);

        // Remove the URL from 'pagesToVisit'
        self.pagesToVisit.shift();

        // If the page is working & the body is html,
        // collect links for other pages
        if (pageStatus === 200 && /<html>/.test(body)) {
          self.collectLinks(req, res, next, pageUrl, body);

        } else {
          self.continue(req, res, next);
        }
      });

    } else {
      self.continue(req, res, next);
    }
  },

  // Scrape page for internal links to add to 'pagesToVisit'
  collectLinks: function(req, res, next, pageUrl, body) {
    var $, relativeLinks, absoluteLinks, urlObj, domainBaseUrl, domainRegExp,
      pageRegExp, typeRegExp, linksArray, i, linkRef, linkUrl, linkObj, thisLink;

    $ = cheerio.load(body);
    relativeLinks = $('a[href^="/"]'); // Collect relative links on page
    absoluteLinks = $('a[href^="http"]'); // Collect absolute links on page
    urlObj = new urlParse(pageUrl);
    domainBaseUrl = urlObj.protocol + '//' + urlObj.hostname;
    domainRegExp = new RegExp(domainBaseUrl);
    pageRegExp = /permalink|visited-locations|transcripts|news/i;
    typeRegExp = /\.zip|\.doc|\.ppt|\.csv|\.xls|\.jpg|\.ash|\.png/i;
    linksArray = [];

    // Collect URLs from relative links and add current domain to complete
    // the URL
    for (i = 0; i < relativeLinks.length; i++) {
      linkRef = $(relativeLinks[i]).attr('href');
      linkRef = linkRef === '/' ? '' : linkRef;
      linkUrl = domainBaseUrl + linkRef;

      // Filter out forum posts, PDFs, video/audio transcripts, and news items
      // to cut down on unnecessary page tracking
      if (!pageRegExp.test(linkUrl) && !typeRegExp.test(linkUrl)) {
        linksArray.push(linkUrl);
      }
    }

    // Similar process for absolute links, but checking that they're internal
    for (i = 0; i < absoluteLinks.length; i++) {
      linkRef = $(absoluteLinks[i]).attr('href');

      if (domainRegExp.test(linkRef) && !pageRegExp.test(linkRef) &&
        !typeRegExp.test(linkRef)) {
          linksArray.push(linkRef);
      }
    }

    // Loop through all relevant URLs, pushing them to page arrays
    for (i = 0; i < linksArray.length; i++) {
      thisLink = linksArray[i];

      // If the URL is in 'errorPages' and not 'brokenLinks',
      // add it to 'brokenLinks'
      if (self.errorPages.indexOf(thisLink) !== -1) {
        linkObj = {
          page_url: pageUrl,
          link_url: thisLink
        };

        if (self.brokenLinks.indexOf(linkObj) === -1) {
          self.brokenLinks.push(linkObj);
        }
      }

      // Otherwise, add URL to 'pagesToVisit'
      if (self.pagesToVisit.indexOf(thisLink) === -1 &&
          self.pagesVisited.indexOf(thisLink) === -1) {
        self.pagesToVisit.push(thisLink);
      }
    }

    self.continue(req, res, next);
  }
};

module.exports = crawler;