const pixService = require('../services/pixService');

async function criarCobranca(req, res) {
  const cobranca = await pixService.criarCobranca(req.body);
  res.status(201).json(cobranca);
}

async function consultarCobranca(req, res) {
  const cobranca = await pixService.consultarCobranca(req.params.txid);
  res.json(cobranca);
}

async function listarCobrancas(req, res) {
  const resultado = await pixService.listarCobrancas(req.query);
  res.json(resultado);
}

async function cancelarCobranca(req, res) {
  const resultado = await pixService.cancelarCobranca(req.params.txid);
  res.json(resultado);
}

async function solicitarDevolucao(req, res) {
  const { txid } = req.params;
  const { valor } = req.body;
  const resultado = await pixService.solicitarDevolucao(txid, null, valor);
  res.status(201).json(resultado);
}

async function consultarPix(req, res) {
  const pix = await pixService.consultarPix(req.params.e2eId);
  res.json(pix);
}

async function listarPix(req, res) {
  const lista = await pixService.listarPix(req.query);
  res.json(lista);
}

async function enviarPix(req, res) {
  try {
    const result = await pixService.enviarPix(req.body);
    res.status(201).json(result);
  } catch (err) {
    if (err.pending) {
      return res.status(202).json({ mensagem: err.message, status: 'EM_PROCESSAMENTO' });
    }
    throw err;
  }
}

module.exports = {
  criarCobranca,
  consultarCobranca,
  listarCobrancas,
  cancelarCobranca,
  solicitarDevolucao,
  consultarPix,
  listarPix,
  enviarPix,
};
