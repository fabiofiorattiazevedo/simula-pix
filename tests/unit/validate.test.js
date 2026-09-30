const validate = require('../../src/middlewares/validate');

const next = jest.fn();
function makeRes() { return { status: jest.fn().mockReturnThis(), json: jest.fn() }; }
beforeEach(() => next.mockClear());

// ─── criarCobranca ────────────────────────────────────────────────────────────

describe('validate — criarCobranca', () => {
  const middleware = validate('criarCobranca');
  const bodyValido = {
    valor: 100,
    pagador: { email: 'joao@email.com', nome: 'João Silva', cpf: '12345678901' },
  };

  it('chama next() com payload válido (CPF)', () => {
    middleware({ body: { ...bodyValido } }, makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('chama next() com payload válido (CNPJ)', () => {
    middleware({
      body: { valor: 200, pagador: { email: 'emp@email.com', nome: 'Empresa SA', cnpj: '12345678000190' } },
    }, makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('chama next() com solicitacaoPagador no limite (140 chars)', () => {
    middleware({ body: { ...bodyValido, solicitacaoPagador: 'x'.repeat(140) } }, makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('422 — valor negativo', () => {
    const res = makeRes();
    middleware({ body: { ...bodyValido, valor: -10 } }, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(next).not.toHaveBeenCalled();
  });

  it('422 — valor zero', () => {
    const res = makeRes();
    middleware({ body: { ...bodyValido, valor: 0 } }, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('422 — valor ausente', () => {
    const res = makeRes();
    middleware({ body: { pagador: bodyValido.pagador } }, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('422 — sem campo pagador', () => {
    const res = makeRes();
    middleware({ body: { valor: 100 } }, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('422 — sem email do pagador', () => {
    const res = makeRes();
    middleware({ body: { valor: 100, pagador: { nome: 'João', cpf: '12345678901' } } }, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('422 — email inválido', () => {
    const res = makeRes();
    middleware({ body: { ...bodyValido, pagador: { ...bodyValido.pagador, email: 'nao-e-email' } } }, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('422 — sem nome do pagador', () => {
    const res = makeRes();
    middleware({ body: { valor: 100, pagador: { email: 'a@a.com', cpf: '12345678901' } } }, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('422 — CPF e CNPJ informados simultaneamente', () => {
    const res = makeRes();
    middleware({
      body: {
        valor: 100,
        pagador: { email: 'a@a.com', nome: 'João', cpf: '12345678901', cnpj: '12345678000190' },
      },
    }, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('422 — nem CPF nem CNPJ informados', () => {
    const res = makeRes();
    middleware({ body: { valor: 100, pagador: { email: 'a@a.com', nome: 'João' } } }, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('422 — CPF com menos de 11 dígitos', () => {
    const res = makeRes();
    middleware({ body: { ...bodyValido, pagador: { ...bodyValido.pagador, cpf: '1234567890' } } }, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('422 — CNPJ com menos de 14 dígitos', () => {
    const res = makeRes();
    middleware({
      body: { valor: 100, pagador: { email: 'a@a.com', nome: 'Emp', cnpj: '1234567800019' } },
    }, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('422 — CPF com caracteres não numéricos', () => {
    const res = makeRes();
    middleware({
      body: { ...bodyValido, pagador: { ...bodyValido.pagador, cpf: '1234567890a' } },
    }, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('422 — solicitacaoPagador ultrapassa 140 caracteres', () => {
    const res = makeRes();
    middleware({ body: { ...bodyValido, solicitacaoPagador: 'x'.repeat(141) } }, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('inclui array detalhes no corpo do erro', () => {
    const res = makeRes();
    middleware({ body: { valor: -1 } }, res, next);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ detalhes: expect.any(Array) })
    );
  });

  it('multiple erros reportados juntos (abortEarly: false)', () => {
    const res = makeRes();
    middleware({ body: {} }, res, next); // sem valor, sem pagador
    const call = res.json.mock.calls[0][0];
    expect(call.detalhes.length).toBeGreaterThan(1);
  });
});

// ─── solicitarDevolucao ───────────────────────────────────────────────────────

describe('validate — solicitarDevolucao', () => {
  const middleware = validate('solicitarDevolucao');

  it('chama next() sem valor (devolução total)', () => {
    middleware({ body: {} }, makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('chama next() com valor positivo', () => {
    middleware({ body: { valor: 50 } }, makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('chama next() com valor decimal (2 casas)', () => {
    middleware({ body: { valor: 12.99 } }, makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('422 com valor negativo', () => {
    const res = makeRes();
    middleware({ body: { valor: -1 } }, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('422 com valor zero', () => {
    const res = makeRes();
    middleware({ body: { valor: 0 } }, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });
});

// ─── enviarPix ────────────────────────────────────────────────────────────────

describe('validate — enviarPix', () => {
  const middleware = validate('enviarPix');
  const bodyValido = { chave: 'destino@email.com', valor: 100 };

  it('chama next() com payload válido (chave + valor)', () => {
    middleware({ body: { ...bodyValido } }, makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('chama next() com descricao opcional', () => {
    middleware({ body: { ...bodyValido, descricao: 'Pagamento de serviço' } }, makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('422 sem campo chave', () => {
    const res = makeRes();
    middleware({ body: { valor: 100 } }, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('422 com chave vazia', () => {
    const res = makeRes();
    middleware({ body: { chave: '', valor: 100 } }, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('422 sem campo valor', () => {
    const res = makeRes();
    middleware({ body: { chave: 'dest@email.com' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('422 com valor zero', () => {
    const res = makeRes();
    middleware({ body: { chave: 'dest@email.com', valor: 0 } }, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('422 com valor negativo', () => {
    const res = makeRes();
    middleware({ body: { chave: 'dest@email.com', valor: -50 } }, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('422 com descricao acima de 140 caracteres', () => {
    const res = makeRes();
    middleware({ body: { ...bodyValido, descricao: 'x'.repeat(141) } }, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });
});

// ─── schema inexistente ───────────────────────────────────────────────────────

describe('validate — schema inexistente', () => {
  it('chama next() diretamente para schema não registrado', () => {
    validate('naoExiste')({ body: {} }, makeRes(), next);
    expect(next).toHaveBeenCalled();
  });
});
