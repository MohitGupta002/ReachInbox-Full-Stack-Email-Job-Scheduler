const { Client } = require('@elastic/elasticsearch');
const { isTcpPortReachableSync } = require('./db');
require('dotenv').config();

const elasticNode = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';

let elasticHost = '127.0.0.1';
let elasticPort = 9200;
try {
  const parsed = new URL(elasticNode);
  elasticHost = parsed.hostname || elasticHost;
  elasticPort = Number(parsed.port) || (parsed.protocol === 'https:' ? 443 : 9200);
} catch (e) {
  // Use defaults
}

let elasticAvailable = isTcpPortReachableSync(elasticHost, elasticPort, 500);

const elastic = new Client({
  node: elasticNode,
  requestTimeout: 1500,
  maxRetries: 0,
});

function isElasticAvailable() {
  return elasticAvailable;
}

async function initElasticIndex() {
  if (!elasticAvailable) {
    console.warn(`[Elasticsearch] Node unreachable at ${elasticHost}:${elasticPort} — search & indexing operating in fast DB fallback mode.`);
    return false;
  }

  try {
    const exists = await elastic.indices.exists({ index: 'emails' });
    if (!exists) {
      await elastic.indices.create({
        index: 'emails',
        body: {
          mappings: {
            properties: {
              id: { type: 'keyword' },
              user_id: { type: 'keyword' },
              sender_id: { type: 'keyword' },
              recipient_email: { type: 'text', fields: { keyword: { type: 'keyword' } } },
              subject: { type: 'text' },
              body: { type: 'text' },
              status: { type: 'keyword' },
              scheduled_at: { type: 'date' },
              sent_at: { type: 'date' },
              ethereal_preview_url: { type: 'keyword' },
              message_id: { type: 'keyword' },
              error_message: { type: 'text' },
              created_at: { type: 'date' },
            },
          },
        },
      });
      console.log('[Elasticsearch] Created "emails" index.');
    } else {
      console.log('[Elasticsearch] Index "emails" is ready.');
    }
    return true;
  } catch (err) {
    elasticAvailable = false;
    console.warn(`[Elasticsearch] Initialization warning: ${err.message || err.code || 'unreachable'}. Search operating with DB fallback.`);
    return false;
  }
}

module.exports = { elastic, initElasticIndex, isElasticAvailable };
