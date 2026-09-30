'use strict';

function _randomDigits(n) {
  return Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
}

function _uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function generateCPF()  { return _randomDigits(11); }
function generateCNPJ() { return _randomDigits(14); }
function generateEVP()  { return _uuidv4(); }

/**
 * Formato Bacen: E + ISPB(8) + YYYYMMDDHHmm(12) + sufixo alfanumérico(11) = 32 chars
 */
function generateEndToEndId(ispb = '12345678', date = new Date()) {
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const dt = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}`;
  const suffix = _uuidv4().replace(/-/g, '').substring(0, 11).toUpperCase();
  return `E${ispb}${dt}${suffix}`;
}

function buildPagador(overrides = {}) {
  return {
    email: 'pagador@teste.com',
    nome: 'Fulano de Tal',
    cpf: generateCPF(),
    ...overrides,
  };
}

function buildCobranca(overrides = {}) {
  return {
    valor: 100.00,
    solicitacaoPagador: 'Pedido de teste',
    pagador: buildPagador(),
    ...overrides,
  };
}

function buildMpPaymentResponse(overrides = {}) {
  const id = Math.floor(Math.random() * 1e9);
  return {
    id,
    status: 'pending',
    transaction_amount: 100.00,
    date_approved: new Date().toISOString(),
    payer: {
      first_name: 'Fulano',
      last_name: 'de Tal',
      identification: { type: 'CPF', number: generateCPF() },
    },
    point_of_interaction: {
      transaction_data: {
        qr_code: '00020101021226890014br.gov.bcb.pix2567pix.example.com/qr/v2/cobv/abc123',
        qr_code_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAUA',
        ticket_url: `https://www.mercadopago.com.br/payments/${id}/ticket`,
        bank_transfer_id: generateEndToEndId(),
      },
    },
    ...overrides,
  };
}

function buildWebhookNotification(overrides = {}) {
  return {
    action: 'payment.updated',
    type: 'payment',
    data: { id: String(Math.floor(Math.random() * 1e9)) },
    ...overrides,
  };
}

const E2E_PATTERN = /^E\d{20}[A-Za-z0-9]{11}$/;

module.exports = {
  generateCPF,
  generateCNPJ,
  generateEVP,
  generateEndToEndId,
  buildPagador,
  buildCobranca,
  buildMpPaymentResponse,
  buildWebhookNotification,
  E2E_PATTERN,
};
