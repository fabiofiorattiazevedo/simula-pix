const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test-secret-auth';
process.env.JWT_SECRET = JWT_SECRET;

const authMiddleware = require('../../src/middlewares/auth');

function makeReq(authHeader) {
  return { headers: { authorization: authHeader } };
}
function makeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

describe('auth middleware', () => {
  const next = jest.fn();
  beforeEach(() => next.mockClear());

  it('chama next() e popula req.user com token válido', () => {
    const token = jwt.sign({ id: 'user1', role: 'admin' }, JWT_SECRET);
    const req = makeReq(`Bearer ${token}`);
    authMiddleware(req, makeRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.user.id).toBe('user1');
    expect(req.user.role).toBe('admin');
  });

  it('401 quando Authorization está ausente', () => {
    const res = makeRes();
    authMiddleware(makeReq(undefined), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringMatching(/ausente/i) }));
    expect(next).not.toHaveBeenCalled();
  });

  it('401 sem prefixo "Bearer "', () => {
    const token = jwt.sign({ id: 'user1' }, JWT_SECRET);
    const res = makeRes();
    authMiddleware(makeReq(token), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('401 com prefixo errado (Basic)', () => {
    const res = makeRes();
    authMiddleware(makeReq('Basic dXNlcjpwYXNz'), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('401 com token malformado', () => {
    const res = makeRes();
    authMiddleware(makeReq('Bearer token.invalido.xyz'), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringMatching(/inválido|expirado/i) }));
  });

  it('401 com token assinado com secret errado', () => {
    const token = jwt.sign({ id: 'user1' }, 'outro-secret');
    const res = makeRes();
    authMiddleware(makeReq(`Bearer ${token}`), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('401 com token expirado', () => {
    const token = jwt.sign({ id: 'user1' }, JWT_SECRET, { expiresIn: -1 });
    const res = makeRes();
    authMiddleware(makeReq(`Bearer ${token}`), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('401 com string vazia no lugar do token', () => {
    const res = makeRes();
    authMiddleware(makeReq('Bearer '), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
