import request from 'request';
import cheerio from 'cheerio';
import urlParse from 'url-parse';
// import heapdump from 'heapdump';

// Arrays for keeping track of page info as the crawler iterates through
// pages
const pageArrays = {
  pagesToVisit: [],
  errorPages: [],
  pagesVisited: [],
  brokenLinks: []
};
let loopCount = 0;
const PAGE_REG_EXP = /permalink|visited-locations|transcripts|news/i;
const TYPE_REG_EXP = /\.zip|\.doc|\.ppt|\.csv|\.xls|\.jpg|\.ash|\.png/i;

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

  if (thisPageToVisit) {
    // Periodically reset timeout to keep the crawler going
    if (loopCount % 100 === 0) {
      // heapdump.writeSnapshot((err, filename) => {
      //   if (err) console.log(err);
      //   console.log('dump written to', filename);
      // });

      setTimeout(() => {
        requestPage(req, res, next, thisPageToVisit);
      }, 0);
    } else {
      requestPage(req, res, next, thisPageToVisit);
    }

  // If there are no more pages to visit, move on to adding info
  // to Google Sheets
  } else {
    req.pagesCrawled = pageArrays.pagesVisited.filter(page => {
      return page.isChanged;
    });
    req.brokenLinks = pageArrays.brokenLinks;
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
      const isInPagesToCrawl = req.pagesToCrawl.findIndex(page => {
        return page.url === pageObj.url && page.status === pageObj.status;
      }) !== -1;

      pageObj.isChanged = !isInPagesToCrawl;

      // Add this page to 'pagesVisited', so you don't make repeat visits
      pageArrays.pagesVisited.push(pageObj);
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
  const $ = cheerio.load(body);
  const urlObj = new urlParse(pageUrl);
  const domainBaseUrl = `${urlObj.protocol}//${urlObj.hostname}`;
  const domainRegExp = new RegExp(domainBaseUrl);

  // Collect URLs from relative links and add current domain to complete
  // the URL
  const linksArray = createLinksArray('a[href]');

  // Loop through all relevant URLs, pushing them to page arrays
  for (let i = 0; i < linksArray.length; i++) {
    const thisLink = linksArray[i].replace(/\?.*/, '').replace(/\/$/, '');
    const linkObj = {
      page_url: pageUrl,
      link_url: thisLink
    };
    const isInError = pageArrays.errorPages.indexOf(thisLink) !== -1;
    const isInBroken = pageArrays.brokenLinks.findIndex(link => {
      return link.page_url === pageUrl && link.link_url === thisLink;
    }) !== -1;
    const isInToVisit = pageArrays.pagesToVisit.indexOf(thisLink) !== -1;
    const isInVisited = pageArrays.pagesVisited.findIndex(link => {
      return link.url === thisLink;
    });

    // If the URL is in 'errorPages' and not 'brokenLinks',
    // add it to 'brokenLinks'
    if (isInError && !isInBroken) {
      pageArrays.brokenLinks.push(linkObj);
    // Otherwise, add URL to 'pagesToVisit'
    } else if (!isInToVisit && !isInVisited) {
      pageArrays.pagesToVisit.push(thisLink);
    }
  }

  continueCrawling(req, res, next);

  function createLinksArray(selector) {
    const domObj = $(selector);
    let linksArray = [];

    for (let i = 0; i < domObj.length; i++) {
      const link = domObj[i];
      const linkRef = $(link).attr('href');
      const isAbsolute = /http/i.test(linkRef);
      const revisedLinkRef = linkRef === '/' ? '' : linkRef;
      const linkUrl =
        isAbsolute ? revisedLinkRef : `${domainBaseUrl}${revisedLinkRef}`;
      const isCorrectLinkType = /^(?:\/|http)/i.test(linkRef);
      const isCorrectPageType =
        !PAGE_REG_EXP.test(linkRef) && !TYPE_REG_EXP.test(linkRef);
      const isCorrectDomain = isAbsolute && domainRegExp.test(linkRef) || true;

      if (isCorrectLinkType && isCorrectPageType && isCorrectDomain) {
        linksArray.push(linkUrl);
      }
    }

    return linksArray;
  }
}

export default checkUrls;
