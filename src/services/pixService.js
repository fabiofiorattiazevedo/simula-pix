const { createPSPClient } = require('../config/psp');
const Payment = require('../models/Payment');
const Transaction = require('../models/Transaction');

async function criarCobranca(dados) {
  const client = createPSPClient();

  const payload = {
    transaction_amount: dados.valor,
    description: dados.solicitacaoPagador || 'Pagamento Pix',
    payment_method_id: 'pix',
    payer: {
      email: dados.pagador.email,
      first_name: dados.pagador.nome?.split(' ')[0],
      last_name: dados.pagador.nome?.split(' ').slice(1).join(' '),
      identification: {
        type: dados.pagador.cpf ? 'CPF' : 'CNPJ',
        number: dados.pagador.cpf || dados.pagador.cnpj,
      },
    },
  };

  const { data } = await client.post('/v1/payments', payload);

  const txData = data.point_of_interaction.transaction_data;

  const payment = await Payment.create({
    txid: String(data.id),
    valor: data.transaction_amount,
    status: _mapStatus(data.status),
    solicitacaoPagador: dados.solicitacaoPagador,
    devedor: dados.pagador,
    pixCopiaECola: txData.qr_code,
    qrcode: txData.qr_code_base64,
    ticketUrl: txData.ticket_url,
  });

  return payment;
}

async function consultarCobranca(txid) {
  const client = createPSPClient();
  const { data } = await client.get(`/v1/payments/${txid}`);

  await Payment.findOneAndUpdate(
    { txid },
    { status: _mapStatus(data.status) }
  );

  return data;
}

async function listarCobrancas(filtros = {}) {
  return Payment.find()
    .sort({ createdAt: -1 })
    .limit(filtros.limite || 10)
    .skip((filtros.pagina || 0) * (filtros.limite || 10));
}

async function cancelarCobranca(txid) {
  const client = createPSPClient();
  const { data } = await client.put(`/v1/payments/${txid}`, { status: 'cancelled' });

  await Payment.findOneAndUpdate({ txid }, { status: 'REMOVIDA_PELO_USUARIO_RECEBEDOR' });

  return data;
}

async function solicitarDevolucao(txid, devolucaoId, valor) {
  const client = createPSPClient();

  const payload = valor ? { amount: valor } : {};
  const { data } = await client.post(`/v1/payments/${txid}/refunds`, payload);

  return data;
}

async function consultarPix(e2eId) {
  return Transaction.findOne({ endToEndId: e2eId });
}

async function listarPix(filtros = {}) {
  return Transaction.find()
    .sort({ horario: -1 })
    .limit(filtros.limite || 10)
    .skip((filtros.pagina || 0) * (filtros.limite || 10));
}

async function enviarPix({ chave, valor, descricao }, agora = new Date()) {
  const LIMITE_DIARIO  = Number(process.env.PIX_LIMITE_DIARIO)  || 10000;
  const LIMITE_NOTURNO = Number(process.env.PIX_LIMITE_NOTURNO) || 1000;
  const hora = agora.getHours();
  const isNoturno = hora >= 20 || hora < 6;
  const limite = isNoturno ? LIMITE_NOTURNO : LIMITE_DIARIO;

  if (valor > limite) {
    const err = new Error(
      isNoturno
        ? `Limite noturno de R$ ${LIMITE_NOTURNO.toFixed(2)} excedido.`
        : `Limite diário de R$ ${LIMITE_DIARIO.toFixed(2)} excedido.`
    );
    err.statusCode = 422;
    throw err;
  }

  const client = createPSPClient();
  let data;
  try {
    const resp = await client.post('/v1/pix/transfers', {
      amount: valor,
      description: descricao || 'Envio Pix',
      receiver_key: chave,
    });
    data = resp.data;
  } catch (err) {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
      const pending = new Error('SPI indisponível. Transação em processamento.');
      pending.statusCode = 202;
      pending.pending = true;
      throw pending;
    }
    throw err;
  }

  // Formato Bacen: E + ISPB(8) + YYYYMMDDHHmm(12) + sufixo(11) = 32 chars
  const ispb = (process.env.PSP_ISPB || '00000000').padStart(8, '0').slice(0, 8);
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const datePart = `${agora.getFullYear()}${pad(agora.getMonth() + 1)}${pad(agora.getDate())}${pad(agora.getHours())}${pad(agora.getMinutes())}`;
  const suffix = String(data.id || Math.random()).replace(/[^A-Za-z0-9]/g, '').substring(0, 11).toUpperCase().padEnd(11, '0');
  const endToEndId = `E${ispb}${datePart}${suffix}`;

  const transaction = await Transaction.create({
    endToEndId,
    txid: String(data.id),
    valor,
    horario: agora,
    pagador: { nome: 'Conta própria' },
  });

  return { endToEndId, transaction };
}

function _mapStatus(mpStatus) {
  const map = {
    pending: 'ATIVA',
    approved: 'CONCLUIDA',
    cancelled: 'REMOVIDA_PELO_USUARIO_RECEBEDOR',
    rejected: 'REMOVIDA_PELO_PSP',
  };
  return map[mpStatus] || 'ATIVA';
}

module.exports = {
  criarCobranca,
  consultarCobranca,
  listarCobrancas,
  cancelarCobranca,
  solicitarDevolucao,
  consultarPix,
  listarPix,
  enviarPix,
};
