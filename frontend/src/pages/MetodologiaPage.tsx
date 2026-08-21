import { colors } from '../styles/tokens';

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

export function MetodologiaPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: '28px 32px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: colors.primary, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
          Escopo
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#16213e', marginBottom: 8 }}>Verificação por Município</div>
        <div style={{ fontSize: 13, color: colors.mutedText, lineHeight: 1.7, maxWidth: 680 }}>
          A metodologia avalia a suficiência de tomógrafos no SUS comparando a quantidade em uso com a demanda
          estimada com base na população <strong>SUS-dependente</strong> (IBGE − beneficiários de plano de saúde),
          granularizada ao nível de município.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <div style={{ background: '#fff', borderRadius: 10, padding: '24px 26px', borderTop: `3px solid ${colors.primary}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.primary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Parâmetro
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, color: '#16213e', marginBottom: 4 }}>1 tomógrafo</div>
          <div style={{ fontSize: 12, color: colors.mutedText, lineHeight: 1.6 }}>
            por <strong>100 mil habitantes </strong>ou raio de <strong>75 km </strong>
            <span style={{ fontSize: 11, color: colors.subtleText }}>o que for atingido primeiro</span>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 10, padding: '24px 26px', borderTop: '3px solid #475066' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#475066', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Classificação
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: colors.hipoRed }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: colors.hipoRed }}>Hipossuficiente</span>
              <span style={{ fontSize: 11, color: '#475066' }}>hab./aparelho &gt; 100 mil</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: colors.hiperGreen }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: colors.hiperGreen }}>Hiperssuficiente</span>
              <span style={{ fontSize: 11, color: '#475066' }}>hab./aparelho ≤ 100 mil</span>
            </div>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 10, padding: '24px 26px', borderTop: '3px solid #475066' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#475066', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Fórmula
          </div>
          <div style={{ background: colors.surface, borderRadius: 6, padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: '#16213e', lineHeight: 1.6 }}>
            Qtd SUS em uso
            <br />
            ──────────────────
            <br />
            Pop. SUS-dep. / 100.000
          </div>
          <div style={{ fontSize: 11, color: colors.mutedText, marginTop: 8, lineHeight: 1.5 }}>
            Critério de acesso: raio ≤ 75 km <em>ou</em> ≤ 100 mil hab. (o que for atingido primeiro), com foco em
            urgência/emergência.
          </div>
        </div>
      </div>

      <div style={{ background: '#f0f4ff', borderRadius: 10, padding: '20px 28px', borderLeft: `4px solid ${colors.primary}` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: colors.primary, marginBottom: 6 }}>
          Como ler "pessoas por tomógrafo" e o multiplicador
        </div>
        <div style={{ fontSize: 13, color: '#475066', lineHeight: 1.7 }}>
          Em Planilhas e no Mapa, essa mesma fórmula aparece em dois formatos, além do percentual: <strong>pessoas
          por tomógrafo</strong> (ex.: 23,4k/1, ou seja, população dividida pela quantidade de tomógrafos) e o{' '}
          <strong>multiplicador da meta</strong> (ex.: 3,90x — quantas vezes a região tem a mais, ou a menos, do que
          a quantidade de tomógrafos exigida pelo parâmetro de 1 por 100 mil habitantes). Quanto maior o
          multiplicador, maior a capacidade ociosa da região, ou seja, mais vaga disponível pra atender demanda
          adicional.
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
            titulo="População residente (IBGE) estimada por município, consultada ao vivo a cada execução"
            url="https://sidra.ibge.gov.br/tabela/6579"
            urlLabel="SIDRA/IBGE — agregado 6579, variável 9324 (ano mais recente publicado)"
          />
          <FonteItem
            n={3}
            titulo="Quantidade de tomógrafos em uso no SUS (ElastiCNES)"
            url="https://cnes2.datasus.gov.br/Mod_Ind_Equipamentos_Listar.asp?VCod_Equip=11&VTipo_Equip=1%20&VListar=1&VEstado=00&VMun=&VComp="
            urlLabel="cnes2.datasus.gov.br — Módulo de Equipamentos (Cód. 11)"
          />
        </div>
        <div style={{ fontSize: 11.5, color: colors.mutedText, marginTop: 14, lineHeight: 1.6 }}>
          <strong>4.</strong> Beneficiários de plano de saúde (ANS), por município — usados pra descontar do IBGE e
          chegar na população SUS-dependente. Sem API oficial ao vivo conhecida pra esse dado hoje; importado de
          arquivo de referência (upload manual, versionado) até que uma fonte ao vivo seja identificada e validada.
        </div>
      </div>

      <div style={{ background: '#f0f4ff', borderRadius: 10, padding: '20px 28px', borderLeft: `4px solid ${colors.primary}` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: colors.primary, marginBottom: 6 }}>Nota sobre o denominador</div>
        <div style={{ fontSize: 13, color: '#475066', lineHeight: 1.7 }}>
          O denominador é a <strong>população SUS-dependente</strong> (residente IBGE menos beneficiários de plano
          de saúde ANS), não a população total do território. Decisão de 21/08/2026: o parâmetro normativo do MS
          (Caderno 1) não faz essa segmentação por si só — trabalha com cobertura populacional plena (lógica PDR) —,
          mas manter o denominador em população total inflaria artificialmente a demanda em regiões com alta
          cobertura de plano privado (ex.: capitais), já que quem tem plano não compete pela vaga no SUS. Como a
          oferta já era medida só em equipamentos SUS (decisão D-02), comparar contra a população SUS-dependente é
          o recorte consistente dos dois lados da conta.
        </div>
      </div>
    </div>
  );
}
