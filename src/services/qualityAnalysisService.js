const { client } = require('../clients/elasticsearch');
const config = require('../config');
const logger = require('../utils/logger');
const redis = require('../clients/redis');
const { getSpellSuggestion } = require('./searchService');

const SEARCH_LOG_INDEX = config.elasticsearch.searchLogIndex;
const NO_RESULT_KEY_PREFIX = 'no_result:';
const NO_RESULT_EXPIRE_DAYS = 30;

async function recordNoResultQuery(query, userId, sessionId) {
  if (!query || !query.trim()) {
    return;
  }

  const normalizedQuery = query.toLowerCase().trim();

  try {
    const key = `${NO_RESULT_KEY_PREFIX}${normalizedQuery}`;
    const today = new Date().toISOString().split('T')[0];

    await redis.zincrby(`${key}:dates`, 1, today);
    await redis.incrby(`${key}:total`, 1);
    await redis.expire(`${key}:dates`, NO_RESULT_EXPIRE_DAYS * 24 * 60 * 60);
    await redis.expire(`${key}:total`, NO_RESULT_EXPIRE_DAYS * 24 * 60 * 60);

    await redis.hincrby(`${NO_RESULT_KEY_PREFIX}metadata`, normalizedQuery, 1);
    await redis.expire(`${NO_RESULT_KEY_PREFIX}metadata`, NO_RESULT_EXPIRE_DAYS * 24 * 60 * 60);

    if (userId) {
      await redis.sadd(`${key}:users`, userId);
    }

    logger.debug('No result query recorded:', normalizedQuery);
  } catch (error) {
    logger.error('Failed to record no result query:', error);
  }
}

async function getSimilarKeywords(query, limit = 5) {
  if (!query || !query.trim()) {
    return [];
  }

  const suggestions = [];

  const spellSuggestions = await getSpellSuggestion(query);
  if (spellSuggestions && spellSuggestions.length > 0) {
    suggestions.push(...spellSuggestions.slice(0, Math.ceil(limit / 2)));
  }

  const contextSuggestions = await getContextBasedSuggestions(query);
  if (contextSuggestions && contextSuggestions.length > 0) {
    suggestions.push(...contextSuggestions.slice(0, limit - suggestions.length));
  }

  const hotSuggestions = await getHotwordSuggestions(query);
  if (hotSuggestions && hotSuggestions.length > 0) {
    for (const hot of hotSuggestions) {
      if (!suggestions.find(s => s.text === hot.keyword)) {
        suggestions.push({ text: hot.keyword, score: hot.count, type: 'hot' });
      }
      if (suggestions.length >= limit) break;
    }
  }

  return suggestions.slice(0, limit);
}

async function getContextBasedSuggestions(query) {
  try {
    const queryTerms = query.toLowerCase().trim().split(/\s+/);
    const response = await client.search({
      index: SEARCH_LOG_INDEX,
      body: {
        query: {
          bool: {
            must: [
              { range: { resultsCount: { gt: 0 } } },
              {
                bool: {
                  should: queryTerms.map(term => ({
                    match: {
                      query: {
                        query: term,
                        operator: 'and'
                      }
                    }
                  }))
                }
              }
            ]
          }
        },
        aggs: {
          similar_queries: {
            terms: {
              field: 'normalizedQuery',
              size: 20,
              min_doc_count: 3,
              order: {
                avg_click: 'desc'
              }
            },
            aggs: {
              avg_click: {
                avg: {
                  field: 'clickCount'
                }
              }
            }
          }
        },
        size: 0
      }
    });

    const suggestions = [];
    if (response.aggregations && response.aggregations.similar_queries) {
      for (const bucket of response.aggregations.similar_queries.buckets) {
        if (bucket.key !== query.toLowerCase().trim()) {
          suggestions.push({
            text: bucket.key,
            score: bucket.avg_click.value || 0,
            type: 'related',
            count: bucket.doc_count
          });
        }
      }
    }

    return suggestions;
  } catch (error) {
    logger.error('Failed to get context based suggestions:', error);
    return [];
  }
}

async function getHotwordSuggestions(query) {
  try {
    const { getHotwords } = require('./analyticsService');
    const hotwords = await getHotwords(20, 48);
    return hotwords;
  } catch (error) {
    logger.error('Failed to get hotword suggestions:', error);
    return [];
  }
}

async function getNoResultKeywords(days = 7, limit = 50) {
  try {
    const result = [];
    const metadata = await redis.hgetall(`${NO_RESULT_KEY_PREFIX}metadata`);

    const entries = Object.entries(metadata || {});

    for (const [keyword, count] of entries) {
      const datesKey = `${NO_RESULT_KEY_PREFIX}${keyword}:dates`;
      const recentCount = await redis.zrange(datesKey, -days, -1, 'WITHSCORES');

      let recentTotal = 0;
      for (let i = 1; i < recentCount.length; i += 2) {
        recentTotal += parseInt(recentCount[i]);
      }

      result.push({
        keyword,
        totalCount: parseInt(count),
        recentCount: recentTotal,
        lastSearches: parseDateSearches(recentCount)
      });
    }

    return result
      .sort((a, b) => b.recentCount - a.recentCount)
      .slice(0, limit);
  } catch (error) {
    logger.error('Failed to get no result keywords:', error);
    return [];
  }
}

function parseDateSearches(datesArray) {
  const searches = [];
  for (let i = 0; i < datesArray.length; i += 2) {
    searches.push({
      date: datesArray[i],
      count: parseInt(datesArray[i + 1])
    });
  }
  return searches;
}

async function getHighClickKeywords(startDate, endDate, limit = 50, minCount = 100) {
  try {
    const response = await client.search({
      index: SEARCH_LOG_INDEX,
      body: {
        query: {
          bool: {
            must: [
              { range: { timestamp: { gte: startDate.toISOString(), lte: endDate.toISOString() } } },
              { range: { clickCount: { gt: 0 } } }
            ]
          }
        },
        aggs: {
          high_click_words: {
            terms: {
              field: 'normalizedQuery',
              size: limit,
              min_doc_count: minCount,
              order: {
                total_clicks: 'desc'
              }
            },
            aggs: {
              total_clicks: {
                sum: {
                  field: 'clickCount'
                }
              },
              avg_click_rate: {
                bucket_script: {
                  buckets_path: {
                    clicks: 'total_clicks',
                    searches: '_count'
                  },
                  script: 'params.clicks / params.searches'
                }
              }
            }
          }
        },
        size: 0
      }
    });

    const keywords = [];
    if (response.aggregations && response.aggregations.high_click_words) {
      for (const bucket of response.aggregations.high_click_words.buckets) {
        keywords.push({
          keyword: bucket.key,
          searchCount: bucket.doc_count,
          clickCount: bucket.total_clicks.value,
          clickRate: bucket.avg_click_rate.value || 0
        });
      }
    }

    return keywords;
  } catch (error) {
    logger.error('Failed to get high click keywords:', error);
    return [];
  }
}

async function getLowClickRateKeywords(startDate, endDate, limit = 50, threshold = 0.1) {
  try {
    const response = await client.search({
      index: SEARCH_LOG_INDEX,
      body: {
        query: {
          bool: {
            must: [
              { range: { timestamp: { gte: startDate.toISOString(), lte: endDate.toISOString() } } },
              { range: { resultsCount: { gt: 0 } } }
            ]
          }
        },
        aggs: {
          all_queries: {
            terms: {
              field: 'normalizedQuery',
              size: 1000,
              min_doc_count: 10
            },
            aggs: {
              total_clicks: {
                sum: {
                  field: 'clickCount'
                }
              },
              avg_results: {
                avg: {
                  field: 'resultsCount'
                }
              },
              click_rate: {
                bucket_script: {
                  buckets_path: {
                    clicks: 'total_clicks',
                    searches: '_count'
                  },
                  script: 'params.clicks / params.searches'
                }
              }
            }
          }
        },
        size: 0
      }
    });

    const lowClickKeywords = [];

    if (response.aggregations && response.aggregations.all_queries) {
      for (const bucket of response.aggregations.all_queries.buckets) {
        const clickRate = bucket.click_rate.value || 0;
        if (clickRate < threshold) {
          lowClickKeywords.push({
            keyword: bucket.key,
            searchCount: bucket.doc_count,
            clickCount: bucket.total_clicks.value,
            clickRate,
            avgResults: bucket.avg_results.value || 0
          });
        }
      }
    }

    return lowClickKeywords
      .sort((a, b) => a.clickRate - b.clickRate)
      .slice(0, limit);
  } catch (error) {
    logger.error('Failed to get low click rate keywords:', error);
    return [];
  }
}

async function getSearchQualityReport(startDate, endDate) {
  try {
    const [
      highClickKeywords,
      lowClickRateKeywords,
      noResultKeywords,
      searchStats
    ] = await Promise.all([
      getHighClickKeywords(startDate, endDate, 20),
      getLowClickRateKeywords(startDate, endDate, 20),
      getNoResultKeywords(7, 20),
      getSearchStatsSummary(startDate, endDate)
    ]);

    return {
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      summary: searchStats,
      highClickKeywords,
      lowClickRateKeywords,
      noResultKeywords
    };
  } catch (error) {
    logger.error('Failed to get search quality report:', error);
    return null;
  }
}

async function getSearchStatsSummary(startDate, endDate) {
  try {
    const response = await client.search({
      index: SEARCH_LOG_INDEX,
      body: {
        query: {
          range: {
            timestamp: {
              gte: startDate.toISOString(),
              lte: endDate.toISOString()
            }
          }
        },
        aggs: {
          total_clicks: { sum: { field: 'clickCount' } },
          avg_response_time: { avg: { field: 'responseTime' } },
          avg_click_count: { avg: { field: 'clickCount' } },
          zero_result_searches: {
            filter: { term: { resultsCount: 0 } }
          },
          clicked_searches: {
            filter: { range: { clickCount: { gt: 0 } } }
          }
        },
        size: 0
      }
    });

    const aggs = response.aggregations;
    const totalSearches = response.hits.total.value;
    const zeroResultCount = aggs.zero_result_searches?.doc_count || 0;
    const clickedCount = aggs.clicked_searches?.doc_count || 0;

    return {
      totalSearches,
      totalClicks: aggs.total_clicks?.value || 0,
      zeroResultCount,
      zeroResultRate: totalSearches > 0 ? zeroResultCount / totalSearches : 0,
      clickedCount,
      clickThroughRate: totalSearches > 0 ? clickedCount / totalSearches : 0,
      avgResponseTime: aggs.avg_response_time?.value || 0,
      avgClickCount: aggs.avg_click_count?.value || 0
    };
  } catch (error) {
    logger.error('Failed to get search stats summary:', error);
    return {
      totalSearches: 0,
      totalClicks: 0,
      zeroResultCount: 0,
      zeroResultRate: 0,
      clickedCount: 0,
      clickThroughRate: 0,
      avgResponseTime: 0,
      avgClickCount: 0
    };
  }
}

async function getSearchTrends(days = 7) {
  try {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

    const response = await client.search({
      index: SEARCH_LOG_INDEX,
      body: {
        query: {
          range: {
            timestamp: {
              gte: startDate.toISOString(),
              lte: endDate.toISOString()
            }
          }
        },
        aggs: {
          daily_trends: {
            date_histogram: {
              field: 'timestamp',
              calendar_interval: 'day',
              format: 'yyyy-MM-dd'
            },
            aggs: {
              total_clicks: { sum: { field: 'clickCount' } },
              zero_result_count: {
                filter: { term: { resultsCount: 0 } }
              }
            }
          }
        },
        size: 0
      }
    });

    const trends = [];
    if (response.aggregations && response.aggregations.daily_trends) {
      for (const bucket of response.aggregations.daily_trends.buckets) {
        trends.push({
          date: bucket.key_as_string,
          searchCount: bucket.doc_count,
          clickCount: bucket.total_clicks?.value || 0,
          zeroResultCount: bucket.zero_result_count?.doc_count || 0
        });
      }
    }

    return trends;
  } catch (error) {
    logger.error('Failed to get search trends:', error);
    return [];
  }
}

module.exports = {
  recordNoResultQuery,
  getSimilarKeywords,
  getNoResultKeywords,
  getHighClickKeywords,
  getLowClickRateKeywords,
  getSearchQualityReport,
  getSearchStatsSummary,
  getSearchTrends
};
