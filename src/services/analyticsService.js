const Queue = require('bull');
const { client } = require('../clients/elasticsearch');
const config = require('../config');
const logger = require('../utils/logger');

const searchLogQueue = new Queue('search-log', {
  redis: {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined
  }
});

const SEARCH_LOG_INDEX = config.elasticsearch.searchLogIndex;
const HOTWORDS_INDEX = config.elasticsearch.hotwordsIndex;

searchLogQueue.process(async (job) => {
  const searchLog = job.data;

  try {
    await client.index({
      index: SEARCH_LOG_INDEX,
      body: {
        ...searchLog,
        timestamp: searchLog.timestamp || new Date()
      }
    });

    if (searchLog.query && searchLog.query.trim()) {
      await incrementHotword(searchLog.query);
    }

    logger.debug('Search log processed:', searchLog.query);
  } catch (error) {
    logger.error('Failed to process search log:', error);
    throw error;
  }
});

async function logSearch(searchData) {
  const logEntry = {
    query: searchData.query || '',
    normalizedQuery: normalizeQuery(searchData.query),
    userId: searchData.userId || 'anonymous',
    sessionId: searchData.sessionId || generateSessionId(),
    resultsCount: searchData.resultsCount || 0,
    clickCount: searchData.clickCount || 0,
    clickedProducts: searchData.clickedProducts || [],
    filters: searchData.filters || {},
    sortBy: searchData.sortBy || 'relevance',
    page: searchData.page || 1,
    pageSize: searchData.pageSize || 20,
    responseTime: searchData.responseTime || 0,
    hasSuggestion: searchData.hasSuggestion || false,
    suggestion: searchData.suggestion || null,
    ip: searchData.ip || null,
    userAgent: searchData.userAgent || null,
    timestamp: new Date()
  };

  try {
    await searchLogQueue.add(logEntry, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000
      }
    });
    logger.debug('Search log queued successfully');
  } catch (error) {
    logger.error('Failed to queue search log:', error);
  }
}

async function logClick(clickData) {
  try {
    await client.updateByQuery({
      index: SEARCH_LOG_INDEX,
      body: {
        query: {
          bool: {
            must: [
              { term: { sessionId: clickData.sessionId } },
              { match: { query: clickData.query } }
            ]
          }
        },
        script: {
          source: `
            ctx._source.clickCount = (ctx._source.clickCount || 0) + 1;
            if (ctx._source.clickedProducts == null) {
              ctx._source.clickedProducts = [];
            }
            if (ctx._source.clickedProducts.indexOf(params.productId) == -1) {
              ctx._source.clickedProducts.add(params.productId);
            }
          `,
          params: {
            productId: clickData.productId
          }
        },
        refresh: true
      }
    });

    logger.debug('Click logged for product:', clickData.productId);
  } catch (error) {
    logger.error('Failed to log click:', error);
  }
}

async function incrementHotword(keyword) {
  const normalizedKeyword = normalizeQuery(keyword);
  if (!normalizedKeyword || normalizedKeyword.length < 2) {
    return;
  }

  const now = new Date();
  const hourBucket = getHourBucket(now);

  try {
    await client.update({
      index: HOTWORDS_INDEX,
      id: `${normalizedKeyword}_${hourBucket}`,
      body: {
        script: {
          source: `ctx._source.count = (ctx._source.count || 0) + 1`,
          lang: 'painless'
        },
        upsert: {
          keyword: normalizedKeyword,
          originalKeyword: keyword,
          count: 1,
          timestamp: now,
          hourBucket
        }
      },
      refresh: 'wait_for'
    });
    logger.debug('Hotword incremented:', normalizedKeyword);
  } catch (error) {
    logger.error('Failed to increment hotword:', error);
  }
}

async function getHotwords(limit = 20, windowHours = 24) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - (windowHours * 60 * 60 * 1000));

  try {
    const response = await client.search({
      index: HOTWORDS_INDEX,
      body: {
        query: {
          range: {
            timestamp: {
              gte: windowStart.toISOString()
            }
          }
        },
        aggs: {
          top_hotwords: {
            terms: {
              field: 'keyword',
              size: limit,
              order: {
                total_count: 'desc'
              }
            },
            aggs: {
              total_count: {
                sum: {
                  field: 'count'
                }
              }
            }
          }
        },
        size: 0
      }
    });

    const hotwords = response.aggregations.top_hotwords.buckets.map(bucket => ({
      keyword: bucket.key,
      count: bucket.total_count.value,
      trend: bucket.total_count.value > 10 ? 'up' : 'stable'
    }));

    return hotwords;
  } catch (error) {
    logger.error('Failed to get hotwords:', error);
    return [];
  }
}

function getHourBucket(date) {
  const d = date || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}`;
}

function normalizeQuery(query) {
  if (!query) return '';
  return query.toLowerCase().trim().replace(/\s+/g, ' ');
}

function generateSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function getSearchStats(startDate, endDate) {
  try {
    const response = await client.count({
      index: SEARCH_LOG_INDEX,
      body: {
        query: {
          range: {
            timestamp: {
              gte: startDate.toISOString(),
              lte: endDate.toISOString()
            }
          }
        }
      }
    });
    return {
      totalSearches: response.count
    };
  } catch (error) {
    logger.error('Failed to get search stats:', error);
    return { totalSearches: 0 };
  }
}

module.exports = {
  logSearch,
  logClick,
  incrementHotword,
  getHotwords,
  getSearchStats,
  searchLogQueue
};
