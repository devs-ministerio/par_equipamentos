/** Card de convenio -- 2 camadas de informacao, nao 1 accordion escondendo
 * tudo atras de 1 clique (feedback direto: o que mais importa pra
 * escanear -- status, objeto, grade financeira -- precisa aparecer sem
 * clicar em nada, so o dado tecnico profundo (SICONV/TransfereGov/
 * monitoramento) fica atras de "Ver mais detalhes"). Camada 1 sempre
 * visivel: identificacao, status, objeto, financeiro (`ConvenioCardHeader`).
 * Camada 2 (collapse proprio, so essa parte): dados aninhados
 * (`ConvenioCardDetalhes`) -- ambas extraidas pra arquivo proprio (Secao 6
 * da migracao: componente >200 linhas). */
import { useState } from 'react';
import { colors } from '@/styles/tokens';
import type { ConvenioUnificado, ProgramaTransfereGov } from '@/types/monitoramento';
import { estiloCard } from './monitoramento-ui';
import { ConvenioCardHeader } from './convenio-card-header';
import { ConvenioCardDetalhes } from './convenio-card-detalhes';

export function ConvenioCard({
  c, monitorado = false, equipamentos = [], programas,
}: {
  c: ConvenioUnificado;
  monitorado?: boolean;
  /** Tags de equipamento (ver equipamentoTags.ts) -- mostradas em destaque
   * na camada 1, pedido direto do usuario (2026-09-08). */
  equipamentos?: string[];
  /** id_programa -> nome, ver types.ts::ProgramaTransfereGov. So a
   * proposta do TransfereGov carrega o id cru, sem nome. */
  programas?: Map<number, ProgramaTransfereGov>;
}) {
  const siconv = c.siconv;
  const transferegov = c.transferegov;
  // So controla a camada 2 (dado tecnico aninhado) -- a camada 1 (status/
  // objeto/financeiro) e sempre renderizada, nao precisa de estado.
  const [detalheAberto, setDetalheAberto] = useState(false);

  // Programa -- so API. Preferencia: SICONV (`siconv.programa`, exato por
  // ID_PROPOSTA -- achado 2026-09-08) sobre TransfereGov (proposta ligada
  // por CNPJ, resolvida por id_programa -- aproximacao). Nunca vem do
  // monitoramento interno (decisao do usuario 2026-09-08 -- aquilo e
  // planilha da equipe, nao API).
  const programaSiconv = siconv?.programa?.NOME_PROGRAMA || null;
  const programaTransfereGov = transferegov
    ? programas?.get(Number((transferegov.propostas_expandidas[0]?.proposta as Record<string, unknown> | undefined)?.id_programa))
    : undefined;
  const programaTransfereGovNome = programaTransfereGov
    ? `${programaTransfereGov.nm_programa}${programaTransfereGov.ano_programa ? ` (${programaTransfereGov.ano_programa})` : ''}`
    : null;

  // Valor pago ao fornecedor -- soma de VL_PAGO (siconv_pagamento, aba
  // Fornecedores abaixo) achado 2026-09-09. VL_PAGO usa virgula decimal
  // ("3326,73"), diferente dos VL_*_CONV (ponto). null quando o convenio
  // nao tem nenhum pagamento registrado (nem todo convenio ja desembolsou
  // pro fornecedor -- ver guia-dados-siconv.md).
  const pagamentos = siconv?.pagamentos ?? [];
  const valorPagoFornecedor = pagamentos.length
    ? pagamentos.reduce((soma, p) => soma + (Number((p.VL_PAGO || '0').replace(',', '.')) || 0), 0)
    : null;

  return (
    <div
      style={{
        ...estiloCard,
        marginBottom: 12,
        // Convenio com monitoramento interno ativo ganha destaque visual --
        // e o unico dado editavel da pagina, precisa ser achavel sem abrir
        // card por card (ver useInstrumentosMonitorados.ts).
        borderLeft: monitorado ? `3px solid ${colors.hiperGreen}` : estiloCard.borderLeft,
      }}
    >
      <ConvenioCardHeader
        c={c}
        monitorado={monitorado}
        equipamentos={equipamentos}
        programaSiconv={programaSiconv}
        programaTransfereGovNome={programaTransfereGovNome}
        valorPagoFornecedor={valorPagoFornecedor}
        pagamentosCount={pagamentos.length}
      />

      {/* ---------- Camada 2: dado tecnico aninhado, atras de 1 clique ---------- */}
      <details
        style={{ marginTop: 12, borderTop: `1px solid ${colors.border}`, paddingTop: 10 }}
        open={detalheAberto}
        onToggle={(e) => setDetalheAberto((e.target as HTMLDetailsElement).open)}
      >
        <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: colors.primary }}>
          {detalheAberto ? 'Menos detalhes' : 'Mais detalhes'}
        </summary>
        <ConvenioCardDetalhes c={c} monitorado={monitorado} />
      </details>
    </div>
  );
}
