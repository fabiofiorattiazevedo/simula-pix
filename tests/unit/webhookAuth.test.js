const webhookAuth = require('../../src/middlewares/webhookAuth');

function makeReq(headers = {}) { return { headers }; }
function makeRes() { return { status: jest.fn().mockReturnThis(), json: jest.fn() }; }

describe('webhookAuth middleware', () => {
  const next = jest.fn();
  beforeEach(() => next.mockClear());

  describe('sem WEBHOOK_SECRET configurado', () => {
    beforeAll(() => { delete process.env.WEBHOOK_SECRET; });

    it('chama next() sem validar o header (modo sem secret)', () => {
      webhookAuth(makeReq(), makeRes(), next);
      expect(next).toHaveBeenCalled();
    });

    it('chama next() mesmo com header presente (secret ignorado)', () => {
      webhookAuth(makeReq({ 'x-webhook-secret': 'qualquer' }), makeRes(), next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('com WEBHOOK_SECRET configurado', () => {
    const SECRET = 'meu-super-secret-123';
    beforeAll(() => { process.env.WEBHOOK_SECRET = SECRET; });
    afterAll(() => { delete process.env.WEBHOOK_SECRET; });

    it('chama next() com secret correto no header', () => {
      webhookAuth(makeReq({ 'x-webhook-secret': SECRET }), makeRes(), next);
      expect(next).toHaveBeenCalled();
    });

    it('401 quando header x-webhook-secret está ausente', () => {
      const res = makeRes();
      webhookAuth(makeReq(), res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.stringMatching(/inválida/i),
      }));
      expect(next).not.toHaveBeenCalled();
    });

    it('401 com secret incorreto', () => {
      const res = makeRes();
      webhookAuth(makeReq({ 'x-webhook-secret': 'errado' }), res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('401 com secret vazio', () => {
      const res = makeRes();
      webhookAuth(makeReq({ 'x-webhook-secret': '' }), res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('401 com secret em caixa diferente (case-sensitive)', () => {
      const res = makeRes();
      webhookAuth(makeReq({ 'x-webhook-secret': SECRET.toUpperCase() }), res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});
