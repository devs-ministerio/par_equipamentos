/**
 * Pagina de MONITORAMENTO DE EQUIPAMENTO -- separada da analise de merito
 * de hipo/hipersuficiencia (decisao do usuario, 2026-09-03). Fora do
 * AppLayout/TopNav de proposito (ver App.tsx): sem link nenhum a partir do
 * resto do app, sem FamiliaEquipamentoContext -- so acessivel indo direto na
 * URL /monitoramento-equipamentos. Reusa a paleta/tokens/componentes do
 * resto do app (styles/tokens.ts, MetricStrip, SearchInput, SingleSelectFilter)
 * pra manter a mesma linguagem visual da analise hiper/hipo (decisao
 * 2026-09-03) -- so nao entra no AppLayout mesmo (sem Header/TopNav,
 * decisao reafirmada 2026-09-08: layout redesenhado com estrutura de abas
 * inspirada num prototipo Stitch, mas sem sidebar de navegacao -- essa
 * pagina nao tem irmãs pra navegar entre si, so duplicaria a barra de
 * abas logo abaixo sem necessidade).
 *
 * Um registro por convenio, cruzando as 3 fontes oficiais -- achado
 * 2026-09-16 ("parar de usar json estático, coloque tudo no banco"): o
 * merge (antes client-side, ver histórico de `mesclarConvenios.ts`) agora
 * roda 1x na carga (`backend/scripts/importar_convenios_banco.py`),
 * gravado na tabela `Convenio`. O front busca `GET /convenios`
 * (`src/services/convenios.ts`) em vez de 3 JSON estático + merge:
 *   - Portal da Transparencia (/convenios/numero) -- 1:1 exato por numero,
 *     unica fonte com convenente/municipio/objeto legivel pros 71
 *   - SICONV legado (dump bulk) -- 1:1 exato por numero, valores
 *     financeiros corretos (Portal tem bug de truncamento confirmado) +
 *     granular (empenho/desembolso/licitacao/item de plano de aplicacao)
 *   - TransfereGov novo (modulo Gestao de Parcerias) -- cruzado por CNPJ do
 *     convenente, aproximacao (a API nova nao tem numero de convenio legado)
 *
 * O monitoramento interno pos-repasse fica DENTRO de cada card, numa secao
 * separada das 3 fontes (so busca quando o card e aberto) -- ver
 * convenio-card.tsx e monitoramento-interno.tsx.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { MetricStrip } from '@/components/common/metric-strip';
import { PageHeader } from '@/components/common/page-header';
import { Pagination } from '@/components/common/pagination';
import { SearchInput } from '@/components/common/search-input';
import { SingleSelectFilter } from '@/components/common/single-select-filter';
import { normalizarTexto } from '@/utils/texto';
import { ConvenioCard } from '@/components/features/convenio-card';
import { SecaoPropostasCandidatas } from '@/components/features/secao-propostas-candidatas';
import { usePropostasCandidatas } from '@/hooks/use-propostas-candidatas';
import { ESTAGIO_LABEL, estagioDeFato, type EstagioProposta } from '@/lib/proposta-status';
import { EQUIPAMENTOS_ALVO } from '@/lib/equipamento-tags';
import { fmtMoeda } from '@/lib/monitoramento-format';
import { useConveniosLista } from '@/hooks/useConveniosLista';
import { mensagemSeguraDoErro } from '@/lib/api-error';
import { useInstrumentosMonitorados } from '@/hooks/useInstrumentosMonitorados';

type Aba = 'convenios' | 'componentes';
// "Radar nacional" (snapshot estático) e "Incorporadas" saíram (pedido do
// usuário 2026-09-15). "Novas propostas"/"Propostas" (critério de
// pagamento) saíram por sua vez em 2026-09-18, substituídas pelo estágio
// real no funil TransfereGov: "Confirmada (parceria)" (já formalizada, tem
// cd_parceria/NUP SEI) e "Em tramitação (proposta)" (pode virar parceria
// ou ser rejeitada) -- ver estagioDeFato() em lib/proposta-status.ts.

// Correção 2026-09-18 (Plan Mode monitoramento-ingestao): FAF/TED/
// PERSUS I/PERSUS II/PRONON entraram no universo de "Instrumentos
// firmados" -- opções geradas a partir do dado real (mesmo padrão de
// `situacaoOptions`/`programaOptions` abaixo), não mais lista fixa.

// Card com 2 camadas (ConvenioCard.tsx) e mais pesado que linha de tabela --
// pagina de 20 em vez dos 50 que EstabelecimentoTable usa pra linha simples.
const PAGE_SIZE = 20;

// "Concluídos" -- ampliado 2026-09-18 (pedido do usuário) pra somar as
// situações que representam "chegou ao fim" em cada universo de fonte:
// "Prestação de Contas Concluída" (SICONV legado, achado 2026-09-15) e
// "Em operação" (PERSUS I inaugurado/PERSUS II/PRONON -- "Inaugurada"
// unificada em "Em operação" pra usar o mesmo vocabulário entre fontes).
const SITUACOES_CONCLUIDO = new Set(['Prestação de Contas Concluída', 'Em operação']);

export function MonitoramentoEquipamentosPage() {
  const [searchParams] = useSearchParams();
  const [aba, setAba] = useState<Aba>(() => searchParams.get('aba') === 'componentes' ? 'componentes' : 'convenios');
  const [subAbaFinanciamento, setSubAbaFinanciamento] = useState<EstagioProposta>(
    () => searchParams.get('subaba') === 'confirmada' ? 'confirmada' : 'tramitacao',
  );
  const [busca, setBusca] = useState('');
  const [uf, setUf] = useState<string | null>(null);
  const [equipamento, setEquipamento] = useState<string | null>(null);
  const [situacao, setSituacao] = useState<string | null>(null);
  const [ano, setAno] = useState<string | null>(null);
  const [programa, setPrograma] = useState<string | null>(null);
  const [tipoContratacao, setTipoContratacao] = useState<string | null>(null);
  const [soMonitorados, setSoMonitorados] = useState(false);
  const [pagina, setPagina] = useState(1);
  const monitorados = useInstrumentosMonitorados();

  // Busca os 403 inteiros de 1 vez (tamanho_pagina=500 > universo hoje) --
  // igual ao comportamento anterior (3 JSON carregados por inteiro,
  // paginação/filtro só no cliente), só troca a origem do dado. Página
  // é bem mais leve que antes (sem siconv_raw/transferegov_raw na
  // listagem, ver services/convenios.ts) mesmo carregando tudo de uma vez.
  const conveniosQuery = useConveniosLista();
  const convenios = conveniosQuery.data?.itens ?? null;

  const ufs = useMemo(() => {
    if (!convenios) return [];
    return [...new Set(convenios.map((c) => c.uf))]
      .filter(Boolean)
      .sort()
      .map((u) => ({ value: u, label: u }));
  }, [convenios]);

  // Tag de equipamento por convenio -- achado 2026-09-16: vem pré-computada
  // da API (`c.equipamentosTags`, mesmos padrões de equipamentoTags.ts
  // aplicados na carga, ver importar_convenios_banco.py), não precisa mais
  // reclassificar itens no cliente (que nem estão mais disponíveis na
  // listagem, só siconv_raw/transferegov_raw do card expandido).
  const equipamentosPorNumero = useMemo(() => {
    if (!convenios) return new Map<string, string[]>();
    return new Map(convenios.map((c) => [c.numero, c.equipamentosTags]));
  }, [convenios]);

  const equipamentoOptions = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const tags of equipamentosPorNumero.values()) {
      for (const t of tags) contagem.set(t, (contagem.get(t) ?? 0) + 1);
    }
    return EQUIPAMENTOS_ALVO.map((e) => ({ value: e, label: `${e} (${contagem.get(e) ?? 0})` }));
  }, [equipamentosPorNumero]);

  // Ano da PROPOSTA (não da publicação) -- pedido do usuário 2026-09-15:
  // "904824 18852/2020" -> filtro 2020. numeroInstrumento vem sempre como
  // SEQ/ANO (Portal da Transparência), confirmado nos 403 convênios (só 2
  // sem valor).
  const anoOptions = useMemo(() => {
    if (!convenios) return [];
    const anos = new Set<string>();
    for (const c of convenios) {
      const ano = c.numeroInstrumento?.split('/')[1];
      if (ano) anos.add(ano);
    }
    return [...anos].sort().reverse().map((a) => ({ value: a, label: a }));
  }, [convenios]);

  const situacaoOptions = useMemo(() => {
    if (!convenios) return [];
    const contagem = new Map<string, number>();
    for (const c of convenios) {
      if (!c.situacao) continue;
      contagem.set(c.situacao, (contagem.get(c.situacao) ?? 0) + 1);
    }
    return [...contagem.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => ({ value: s, label: `${s} (${n})` }));
  }, [convenios]);

  // Tipo de contratação (correção 2026-09-18) -- Convênio/FAF/TED/
  // PERSUS I/PERSUS II/PRONON, gerado a partir do dado real.
  const tipoContratacaoOptions = useMemo(() => {
    if (!convenios) return [];
    const contagem = new Map<string, number>();
    for (const c of convenios) {
      const t = c.tipoContratacao ?? 'Convênio';
      contagem.set(t, (contagem.get(t) ?? 0) + 1);
    }
    return [...contagem.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ value: t, label: `${t} (${n})` }));
  }, [convenios]);

  // Programa (SICONV, texto já promovido pra coluna própria em `Convenio`,
  // ver importar_convenios_banco.py) -- TODOS os programas que aparecem
  // nos convenios, nao so os 8 componentes PNPCC nomeados (pedido do
  // usuario 2026-09-08: "444 convenios, 143 com componente PNPCC, os
  // outros 301 tem programa de categoria mais antiga/ampla -- pode
  // inserir todos os programas"). Achado 2026-09-16: agrupar pelo próprio
  // texto (em vez de ID_PROGRAMA) é seguro aqui -- confirmado 2026-09-08
  // que a corrupção de encoding do SICONV é por linha da FONTE, nao por
  // convenio (cada programa tem sempre a MESMA grafia). Ordenado por
  // frequencia -- 87 opcoes, os mais comuns primeiro ajudam a achar rapido.
  const programaOptions = useMemo(() => {
    if (!convenios) return [];
    const contagem = new Map<string, number>();
    for (const c of convenios) {
      if (!c.programa) continue;
      contagem.set(c.programa, (contagem.get(c.programa) ?? 0) + 1);
    }
    return [...contagem.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([nome, n]) => ({ value: nome, label: `${nome} (${n})` }));
  }, [convenios]);

  const filtrados = useMemo(() => {
    if (!convenios) return [];
    const lista = convenios.filter((c) => {
      if (tipoContratacao && (c.tipoContratacao ?? 'Convênio') !== tipoContratacao) return false;
      if (uf && c.uf !== uf) return false;
      if (equipamento && !equipamentosPorNumero.get(c.numero)?.includes(equipamento)) return false;
      if (situacao && c.situacao !== situacao) return false;
      if (ano && c.numeroInstrumento?.split('/')[1] !== ano) return false;
      if (programa && c.programa !== programa) return false;
      if (soMonitorados && !monitorados.has(c.numero)) return false;
      if (busca) {
        const alvo = normalizarTexto(`${c.numero} ${c.convenente.nome} ${c.convenente.cnpj ?? ''} ${c.municipio} ${c.objeto}`);
        if (!alvo.includes(normalizarTexto(busca))) return false;
      }
      return true;
    });
    // Convenio com monitoramento interno ativo primeiro -- e o unico dado
    // editavel da pagina toda, merece ficar visivel sem precisar escanear
    // ~300 cards pra achar (so 1 hoje, mas o desenho ja escala pra mais).
    return [...lista].sort((a, b) => Number(monitorados.has(b.numero)) - Number(monitorados.has(a.numero)));
  }, [convenios, busca, uf, equipamento, situacao, ano, programa, tipoContratacao, soMonitorados, equipamentosPorNumero, monitorados]);

  // Volta pra pagina 1 sempre que filtro/busca mudar -- senao o usuario
  // pode ficar preso numa pagina que nao existe mais no resultado novo.
  useEffect(() => setPagina(1), [busca, uf, equipamento, situacao, ano, programa, tipoContratacao, soMonitorados]);

  const paginados = filtrados.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE);

  const totalGlobal = filtrados.reduce((a, c) => a + (c.financeiro.global || 0), 0);
  const totalDesembolsado = filtrados.reduce((a, c) => a + (c.financeiro.desembolsado || 0), 0);
  const totalEquipamentos = filtrados.reduce((a, c) => a + (equipamentosPorNumero.get(c.numero)?.length ?? 0), 0);

  const erro = conveniosQuery.error ? mensagemSeguraDoErro(conveniosQuery.error) : null;

  const totalConcluidos = useMemo(
    () => convenios?.filter((c) => c.situacao && SITUACOES_CONCLUIDO.has(c.situacao)).length ?? 0,
    [convenios],
  );

  // Contagem só pro rótulo das abas -- não afeta o resto da página, busca
  // leve e independente do resto do estado (mesma queryKey sem status do
  // SecaoPropostasCandidatas, já cacheada quando a aba abrir de verdade).
  const { propostas: todasPropostas } = usePropostasCandidatas();
  const totalConfirmadas = todasPropostas.filter((p) => estagioDeFato(p) === 'confirmada').length;
  const totalEmTramitacao = todasPropostas.length - totalConfirmadas;

  return (
    <div>
        <PageHeader eyebrow="Dados oficiais" title="Instrumentos e repasses" description="Convênios, propostas, valores e execução das fontes oficiais." />

        {erro && <p className="text-destructive">Erro ao carregar dados: {erro}</p>}

        {/* Abas -- Instrumentos/Programas (registros oficiais e cargas
            programáticas) e Linhas
            de financiamento (propostas do Radar de Convênios, ver
            SecaoPropostasCandidatas.tsx). */}
        <div className="flex gap-1 mb-5 border-b border-border">
          <button
            onClick={() => setAba('convenios')}
            className={cn(
              'py-2.5 px-4 text-sm font-bold border-none bg-transparent cursor-pointer -mb-px border-b-2',
              aba === 'convenios' ? 'text-primary border-b-primary' : 'text-muted-foreground border-b-transparent',
            )}
          >
            Instrumentos/Programas <span className="text-muted-foreground/70 font-medium">({convenios?.length ?? 0})</span>
          </button>
          <button
            onClick={() => setAba('componentes')}
            className={cn(
              'py-2.5 px-4 text-sm font-bold border-none bg-transparent cursor-pointer -mb-px border-b-2',
              aba === 'componentes' ? 'text-primary border-b-primary' : 'text-muted-foreground border-b-transparent',
            )}
          >
            Linhas de financiamento{' '}
            <span className="text-muted-foreground/70 font-medium">({todasPropostas.length})</span>
          </button>
        </div>

        {aba === 'convenios' && (
          !convenios ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : (
            <>
              {/* "Instrumentos/Programas" e "Monitorados internamente"
                  saíram daqui -- duplicavam os cards do cabeçalho acima
                  (achado 2026-09-15, pedido do usuário: "revise e pode
                  remover"). Legenda de cor (Em execução/Prestação de
                  contas/Anulado/Demais) também saiu, mesmo pedido. */}
              <div className="mb-5">
                <MetricStrip items={[
                  { key: 'instrumentos', label: 'Instrumentos', value: convenios.length },
                  { key: 'monitorados', label: 'Monitorados', value: monitorados.size, variant: 'success', onClick: () => setSoMonitorados((valor) => !valor), ativo: soMonitorados },
                  { key: 'concluidos', label: 'Concluídos', value: totalConcluidos, variant: 'success' },
                  { key: 'global', label: 'Valor global', value: fmtMoeda(totalGlobal) },
                  { key: 'desembolsado', label: 'Desembolsado', value: fmtMoeda(totalDesembolsado), variant: 'success' },
                  { key: 'equipamentos', label: 'Itens de equipamento', value: totalEquipamentos },
                ]} />
              </div>

              {/* Busca + 6 filtro precisam caber numa linha so (pedido do
                  usuario 2026-09-09) -- larguras reduzidas na proporcao
                  certa pra somar <1200px (cabe dentro do maxWidth de 1400
                  menos padding). wrap continua ligado so como rede de
                  seguranca pra janela bem estreita, nao pro uso normal. */}
              <div className="mb-4 flex flex-wrap items-center gap-2 border-y border-border py-3.5">
                <SearchInput value={busca} onChange={setBusca} placeholder="Buscar por convenente, município, número, CNPJ..." width={190} />
                <SingleSelectFilter placeholder="Tipo de contratação" options={tipoContratacaoOptions} value={tipoContratacao} onChange={setTipoContratacao} clearLabel="Todos os tipos" minWidth={120} />
                <SingleSelectFilter placeholder="Todas as UFs" options={ufs} value={uf} onChange={setUf} clearLabel="Todas as UFs" minWidth={100} />
                <SingleSelectFilter placeholder="Todos os equipamentos" options={equipamentoOptions} value={equipamento} onChange={setEquipamento} clearLabel="Todos os equipamentos" minWidth={150} />
                <SingleSelectFilter placeholder="Todas as situações" options={situacaoOptions} value={situacao} onChange={setSituacao} clearLabel="Todas as situações" minWidth={150} />
                <SingleSelectFilter placeholder="Ano da proposta" options={anoOptions} value={ano} onChange={setAno} clearLabel="Todos os anos" minWidth={110} />
                <SingleSelectFilter placeholder="Todos os programas" options={programaOptions} value={programa} onChange={setPrograma} clearLabel="Todos os programas" minWidth={160} />
              </div>

              <div className="text-muted-foreground text-xs mb-2.5">
                {filtrados.length} de {convenios.length} instrumento(s)
              </div>

              {paginados.map((c) => (
                <ConvenioCard
                  key={c.numero}
                  c={c}
                  monitorado={monitorados.has(c.numero)}
                />
              ))}

              <div className="bg-card border border-border rounded-[10px] mt-1">
                <Pagination page={pagina} totalItems={filtrados.length} pageSize={PAGE_SIZE} onPageChange={setPagina} />
              </div>
            </>
          )
        )}

        {aba === 'componentes' && (
          <>
            {/* Radar de Convênios -- organizado pelo estágio real no funil
                TransfereGov (pedido do usuário 2026-09-18, substituindo as
                antigas "Novas propostas"/"Propostas" que separavam por
                critério de pagamento): "Confirmada (parceria)" primeiro
                (fato consumado), "Em tramitação (proposta)" depois (pode
                virar parceria ou ser rejeitada). */}
            <div className="flex gap-1 mb-4 border-b border-border">
              {(
                [
                  { value: 'confirmada', label: ESTAGIO_LABEL.confirmada, contagem: totalConfirmadas },
                  { value: 'tramitacao', label: ESTAGIO_LABEL.tramitacao, contagem: totalEmTramitacao },
                ] as const
              ).map((sub) => (
                <button
                  key={sub.value}
                  onClick={() => setSubAbaFinanciamento(sub.value)}
                  className={cn(
                    'py-2 px-3.5 text-[12.5px] font-semibold border-none bg-transparent cursor-pointer -mb-px border-b-2',
                    subAbaFinanciamento === sub.value ? 'text-primary border-b-primary' : 'text-muted-foreground border-b-transparent',
                  )}
                >
                  {sub.label} <span className="ml-1 text-muted-foreground/70 font-medium">({sub.contagem})</span>
                </button>
              ))}
            </div>

            <SecaoPropostasCandidatas modo={subAbaFinanciamento} />
          </>
        )}
    </div>
  );
}
