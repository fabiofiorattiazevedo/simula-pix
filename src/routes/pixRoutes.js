const router = require('express').Router();
const pixController = require('../controllers/pixController');
const auth = require('../middlewares/auth');
const validate = require('../middlewares/validate');

// Cobranças
router.post('/cob', auth, validate('criarCobranca'), pixController.criarCobranca);
router.get('/cob', auth, pixController.listarCobrancas);
router.get('/cob/:txid', auth, pixController.consultarCobranca);
router.delete('/cob/:txid', auth, pixController.cancelarCobranca);

// Envio de Pix (outbound)
router.post('/envio', auth, validate('enviarPix'), pixController.enviarPix);

// Pix recebidos
router.get('/', auth, pixController.listarPix);
router.get('/:e2eId', auth, pixController.consultarPix);

// Devoluções — no MP usa o txid (id do pagamento) + um id local da devolução
router.post('/cob/:txid/devolucao', auth, validate('solicitarDevolucao'), pixController.solicitarDevolucao);

module.exports = router;
