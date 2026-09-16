/**
 * Pagina de MONITORAMENTO DE EQUIPAMENTO -- separada da analise de merito
 * de hipo/hipersuficiencia (decisao do usuario, 2026-09-03). Fora do
 * AppLayout/TopNav de proposito (ver App.tsx): sem link nenhum a partir do
 * resto do app, sem FamiliaEquipamentoContext -- so acessivel indo direto na
 * URL /monitoramento-equipamentos. Reusa a paleta/tokens/componentes do
 * resto do app (styles/tokens.ts, KpiCard, SearchInput, SingleSelectFilter)
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
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { KpiCard } from '@/components/common/kpi-card';
import { Pagination } from '@/components/common/pagination';
import { SearchInput } from '@/components/common/search-input';
import { SingleSelectFilter } from '@/components/common/single-select-filter';
import { normalizarTexto } from '@/utils/texto';
import { ConvenioCard } from '@/components/features/convenio-card';
import { propostaEhNova, SecaoPropostasCandidatas } from '@/components/features/secao-propostas-candidatas';
import { usePropostasCandidatas } from '@/hooks/use-propostas-candidatas';
import { EQUIPAMENTOS_ALVO } from '@/lib/equipamento-tags';
import { fmtMoeda } from '@/lib/monitoramento-format';
import { fetchConvenios } from '@/services/convenios';
import { useInstrumentosMonitorados } from '@/hooks/useInstrumentosMonitorados';

type Aba = 'convenios' | 'componentes';
// "Radar nacional" (snapshot estático) saiu -- não faz sentido enquanto
// nenhuma proposta foi aceita ainda (pedido do usuário 2026-09-15).
// "Incorporadas" (status aceita, sem filtro) saiu de vez -- substituída por
// "Propostas" (universo inteiro, pendente+aceita+rejeitada) + "Novas
// propostas" reformulada pra também puxar aceita-ainda-não-paga (achado
// 2026-09-15, pedido do usuário: "crie uma nova aba Proposta onde estará
// todas as propostas... na incorporadas pode remover todas", ver
// propostaEhNova() em secao-propostas-candidatas.tsx pro critério exato).
type SubAbaFinanciamento = 'todas' | 'novas';

/** So "Convenio" tem dado carregado hoje (e o universo inteiro do SICONV/
 * Portal da Transparencia que a pagina cruza). PERSUS I/II, FAF e TED sao
 * outros tipos de instrumento de repasse que a equipe ainda vai trazer --
 * o filtro ja aparece pra deixar o escopo futuro visivel, mas selecionar
 * um deles hoje mostra lista vazia (nunca dado inventado). */
const TIPOS_CONTRATACAO = [
  { value: 'convenio', label: 'Convênios' },
  { value: 'persus1', label: 'PERSUS I (ainda não incluído)' },
  { value: 'persus2', label: 'PERSUS II (ainda não incluído)' },
  { value: 'faf', label: 'FAF (ainda não incluído)' },
  { value: 'ted', label: 'TED (ainda não incluído)' },
];

// Card com 2 camadas (ConvenioCard.tsx) e mais pesado que linha de tabela --
// pagina de 20 em vez dos 50 que EstabelecimentoTable usa pra linha simples.
const PAGE_SIZE = 20;

export function MonitoramentoEquipamentosPage() {
  const [aba, setAba] = useState<Aba>('convenios');
  const [subAbaFinanciamento, setSubAbaFinanciamento] = useState<SubAbaFinanciamento>('novas');
  const [busca, setBusca] = useState('');
  const [uf, setUf] = useState<string | null>(null);
  const [equipamento, setEquipamento] = useState<string | null>(null);
  const [situacao, setSituacao] = useState<string | null>(null);
  const [ano, setAno] = useState<string | null>(null);
  const [programa, setPrograma] = useState<string | null>(null);
  const [tipoContratacao, setTipoContratacao] = useState<string | null>('convenio');
  const [soMonitorados, setSoMonitorados] = useState(false);
  const [pagina, setPagina] = useState(1);
  const monitorados = useInstrumentosMonitorados();

  // Busca os 403 inteiros de 1 vez (tamanho_pagina=500 > universo hoje) --
  // igual ao comportamento anterior (3 JSON carregados por inteiro,
  // paginação/filtro só no cliente), só troca a origem do dado. Página
  // é bem mais leve que antes (sem siconv_raw/transferegov_raw na
  // listagem, ver services/convenios.ts) mesmo carregando tudo de uma vez.
  const conveniosQuery = useQuery({
    queryKey: ['convenios-lista'],
    queryFn: () => fetchConvenios({ tamanhoPagina: 500 }),
  });
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
    for (const c of convenios) contagem.set(c.situacao, (contagem.get(c.situacao) ?? 0) + 1);
    return [...contagem.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => ({ value: s, label: `${s} (${n})` }));
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
    // "Convenio" e o unico tipo de contratacao com dado -- qualquer outro
    // valor (PERSUS I/II, FAF, TED) mostra lista vazia de proposito, nunca
    // dado inventado (ver TIPOS_CONTRATACAO acima).
    if (!convenios || (tipoContratacao && tipoContratacao !== 'convenio')) return [];
    const lista = convenios.filter((c) => {
      if (uf && c.uf !== uf) return false;
      if (equipamento && !equipamentosPorNumero.get(c.numero)?.includes(equipamento)) return false;
      if (situacao && c.situacao !== situacao) return false;
      if (ano && c.numeroInstrumento?.split('/')[1] !== ano) return false;
      if (programa && c.programa !== programa) return false;
      if (soMonitorados && !monitorados.has(c.numero)) return false;
      if (busca) {
        const alvo = normalizarTexto(`${c.numero} ${c.convenente.nome} ${c.convenente.cnpj} ${c.municipio} ${c.objeto}`);
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

  const erro = conveniosQuery.error?.message ?? null;

  // Concluídos -- situação do SICONV legado (mesma fonte do destaque no
  // card, ver importar_convenios_banco.py) igual a "Prestação de Contas
  // Concluída" literal, pedido do usuário 2026-09-15.
  const totalConcluidos = useMemo(
    () => convenios?.filter((c) => c.situacao === 'Prestação de Contas Concluída').length ?? 0,
    [convenios],
  );

  // Contagem só pro rótulo das abas -- não afeta o resto da página, busca
  // leve e independente do resto do estado (mesma queryKey sem status do
  // SecaoPropostasCandidatas, já cacheada quando a aba abrir de verdade).
  const { propostas: todasPropostas } = usePropostasCandidatas();
  const totalNovas = todasPropostas.filter(propostaEhNova).length;

  return (
    <div>
        <Card className="mb-4 py-0">
          <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5.5">
          <div>
            <div className="mb-2 text-[11px] font-extrabold tracking-[0.08em] text-primary uppercase">
              Dados oficiais
            </div>
            <h1 className="m-0 text-3xl font-extrabold tracking-[-0.03em] text-foreground">
              Instrumentos e repasses
            </h1>
            <p className="mt-2.5 max-w-[780px] text-[13.5px] leading-relaxed text-muted-foreground">
              Consulte convênios, programas, valores, repasses e situação a partir de Transferegov, SICONV e Portal da Transparência.
            </p>
          </div>
          <div className="grid min-w-[380px] grid-cols-3 gap-2">
            <div className="rounded-lg border border-border bg-muted p-2.5">
              <div className="text-[10.5px] font-extrabold text-muted-foreground uppercase">Instrumentos</div>
              <strong className="text-[22px] text-foreground">{convenios?.length ?? '...'}</strong>
            </div>
            {/* Toggle de "só monitorados" mudou pra cá (removido da linha de
                KPI abaixo, que duplicava esta contagem -- achado 2026-09-15). */}
            <button
              type="button"
              onClick={() => setSoMonitorados((v) => !v)}
              className={cn(
                'rounded-lg border p-2.5 text-left transition-colors',
                soMonitorados ? 'border-success bg-success-bg' : 'border-border bg-muted hover:bg-secondary',
              )}
            >
              <div className="text-[10.5px] font-extrabold text-muted-foreground uppercase">Monitorados</div>
              <strong className="text-[22px] text-foreground">{monitorados.size}</strong>
            </button>
            <div className="rounded-lg border border-border bg-muted p-2.5">
              <div className="text-[10.5px] font-extrabold text-muted-foreground uppercase">Concluídos</div>
              <strong className="text-[22px] text-foreground">{totalConcluidos}</strong>
            </div>
          </div>
          </CardContent>
        </Card>

        {erro && <p className="text-destructive">Erro ao carregar dados: {erro}</p>}

        {/* Abas -- Instrumentos firmados (convênios já assinados) e Linhas
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
            Instrumentos firmados <span className="text-muted-foreground/70 font-medium">({convenios?.length ?? 0})</span>
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
              {/* "Instrumentos firmados" e "Monitorados internamente"
                  saíram daqui -- duplicavam os cards do cabeçalho acima
                  (achado 2026-09-15, pedido do usuário: "revise e pode
                  remover"). Legenda de cor (Em execução/Prestação de
                  contas/Anulado/Demais) também saiu, mesmo pedido. */}
              <div className="flex gap-4 flex-wrap mb-4">
                <KpiCard label="Valor global total" value={fmtMoeda(totalGlobal)} variant="primary" />
                <KpiCard label="Valor desembolsado total" value={fmtMoeda(totalDesembolsado)} variant="success" />
                <KpiCard label="Parque tecnológico (itens)" value={totalEquipamentos} variant="primary" />
              </div>

              {/* Busca + 6 filtro precisam caber numa linha so (pedido do
                  usuario 2026-09-09) -- larguras reduzidas na proporcao
                  certa pra somar <1200px (cabe dentro do maxWidth de 1400
                  menos padding). wrap continua ligado so como rede de
                  seguranca pra janela bem estreita, nao pro uso normal. */}
              <div className="bg-card border border-border rounded-[10px] p-3.5 shadow-[0_1px_3px_rgba(22,33,62,0.06)] mb-4 flex gap-2 flex-wrap items-center">
                <SearchInput value={busca} onChange={setBusca} placeholder="Buscar por convenente, município, número, CNPJ..." width={190} />
                <SingleSelectFilter placeholder="Tipo de contratação" options={TIPOS_CONTRATACAO} value={tipoContratacao} onChange={setTipoContratacao} clearLabel="Todos os tipos" minWidth={120} />
                <SingleSelectFilter placeholder="Todas as UFs" options={ufs} value={uf} onChange={setUf} clearLabel="Todas as UFs" minWidth={100} />
                <SingleSelectFilter placeholder="Todos os equipamentos" options={equipamentoOptions} value={equipamento} onChange={setEquipamento} clearLabel="Todos os equipamentos" minWidth={150} />
                <SingleSelectFilter placeholder="Todas as situações" options={situacaoOptions} value={situacao} onChange={setSituacao} clearLabel="Todas as situações" minWidth={150} />
                <SingleSelectFilter placeholder="Ano da proposta" options={anoOptions} value={ano} onChange={setAno} clearLabel="Todos os anos" minWidth={110} />
                <SingleSelectFilter placeholder="Todos os programas" options={programaOptions} value={programa} onChange={setPrograma} clearLabel="Todos os programas" minWidth={160} />
              </div>

              {tipoContratacao && tipoContratacao !== 'convenio' ? (
                <p className="text-muted-foreground text-sm italic py-5">
                  {TIPOS_CONTRATACAO.find((t) => t.value === tipoContratacao)?.label} ainda não foi incluído nos dados do sistema —
                  hoje a página só cruza convênios (Portal da Transparência + SICONV + TransfereGov).
                </p>
              ) : (
                <>
                  <div className="text-muted-foreground text-xs mb-2.5">
                    {filtrados.length} de {convenios.length} convênio(s)
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
              )}
            </>
          )
        )}

        {aba === 'componentes' && (
          <>
            {/* Radar de Convênios (2026-09-15): "Radar nacional" (snapshot
                estático) saiu -- sem sentido enquanto nenhuma proposta foi
                aceita ainda (pedido do usuário). "Incorporadas" (status
                aceita cru, sem olhar pagamento) saiu de vez -- pedido do
                usuário: "crie uma nova aba Proposta onde estará todas as
                propostas... na incorporadas pode remover todas". Fica
                "Novas propostas" (pendente + aceita-ainda-não-paga, ver
                propostaEhNova()) e "Propostas" (universo inteiro, incl.
                rejeitada). */}
            <div className="flex gap-1 mb-4 border-b border-border">
              {(
                [
                  { value: 'novas', label: 'Novas propostas', contagem: totalNovas },
                  { value: 'todas', label: 'Propostas', contagem: todasPropostas.length },
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
