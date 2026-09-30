jest.mock('../../src/config/psp');
jest.mock('../../src/models/Payment');
jest.mock('../../src/models/Transaction');

const pixService = require('../../src/services/pixService');
const { createPSPClient } = require('../../src/config/psp');
const Payment = require('../../src/models/Payment');
const Transaction = require('../../src/models/Transaction');
const { buildMpPaymentResponse, buildPagador, E2E_PATTERN } = require('../helpers/builders');

const pagadorCPF = buildPagador({ email: 'joao@email.com', nome: 'João Silva', cpf: '12345678901' });
delete pagadorCPF.cnpj;

function mockClient(overrides = {}) {
  return { post: jest.fn(), get: jest.fn(), put: jest.fn(), ...overrides };
}

function mockChain(result = []) {
  return {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    skip: jest.fn().mockResolvedValue(result),
  };
}

beforeEach(() => jest.clearAllMocks());

// ─── criarCobranca ────────────────────────────────────────────────────────────

describe('criarCobranca', () => {
  it('cria pagamento no MP e salva no banco com dados do pagador CPF', async () => {
    const mpResp = buildMpPaymentResponse({ id: 987654, status: 'pending' });
    const client = mockClient({ post: jest.fn().mockResolvedValue({ data: mpResp }) });
    createPSPClient.mockReturnValue(client);
    Payment.create.mockResolvedValue({ txid: '987654', valor: 150.5, status: 'ATIVA' });

    const result = await pixService.criarCobranca({ valor: 150.5, pagador: pagadorCPF });

    expect(client.post).toHaveBeenCalledWith('/v1/payments', expect.objectContaining({
      transaction_amount: 150.5,
      payment_method_id: 'pix',
      payer: expect.objectContaining({
        email: pagadorCPF.email,
        identification: { type: 'CPF', number: pagadorCPF.cpf },
      }),
    }));
    expect(Payment.create).toHaveBeenCalledWith(expect.objectContaining({
      txid: '987654',
      pixCopiaECola: mpResp.point_of_interaction.transaction_data.qr_code,
      qrcode: mpResp.point_of_interaction.transaction_data.qr_code_base64,
      status: 'ATIVA',
    }));
    expect(result.status).toBe('ATIVA');
  });

  it('usa CNPJ quando pagador não tem CPF', async () => {
    const mpResp = buildMpPaymentResponse();
    const client = mockClient({ post: jest.fn().mockResolvedValue({ data: mpResp }) });
    createPSPClient.mockReturnValue(client);
    Payment.create.mockResolvedValue({});

    await pixService.criarCobranca({
      valor: 200,
      pagador: { email: 'empresa@email.com', nome: 'Empresa SA', cnpj: '12345678000190' },
    });

    expect(client.post).toHaveBeenCalledWith('/v1/payments', expect.objectContaining({
      payer: expect.objectContaining({
        identification: { type: 'CNPJ', number: '12345678000190' },
      }),
    }));
  });

  it('usa solicitacaoPagador como description quando fornecida', async () => {
    const mpResp = buildMpPaymentResponse();
    const client = mockClient({ post: jest.fn().mockResolvedValue({ data: mpResp }) });
    createPSPClient.mockReturnValue(client);
    Payment.create.mockResolvedValue({});

    await pixService.criarCobranca({
      valor: 50,
      solicitacaoPagador: 'Pedido #42',
      pagador: pagadorCPF,
    });

    expect(client.post).toHaveBeenCalledWith('/v1/payments', expect.objectContaining({
      description: 'Pedido #42',
    }));
  });

  it('usa "Pagamento Pix" como description quando solicitacaoPagador não é fornecida', async () => {
    const mpResp = buildMpPaymentResponse();
    const client = mockClient({ post: jest.fn().mockResolvedValue({ data: mpResp }) });
    createPSPClient.mockReturnValue(client);
    Payment.create.mockResolvedValue({});

    await pixService.criarCobranca({ valor: 50, pagador: pagadorCPF });

    expect(client.post).toHaveBeenCalledWith('/v1/payments', expect.objectContaining({
      description: 'Pagamento Pix',
    }));
  });

  it('extrai primeiro e último nome do pagador corretamente', async () => {
    const mpResp = buildMpPaymentResponse();
    const client = mockClient({ post: jest.fn().mockResolvedValue({ data: mpResp }) });
    createPSPClient.mockReturnValue(client);
    Payment.create.mockResolvedValue({});

    await pixService.criarCobranca({
      valor: 50,
      pagador: { ...pagadorCPF, nome: 'Maria Aparecida Souza' },
    });

    expect(client.post).toHaveBeenCalledWith('/v1/payments', expect.objectContaining({
      payer: expect.objectContaining({
        first_name: 'Maria',
        last_name: 'Aparecida Souza',
      }),
    }));
  });

  it('propaga erro quando o MP retorna falha', async () => {
    const client = mockClient({
      post: jest.fn().mockRejectedValue(new Error('MP indisponível')),
    });
    createPSPClient.mockReturnValue(client);

    await expect(pixService.criarCobranca({ valor: 100, pagador: pagadorCPF }))
      .rejects.toThrow('MP indisponível');
    expect(Payment.create).not.toHaveBeenCalled();
  });

  it('propaga erro de chave duplicada (code 11000) sem criar segundo registro', async () => {
    const mpResp = buildMpPaymentResponse();
    const client = mockClient({ post: jest.fn().mockResolvedValue({ data: mpResp }) });
    createPSPClient.mockReturnValue(client);
    const dupErr = new Error('E11000 duplicate key error');
    dupErr.code = 11000;
    Payment.create.mockRejectedValue(dupErr);

    await expect(pixService.criarCobranca({ valor: 100, pagador: pagadorCPF }))
      .rejects.toMatchObject({ code: 11000 });
  });
});

// ─── consultarCobranca ────────────────────────────────────────────────────────

describe('consultarCobranca', () => {
  it('retorna dados do MP e atualiza status no banco', async () => {
    const mpResp = buildMpPaymentResponse({ id: 987654, status: 'approved' });
    const client = mockClient({ get: jest.fn().mockResolvedValue({ data: mpResp }) });
    createPSPClient.mockReturnValue(client);
    Payment.findOneAndUpdate.mockResolvedValue({});

    const result = await pixService.consultarCobranca('987654');

    expect(client.get).toHaveBeenCalledWith('/v1/payments/987654');
    expect(Payment.findOneAndUpdate).toHaveBeenCalledWith(
      { txid: '987654' },
      { status: 'CONCLUIDA' }
    );
    expect(result.status).toBe('approved');
  });

  it('mapeia "pending" para ATIVA', async () => {
    const client = mockClient({
      get: jest.fn().mockResolvedValue({ data: buildMpPaymentResponse({ status: 'pending' }) }),
    });
    createPSPClient.mockReturnValue(client);
    Payment.findOneAndUpdate.mockResolvedValue({});

    await pixService.consultarCobranca('123');

    expect(Payment.findOneAndUpdate).toHaveBeenCalledWith({ txid: '123' }, { status: 'ATIVA' });
  });

  it('mapeia "rejected" para REMOVIDA_PELO_PSP', async () => {
    const client = mockClient({
      get: jest.fn().mockResolvedValue({ data: buildMpPaymentResponse({ status: 'rejected' }) }),
    });
    createPSPClient.mockReturnValue(client);
    Payment.findOneAndUpdate.mockResolvedValue({});

    await pixService.consultarCobranca('123');

    expect(Payment.findOneAndUpdate).toHaveBeenCalledWith(
      { txid: '123' },
      { status: 'REMOVIDA_PELO_PSP' }
    );
  });

  it('mapeia status desconhecido para ATIVA (fallback)', async () => {
    const client = mockClient({
      get: jest.fn().mockResolvedValue({ data: buildMpPaymentResponse({ status: 'in_mediation' }) }),
    });
    createPSPClient.mockReturnValue(client);
    Payment.findOneAndUpdate.mockResolvedValue({});

    await pixService.consultarCobranca('123');

    expect(Payment.findOneAndUpdate).toHaveBeenCalledWith({ txid: '123' }, { status: 'ATIVA' });
  });

  it('propaga erro quando MP está indisponível', async () => {
    const client = mockClient({
      get: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    });
    createPSPClient.mockReturnValue(client);

    await expect(pixService.consultarCobranca('123')).rejects.toThrow('ECONNREFUSED');
    expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

// ─── listarCobrancas ──────────────────────────────────────────────────────────

describe('listarCobrancas', () => {
  it('retorna cobranças com paginação padrão (limite=10, skip=0)', async () => {
    Payment.find = jest.fn().mockReturnValue(mockChain([{ txid: '1' }, { txid: '2' }]));

    const result = await pixService.listarCobrancas();

    expect(Payment.find).toHaveBeenCalled();
    expect(result).toHaveLength(2);
  });

  it('aplica limite e página customizados', async () => {
    const chain = mockChain([]);
    Payment.find = jest.fn().mockReturnValue(chain);

    await pixService.listarCobrancas({ limite: 5, pagina: 2 });

    expect(chain.limit).toHaveBeenCalledWith(5);
    expect(chain.skip).toHaveBeenCalledWith(10); // pagina=2 * limite=5
  });

  it('retorna array vazio quando não há cobranças', async () => {
    Payment.find = jest.fn().mockReturnValue(mockChain([]));
    const result = await pixService.listarCobrancas();
    expect(result).toHaveLength(0);
  });
});

// ─── cancelarCobranca ─────────────────────────────────────────────────────────

describe('cancelarCobranca', () => {
  it('cancela no MP e atualiza o banco para REMOVIDA_PELO_USUARIO_RECEBEDOR', async () => {
    const client = mockClient({
      put: jest.fn().mockResolvedValue({ data: { status: 'cancelled' } }),
    });
    createPSPClient.mockReturnValue(client);
    Payment.findOneAndUpdate.mockResolvedValue({});

    await pixService.cancelarCobranca('987654');

    expect(client.put).toHaveBeenCalledWith('/v1/payments/987654', { status: 'cancelled' });
    expect(Payment.findOneAndUpdate).toHaveBeenCalledWith(
      { txid: '987654' },
      { status: 'REMOVIDA_PELO_USUARIO_RECEBEDOR' }
    );
  });
});

// ─── solicitarDevolucao ───────────────────────────────────────────────────────

describe('solicitarDevolucao', () => {
  it('envia amount no payload para devolução parcial', async () => {
    const client = mockClient({
      post: jest.fn().mockResolvedValue({ data: { id: 'ref_1', status: 'approved' } }),
    });
    createPSPClient.mockReturnValue(client);

    const result = await pixService.solicitarDevolucao('987654', null, 50);

    expect(client.post).toHaveBeenCalledWith('/v1/payments/987654/refunds', { amount: 50 });
    expect(result.status).toBe('approved');
  });

  it('envia payload vazio para devolução total', async () => {
    const client = mockClient({
      post: jest.fn().mockResolvedValue({ data: { id: 'ref_2' } }),
    });
    createPSPClient.mockReturnValue(client);

    await pixService.solicitarDevolucao('987654', null, undefined);

    expect(client.post).toHaveBeenCalledWith('/v1/payments/987654/refunds', {});
  });

  it('propaga erro do MP quando valor é superior ao original (422)', async () => {
    const mpErr = { message: 'amount greater', response: { status: 422, data: { msg: 'invalid' } } };
    const client = mockClient({ post: jest.fn().mockRejectedValue(mpErr) });
    createPSPClient.mockReturnValue(client);

    await expect(pixService.solicitarDevolucao('987654', null, 9999))
      .rejects.toMatchObject({ response: { status: 422 } });
  });

  it('propaga erro do MP quando prazo regulamentar expirou (400)', async () => {
    const mpErr = { message: 'refund expired', response: { status: 400, data: { msg: 'period expired' } } };
    const client = mockClient({ post: jest.fn().mockRejectedValue(mpErr) });
    createPSPClient.mockReturnValue(client);

    await expect(pixService.solicitarDevolucao('987654', null, 10))
      .rejects.toMatchObject({ response: { status: 400 } });
  });
});

// ─── consultarPix ─────────────────────────────────────────────────────────────

describe('consultarPix', () => {
  it('busca transação pelo endToEndId', async () => {
    Transaction.findOne.mockResolvedValue({ endToEndId: 'E123', valor: 100 });

    const result = await pixService.consultarPix('E123');

    expect(Transaction.findOne).toHaveBeenCalledWith({ endToEndId: 'E123' });
    expect(result.endToEndId).toBe('E123');
  });

  it('retorna null quando endToEndId não existe', async () => {
    Transaction.findOne.mockResolvedValue(null);

    const result = await pixService.consultarPix('INEXISTENTE');

    expect(result).toBeNull();
  });
});

// ─── listarPix ────────────────────────────────────────────────────────────────

describe('listarPix', () => {
  it('retorna transações com paginação padrão', async () => {
    Transaction.find = jest.fn().mockReturnValue(mockChain([{ endToEndId: 'E1' }, { endToEndId: 'E2' }]));

    const result = await pixService.listarPix();

    expect(result).toHaveLength(2);
  });

  it('aplica limite e página customizados', async () => {
    const chain = mockChain([]);
    Transaction.find = jest.fn().mockReturnValue(chain);

    await pixService.listarPix({ limite: 3, pagina: 1 });

    expect(chain.limit).toHaveBeenCalledWith(3);
    expect(chain.skip).toHaveBeenCalledWith(3); // pagina=1 * limite=3
  });
});

// ─── enviarPix ────────────────────────────────────────────────────────────────

describe('enviarPix', () => {
  const dadosEnvio = { chave: 'destinatario@email.com', valor: 100, descricao: 'Teste' };
  const diurno    = new Date(2024, 0, 15, 12, 0, 0); // 12h local — horário diurno
  const noturno   = new Date(2024, 0, 15, 22, 0, 0); // 22h local — horário noturno
  const madrugada = new Date(2024, 0, 15,  4, 0, 0); //  4h local — horário noturno

  beforeEach(() => {
    process.env.PIX_LIMITE_DIARIO  = '10000';
    process.env.PIX_LIMITE_NOTURNO = '1000';
  });

  it('[Positivo] gera endToEndId no padrão Bacen (E+ISPB8+YYYYMMDDHHmm+11chars = 32)', async () => {
    const client = mockClient({
      post: jest.fn().mockResolvedValue({ data: { id: 'transfer_ABC' } }),
    });
    createPSPClient.mockReturnValue(client);
    Transaction.create.mockResolvedValue({ endToEndId: 'mock' });

    const result = await pixService.enviarPix(dadosEnvio, diurno);

    expect(result.endToEndId).toMatch(E2E_PATTERN);
    expect(result.endToEndId).toHaveLength(32);
  });

  it('[Positivo] persiste a transação após envio bem-sucedido', async () => {
    const client = mockClient({
      post: jest.fn().mockResolvedValue({ data: { id: 'transfer_123' } }),
    });
    createPSPClient.mockReturnValue(client);
    Transaction.create.mockResolvedValue({ endToEndId: 'E0000000020240115120012345678901' });

    await pixService.enviarPix(dadosEnvio, diurno);

    expect(Transaction.create).toHaveBeenCalledWith(expect.objectContaining({
      valor: 100,
      horario: diurno,
    }));
  });

  it('[Negativo] 422 quando valor excede limite diário em horário diurno', async () => {
    await expect(pixService.enviarPix({ ...dadosEnvio, valor: 10001 }, diurno))
      .rejects.toMatchObject({ statusCode: 422, message: expect.stringMatching(/diário/i) });
    expect(createPSPClient).not.toHaveBeenCalled();
    expect(Transaction.create).not.toHaveBeenCalled();
  });

  it('[Negativo] 422 quando valor excede limite noturno após 20h', async () => {
    await expect(pixService.enviarPix({ ...dadosEnvio, valor: 1001 }, noturno))
      .rejects.toMatchObject({ statusCode: 422, message: expect.stringMatching(/noturno/i) });
  });

  it('[Negativo] 422 quando valor excede limite noturno antes das 6h', async () => {
    await expect(pixService.enviarPix({ ...dadosEnvio, valor: 1001 }, madrugada))
      .rejects.toMatchObject({ statusCode: 422, message: expect.stringMatching(/noturno/i) });
  });

  it('[Negativo] valor exato no limite é aceito (sem exceder)', async () => {
    const client = mockClient({
      post: jest.fn().mockResolvedValue({ data: { id: 'transfer_ok' } }),
    });
    createPSPClient.mockReturnValue(client);
    Transaction.create.mockResolvedValue({});

    await expect(pixService.enviarPix({ ...dadosEnvio, valor: 10000 }, diurno))
      .resolves.toBeDefined();
  });

  it('[Resiliência] ECONNABORTED → statusCode 202 + pending=true (sem débito duplo)', async () => {
    const timeoutErr = Object.assign(new Error('timeout'), { code: 'ECONNABORTED' });
    const client = mockClient({ post: jest.fn().mockRejectedValue(timeoutErr) });
    createPSPClient.mockReturnValue(client);

    const err = await pixService.enviarPix(dadosEnvio, diurno).catch(e => e);

    expect(err.statusCode).toBe(202);
    expect(err.pending).toBe(true);
    expect(Transaction.create).not.toHaveBeenCalled();
  });

  it('[Resiliência] ETIMEDOUT → statusCode 202 + pending=true', async () => {
    const timeoutErr = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
    const client = mockClient({ post: jest.fn().mockRejectedValue(timeoutErr) });
    createPSPClient.mockReturnValue(client);

    const err = await pixService.enviarPix(dadosEnvio, diurno).catch(e => e);

    expect(err.statusCode).toBe(202);
    expect(err.pending).toBe(true);
    expect(Transaction.create).not.toHaveBeenCalled();
  });

  it('propaga outros erros do PSP sem envolver em 202', async () => {
    const mpErr = { response: { status: 400, data: { message: 'invalid key' } } };
    const client = mockClient({ post: jest.fn().mockRejectedValue(mpErr) });
    createPSPClient.mockReturnValue(client);

    await expect(pixService.enviarPix(dadosEnvio, diurno)).rejects.toBe(mpErr);
  });
});
