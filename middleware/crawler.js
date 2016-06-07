'use strict';

var request, cheerio, urlParse, crawler;

request = require('request');
cheerio = require('cheerio');
urlParse = require('url-parse');

crawler = {
  domains: ['https://www.beyondblue.org.au'],

  pages: [],

  pagesToVisit: [],

  start: function(req, res, next) {
    var domains, i, thisDomain, urlObj, domainBaseUrl;

    domains = crawler.domains;

    for (i = 0; i < domains.length; i++) {
      thisDomain = domains[i];
      urlObj = new urlParse(thisDomain);
      domainBaseUrl = urlObj.protocol + '//' + urlObj.hostname;

      crawler.pagesToVisit.push(domainBaseUrl);
      crawler.continue(req, res, next);
    }
    next();
  },

  continue: function(req, res, next) {
    var thisPageToVisit;

    thisPageToVisit = crawler.pagesToVisit.shift();

    console.log(thisPageToVisit);

    if (thisPageToVisit) {
      crawler.requestPage(req, res, next, thisPageToVisit);
    }
  },

  requestPage: function(req, res, next, domainUrl) {
    var pageStatus, pageObj, pages;

    request(domainUrl, function(error, response, body) {
      if (error) {
        console.log(error);
        res.redirect('/');
      }

      pageStatus = response.statusCode;
      pageObj = {
        url: domainUrl,
        status: pageStatus
      };
      pages = crawler.pages;

      if (pages.indexOf(pageObj) === -1) {
        crawler.pages.push(pageObj);
      }

      if (pageStatus === 200) {
        crawler.collectLinks(domainUrl, body);
      }
    });
  },

  collectLinks: function(domainUrl, body) {
    var $, relativeLinks, absoluteLinks, domainRegExp, linksArray, i, linkText, thisLink;

    $ = cheerio.load(body);
    relativeLinks = $('a[href^="/"]');
    absoluteLinks = $('a[href^="http"]');
    domainRegExp = new RegExp(domainUrl);
    linksArray = [];

    for (i = 0; i < relativeLinks.length; i++) {
      linkText = $(relativeLinks[i]).attr('href');
      linksArray.push(domainUrl + linkText);
    }

    for (i = 0; i < absoluteLinks.length; i++) {
      linkText = $(absoluteLinks[i]).attr('href');

      if (domainRegExp.test(linkText)) {
        linksArray.push(linkText);
      }
    }

    for (i = 0; i < linksArray.length; i++) {
      thisLink = linksArray[i];

      if (crawler.pagesToVisit.indexOf(thisLink) === -1) {
        crawler.pagesToVisit.push(thisLink);
      }
    }

    crawler.continue(domainUrl);
  }
};

module.exports = crawler;