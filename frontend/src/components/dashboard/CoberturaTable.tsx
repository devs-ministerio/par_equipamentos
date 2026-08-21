import { Fragment, useEffect, useMemo, useState } from 'react';
import type { CoberturaRow, Macrorregiao } from '../../types/domain';
import { statusMeta } from '../../utils/status';
import { formatMilhar, formatMultiplicador } from '../../utils/format';
import { InfoIcon } from '../common/InfoIcon';
import { StatusBadge } from '../common/StatusBadge';
import { SearchInput } from '../common/SearchInput';
import { Pagination } from '../common/Pagination';
import { fetchEstabelecimentosPage } from '../../services/api';
import { normalizarTexto } from '../../utils/texto';

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

export function CoberturaTable({ equipmentFamily, rows, macros, onSelecionarMunicipio, municipiosSelecionados }: Props) {
  const macroById = useMemo(() => new Map(macros.map((m) => [m.id, m])), [macros]);
  const [busca, setBusca] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('macro');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [regioesExpandidas, setRegioesExpandidas] = useState<Set<string>>(new Set());
  const [dadosPorMacro, setDadosPorMacro] = useState<Record<string, DadosMacro>>({});
  const [page, setPage] = useState(1);

  // volta pra pagina 1 quando busca/ordenacao mudar -- senao pode sobrar numa
  // pagina que nao existe mais depois de filtrar.
  useEffect(() => setPage(1), [busca, sortKey, sortDir]);

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
    const termo = normalizarTexto(busca.trim());
    if (!termo) return rows;
    return rows.filter((r) => {
      const macro = macroById.get(r.macroId);
      const alvo = normalizarTexto(`${macro?.id ?? ''} ${macro?.nome ?? ''} ${macro?.uf ?? ''}`);
      return alvo.includes(termo);
    });
  }, [rows, macroById, busca]);

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
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 18px 10px' }}>
        <SearchInput value={busca} onChange={setBusca} placeholder="Buscar por macrorregião ou UF..." />
      </div>
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
                      1 tomógrafo por <strong>100 mil habitantes</strong>
                    </div>
                    <div style={{ marginTop: 8, fontWeight: 700, color: '#93c5fd' }}>Fórmula</div>
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
                      População SUS-dependente ÷ Tomógrafos SUS
                    </div>
                    <div style={{ marginTop: 8, fontSize: 10, color: '#94a3b8' }}>
                      Mostrado como pessoas por aparelho (ex.: 23,4k/1) e como multiplicador da meta (ex.: 3,90x) —
                      quanto maior o multiplicador, menos pessoas cada tomógrafo atende em média.
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
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#2F6A1D', flexShrink: 0 }} />
                      <div>
                        <strong style={{ color: '#86efac' }}>Hiperssuficiente</strong>
                        <br />
                        hab./aparelho ≤ 100 mil
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#B40D0D', flexShrink: 0 }} />
                      <div>
                        <strong style={{ color: '#fca5a5' }}>Hipossuficiente</strong>
                        <br />
                        hab./aparelho &gt; 100 mil
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
              const meta = statusMeta(r.cobertura);
              // pessoas por equipamento -- a listra no meio da barra e a
              // meta oficial (100 mil/aparelho); a barra enche PRA MENOS
              // quanto melhor a cobertura (menos gente dividindo o mesmo
              // aparelho), entao passar da listra = pior que a meta.
              const pessoasPorEquip = r.oferta > 0 ? macro.pop / r.oferta : null;
              const fillPercent = pessoasPorEquip != null ? Math.min(100, (pessoasPorEquip / 100_000) * 50) : 0;
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
                    <div style={{ fontSize: 10, color: '#98a0b3', fontWeight: 400 }}>
                      de {macro.popResidente.toLocaleString('pt-BR')} IBGE (−{macro.popAns.toLocaleString('pt-BR')} ANS)
                    </div>
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
                            background: meta.color,
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
                      {pessoasPorEquip != null ? (
                        <div style={{ width: 92 }}>
                          <div style={{ fontSize: 11.5, fontWeight: 600, color: meta.color }}>
                            {r.oferta} tomógrafo{r.oferta === 1 ? '' : 's'}
                          </div>
                          <div style={{ fontSize: 10, color: '#98a0b3' }}>
                            {formatMilhar(pessoasPorEquip)}/1 · {formatMultiplicador(r.cobertura / 100)}
                          </div>
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 600, color: meta.color, width: 92 }}>—</span>
                      )}
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
