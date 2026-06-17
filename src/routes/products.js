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
router.get('/stats/count', getCount);
router.get('/:productId', getProductHandler);
router.put('/:productId', updateProductHandler);
router.delete('/:productId', deleteProductHandler);
router.post('/:productId/sales', incrementSales);

module.exports = router;
