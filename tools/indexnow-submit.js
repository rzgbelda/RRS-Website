// Submits every real URL on the site to IndexNow (Bing, and any other
// search engine that participates -- Yandex, Seznam; Google does not
// consume IndexNow, GSC/sitemap submission covers that separately).
// IndexNow just tells participating engines "these URLs changed, come
// look" -- it doesn't guarantee ranking, only faster discovery.
//
// Key file: /32c7ece0114347a5b1ed4bad45001291.txt at the site root, both
// the filename and its contents equal to the key below -- this is how
// IndexNow verifies you actually control the domain before honoring
// submissions for it. Don't rename/remove that file.
//
// Run: node tools/indexnow-submit.js
// Run again any time a batch of pages changes (new blog post, new
// landing page, a page's content meaningfully updated) -- there's no
// harm in resubmitting the full list each time.
const fs = require('fs');
const path = require('path');
const https = require('https');

const HOST = 'www.roomreadysupply.com';
const KEY = '32c7ece0114347a5b1ed4bad45001291';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ROOT = path.join(__dirname, '..');

function extractLocsFromSitemap(file) {
  const xml = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const matches = xml.match(/<loc>(.*?)<\/loc>/g) || [];
  return matches.map(m => m.replace(/<\/?loc>/g, ''));
}

const sitemapFiles = ['sitemap.xml', 'sitemap-categories.xml', 'sitemap-products.xml', 'sitemap-blog.xml'];
let urlList = [];
sitemapFiles.forEach(f => {
  if (fs.existsSync(path.join(ROOT, f))) {
    urlList = urlList.concat(extractLocsFromSitemap(f));
  }
});
urlList = [...new Set(urlList)];

console.log(`Submitting ${urlList.length} URLs to IndexNow...`);

const payload = JSON.stringify({
  host: HOST,
  key: KEY,
  keyLocation: KEY_LOCATION,
  urlList,
});

const req = https.request({
  hostname: 'api.indexnow.org',
  path: '/indexnow',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  },
}, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log('Status:', res.statusCode, res.statusMessage);
    if (body) console.log('Response body:', body);
    if (res.statusCode === 200 || res.statusCode === 202) {
      console.log('Submitted successfully.');
    } else {
      console.log('Non-success status -- check key file is live at', KEY_LOCATION);
    }
  });
});

req.on('error', e => console.error('Request error:', e));
req.write(payload);
req.end();
