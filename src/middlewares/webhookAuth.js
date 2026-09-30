function webhookAuth(req, res, next) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return next();

  const provided = req.headers['x-webhook-secret'];
  if (!provided || provided !== secret) {
    return res.status(401).json({ error: 'Assinatura de webhook inválida.' });
  }
  next();
}

module.exports = webhookAuth;
