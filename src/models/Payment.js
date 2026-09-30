const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    txid: { type: String, required: true, unique: true }, // ID do pagamento no MP
    valor: { type: Number, required: true },
    status: {
      type: String,
      enum: ['ATIVA', 'CONCLUIDA', 'REMOVIDA_PELO_USUARIO_RECEBEDOR', 'REMOVIDA_PELO_PSP', 'EXPIRADA'],
      default: 'ATIVA',
    },
    solicitacaoPagador: { type: String, maxlength: 140 },
    devedor: {
      email: String,
      cpf: String,
      cnpj: String,
      nome: String,
    },
    pixCopiaECola: String,
    qrcode: String,      // base64
    ticketUrl: String,   // link de pagamento gerado pelo MP
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payment', paymentSchema);
