const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

async function checkLink(link) {
  if (link.startsWith('#')) {
    return { url: link, status: true, statusCode: 'Fragment', metaProperties: [], finalUrl: link };
  } else {
    try {
      const response = await axios.get(link, {
        maxRedirects: 5,
        validateStatus: function (status) {
          return status >= 200 && status < 400; // Accept status codes in this range
        }
      });
      const html = response.data;
      const $ = cheerio.load(html);

      const metaProperties = [];
      $('meta').each((index, element) => {
        const property = $(element).attr('property');
        const content = $(element).attr('content');
        if (property && content) {
          metaProperties.push({ property, content: content.replace(/[\t\n]/g, '').trim() });
        }
      });

      return { 
        url: link, 
        status: true, 
        statusCode: response.status, 
        metaProperties,
        finalUrl: response.request.res.responseUrl || link
      };
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        return { url: link, status: false, statusCode: 'unfetched', metaProperties: [], finalUrl: link };
      } else if (error.response) {
        return { url: link, status: false, statusCode: error.response.status, metaProperties: [], finalUrl: link };
      } else {
        return { url: link, status: false, statusCode: null, metaProperties: [], finalUrl: link };
      }
    }
  }
}

async function processLinksInBatches(links, batchSize) {
  const results = [];
  for (let i = 0; i < links.length; i += batchSize) {
    const batch = links.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(link => checkLink(link)));
    results.push(...batchResults);
  }
  return results;
}

app.post('/check-links', async (req, res) => {
  const { urls, filterChecked, hierarchyChecked, ariaLabelChecked, imageChecked, metaChecked } = req.body;
  const results = [];

  for (const url of urls) {
    try {
      const response = await axios.get(url);
      const html = response.data;
      const $ = cheerio.load(html);
      const links = [];
      const hierarchy = [];
      const ariaLinks = [];
      const images = [];
      const metaProperties = [];

      function filterHeaderFooter(elements) {
        return elements.filter((index, element) => {
          return $(element).closest('header').length === 0 && $(element).closest('footer').length === 0;
        });
      }

      if (hierarchyChecked) {
        let elements = $('h1, h2, h3, h4, h5, h6');
        if (filterChecked) {
          elements = filterHeaderFooter(elements);
        }
        elements.each((index, element) => {
          hierarchy.push({
            text: $(element).text().replace(/[\t\n]/g, '').trim(),
            tag: $(element).prop('tagName')
          });
        });
      }
      
      if (ariaLabelChecked) {
        let elements = $('a[aria-label]');
        if (filterChecked) {
          elements = filterHeaderFooter(elements);
        }
        elements.each((index, element) => {
          ariaLinks.push({
            ariaLabel: $(element).attr('aria-label').replace(/[\t\n]/g, '').trim(),
            url: $(element).attr('href'),
            target: $(element).attr('target') || '_self'
          });
        });
      }

      if (imageChecked) {
        let elements = $('img');
        if (filterChecked) {
          elements = filterHeaderFooter(elements);
        }
        elements.each((index, element) => {
          images.push({
            src: $(element).attr('src'),
            alt: $(element).attr('alt') ? $(element).attr('alt').replace(/[\t\n]/g, '').trim() : null
          });
        });
      }

      if (metaChecked) {
        $('meta').each((index, element) => {
          const metaTag = {};
          if ($(element).attr('property')) {
            metaTag.property = $(element).attr('property');
            metaTag.content = $(element).attr('content') ? $(element).attr('content').replace(/[\t\n]/g, '').trim() : null;
          } else if ($(element).attr('name')) {
            metaTag.name = $(element).attr('name');
            metaTag.content = $(element).attr('content') ? $(element).attr('content').replace(/[\t\n]/g, '').trim() : null;
          } else {
            metaTag.attribute = $(element).attr('attribute');
            metaTag.content = $(element).attr('content') ? $(element).attr('content').replace(/[\t\n]/g, '').trim() : null;
          }
          if (Object.keys(metaTag).length > 0) {
            metaProperties.push(metaTag);
          }
        });
      }

      if (!hierarchyChecked && !ariaLabelChecked && !imageChecked) {
        let elements = $('a');
        if (filterChecked) {
          elements = filterHeaderFooter(elements);
        }
        elements.each((index, element) => {
          const href = $(element).attr('href');
          if (href && (href.startsWith('http') || href.startsWith('#'))) {
            links.push(href);
          }
        });
      }

      const batchSize = 20;
      const pageResults = await processLinksInBatches(links, batchSize);
      results.push({ pageUrl: url, links: pageResults, hierarchy, ariaLinks, images, metaProperties });

    } catch (error) {
      console.error('Error fetching the provided URL:', error.message);
      results.push({ pageUrl: url, error: 'Error fetching the provided URL.' });
    }
  }

  res.json(results);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});