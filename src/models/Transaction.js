const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    endToEndId: { type: String, required: true, unique: true },
    txid: { type: String, ref: 'Payment' },
    valor: { type: Number, required: true },
    horario: { type: Date, required: true },
    pagador: {
      cpf: String,
      cnpj: String,
      nome: String,
      ispb: String,
      agencia: String,
      contaTransacional: String,
      tipoConta: { type: String, enum: ['CACC', 'SVGS', 'TRAN', 'SLRY'] },
    },
    recebedor: {
      cpf: String,
      cnpj: String,
      nome: String,
      ispb: String,
      agencia: String,
      contaTransacional: String,
      tipoConta: { type: String, enum: ['CACC', 'SVGS', 'TRAN', 'SLRY'] },
    },
    infoPagador: String,
    devolucoes: [
      {
        id: String,
        rtrId: String,
        valor: Number,
        status: { type: String, enum: ['EM_PROCESSAMENTO', 'DEVOLVIDO', 'NAO_REALIZADO'] },
        horario: {
          solicitacao: Date,
          liquidacao: Date,
        },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Transaction', transactionSchema);
