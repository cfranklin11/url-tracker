'use strict';

var request, cheerio, URL, crawler;

request = require('request');
cheerio = require('cheerio');
URL = require('url-parse');

crawler = {
  domains: ['https://www.beyondblue.org.au'],

  pages: [],

  pagesToVisit: [],

  start: function() {
    var domains, i, thisDomain, domainUrl, domainBaseUrl, domainPath,
      thisDomainUrl;

    domains = crawler.domains;

    for (i = 0; i < domains.length; i++) {
      thisDomain = domains[i];
      url = new URL(thisDomain);
      domainBaseUrl = url.protocol + '//' + url.hostname;

      crawler.pagesToVisit.push(domainBaseUrl);
      crawler.continue();
    }
    console.log(crawler.pages);
    next();
  },

  continue: function() {
    var thisPageToVisit;

    thisPageToVisit = crawler.pagesToVisit.shift();

    if (thisPageToVisit) {
      crawler.requestPage(thisPageToVisit);
    }
  },

  requestPage: function(domainUrl) {
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
      }
      pages = crawler.pages;

      if (pages.indexOf(pageObj) === -1) {
        crawler.pages.push(pageObj);
      }

      if (pageStatus === 200) {
        crawler.collectLinks(domainUrl);
      }
    });
  },

  collectLinks: function(domainUrl) {
    var $, relativeLinks, absoluteLinks, domainLinks, i;

    $ = cheerio.load(body);
    relativeLinks = $('a[href^="/"]');
    absoluteLinks = $('a[href^="http"]');
    domainRegExp = new RegExp(domainUrl);
    linksArray = [];

    for (i = 0; i < relativeLinks.length; i++) {
      linkText = $(relativeLinks[i]).text();
      linksArray.push(domainUrl + linkText);
    }

    for (i = 0; i < absoluteLinks.length; i++) {
      linkText = $(absoluteLinks[i]).text();

      if (domainRegExp.test(linkText)) {
        linksArray.push(linkText);
      }
    }

    for (i = 0; i < linksArray.length i++) {
      thisLink = linksArray[i];

      if (crawler.pagesToVisit.indexOf(thisLink) === -1) {
        crawler.pagesToVisit.push(thisLink);
      }
    }
  }

  crawler.continue(domainUrl);
};

module.exports = crawler;