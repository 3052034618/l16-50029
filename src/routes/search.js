const express = require('express');
const router = express.Router();
const {
  search,
  suggest,
  spellCheck,
  getFilters,
  recordProductClick
} = require('../controllers/searchController');

router.get('/search', search);
router.get('/suggest', suggest);
router.get('/spellcheck', spellCheck);
router.get('/filters', getFilters);
router.post('/click', recordProductClick);

module.exports = router;
