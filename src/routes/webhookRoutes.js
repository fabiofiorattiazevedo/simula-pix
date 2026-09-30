const router = require('express').Router();
const webhookController = require('../controllers/webhookController');
const auth = require('../middlewares/auth');
const webhookAuth = require('../middlewares/webhookAuth');

router.put('/', auth, webhookController.configurarWebhook);
router.get('/', auth, webhookController.consultarWebhook);
router.delete('/', auth, webhookController.cancelarWebhook);

// Endpoint chamado pelo PSP — sem JWT; valida WEBHOOK_SECRET se configurado (mTLS em produção)
router.post('/notificacao', webhookAuth, webhookController.receberNotificacao);

module.exports = router;
