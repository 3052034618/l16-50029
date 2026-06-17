const {
  indexProduct,
  bulkIndexProducts,
  updateProduct,
  deleteProduct,
  hardDeleteProduct,
  getProduct,
  updateProductSalesCount,
  getProductCount
} = require('../services/indexSyncService');
const logger = require('../utils/logger');

async function createProduct(req, res) {
  try {
    const product = req.body;
    await indexProduct(product);

    res.status(201).json({
      success: true,
      message: 'Product indexed successfully',
      data: { productId: product.productId }
    });
  } catch (error) {
    logger.error('Create product error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

async function bulkCreateProducts(req, res) {
  try {
    const { products } = req.body;

    if (!Array.isArray(products)) {
      return res.status(400).json({
        success: false,
        error: 'Products must be an array'
      });
    }

    const result = await bulkIndexProducts(products);

    res.json({
      success: true,
      message: `Bulk index completed: ${result.success} success, ${result.failed} failed`,
      data: result
    });
  } catch (error) {
    logger.error('Bulk create products error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

async function updateProductHandler(req, res) {
  try {
    const { productId } = req.params;
    const updates = req.body;

    await updateProduct(productId, updates);

    res.json({
      success: true,
      message: 'Product updated successfully'
    });
  } catch (error) {
    logger.error('Update product error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

async function deleteProductHandler(req, res) {
  try {
    const { productId } = req.params;
    const { permanent } = req.query;

    let result;
    if (permanent === 'true') {
      result = await hardDeleteProduct(productId);
    } else {
      result = await deleteProduct(productId);
    }

    res.json({
      success: true,
      message: result ? 'Product deleted successfully' : 'Product not found'
    });
  } catch (error) {
    logger.error('Delete product error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

async function getProductHandler(req, res) {
  try {
    const { productId } = req.params;

    const product = await getProduct(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    logger.error('Get product error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

async function incrementSales(req, res) {
  try {
    const { productId } = req.params;
    const { increment } = req.body;

    await updateProductSalesCount(productId, increment || 1);

    res.json({
      success: true,
      message: 'Sales count updated successfully'
    });
  } catch (error) {
    logger.error('Increment sales error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

async function getCount(req, res) {
  try {
    const count = await getProductCount();

    res.json({
      success: true,
      data: { count }
    });
  } catch (error) {
    logger.error('Get product count error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  createProduct,
  bulkCreateProducts,
  updateProductHandler,
  deleteProductHandler,
  getProductHandler,
  incrementSales,
  getCount
};
