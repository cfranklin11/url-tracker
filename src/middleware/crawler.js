import request from 'request';
import cheerio from 'cheerio';
import urlParse from 'url-parse';
import heapdump from 'heapdump';

// Arrays for keeping track of page info as the crawler iterates through
// pages
const pageArrays = {
  pagesToVisit: [],
  errorPages: [],
  pagesVisited: [],
  brokenLinks: []
};
let loopCount = 0;

// Starts the process by building the necessary page arrays
function checkUrls(req, res, next) {
  const {pagesToCrawl} = req;

  // Loop through existing URLs pulled from Google Sheets,
  // adding them to 'pagesToVisit' and 'errorPages' arrays
  pageArrays.pagesToVisit = pagesToCrawl.map(page => {
    return page.url;
  });
  pageArrays.errorPages = pagesToCrawl
    .filter(page => {
      return /40\d/.test(page.status);
    })
    .map(page => {
      return (page.url);
    });

  continueCrawling(req, res, next);
}

// The hub of the crawler, all functions loop back here until all pages
// have been crawled
function continueCrawling(req, res, next) {
  const thisPageToVisit = pageArrays.pagesToVisit[loopCount];

  if (thisPageToVisit && loopCount < 201) {
    // Periodically reset timeout to keep the crawler going
    if (loopCount % 100 === 0) {
      heapdump.writeSnapshot((err, filename) => {
        if (err) console.log(err);
        console.log('dump written to', filename);
      });

      setTimeout(() => {
        requestPage(req, res, next, thisPageToVisit);
      }, 0);
    } else {
      requestPage(req, res, next, thisPageToVisit);
    }

  // If there are no more pages to visit, move on to adding info
  // to Google Sheets
  } else {
    req.pagesCrawled = self.changedPages;
    req.brokenLinks = self.brokenLinks;
    next();
  }
}

// Makes HTTP requests
function requestPage(req, res, next, pageUrl) {
  // Only request the page if you haven't visited it yet
  const isVisited = pageArrays.pagesVisited.findIndex(page => {
    return page.url === pageUrl;
  }) !== -1;

  if (pageUrl && !isVisited) {
    request(pageUrl, (error, response, body) => {
      if (error) {
        console.log(error);
      }

      const {statusCode} = response;
      const pageObj = {
        url: pageUrl,
        status: statusCode.toString()
      };

      console.log(pageObj);

      // If the page doesn't exist on Current URLs sheet,
      // add it to 'changedPages'
      const urlIndex = req.pagesToCrawl.findIndex(function(item) {
        return item.url === pageObj.url && item.status === pageObj.status;
      });

      if (urlIndex === -1) {
        pageObj.isChanged = true;
      } else {
        pageObj.isChanged = false;
      }

      // Add this page to 'pagesVisited', so you don't make repeat visits
      pageArrays.pagesVisited.push(pageUrl);
      loopCount++;

      // If the page is working & the body is html,
      // collect links for other pages
      if (parseFloat(statusCode) === 200 && /<?\/?html>/.test(body)) {
        collectLinks(req, res, next, pageUrl, body);
      } else {
        continueCrawling(req, res, next);
      }
    });
  } else {
    // Remove the URL from 'pagesToVisit'
    continueCrawling(req, res, next);
  }
}

// Scrape page for internal links to add to 'pagesToVisit'
function collectLinks(req, res, next, pageUrl, body) {
  var $, urlObj, domainBaseUrl, domainRegExp,
    pageRegExp, typeRegExp, i, linkObj,
    thisLink;

  $ = cheerio.load(body);
  urlObj = new urlParse(pageUrl);
  domainBaseUrl = urlObj.protocol + '//' + urlObj.hostname;
  domainRegExp = new RegExp(domainBaseUrl);
  pageRegExp = /permalink|visited-locations|transcripts|news/i;
  typeRegExp = /\.zip|\.doc|\.ppt|\.csv|\.xls|\.jpg|\.ash|\.png/i;

  // Collect URLs from relative links and add current domain to complete
  // the URL
  const relativeLinks = $('a[href^="/"]')
    .filter(link => {
      const linkRef = link.getAttribute('href');

      // Filter out forum posts, some file types, video/audio transcripts,
      // and news items to cut down on unnecessary page tracking
      return !pageRegExp.test(linkRef) && !typeRegExp.test(linkRef);
    })
    .map(link => {
      const linkRef = link.getAttribute('href');
      const revisedLinkRef = linkRef === '/' ? '' : linkRef;
      const linkUrl = domainBaseUrl + revisedLinkRef;

      return linkUrl;
    }); // Collect relative links on page

  // Similar process for absolute links, but checking that they're internal
  const absoluteLinks = $('a[href^="http"]')
    .filter(link => {
      const linkRef = link.getAttribute('href');
      return domainRegExp.test(linkRef) &&
        !pageRegExp.test(linkRef) &&
        !typeRegExp.test(linkRef);
    })
    .map(link => {
      const linkRef = link.getAttribute('href');
      return linkRef;
    }); // Collect absolute links on page
  const linksArray = relativeLinks.concat(absoluteLinks);

  // Loop through all relevant URLs, pushing them to page arrays
  for (i = 0; i < linksArray.length; i++) {
    thisLink = linksArray[i].replace(/\?.*/, '').replace(/\/$/, '');

    // If the URL is in 'errorPages' and not 'brokenLinks',
    // add it to 'brokenLinks'
    if (pageArrays.errorPages.indexOf(thisLink) !== -1) {
      linkObj = {
        page_url: pageUrl,
        link_url: thisLink
      };

      if (pageArrays.brokenLinks.indexOf(linkObj) === -1) {
        pageArrays.brokenLinks.push(linkObj);
      }
    }

    // Otherwise, add URL to 'pagesToVisit'
    if (pageArrays.pagesToVisit.indexOf(thisLink) === -1 &&
        pageArrays.pagesVisited.indexOf(thisLink) === -1) {
      pageArrays.pagesToVisit.push(thisLink);
    }
  }

  continueCrawling(req, res, next);
}

export {checkUrls};
