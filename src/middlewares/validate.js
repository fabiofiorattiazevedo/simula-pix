const Joi = require('joi');

const schemas = {
  criarCobranca: Joi.object({
    valor: Joi.number().positive().precision(2).required(),
    solicitacaoPagador: Joi.string().max(140),
    pagador: Joi.object({
      email: Joi.string().email().required(),
      nome: Joi.string().max(200).required(),
      cpf: Joi.string().length(11).pattern(/^\d+$/),
      cnpj: Joi.string().length(14).pattern(/^\d+$/),
    }).xor('cpf', 'cnpj').required(),
  }),

  solicitarDevolucao: Joi.object({
    valor: Joi.number().positive().precision(2),
  }),

  enviarPix: Joi.object({
    chave: Joi.string().required(),
    valor: Joi.number().positive().precision(2).required(),
    descricao: Joi.string().max(140),
  }),
};

function validate(schemaName) {
  return (req, res, next) => {
    const schema = schemas[schemaName];
    if (!schema) return next();

    const { error, value } = schema.validate(req.body, { abortEarly: false });

    if (error) {
      return res.status(422).json({
        error: 'Dados inválidos',
        detalhes: error.details.map((d) => d.message),
      });
    }

    req.body = value;
    next();
  };
}

module.exports = validate;
