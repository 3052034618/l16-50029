const { getHotwords } = require('../services/analyticsService');
const {
  getHighClickKeywords,
  getLowClickRateKeywords,
  getNoResultKeywords,
  getSearchQualityReport,
  getSearchStatsSummary,
  getSearchTrends,
  getSimilarKeywords
} = require('../services/qualityAnalysisService');
const config = require('../config');
const logger = require('../utils/logger');

async function getHotwordsHandler(req, res) {
  try {
    const { limit, windowHours } = req.query;

    const hotwords = await getHotwords(
      limit ? parseInt(limit) : config.search.hotwordsTopN,
      windowHours ? parseInt(windowHours) : config.search.hotwordsWindowHours
    );

    res.json({
      success: true,
      data: hotwords
    });
  } catch (error) {
    logger.error('Get hotwords error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

async function getSimilarKeywordsHandler(req, res) {
  try {
    const { q, limit } = req.query;

    if (!q || !q.trim()) {
      return res.json({
        success: true,
        data: []
      });
    }

    const keywords = await getSimilarKeywords(q, limit ? parseInt(limit) : 5);

    res.json({
      success: true,
      data: keywords
    });
  } catch (error) {
    logger.error('Get similar keywords error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

async function getHighClickWords(req, res) {
  try {
    const { startDate, endDate, limit, minCount } = req.query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const keywords = await getHighClickKeywords(
      start,
      end,
      limit ? parseInt(limit) : 50,
      minCount ? parseInt(minCount) : config.analysis.highClickWordMinCount
    );

    res.json({
      success: true,
      data: {
        period: { start: start.toISOString(), end: end.toISOString() },
        keywords
      }
    });
  } catch (error) {
    logger.error('Get high click words error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

async function getLowClickWords(req, res) {
  try {
    const { startDate, endDate, limit, threshold } = req.query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const keywords = await getLowClickRateKeywords(
      start,
      end,
      limit ? parseInt(limit) : 50,
      threshold ? parseFloat(threshold) : config.analysis.lowClickRateThreshold
    );

    res.json({
      success: true,
      data: {
        period: { start: start.toISOString(), end: end.toISOString() },
        keywords
      }
    });
  } catch (error) {
    logger.error('Get low click words error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

async function getZeroResultWords(req, res) {
  try {
    const { days, limit } = req.query;

    const keywords = await getNoResultKeywords(
      days ? parseInt(days) : 7,
      limit ? parseInt(limit) : 50
    );

    res.json({
      success: true,
      data: keywords
    });
  } catch (error) {
    logger.error('Get zero result words error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

async function getQualityReport(req, res) {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const report = await getSearchQualityReport(start, end);

    if (!report) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate quality report'
      });
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    logger.error('Get quality report error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

async function getStats(req, res) {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const stats = await getSearchStatsSummary(start, end);

    res.json({
      success: true,
      data: {
        period: { start: start.toISOString(), end: end.toISOString() },
        stats
      }
    });
  } catch (error) {
    logger.error('Get stats error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

async function getTrends(req, res) {
  try {
    const { days } = req.query;

    const trends = await getSearchTrends(days ? parseInt(days) : 7);

    res.json({
      success: true,
      data: trends
    });
  } catch (error) {
    logger.error('Get trends error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  getHotwordsHandler,
  getSimilarKeywordsHandler,
  getHighClickWords,
  getLowClickWords,
  getZeroResultWords,
  getQualityReport,
  getStats,
  getTrends
};
