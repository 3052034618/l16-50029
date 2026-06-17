const express = require('express');
const cors = require('cors');
const config = require('./config');
const logger = require('./utils/logger');
const { checkConnection } = require('./clients/elasticsearch');

const searchRoutes = require('./routes/search');
const productRoutes = require('./routes/products');
const analyticsRoutes = require('./routes/analytics');
const healthRoutes = require('./routes/health');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

app.use('/api/v1/search', searchRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1', healthRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

async function startServer() {
  try {
    const esConnected = await checkConnection();
    if (!esConnected) {
      logger.warn('Elasticsearch is not connected. Some features may not work.');
    }

    app.listen(config.server.port, () => {
      logger.info(`Server running on port ${config.server.port}`);
      logger.info(`Environment: ${config.server.env}`);
      logger.info(`API Base URL: http://localhost:${config.server.port}/api/v1`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
