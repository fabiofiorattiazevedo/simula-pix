jest.mock('../../src/config/psp');

const dictService = require('../../src/services/dictService');
const { createPSPClient } = require('../../src/config/psp');
const { generateCPF, generateCNPJ, generateEVP } = require('../helpers/builders');

function mockPspGet(responseData) {
  const client = { get: jest.fn().mockResolvedValue({ data: responseData }) };
  createPSPClient.mockReturnValue(client);
  return client;
}

function mpDictResponse(chave, tipo) {
  return {
    key: chave,
    key_type: tipo,
    account: {
      ispb: '12345678',
      branch: '0001',
      number: '12345-6',
      type: 'CACC',
      owner: { name: 'Maria da Silva' },
    },
  };
}

beforeEach(() => jest.clearAllMocks());

// ─── detectKeyType ────────────────────────────────────────────────────────────

describe('detectKeyType', () => {
  it('detecta CPF (11 dígitos numéricos)', () => {
    expect(dictService.detectKeyType('12345678901')).toBe('CPF');
  });

  it('detecta CNPJ (14 dígitos numéricos)', () => {
    expect(dictService.detectKeyType('12345678000190')).toBe('CNPJ');
  });

  it('detecta EMAIL', () => {
    expect(dictService.detectKeyType('usuario@banco.com.br')).toBe('EMAIL');
  });

  it('detecta TELEFONE com prefixo +55 e 10 dígitos', () => {
    expect(dictService.detectKeyType('+5511999998888')).toBe('PHONE');
  });

  it('detecta TELEFONE com prefixo +55 e 11 dígitos', () => {
    expect(dictService.detectKeyType('+551199999888')).toBe('PHONE');
  });

  it('detecta chave aleatória EVP (UUID v4)', () => {
    expect(dictService.detectKeyType(generateEVP())).toBe('EVP');
  });

  it('retorna null para chave vazia', () => {
    expect(dictService.detectKeyType('')).toBeNull();
  });

  it('retorna null para chave com caracteres especiais inválidos', () => {
    expect(dictService.detectKeyType('@@invalida@@')).toBeNull();
  });

  it('retorna null para telefone sem prefixo +55', () => {
    // "+5511" tem só 2 dígitos após 55 — não atinge 10
    expect(dictService.detectKeyType('+5511')).toBeNull();
  });

  it('retorna null para string aleatória curta', () => {
    expect(dictService.detectKeyType('abc')).toBeNull();
  });
});

// ─── consultarChave — positivos ───────────────────────────────────────────────

describe('consultarChave — positivos', () => {
  it('[CPF] retorna dados mascarados: documento não revela o CPF completo', async () => {
    const cpf = generateCPF();
    mockPspGet(mpDictResponse(cpf, 'CPF'));

    const result = await dictService.consultarChave(cpf);

    expect(result.tipo).toBe('CPF');
    expect(result.chave).toBe(cpf);
    expect(result.portador.documento).not.toBe(cpf);
    expect(result.portador.documento).toMatch(/\*/);
    expect(result.portador.nome).toBe('Maria da Silva');
    expect(result.conta.ispb).toBe('12345678');
  });

  it('[CNPJ] retorna dados mascarados', async () => {
    const cnpj = generateCNPJ();
    mockPspGet(mpDictResponse(cnpj, 'CNPJ'));

    const result = await dictService.consultarChave(cnpj);

    expect(result.tipo).toBe('CNPJ');
    expect(result.portador.documento).not.toBe(cnpj);
    expect(result.portador.documento).toMatch(/\*/);
  });

  it('[EMAIL] mascara usuário mantendo domínio visível', async () => {
    const email = 'joao.silva@empresa.com.br';
    mockPspGet(mpDictResponse(email, 'EMAIL'));

    const result = await dictService.consultarChave(email);

    expect(result.tipo).toBe('EMAIL');
    expect(result.portador.documento).toMatch(/@empresa\.com\.br/);
    expect(result.portador.documento).not.toBe(email);
    expect(result.portador.documento).toMatch(/\*/);
  });

  it('[TELEFONE] mascara número mantendo prefixo e sufixo', async () => {
    const phone = '+5511999998888';
    mockPspGet(mpDictResponse(phone, 'PHONE'));

    const result = await dictService.consultarChave(phone);

    expect(result.tipo).toBe('PHONE');
    expect(result.portador.documento).toContain('****');
    expect(result.portador.documento).not.toBe(phone);
  });

  it('[EVP] retorna a chave sem mascaramento adicional (UUID já é pseudônimo)', async () => {
    const evp = generateEVP();
    mockPspGet(mpDictResponse(evp, 'EVP'));

    const result = await dictService.consultarChave(evp);

    expect(result.tipo).toBe('EVP');
    expect(result.chave).toBe(evp);
    expect(result.portador.documento).toBe(evp);
  });

  it('retorna dados da conta bancária (ispb, agencia, numero, tipo)', async () => {
    const cpf = generateCPF();
    mockPspGet(mpDictResponse(cpf, 'CPF'));

    const result = await dictService.consultarChave(cpf);

    expect(result.conta).toMatchObject({
      ispb: '12345678',
      agencia: '0001',
      numero: '12345-6',
      tipo: 'CACC',
    });
  });

  it('usa "Portador" como nome quando PSP não retorna owner', async () => {
    const cpf = generateCPF();
    const client = {
      get: jest.fn().mockResolvedValue({
        data: { account: { ispb: '000', branch: '0', number: '0', type: 'CACC' } },
      }),
    };
    createPSPClient.mockReturnValue(client);

    const result = await dictService.consultarChave(cpf);

    expect(result.portador.nome).toBe('Portador');
  });
});

// ─── consultarChave — negativos ───────────────────────────────────────────────

describe('consultarChave — negativos', () => {
  it('[400] chave com caracteres especiais inválidos', async () => {
    await expect(dictService.consultarChave('@@invalida@@'))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/inválida|malformada/i) });
    expect(createPSPClient).not.toHaveBeenCalled();
  });

  it('[400] chave vazia', async () => {
    await expect(dictService.consultarChave(''))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('[400] telefone malformado sem dígitos suficientes', async () => {
    await expect(dictService.consultarChave('+5511'))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('[404] chave inexistente no DICT', async () => {
    const client = {
      get: jest.fn().mockRejectedValue({
        response: { status: 404, data: { message: 'Key not found' } },
      }),
    };
    createPSPClient.mockReturnValue(client);

    await expect(dictService.consultarChave('naoexiste@email.com'))
      .rejects.toMatchObject({
        statusCode: 404,
        message: expect.stringMatching(/não encontrada/i),
      });
  });

  it('propaga erros do PSP diferentes de 404 sem envolver em 404', async () => {
    const client = {
      get: jest.fn().mockRejectedValue({
        response: { status: 503, data: { error: 'unavailable' } },
      }),
    };
    createPSPClient.mockReturnValue(client);

    await expect(dictService.consultarChave('teste@email.com'))
      .rejects.toMatchObject({ response: { status: 503 } });
  });

  it('propaga timeout sem converter em 404', async () => {
    const client = {
      get: jest.fn().mockRejectedValue(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' })),
    };
    createPSPClient.mockReturnValue(client);

    const err = await dictService.consultarChave('teste@email.com').catch(e => e);
    expect(err.code).toBe('ECONNABORTED');
    expect(err.statusCode).toBeUndefined();
  });
});
