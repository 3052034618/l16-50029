const { client } = require('../clients/elasticsearch');
const config = require('../config');
const logger = require('../utils/logger');

const PRODUCT_INDEX = config.elasticsearch.productIndex;
const SEARCH_LOG_INDEX = config.elasticsearch.searchLogIndex;
const HOTWORDS_INDEX = config.elasticsearch.hotwordsIndex;

const productIndexSettings = {
  settings: {
    analysis: {
      analyzer: {
        ik_smart_pinyin: {
          type: 'custom',
          tokenizer: 'ik_smart',
          filter: ['pinyin_filter', 'lowercase']
        },
        ik_max_word_pinyin: {
          type: 'custom',
          tokenizer: 'ik_max_word',
          filter: ['pinyin_filter', 'lowercase']
        },
        pinyin_analyzer: {
          tokenizer: 'pinyin_tokenizer'
        }
      },
      filter: {
        pinyin_filter: {
          type: 'pinyin',
          keep_first_letter: true,
          keep_full_pinyin: true,
          keep_original: true,
          limit_first_letter_length: 16,
          lower_case: true
        }
      },
      tokenizer: {
        pinyin_tokenizer: {
          type: 'pinyin',
          keep_first_letter: true,
          keep_full_pinyin: true,
          keep_original: true,
          lower_case: true
        }
      }
    }
  },
  mappings: {
    properties: {
      productId: { type: 'keyword' },
      title: {
        type: 'text',
        analyzer: 'ik_max_word',
        search_analyzer: 'ik_smart',
        fields: {
          pinyin: {
            type: 'text',
            analyzer: 'pinyin_analyzer',
            search_analyzer: 'pinyin_analyzer'
          },
          keyword: { type: 'keyword', ignore_above: 256 }
        }
      },
      description: {
        type: 'text',
        analyzer: 'ik_max_word',
        search_analyzer: 'ik_smart'
      },
      category: {
        type: 'keyword',
        fields: {
          text: {
            type: 'text',
            analyzer: 'ik_smart'
          }
        }
      },
      categoryPath: { type: 'keyword' },
      brand: {
        type: 'keyword',
        fields: {
          text: {
            type: 'text',
            analyzer: 'ik_smart'
          },
          pinyin: {
            type: 'text',
            analyzer: 'pinyin_analyzer'
          }
        }
      },
      price: { type: 'double' },
      originalPrice: { type: 'double' },
      salesCount: { type: 'integer' },
      stock: { type: 'integer' },
      sellerId: { type: 'keyword' },
      sellerName: {
        type: 'keyword',
        fields: {
          text: {
            type: 'text',
            analyzer: 'ik_smart'
          }
        }
      },
      images: { type: 'keyword' },
      tags: { type: 'keyword' },
      attributes: {
        type: 'nested',
        properties: {
          name: { type: 'keyword' },
          value: {
            type: 'keyword',
            fields: {
              text: { type: 'text', analyzer: 'ik_smart' }
            }
          }
        }
      },
      status: { type: 'keyword' },
      createdAt: { type: 'date' },
      updatedAt: { type: 'date' },
      weight: { type: 'float' }
    }
  }
};

const searchLogIndexSettings = {
  mappings: {
    properties: {
      query: {
        type: 'text',
        analyzer: 'ik_smart',
        fields: {
          keyword: { type: 'keyword' }
        }
      },
      normalizedQuery: { type: 'keyword' },
      userId: { type: 'keyword' },
      sessionId: { type: 'keyword' },
      resultsCount: { type: 'integer' },
      clickCount: { type: 'integer' },
      clickedProducts: { type: 'keyword' },
      filters: { type: 'object', enabled: false },
      sortBy: { type: 'keyword' },
      page: { type: 'integer' },
      pageSize: { type: 'integer' },
      responseTime: { type: 'integer' },
      hasSuggestion: { type: 'boolean' },
      suggestion: { type: 'keyword' },
      ip: { type: 'ip' },
      userAgent: { type: 'keyword' },
      timestamp: { type: 'date' }
    }
  }
};

const hotwordsIndexSettings = {
  mappings: {
    properties: {
      keyword: { type: 'keyword' },
      count: { type: 'integer' },
      timestamp: { type: 'date' },
      hourBucket: { type: 'keyword' }
    }
  }
};

async function createProductIndex() {
  try {
    const exists = await client.indices.exists({ index: PRODUCT_INDEX });
    if (exists) {
      logger.info(`Product index ${PRODUCT_INDEX} already exists`);
      return true;
    }
    await client.indices.create({
      index: PRODUCT_INDEX,
      body: productIndexSettings
    });
    logger.info(`Product index ${PRODUCT_INDEX} created successfully`);
    return true;
  } catch (error) {
    logger.error('Failed to create product index:', error);
    throw error;
  }
}

async function createSearchLogIndex() {
  try {
    const exists = await client.indices.exists({ index: SEARCH_LOG_INDEX });
    if (exists) {
      logger.info(`Search log index ${SEARCH_LOG_INDEX} already exists`);
      return true;
    }
    await client.indices.create({
      index: SEARCH_LOG_INDEX,
      body: searchLogIndexSettings
    });
    logger.info(`Search log index ${SEARCH_LOG_INDEX} created successfully`);
    return true;
  } catch (error) {
    logger.error('Failed to create search log index:', error);
    throw error;
  }
}

async function createHotwordsIndex() {
  try {
    const exists = await client.indices.exists({ index: HOTWORDS_INDEX });
    if (exists) {
      logger.info(`Hotwords index ${HOTWORDS_INDEX} already exists`);
      return true;
    }
    await client.indices.create({
      index: HOTWORDS_INDEX,
      body: hotwordsIndexSettings
    });
    logger.info(`Hotwords index ${HOTWORDS_INDEX} created successfully`);
    return true;
  } catch (error) {
    logger.error('Failed to create hotwords index:', error);
    throw error;
  }
}

async function createAllIndexes() {
  await createProductIndex();
  await createSearchLogIndex();
  await createHotwordsIndex();
}

async function deleteProductIndex() {
  try {
    const exists = await client.indices.exists({ index: PRODUCT_INDEX });
    if (exists) {
      await client.indices.delete({ index: PRODUCT_INDEX });
      logger.info(`Product index ${PRODUCT_INDEX} deleted successfully`);
    }
    return true;
  } catch (error) {
    logger.error('Failed to delete product index:', error);
    throw error;
  }
}

async function recreateProductIndex() {
  await deleteProductIndex();
  await createProductIndex();
}

module.exports = {
  PRODUCT_INDEX,
  SEARCH_LOG_INDEX,
  HOTWORDS_INDEX,
  createProductIndex,
  createSearchLogIndex,
  createHotwordsIndex,
  createAllIndexes,
  deleteProductIndex,
  recreateProductIndex
};
