require('dotenv').config();
const { createAllIndexes, recreateProductIndex } = require('../models');
const { checkConnection } = require('../clients/elasticsearch');
const logger = require('../utils/logger');

async function init() {
  try {
    logger.info('Starting index initialization...');

    const connected = await checkConnection();
    if (!connected) {
      logger.error('Cannot connect to Elasticsearch. Exiting.');
      process.exit(1);
    }

    const action = process.argv[2];

    if (action === '--recreate') {
      logger.info('Recreating product index...');
      await recreateProductIndex();
    } else {
      logger.info('Creating all indexes...');
      await createAllIndexes();
    }

    logger.info('Index initialization completed successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('Index initialization failed:', error);
    process.exit(1);
  }
}

init();
