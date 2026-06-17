require('dotenv').config();

module.exports = {
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development'
  },
  elasticsearch: {
    node: process.env.ES_NODE || 'http://localhost:9200',
    username: process.env.ES_USERNAME || 'elastic',
    password: process.env.ES_PASSWORD || 'changeme',
    productIndex: process.env.ES_PRODUCT_INDEX || 'products',
    searchLogIndex: process.env.ES_SEARCH_LOG_INDEX || 'search_logs',
    hotwordsIndex: process.env.ES_HOTWORDS_INDEX || 'hotwords'
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || null
  },
  search: {
    hotwordsTopN: parseInt(process.env.HOTWORDS_TOP_N) || 20,
    hotwordsWindowHours: parseInt(process.env.HOTWORDS_WINDOW_HOURS) || 24,
    maxSearchResults: parseInt(process.env.MAX_SEARCH_RESULTS) || 100,
    defaultPageSize: parseInt(process.env.DEFAULT_PAGE_SIZE) || 20
  },
  analysis: {
    lowClickRateThreshold: parseFloat(process.env.LOW_CLICK_RATE_THRESHOLD) || 0.1,
    highClickWordMinCount: parseInt(process.env.HIGH_CLICK_WORD_MIN_COUNT) || 100
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  }
};
