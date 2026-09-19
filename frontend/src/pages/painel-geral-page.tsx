import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppHeader } from '../components/layout/app-header';
import { CONTAINER_CLASS } from '@/lib/layout';
import { MacroMap } from '@/components/features/macro-map';
import { PainelGeralSecao } from '@/components/features/painel-geral-secao';
import { PainelGeralCardFamilia } from '@/components/features/painel-geral-card-familia';
import { usePainelGeralResumos } from '@/hooks/usePainelGeralResumos';
import { useMacroGeojson } from '@/hooks/useMacroGeojson';
import { CHAVE_STORAGE_FAMILIA } from '../hooks/use-familia-equipamento';
import { EQUIPAMENTOS, getEquipamento } from '../data/constants';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/common/page-header';

function irParaEquipamentos(
  navigate: ReturnType<typeof useNavigate>,
  familia: string,
  destino: 'dashboard' | 'mapa' | 'relatorios',
) {
  try {
    localStorage.setItem(CHAVE_STORAGE_FAMILIA, familia);
  } catch {
    // ignora -- privada/bloqueado, so perde a conveniencia de pre-selecionar
  }
  navigate(`/${destino}`);
}

/**
 * Pagina inicial do sistema (decisao 2026-08-22) -- visao geral de TODAS as
 * familias de equipamento com dado real hoje, antes de entrar no painel
 * detalhado (Dashboard/Mapa/Relatorios) de uma familia especifica. Fica FORA
 * do AppLayout/TopNav de proposito -- essa pagina nao pertence a nenhuma
 * familia especifica (nao precisa do FamiliaEquipamentoProvider), e o
 * TopNav (Geral/Mapa/Relatorios + seletor de familia) so faz sentido depois
 * que o usuario escolheu uma. Navegar pra dentro (/dashboard, /mapa) grava a
 * familia escolhida na mesma chave de localStorage que o
 * FamiliaEquipamentoContext ja usa, entao a pagina de destino abre direto
 * nela.
 *
 * Busca o resumo (totais + hipo) de cada familia `disponivel` em paralelo,
 * na carga -- e o mesmo dado que DashboardPage mostra filtrado, so que sem
 * filtro (visao nacional). Familias `disponivel: false` aparecem so como
 * "Em breve" (mesma fonte de verdade que TopNav/SeletorEquipamento usa),
 * sem tentar buscar dado que nao existe ainda. Migrado pra `useQueries`/
 * `useMacroGeojson` (2026-09-11) -- antes usava `useEffect`+`setState` manual
 * com guarda `cancelado`.
 */
export function PainelGeralPage() {
  const navigate = useNavigate();
  const familiasDisponiveis = useMemo(() => EQUIPAMENTOS.filter((eq) => eq.disponivel), []);

  const resumos = usePainelGeralResumos(familiasDisponiveis.map((eq) => eq.familia));
  const geoQuery = useMacroGeojson();
  const [familiaMapa, setFamiliaMapa] = useState(familiasDisponiveis[0]?.familia ?? 'TOMOGRAFO');

  const resumoMapa = resumos[familiaMapa];
  const macrosMapa = typeof resumoMapa === 'object' ? resumoMapa.macros : [];
  const coberturaRowsMapa = typeof resumoMapa === 'object' ? resumoMapa.coberturaRows : [];

  return (
    <div className="min-h-screen bg-background text-sm text-foreground">
      {/* Painel Geral e a pagina inicial (fora de AppLayout/MonitoramentoLayout
          de proposito) -- sem itens de nav, so a logo do header unificado. */}
      <AppHeader navItems={[]} />
      <div className={`${CONTAINER_CLASS} py-6`}>
        <PageHeader
          eyebrow="Visão nacional"
          title="Cobertura de equipamentos em oncologia"
          description="Situação da oferta SUS por família de equipamento e território."
        />

        {/* Resumo por familia */}
        <PainelGeralSecao titulo="Cobertura por equipamento">
          {/* `minmax(480px,1fr)` estourava a viewport obrigatória de 400px
              (achado da auditoria visual, overflow de 504px) -- `min(480px,
              100%)` mantém a largura mínima confortável em telas largas mas
              nunca ultrapassa o container em telas estreitas (Seção 14). */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(480px,100%),1fr))] gap-5">
            {familiasDisponiveis.map((eq) => (
              <PainelGeralCardFamilia
                key={eq.familia}
                rotulo={eq.rotulo}
                resumo={resumos[eq.familia] ?? 'carregando'}
                onEntrar={() => irParaEquipamentos(navigate, eq.familia, 'dashboard')}
              />
            ))}
          </div>
        </PainelGeralSecao>

        {/* Mapa nacional */}
        <PainelGeralSecao titulo="Mapa nacional" subtitulo="Cobertura por macrorregião de saúde.">
          <div className="rounded-[10px] bg-card px-5 py-[18px]">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex gap-1.5">
                {familiasDisponiveis.map((eq) => (
                  <button
                    key={eq.familia}
                    onClick={() => setFamiliaMapa(eq.familia)}
                    className={cn(
                      'cursor-pointer rounded-full border-[1.5px] px-3.5 py-1.5 text-xs font-semibold',
                      familiaMapa === eq.familia
                        ? 'border-primary bg-secondary text-primary'
                        : 'border-border bg-card text-muted-foreground',
                    )}
                  >
                    {eq.rotulo}
                  </button>
                ))}
              </div>
              <button
                onClick={() => irParaEquipamentos(navigate, familiaMapa, 'mapa')}
                className="cursor-pointer rounded-lg border border-border bg-card px-3.5 py-1.5 text-xs font-bold text-primary"
              >
                Ver mapa completo →
              </button>
            </div>

            <div className="mt-3.5">
              {geoQuery.data && macrosMapa.length > 0 ? (
                <MacroMap
                  geo={geoQuery.data}
                  macros={macrosMapa}
                  coberturaRows={coberturaRowsMapa}
                  produtividade={getEquipamento(familiaMapa).produtividade}
                  onSelectMacro={() => {}}
                />
              ) : (
                <div className="p-[60px] text-center text-muted-foreground/70">Carregando mapa...</div>
              )}
            </div>
            <div className="mt-3.5 flex flex-wrap items-center gap-5">
              {/* Mesma logica de MacroMap.tsx::escalaCor -- duas gradacoes
                  com corte duro em 100% (dois stops na mesma posicao),
                  nao mais um gradiente unico atravessando a meta. */}
              <div className="flex items-center gap-2.5">
                <div
                  className="h-2 w-[140px] rounded"
                  style={{
                    background:
                      'linear-gradient(to right, var(--destructive) 0%, var(--destructive-bg) 50%, var(--success-bg) 50%, var(--success) 100%)',
                  }}
                />
                <span className="text-[11px] text-muted-foreground/70">0x ── 1x ── 2x+</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-[9px] w-[9px] rounded-full bg-destructive" />
                <span className="text-[11.5px] text-muted-foreground">
                  <strong className="text-destructive">Hipossuficiente</strong> -- abaixo de 1x
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-[9px] w-[9px] rounded-full bg-success" />
                <span className="text-[11.5px] text-muted-foreground">
                  <strong className="text-success">Hiperssuficiente</strong> -- 1x ou mais
                </span>
              </div>
            </div>
          </div>
        </PainelGeralSecao>

        {/* Metodologia (teaser) */}
        <PainelGeralSecao titulo="Critério de suficiência">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-[10px] bg-card px-6 py-5">
            <div className="max-w-[640px] text-sm leading-relaxed text-muted-foreground">
              O coeficiente compara equipamentos em uso SUS com a demanda estimada da população SUS-dependente.
              Valores abaixo de 1 indicam insuficiência; os parâmetros completos estão na metodologia.
            </div>
            <button
              onClick={() => irParaEquipamentos(navigate, familiasDisponiveis[0]?.familia ?? 'TOMOGRAFO', 'relatorios')}
              className="cursor-pointer whitespace-nowrap rounded-lg border border-border bg-card px-[18px] py-[9px] text-[12.5px] font-bold text-primary"
            >
              Ver metodologia completa →
            </button>
          </div>
        </PainelGeralSecao>

        <div className="h-10" />
      </div>
    </div>
  );
}
