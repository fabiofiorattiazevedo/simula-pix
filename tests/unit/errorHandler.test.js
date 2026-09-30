jest.mock('../../src/utils/logger', () => ({ error: jest.fn(), info: jest.fn() }));

const errorHandler = require('../../src/middlewares/errorHandler');

function makeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}
function makeReq(method = 'GET', path = '/test') {
  return { method, path };
}

describe('errorHandler', () => {
  it('409 para erro de chave duplicada MongoDB (code 11000)', () => {
    const res = makeRes();
    const err = new Error('E11000 duplicate key error');
    err.code = 11000;
    errorHandler(err, makeReq('POST', '/api/pix/cob'), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringMatching(/txid duplicado/i),
    }));
  });

  it('repassa status de erro HTTP do PSP', () => {
    const res = makeRes();
    const err = { message: 'Bad request', response: { status: 400, data: { message: 'invalid' } } };
    errorHandler(err, makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Erro na comunicação com o PSP',
    }));
  });

  it('502 quando resposta do PSP não tem status', () => {
    const res = makeRes();
    const err = { message: 'PSP error', response: { data: { msg: 'fail' } } };
    errorHandler(err, makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it('usa err.statusCode quando disponível', () => {
    const res = makeRes();
    const err = new Error('Not found');
    err.statusCode = 404;
    errorHandler(err, makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not found' });
  });

  it('usa err.status como fallback de statusCode', () => {
    const res = makeRes();
    const err = new Error('Forbidden');
    err.status = 403;
    errorHandler(err, makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('500 para erro genérico sem código', () => {
    const res = makeRes();
    errorHandler(new Error('boom'), makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'boom' });
  });

  it('mensagem genérica quando erro não tem message', () => {
    const res = makeRes();
    errorHandler({}, makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro interno do servidor' });
  });

  it('11000 tem prioridade sobre err.response', () => {
    const res = makeRes();
    const err = { code: 11000, message: 'dup', response: { status: 500, data: {} } };
    errorHandler(err, makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
  });
});
