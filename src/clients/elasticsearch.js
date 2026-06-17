const { Client } = require('@elastic/elasticsearch');
const config = require('../config');
const logger = require('../utils/logger');

const client = new Client({
  node: config.elasticsearch.node,
  auth: {
    username: config.elasticsearch.username,
    password: config.elasticsearch.password
  },
  maxRetries: 5,
  requestTimeout: 60000,
  sniffOnStart: true
});

async function checkConnection() {
  try {
    await client.ping();
    logger.info('Elasticsearch connection established successfully');
    return true;
  } catch (error) {
    logger.error('Elasticsearch connection failed:', error);
    return false;
  }
}

module.exports = {
  client,
  checkConnection
};
