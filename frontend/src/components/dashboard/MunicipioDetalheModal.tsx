import { useEffect, useState } from 'react';
import type { NivelCoberturaRow } from '../../types/domain';
import { calcularCoeficiente } from '../../utils/coeficiente';
import { formatMultiplicador } from '../../utils/format';
import { fetchHealthRegionCoverage, fetchMacroCoverage } from '../../services/api';
import { Modal } from '../common/Modal';
import { StatusBadge } from '../common/StatusBadge';
import { colors } from '../../styles/tokens';
import { getEquipamento, formatarQuantidadeEquipamento } from '../../data/constants';

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
}

/**
 * Detalhe do municipio -- o proprio municipio nao pede nada de novo (a linha
 * ja traz tudo do /municipality-coverage que alimentou a subcamada); so o
 * comparativo com a Regiao de Saude e a Macrorregiao dele busca sob
 * demanda, e so quando o modal abre (2 requisicoes pequenas, uma delas ja
 * filtrada por macro_code) -- nada disso e pre-carregado em bloco.
 */
export function MunicipioDetalheModal({ linha, equipmentFamily, onClose }: Props) {
  const produtividade = getEquipamento(equipmentFamily).produtividade;
  const [regiao, setRegiao] = useState<NivelComparado | 'carregando' | 'erro'>('carregando');
  const [macro, setMacro] = useState<NivelComparado | 'carregando' | 'erro'>('carregando');

  useEffect(() => {
    let cancelado = false;

    if (linha.macroId) {
      fetchMacroCoverage(equipmentFamily, [linha.macroId])
        .then(({ macros, coberturaRows }) => {
          if (cancelado) return;
          const m = macros[0];
          const c = coberturaRows[0];
          setMacro(m && c ? { rotulo: m.nome, oferta: c.oferta, pop: m.pop, cobertura: c.cobertura } : 'erro');
        })
        .catch(() => !cancelado && setMacro('erro'));

      fetchHealthRegionCoverage({ equipmentFamily, macroCodes: [linha.macroId] })
        .then((rows) => {
          if (cancelado) return;
          const propria = rows.find((r) => r.chave === linha.regiaoSaudeId);
          setRegiao(
            propria
              ? { rotulo: propria.nome, oferta: propria.oferta, pop: propria.pop, cobertura: propria.cobertura }
              : 'erro',
          );
        })
        .catch(() => !cancelado && setRegiao('erro'));
    } else {
      setMacro('erro');
      setRegiao('erro');
    }

    return () => {
      cancelado = true;
    };
  }, [linha.macroId, linha.regiaoSaudeId, equipmentFamily]);

  return (
    <Modal onClose={onClose} maxWidth={460}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#16213e' }}>{linha.nome}</div>
          <div style={{ color: colors.mutedText, fontSize: 12.5, marginTop: 4 }}>
            {linha.uf} · {linha.macroNome ?? 'Macrorregião não informada'} · {linha.regiaoSaudeNome ?? 'Região de saúde não informada'}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Fechar"
          style={{ border: 'none', background: 'transparent', fontSize: 20, lineHeight: 1, color: colors.subtleText, cursor: 'pointer', padding: 4 }}
        >
          ✕
        </button>
      </div>

      <div style={{ marginTop: 6, fontSize: 11.5, color: colors.subtleText }}>
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
          style={{
            marginTop: 8,
            fontSize: 11.5,
            padding: '6px 10px',
            borderRadius: 6,
            background: linha.distanciaKmEquipamentoMaisProximo <= 75 ? colors.hiperGreenBg : colors.hipoRedBg,
            color: linha.distanciaKmEquipamentoMaisProximo <= 75 ? colors.hiperGreen : colors.hipoRed,
          }}
        >
          {linha.distanciaKmEquipamentoMaisProximo.toFixed(0)} km até o tomógrafo SUS mais próximo
          {linha.distanciaKmEquipamentoMaisProximo <= 75 ? ' (dentro do raio de 75 km)' : ' (fora do raio de 75 km)'}
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 11, fontWeight: 700, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Cobertura por nível
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
        <tbody>
          <LinhaNivel rotulo="Município" oferta={linha.oferta} pop={linha.pop} cobertura={linha.cobertura} produtividade={produtividade} />
          <LinhaComparada rotulo="Região de saúde" dado={regiao} produtividade={produtividade} />
          <LinhaComparada rotulo="Macrorregião" dado={macro} produtividade={produtividade} />
        </tbody>
      </table>

      <button
        onClick={onClose}
        style={{
          width: '100%',
          marginTop: 20,
          padding: 11,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          background: '#fff',
          color: '#475066',
          fontWeight: 600,
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        Fechar
      </button>
    </Modal>
  );
}

function LinhaNivel({
  rotulo,
  oferta,
  pop,
  cobertura,
  produtividade,
}: {
  rotulo: string;
  oferta: number;
  pop: number;
  cobertura: number;
  produtividade: number;
}) {
  const coef = calcularCoeficiente(oferta, pop, produtividade);
  return (
    <tr style={{ borderTop: '1px solid #f0f1f5' }}>
      <td style={{ padding: '8px 8px 8px 0', color: '#16213e', fontWeight: 500 }}>{rotulo}</td>
      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: coef.corTexto }}>
        {coef.valor != null ? formatMultiplicador(coef.valor) : '—'}
      </td>
      <td style={{ padding: '8px 0 8px 8px', textAlign: 'right' }}>
        <StatusBadge cobertura={cobertura} />
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
      <tr style={{ borderTop: '1px solid #f0f1f5' }}>
        <td style={{ padding: '8px 8px 8px 0', color: '#16213e', fontWeight: 500 }}>{rotulo}</td>
        <td colSpan={2} style={{ padding: '8px', textAlign: 'right', color: colors.subtleText, fontSize: 12 }}>
          Carregando...
        </td>
      </tr>
    );
  }
  if (dado === 'erro') {
    return (
      <tr style={{ borderTop: '1px solid #f0f1f5' }}>
        <td style={{ padding: '8px 8px 8px 0', color: '#16213e', fontWeight: 500 }}>{rotulo}</td>
        <td colSpan={2} style={{ padding: '8px', textAlign: 'right', color: colors.subtleText, fontSize: 12 }}>
          Não disponível
        </td>
      </tr>
    );
  }
  return <LinhaNivel rotulo={rotulo} oferta={dado.oferta} pop={dado.pop} cobertura={dado.cobertura} produtividade={produtividade} />;
}
