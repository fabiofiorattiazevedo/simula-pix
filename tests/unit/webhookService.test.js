jest.mock('../../src/config/psp');
jest.mock('../../src/models/Payment');
jest.mock('../../src/models/Transaction');
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), error: jest.fn() }));

const webhookService = require('../../src/services/webhookService');
const { createPSPClient } = require('../../src/config/psp');
const Payment = require('../../src/models/Payment');
const Transaction = require('../../src/models/Transaction');
const { generateEndToEndId } = require('../helpers/builders');

const mpApproved = {
  id: 111,
  status: 'approved',
  transaction_amount: 200,
  date_approved: '2024-01-15T10:00:00.000Z',
  payer: {
    first_name: 'Maria',
    last_name: 'Souza',
    identification: { type: 'CPF', number: '98765432100' },
  },
  point_of_interaction: {
    transaction_data: { bank_transfer_id: generateEndToEndId() },
  },
};

beforeEach(() => jest.clearAllMocks());

// ─── configurarWebhook ────────────────────────────────────────────────────────

describe('configurarWebhook', () => {
  it('retorna mensagem informativa sem acionar o PSP', async () => {
    const result = await webhookService.configurarWebhook();
    expect(result.mensagem).toMatch(/painel do Mercado Pago/i);
    expect(createPSPClient).not.toHaveBeenCalled();
  });
});

// ─── cancelarWebhook ──────────────────────────────────────────────────────────

describe('cancelarWebhook', () => {
  it('lança erro orientando ao painel do MP', async () => {
    await expect(webhookService.cancelarWebhook())
      .rejects.toThrow(/painel do Mercado Pago/i);
  });
});

// ─── consultarWebhook ─────────────────────────────────────────────────────────

describe('consultarWebhook', () => {
  it('chama o endpoint correto no MP e retorna os dados', async () => {
    const client = { get: jest.fn().mockResolvedValue({ data: { webhooks: [] } }) };
    createPSPClient.mockReturnValue(client);

    const result = await webhookService.consultarWebhook();

    expect(client.get).toHaveBeenCalledWith('/v1/notifications/webhooks');
    expect(result).toEqual({ webhooks: [] });
  });
});

// ─── processarNotificacao — filtragem de tipo ─────────────────────────────────

describe('processarNotificacao — filtragem', () => {
  it('ignora notificações que não são do tipo "payment"', async () => {
    await webhookService.processarNotificacao({ type: 'merchant_order', data: { id: '1' } });
    expect(createPSPClient).not.toHaveBeenCalled();
  });

  it('ignora notificação sem data.id', async () => {
    await webhookService.processarNotificacao({ type: 'payment', data: {} });
    expect(createPSPClient).not.toHaveBeenCalled();
  });

  it('ignora notificação com data undefined', async () => {
    await webhookService.processarNotificacao({ type: 'payment' });
    expect(createPSPClient).not.toHaveBeenCalled();
  });
});

// ─── processarNotificacao — mapeamento de status ──────────────────────────────

describe('processarNotificacao — mapeamento de status', () => {
  function mockPspGet(paymentData) {
    const client = { get: jest.fn().mockResolvedValue({ data: paymentData }) };
    createPSPClient.mockReturnValue(client);
    return client;
  }

  it('[approved] atualiza Payment para CONCLUIDA', async () => {
    mockPspGet(mpApproved);
    Payment.findOneAndUpdate.mockResolvedValue({});
    Transaction.findOneAndUpdate.mockResolvedValue({});

    await webhookService.processarNotificacao({ type: 'payment', data: { id: '111' } });

    expect(Payment.findOneAndUpdate).toHaveBeenCalledWith(
      { txid: '111' },
      { status: 'CONCLUIDA' },
      { new: true }
    );
  });

  it('[pending] atualiza Payment para ATIVA e não cria Transaction', async () => {
    mockPspGet({ ...mpApproved, status: 'pending' });
    Payment.findOneAndUpdate.mockResolvedValue({});

    await webhookService.processarNotificacao({ type: 'payment', data: { id: '111' } });

    expect(Payment.findOneAndUpdate).toHaveBeenCalledWith(
      { txid: '111' },
      { status: 'ATIVA' },
      { new: true }
    );
    expect(Transaction.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('[rejected] atualiza Payment para REMOVIDA_PELO_PSP', async () => {
    mockPspGet({ ...mpApproved, status: 'rejected' });
    Payment.findOneAndUpdate.mockResolvedValue({});

    await webhookService.processarNotificacao({ type: 'payment', data: { id: '111' } });

    expect(Payment.findOneAndUpdate).toHaveBeenCalledWith(
      { txid: '111' },
      { status: 'REMOVIDA_PELO_PSP' },
      { new: true }
    );
  });

  it('[cancelled] atualiza Payment para REMOVIDA_PELO_USUARIO_RECEBEDOR', async () => {
    mockPspGet({ ...mpApproved, status: 'cancelled' });
    Payment.findOneAndUpdate.mockResolvedValue({});

    await webhookService.processarNotificacao({ type: 'payment', data: { id: '111' } });

    expect(Payment.findOneAndUpdate).toHaveBeenCalledWith(
      { txid: '111' },
      { status: 'REMOVIDA_PELO_USUARIO_RECEBEDOR' },
      { new: true }
    );
  });

  it('[status desconhecido] cai no fallback ATIVA', async () => {
    mockPspGet({ ...mpApproved, status: 'in_mediation' });
    Payment.findOneAndUpdate.mockResolvedValue({});

    await webhookService.processarNotificacao({ type: 'payment', data: { id: '111' } });

    expect(Payment.findOneAndUpdate).toHaveBeenCalledWith(
      { txid: '111' },
      { status: 'ATIVA' },
      { new: true }
    );
  });
});

// ─── processarNotificacao — criação de Transaction ───────────────────────────

describe('processarNotificacao — criação de Transaction', () => {
  function mockPspGet(paymentData) {
    const client = { get: jest.fn().mockResolvedValue({ data: paymentData }) };
    createPSPClient.mockReturnValue(client);
  }

  it('cria Transaction quando pagamento aprovado tem bank_transfer_id', async () => {
    const e2eId = generateEndToEndId();
    const payment = {
      ...mpApproved,
      point_of_interaction: { transaction_data: { bank_transfer_id: e2eId } },
    };
    mockPspGet(payment);
    Payment.findOneAndUpdate.mockResolvedValue({});
    Transaction.findOneAndUpdate.mockResolvedValue({});

    await webhookService.processarNotificacao({ type: 'payment', data: { id: '111' } });

    expect(Transaction.findOneAndUpdate).toHaveBeenCalledWith(
      { endToEndId: e2eId },
      expect.objectContaining({
        endToEndId: e2eId,
        txid: '111',
        valor: 200,
        pagador: expect.objectContaining({ cpf: '98765432100' }),
      }),
      { upsert: true, new: true }
    );
  });

  it('não cria Transaction quando payment aprovado não tem bank_transfer_id', async () => {
    mockPspGet({
      ...mpApproved,
      point_of_interaction: { transaction_data: {} },
    });
    Payment.findOneAndUpdate.mockResolvedValue({});

    await webhookService.processarNotificacao({ type: 'payment', data: { id: '111' } });

    expect(Transaction.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('não cria Transaction quando payment não é approved', async () => {
    mockPspGet({ ...mpApproved, status: 'pending' });
    Payment.findOneAndUpdate.mockResolvedValue({});

    await webhookService.processarNotificacao({ type: 'payment', data: { id: '111' } });

    expect(Transaction.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

// ─── Idempotência ─────────────────────────────────────────────────────────────

describe('processarNotificacao — idempotência (upsert)', () => {
  it('dois webhooks com mesmo endToEndId usam upsert — sem duplicação no banco', async () => {
    const e2eId = generateEndToEndId('12345678');
    const payment = {
      ...mpApproved,
      point_of_interaction: { transaction_data: { bank_transfer_id: e2eId } },
    };
    const client = { get: jest.fn().mockResolvedValue({ data: payment }) };
    createPSPClient.mockReturnValue(client);
    Payment.findOneAndUpdate.mockResolvedValue({});
    Transaction.findOneAndUpdate.mockResolvedValue({});

    await webhookService.processarNotificacao({ type: 'payment', data: { id: '111' } });
    await webhookService.processarNotificacao({ type: 'payment', data: { id: '111' } });

    expect(Transaction.findOneAndUpdate).toHaveBeenCalledTimes(2);
    // Ambas as chamadas usam o mesmo filtro e opção upsert:true
    expect(Transaction.findOneAndUpdate).toHaveBeenCalledWith(
      { endToEndId: e2eId },
      expect.any(Object),
      { upsert: true, new: true }
    );
    // Payment também é atualizado (não duplicado, pois usa findOneAndUpdate)
    expect(Payment.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(Payment.findOneAndUpdate).toHaveBeenCalledWith(
      { txid: '111' },
      expect.any(Object),
      { new: true }
    );
  });
});
