const { client } = require('../clients/elasticsearch');
const { validateProduct } = require('../models/product');
const { PRODUCT_INDEX } = require('../models');
const logger = require('../utils/logger');

async function indexProduct(product) {
  const { error, value } = validateProduct(product);
  if (error) {
    logger.error('Product validation failed:', error);
    throw new Error(`Product validation failed: ${error.message}`);
  }

  const doc = {
    ...value,
    updatedAt: new Date()
  };

  try {
    await client.index({
      index: PRODUCT_INDEX,
      id: doc.productId,
      body: doc,
      refresh: true
    });
    logger.info(`Product ${doc.productId} indexed successfully`);
    return true;
  } catch (error) {
    logger.error(`Failed to index product ${doc.productId}:`, error);
    throw error;
  }
}

async function bulkIndexProducts(products) {
  if (!Array.isArray(products) || products.length === 0) {
    return { success: 0, failed: 0, errors: [] };
  }

  const body = [];
  const errors = [];
  let successCount = 0;

  for (const product of products) {
    const { error, value } = validateProduct(product);
    if (error) {
      errors.push({ productId: product.productId, error: error.message });
      continue;
    }

    body.push({ index: { _id: value.productId } });
    body.push({ ...value, updatedAt: new Date() });
  }

  if (body.length === 0) {
    return { success: 0, failed: errors.length, errors };
  }

  try {
    const response = await client.bulk({
      index: PRODUCT_INDEX,
      body,
      refresh: true
    });

    if (response.errors) {
      response.items.forEach((item, index) => {
        if (item.index && item.index.error) {
          errors.push({
            productId: products[index]?.productId || `item_${index}`,
            error: item.index.error.reason
          });
        } else {
          successCount++;
        }
      });
    } else {
      successCount = response.items.length;
    }

    logger.info(`Bulk index completed: ${successCount} success, ${errors.length} failed`);
    return { success: successCount, failed: errors.length, errors };
  } catch (error) {
    logger.error('Bulk index failed:', error);
    throw error;
  }
}

async function updateProduct(productId, updates) {
  if (!productId) {
    throw new Error('ProductId is required');
  }

  const doc = {
    ...updates,
    updatedAt: new Date()
  };

  try {
    await client.update({
      index: PRODUCT_INDEX,
      id: productId,
      body: {
        doc,
        doc_as_upsert: true
      },
      refresh: true
    });
    logger.info(`Product ${productId} updated successfully`);
    return true;
  } catch (error) {
    logger.error(`Failed to update product ${productId}:`, error);
    throw error;
  }
}

async function deleteProduct(productId) {
  if (!productId) {
    throw new Error('ProductId is required');
  }

  try {
    await client.update({
      index: PRODUCT_INDEX,
      id: productId,
      body: {
        doc: {
          status: 'deleted',
          updatedAt: new Date()
        }
      },
      refresh: true
    });
    logger.info(`Product ${productId} marked as deleted`);
    return true;
  } catch (error) {
    if (error.meta && error.meta.statusCode === 404) {
      logger.warn(`Product ${productId} not found for deletion`);
      return false;
    }
    logger.error(`Failed to delete product ${productId}:`, error);
    throw error;
  }
}

async function hardDeleteProduct(productId) {
  if (!productId) {
    throw new Error('ProductId is required');
  }

  try {
    await client.delete({
      index: PRODUCT_INDEX,
      id: productId,
      refresh: true
    });
    logger.info(`Product ${productId} permanently deleted from index`);
    return true;
  } catch (error) {
    if (error.meta && error.meta.statusCode === 404) {
      logger.warn(`Product ${productId} not found for hard deletion`);
      return false;
    }
    logger.error(`Failed to hard delete product ${productId}:`, error);
    throw error;
  }
}

async function getProduct(productId) {
  if (!productId) {
    throw new Error('ProductId is required');
  }

  try {
    const response = await client.get({
      index: PRODUCT_INDEX,
      id: productId
    });
    if (response._source && response._source.status === 'deleted') {
      return null;
    }
    return response._source;
  } catch (error) {
    if (error.meta && error.meta.statusCode === 404) {
      return null;
    }
    logger.error(`Failed to get product ${productId}:`, error);
    throw error;
  }
}

async function updateProductSalesCount(productId, increment = 1) {
  try {
    await client.update({
      index: PRODUCT_INDEX,
      id: productId,
      body: {
        script: {
          source: `ctx._source.salesCount = (ctx._source.salesCount || 0) + params.increment`,
          params: { increment }
        }
      },
      refresh: true
    });
    return true;
  } catch (error) {
    logger.error(`Failed to update sales count for product ${productId}:`, error);
    throw error;
  }
}

async function getProductCount() {
  try {
    const response = await client.count({
      index: PRODUCT_INDEX,
      body: {
        query: {
          term: { status: 'active' }
        }
      }
    });
    return response.count;
  } catch (error) {
    logger.error('Failed to get product count:', error);
    throw error;
  }
}

module.exports = {
  indexProduct,
  bulkIndexProducts,
  updateProduct,
  deleteProduct,
  hardDeleteProduct,
  getProduct,
  updateProductSalesCount,
  getProductCount
};
