const { createPSPClient } = require('../config/psp');
const Payment = require('../models/Payment');
const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');

// O MP não expõe endpoint para cadastrar webhook via API em produção.
// O cadastro é feito no painel: Suas integrações > Webhooks
// Este endpoint é mantido apenas para compatibilidade de interface.
async function configurarWebhook() {
  return { mensagem: 'Configure o webhook no painel do Mercado Pago: Suas integrações > Webhooks' };
}

async function consultarWebhook() {
  const client = createPSPClient();
  const { data } = await client.get('/v1/notifications/webhooks');
  return data;
}

async function cancelarWebhook() {
  throw new Error('Remoção de webhook deve ser feita pelo painel do Mercado Pago.');
}

async function processarNotificacao(notificacao) {
  // O MP envia { action: "payment.updated", data: { id: "123" }, type: "payment" }
  if (notificacao.type !== 'payment') return;

  const paymentId = notificacao.data?.id;
  if (!paymentId) return;

  logger.info(`Notificação MP recebida: paymentId=${paymentId}`);

  const client = createPSPClient();
  const { data } = await client.get(`/v1/payments/${paymentId}`);

  const txData = data.point_of_interaction?.transaction_data;
  const statusMapeado = _mapStatus(data.status);

  await Payment.findOneAndUpdate(
    { txid: String(data.id) },
    { status: statusMapeado },
    { new: true }
  );

  if (data.status === 'approved' && txData?.bank_transfer_id) {
    await Transaction.findOneAndUpdate(
      { endToEndId: txData.bank_transfer_id },
      {
        endToEndId: txData.bank_transfer_id,
        txid: String(data.id),
        valor: data.transaction_amount,
        horario: new Date(data.date_approved),
        pagador: {
          nome: data.payer?.first_name + ' ' + data.payer?.last_name,
          cpf: data.payer?.identification?.number,
        },
      },
      { upsert: true, new: true }
    );
  }
}

function _mapStatus(mpStatus) {
  const map = {
    pending: 'CONCLUIDA',
    approved: 'ATIVA',
    cancelled: 'REMOVIDA_PELO_USUARIO_RECEBEDOR',
    rejected: 'REMOVIDA_PELO_PSP',
  };
  return map[mpStatus] || 'ATIVA';
}

module.exports = {
  configurarWebhook,
  consultarWebhook,
  cancelarWebhook,
  processarNotificacao,
};
