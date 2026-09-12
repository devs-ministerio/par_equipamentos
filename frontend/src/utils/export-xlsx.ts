// so os TIPOS entram no bundle principal (somem na compilacao). A biblioteca
// em si (~950 KB) e carregada sob demanda dentro de gerarXlsxTomografos, no
// clique do usuario -- exportar e acao rara, nao faz sentido pesar o
// carregamento inicial de quem so quer ver a tela.
import type ExcelJS from 'exceljs';
import type { CoberturaRow, EstabelecimentoRow, Macrorregiao } from '../types/domain';
import { getEquipamento } from '../data/constants';

export interface CampoXlsx {
  key: string;
  label: string;
}

/** Campos selecionaveis da aba "Cobertura por macrorregiao". */
export const CAMPOS_XLSX_COBERTURA: CampoXlsx[] = [
  { key: 'nivel', label: 'Nível' },
  { key: 'macroCodigo', label: 'Cód. macrorregião' },
  { key: 'macroNome', label: 'Macrorregião de saúde' },
  { key: 'uf', label: 'UF' },
  { key: 'regiaoCodigo', label: 'Cód. região de saúde' },
  { key: 'regiaoNome', label: 'Região de saúde' },
  { key: 'municipio', label: 'Município' },
  { key: 'macroPopulacao', label: 'População da macrorregião' },
  { key: 'macroTomografos', label: 'Equipamentos em uso SUS da macrorregião' },
  { key: 'macroMultiplicador', label: 'Multiplicador da meta (macrorregião)' },
  { key: 'macroStatus', label: 'Status da macrorregião' },
  { key: 'estabelecimentos', label: 'Estabelecimentos (nesta linha)' },
  { key: 'tomografos', label: 'Equipamentos (nesta linha)' },
];

/** Campos selecionaveis da aba "Estabelecimento por equipamento". */
export const CAMPOS_XLSX_ESTABELECIMENTO: CampoXlsx[] = [
  { key: 'cnes', label: 'CNES' },
  { key: 'nome', label: 'Nome do estabelecimento' },
  { key: 'municipio', label: 'Município' },
  { key: 'uf', label: 'UF' },
  { key: 'macroCodigo', label: 'Cód. macrorregião' },
  { key: 'macroNome', label: 'Macrorregião de saúde' },
  { key: 'regiaoCodigo', label: 'Cód. região de saúde' },
  { key: 'regiaoNome', label: 'Região de saúde' },
  { key: 'qtd', label: 'Qtd. equipamentos' },
  { key: 'qtdUso', label: 'Em uso' },
  { key: 'sus', label: 'SUS' },
  { key: 'tipos', label: 'Subtipos (canais)' },
];

/** Texto do "Parâmetro normativo" da aba Metodologia -- especifico por
 * familia (o criterio de verdade muda, nao so o nome do equipamento: RN da
 * TOMOGRAFO e raio/populacao, a de RESSONANCIA e produtividade de exames).
 * Mesmos fatos ja aprovados em PARAMETROS_POR_FAMILIA (MetodologiaPage.tsx),
 * so em texto plano (celula de planilha nao aceita JSX) e com "equipamento"
 * generico no lugar do nome da familia (decisao 2026-08-22). Bug real
 * corrigido 2026-08-21: essa celula sempre mostrava a regra do TOMOGRAFO
 * (100 mil hab./75 km), mesmo exportando Ressonância. */
function parametroNormativoTexto(equipmentFamily: string): string {
  if (equipmentFamily === 'RESSONANCIA') {
    return (
      '5.000 exames/ano de capacidade por equipamento, com necessidade estimada de 30 exames/1.000 habitantes/ano ' +
      '(equivalente a 1 equipamento a cada ~166.667 habitantes).'
    );
  }
  return '1 equipamento para cada 100 mil habitantes, ou raio de 75 km (o que for atingido primeiro).';
}

const AZUL_ESCURO = 'FF16213E';
const AZUL_FORTE = 'FF1F4E9C'; // faixa do titulo (aba Metodologia)
const AZUL_CLARO = 'FFDCE6F5'; // faixa dos subtitulos (aba Metodologia)
const AZUL_LINK = 'FF0563C1';

interface GerarXlsxParams {
  equipmentFamily: string;
  filtrosResumo: string;
  cobertura?: {
    rows: CoberturaRow[];
    macros: Macrorregiao[];
    estabelecimentos: EstabelecimentoRow[];
    campos: Set<string>;
  };
  estabelecimentos?: { rows: EstabelecimentoRow[]; campos: Set<string> };
}

function dataArquivo(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}

const BORDA: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
  left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
  bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
  right: { style: 'thin', color: { argb: 'FFBFBFBF' } },
};

/**
 * Aba 1 -- instrucional, no padrao das planilhas de criterio do DECAN:
 * faixa azul no topo, grade com bordas, rotulo em negrito centralizado na
 * esquerda e o conteudo/fonte alinhado a esquerda na direita.
 */
function montarAbaMetodologia(wb: ExcelJS.Workbook, filtrosResumo: string, equipmentFamily: string) {
  const produtividade = getEquipamento(equipmentFamily).produtividade;
  const ws = wb.addWorksheet('Metodologia');
  ws.columns = [{ width: 62 }, { width: 88 }];

  // faixa azul forte do titulo
  const cabecalho = ws.addRow(['EQUIPAMENTOS', 'FONTES']);
  cabecalho.height = 22;
  cabecalho.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_FORTE } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = BORDA;
  });

  /** faixa azul clara -- separa as secoes dentro da aba */
  const subtitulo = (texto: string) => {
    const r = ws.addRow([texto, '']);
    r.height = 18;
    ws.mergeCells(`A${r.number}:B${r.number}`);
    r.eachCell((c) => {
      c.font = { bold: true, color: { argb: AZUL_ESCURO }, size: 10.5 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_CLARO } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border = BORDA;
    });
    return r;
  };

  /** linha padrao: rotulo (negrito, centralizado) | conteudo (esquerda, quebra) */
  const linha = (rotulo: string, conteudo?: string | { texto: string; url: string }) => {
    const r = ws.addRow([rotulo, typeof conteudo === 'string' ? conteudo : conteudo?.texto ?? '']);
    const esq = r.getCell(1);
    const dir = r.getCell(2);

    esq.font = { bold: true, size: 10 };
    esq.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    esq.border = BORDA;

    dir.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    dir.border = BORDA;
    if (conteudo && typeof conteudo !== 'string') {
      dir.value = { text: conteudo.url, hyperlink: conteudo.url } as ExcelJS.CellValue;
      dir.font = { color: { argb: AZUL_LINK }, underline: true, size: 10 };
    } else {
      dir.font = { size: 10 };
    }
    return r;
  };

  subtitulo('CRITÉRIO DE AVALIAÇÃO - MACRORREGIÃO DE SAÚDE');
  linha('Como posso verificar a qual macrorregião de saúde o estabelecimento pertence?', {
    texto: 'Macrorregiões de Saúde — DEMAS',
    url: 'https://infoms.saude.gov.br/extensions/SEIDIGI_DEMAS_MACRORREGIOES/SEIDIGI_DEMAS_MACRORREGIOES.html',
  });
  linha(
    'Você também pode acessar a aba ESTABELECIMENTO POR EQUIPAMENTO nesta planilha, que traz a macrorregião e a região de saúde de cada CNES.',
  );

  subtitulo('PARÂMETRO E FONTES DE DADOS');
  linha('Parâmetro normativo', parametroNormativoTexto(equipmentFamily));
  linha('Fonte do parâmetro', {
    texto: 'Critérios e Parâmetros Assistenciais SUS — 2017 — Caderno 1',
    url: 'https://www.gov.br/saude/pt-br/acesso-a-informacao/gestao-do-sus/programacao-regulacao-controle-e-financiamento-da-mac/programacao-assistencial/arquivos/caderno-1-criterios-e-parametros-assistenciais-1-revisao.pdf',
  });
  linha('População estimada', 'População residente estimada por município, somada por macrorregião de saúde.');
  linha('Fonte da população', {
    texto: 'IBGE / SIDRA — população residente estimada',
    url: 'https://sidra.ibge.gov.br/tabela/6579',
  });
  linha(
    'Número de Equipamentos',
    'Quantidade cadastrada no CNES. Considera apenas os equipamentos marcados como SUS (decisão D-02: qt_existente_sus); equipamentos privados não entram no cálculo de cobertura.',
  );
  linha('Fonte dos equipamentos', {
    // sem VCod_Equip -- mesma URL generica (por familia) ja usada e aprovada
    // em MetodologiaPage.tsx (FonteItem #3), pra nao inventar o codigo certo
    // de cada familia aqui.
    texto: 'CNES — Módulo de Equipamentos',
    url: 'https://cnes2.datasus.gov.br/Mod_Ind_Equipamentos_Listar.asp?VTipo_Equip=1%20&VListar=1&VEstado=00&VMun=&VComp=',
  });

  subtitulo('COMO LER OS INDICADORES');
  linha(
    'MULTIPLICADOR DA META',
    'Quantas vezes a macrorregião tem a mais (ou a menos) da quantidade exigida pelo parâmetro. Ex.: 3,90x indica quase 4 vezes o exigido. Quanto maior o multiplicador, maior a capacidade ociosa, ou seja, mais vaga disponível para atender demanda adicional.',
  );
  linha(
    'CLASSIFICAÇÃO',
    `Após aplicar o parâmetro, se a macrorregião tiver até ${produtividade.toLocaleString('pt-BR')} habitantes por aparelho a planilha marca HIPERSSUFICIENTE; acima disso marca HIPOSSUFICIENTE.`,
  );

  subtitulo('PONTOS DE ATENÇÃO E ATUALIZAÇÃO');
  linha(
    'Pontos de atenção',
    'Mesmo classificada como hiperssuficiente, vale verificar casos específicos. Ex.: uma macrorregião com folga pode absorver demanda de macrorregiões vizinhas hipossuficientes, desde que a distância permita o deslocamento do paciente.',
  );
  linha(
    'Nota sobre o denominador',
    'O denominador é a população total do território, não uma estimativa de população SUS-dependente. O parâmetro normativo do Ministério da Saúde não faz essa segmentação — trabalha com cobertura populacional plena (lógica PDR).',
  );
  linha(
    'ATUALIZAÇÃO',
    'Os dados de equipamentos acompanham a competência publicada pelo CNES e a população acompanha a estimativa mais recente do IBGE. A planilha é atualizada conforme novas competências forem liberadas.',
  );

  subtitulo('SOBRE ESTA EXPORTAÇÃO');
  linha('Filtros aplicados', filtrosResumo || 'Nenhum filtro — planilha com os dados completos.');
}

function estiloCabecalho(ws: ExcelJS.Worksheet) {
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_ESCURO } };
  head.alignment = { vertical: 'middle', wrapText: true };
  head.height = 30;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

/**
 * Aba 2 -- cobertura achatada ate municipio, com agrupamento (+/-) do Excel.
 * Colunas do pai sao repetidas em toda linha (analise/tabela dinamica
 * funcionam), mas nomeadas explicitamente "da macrorregiao" pra deixar claro
 * que sao atributo do pai e nao devem ser somadas por linha.
 */
function montarAbaCobertura(
  wb: ExcelJS.Workbook,
  dados: NonNullable<GerarXlsxParams['cobertura']>,
) {
  const { rows, macros, estabelecimentos, campos } = dados;
  const colunas = CAMPOS_XLSX_COBERTURA.filter((c) => campos.has(c.key));
  const ws = wb.addWorksheet('Cobertura por macrorregião');
  ws.columns = colunas.map((c) => ({
    header: c.label,
    key: c.key,
    width: c.key === 'macroNome' || c.key === 'regiaoNome' || c.key === 'municipio' ? 32 : 18,
  }));
  estiloCabecalho(ws);

  const macroById = new Map(macros.map((m) => [m.id, m]));

  // agrupa estabelecimentos: macro -> regiao de saude -> municipio
  const porMacro = new Map<string, Map<string, { nome: string; municipios: Map<string, { estab: number; tomo: number }> }>>();
  estabelecimentos.forEach((e) => {
    if (!e.macroId) return;
    if (!porMacro.has(e.macroId)) porMacro.set(e.macroId, new Map());
    const regioes = porMacro.get(e.macroId)!;
    const codRegiao = e.regiaoSaudeId ?? '(sem região)';
    if (!regioes.has(codRegiao)) {
      regioes.set(codRegiao, { nome: e.regiaoSaudeNome ?? 'Sem região de saúde', municipios: new Map() });
    }
    const regiao = regioes.get(codRegiao)!;
    const mun = regiao.municipios.get(e.municipio) ?? { estab: 0, tomo: 0 };
    mun.estab += 1;
    mun.tomo += e.qtd;
    regiao.municipios.set(e.municipio, mun);
  });

  const linhaValores = (v: Record<string, string | number | null>) =>
    colunas.map((c) => v[c.key] ?? null);

  rows
    .slice()
    .sort((a, b) => {
      const ma = macroById.get(a.macroId);
      const mb = macroById.get(b.macroId);
      return (ma?.uf ?? '').localeCompare(mb?.uf ?? '') || (ma?.nome ?? '').localeCompare(mb?.nome ?? '');
    })
    .forEach((r) => {
      const macro = macroById.get(r.macroId);
      if (!macro) return;
      const base = {
        macroCodigo: macro.id,
        macroNome: macro.nome,
        uf: macro.uf,
        macroPopulacao: macro.pop,
        macroTomografos: r.oferta,
        macroMultiplicador: Math.round((r.cobertura / 100) * 100) / 100,
        macroStatus: r.status,
      };

      const linhaMacro = ws.addRow(
        linhaValores({ ...base, nivel: 'Macrorregião', estabelecimentos: null, tomografos: r.oferta }),
      );
      linhaMacro.font = { bold: true };
      linhaMacro.outlineLevel = 0;

      const regioes = porMacro.get(r.macroId);
      if (!regioes) return;

      [...regioes.entries()]
        .sort(([, a], [, b]) => a.nome.localeCompare(b.nome))
        .forEach(([codRegiao, regiao]) => {
          const totEstab = [...regiao.municipios.values()].reduce((s, m) => s + m.estab, 0);
          const totTomo = [...regiao.municipios.values()].reduce((s, m) => s + m.tomo, 0);
          const linhaRegiao = ws.addRow(
            linhaValores({
              ...base,
              nivel: 'Região de saúde',
              regiaoCodigo: codRegiao,
              regiaoNome: regiao.nome,
              estabelecimentos: totEstab,
              tomografos: totTomo,
            }),
          );
          linhaRegiao.outlineLevel = 1;
          linhaRegiao.getCell(1).font = { color: { argb: AZUL_ESCURO } };

          [...regiao.municipios.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .forEach(([municipio, m]) => {
              const linhaMun = ws.addRow(
                linhaValores({
                  ...base,
                  nivel: 'Município',
                  regiaoCodigo: codRegiao,
                  regiaoNome: regiao.nome,
                  municipio,
                  estabelecimentos: m.estab,
                  tomografos: m.tomo,
                }),
              );
              linhaMun.outlineLevel = 2;
            });
        });
    });

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };
}

/** Aba 3 -- um estabelecimento por linha; o drill-down de subtipo vira coluna. */
function montarAbaEstabelecimentos(
  wb: ExcelJS.Workbook,
  dados: NonNullable<GerarXlsxParams['estabelecimentos']>,
) {
  const colunas = CAMPOS_XLSX_ESTABELECIMENTO.filter((c) => dados.campos.has(c.key));
  const ws = wb.addWorksheet('Estabelecimento por equipamento');
  ws.columns = colunas.map((c) => ({
    header: c.label,
    key: c.key,
    width: c.key === 'nome' ? 44 : c.key === 'tipos' ? 34 : c.key === 'municipio' || c.key === 'macroNome' || c.key === 'regiaoNome' ? 28 : 16,
  }));
  estiloCabecalho(ws);

  dados.rows.forEach((e) => {
    const v: Record<string, string | number | null> = {
      cnes: e.cnes,
      nome: e.nome,
      municipio: e.municipio,
      uf: e.uf,
      macroCodigo: e.macroId,
      macroNome: e.macroNome ?? null,
      regiaoCodigo: e.regiaoSaudeId,
      regiaoNome: e.regiaoSaudeNome,
      qtd: e.qtd,
      qtdUso: e.qtdUso,
      sus: e.susFlag ? 'Sim' : 'Não',
      tipos: e.tipos.map((t) => `${t.tipo} (${t.qtd})`).join(', '),
    };
    ws.addRow(colunas.map((c) => v[c.key] ?? null));
  });

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };
}

/** Gera e baixa a planilha completa (Metodologia + abas de dados escolhidas). */
export async function gerarXlsxTomografos(params: GerarXlsxParams): Promise<void> {
  // carrega a biblioteca so agora (ver comentario do import no topo)
  const { default: ExcelJSRuntime } = await import('exceljs');

  const wb = new ExcelJSRuntime.Workbook();
  wb.creator = 'SIEO — Análise de Méritos';
  wb.created = new Date();

  montarAbaMetodologia(wb, params.filtrosResumo, params.equipmentFamily);
  if (params.cobertura) montarAbaCobertura(wb, params.cobertura);
  if (params.estabelecimentos) montarAbaEstabelecimentos(wb, params.estabelecimentos);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Analise de Meritos - Equipamentos - ${dataArquivo()}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
