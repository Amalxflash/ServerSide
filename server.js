const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

// Function to check the status of a link and fetch meta properties
async function checkLink(link) {
  if (link.startsWith('#')) {
    return { url: link, status: true, statusCode: 'Fragment', metaProperties: [] };
  } else {
    try {
      const response = await axios.get(link);
      const html = response.data;
      const $ = cheerio.load(html);

      // Extract meta properties
      const metaProperties = [];
      $('meta').each((index, element) => {
        const property = $(element).attr('property');
        const content = $(element).attr('content');
        if (property && content) {
          metaProperties.push({ property, content: content.replace(/[\t\n]/g, '').trim() });
        }
      });

      return { url: link, status: true, statusCode: response.status, metaProperties };
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        return { url: link, status: false, statusCode: 'unfetched', metaProperties: [] };
      } else if (error.response) {
        return { url: link, status: false, statusCode: error.response.status, metaProperties: [] };
      } else {
        return { url: link, status: false, statusCode: null, metaProperties: [] };
      }
    }
  }
}

// Function to process links in batches
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
  const { urls, filterChecked, hierarchyChecked, ariaLabelChecked, imageChecked, metaChecked, textChecked } = req.body;
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
      const textContent = [];

      // Function to filter out elements inside header and footer
      function filterHeaderFooter(elements) {
        return elements.filter((index, element) => {
          return $(element).closest('header').length === 0 && $(element).closest('footer').length === 0;
        });
      }

      // Function to extract text content
      function extractText($, filterChecked) {
        let elements = $('h1, h2, h3, h4, h5, h6, p, a, div, span, strong');
        if (filterChecked) {
          elements = filterHeaderFooter(elements);
        }
        return elements.map((index, element) => ({
          tag: $(element).prop('tagName').toLowerCase(),
          text: $(element).text().replace(/[\t\n]/g, '').trim()
        })).get();
      }

      // Conditionally extract elements based on checkbox states
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
            url,
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

      if (textChecked) {
        textContent.push(...extractText($, filterChecked));
      }

      if (!hierarchyChecked && !ariaLabelChecked && !imageChecked && !textChecked) {
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
      results.push({ pageUrl: url, links: pageResults, hierarchy, ariaLinks, images, metaProperties, textContent });

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