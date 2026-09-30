const request = require('supertest');
const app = require('../../src/app');
const { buildWebhookNotification, generateEndToEndId } = require('../helpers/builders');

jest.mock('../../src/middlewares/auth', () => (req, res, next) => {
  req.user = { id: 'test-user' };
  next();
});
jest.mock('../../src/services/webhookService');

const webhookService = require('../../src/services/webhookService');

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.WEBHOOK_SECRET;
});
afterAll(() => { delete process.env.WEBHOOK_SECRET; });

// ─── POST /api/webhook/notificacao — processamento ───────────────────────────

describe('POST /api/webhook/notificacao — processamento', () => {
  it('[200] processa notificação do tipo "payment" e responde imediatamente', async () => {
    webhookService.processarNotificacao.mockResolvedValue();

    const res = await request(app)
      .post('/api/webhook/notificacao')
      .send(buildWebhookNotification({ type: 'payment', data: { id: '111' } }));

    expect(res.status).toBe(200);
    expect(webhookService.processarNotificacao).toHaveBeenCalled();
  });

  it('[200] responde 200 mesmo para tipo desconhecido (processamento assíncrono)', async () => {
    webhookService.processarNotificacao.mockResolvedValue();

    const res = await request(app)
      .post('/api/webhook/notificacao')
      .send({ type: 'merchant_order', data: { id: '999' } });

    expect(res.status).toBe(200);
  });

  it('[200] responde 200 com payload vazio', async () => {
    webhookService.processarNotificacao.mockResolvedValue();

    const res = await request(app).post('/api/webhook/notificacao').send({});

    expect(res.status).toBe(200);
  });

  it('alteração de status para CONCLUIDA — processarNotificacao é chamado com payload correto', async () => {
    webhookService.processarNotificacao.mockResolvedValue();
    const payload = { type: 'payment', data: { id: '333' }, action: 'payment.updated' };

    await request(app).post('/api/webhook/notificacao').send(payload);

    expect(webhookService.processarNotificacao).toHaveBeenCalledWith(payload);
  });
});

// ─── POST /api/webhook/notificacao — segurança ───────────────────────────────

describe('POST /api/webhook/notificacao — segurança', () => {
  describe('sem WEBHOOK_SECRET (modo sem validação de assinatura)', () => {
    it('[200] aceita sem header de assinatura quando secret não está configurado', async () => {
      webhookService.processarNotificacao.mockResolvedValue();

      const res = await request(app)
        .post('/api/webhook/notificacao')
        .send({ type: 'payment', data: { id: '1' } });

      expect(res.status).toBe(200);
    });
  });

  describe('com WEBHOOK_SECRET configurado', () => {
    const SECRET = 'integration-test-secret-xyz';
    beforeEach(() => { process.env.WEBHOOK_SECRET = SECRET; });

    it('[200] aceita requisição com secret correto no header', async () => {
      webhookService.processarNotificacao.mockResolvedValue();

      const res = await request(app)
        .post('/api/webhook/notificacao')
        .set('x-webhook-secret', SECRET)
        .send({ type: 'payment', data: { id: '123' } });

      expect(res.status).toBe(200);
    });

    it('[401] rejeita requisição sem header x-webhook-secret', async () => {
      const res = await request(app)
        .post('/api/webhook/notificacao')
        .send({ type: 'payment', data: { id: '123' } });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/inválida/i);
      expect(webhookService.processarNotificacao).not.toHaveBeenCalled();
    });

    it('[401] rejeita requisição com secret incorreto', async () => {
      const res = await request(app)
        .post('/api/webhook/notificacao')
        .set('x-webhook-secret', 'errado')
        .send({ type: 'payment', data: { id: '123' } });

      expect(res.status).toBe(401);
    });

    it('[401] rejeita secret em caixa diferente (case-sensitive)', async () => {
      const res = await request(app)
        .post('/api/webhook/notificacao')
        .set('x-webhook-secret', SECRET.toUpperCase())
        .send({ type: 'payment', data: { id: '123' } });

      expect(res.status).toBe(401);
    });
  });
});

// ─── POST /api/webhook/notificacao — idempotência ────────────────────────────

describe('POST /api/webhook/notificacao — idempotência', () => {
  it('dois POSTs simultâneos com mesmo payload retornam 200 ambos', async () => {
    webhookService.processarNotificacao.mockResolvedValue();
    const payload = buildWebhookNotification({ data: { id: '555' } });

    const [r1, r2] = await Promise.all([
      request(app).post('/api/webhook/notificacao').send(payload),
      request(app).post('/api/webhook/notificacao').send(payload),
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(webhookService.processarNotificacao).toHaveBeenCalledTimes(2);
  });

  it('processarNotificacao é chamado com upsert para o mesmo endToEndId', async () => {
    webhookService.processarNotificacao.mockResolvedValue();
    const payload = { type: 'payment', data: { id: '777' } };

    await request(app).post('/api/webhook/notificacao').send(payload);
    await request(app).post('/api/webhook/notificacao').send(payload);

    expect(webhookService.processarNotificacao).toHaveBeenCalledTimes(2);
    // A garantia de idempotência real está no upsert do serviço (testada em unit/webhookService)
  });
});

// ─── PUT /api/webhook ─────────────────────────────────────────────────────────

describe('PUT /api/webhook', () => {
  it('[201] retorna mensagem orientando ao painel do MP', async () => {
    webhookService.configurarWebhook.mockResolvedValue({
      mensagem: 'Configure o webhook no painel do Mercado Pago: Suas integrações > Webhooks',
    });

    const res = await request(app).put('/api/webhook');

    expect(res.status).toBe(201);
    expect(res.body.mensagem).toMatch(/Mercado Pago/i);
  });
});

// ─── GET /api/webhook ─────────────────────────────────────────────────────────

describe('GET /api/webhook', () => {
  it('[200] retorna dados do webhook cadastrado', async () => {
    webhookService.consultarWebhook.mockResolvedValue({ url: 'https://api.com/notificacao' });

    const res = await request(app).get('/api/webhook');

    expect(res.status).toBe(200);
    expect(res.body.url).toBeDefined();
  });
});

// ─── DELETE /api/webhook ──────────────────────────────────────────────────────

describe('DELETE /api/webhook', () => {
  it('[500] orienta a remover pelo painel do MP (não suportado via API)', async () => {
    webhookService.cancelarWebhook.mockRejectedValue(
      new Error('Remoção de webhook deve ser feita pelo painel do Mercado Pago.')
    );

    const res = await request(app).delete('/api/webhook');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/painel do Mercado Pago/i);
  });
});

// ─── Concorrência ─────────────────────────────────────────────────────────────

describe('Concorrência — race condition no processamento de notificações', () => {
  it('10 notificações simultâneas com o mesmo paymentId retornam 200 todas', async () => {
    webhookService.processarNotificacao.mockResolvedValue();
    const payload = buildWebhookNotification({ data: { id: '999' } });

    const respostas = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app).post('/api/webhook/notificacao').send(payload)
      )
    );

    expect(respostas.every(r => r.status === 200)).toBe(true);
    expect(webhookService.processarNotificacao).toHaveBeenCalledTimes(10);
  });
});
