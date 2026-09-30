const webhookService = require('../services/webhookService');

async function configurarWebhook(req, res) {
  const resultado = await webhookService.configurarWebhook();
  res.status(201).json(resultado);
}

async function consultarWebhook(req, res) {
  const resultado = await webhookService.consultarWebhook();
  res.json(resultado);
}

async function cancelarWebhook(req, res) {
  await webhookService.cancelarWebhook();
  res.status(204).send();
}

async function receberNotificacao(req, res) {
  res.status(200).send();
  await webhookService.processarNotificacao(req.body);
}

module.exports = {
  configurarWebhook,
  consultarWebhook,
  cancelarWebhook,
  receberNotificacao,
};
