import { useEffect, useMemo, useState } from 'react';
import { UF_INFO } from '../data/geoReference';
import type { FacilityOption } from '../services/api';
import type { CoberturaRow, Macrorregiao } from '../types/domain';

interface FiltroOption {
  value: string;
  label: string;
}

interface UseFiltrosMacroParams {
  equipmentFamily: string;
  macros: Macrorregiao[];
  coberturaRows: CoberturaRow[];
  /** Lista completa (sem filtro) de estabelecimentos por CNES -- base unica
   * de onde TODAS as opcoes de filtro sao derivadas localmente, o que
   * garante cascata bidirecional (ver comentario grande mais abaixo). */
  facilities: FacilityOption[];
  inicial?: {
    regioes?: string[];
    ufs?: string[];
    macros?: string[];
    regioesSaude?: string[];
    municipios?: string[];
    cnes?: string[];
  };
}

type Dimensao = 'regiao' | 'uf' | 'macro' | 'regiaoSaude' | 'municipio' | 'cnes';

/**
 * Estado + logica dos filtros (Regiao / UF / Macro / Regiao de Saude /
 * Municipio / CNES) usados no Dashboard e, com uma instancia independente,
 * nos popups de exportacao -- extraido pra hook pra nao duplicar essa logica
 * entre os varios lugares (cada instancia tem seu proprio estado, isolado).
 *
 * Cascata bidirecional: as opcoes de cada dropdown sao calculadas filtrando
 * `facilities` por TODOS os outros filtros ja selecionados (menos o proprio
 * dropdown) -- ex.: escolher um Municipio restringe as opcoes de UF, Macro,
 * Regiao de Saude e CNES que aparecem, e vice-versa em qualquer direcao.
 * CNES e mais um filtro de estabelecimento igual aos demais nessa cascata;
 * a unica diferenca e que ele nao entra no calculo dos cards (que usam
 * `filteredRows`, agregado por macro) alem do que o proprio cascateamento
 * automatico (Municipio/Regiao de Saude/Macro/UF/Regiao implicados pelo CNES
 * escolhido) ja afeta.
 */
export function useFiltrosMacro({ equipmentFamily: _equipmentFamily, macros, coberturaRows, facilities, inicial }: UseFiltrosMacroParams) {
  const [filtroRegioes, setFiltroRegioes] = useState<string[]>(inicial?.regioes ?? []);
  const [filtroUfs, setFiltroUfs] = useState<string[]>(inicial?.ufs ?? []);
  const [filtroMacros, setFiltroMacros] = useState<string[]>(inicial?.macros ?? []);
  const [filtroRegioesSaude, setFiltroRegioesSaude] = useState<string[]>(inicial?.regioesSaude ?? []);
  const [filtroMunicipios, setFiltroMunicipios] = useState<string[]>(inicial?.municipios ?? []);
  const [filtroCnes, setFiltroCnes] = useState<string[]>(inicial?.cnes ?? []);

  // matches: um estabelecimento bate com os filtros selecionados, ignorando
  // (opcionalmente) uma dimensao -- usado pra montar as opcoes de cada
  // dropdown a partir de todos os OUTROS filtros ja escolhidos.
  function matches(f: FacilityOption, ignorar?: Dimensao): boolean {
    if (ignorar !== 'regiao' && filtroRegioes.length > 0) {
      const regiao = UF_INFO[f.uf]?.regiao;
      if (!regiao || !filtroRegioes.includes(regiao)) return false;
    }
    if (ignorar !== 'uf' && filtroUfs.length > 0 && !filtroUfs.includes(f.uf)) return false;
    if (ignorar !== 'macro' && filtroMacros.length > 0 && (!f.macroId || !filtroMacros.includes(f.macroId))) return false;
    if (
      ignorar !== 'regiaoSaude' &&
      filtroRegioesSaude.length > 0 &&
      (!f.regiaoSaudeId || !filtroRegioesSaude.includes(f.regiaoSaudeId))
    )
      return false;
    if (
      ignorar !== 'municipio' &&
      filtroMunicipios.length > 0 &&
      (!f.municipioChave || !filtroMunicipios.includes(f.municipioChave))
    )
      return false;
    if (ignorar !== 'cnes' && filtroCnes.length > 0 && !filtroCnes.includes(f.cnes)) return false;
    return true;
  }

  const ufOptions = useMemo(() => {
    const vistos = new Set<string>();
    facilities.forEach((f) => {
      if (matches(f, 'uf')) vistos.add(f.uf);
    });
    return [...vistos].sort().map((uf) => ({ value: uf, label: uf }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilities, filtroRegioes, filtroUfs, filtroMacros, filtroRegioesSaude, filtroMunicipios, filtroCnes]);

  const macroOptions = useMemo(() => {
    const vistos = new Map<string, FiltroOption>();
    facilities.forEach((f) => {
      if (f.macroId && matches(f, 'macro')) {
        vistos.set(f.macroId, { value: f.macroId, label: `${f.macroId} · ${f.macroNome ?? f.macroId} (${f.uf})` });
      }
    });
    return [...vistos.values()].sort((a, b) => a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilities, filtroRegioes, filtroUfs, filtroMacros, filtroRegioesSaude, filtroMunicipios, filtroCnes]);

  const regiaoSaudeOptions = useMemo(() => {
    const vistos = new Map<string, FiltroOption>();
    facilities.forEach((f) => {
      if (f.regiaoSaudeId && matches(f, 'regiaoSaude')) {
        vistos.set(f.regiaoSaudeId, {
          value: f.regiaoSaudeId,
          label: `${f.regiaoSaudeId} · ${f.regiaoSaudeNome ?? f.regiaoSaudeId} (${f.uf})`,
        });
      }
    });
    return [...vistos.values()].sort((a, b) => a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilities, filtroRegioes, filtroUfs, filtroMacros, filtroRegioesSaude, filtroMunicipios, filtroCnes]);

  const municipioOptions = useMemo(() => {
    const vistos = new Map<string, FiltroOption>();
    facilities.forEach((f) => {
      if (f.municipioChave && matches(f, 'municipio')) {
        const [nome] = f.municipioChave.split('|');
        vistos.set(f.municipioChave, { value: f.municipioChave, label: `${nome} (${f.uf})` });
      }
    });
    return [...vistos.values()].sort((a, b) => a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilities, filtroRegioes, filtroUfs, filtroMacros, filtroRegioesSaude, filtroMunicipios, filtroCnes]);

  const cnesOptions = useMemo(() => {
    const opcoes: FiltroOption[] = [];
    facilities.forEach((f) => {
      if (matches(f, 'cnes')) opcoes.push({ value: f.cnes, label: `${f.nome} · CNES ${f.cnes} (${f.uf})` });
    });
    return opcoes.sort((a, b) => a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilities, filtroRegioes, filtroUfs, filtroMacros, filtroRegioesSaude, filtroMunicipios, filtroCnes]);

  // macros implicadas pelos filtros de Regiao de Saude / Municipio / CNES --
  // nenhum desses tem coluna propria em macro_coverage (agregado por macro),
  // entao a forma de "filtrar cobertura" por eles e resolver pra sua(s)
  // macro(s) (via `facilities`) e filtrar a tabela por ela.
  const macrosImplicadasPor = useMemo(() => {
    function macrosDe(pred: (f: FacilityOption) => boolean): Set<string> | null {
      const set = new Set<string>();
      let algum = false;
      facilities.forEach((f) => {
        if (pred(f)) {
          algum = true;
          if (f.macroId) set.add(f.macroId);
        }
      });
      return algum ? set : null;
    }
    return {
      regiaoSaude:
        filtroRegioesSaude.length > 0
          ? macrosDe((f) => Boolean(f.regiaoSaudeId && filtroRegioesSaude.includes(f.regiaoSaudeId)))
          : null,
      municipio:
        filtroMunicipios.length > 0
          ? macrosDe((f) => Boolean(f.municipioChave && filtroMunicipios.includes(f.municipioChave)))
          : null,
      cnes: filtroCnes.length > 0 ? macrosDe((f) => filtroCnes.includes(f.cnes)) : null,
    };
  }, [facilities, filtroRegioesSaude, filtroMunicipios, filtroCnes]);

  const filteredRows = useMemo(() => {
    return coberturaRows.filter((r) => {
      const macro = macros.find((m) => m.id === r.macroId);
      if (!macro) return false;
      if (filtroRegioes.length > 0 && !filtroRegioes.includes(macro.regiao)) return false;
      if (filtroUfs.length > 0 && !filtroUfs.includes(macro.uf)) return false;
      if (filtroMacros.length > 0 && !filtroMacros.includes(macro.id)) return false;
      if (macrosImplicadasPor.regiaoSaude && !macrosImplicadasPor.regiaoSaude.has(macro.id)) return false;
      if (macrosImplicadasPor.municipio && !macrosImplicadasPor.municipio.has(macro.id)) return false;
      if (macrosImplicadasPor.cnes && !macrosImplicadasPor.cnes.has(macro.id)) return false;
      return true;
    });
  }, [macros, coberturaRows, filtroRegioes, filtroUfs, filtroMacros, macrosImplicadasPor]);

  // Filtros resolvidos pro backend (regiao vira UF -- equipment_offer_row nao
  // tem coluna de regiao geografica -- macro, regiao de saude, municipio e
  // cnes ja sao filtros diretos que os endpoints aceitam).
  const estadosFiltro = useMemo(() => {
    if (filtroUfs.length > 0) return filtroUfs;
    if (filtroRegioes.length > 0) {
      return [...new Set(macros.filter((m) => filtroRegioes.includes(m.regiao)).map((m) => m.uf))];
    }
    return undefined;
  }, [macros, filtroRegioes, filtroUfs]);

  const macrosFiltro = useMemo(() => (filtroMacros.length > 0 ? filtroMacros : undefined), [filtroMacros]);

  const regioesSaudeFiltro = useMemo(
    () => (filtroRegioesSaude.length > 0 ? filtroRegioesSaude : undefined),
    [filtroRegioesSaude],
  );

  const municipiosFiltro = useMemo(
    () => (filtroMunicipios.length > 0 ? filtroMunicipios : undefined),
    [filtroMunicipios],
  );

  const cnesFiltro = useMemo(() => (filtroCnes.length > 0 ? filtroCnes : undefined), [filtroCnes]);

  // marcacao automatica em cascata: selecionar um CNES, um Municipio, uma
  // Regiao de Saude ou uma Macro ja marca a UF e a Regiao aos quais
  // pertencem (e o CNES tambem marca Municipio/Regiao de Saude/Macro). So
  // adiciona (nunca remove sozinho) -- desmarcar continua manual, pra nao
  // apagar filtro que o usuario tenha escolhido por conta propria.
  useEffect(() => {
    const ufsImplicados = new Set<string>();
    const macrosImplicados = new Set<string>();
    const regioesSaudeImplicadas = new Set<string>();
    const municipiosImplicados = new Set<string>();

    facilities.forEach((f) => {
      const implicadoPorCnes = filtroCnes.includes(f.cnes);
      const implicadoPorMunicipio = Boolean(f.municipioChave && filtroMunicipios.includes(f.municipioChave));
      const implicadoPorRegiaoSaude = Boolean(f.regiaoSaudeId && filtroRegioesSaude.includes(f.regiaoSaudeId));
      const implicadoPorMacro = Boolean(f.macroId && filtroMacros.includes(f.macroId));

      if (implicadoPorCnes || implicadoPorMunicipio || implicadoPorRegiaoSaude || implicadoPorMacro) {
        ufsImplicados.add(f.uf);
      }
      if (implicadoPorCnes || implicadoPorMunicipio || implicadoPorRegiaoSaude) {
        if (f.macroId) macrosImplicados.add(f.macroId);
      }
      if (implicadoPorCnes) {
        if (f.regiaoSaudeId) regioesSaudeImplicadas.add(f.regiaoSaudeId);
        if (f.municipioChave) municipiosImplicados.add(f.municipioChave);
      }
    });

    if (macrosImplicados.size > 0) {
      setFiltroMacros((prev) => {
        const faltando = [...macrosImplicados].filter((id) => !prev.includes(id));
        return faltando.length > 0 ? [...prev, ...faltando] : prev;
      });
    }
    if (regioesSaudeImplicadas.size > 0) {
      setFiltroRegioesSaude((prev) => {
        const faltando = [...regioesSaudeImplicadas].filter((id) => !prev.includes(id));
        return faltando.length > 0 ? [...prev, ...faltando] : prev;
      });
    }
    if (municipiosImplicados.size > 0) {
      setFiltroMunicipios((prev) => {
        const faltando = [...municipiosImplicados].filter((id) => !prev.includes(id));
        return faltando.length > 0 ? [...prev, ...faltando] : prev;
      });
    }

    if (ufsImplicados.size === 0) return;

    const regioesImplicadas = new Set<string>();
    ufsImplicados.forEach((uf) => {
      const regiao = UF_INFO[uf]?.regiao;
      if (regiao) regioesImplicadas.add(regiao);
    });

    setFiltroUfs((prev) => {
      const faltando = [...ufsImplicados].filter((uf) => !prev.includes(uf));
      return faltando.length > 0 ? [...prev, ...faltando] : prev;
    });
    setFiltroRegioes((prev) => {
      const faltando = [...regioesImplicadas].filter((r) => !prev.includes(r));
      return faltando.length > 0 ? [...prev, ...faltando] : prev;
    });
  }, [facilities, filtroCnes, filtroMunicipios, filtroRegioesSaude, filtroMacros]);

  const hasAnyFilter =
    filtroRegioes.length > 0 ||
    filtroUfs.length > 0 ||
    filtroMacros.length > 0 ||
    filtroRegioesSaude.length > 0 ||
    filtroMunicipios.length > 0 ||
    filtroCnes.length > 0;

  function limparFiltros() {
    setFiltroRegioes([]);
    setFiltroUfs([]);
    setFiltroMacros([]);
    setFiltroRegioesSaude([]);
    setFiltroMunicipios([]);
    setFiltroCnes([]);
  }

  const filtrosResumo = useMemo(() => {
    const partes: string[] = [];
    if (filtroRegioes.length > 0) partes.push(`Região: ${filtroRegioes.join(', ')}`);
    if (filtroUfs.length > 0) partes.push(`UF: ${filtroUfs.join(', ')}`);
    if (filtroMacros.length > 0) {
      const nomes = filtroMacros.map((id) => macroOptions.find((o) => o.value === id)?.label ?? id);
      partes.push(`Macrorregião: ${nomes.join(', ')}`);
    }
    if (filtroRegioesSaude.length > 0) {
      const nomes = filtroRegioesSaude.map((codigo) => regiaoSaudeOptions.find((o) => o.value === codigo)?.label ?? codigo);
      partes.push(`Região de saúde: ${nomes.join(', ')}`);
    }
    if (filtroMunicipios.length > 0) {
      const nomes = filtroMunicipios.map((chave) => municipioOptions.find((o) => o.value === chave)?.label ?? chave);
      partes.push(`Município: ${nomes.join(', ')}`);
    }
    if (filtroCnes.length > 0) {
      const nomes = filtroCnes.map((cnes) => cnesOptions.find((o) => o.value === cnes)?.label ?? cnes);
      partes.push(`CNES: ${nomes.join(', ')}`);
    }
    return partes.join(' | ');
  }, [
    filtroRegioes,
    filtroUfs,
    filtroMacros,
    filtroRegioesSaude,
    filtroMunicipios,
    filtroCnes,
    macroOptions,
    regiaoSaudeOptions,
    municipioOptions,
    cnesOptions,
  ]);

  return {
    filtroRegioes,
    filtroUfs,
    filtroMacros,
    filtroRegioesSaude,
    filtroMunicipios,
    filtroCnes,
    setFiltroRegioes,
    setFiltroUfs,
    setFiltroMacros,
    setFiltroRegioesSaude,
    setFiltroMunicipios,
    setFiltroCnes,
    ufOptions,
    macroOptions,
    regiaoSaudeOptions,
    municipioOptions,
    cnesOptions,
    filteredRows,
    estadosFiltro,
    macrosFiltro,
    regioesSaudeFiltro,
    municipiosFiltro,
    cnesFiltro,
    hasAnyFilter,
    limparFiltros,
    filtrosResumo,
  };
}
