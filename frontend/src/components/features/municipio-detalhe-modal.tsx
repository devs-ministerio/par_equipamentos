import { useQuery } from '@tanstack/react-query';
import type { NivelCoberturaRow, StatusCobertura } from '@/types/domain';
import { calcularCoeficiente } from '@/utils/coeficiente';
import { formatMultiplicador } from '@/utils/format';
import { fetchHealthRegionCoverage, fetchMacroCoverage } from '@/services/api';
import { Modal } from '@/components/common/modal';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { getEquipamento, formatarQuantidadeEquipamento } from '@/data/constants';

interface Props {
  linha: NivelCoberturaRow;
  equipmentFamily: string;
  onClose: () => void;
}

interface NivelComparado {
  rotulo: string;
  oferta: number;
  pop: number;
  cobertura: number;
  status: StatusCobertura;
}

type NivelComparadoQuery = NivelComparado | 'carregando' | 'erro';

/**
 * Detalhe do municipio -- o proprio municipio nao pede nada de novo (a linha
 * ja traz tudo do /municipality-coverage que alimentou a subcamada); so o
 * comparativo com a Regiao de Saude e a Macrorregiao dele busca sob
 * demanda, e so quando o modal abre (2 requisicoes pequenas, uma delas ja
 * filtrada por macro_code) -- nada disso e pre-carregado em bloco.
 */
export function MunicipioDetalheModal({ linha, equipmentFamily, onClose }: Props) {
  const produtividade = getEquipamento(equipmentFamily).produtividade;

  // Comparativo com a Macrorregiao dele -- so busca sob demanda quando o
  // modal abre (queryKey inclui macroId: mudar de municipio dentro do mesmo
  // modal -- nao acontece hoje, mas se acontecesse -- e uma query nova
  // automaticamente, sem guarda manual).
  const macroQuery = useQuery({
    queryKey: ['municipio-detalhe-macro', equipmentFamily, linha.macroId],
    queryFn: async (): Promise<NivelComparado | null> => {
      const { macros, coberturaRows } = await fetchMacroCoverage(equipmentFamily, [linha.macroId!]);
      const m = macros[0];
      const c = coberturaRows[0];
      return m && c ? { rotulo: m.nome, oferta: c.oferta, pop: m.pop, cobertura: c.cobertura, status: c.status } : null;
    },
    enabled: Boolean(linha.macroId),
  });

  // Comparativo com a Regiao de Saude dele -- mesma logica, sob demanda.
  const regiaoQuery = useQuery({
    queryKey: ['municipio-detalhe-regiao', equipmentFamily, linha.macroId, linha.regiaoSaudeId],
    queryFn: async (): Promise<NivelComparado | null> => {
      const rows = await fetchHealthRegionCoverage({ equipmentFamily, macroCodes: [linha.macroId!] });
      const propria = rows.find((r) => r.chave === linha.regiaoSaudeId);
      return propria
        ? { rotulo: propria.nome, oferta: propria.oferta, pop: propria.pop, cobertura: propria.cobertura, status: propria.status }
        : null;
    },
    enabled: Boolean(linha.macroId),
  });

  function paraNivelComparado(query: typeof macroQuery): NivelComparadoQuery {
    if (!linha.macroId) return 'erro';
    if (query.isLoading) return 'carregando';
    if (query.isError || query.data == null) return 'erro';
    return query.data;
  }

  const macro = paraNivelComparado(macroQuery);
  const regiao = paraNivelComparado(regiaoQuery);

  return (
    <Modal onClose={onClose} maxWidth={460}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-extrabold text-foreground">{linha.nome}</div>
          <div className="mt-1 text-[12.5px] text-muted-foreground">
            {linha.uf} · {linha.macroNome ?? 'Macrorregião não informada'} · {linha.regiaoSaudeNome ?? 'Região de saúde não informada'}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="cursor-pointer border-none bg-transparent p-1 text-xl leading-none text-muted-foreground"
        >
          ✕
        </button>
      </div>

      <div className="mt-1.5 text-[11.5px] text-muted-foreground">
        {linha.pop.toLocaleString('pt-BR')} hab. SUS-dependentes · {formatarQuantidadeEquipamento(linha.oferta)} SUS
        {linha.ofertaTotal !== linha.oferta && ` (${linha.ofertaTotal} no total)`}
      </div>

      {/* So informativo -- NAO entra na classificacao Hipo/Hiper (que
          continua so populacional). Distancia geografica ate o equipamento
          SUS geocodificado mais proximo, em qualquer lugar do pais -- metade
          do criterio normativo do Tomografo (Caderno 1: "100 mil hab. OU
          raio de 75 km") que so tinha a parte populacional aplicada
          (decisao 2026-08-23: aplicar o "OR" na classificacao oficial fica
          pendente -- os dados mostraram que isso mudaria 99,95% dos
          municipios hoje "deficient" pra "nao deficient" contando qualquer
          equipamento do Brasil, sinal forte de que o raio precisa respeitar
          rede de referencia/regiao, nao distancia nacional pura). So
          aparece pra familias cujo pipeline calcula isso (so TOMOGRAFO). */}
      {linha.distanciaKmEquipamentoMaisProximo != null && (
        <div
          className={
            linha.distanciaKmEquipamentoMaisProximo <= 75
              ? 'mt-2 rounded-md bg-success/15 px-2.5 py-1.5 text-[11.5px] text-success'
              : 'mt-2 rounded-md bg-destructive/10 px-2.5 py-1.5 text-[11.5px] text-destructive'
          }
        >
          {linha.distanciaKmEquipamentoMaisProximo.toFixed(0)} km até o tomógrafo SUS mais próximo
          {linha.distanciaKmEquipamentoMaisProximo <= 75 ? ' (dentro do raio de 75 km)' : ' (fora do raio de 75 km)'}
        </div>
      )}

      <div className="mt-4 text-[11px] font-bold tracking-wide text-[#93c5fd] uppercase">Cobertura por nível</div>
      <table className="mt-2 w-full border-collapse text-[13px]">
        <tbody>
          <LinhaNivel rotulo="Município" oferta={linha.oferta} pop={linha.pop} status={linha.status} produtividade={produtividade} />
          <LinhaComparada rotulo="Região de saúde" dado={regiao} produtividade={produtividade} />
          <LinhaComparada rotulo="Macrorregião" dado={macro} produtividade={produtividade} />
        </tbody>
      </table>

      <Button variant="outline" onClick={onClose} className="mt-5 h-auto w-full py-2.75 text-[13px] font-semibold">
        Fechar
      </Button>
    </Modal>
  );
}

function LinhaNivel({
  rotulo,
  oferta,
  pop,
  status,
  produtividade,
}: {
  rotulo: string;
  oferta: number;
  pop: number;
  status: StatusCobertura;
  produtividade: number;
}) {
  const coef = calcularCoeficiente(oferta, pop, produtividade);
  return (
    <tr className="border-t border-border">
      <td className="py-2 pr-2 pl-0 font-medium text-foreground">{rotulo}</td>
      <td className="py-2 px-2 text-right font-bold" style={{ color: coef.corTexto }}>
        {coef.valor != null ? formatMultiplicador(coef.valor) : '—'}
      </td>
      <td className="py-2 pr-0 pl-2 text-right">
        <StatusBadge status={status} />
      </td>
    </tr>
  );
}

function LinhaComparada({
  rotulo,
  dado,
  produtividade,
}: {
  rotulo: string;
  dado: NivelComparado | 'carregando' | 'erro';
  produtividade: number;
}) {
  if (dado === 'carregando') {
    return (
      <tr className="border-t border-border">
        <td className="py-2 pr-2 pl-0 font-medium text-foreground">{rotulo}</td>
        <td colSpan={2} className="py-2 px-2 text-right text-xs text-muted-foreground">
          Carregando...
        </td>
      </tr>
    );
  }
  if (dado === 'erro') {
    return (
      <tr className="border-t border-border">
        <td className="py-2 pr-2 pl-0 font-medium text-foreground">{rotulo}</td>
        <td colSpan={2} className="py-2 px-2 text-right text-xs text-muted-foreground">
          Não disponível
        </td>
      </tr>
    );
  }
  return <LinhaNivel rotulo={rotulo} oferta={dado.oferta} pop={dado.pop} status={dado.status} produtividade={produtividade} />;
}
