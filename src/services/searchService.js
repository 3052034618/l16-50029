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

  const queryText = query.trim();
  const queryLower = queryText.toLowerCase();

  try {
    const suggestions = [];
    const seen = new Set();

    function addCandidate(text, score, source) {
      if (!text || !text.trim()) return;
      const normalized = text.trim().toLowerCase();
      if (normalized === queryLower) return;
      if (seen.has(normalized)) return;
      seen.add(normalized);
      suggestions.push({
        text: text.trim(),
        score: score || 0,
        source: source || 'fuzzy'
      });
    }

    const fuzzyResponse = await client.search({
      index: PRODUCT_INDEX,
      body: {
        query: {
          bool: {
            filter: [{ term: { status: 'active' } }],
            should: [
              {
                fuzzy: {
                  title: {
                    value: queryText,
                    fuzziness: 'AUTO',
                    prefix_length: 1,
                    max_expansions: 50,
                    boost: 5
                  }
                }
              },
              {
                fuzzy: {
                  brand: {
                    value: queryText,
                    fuzziness: 'AUTO',
                    prefix_length: 1,
                    max_expansions: 50,
                    boost: 8
                  }
                }
              },
              {
                fuzzy: {
                  category: {
                    value: queryText,
                    fuzziness: 'AUTO',
                    prefix_length: 1,
                    max_expansions: 50,
                    boost: 6
                  }
                }
              },
              {
                match: {
                  title: {
                    query: queryText,
                    fuzziness: 'AUTO',
                    operator: 'or',
                    boost: 3
                  }
                }
              }
            ],
            minimum_should_match: 1
          }
        },
        aggs: {
          fuzzy_brands: {
            terms: {
              field: 'brand',
              size: 20,
              order: { _count: 'desc' },
              min_doc_count: 1
            }
          },
          fuzzy_categories: {
            terms: {
              field: 'category',
              size: 20,
              order: { _count: 'desc' },
              min_doc_count: 1
            }
          }
        },
        _source: ['title', 'brand', 'category', 'salesCount'],
        size: 50
      }
    });

    for (const hit of fuzzyResponse.hits.hits) {
      const src = hit._source;
      if (src.brand) {
        const brandText = src.brand.toString();
        const sim = calcSimilarity(queryLower, brandText.toLowerCase());
        if (sim > 0.4 && sim < 1) {
          addCandidate(brandText, sim * 10 + (hit._score || 0) * 0.1, 'brand');
        }
      }
      if (src.category) {
        const catText = src.category.toString();
        const sim = calcSimilarity(queryLower, catText.toLowerCase());
        if (sim > 0.4 && sim < 1) {
          addCandidate(catText, sim * 8 + (hit._score || 0) * 0.08, 'category');
        }
      }
      if (src.title) {
        const titleText = src.title.toString();
        const sim = calcSimilarity(queryLower, titleText.toLowerCase());
        if (sim > 0.3 && sim < 1) {
          addCandidate(titleText, sim * 5 + (hit._score || 0) * 0.05, 'title');
        }
      }
    }

    if (fuzzyResponse.aggregations) {
      if (fuzzyResponse.aggregations.fuzzy_brands) {
        for (const b of fuzzyResponse.aggregations.fuzzy_brands.buckets) {
          const sim = calcSimilarity(queryLower, b.key.toLowerCase());
          if (sim > 0.4 && sim < 1) {
            addCandidate(b.key, sim * 10 + b.doc_count * 0.01, 'brand_agg');
          }
        }
      }
      if (fuzzyResponse.aggregations.fuzzy_categories) {
        for (const c of fuzzyResponse.aggregations.fuzzy_categories.buckets) {
          const sim = calcSimilarity(queryLower, c.key.toLowerCase());
          if (sim > 0.4 && sim < 1) {
            addCandidate(c.key, sim * 8 + c.doc_count * 0.01, 'category_agg');
          }
        }
      }
    }

    if (suggestions.length < 3) {
      const distanceSuggestions = await getDistanceBasedSuggestions(queryText);
      for (const ds of distanceSuggestions) {
        addCandidate(ds.text, ds.score * 5, 'distance');
      }
    }

    suggestions.sort((a, b) => b.score - a.score);
    return suggestions.slice(0, 5);
  } catch (error) {
    logger.error('Spell suggestion failed:', error);
    try {
      const fallback = await getDistanceBasedSuggestions(queryText);
      return fallback && fallback.length > 0 ? fallback : null;
    } catch (e) {
      return null;
    }
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
  const queryLower = queryText.toLowerCase();

  try {
    const response = await client.search({
      index: PRODUCT_INDEX,
      body: {
        query: {
          bool: {
            filter: [
              { term: { status: 'active' } }
            ],
            should: [
              {
                multi_match: {
                  query: queryText,
                  fields: ['title^3', 'title.pinyin^2', 'brand^3', 'brand.pinyin^2', 'category^2'],
                  type: 'phrase_prefix',
                  slop: 0,
                  boost: 5
                }
              },
              {
                wildcard: {
                  'title.keyword': {
                    value: `*${queryText}*`,
                    case_insensitive: true,
                    boost: 3
                  }
                }
              },
              {
                wildcard: {
                  brand: {
                    value: `*${queryText}*`,
                    case_insensitive: true,
                    boost: 4
                  }
                }
              },
              {
                wildcard: {
                  category: {
                    value: `*${queryText}*`,
                    case_insensitive: true,
                    boost: 2
                  }
                }
              },
              {
                fuzzy: {
                  title: {
                    value: queryText,
                    fuzziness: 'AUTO',
                    prefix_length: 1,
                    boost: 1
                  }
                }
              }
            ],
            minimum_should_match: 1
          }
        },
        aggs: {
          hot_brands: {
            terms: {
              field: 'brand',
              size: 10,
              order: { _count: 'desc' },
              min_doc_count: 1
            }
          },
          hot_categories: {
            terms: {
              field: 'category',
              size: 10,
              order: { _count: 'desc' },
              min_doc_count: 1
            }
          },
          hot_tags: {
            terms: {
              field: 'tags',
              size: 10,
              order: { _count: 'desc' },
              min_doc_count: 1
            }
          }
        },
        _source: ['title', 'brand', 'category', 'salesCount'],
        size: 30
      }
    });

    const suggestions = [];
    const seen = new Set();

    function addSuggestion(text, type, count, score) {
      if (!text || !text.trim()) return;
      const key = `${type}:${text.trim().toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      suggestions.push({
        text: text.trim(),
        type,
        count: count || 0,
        score: score || 0
      });
    }

    for (const hit of response.hits.hits) {
      const source = hit._source;
      if (source.brand) {
        const brand = source.brand.toString();
        if (
          brand.toLowerCase().includes(queryLower) ||
          brand.toLowerCase().startsWith(queryLower)
        ) {
          addSuggestion(brand, 'brand', hit._score, hit._score);
        }
      }
      if (source.category) {
        const cat = source.category.toString();
        if (
          cat.toLowerCase().includes(queryLower) ||
          cat.toLowerCase().startsWith(queryLower)
        ) {
          addSuggestion(cat, 'category', hit._score * 0.8, hit._score * 0.8);
        }
      }
      if (source.title) {
        const title = source.title.toString();
        addSuggestion(title, 'product', source.salesCount || 0, hit._score);
      }
      if (source.tags && Array.isArray(source.tags)) {
        for (const tag of source.tags) {
          if (tag && tag.toLowerCase().includes(queryLower)) {
            addSuggestion(tag, 'tag', hit._score * 0.5, hit._score * 0.5);
          }
        }
      }
    }

    if (response.aggregations) {
      if (response.aggregations.hot_brands) {
        for (const bucket of response.aggregations.hot_brands.buckets) {
          if (
            bucket.key.toLowerCase().includes(queryLower) ||
            bucket.key.toLowerCase().startsWith(queryLower)
          ) {
            addSuggestion(bucket.key, 'brand', bucket.doc_count, bucket.doc_count);
          }
        }
      }
      if (response.aggregations.hot_categories) {
        for (const bucket of response.aggregations.hot_categories.buckets) {
          if (
            bucket.key.toLowerCase().includes(queryLower) ||
            bucket.key.toLowerCase().startsWith(queryLower)
          ) {
            addSuggestion(bucket.key, 'category', bucket.doc_count, bucket.doc_count * 0.8);
          }
        }
      }
      if (response.aggregations.hot_tags) {
        for (const bucket of response.aggregations.hot_tags.buckets) {
          if (bucket.key.toLowerCase().includes(queryLower)) {
            addSuggestion(bucket.key, 'tag', bucket.doc_count, bucket.doc_count * 0.5);
          }
        }
      }
    }

    suggestions.sort((a, b) => b.score - a.score);

    if (suggestions.length === 0) {
      const fallbackSuggestions = await getFallbackSuggestions(queryText);
      for (const s of fallbackSuggestions) {
        addSuggestion(s.text, s.type, s.count, s.score);
      }
    }

    return suggestions.slice(0, 15);
  } catch (error) {
    logger.error('Search suggestions failed:', error);
    try {
      return await getFallbackSuggestions(queryText);
    } catch (e) {
      return [];
    }
  }
}

async function getFallbackSuggestions(queryText) {
  const queryLower = queryText.toLowerCase();
  try {
    const response = await client.search({
      index: PRODUCT_INDEX,
      body: {
        query: {
          bool: {
            filter: [{ term: { status: 'active' } }]
          }
        },
        aggs: {
          all_brands: {
            terms: { field: 'brand', size: 50, order: { _count: 'desc' } }
          },
          all_categories: {
            terms: { field: 'category', size: 50, order: { _count: 'desc' } }
          }
        },
        size: 50,
        _source: ['title', 'brand', 'category', 'salesCount']
      }
    });

    const result = [];
    const seen = new Set();

    function add(text, type, count, score) {
      const key = `${type}:${text.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      result.push({ text, type, count, score });
    }

    for (const hit of response.hits.hits) {
      const src = hit._source;
      if (src.brand && matchFuzzy(queryLower, src.brand.toString().toLowerCase())) {
        add(src.brand, 'brand', src.salesCount || 0, calcSimilarity(queryLower, src.brand.toString().toLowerCase()) * 10);
      }
      if (src.category && matchFuzzy(queryLower, src.category.toString().toLowerCase())) {
        add(src.category, 'category', src.salesCount || 0, calcSimilarity(queryLower, src.category.toString().toLowerCase()) * 8);
      }
      if (src.title && matchFuzzy(queryLower, src.title.toString().toLowerCase())) {
        add(src.title, 'product', src.salesCount || 0, calcSimilarity(queryLower, src.title.toString().toLowerCase()) * 5);
      }
    }

    if (response.aggregations) {
      if (response.aggregations.all_brands) {
        for (const b of response.aggregations.all_brands.buckets) {
          if (matchFuzzy(queryLower, b.key.toLowerCase())) {
            add(b.key, 'brand', b.doc_count, calcSimilarity(queryLower, b.key.toLowerCase()) * 10);
          }
        }
      }
      if (response.aggregations.all_categories) {
        for (const c of response.aggregations.all_categories.buckets) {
          if (matchFuzzy(queryLower, c.key.toLowerCase())) {
            add(c.key, 'category', c.doc_count, calcSimilarity(queryLower, c.key.toLowerCase()) * 8);
          }
        }
      }
    }

    return result.sort((a, b) => b.score - a.score).slice(0, 10);
  } catch (e) {
    logger.error('Fallback suggestions also failed:', e);
    return [];
  }
}

function matchFuzzy(query, target) {
  if (!query || !target) return false;
  if (target.includes(query)) return true;
  if (query.length <= 2) return target.startsWith(query);
  const sim = calcSimilarity(query, target);
  return sim > 0.5;
}

function calcSimilarity(s1, s2) {
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1;
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }
  let consecutive = 0;
  let maxConsecutive = 0;
  for (let i = 0; i < shorter.length; i++) {
    for (let j = 0; j < longer.length; j++) {
      if (shorter[i] === longer[j]) {
        let k = 0;
        while (i + k < shorter.length && j + k < longer.length && shorter[i + k] === longer[j + k]) {
          k++;
        }
        if (k > maxConsecutive) maxConsecutive = k;
      }
    }
  }
  const baseScore = matches / longer.length;
  const consecutiveBonus = maxConsecutive / shorter.length;
  return Math.min(1, baseScore * 0.6 + consecutiveBonus * 0.4);
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
