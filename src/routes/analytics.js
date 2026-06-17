const express = require('express');
const router = express.Router();
const {
  getHotwordsHandler,
  getSimilarKeywordsHandler,
  getHighClickWords,
  getLowClickWords,
  getZeroResultWords,
  getQualityReport,
  getStats,
  getTrends
} = require('../controllers/analyticsController');

router.get('/hotwords', getHotwordsHandler);
router.get('/similar', getSimilarKeywordsHandler);
router.get('/high-click-words', getHighClickWords);
router.get('/low-click-words', getLowClickWords);
router.get('/zero-result-words', getZeroResultWords);
router.get('/quality-report', getQualityReport);
router.get('/stats', getStats);
router.get('/trends', getTrends);

module.exports = router;
