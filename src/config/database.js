const mongoose = require('mongoose');
const logger = require('../utils/logger');

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  await mongoose.connect(uri);
  logger.info('MongoDB conectado');

  mongoose.connection.on('error', (err) => {
    logger.error('Erro de conexão MongoDB:', err);
  });
}

module.exports = connectDB;
