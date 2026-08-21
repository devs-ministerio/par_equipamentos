import { Fragment, useEffect, useMemo, useState } from 'react';
import type { CoberturaRow, Macrorregiao, StatusCobertura } from '../../types/domain';
import { formatMultiplicador } from '../../utils/format';
import { colors } from '../../styles/tokens';
import { InfoIcon } from '../common/InfoIcon';
import { StatusBadge } from '../common/StatusBadge';
import { Pagination } from '../common/Pagination';
import { fetchEstabelecimentosPage } from '../../services/api';

const PAGE_SIZE = 20;

interface Props {
  equipmentFamily: string;
  rows: CoberturaRow[];
  macros: Macrorregiao[];
  /** Chamado com a chave composta "NOME|UF", o codigo da macro e o codigo da
   * regiao de saude ao clicar numa cidade dentro do card expandido -- soma
   * Município, Macrorregião e Região de Saúde ao filtro (toggle) tanto no
   * filtro do topo quanto na tabela de Estabelecimento. */
  onSelecionarMunicipio: (chaveMunicipio: string, macroId: string, regiaoSaudeCodigo: string) => void;
  /** filtroMunicipios atual (mesmas chaves "NOME|UF") -- usado só pra saber
   * qual chip destacar como selecionado. */
  municipiosSelecionados: string[];
  /** Filtro Hiper/Hipo -- controlado pelo Dashboard, que mostra os botões
   * junto do título "Cobertura Assistencial" (não mais dentro da tabela). */
  statusFiltro: Set<StatusCobertura>;
}

type SortKey = 'codigo' | 'macro' | 'uf' | 'populacao' | 'cobertura' | 'status';

interface CidadeDaMacro {
  municipio: string;
  qtd: number;
  estabelecimentos: number;
}

interface RegiaoDaMacro {
  codigo: string;
  nome: string;
  cidades: CidadeDaMacro[];
}

type DadosMacro = RegiaoDaMacro[] | 'carregando' | 'erro';

const SEM_REGIAO = '__sem_regiao__';

export function CoberturaTable({
  equipmentFamily,
  rows,
  macros,
  onSelecionarMunicipio,
  municipiosSelecionados,
  statusFiltro,
}: Props) {
  const macroById = useMemo(() => new Map(macros.map((m) => [m.id, m])), [macros]);
  const [sortKey, setSortKey] = useState<SortKey>('macro');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [regioesExpandidas, setRegioesExpandidas] = useState<Set<string>>(new Set());
  const [dadosPorMacro, setDadosPorMacro] = useState<Record<string, DadosMacro>>({});
  const [page, setPage] = useState(1);

  // volta pra pagina 1 quando filtro/ordenacao mudar -- senao pode sobrar numa
  // pagina que nao existe mais depois de filtrar.
  useEffect(() => setPage(1), [statusFiltro, sortKey, sortDir]);

  function toggleRegiaoExpandida(chave: string) {
    setRegioesExpandidas((prev) => {
      const next = new Set(prev);
      next.has(chave) ? next.delete(chave) : next.add(chave);
      return next;
    });
  }

  // busca sob demanda -- so quando a macro e expandida pela primeira vez (nao
  // carrega nada de antemao); cada macro e uma busca pequena e independente,
  // igual o padrao ja usado no Mapa pra buscar por UF.
  function toggleExpandida(macroId: string) {
    const jaExpandida = expandidas.has(macroId);
    setExpandidas((prev) => {
      const next = new Set(prev);
      jaExpandida ? next.delete(macroId) : next.add(macroId);
      return next;
    });
    if (!jaExpandida && !dadosPorMacro[macroId]) {
      setDadosPorMacro((prev) => ({ ...prev, [macroId]: 'carregando' }));
      fetchEstabelecimentosPage({ equipmentFamily, macroCodes: [macroId], page: 1, pageSize: 2000 })
        .then((res) => {
          // macro -> regiao de saude -> cidade (hierarquia real do SUS; uma
          // macro tem varias regioes de saude dentro dela, cada regiao tem
          // varios municipios -- nao da pra achatar regiao direto na macro).
          const porRegiao = new Map<string, RegiaoDaMacro>();
          res.items.forEach((e) => {
            const chaveRegiao = e.regiaoSaudeId ?? SEM_REGIAO;
            const regiao = porRegiao.get(chaveRegiao) ?? {
              codigo: e.regiaoSaudeId ?? '',
              nome: e.regiaoSaudeNome ?? 'Sem região de saúde',
              cidades: [],
            };
            let cidade = regiao.cidades.find((c) => c.municipio === e.municipio);
            if (!cidade) {
              cidade = { municipio: e.municipio, qtd: 0, estabelecimentos: 0 };
              regiao.cidades.push(cidade);
            }
            cidade.qtd += e.qtd;
            cidade.estabelecimentos += 1;
            porRegiao.set(chaveRegiao, regiao);
          });
          const lista = [...porRegiao.values()]
            .map((r) => ({ ...r, cidades: r.cidades.sort((a, b) => a.municipio.localeCompare(b.municipio)) }))
            .sort((a, b) => a.nome.localeCompare(b.nome));
          setDadosPorMacro((prev) => ({ ...prev, [macroId]: lista }));
        })
        .catch(() => setDadosPorMacro((prev) => ({ ...prev, [macroId]: 'erro' })));
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function arrow(key: SortKey) {
    if (sortKey !== key) return null;
    return <span style={{ marginLeft: 3 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>;
  }

  const rowsFiltradas = useMemo(() => {
    if (statusFiltro.size === 0) return rows;
    return rows.filter((r) => statusFiltro.has(r.status));
  }, [rows, statusFiltro]);

  const rowsOrdenadas = useMemo(() => {
    const copia = [...rowsFiltradas];
    copia.sort((a, b) => {
      const macroA = macroById.get(a.macroId);
      const macroB = macroById.get(b.macroId);
      let cmp = 0;
      switch (sortKey) {
        case 'codigo':
          cmp = (macroA?.id ?? '').localeCompare(macroB?.id ?? '');
          break;
        case 'macro':
          cmp = (macroA?.nome ?? '').localeCompare(macroB?.nome ?? '');
          break;
        case 'uf':
          cmp = (macroA?.uf ?? '').localeCompare(macroB?.uf ?? '');
          break;
        case 'populacao':
          cmp = (macroA?.pop ?? 0) - (macroB?.pop ?? 0);
          break;
        case 'cobertura':
          cmp = a.cobertura - b.cobertura;
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copia;
  }, [rowsFiltradas, macroById, sortKey, sortDir]);

  // paginacao conta so linhas de macro -- expandir uma macro (regioes/cidades
  // dentro dela) e conteudo da MESMA linha, nao entra na conta nem muda
  // quantas paginas existem.
  const rowsPaginadas = useMemo(
    () => rowsOrdenadas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rowsOrdenadas, page],
  );

  return (
    <>
      {/* com alguma macro expandida, o card cresce junto com a pagina (a
          rolagem passa a ser da pagina inteira) em vez de espremer os chips
          de cidade numa caixinha interna -- so trava a altura no modo
          compacto (nada expandido), que e quando faz sentido ter rolagem
          interna pra pagina de ate 20 macros. */}
      <div style={{ maxHeight: expandidas.size > 0 ? 'none' : 340, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 2,
                background: '#fafbfd',
                textAlign: 'left',
                color: '#667085',
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.02em',
              }}
            >
              <th
                style={{ padding: '10px 8px 10px 18px', fontWeight: 600, cursor: 'pointer', width: 150 }}
                onClick={() => toggleSort('codigo')}
              >
                Código macro de saúde{arrow('codigo')}
              </th>
              <th
                style={{ padding: '10px 6px 10px 8px', fontWeight: 600, cursor: 'pointer', width: 260 }}
                onClick={() => toggleSort('macro')}
              >
                Macrorregião de saúde{arrow('macro')}
              </th>
              <th
                style={{ padding: '10px 8px 10px 6px', fontWeight: 600, cursor: 'pointer', width: 46 }}
                onClick={() => toggleSort('uf')}
              >
                UF{arrow('uf')}
              </th>
              <th
                style={{
                  padding: '10px 8px 10px 10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  width: 210,
                  textAlign: 'right',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                  <span style={{ cursor: 'pointer' }} onClick={() => toggleSort('populacao')}>
                    População SUS-dependente{arrow('populacao')}
                  </span>
                  <InfoIcon align="right">
                    <div style={{ fontWeight: 700, marginBottom: 6, color: '#93c5fd' }}>
                      Populações usadas no cálculo
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: 11 }}>
                      SUS-dependente = IBGE (residente) − beneficiários de plano de saúde (ANS)
                    </div>
                    <div style={{ marginTop: 8, fontSize: 10, color: '#94a3b8' }}>
                      IBGE vem ao vivo do SIDRA; ANS vem de arquivo de referência (sem API oficial ao vivo
                      conhecida). É a SUS-dependente que entra no cálculo de demanda — quem tem plano privado não
                      compete pela vaga no SUS.
                    </div>
                  </InfoIcon>
                </span>
              </th>
              <th style={{ padding: '10px 32px 10px 8px', fontWeight: 600, width: 259 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ cursor: 'pointer' }} onClick={() => toggleSort('cobertura')}>
                    Cobertura{arrow('cobertura')}
                  </span>
                  <InfoIcon>
                    <div style={{ fontWeight: 700, marginBottom: 6, color: '#93c5fd' }}>Parâmetro normativo</div>
                    <div>
                      1 tomógrafo por <strong>100 mil habitantes SUS-dependentes</strong>
                    </div>
                    <div style={{ marginTop: 8, fontWeight: 700, color: '#93c5fd' }}>Coeficiente</div>
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 11,
                        marginTop: 4,
                        background: 'rgba(255,255,255,0.08)',
                        padding: '6px 8px',
                        borderRadius: 4,
                      }}
                    >
                      (Tomógrafos SUS × 100.000) ÷ População SUS-dependente
                    </div>
                    <div style={{ marginTop: 8, fontSize: 10, color: '#94a3b8' }}>
                      Ex.: 6 tomógrafos SUS ÷ 831.219 hab. × 100.000 = 0,72x — abaixo de 1x é Hipossuficiente, 1x ou
                      mais é Hiperssuficiente. A listra no meio da barra marca exatamente o coeficiente 1.
                    </div>
                  </InfoIcon>
                </span>
              </th>
              <th style={{ padding: '10px 18px 10px 34px', fontWeight: 600, width: 220 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ cursor: 'pointer' }} onClick={() => toggleSort('status')}>
                    Status{arrow('status')}
                  </span>
                  <InfoIcon align="right">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#B40D0D', flexShrink: 0 }} />
                      <div>
                        <strong style={{ color: '#fca5a5' }}>Hipossuficiente</strong>
                        <br />
                        coeficiente &lt; 1x
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#2F6A1D', flexShrink: 0 }} />
                      <div>
                        <strong style={{ color: '#86efac' }}>Hiperssuficiente</strong>
                        <br />
                        coeficiente ≥ 1x
                      </div>
                    </div>
                  </InfoIcon>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rowsPaginadas.map((r) => {
              const macro = macroById.get(r.macroId);
              if (!macro) return null;
              // Coeficiente = (tomógrafos SUS x 100.000) / população SUS-dependente
              // -- quantos tomógrafos por 100 mil habitantes essa macro tem, sem
              // arredondar a demanda (diferente de required_qty, que é ceil).
              // A listra no meio da barra é o coeficiente 1 (a meta exata);
              // acima enche mais (hiper/verde), abaixo enche menos (hipo/vermelho).
              const coeficiente = macro.pop > 0 ? (r.oferta * 100_000) / macro.pop : null;
              const hiper = coeficiente != null && coeficiente >= 1;
              // cor do texto/rotulo -- mais escura, pra leitura -- e cor do
              // preenchimento da barra -- mais clara, pra listra central (o
              // coeficiente 1) continuar visivel por cima.
              const corTexto = coeficiente == null ? colors.subtleText : hiper ? colors.hiperGreen : colors.hipoRed;
              const corBarra = coeficiente == null ? colors.subtleText : hiper ? colors.hiperGreenBarra : colors.hipoRedBarra;
              const fillPercent = coeficiente != null ? Math.min(100, coeficiente * 50) : 0;
              const expandida = expandidas.has(r.macroId);
              const dados = dadosPorMacro[r.macroId];
              return (
                <Fragment key={r.macroId}>
                <tr
                  onClick={() => toggleExpandida(r.macroId)}
                  style={{ borderTop: '1px solid #f0f1f5', cursor: 'pointer' }}
                >
                  <td style={{ padding: '9px 8px 9px 18px', fontFamily: 'monospace', fontSize: 11.5, color: '#98a0b3' }}>
                    {macro.id}
                  </td>
                  <td style={{ padding: '9px 6px 9px 8px', fontWeight: 500 }}>
                    <span
                      style={{
                        fontSize: 10,
                        color: '#98a0b3',
                        display: 'inline-block',
                        marginRight: 6,
                        transform: expandida ? 'rotate(90deg)' : 'none',
                        transition: 'transform 0.15s',
                      }}
                    >
                      ▶
                    </span>
                    {macro.nome}
                  </td>
                  <td style={{ padding: '9px 8px 9px 6px', color: '#667085' }}>{macro.uf}</td>
                  <td style={{ padding: '9px 8px 9px 10px', textAlign: 'right', color: '#475066' }}>
                    {macro.pop.toLocaleString('pt-BR')}
                  </td>
                  <td style={{ padding: '9px 32px 9px 8px', minWidth: 160 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div
                        style={{
                          flex: 1,
                          position: 'relative',
                          height: 8,
                          borderRadius: 4,
                          background: '#eef0f4',
                          overflow: 'clip',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            height: '100%',
                            width: `${fillPercent}%`,
                            background: corBarra,
                          }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: '50%',
                            width: 2,
                            background: '#475066',
                            borderRadius: 1,
                            transform: 'translateX(-50%)',
                          }}
                        />
                      </div>
                      <div style={{ width: 118 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 600, color: corTexto }}>
                          {coeficiente != null ? formatMultiplicador(coeficiente) : '—'}
                        </div>
                        <div style={{ fontSize: 10, color: '#98a0b3' }}>
                          {r.oferta} tomógrafo{r.oferta === 1 ? '' : 's'} SUS
                          {r.ofertaTotal !== r.oferta && ` de ${r.ofertaTotal} no total`}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '9px 18px 9px 34px' }}>
                    <StatusBadge cobertura={r.cobertura} />
                  </td>
                </tr>
                {expandida && (
                  <tr style={{ background: '#eef1f6' }}>
                    <td colSpan={6} style={{ padding: '10px 18px 12px 42px' }}>
                      {dados === 'carregando' && (
                        <div style={{ fontSize: 12, color: '#98a0b3' }}>Carregando regiões de saúde...</div>
                      )}
                      {dados === 'erro' && (
                        <div style={{ fontSize: 12, color: '#B40D0D' }}>Não foi possível carregar as regiões de saúde.</div>
                      )}
                      {Array.isArray(dados) && dados.length === 0 && (
                        <div style={{ fontSize: 12, color: '#98a0b3' }}>Nenhuma cidade com estabelecimento cadastrado.</div>
                      )}
                      {Array.isArray(dados) && dados.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {dados.map((regiao) => {
                            const chaveRegiao = `${r.macroId}::${regiao.codigo || regiao.nome}`;
                            const regiaoAberta = regioesExpandidas.has(chaveRegiao);
                            const totalEstabelecimentos = regiao.cidades.reduce((s, c) => s + c.estabelecimentos, 0);
                            const totalTomografos = regiao.cidades.reduce((s, c) => s + c.qtd, 0);
                            return (
                              <div key={regiao.codigo || regiao.nome} style={{ borderTop: '1px solid #e2e6ee' }}>
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleRegiaoExpandida(chaveRegiao);
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '7px 4px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: 9,
                                      color: '#98a0b3',
                                      display: 'inline-block',
                                      transform: regiaoAberta ? 'rotate(90deg)' : 'none',
                                      transition: 'transform 0.15s',
                                    }}
                                  >
                                    ▶
                                  </span>
                                  {regiao.codigo && (
                                    <span style={{ fontFamily: 'monospace', fontSize: 10.5, color: '#98a0b3' }}>
                                      {regiao.codigo}
                                    </span>
                                  )}
                                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#475066' }}>{regiao.nome}</span>
                                  <span style={{ fontSize: 10.5, color: '#98a0b3', marginLeft: 'auto' }}>
                                    {regiao.cidades.length} cidade{regiao.cidades.length === 1 ? '' : 's'} ·{' '}
                                    {totalEstabelecimentos} estabelecimento{totalEstabelecimentos === 1 ? '' : 's'} ·{' '}
                                    {totalTomografos} tomógrafo{totalTomografos === 1 ? '' : 's'}
                                  </span>
                                </div>
                                {regiaoAberta && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '2px 4px 10px 22px' }}>
                                    {regiao.cidades.map((c) => {
                                      const chave = `${c.municipio}|${macro.uf}`;
                                      const selecionada = municipiosSelecionados.includes(chave);
                                      return (
                                        <div
                                          key={c.municipio}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onSelecionarMunicipio(chave, macro.id, regiao.codigo);
                                          }}
                                          title={`Filtrar por ${c.municipio}`}
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            background: selecionada ? '#eef2ff' : '#fff',
                                            border: `1px solid ${selecionada ? '#1a3a9c' : '#dde2ea'}`,
                                            borderRadius: 6,
                                            padding: '5px 12px',
                                            cursor: 'pointer',
                                          }}
                                        >
                                          <span style={{ fontSize: 12, fontWeight: 600, color: '#16213e' }}>
                                            {c.municipio}
                                          </span>
                                          <span style={{ fontSize: 10, color: '#98a0b3' }}>
                                            {c.estabelecimentos} estabelecimento{c.estabelecimentos === 1 ? '' : 's'}
                                          </span>
                                          <span
                                            style={{
                                              fontSize: 11,
                                              color: '#fff',
                                              background: '#1a3a9c',
                                              borderRadius: 20,
                                              padding: '1px 7px',
                                              fontWeight: 700,
                                            }}
                                          >
                                            {c.qtd}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalItems={rowsOrdenadas.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </>
  );
}
