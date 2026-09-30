const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  logger.error(`${req.method} ${req.path} — ${err.message}`, {
    stack: err.stack,
    status: err.response?.status,
  });

  if (err.code === 11000) {
    return res.status(409).json({ error: 'Recurso já existe (txid duplicado).' });
  }

  if (err.response) {
    return res.status(err.response.status || 502).json({
      error: 'Erro na comunicação com o PSP',
      detalhe: err.response.data,
    });
  }

  const status = err.statusCode || err.status || 500;
  res.status(status).json({ error: err.message || 'Erro interno do servidor' });
}

module.exports = errorHandler;
