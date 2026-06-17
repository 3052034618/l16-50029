const express = require('express');
const router = express.Router();
const {
  createProduct,
  bulkCreateProducts,
  updateProductHandler,
  deleteProductHandler,
  getProductHandler,
  incrementSales,
  getCount
} = require('../controllers/productController');

router.post('/', createProduct);
router.post('/bulk', bulkCreateProducts);
router.put('/:productId', updateProductHandler);
router.delete('/:productId', deleteProductHandler);
router.get('/:productId', getProductHandler);
router.post('/:productId/sales', incrementSales);
router.get('/stats/count', getCount);

module.exports = router;
