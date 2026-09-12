/** Levantamento nacional por "componente" de financiamento oncologico
 * (REDE DE ATENCAO.../Politica Nacional de Prevencao e Controle do Cancer),
 * via `programa`+`proposta` do TransfereGov -- ver
 * backend/scripts/levantamento_convenios_oncologia.py. Diferente do resto
 * da pagina: nao e por numero de convenio (FAF SAUDE e instrumento novo,
 * sem numero legado), entao fica como secao separada, nao dentro do
 * ConvenioCard -- fica na sua propria aba na pagina principal (ver
 * MonitoramentoEquipamentosPage.tsx), nao misturado com a lista de
 * convenios. Fase de descoberta pra equipe tecnica avaliar (2026-09-08)
 * -- so achado ate agora tem proposta em 2025; 2026 existe como `programa`
 * mas sem proposta ainda, e 2024 ("REDE DE ATENCAO...") nao tem `programa`
 * equivalente em nenhuma API (documentado no script). */
import { cn } from '@/lib/utils';
import { fmtMoeda } from '@/lib/monitoramento-format';
import type { ComponenteOncologia } from '@/types/monitoramento';
import { Campo, estiloCard, Secao, StatusPill } from './monitoramento-ui';

export function SecaoComponentes({ dados }: { dados: ComponenteOncologia[] }) {
  const totalPropostas = dados.reduce((a, c) => a + c.total_propostas, 0);

  return (
    <div>
      <p className="text-muted-foreground text-[12.5px] max-w-[900px] leading-relaxed mb-4">
        Isto é um <strong>radar nacional de propostas</strong>, não a lista de convênios já assinados (essa fica na
        aba "Convênios"). Cada bloco abaixo é um dos 8 componentes oficiais do PNPCC/Rede de Atenção num ano
        específico; dentro dele, as "propostas" são pedidos de financiamento que qualquer ente (prefeitura,
        hospital) submeteu pra aquele programa no TransfereGov — podem ainda nem ter virado convênio (ex.: situação
        "Aprovada" é etapa anterior a "convênio assinado"). É útil pra achar convênios novos que ainda não têm
        número TransfereGov legado — foi assim que os registros FAF/TED sem número de convênio foram encontrados.
      </p>
      <p className="text-muted-foreground text-[12.5px] max-w-[900px] leading-relaxed mb-4">
        Casamento por nome normalizado do <code>programa</code> contra os 8 componentes pedidos —{' '}
        <code>id_programa</code> muda todo ano que a categoria é recriada, revalidar anualmente. Fase de descoberta:{' '}
        {totalPropostas} proposta(s) encontrada(s) em {dados.length} combinação(ões) componente/ano.
      </p>

      {dados.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Nenhum componente batendo ainda.</p>
      ) : (
        dados.map((c) => (
          <details key={`${c.componente}-${c.ano_programa}`} className={cn(estiloCard, 'mb-2.5')}>
            <summary className="cursor-pointer flex justify-between gap-3 flex-wrap items-center">
              <div>
                <div className="font-bold text-[13.5px]">{c.componente}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Ano {c.ano_programa} · programa #{c.id_programa} · nome na API: "{c.nm_programa_api}"
                </div>
              </div>
              <span className="text-xs font-semibold text-primary">{c.total_propostas} proposta(s)</span>
            </summary>

            {c.propostas.length === 0 ? (
              <p className="text-xs text-muted-foreground italic mt-2.5">
                Categoria existe no TransfereGov, mas sem proposta submetida ainda.
              </p>
            ) : (
              <div className="mt-3 grid gap-2">
                {c.propostas.map((p) => (
                  <div key={p.id_proposta} className="bg-background border border-border rounded-lg p-2.5">
                    <div className="flex justify-between gap-2.5 flex-wrap">
                      <strong className="text-[12.5px]">{p.ente_recebedor || '—'}</strong>
                      <StatusPill texto={p.situacao_proposta} />
                    </div>
                    <div className="grid [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))] gap-2 mt-2">
                      <Campo label="CNPJ">{p.cnpj || '—'}</Campo>
                      <Campo label="Município/UF">{p.municipio}/{p.uf}</Campo>
                      <Campo label="Valor planejado">{fmtMoeda(p.valor_planejamento)}</Campo>
                      <Campo label="Proposta">#{p.id_proposta}</Campo>
                    </div>
                    {p.ds_objeto && <p className="text-xs mt-2 text-muted-foreground">{p.ds_objeto}</p>}
                  </div>
                ))}
              </div>
            )}
          </details>
        ))
      )}

      <Secao titulo="Nota de escopo">
        <p className="text-[11.5px] text-muted-foreground leading-relaxed">
          Além disso, o mesmo levantamento achou 1.689 propostas em programas Pronon/Pronas (mesmo domínio de
          financiamento oncológico/deficiência, mas fora dos 8 componentes literais pedidos) — não incluídas aqui de
          propósito, disponíveis em <code>backend/scripts/output/radar_pronon_pronas.csv</code> pra quem quiser
          revisar à parte.
        </p>
      </Secao>
    </div>
  );
}
