const Redis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password || undefined,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

redis.on('connect', () => {
  logger.info('Redis connection established successfully');
});

redis.on('error', (error) => {
  logger.error('Redis connection error:', error);
});

module.exports = redis;
