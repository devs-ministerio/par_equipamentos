import type { EstadoResumo } from '@/hooks/usePainelGeralResumos';
import { PainelGeralStatCard } from './painel-geral-stat-card';
import { PainelGeralSubCard } from './painel-geral-sub-card';
import { PainelGeralRankingMacros } from './painel-geral-ranking-macros';
import { PainelGeralBarraNaturezaJuridica } from './painel-geral-barra-natureza-juridica';

export function PainelGeralCardFamilia({
  resumo,
  rotulo,
  onEntrar,
}: {
  resumo: EstadoResumo;
  rotulo: string;
  onEntrar: () => void;
}) {
  return (
    <div
      className="box-border flex w-full flex-col gap-[18px] rounded-[14px] border-t-[3px] border-t-primary bg-card px-[26px] py-6"
      style={{ boxShadow: '0 1px 2px rgba(22, 33, 62, 0.04), 0 4px 16px rgba(22, 33, 62, 0.06)' }}
    >
      <div className="text-[17px] font-extrabold tracking-[-0.01em] text-[#16213e]">{rotulo}</div>

      {resumo === 'carregando' && <div className="text-[12.5px] text-muted-foreground/70">Carregando...</div>}
      {resumo === 'erro' && (
        <div className="text-[12.5px] text-destructive">Não foi possível carregar o resumo desta família.</div>
      )}
      {typeof resumo === 'object' && (
        <>
          <div className="flex gap-6">
            <div>
              <div className="font-data text-[26px] font-bold text-[#16213e]">{resumo.totalSus.toLocaleString('pt-BR')}</div>
              <div className="text-[11px] uppercase tracking-[0.02em] text-muted-foreground/70">
                Equipamentos em uso SUS
              </div>
            </div>
            <div>
              <div className="font-data text-[26px] font-bold text-muted-foreground">
                {resumo.totalGeral.toLocaleString('pt-BR')}
              </div>
              <div className="text-[11px] uppercase tracking-[0.02em] text-muted-foreground/70">
                Total Equipamentos
              </div>
            </div>
          </div>

          <div className="flex gap-2.5">
            <PainelGeralStatCard valor={`${resumo.macrosHipo} de ${resumo.macrosTotal}`} label="Macrorregiões hipossuficientes" />
            <PainelGeralStatCard
              valor={`${resumo.regioesHipo} de ${resumo.regioesTotal}`}
              label="Regiões de saúde hipossuficientes"
            />
            <PainelGeralStatCard valor={String(resumo.municipiosHipo)} label="Municípios hipossuficientes (≥100 mil hab.)" />
          </div>

          <PainelGeralSubCard titulo="Hipossuficientes por região">
            <div className="flex flex-col gap-[7px]">
              {resumo.porRegiao.map((r) => (
                <div key={r.regiao} className="flex items-center gap-2 text-[11.5px]">
                  <span className="w-[78px] flex-shrink-0 text-muted-foreground">{r.regiao}</span>
                  <div className="h-1.5 flex-1 overflow-clip rounded-[3px] bg-[#e4e7ee]">
                    {r.total > 0 && (
                      <div className="h-full bg-destructive" style={{ width: `${(r.hipo / r.total) * 100}%` }} />
                    )}
                  </div>
                  <span className="w-10 flex-shrink-0 text-right text-muted-foreground/70">
                    {r.hipo}/{r.total}
                  </span>
                </div>
              ))}
            </div>
          </PainelGeralSubCard>

          <PainelGeralSubCard titulo="Ranking de macrorregiões">
            <PainelGeralRankingMacros hipo={resumo.top5Hipo} hiper={resumo.top5Hiper} />
          </PainelGeralSubCard>

          {resumo.naturezaJuridica.length > 0 && (
            <div>
              <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.03em] text-muted-foreground/70">
                Natureza jurídica da oferta SUS
              </div>
              <PainelGeralBarraNaturezaJuridica dados={resumo.naturezaJuridica} />
            </div>
          )}
        </>
      )}

      <button
        onClick={onEntrar}
        className="mt-1 cursor-pointer self-start rounded-lg border-none bg-primary px-4 py-2 text-[12.5px] font-bold text-primary-foreground"
      >
        Ver painel completo →
      </button>
    </div>
  );
}
