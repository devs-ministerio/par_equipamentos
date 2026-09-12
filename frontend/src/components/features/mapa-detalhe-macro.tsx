import { SubNivelRows } from '@/components/features/sub-nivel-rows';
import { StatusBadge } from '@/components/common/status-badge';
import { formatMilhar, formatMultiplicador } from '@/utils/format';
import type { CoberturaRow, Macrorregiao, NivelCoberturaRow } from '@/types/domain';
import type { CoeficienteInfo } from '@/utils/coeficiente';

interface Props {
  macroSelecionada: Macrorregiao | undefined;
  coberturaSelecionada: CoberturaRow | undefined;
  coefSelecionada: CoeficienteInfo | null;
  pessoasPorEquipSelecionada: number | null;
  regioesSaude: NivelCoberturaRow[] | undefined;
  regioesSaudeLoading: boolean;
  regioesSaudeError: boolean;
  equipmentFamily: string;
}

/**
 * Painel de detalhe da macro selecionada no mapa nacional (Coeficiente,
 * cobertura, drill-down por Região de Saúde via `SubNivelRows`) -- extraído
 * de `MapaPage` só pra manter o arquivo da página dentro do limite de
 * ~200 linhas (Seção 6 da constituição), sem mudança de comportamento.
 */
export function MapaDetalheMacro({
  macroSelecionada,
  coberturaSelecionada,
  coefSelecionada,
  pessoasPorEquipSelecionada,
  regioesSaude,
  regioesSaudeLoading,
  regioesSaudeError,
  equipmentFamily,
}: Props) {
  if (!macroSelecionada || !coberturaSelecionada) {
    return (
      <div className="text-[13px] text-muted-foreground">
        Selecione uma macrorregião no mapa para ver o detalhe por região de saúde.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">{macroSelecionada.id}</span>
        <div className="text-[15px] font-semibold">
          {macroSelecionada.nome} <span className="font-normal text-muted-foreground">({macroSelecionada.uf})</span>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-2.5">
        <StatusBadge status={coberturaSelecionada.status} />
        {coefSelecionada?.valor != null && (
          <span className="text-[12.5px] font-semibold" style={{ color: coefSelecionada.corTexto }}>
            {formatMultiplicador(coefSelecionada.valor)}
          </span>
        )}
      </div>

      <div className="mt-2.5 text-xs leading-[1.7] text-muted-foreground">
        {macroSelecionada.pop.toLocaleString('pt-BR')} hab. SUS-dependentes · {coberturaSelecionada.oferta} equipamento
        {coberturaSelecionada.oferta === 1 ? '' : 's'} SUS
        {coberturaSelecionada.ofertaTotal !== coberturaSelecionada.oferta &&
          ` de ${coberturaSelecionada.ofertaTotal} no total`}
        <br />
        Pessoas por equipamento: {pessoasPorEquipSelecionada != null ? `${formatMilhar(pessoasPorEquipSelecionada)}/1` : '—'}
      </div>

      <div className="mt-4 text-[11px] font-bold tracking-[0.04em] text-muted-foreground uppercase">Regiões de saúde</div>
      <div className="mt-1.5">
        {regioesSaudeLoading && <div className="py-2 text-xs text-muted-foreground">Carregando regiões de saúde...</div>}
        {regioesSaudeError && (
          <div role="alert" className="py-2 text-xs text-destructive">
            Não foi possível carregar as regiões de saúde.
          </div>
        )}
        {!regioesSaudeLoading && !regioesSaudeError && regioesSaude && regioesSaude.length === 0 && (
          <div className="py-2 text-xs text-muted-foreground">Nenhuma região de saúde encontrada.</div>
        )}
        {regioesSaude && regioesSaude.length > 0 && (
          <SubNivelRows rows={regioesSaude} nivelAtual="regiaoSaude" equipmentFamily={equipmentFamily} />
        )}
      </div>
    </div>
  );
}
