import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';
import { requisitar } from '@/lib/http-client';
import { apiAuthed, apiGetAuthed } from './monitoramento-client';
import {
  criarInstrumento,
  editarEvento,
  excluirEvento,
  fetchInstrumentoTimeline,
  fetchInstrumentos,
  patchCadastroInstrumento,
  registrarEvento,
} from './monitoramento-instrumentos';

vi.mock('@/lib/http-client', () => ({ requisitar: vi.fn() }));
vi.mock('./monitoramento-client', () => ({ apiAuthed: vi.fn(), apiGetAuthed: vi.fn() }));

const INSTRUMENTO = {
  id: 1,
  nr_convenio: '953749',
  cnpj_convenente: null,
  nome_convenente: 'Hospital de teste',
  municipio: 'Brasília',
  uf: 'DF',
  cnes: null,
  equipamento_descricao: 'Tomógrafo',
  equipamento_marca: null,
  equipamento_modelo: null,
  equipamento_numero_serie: null,
  equipamento_vida_util_anos: null,
  programa: null,
  tp_instrumento_programa: null,
  componente: null,
  ano_instrumento: null,
  tipo_contratacao: 'Convênio',
  origem_dado: null,
  tipologia: null,
  investimento_aquisicao: null,
  situacao_programa: null,
  natureza_servico: null,
  tecnico_titular: null,
  tecnico_suplente: null,
  nivel_monitoramento: null,
  modalidade_onco: null,
  responsavel_execucao_nome: null,
  responsavel_execucao_contato: null,
  situacao_prestacao_contas: null,
  situacao_parceria_transferegov: null,
  situacao_ordem_pagamento_transferegov: null,
};

const EVENTO = {
  id: 10,
  marco_id: 2,
  fase_geral_id: 1,
  data_ocorrencia: '2026-09-24',
  data_prevista: null,
  status_regulatorio: null,
  numero_documento: null,
  data_validade: null,
  observacao: null,
  created_at: '2026-09-24T10:00:00Z',
};

describe('service de instrumentos monitorados', () => {
  beforeEach(() => vi.clearAllMocks());

  it('consulta a lista autenticada', async () => {
    vi.mocked(apiGetAuthed).mockResolvedValueOnce([INSTRUMENTO]);

    await expect(fetchInstrumentos()).resolves.toEqual([INSTRUMENTO]);
    expect(apiGetAuthed).toHaveBeenCalledWith('/monitoramento/instrumentos', expect.anything());
  });

  it('encaminha criação, cadastro e eventos com a rota e método corretos', async () => {
    vi.mocked(apiAuthed).mockResolvedValue(INSTRUMENTO);
    const criar = { nr_convenio: '953749', cnpj_convenente: '00000000000100', nome_convenente: 'Hospital de teste', tipo_contratacao: 'Convênio' };

    await criarInstrumento(criar);
    await patchCadastroInstrumento('953749', { tecnico_titular: 'Técnica' });
    await registrarEvento('953749', { marco_id: 2, data_ocorrencia: '2026-09-24' });
    await editarEvento(10, { observacao: 'Correção' });
    await excluirEvento(10, 'Registro duplicado');

    expect(apiAuthed).toHaveBeenNthCalledWith(1, '/monitoramento/instrumentos', expect.anything(), 'POST', criar);
    expect(apiAuthed).toHaveBeenNthCalledWith(2, '/monitoramento/instrumentos/953749', expect.anything(), 'PATCH', { tecnico_titular: 'Técnica' });
    expect(apiAuthed).toHaveBeenNthCalledWith(3, '/monitoramento/instrumentos/953749/eventos', expect.anything(), 'POST', { marco_id: 2, data_ocorrencia: '2026-09-24' });
    expect(apiAuthed).toHaveBeenNthCalledWith(4, '/monitoramento/eventos/10', expect.anything(), 'PATCH', { observacao: 'Correção' });
    expect(apiAuthed).toHaveBeenNthCalledWith(5, '/monitoramento/eventos/10', expect.anything(), 'DELETE', { motivo: 'Registro duplicado' });
  });

  it('devolve a linha do tempo da API quando o instrumento existe', async () => {
    const timeline = { instrumento: INSTRUMENTO, ao_vivo: { disponivel: false }, eventos: [EVENTO] };
    vi.mocked(requisitar).mockResolvedValueOnce(timeline);

    await expect(fetchInstrumentoTimeline('953749')).resolves.toEqual(timeline);
    expect(requisitar).toHaveBeenCalledWith('/monitoramento/instrumentos/953749', expect.anything(), undefined);
  });

  it('considera 404 como instrumento ainda não monitorado', async () => {
    vi.mocked(requisitar).mockRejectedValueOnce(new ApiError('Não encontrado', 404));

    await expect(fetchInstrumentoTimeline('nao-monitorado')).resolves.toBeNull();
  });

  it('preserva erro diferente de 404 da linha do tempo', async () => {
    const erro = new ApiError('Servidor indisponível', 503);
    vi.mocked(requisitar).mockRejectedValueOnce(erro);

    await expect(fetchInstrumentoTimeline('953749')).rejects.toBe(erro);
  });
});
