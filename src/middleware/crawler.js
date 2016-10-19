/* eslint no-loop-func: 0 */

import request from 'request';
import cheerio from 'cheerio';
import urlParse from 'url-parse';
// import heapdump from 'heapdump';

// Arrays for keeping track of page info as the crawler iterates through
// pages
let pagesToVisit = [];
let changedPages = [];
let errorPages = [];
let brokenLinks = [];
let loopCount = 0;
let requestCount = 0;
// RegExps to skip unimportant pages (PAGE_REG_EXP) and not to crawl non-html
// pages for links (TYPE_REG_EXP), because that results in errors
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

  continueLoop(req, res, next);
}

function continueLoop(req, res, next) {
  if (loopCount < pagesToVisit.length) {
    for (loopCount; loopCount < pagesToVisit.length; loopCount++) {
      const thisPageToVisit = pagesToVisit[loopCount];

      if (thisPageToVisit) {
        const currentCount = loopCount;

        if (loopCount % 500 === 0) {
          // heapdump.writeSnapshot((err, filename) => {
          //   if (err) console.log(err);
          //   console.log('dump written to', filename);
          // });

          setTimeout(() => {
            requestCount++;
            requestPage(req, res, next, thisPageToVisit, currentCount);
          }, 0);
        } else {
          requestCount++;
          requestPage(req, res, next, thisPageToVisit, currentCount);
        }
      } else {
        req.pagesCrawled = changedPages;
        req.brokenLinks = brokenLinks;
        next();
      }
    }
  } else {
    req.pagesCrawled = changedPages;
    req.brokenLinks = brokenLinks;
    next();
  }
}

// Makes HTTP requests
function requestPage(req, res, next, pageUrl, currentIndex) {
  // Only request the page if you haven't visited it yet
  const wasVisited = pagesToVisit.indexOf(pageUrl) < currentIndex;

  if (pageUrl && !wasVisited) {
    request(pageUrl, (error, response, body) => {
      const date = new Date();
      console.log(currentIndex, date.toTimeString(), pageUrl);

      if (error) {
        console.log(pageUrl);
        console.log(error);
        changedPages[changedPages.length] = {url: pageUrl, status: 404};
        loopBack(req, res, next);
      } else {
        const {statusCode} = response;
        const pageObj = {
          url: pageUrl,
          status: statusCode
        };
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
          loopBack(req, res, next);
        }
      }
    });
  } else {
    loopBack(req, res, next);
  }
}

// Scrape page for internal links to add to 'pagesToVisit'
function collectLinks(req, res, next, pageUrl, body) {
  const $ = cheerio.load(body);
  const urlObj = new urlParse(pageUrl);
  const domainBaseUrl = urlObj.hostname;
  const domainRegExp = new RegExp(domainBaseUrl);
  const protocol = urlObj.protocol;
  // Collect URLs from link tags (adding current domain to relative links)
  const linkTagsObj = $('a[href]');

  for (let i = 0; i < linkTagsObj.length; i++) {
    const link = linkTagsObj[i];
    const linkRef = $(link).attr('href');
    const isAbsolute = /http/i.test(linkRef);
    const revisedLinkRef = linkRef === '/' ?
      '' :
      linkRef.replace(/\?.*/, '').replace(/#.*/, '').replace(/\/$/, '');
    const linkUrl = isAbsolute ?
      revisedLinkRef :
      `${protocol}//${domainBaseUrl}${revisedLinkRef}`;
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

  pageUrl = null;
  body = null;
  loopBack(req, res, next);
}

function loopBack(req, res, next) {
  requestCount--;

  if (requestCount === 0) {
    console.log(`toCrawl: ${req.pagesToCrawl.length}, changed: ${changedPages.length}, toVisit: ${pagesToVisit.length}`);
  }

  if (requestCount === 0) {
    if (req.pagesToCrawl.length + changedPages.length < pagesToVisit.length) {
      continueLoop(req, res, next);
    } else {
      req.pagesCrawled = changedPages;
      req.brokenLinks = brokenLinks;
      next();
    }
  }
}

export default checkUrls;
