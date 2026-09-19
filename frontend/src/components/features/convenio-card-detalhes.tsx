/** Camada 2 (aninhada, atrás de "Mais detalhes") do card de convênio.
 * Extraído de convenio-card.tsx (Seção 6 da migração: componente >200
 * linhas). */
import { Link } from 'react-router-dom';
import { fmtData, fmtMoeda, pct } from '@/lib/monitoramento-format';
import { SiconvSubAbas } from './siconv-sub-abas';
import { AdicionarMonitoramentoButton } from './adicionar-monitoramento-button';
import type { ConvenioUnificado } from '@/types/monitoramento';
import { Campo, Secao } from './monitoramento-ui';

export function ConvenioCardDetalhes({ c, monitorado }: { c: ConvenioUnificado; monitorado: boolean }) {
  const siconv = c.siconv;
  return (
    <>
      <Secao titulo="Identificação">
        <div className="grid [grid-template-columns:repeat(auto-fill,minmax(min(190px,100%),1fr))] gap-2.5">
          <Campo label="Tipo convenente">{c.convenente.tipo}</Campo>
          <Campo label="Órgão">{c.orgao}</Campo>
          <Campo label="Unidade gestora">{c.unidadeGestora}</Campo>
          <Campo label="Função / subfunção">{c.funcao} / {c.subfuncao}</Campo>
          <Campo label="Tipo de instrumento">{c.tipoInstrumento}</Campo>
          <Campo label="Nº do processo">{c.numeroProcesso}</Campo>
          <Campo label="Região / código IBGE">{c.regiao} · {c.codigoIbge}</Campo>
          {c.situacaoContratacao && <Campo label="Situação da contratação (SICONV)">{c.situacaoContratacao}</Campo>}
          {/* Situação em destaque na camada 1 (StatusPill) é a do SICONV
              legado (achado 2026-09-15, pedido do usuário) -- a do Portal
              da Transparência continua disponível aqui, sem destaque. */}
          {c.situacaoPortal && c.situacaoPortal !== c.situacao && (
            <Campo label="Situação (Portal da Transparência)">{c.situacaoPortal}</Campo>
          )}
          <Campo label="Objeto">{c.objeto}</Campo>
        </div>
      </Secao>

      {/* Vigencia e Financeiro detalhado dividem a mesma linha -- flex-wrap
          pra continuar 1 embaixo da outra em tela estreita. */}
      <div className="flex gap-6 flex-wrap">
        <div className="flex-[1_1_260px]">
          <Secao titulo="Vigência">
            <div className="grid [grid-template-columns:repeat(auto-fill,minmax(min(190px,100%),1fr))] gap-2.5">
              <Campo label="Publicação">{fmtData(c.datas.publicacao)}</Campo>
              <Campo label="Início vigência">{fmtData(c.datas.inicioVigencia)}</Campo>
              <Campo label="Fim vigência">{fmtData(c.datas.fimVigencia)}</Campo>
              <Campo label="Conclusão">{fmtData(c.datas.conclusao)}</Campo>
            </div>
          </Secao>
        </div>

        {/* Empenhado/Desembolsado saem da camada 1 mas continuam
            disponiveis aqui, nao apagados. */}
        <div className="flex-[1_1_260px]">
          <Secao titulo="Financeiro detalhado">
            <div className="grid [grid-template-columns:repeat(auto-fill,minmax(min(190px,100%),1fr))] gap-2.5">
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
        <p className="text-xs text-muted-foreground italic mt-3.5">Não encontrado no dump SICONV.</p>
      )}

      {/* Monitoramento interno mudou pra pagina propria -- se ja tem
          instrumento, so o link; se nao tem, o botao de adicionar (achado
          2026-09-15, antes so existia a porta automatica via proposta
          aceita). */}
      <Secao
        titulo="Monitoramento interno"
        acao={
          monitorado && (
            <Link to={`/monitoramento-equipamentos/instrumentos/${c.numero}`} className="text-primary no-underline">
              Ver detalhes →
            </Link>
          )
        }
      >
        {monitorado ? (
          <p className="text-xs text-muted-foreground m-0">
        Entrega, instalação, licenciamento CNEN e inauguração.
          </p>
        ) : (
          <AdicionarMonitoramentoButton c={c} />
        )}
      </Secao>
    </>
  );
}
