'use strict';

var request, cheerio, urlParse, crawler;

request = require('request');
cheerio = require('cheerio');
urlParse = require('url-parse');

crawler = {
  domains: ['https://www.beyondblue.org.au'],
  pages: [],
  changedPages: [],
  pagesToVisit: [],
  pagesVisited: [],

  crawlUrls: function(req, res, next) {
    var domains, i, thisDomain, urlObj, domainBaseUrl;

    domains = crawler.domains;

    for (i = 0; i < domains.length; i++) {
      thisDomain = domains[i];
      urlObj = new urlParse(thisDomain);
      domainBaseUrl = urlObj.protocol + '//' + urlObj.hostname;

      crawler.pagesToVisit.push(domainBaseUrl);
      crawler.continue(req, res, next);
    }
  },

  checkUrls: function(req, res, next) {
    var urlRows, pagesToVisit, i, thisUrlRow;

    urlRows = req.urlRows;
    pagesToVisit = crawler.pagesToVisit;

    for (i = 0; i < urlRows.length; i++) {
      thisUrlRow = urlRows[i].url;
      pagesToVisit.push(thisUrlRow);
    }

    crawler.pagesToVisit = pagesToVisit;
    crawler.pages = urlRows;
    crawler.continue(req, res, next);
  },

  continue: function(req, res, next) {
    var thisPageToVisit;

    thisPageToVisit = crawler.pagesToVisit.shift();

    if (thisPageToVisit) {
      crawler.requestPage(req, res, next, thisPageToVisit);
    } else {
      console.log('done');
      req.pagesCrawled = crawler.pages;
      next();
    }
  },

  requestPage: function(req, res, next, domainUrl) {
    if (crawler.pagesVisited.indexOf(domainUrl) === -1) {
      request(domainUrl, function(error, response, body) {
        var pageStatus, pageObj, pages;

        if (error) {
          console.log(error);
          return res.redirect('/');
        }

        console.log(domainUrl);

        crawler.pagesVisited.push(domainUrl);

        pageStatus = response.statusCode;
        pageObj = {
          url: domainUrl,
          status: pageStatus
        };
        pages = crawler.pages;

        if (pages.indexOf(pageObj) === -1) {
          crawler.changedPages.push(pageObj);
        }

        if (pageStatus === 200) {
          crawler.collectLinks(req, res, next, domainUrl, body);
        } else {
          crawler.continue(req, res, next);
        }
      });
    } else {
      crawler.continue(req, res, next);
    }
  },

  collectLinks: function(req, res, next, domainUrl, body) {
    var $, relativeLinks, absoluteLinks, domainRegExp, linksArray, i, linkRef, thisLink;

    $ = cheerio.load(body);
    relativeLinks = $('a[href^="/"]');
    absoluteLinks = $('a[href^="http"]');
    domainRegExp = new RegExp(domainUrl);
    linksArray = [];

    for (i = 0; i < relativeLinks.length; i++) {
      linkRef = $(relativeLinks[i]).attr('href');
      linkRef = linkRef === '/' ? '' : linkRef;

      linksArray.push(domainUrl + linkRef);
    }

    for (i = 0; i < absoluteLinks.length; i++) {
      linkRef = $(absoluteLinks[i]).attr('href');

      if (domainRegExp.test(linkRef)) {
        linksArray.push(linkRef);
      }
    }

    for (i = 0; i < linksArray.length; i++) {
      thisLink = linksArray[i];

      if (crawler.pagesToVisit.indexOf(thisLink) === -1 &&
          crawler.pagesVisited.indexOf(thisLink) === -1) {
        crawler.pagesToVisit.push(thisLink);
      }
    }

    crawler.continue(req, res, next);
  }
};

module.exports = crawler;