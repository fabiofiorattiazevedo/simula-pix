const router = require('express').Router();
const pixRoutes = require('./pixRoutes');
const webhookRoutes = require('./webhookRoutes');

router.get('/health', (req, res) => res.json({ status: 'ok' }));

router.use('/pix', pixRoutes);
router.use('/webhook', webhookRoutes);

module.exports = router;
