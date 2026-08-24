import type { ReactNode } from 'react';
import { colors } from '../styles/tokens';
import { getEquipamento } from '../data/constants';

function FonteItem({ n, titulo, url, urlLabel }: { n: number; titulo: string; url: string; urlLabel: string }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div
        style={{
          minWidth: 28,
          height: 28,
          borderRadius: '50%',
          background: '#e8f0fb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 700,
          color: colors.primary,
        }}
      >
        {n}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#16213e' }}>{titulo}</div>
        <div style={{ fontSize: 12, color: colors.primary, lineHeight: 1.5 }}>
          <a href={url} target="_blank" rel="noreferrer" style={{ color: colors.primary }}>
            {urlLabel}
          </a>
        </div>
      </div>
    </div>
  );
}

interface ParametrosFamilia {
  nomeSingular: string;
  nomePlural: string;
  parametroTitulo: string;
  parametroDescricao: ReactNode;
  produtividade: number;
  formulaDenominador: ReactNode;
  notaCriterio: ReactNode;
  codigoElasticnes: string;
}

const PARAMETROS_POR_FAMILIA: Record<string, ParametrosFamilia> = {
  TOMOGRAFO: {
    nomeSingular: '1 tomógrafo',
    nomePlural: 'tomógrafos',
    parametroTitulo: '1 tomógrafo',
    parametroDescricao: (
      <>
        por <strong>100 mil habitantes </strong>ou raio de <strong>75 km </strong>
        <span style={{ fontSize: 11, color: colors.subtleText }}>o que for atingido primeiro</span>
      </>
    ),
    produtividade: getEquipamento('TOMOGRAFO').produtividade,
    formulaDenominador: <>Pop. SUS-dep. / 100.000</>,
    notaCriterio: (
      <>Critério de acesso: raio ≤ 75 km <em>ou</em> ≤ 100 mil hab. (o que for atingido primeiro), com foco em urgência/emergência.</>
    ),
    codigoElasticnes: 'Cód. 11 (e 26 a 30, por nº de canais)',
  },
  RESSONANCIA: {
    nomeSingular: '1 ressonância magnética',
    nomePlural: 'ressonâncias magnéticas',
    parametroTitulo: '5.000 exames/ano',
    parametroDescricao: (
      <>
        de capacidade por equipamento, com necessidade estimada de <strong>30 exames/1.000 habitantes/ano</strong>
      </>
    ),
    produtividade: getEquipamento('RESSONANCIA').produtividade,
    formulaDenominador: <>Pop. SUS-dep. / 166.667</>,
    notaCriterio: (
      <>
        Produtividade equivalente: 5.000 exames/ano ÷ (30 exames/1.000 hab.) = <strong>1 equipamento a cada ~166.667 habitantes</strong>.
      </>
    ),
    codigoElasticnes: 'Cód. 12 (e 32 a 35, por campo em Tesla)',
  },
};

function formatarProdutividade(produtividade: number): string {
  return Math.round(produtividade).toLocaleString('pt-BR');
}

export function MetodologiaPage({ equipmentFamily = 'TOMOGRAFO' }: { equipmentFamily?: string }) {
  const p = PARAMETROS_POR_FAMILIA[equipmentFamily] ?? PARAMETROS_POR_FAMILIA.TOMOGRAFO;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: '28px 32px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: colors.primary, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
          Escopo
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#16213e', marginBottom: 8 }}>Verificação por Município</div>
        <div style={{ fontSize: 13, color: colors.mutedText, lineHeight: 1.7, maxWidth: 680 }}>
          A metodologia avalia a suficiência de {p.nomePlural} no SUS comparando a quantidade existente com a demanda
          estimada com base na população <strong>SUS-dependente</strong> (IBGE − beneficiários de plano de saúde),
          granularizada ao nível de município.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <div style={{ background: '#fff', borderRadius: 10, padding: '24px 26px', borderTop: `3px solid ${colors.primary}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.primary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Parâmetro
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, color: '#16213e', marginBottom: 4 }}>{p.parametroTitulo}</div>
          <div style={{ fontSize: 12, color: colors.mutedText, lineHeight: 1.6 }}>{p.parametroDescricao}</div>
        </div>

        <div style={{ background: '#fff', borderRadius: 10, padding: '24px 26px', borderTop: '3px solid #475066' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#475066', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Classificação
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: colors.hipoRed }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: colors.hipoRed }}>Hipossuficiente</span>
              <span style={{ fontSize: 11, color: '#475066' }}>coeficiente &lt; 1x</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: colors.hiperGreen }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: colors.hiperGreen }}>Hiperssuficiente</span>
              <span style={{ fontSize: 11, color: '#475066' }}>coeficiente ≥ 1x</span>
            </div>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 10, padding: '24px 26px', borderTop: '3px solid #475066' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#475066', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Fórmula
          </div>
          <div style={{ background: colors.surface, borderRadius: 6, padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: '#16213e', lineHeight: 1.6 }}>
            Qtd SUS existente
            <br />
            ──────────────────
            <br />
            {p.formulaDenominador}
          </div>
          <div style={{ fontSize: 11, color: colors.mutedText, marginTop: 8, lineHeight: 1.5 }}>{p.notaCriterio}</div>
        </div>
      </div>

      <div style={{ background: '#f0f4ff', borderRadius: 10, padding: '20px 28px', borderLeft: `4px solid ${colors.primary}` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: colors.primary, marginBottom: 6 }}>
          Como ler o coeficiente
        </div>
        <div style={{ fontSize: 13, color: '#475066', lineHeight: 1.7 }}>
          Em Planilhas e no Mapa, cada macrorregião/região de saúde/município mostra um <strong>coeficiente</strong>:
          quantas {p.nomePlural} SUS existem pra cada {formatarProdutividade(p.produtividade)} habitantes
          SUS-dependentes, sem arredondar a demanda. Abaixo de 1x é <strong>Hipossuficiente</strong>; 1x ou mais é{' '}
          <strong>Hiperssuficiente</strong> -- a meta é estar em hiperssuficiência, com capacidade de sobra pra
          demanda adicional.
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 10, padding: '24px 32px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#16213e', marginBottom: 14 }}>Fontes de dados</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FonteItem
            n={1}
            titulo="Critérios e parâmetros assistenciais para o planejamento e programação de ações e serviços de saúde no âmbito do sistema único de saúde."
            url="https://www.gov.br/saude/pt-br/acesso-a-informacao/gestao-do-sus/programacao-regulacao-controle-e-financiamento-da-mac/programacao-assistencial/arquivos/caderno-1-criterios-e-parametros-assistenciais-1-revisao.pdf"
            urlLabel="Critérios e Parâmetros Assistenciais SUS — 2017 — CADERNO 1"
          />
          <FonteItem
            n={2}
            titulo="População residente (IBGE) estimada por município"
            url="https://sidra.ibge.gov.br/tabela/6579"
            urlLabel="SIDRA/IBGE — agregado 6579, variável 9324 (ano mais recente publicado)"
          />
          <FonteItem
            n={3}
            titulo={`Quantidade de ${p.nomePlural} existentes no SUS (ElastiCNES)`}
            url="https://cnes2.datasus.gov.br/Mod_Ind_Equipamentos_Listar.asp?VTipo_Equip=1%20&VListar=1&VEstado=00&VMun=&VComp="
            urlLabel={`cnes2.datasus.gov.br — Módulo de Equipamentos (${p.codigoElasticnes})`}
          />
        </div>
      </div>
    </div>
  );
}
