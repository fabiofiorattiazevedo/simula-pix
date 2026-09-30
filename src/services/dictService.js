const { createPSPClient } = require('../config/psp');

const KEY_PATTERNS = {
  CPF:   /^\d{11}$/,
  CNPJ:  /^\d{14}$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\+55\d{10,11}$/,
  EVP:   /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
};

function detectKeyType(chave) {
  if (!chave) return null;
  if (KEY_PATTERNS.CPF.test(chave))   return 'CPF';
  if (KEY_PATTERNS.CNPJ.test(chave))  return 'CNPJ';
  if (KEY_PATTERNS.PHONE.test(chave)) return 'PHONE';
  if (KEY_PATTERNS.EMAIL.test(chave)) return 'EMAIL';
  if (KEY_PATTERNS.EVP.test(chave))   return 'EVP';
  return null;
}

function _maskCPF(cpf)     { return `***${cpf.slice(3, 9)}**`; }
function _maskCNPJ(cnpj)   { return `**${cnpj.slice(2, 12)}**`; }
function _maskEmail(email) {
  const [user, domain] = email.split('@');
  return `${user[0]}***@${domain}`;
}
function _maskPhone(phone) {
  return `${phone.slice(0, 5)}****${phone.slice(-2)}`;
}

async function consultarChave(chave) {
  const tipo = detectKeyType(chave);
  if (!tipo) {
    const err = new Error('Chave Pix inválida ou malformada.');
    err.statusCode = 400;
    throw err;
  }

  const client = createPSPClient();

  try {
    const { data } = await client.get(`/v1/pix/keys/${encodeURIComponent(chave)}`);

    const owner = data.account?.owner || {};
    let documento;
    if (tipo === 'CPF')   documento = _maskCPF(chave);
    else if (tipo === 'CNPJ')  documento = _maskCNPJ(chave);
    else if (tipo === 'EMAIL') documento = _maskEmail(chave);
    else if (tipo === 'PHONE') documento = _maskPhone(chave);
    else                       documento = chave;

    return {
      chave,
      tipo,
      portador: { nome: owner.name || 'Portador', documento },
      conta: {
        ispb: data.account?.ispb,
        agencia: data.account?.branch,
        numero: data.account?.number,
        tipo: data.account?.type,
      },
    };
  } catch (err) {
    if (err.response?.status === 404) {
      const notFound = new Error('Chave Pix não encontrada no DICT.');
      notFound.statusCode = 404;
      throw notFound;
    }
    throw err;
  }
}

module.exports = { consultarChave, detectKeyType };
