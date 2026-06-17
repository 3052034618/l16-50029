const { client } = require('../clients/elasticsearch');
const { PRODUCT_INDEX } = require('../models');
const { validateSearchQuery } = require('../models/product');
const config = require('../config');
const logger = require('../utils/logger');
const natural = require('natural');

function buildQuery(params) {
  const { q, category, brand, minPrice, maxPrice, sellerId, tags, attributes } = params;

  const mustClauses = [];
  const filterClauses = [];

  filterClauses.push({ term: { status: 'active' } });

  if (q && q.trim()) {
    const query = q.trim();
    mustClauses.push({
      multi_match: {
        query,
        fields: [
          'title^10',
          'title.pinyin^5',
          'brand^8',
          'brand.pinyin^4',
          'category^6',
          'category.text^4',
          'description^2',
          'tags^3',
          'sellerName^2',
          'attributes.value^2',
          'attributes.value.text^1'
        ],
        type: 'best_fields',
        tie_breaker: 0.3,
        minimum_should_match: '70%'
      }
    });

    filterClauses.push({
      bool: {
        should: [
          { match_phrase_prefix: { title: query } },
          { match_phrase_prefix: { 'title.pinyin': query } },
          { fuzzy: { title: { value: query, fuzziness: 'AUTO' } } }
        ],
        minimum_should_match: 0
      }
    });
  } else {
    mustClauses.push({ match_all: {} });
  }

  if (category && category.trim()) {
    filterClauses.push({
      bool: {
        should: [
          { term: { category: category } },
          { term: { categoryPath: category } }
        ]
      }
    });
  }

  if (brand && brand.length > 0) {
    const brandList = Array.isArray(brand) ? brand : [brand];
    filterClauses.push({ terms: { brand: brandList } });
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    const rangeQuery = {};
    if (minPrice !== undefined) rangeQuery.gte = minPrice;
    if (maxPrice !== undefined) rangeQuery.lte = maxPrice;
    filterClauses.push({ range: { price: rangeQuery } });
  }

  if (sellerId && sellerId.trim()) {
    filterClauses.push({ term: { sellerId } });
  }

  if (tags && tags.length > 0) {
    const tagList = Array.isArray(tags) ? tags : [tags];
    filterClauses.push({ terms: { tags: tagList } });
  }

  if (attributes && Object.keys(attributes).length > 0) {
    for (const [attrName, attrValue] of Object.entries(attributes)) {
      const values = Array.isArray(attrValue) ? attrValue : [attrValue];
      filterClauses.push({
        nested: {
          path: 'attributes',
          query: {
            bool: {
              must: [
                { term: { 'attributes.name': attrName } },
                { terms: { 'attributes.value': values } }
              ]
            }
          }
        }
      });
    }
  }

  return {
    bool: {
      must: mustClauses,
      filter: filterClauses
    }
  };
}

function buildSort(sortBy) {
  switch (sortBy) {
    case 'sales':
      return [
        { salesCount: { order: 'desc' } },
        { _score: { order: 'desc' } }
      ];
    case 'price_asc':
      return [
        { price: { order: 'asc' } },
        { _score: { order: 'desc' } }
      ];
    case 'price_desc':
      return [
        { price: { order: 'desc' } },
        { _score: { order: 'desc' } }
      ];
    case 'relevance':
    default:
      return [
        { _score: { order: 'desc' } },
        { weight: { order: 'desc' } },
        { salesCount: { order: 'desc' } }
      ];
  }
}

function buildCollapse(collapseBy, collapseSize) {
  if (collapseBy === 'none') return null;

  const field = collapseBy === 'seller' ? 'sellerId' : 'brand';
  return {
    field,
    inner_hits: {
      name: 'other_products',
      size: collapseSize - 1,
      sort: buildSort('relevance'),
      _source: {
        includes: ['productId', 'title', 'price', 'images', 'salesCount']
      }
    }
  };
}

function buildHighlight() {
  return {
    pre_tags: ['<em>'],
    post_tags: ['</em>'],
    fields: {
      title: {
        number_of_fragments: 0,
        require_field_match: false
      },
      description: {
        number_of_fragments: 1,
        fragment_size: 150,
        require_field_match: false
      },
      brand: {
        number_of_fragments: 0,
        require_field_match: false
      },
      category: {
        number_of_fragments: 0,
        require_field_match: false
      }
    }
  };
}

async function searchProducts(params) {
  const { error, value } = validateSearchQuery(params);
  if (error) {
    throw new Error(`Invalid search parameters: ${error.message}`);
  }

  const {
    q,
    sortBy,
    page,
    pageSize,
    collapseBy,
    collapseSize,
    highlight
  } = value;

  const query = buildQuery(value);
  const from = (page - 1) * pageSize;
  const size = Math.min(pageSize, config.search.maxSearchResults);
  const sort = buildSort(sortBy);
  const collapse = buildCollapse(collapseBy, collapseSize);

  const searchBody = {
    query,
    from,
    size,
    sort,
    track_total_hits: true
  };

  if (collapse) {
    searchBody.collapse = collapse;
  }

  if (highlight) {
    searchBody.highlight = buildHighlight();
  }

  try {
    const response = await client.search({
      index: PRODUCT_INDEX,
      body: searchBody
    });

    const results = response.hits.hits.map(hit => {
      const product = {
        ...hit._source,
        _score: hit._score,
        _id: hit._id
      };

      if (hit.highlight) {
        product.highlight = hit.highlight;
        if (hit.highlight.title) {
          product.titleHighlight = hit.highlight.title[0];
        }
        if (hit.highlight.description) {
          product.descriptionHighlight = hit.highlight.description[0];
        }
      }

      if (hit.inner_hits && hit.inner_hits.other_products) {
        product.otherProducts = hit.inner_hits.other_products.hits.hits.map(innerHit => ({
          ...innerHit._source,
          _score: innerHit._score
        }));
      }

      return product;
    });

    return {
      total: response.hits.total.value,
      totalPages: Math.ceil(response.hits.total.value / pageSize),
      page,
      pageSize,
      results,
      query: q,
      hasMore: (page * pageSize) < response.hits.total.value
    };
  } catch (error) {
    logger.error('Search failed:', error);
    throw error;
  }
}

async function getSpellSuggestion(query) {
  if (!query || query.trim().length < 2) {
    return null;
  }

  try {
    const suggestBody = {
      suggestion: {
        text: query,
        term: {
          field: 'title',
          suggest_mode: 'popular',
          min_word_length: 2,
          prefix_length: 1,
          max_edits: 2,
          size: 5
        }
      },
      phraseSuggestion: {
        text: query,
        phrase: {
          field: 'title',
          gram_size: 3,
          max_errors: 2,
          size: 5,
          collate: {
            query: {
              source: {
                match: {
                  title: '{{suggestion}}'
                }
              }
            }
          }
        }
      }
    };

    const response = await client.search({
      index: PRODUCT_INDEX,
      body: {
        suggest: suggestBody,
        size: 0
      }
    });

    const suggestions = [];

    if (response.suggest && response.suggest.phraseSuggestion) {
      for (const option of response.suggest.phraseSuggestion[0].options) {
        if (option.score > 0.5 && option.text !== query) {
          suggestions.push({
            text: option.text,
            score: option.score,
            highlighted: option.highlighted
          });
        }
      }
    }

    if (suggestions.length === 0 && response.suggest && response.suggest.suggestion) {
      const termOptions = response.suggest.suggestion[0].options;
      for (const option of termOptions) {
        if (option.text !== query && !suggestions.find(s => s.text === option.text)) {
          suggestions.push({
            text: option.text,
            score: option.score,
            freq: option.freq
          });
        }
      }
    }

    if (suggestions.length === 0) {
      const distanceSuggestions = await getDistanceBasedSuggestions(query);
      suggestions.push(...distanceSuggestions);
    }

    return suggestions.slice(0, 5);
  } catch (error) {
    logger.error('Spell suggestion failed:', error);
    return null;
  }
}

async function getDistanceBasedSuggestions(query) {
  try {
    const response = await client.search({
      index: PRODUCT_INDEX,
      body: {
        query: {
          match_all: {}
        },
        aggs: {
          title_terms: {
            terms: {
              field: 'title.keyword',
              size: 1000,
              min_doc_count: 5
            }
          },
          brand_terms: {
            terms: {
              field: 'brand',
              size: 500,
              min_doc_count: 3
            }
          }
        },
        size: 0
      }
    });

    const terms = [];

    if (response.aggregations && response.aggregations.title_terms) {
      for (const bucket of response.aggregations.title_terms.buckets) {
        terms.push(bucket.key);
      }
    }

    if (response.aggregations && response.aggregations.brand_terms) {
      for (const bucket of response.aggregations.brand_terms.buckets) {
        terms.push(bucket.key);
      }
    }

    const suggestions = [];
    const queryLower = query.toLowerCase();

    for (const term of terms) {
      const termLower = term.toLowerCase();
      const distance = natural.LevenshteinDistance(queryLower, termLower);
      const maxLen = Math.max(queryLower.length, termLower.length);
      const similarity = 1 - (distance / maxLen);

      if (similarity > 0.6 && similarity < 1) {
        suggestions.push({
          text: term,
          score: similarity,
          distance
        });
      }
    }

    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  } catch (error) {
    logger.error('Distance based suggestion failed:', error);
    return [];
  }
}

async function getSearchSuggestions(query) {
  if (!query || query.trim().length < 1) {
    return [];
  }

  const queryText = query.trim();

  try {
    const response = await client.search({
      index: PRODUCT_INDEX,
      body: {
        suggest: {
          completion: {
            prefix: queryText,
            completion: {
              field: 'title.pinyin',
              size: 10,
              fuzzy: {
                fuzziness: 1
              }
            }
          },
          title_suggest: {
            prefix: queryText,
            completion: {
              field: 'title.pinyin',
              size: 10
            }
          }
        },
        query: {
          bool: {
            must: [
              { match_all: {} }
            ],
            filter: [
              { term: { status: 'active' } },
              {
                bool: {
                  should: [
                    { prefix: { title: queryText } },
                    { prefix: { 'title.pinyin': queryText } },
                    { match_phrase_prefix: { brand: queryText } },
                    { match_phrase_prefix: { category: queryText } }
                  ]
                }
              }
            ]
          }
        },
        aggs: {
          suggestions: {
            terms: {
              field: 'title.keyword',
              size: 10,
              order: { _count: 'desc' },
              include: {
                pattern: `.*${queryText}.*`,
                flags: 'CASE_INSENSITIVE'
              }
            }
          },
          brand_suggestions: {
            terms: {
              field: 'brand',
              size: 5,
              order: { _count: 'desc' },
              include: {
                pattern: `.*${queryText}.*`,
                flags: 'CASE_INSENSITIVE'
              }
            }
          },
          category_suggestions: {
            terms: {
              field: 'category',
              size: 5,
              order: { _count: 'desc' },
              include: {
                pattern: `.*${queryText}.*`,
                flags: 'CASE_INSENSITIVE'
              }
            }
          }
        },
        size: 0
      }
    });

    const suggestions = [];
    const seen = new Set();

    if (response.aggregations) {
      if (response.aggregations.suggestions) {
        for (const bucket of response.aggregations.suggestions.buckets) {
          if (!seen.has(bucket.key)) {
            seen.add(bucket.key);
            suggestions.push({
              text: bucket.key,
              type: 'product',
              count: bucket.doc_count
            });
          }
        }
      }

      if (response.aggregations.brand_suggestions) {
        for (const bucket of response.aggregations.brand_suggestions.buckets) {
          if (!seen.has(bucket.key)) {
            seen.add(bucket.key);
            suggestions.push({
              text: bucket.key,
              type: 'brand',
              count: bucket.doc_count
            });
          }
        }
      }

      if (response.aggregations.category_suggestions) {
        for (const bucket of response.aggregations.category_suggestions.buckets) {
          if (!seen.has(bucket.key)) {
            seen.add(bucket.key);
            suggestions.push({
              text: bucket.key,
              type: 'category',
              count: bucket.doc_count
            });
          }
        }
      }
    }

    return suggestions.slice(0, 15);
  } catch (error) {
    logger.error('Search suggestions failed:', error);
    return [];
  }
}

async function getAggregationFilters(query) {
  try {
    const baseQuery = query ? {
      multi_match: {
        query,
        fields: ['title', 'brand', 'category', 'description']
      }
    } : { match_all: {} };

    const response = await client.search({
      index: PRODUCT_INDEX,
      body: {
        query: {
          bool: {
            must: [baseQuery],
            filter: [{ term: { status: 'active' } }]
          }
        },
        aggs: {
          brands: {
            terms: { field: 'brand', size: 50 }
          },
          categories: {
            terms: { field: 'category', size: 50 }
          },
          price_range: {
            stats: { field: 'price' }
          },
          price_histogram: {
            histogram: {
              field: 'price',
              interval: 100,
              min_doc_count: 1
            }
          },
          tags: {
            terms: { field: 'tags', size: 30 }
          }
        },
        size: 0
      }
    });

    const aggs = response.aggregations;

    return {
      brands: aggs.brands ? aggs.brands.buckets.map(b => ({ name: b.key, count: b.doc_count })) : [],
      categories: aggs.categories ? aggs.categories.buckets.map(b => ({ name: b.key, count: b.doc_count })) : [],
      priceRange: aggs.price_range ? {
        min: Math.floor(aggs.price_range.min || 0),
        max: Math.ceil(aggs.price_range.max || 0),
        avg: Math.round(aggs.price_range.avg || 0)
      } : null,
      priceHistogram: aggs.price_histogram ? aggs.price_histogram.buckets.map(b => ({
        price: b.key,
        count: b.doc_count
      })) : [],
      tags: aggs.tags ? aggs.tags.buckets.map(b => ({ name: b.key, count: b.doc_count })) : []
    };
  } catch (error) {
    logger.error('Get aggregation filters failed:', error);
    throw error;
  }
}

module.exports = {
  searchProducts,
  getSpellSuggestion,
  getSearchSuggestions,
  getAggregationFilters,
  buildQuery
};
