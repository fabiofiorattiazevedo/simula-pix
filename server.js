require('dotenv').config();
require('express-async-errors');

const app = require('./src/app');
const connectDB = require('./src/config/database');
const logger = require('./src/utils/logger');

const PORT = process.env.PORT || 3000;

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    logger.info(`Servidor rodando na porta ${PORT} [${process.env.NODE_ENV}]`);
  });
}

start();
