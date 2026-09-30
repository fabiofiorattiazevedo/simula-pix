const request = require('supertest');
const app = require('../../src/app');
const { buildCobranca, buildPagador, E2E_PATTERN } = require('../helpers/builders');

jest.mock('../../src/middlewares/auth', () => (req, res, next) => {
  req.user = { id: 'test-user' };
  next();
});
jest.mock('../../src/services/pixService');

const pixService = require('../../src/services/pixService');

const cobrancaMock = {
  txid: '987654',
  valor: 150.5,
  status: 'ATIVA',
  pixCopiaECola: '00020101021226890014br.gov.bcb.pix...',
  qrcode: 'base64==',
  ticketUrl: 'https://mercadopago.com.br/payments/987654/ticket',
};

const bodyValido = buildCobranca({
  valor: 150.5,
  solicitacaoPagador: 'Pedido #001',
  pagador: buildPagador({ email: 'joao@email.com', nome: 'João Silva', cpf: '12345678901' }),
});

beforeEach(() => jest.clearAllMocks());

// ─── POST /api/pix/cob ────────────────────────────────────────────────────────

describe('POST /api/pix/cob', () => {
  it('[201] cria cobrança e retorna status ATIVA com BR Code', async () => {
    pixService.criarCobranca.mockResolvedValue(cobrancaMock);

    const res = await request(app).post('/api/pix/cob').send(bodyValido);

    expect(res.status).toBe(201);
    expect(res.body.txid).toBe('987654');
    expect(res.body.status).toBe('ATIVA');
    expect(res.body.pixCopiaECola).toMatch(/^00020101/);
    expect(pixService.criarCobranca).toHaveBeenCalledTimes(1);
  });

  it('[409] txid já utilizado — erro de chave duplicada MongoDB (code 11000)', async () => {
    const dupErr = new Error('E11000 duplicate key error');
    dupErr.code = 11000;
    pixService.criarCobranca.mockRejectedValue(dupErr);

    const res = await request(app).post('/api/pix/cob').send(bodyValido);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/txid duplicado/i);
  });

  it('[422] valor negativo rejeitado pelo middleware de validação', async () => {
    const res = await request(app).post('/api/pix/cob').send({ ...bodyValido, valor: -10 });

    expect(res.status).toBe(422);
    expect(res.body.detalhes).toBeDefined();
    expect(pixService.criarCobranca).not.toHaveBeenCalled();
  });

  it('[422] valor zero rejeitado', async () => {
    const res = await request(app).post('/api/pix/cob').send({ ...bodyValido, valor: 0 });
    expect(res.status).toBe(422);
  });

  it('[422] sem campo pagador', async () => {
    const res = await request(app).post('/api/pix/cob').send({ valor: 100 });
    expect(res.status).toBe(422);
  });

  it('[422] sem email do pagador', async () => {
    const res = await request(app).post('/api/pix/cob').send({
      valor: 100,
      pagador: { nome: 'João', cpf: '12345678901' },
    });
    expect(res.status).toBe(422);
  });

  it('[422] CPF e CNPJ informados simultaneamente', async () => {
    const res = await request(app).post('/api/pix/cob').send({
      valor: 100,
      pagador: { email: 'a@a.com', nome: 'João', cpf: '12345678901', cnpj: '12345678000190' },
    });
    expect(res.status).toBe(422);
  });

  it('[422] solicitacaoPagador acima de 140 caracteres', async () => {
    const res = await request(app).post('/api/pix/cob').send({
      ...bodyValido,
      solicitacaoPagador: 'x'.repeat(141),
    });
    expect(res.status).toBe(422);
  });

  it('[500] repassa erro genérico do serviço', async () => {
    pixService.criarCobranca.mockRejectedValue(new Error('MP offline'));

    const res = await request(app).post('/api/pix/cob').send(bodyValido);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('MP offline');
  });

  it('[502] repassa erro HTTP do PSP', async () => {
    const mpErr = { message: 'bad gw', response: { status: 502, data: { msg: 'fail' } } };
    pixService.criarCobranca.mockRejectedValue(mpErr);

    const res = await request(app).post('/api/pix/cob').send(bodyValido);

    expect(res.status).toBe(502);
  });
});

// ─── GET /api/pix/cob ─────────────────────────────────────────────────────────

describe('GET /api/pix/cob', () => {
  it('[200] lista cobranças', async () => {
    pixService.listarCobrancas.mockResolvedValue([cobrancaMock]);

    const res = await request(app).get('/api/pix/cob');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].txid).toBe('987654');
  });

  it('[200] lista vazia quando não há cobranças', async () => {
    pixService.listarCobrancas.mockResolvedValue([]);

    const res = await request(app).get('/api/pix/cob');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it('encaminha query params para o serviço', async () => {
    pixService.listarCobrancas.mockResolvedValue([]);

    await request(app).get('/api/pix/cob?limite=5&pagina=2');

    expect(pixService.listarCobrancas).toHaveBeenCalledWith(
      expect.objectContaining({ limite: '5', pagina: '2' })
    );
  });
});

// ─── GET /api/pix/cob/:txid ───────────────────────────────────────────────────

describe('GET /api/pix/cob/:txid', () => {
  it('[200] retorna dados da cobrança ATIVA', async () => {
    pixService.consultarCobranca.mockResolvedValue(cobrancaMock);

    const res = await request(app).get('/api/pix/cob/987654');

    expect(res.status).toBe(200);
    expect(res.body.txid).toBe('987654');
    expect(pixService.consultarCobranca).toHaveBeenCalledWith('987654');
  });

  it('[200] retorna cobrança com status EXPIRADA', async () => {
    pixService.consultarCobranca.mockResolvedValue({ ...cobrancaMock, status: 'EXPIRADA' });

    const res = await request(app).get('/api/pix/cob/987654');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('EXPIRADA');
  });

  it('[200] retorna cobrança com status CONCLUIDA', async () => {
    pixService.consultarCobranca.mockResolvedValue({ ...cobrancaMock, status: 'CONCLUIDA' });

    const res = await request(app).get('/api/pix/cob/987654');

    expect(res.body.status).toBe('CONCLUIDA');
  });
});

// ─── DELETE /api/pix/cob/:txid ────────────────────────────────────────────────

describe('DELETE /api/pix/cob/:txid', () => {
  it('[200] cancela cobrança e retorna dados do MP', async () => {
    pixService.cancelarCobranca.mockResolvedValue({ status: 'cancelled' });

    const res = await request(app).delete('/api/pix/cob/987654');

    expect(res.status).toBe(200);
    expect(pixService.cancelarCobranca).toHaveBeenCalledWith('987654');
  });
});

// ─── POST /api/pix/cob/:txid/devolucao ───────────────────────────────────────

describe('POST /api/pix/cob/:txid/devolucao', () => {
  it('[201] solicita devolução parcial', async () => {
    pixService.solicitarDevolucao.mockResolvedValue({ id: 'ref_1', status: 'approved' });

    const res = await request(app).post('/api/pix/cob/987654/devolucao').send({ valor: 50 });

    expect(res.status).toBe(201);
    expect(pixService.solicitarDevolucao).toHaveBeenCalledWith('987654', null, 50);
  });

  it('[201] solicita devolução total (sem valor no body)', async () => {
    pixService.solicitarDevolucao.mockResolvedValue({ id: 'ref_2' });

    const res = await request(app).post('/api/pix/cob/987654/devolucao').send({});

    expect(res.status).toBe(201);
    expect(pixService.solicitarDevolucao).toHaveBeenCalledWith('987654', null, undefined);
  });

  it('[422] valor negativo rejeitado pelo middleware', async () => {
    const res = await request(app).post('/api/pix/cob/987654/devolucao').send({ valor: -30 });

    expect(res.status).toBe(422);
    expect(pixService.solicitarDevolucao).not.toHaveBeenCalled();
  });

  it('[422] valor superior ao original — PSP rejeita', async () => {
    const mpErr = { message: 'amount greater', response: { status: 422, data: {} } };
    pixService.solicitarDevolucao.mockRejectedValue(mpErr);

    const res = await request(app).post('/api/pix/cob/987654/devolucao').send({ valor: 9999 });

    expect(res.status).toBe(422);
  });

  it('[400] devolução após expiração do prazo regulamentar', async () => {
    const mpErr = { message: 'period expired', response: { status: 400, data: {} } };
    pixService.solicitarDevolucao.mockRejectedValue(mpErr);

    const res = await request(app).post('/api/pix/cob/987654/devolucao').send({ valor: 10 });

    expect(res.status).toBe(400);
  });
});

// ─── POST /api/pix/envio ──────────────────────────────────────────────────────

describe('POST /api/pix/envio', () => {
  const bodyEnvio = { chave: 'destino@email.com', valor: 100 };
  const e2eRetorno = 'E0000000020240115120012345678901';

  it('[201] envia Pix com sucesso e retorna endToEndId', async () => {
    pixService.enviarPix.mockResolvedValue({ endToEndId: e2eRetorno, transaction: {} });

    const res = await request(app).post('/api/pix/envio').send(bodyEnvio);

    expect(res.status).toBe(201);
    expect(res.body.endToEndId).toMatch(E2E_PATTERN);
  });

  it('[422] limite operacional diário excedido', async () => {
    const err = new Error('Limite diário excedido.');
    err.statusCode = 422;
    pixService.enviarPix.mockRejectedValue(err);

    const res = await request(app).post('/api/pix/envio').send({ ...bodyEnvio, valor: 99999 });

    expect(res.status).toBe(422);
  });

  it('[422] limite operacional noturno excedido', async () => {
    const err = new Error('Limite noturno de R$ 1000.00 excedido.');
    err.statusCode = 422;
    pixService.enviarPix.mockRejectedValue(err);

    const res = await request(app).post('/api/pix/envio').send({ ...bodyEnvio, valor: 1001 });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/noturno/i);
  });

  it('[202] SPI indisponível — transação entra em processamento sem débito duplo', async () => {
    const err = new Error('SPI indisponível. Transação em processamento.');
    err.pending = true;
    pixService.enviarPix.mockRejectedValue(err);

    const res = await request(app).post('/api/pix/envio').send(bodyEnvio);

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('EM_PROCESSAMENTO');
  });

  it('[422] sem campo chave', async () => {
    const res = await request(app).post('/api/pix/envio').send({ valor: 100 });
    expect(res.status).toBe(422);
    expect(pixService.enviarPix).not.toHaveBeenCalled();
  });

  it('[422] valor zero', async () => {
    const res = await request(app).post('/api/pix/envio').send({ chave: 'a@a.com', valor: 0 });
    expect(res.status).toBe(422);
  });

  it('[422] valor negativo', async () => {
    const res = await request(app).post('/api/pix/envio').send({ chave: 'a@a.com', valor: -50 });
    expect(res.status).toBe(422);
  });
});

// ─── GET /api/pix ─────────────────────────────────────────────────────────────

describe('GET /api/pix', () => {
  it('[200] lista Pix recebidos', async () => {
    pixService.listarPix.mockResolvedValue([{ endToEndId: 'E123', valor: 100 }]);

    const res = await request(app).get('/api/pix');

    expect(res.status).toBe(200);
    expect(res.body[0].endToEndId).toBe('E123');
  });
});

// ─── GET /api/pix/:e2eId ──────────────────────────────────────────────────────

describe('GET /api/pix/:e2eId', () => {
  it('[200] retorna Pix pelo endToEndId', async () => {
    pixService.consultarPix.mockResolvedValue({ endToEndId: 'E123', valor: 100 });

    const res = await request(app).get('/api/pix/E123');

    expect(res.status).toBe(200);
    expect(pixService.consultarPix).toHaveBeenCalledWith('E123');
  });
});

// ─── GET /api/health ──────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('[200] health check', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
