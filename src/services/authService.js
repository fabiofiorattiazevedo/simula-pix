// Mercado Pago usa Access Token estático — sem fluxo OAuth2 separado.
// O token é lido diretamente da variável de ambiente pelo client HTTP (psp.js).
function getAccessToken() {
  return process.env.MP_ACCESS_TOKEN;
}

module.exports = { getAccessToken };
