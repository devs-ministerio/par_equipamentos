// so os TIPOS entram no bundle principal; jsPDF e o plugin de tabela sao
// carregados sob demanda dentro das funcoes gerarPdf*, no clique do usuario.
import type jsPDF from "jspdf";
import { formatMilhar, formatMultiplicador } from "./format";

/** Carrega jsPDF + plugin de tabela so quando alguem vai exportar de fato. */
async function carregarJsPdf() {
  const [{ default: JsPdf }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  return { JsPdf, autoTable };
}
import type {
  CoberturaRow,
  EstabelecimentoRow,
  Macrorregiao,
} from "../types/domain";
import type { ImagemCapturada } from "./capture-svg";

export interface CampoExport {
  key: string;
  label: string;
}

export const CAMPOS_COBERTURA: CampoExport[] = [
  { key: "codigo", label: "Código" },
  { key: "macro", label: "Macrorregião de saúde" },
  { key: "uf", label: "UF" },
  { key: "oferta", label: "Qtd. equipamentos" },
  { key: "pessoasPorTomografo", label: "Pessoas por equipamento" },
  { key: "multiplicador", label: "Multiplicador" },
  { key: "status", label: "Status" },
];

export const CAMPOS_ESTABELECIMENTO: CampoExport[] = [
  { key: "cnes", label: "CNES" },
  { key: "nome", label: "Nome do estabelecimento" },
  { key: "municipio", label: "Município" },
  { key: "uf", label: "UF" },
  { key: "macro", label: "Macrorregião" },
  { key: "qtd", label: "Qtd. equipamentos" },
  { key: "qtdUso", label: "Em uso" },
  { key: "sus", label: "SUS" },
  { key: "tipos", label: "Subtipos" },
];

export interface UfComMacros {
  uf: string;
  macros: { codigo: string; nome: string }[];
}

function cabecalho(doc: jsPDF, subtitulo: string, filtrosResumo: string) {
  doc.setFontSize(16);
  doc.setTextColor(20);
  doc.text("SIGEO — Cobertura de Equipamentos", 14, 16);
  doc.setFontSize(12);
  doc.text(subtitulo, 14, 24);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 30);
  doc.text(`Filtros aplicados: ${filtrosResumo || "Nenhum"}`, 14, 35);
}

function linhasCobertura(
  rows: CoberturaRow[],
  macros: Macrorregiao[],
  campos: Set<string>,
) {
  const macroById = new Map(macros.map((m) => [m.id, m]));
  const colunas = CAMPOS_COBERTURA.filter((c) => campos.has(c.key));
  const body = rows.map((r) => {
    const macro = macroById.get(r.macroId);
    const pessoasPorEquip = macro && r.oferta > 0 ? macro.pop / r.oferta : null;
    const valores: Record<string, string> = {
      codigo: macro?.id ?? "",
      macro: macro?.nome ?? "",
      uf: macro?.uf ?? "",
      oferta: String(r.oferta),
      pessoasPorTomografo:
        pessoasPorEquip != null ? `${formatMilhar(pessoasPorEquip)}/1` : "—",
      multiplicador: formatMultiplicador(r.cobertura / 100),
      status: r.status,
    };
    return colunas.map((c) => valores[c.key]);
  });
  return { colunas, body };
}

function linhasEstabelecimentos(
  rows: EstabelecimentoRow[],
  campos: Set<string>,
) {
  const colunas = CAMPOS_ESTABELECIMENTO.filter((c) => campos.has(c.key));
  const body = rows.map((e) => {
    const valores: Record<string, string> = {
      cnes: e.cnes,
      nome: e.nome,
      municipio: e.municipio,
      uf: e.uf,
      macro: e.macroId ?? "",
      qtd: String(e.qtd),
      qtdUso: String(e.qtdUso),
      sus: e.susFlag ? "Sim" : "Não",
      tipos: e.tipos.map((t) => `${t.tipo} (${t.qtd})`).join(", "),
    };
    return colunas.map((c) => valores[c.key]);
  });
  return { colunas, body };
}

interface GerarPdfParams {
  filtrosResumo: string;
  cobertura?: {
    rows: CoberturaRow[];
    macros: Macrorregiao[];
    campos: Set<string>;
  };
  estabelecimentos?: { rows: EstabelecimentoRow[]; campos: Set<string> };
}

/** Gera e baixa um PDF real (nao print da tela) com as tabelas e campos escolhidos no popup de exportacao. */
export async function gerarPdfTomografos(params: GerarPdfParams) {
  const { JsPdf, autoTable } = await carregarJsPdf();
  const doc = new JsPdf({ orientation: "landscape" });
  let primeiraPagina = true;

  if (params.cobertura) {
    cabecalho(
      doc,
      "Cobertura por macrorregião e equipamento",
      params.filtrosResumo,
    );
    primeiraPagina = false;

    const { colunas, body } = linhasCobertura(
      params.cobertura.rows,
      params.cobertura.macros,
      params.cobertura.campos,
    );
    autoTable(doc, {
      startY: 40,
      head: [colunas.map((c) => c.label)],
      body,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [22, 33, 62] },
    });
  }

  if (params.estabelecimentos) {
    if (!primeiraPagina) doc.addPage();
    cabecalho(doc, "Estabelecimentos", params.filtrosResumo);

    const { colunas, body } = linhasEstabelecimentos(
      params.estabelecimentos.rows,
      params.estabelecimentos.campos,
    );
    autoTable(doc, {
      startY: 40,
      head: [colunas.map((c) => c.label)],
      body,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [22, 33, 62] },
    });
  }

  doc.save("SIGEO-Equipamentos.pdf");
}

interface GerarPdfMapaParams {
  filtrosResumo: string;
  mapa: ImagemCapturada;
  ufsComMacros: UfComMacros[];
  cobertura: {
    rows: CoberturaRow[];
    macros: Macrorregiao[];
    campos: Set<string>;
  };
  estabelecimentos?: { rows: EstabelecimentoRow[]; campos: Set<string> };
}

/**
 * Variante do relatorio usada pelo botao PDF da aba Mapa: mapa do Brasil (a
 * mesma imagem colorida da tela, rasterizada) ao lado da lista de UFs com
 * suas macrorregioes de saude, e a tabela de cobertura embaixo.
 */
export async function gerarPdfMapa(params: GerarPdfMapaParams) {
  const { JsPdf, autoTable } = await carregarJsPdf();
  const doc = new JsPdf({ orientation: "landscape" });
  const margemEsquerda = 14;
  const margemDireita = 14;
  const larguraPagina = doc.internal.pageSize.getWidth();

  cabecalho(doc, "Mapa de cobertura por UF", params.filtrosResumo);

  const topoConteudo = 40;
  const larguraMapa = 150;
  const alturaMapa = larguraMapa / params.mapa.aspectRatio;
  doc.addImage(
    params.mapa.dataUrl,
    "PNG",
    margemEsquerda,
    topoConteudo,
    larguraMapa,
    alturaMapa,
  );

  const listaX = margemEsquerda + larguraMapa + 8;
  const larguraLista = larguraPagina - margemDireita - listaX;

  const corpoLista: string[][] = [];
  params.ufsComMacros.forEach(({ uf, macros }) => {
    if (macros.length === 0) {
      corpoLista.push([uf, "", "(sem macro cadastrada)"]);
      return;
    }
    // UF repetida em toda linha -- facilita ler/filtrar a lista fora do contexto
    macros.forEach((m) => corpoLista.push([uf, m.codigo, m.nome]));
  });

  let finalYLista = topoConteudo;
  autoTable(doc, {
    startY: topoConteudo,
    margin: { left: listaX, right: margemDireita },
    tableWidth: larguraLista,
    head: [["UF", "Código", "Macrorregião de saúde"]],
    body: corpoLista,
    styles: { fontSize: 7 },
    headStyles: { fillColor: [22, 33, 62] },
    didDrawPage: (data) => {
      if (data.cursor) finalYLista = Math.max(finalYLista, data.cursor.y);
    },
  });

  const topoCobertura = Math.max(topoConteudo + alturaMapa, finalYLista) + 10;
  doc.setFontSize(12);
  doc.setTextColor(20);
  doc.text(
    "Cobertura por macrorregião e equipamento",
    margemEsquerda,
    topoCobertura - 4,
  );

  const { colunas, body } = linhasCobertura(
    params.cobertura.rows,
    params.cobertura.macros,
    params.cobertura.campos,
  );
  autoTable(doc, {
    startY: topoCobertura,
    head: [colunas.map((c) => c.label)],
    body,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [22, 33, 62] },
  });

  if (params.estabelecimentos) {
    doc.addPage();
    cabecalho(doc, "Estabelecimentos", params.filtrosResumo);
    const { colunas: colunasEstab, body: bodyEstab } = linhasEstabelecimentos(
      params.estabelecimentos.rows,
      params.estabelecimentos.campos,
    );
    autoTable(doc, {
      startY: 40,
      head: [colunasEstab.map((c) => c.label)],
      body: bodyEstab,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [22, 33, 62] },
    });
  }

  doc.save("SIGEO-Mapa-Equipamentos.pdf");
}
