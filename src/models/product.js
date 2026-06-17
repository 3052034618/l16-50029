const Joi = require('joi');

const productSchema = Joi.object({
  productId: Joi.string().required(),
  title: Joi.string().required().min(2).max(200),
  description: Joi.string().allow('').max(2000),
  category: Joi.string().required(),
  categoryPath: Joi.array().items(Joi.string()).default([]),
  brand: Joi.string().allow(''),
  price: Joi.number().positive().required(),
  originalPrice: Joi.number().positive().allow(null),
  salesCount: Joi.number().integer().min(0).default(0),
  stock: Joi.number().integer().min(0).default(0),
  sellerId: Joi.string().required(),
  sellerName: Joi.string().required(),
  images: Joi.array().items(Joi.string().uri()).default([]),
  tags: Joi.array().items(Joi.string()).default([]),
  attributes: Joi.array().items(
    Joi.object({
      name: Joi.string().required(),
      value: Joi.alternatives().try(Joi.string(), Joi.number()).required()
    })
  ).default([]),
  status: Joi.string().valid('active', 'inactive', 'sold_out', 'deleted').default('active'),
  createdAt: Joi.date().default(() => new Date()),
  updatedAt: Joi.date().default(() => new Date()),
  weight: Joi.number().min(0).max(100).default(1.0)
});

const searchQuerySchema = Joi.object({
  q: Joi.string().allow(''),
  category: Joi.string().allow(''),
  brand: Joi.array().items(Joi.string()).single().default([]),
  minPrice: Joi.number().min(0),
  maxPrice: Joi.number().min(0),
  sortBy: Joi.string().valid('relevance', 'sales', 'price_asc', 'price_desc').default('relevance'),
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(20),
  sellerId: Joi.string().allow(''),
  tags: Joi.array().items(Joi.string()).single().default([]),
  attributes: Joi.object().default({}),
  collapseBy: Joi.string().valid('seller', 'brand', 'none').default('none'),
  collapseSize: Joi.number().integer().min(1).max(10).default(3),
  highlight: Joi.boolean().default(true)
});

function validateProduct(product) {
  return productSchema.validate(product, { stripUnknown: true });
}

function validateSearchQuery(query) {
  return searchQuerySchema.validate(query, { stripUnknown: true });
}

module.exports = {
  productSchema,
  searchQuerySchema,
  validateProduct,
  validateSearchQuery
};
