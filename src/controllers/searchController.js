const {
  searchProducts,
  getSpellSuggestion,
  getSearchSuggestions,
  getAggregationFilters
} = require('../services/searchService');
const { logSearch, logClick } = require('../services/analyticsService');
const { recordNoResultQuery, getSimilarKeywords } = require('../services/qualityAnalysisService');
const logger = require('../utils/logger');

async function search(req, res) {
  const startTime = Date.now();

  try {
    const {
      q,
      category,
      brand,
      minPrice,
      maxPrice,
      sortBy,
      page,
      pageSize,
      sellerId,
      tags,
      attributes,
      collapseBy,
      collapseSize,
      highlight,
      userId,
      sessionId
    } = req.query;

    const parsedAttributes = attributes ? JSON.parse(attributes) : {};

    const result = await searchProducts({
      q,
      category,
      brand,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      sortBy,
      page: page ? parseInt(page) : undefined,
      pageSize: pageSize ? parseInt(pageSize) : undefined,
      sellerId,
      tags,
      attributes: parsedAttributes,
      collapseBy,
      collapseSize: collapseSize ? parseInt(collapseSize) : undefined,
      highlight: highlight !== 'false'
    });

    const responseTime = Date.now() - startTime;

    let suggestions = null;
    if (result.total === 0 && q && q.trim()) {
      await recordNoResultQuery(q, userId, sessionId);
      suggestions = await getSimilarKeywords(q, 5);
    } else if (q && q.trim()) {
      const spellSuggestions = await getSpellSuggestion(q);
      if (spellSuggestions && spellSuggestions.length > 0 && spellSuggestions[0].score > 0.8) {
        suggestions = spellSuggestions.slice(0, 3);
      }
    }

    await logSearch({
      query: q,
      userId,
      sessionId,
      resultsCount: result.total,
      filters: { category, brand, minPrice, maxPrice, sellerId, tags, attributes: parsedAttributes },
      sortBy,
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 20,
      responseTime,
      hasSuggestion: !!suggestions && suggestions.length > 0,
      suggestion: suggestions && suggestions.length > 0 ? suggestions[0].text : null,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      data: {
        ...result,
        suggestions,
        responseTime
      }
    });
  } catch (error) {
    logger.error('Search error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

async function suggest(req, res) {
  try {
    const { q } = req.query;

    if (!q || !q.trim()) {
      return res.json({
        success: true,
        data: []
      });
    }

    const suggestions = await getSearchSuggestions(q);

    res.json({
      success: true,
      data: suggestions
    });
  } catch (error) {
    logger.error('Suggest error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

async function spellCheck(req, res) {
  try {
    const { q } = req.query;

    if (!q || !q.trim()) {
      return res.json({
        success: true,
        data: null
      });
    }

    const suggestions = await getSpellSuggestion(q);

    res.json({
      success: true,
      data: suggestions
    });
  } catch (error) {
    logger.error('Spell check error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

async function getFilters(req, res) {
  try {
    const { q } = req.query;

    const filters = await getAggregationFilters(q);

    res.json({
      success: true,
      data: filters
    });
  } catch (error) {
    logger.error('Get filters error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

async function recordProductClick(req, res) {
  try {
    const { query, productId, sessionId, userId } = req.body;

    if (!productId || !sessionId) {
      return res.status(400).json({
        success: false,
        error: 'productId and sessionId are required'
      });
    }

    await logClick({
      query,
      productId,
      sessionId,
      userId
    });

    res.json({
      success: true,
      message: 'Click recorded successfully'
    });
  } catch (error) {
    logger.error('Record click error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  search,
  suggest,
  spellCheck,
  getFilters,
  recordProductClick
};
