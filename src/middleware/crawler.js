import request from 'request';
import cheerio from 'cheerio';
import urlParse from 'url-parse';
import heapdump from 'heapdump';

// Arrays for keeping track of page info as the crawler iterates through
// pages
let pagesToVisit = [];
let changedPages = [];
let errorPages = [];
let brokenLinks = [];
let loopCount = 0;
const PAGE_REG_EXP = /permalink|visited-locations|transcripts|news/i;
const TYPE_REG_EXP = /\.zip|\.doc|\.ppt|\.csv|\.xls|\.jpg|\.ash|\.png|\.aspx/i;

// Starts the process by building the necessary page arrays
function checkUrls(req, res, next) {
  const {pagesToCrawl} = req;

  // Loop through existing URLs pulled from Google Sheets,
  // adding them to 'pagesToVisit' and 'errorPages' arrays
  for (let i = 0; i < pagesToCrawl.length; i++) {
    const thisPage = pagesToCrawl[i];

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
  const thisPageToVisit = pagesToVisit[loopCount];

  if (thisPageToVisit) {
    // Periodically reset timeout to keep the crawler going
    if (loopCount % 500 === 0) {
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
    req.pagesCrawled = changedPages;
    req.brokenLinks = brokenLinks;
    next();
  }
}

// Makes HTTP requests
function requestPage(req, res, next, pageUrl) {
  // Only request the page if you haven't visited it yet
  const wasVisited = pagesToVisit.indexOf(pageUrl) < loopCount;
  loopCount++;

  if (pageUrl && !wasVisited) {
    request(pageUrl, (error, response, body) => {
      if (error) {
        console.log(pageUrl);
        console.log(error);
        continueCrawling(req, res, next);
      } else {
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
  const domainBaseUrl = urlObj.origin;
  const domainRegExp = new RegExp(domainBaseUrl);
  // Collect URLs from link tags (adding current domain to relative links)
  const linkTagsObj = $('a[href]');

  for (let i = 0; i < linkTagsObj.length; i++) {
    const link = linkTagsObj[i];
    const linkRef = $(link).attr('href');
    const isAbsolute = /http/i.test(linkRef);
    const revisedLinkRef = linkRef === '/' ?
      '' :
      linkRef.replace(/\?.*/, '').replace(/\/$/, '');
    const linkUrl =
      isAbsolute ? revisedLinkRef : `${domainBaseUrl}${revisedLinkRef}`;
    const linkObj = {
      page_url: pageUrl,
      link_url: linkUrl
    };
    const isCorrectLinkType = /^(?:\/|http)/i.test(linkRef);
    const isCorrectPageType =
      !PAGE_REG_EXP.test(linkRef) && !TYPE_REG_EXP.test(linkRef);
    const isCorrectDomain = isAbsolute ? domainRegExp.test(linkRef) : true;
    const isInError = errorPages.indexOf(linkUrl) !== -1;
    const isInBroken = brokenLinks.findIndex(link => {
      return link.page_url === pageUrl && link.link_url === linkUrl;
    }) !== -1;
    const toVisitIndex = pagesToVisit.indexOf(linkUrl);
    const isInToVisit = toVisitIndex !== -1;

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
  }

  continueCrawling(req, res, next);
}

export default checkUrls;
