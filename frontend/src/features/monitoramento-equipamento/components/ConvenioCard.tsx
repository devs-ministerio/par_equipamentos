/** Card de convenio -- 2 camadas de informacao, nao 1 accordion escondendo
 * tudo atras de 1 clique (feedback direto: o que mais importa pra
 * escanear -- status, objeto, grade financeira -- precisa aparecer sem
 * clicar em nada, so o dado tecnico profundo (SICONV/TransfereGov/
 * monitoramento) fica atras de "Ver mais detalhes"). Camada 1 sempre
 * visivel: identificacao, status, objeto, financeiro. Camada 2 (collapse
 * proprio, so essa parte): dados aninhados. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { colors } from '@/styles/tokens';
import { fmtData, fmtMoeda, pct } from '../lib/format';
import { SiconvSubAbas } from './SiconvSubAbas';
import type { ConvenioUnificado, ProgramaTransfereGov } from '../types';
import { Campo, estiloCard, Secao, StatusPill } from './ui';

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

  const pctDesembolsado = c.financeiro.global && c.financeiro.desembolsado != null
    ? Math.round((c.financeiro.desembolsado / c.financeiro.global) * 100)
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
      {/* ---------- Camada 1: sempre visivel ---------- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{
              fontSize: 11.5, fontWeight: 700, color: colors.primary, background: colors.primaryLight,
              padding: '2px 9px', borderRadius: 5, fontFamily: 'monospace',
            }}>
              Convênio {c.numero}
            </span>
            {c.numeroInstrumento && <span style={{ fontSize: 11, color: colors.subtleText, fontFamily: 'monospace' }}>{c.numeroInstrumento}</span>}
            {monitorado && (
              <span style={{ fontSize: 10, fontWeight: 700, color: colors.hiperGreen, background: colors.hiperGreenBg, padding: '2px 7px', borderRadius: 20 }}>
                ● Monitorado internamente
              </span>
            )}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: colors.primaryDark }}>{c.convenente.nome}</div>
          <div style={{ fontSize: 12, color: colors.mutedText, marginTop: 2 }}>
            {c.convenente.cnpj} · {c.municipio}/{c.uf}
          </div>
          {/* Equipamento em destaque -- pedido direto do usuario (2026-09-08):
              e o dado que motiva a pagina inteira, precisa aparecer antes de
              qualquer clique, nao so dentro do plano de aplicacao do SICONV
              (camada 2). Ver equipamentoTags.ts pro casamento. */}
          {equipamentos.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {equipamentos.map((e) => (
                <span key={e} style={{
                  fontSize: 13, fontWeight: 800, color: colors.primaryDark, background: colors.surface,
                  border: `1px solid ${colors.border}`, padding: '4px 11px', borderRadius: 20,
                }}>
                  {e}
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          <StatusPill texto={c.situacao} />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: colors.mutedText, textTransform: 'uppercase' }}>Valor global</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: colors.primaryDark }}>{fmtMoeda(c.financeiro.global)}</div>
            {pctDesembolsado !== null && <div style={{ fontSize: 10.5, color: colors.mutedText }}>{pctDesembolsado}% desembolsado</div>}
          </div>
        </div>
      </div>

      {/* Programa em destaque na camada 1 (trocado de lugar com Objeto,
          pedido do usuario 2026-09-09) -- e o dado que classifica o
          convenio dentro da politica de financiamento, mais util pra
          escanear rapido que o texto livre do objeto. */}
      <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: '12px 0 0', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '8px 10px' }}>
        <strong style={{ color: colors.mutedText, fontSize: 10.5, textTransform: 'uppercase', marginRight: 4 }}>Programa:</strong>
        {programaSiconv || (programaTransfereGov && `${programaTransfereGov.nm_programa}${programaTransfereGov.ano_programa ? ` (${programaTransfereGov.ano_programa})` : ''}`) || '— (não encontrado em nenhuma fonte)'}
      </p>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10,
        marginTop: 12, padding: '10px 12px', background: colors.surface, borderRadius: 8,
      }}>
        <Campo label="Valor global">{fmtMoeda(c.financeiro.global)}</Campo>
        <Campo label="Valor repasse" legenda={pct(c.financeiro.repasse, c.financeiro.global, 'do global')}>{fmtMoeda(c.financeiro.repasse)}</Campo>
        <Campo label="Contrapartida">{fmtMoeda(c.financeiro.contrapartida)}</Campo>
        <Campo label="Saldo em conta">{fmtMoeda(c.financeiro.saldoConta)}</Campo>
        <Campo label="Última liberação" legenda={fmtData(c.datas.ultimaLiberacao) !== '—' ? fmtData(c.datas.ultimaLiberacao) : undefined}>
          {fmtMoeda(c.financeiro.ultimaLiberacaoValor)}
        </Campo>
        <Campo label="Valor pago ao fornecedor" legenda={pagamentos.length ? `${pagamentos.length} pagamento(s)` : undefined}>
          {fmtMoeda(valorPagoFornecedor)}
        </Campo>
      </div>
      {!c.financeiro.fonteConfiavel && (
        <p style={{ fontSize: 11, color: colors.logoOrange, margin: '8px 0 0' }}>
          ⚠️ Não encontrado no dump SICONV — valores acima vêm do Portal da Transparência, que tem bug de truncamento
          conhecido nesse campo. Conferir manualmente.
        </p>
      )}

      {/* ---------- Camada 2: dado tecnico aninhado, atras de 1 clique ---------- */}
      <details
        style={{ marginTop: 12, borderTop: `1px solid ${colors.border}`, paddingTop: 10 }}
        open={detalheAberto}
        onToggle={(e) => setDetalheAberto((e.target as HTMLDetailsElement).open)}
      >
        <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: colors.primary }}>
          {detalheAberto ? 'Menos detalhes' : 'Mais detalhes'}
        </summary>

        <Secao titulo="Identificação">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
            <Campo label="Tipo convenente">{c.convenente.tipo}</Campo>
            <Campo label="Órgão">{c.orgao}</Campo>
            <Campo label="Unidade gestora">{c.unidadeGestora}</Campo>
            <Campo label="Função / subfunção">{c.funcao} / {c.subfuncao}</Campo>
            <Campo label="Tipo de instrumento">{c.tipoInstrumento}</Campo>
            <Campo label="Nº do processo">{c.numeroProcesso}</Campo>
            <Campo label="Região / código IBGE">{c.regiao} · {c.codigoIbge}</Campo>
            {c.situacaoContratacao && <Campo label="Situação da contratação (SICONV)">{c.situacaoContratacao}</Campo>}
            <Campo label="Objeto">{c.objeto}</Campo>
          </div>
        </Secao>

        {/* Vigencia e Financeiro detalhado dividem a mesma linha (pedido do
            usuario 2026-09-09) -- flex-wrap pra continuar 1 embaixo da
            outra em tela estreita, sem quebrar responsividade. */}
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px' }}>
            <Secao titulo="Vigência">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
                <Campo label="Publicação">{fmtData(c.datas.publicacao)}</Campo>
                <Campo label="Início vigência">{fmtData(c.datas.inicioVigencia)}</Campo>
                <Campo label="Fim vigência">{fmtData(c.datas.fimVigencia)}</Campo>
                <Campo label="Conclusão">{fmtData(c.datas.conclusao)}</Campo>
              </div>
            </Secao>
          </div>

          {/* Empenhado/Desembolsado saem da camada 1 (pedido do usuario
              2026-09-09: "pode remover o empenhado e desembolsado do
              layout principal") mas continuam disponiveis aqui, nao
              apagados. */}
          <div style={{ flex: '1 1 260px' }}>
            <Secao titulo="Financeiro detalhado">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
                <Campo label="Empenhado" legenda={pct(c.financeiro.empenhado, c.financeiro.global, 'do global')}>{fmtMoeda(c.financeiro.empenhado)}</Campo>
                <Campo label="Desembolsado" legenda={pct(c.financeiro.desembolsado, c.financeiro.global, 'do global')}>{fmtMoeda(c.financeiro.desembolsado)}</Campo>
              </div>
            </Secao>
          </div>
        </div>

        {siconv ? (
          <Secao titulo="Dados aninhados (SICONV)">
            <SiconvSubAbas siconv={siconv} />
          </Secao>
        ) : (
          <p style={{ fontSize: 12, color: colors.mutedText, fontStyle: 'italic', marginTop: 14 }}>Não encontrado no dump SICONV.</p>
        )}

        {/* Monitoramento interno mudou pra pagina propria (achado
            2026-09-09) -- antes era um accordion aqui dentro, com fetch
            proprio por card. Card fica mais leve; so mostra o link quando
            ha instrumento monitorado (ver useInstrumentosMonitorados.ts).
            Link fica na mesma linha do titulo via a prop `acao` do Secao
            (achado 2026-09-10, pedido do usuario: titulo + "Ver
            monitoramento interno" embaixo repetiam a mesma frase). */}
        {monitorado && (
          <Secao
            titulo="Monitoramento interno"
            acao={
              <Link
                to={`/monitoramento-equipamentos/instrumentos/${c.numero}`}
                style={{ color: colors.primary, textDecoration: 'none' }}
              >
                Ver detalhes →
              </Link>
            }
          >
            <p style={{ fontSize: 12, color: colors.mutedText, margin: 0 }}>
              Entrega, instalação, licenciamento CNEN e inauguração — acompanhamento manual pós-repasse da equipe.
            </p>
          </Secao>
        )}
      </details>
    </div>
  );
}
