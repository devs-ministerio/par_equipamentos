import { useEffect, useState } from 'react';
import type { ClasseEquipamento } from '@/types/dados-oficiais';

export const TAMANHO_PAGINA_DADOS_OFICIAIS = 20;

export function useDadosOficiaisFiltros() {
  const [busca, setBusca] = useState('');
  const [uf, setUf] = useState<string | null>(null);
  const [equipamento, setEquipamento] = useState<string | null>(null);
  const [classeEquipamento, setClasseEquipamento] = useState<ClasseEquipamento>('prioritario');
  const [situacao, setSituacao] = useState<string | null>(null);
  const [ano, setAno] = useState<string | null>(null);
  const [programa, setPrograma] = useState<string | null>(null);
  const [tipoContratacao, setTipoContratacao] = useState<string | null>(null);
  const [soMonitorados, setSoMonitorados] = useState(false);
  const [pagina, setPagina] = useState(1);

  const limparFiltros = () => {
    setBusca('');
    setUf(null);
    setEquipamento(null);
    setClasseEquipamento('prioritario');
    setSituacao(null);
    setAno(null);
    setPrograma(null);
    setTipoContratacao(null);
    setSoMonitorados(false);
  };

  const hasFiltros = Boolean(busca || uf || equipamento || situacao || ano || programa || tipoContratacao || soMonitorados || classeEquipamento !== 'prioritario');

  useEffect(() => setPagina(1), [busca, uf, equipamento, situacao, ano, programa, tipoContratacao, soMonitorados, classeEquipamento]);
  useEffect(() => setEquipamento(null), [classeEquipamento]);

  return {
    busca, setBusca, uf, setUf, equipamento, setEquipamento,
    classeEquipamento, setClasseEquipamento, situacao, setSituacao,
    ano, setAno, programa, setPrograma, tipoContratacao, setTipoContratacao,
    soMonitorados, setSoMonitorados, pagina, setPagina,
    pageSize: TAMANHO_PAGINA_DADOS_OFICIAIS, hasFiltros, limparFiltros,
  };
}
