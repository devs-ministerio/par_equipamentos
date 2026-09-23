import { PageHeader } from '@/components/common/page-header';
import { ErrorAlert } from '@/components/common/error-alert';
import { mensagemSeguraDoErro } from '@/lib/api-error';
import { Skeleton } from '@/components/ui/skeleton';
import { NavBoxesAnaliseMerito } from '@/components/features/nav-boxes-analise-merito';
import { MacroMap } from '@/components/features/macro-map';
import { MapaDetalheMacro } from '@/components/features/mapa-detalhe-macro';
import { MapaRodoviarioSecao } from '@/components/features/mapa-rodoviario-secao';
import { calcularCoeficiente } from '../utils/coeficiente';
import { useFamiliaEquipamento } from '../hooks/use-familia-equipamento';
import { getEquipamento } from '../data/constants';
import { useMacroGeojson } from '../hooks/useMacroGeojson';
import { useMapaFiltros } from '../hooks/useMapaFiltros';
import { useEstabelecimentosMapa } from '../hooks/useEstabelecimentosMapa';
import { useEquipamentoMaisProximo } from '../hooks/useEquipamentoMaisProximo';
import { useContornoMunicipio } from '../hooks/useContornoMunicipio';

export function MapaPage() {
  const { familia: FAMILIA } = useFamiliaEquipamento();
  const equipamento = getEquipamento(FAMILIA);

  const geoQuery = useMacroGeojson();
  const geo = geoQuery.data ?? null;

  const {
    macros,
    coberturaRows,
    isLoading,
    isError,
    error,
    selectedMacroId,
    setSelectedMacroId,
    macroSelecionada,
    coberturaSelecionada,
    regioesSaude,
    regioesSaudeLoading,
    regioesSaudeError,
    municipiosMacro,
    selectedMunicipioId,
    setSelectedMunicipioId,
    municipioSelecionado,
  } = useMapaFiltros(FAMILIA);

  const { pontosMacro, totalEstabelecimentosNoRaio } = useEstabelecimentosMapa(
    FAMILIA,
    selectedMacroId,
    municipioSelecionado,
  );

  const { nome: nomeEquipamentoMaisProximo, distanciaKm: distanciaMaisProximaKm } = useEquipamentoMaisProximo(
    FAMILIA,
    municipioSelecionado,
    pontosMacro,
  );

  const { contorno: contornoMunicipio, erro: erroContornoMunicipio } = useContornoMunicipio(municipioSelecionado?.ibgeCode7);

  const infoSelecionado = municipioSelecionado
    ? { pop: municipioSelecionado.pop, ofertaTotal: municipioSelecionado.ofertaTotal }
    : macroSelecionada && coberturaSelecionada
      ? { pop: macroSelecionada.pop, ofertaTotal: coberturaSelecionada.ofertaTotal }
      : undefined;

  const coefSelecionada =
    macroSelecionada && coberturaSelecionada
      ? calcularCoeficiente(coberturaSelecionada.oferta, macroSelecionada.pop, equipamento.produtividade)
      : null;
  const pessoasPorEquipSelecionada =
    macroSelecionada && coberturaSelecionada && coberturaSelecionada.oferta > 0
      ? macroSelecionada.pop / coberturaSelecionada.oferta
      : null;

  const header = (
    <PageHeader
      eyebrow="Análise de mérito"
      title="Mapa de cobertura"
      description="Distribuição territorial da oferta em uso SUS."
      actions={<NavBoxesAnaliseMerito />}
    />
  );

  if (isLoading || geoQuery.isLoading) {
    return (
      <div>
        {header}
        <div className="grid gap-2" role="status" aria-label="Carregando">
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (isError || geoQuery.isError) {
    return (
      <div>
        {header}
        <ErrorAlert mensagem={mensagemSeguraDoErro(error)} />
      </div>
    );
  }

  if (macros.length === 0) {
    return (
      <div>
        {header}
        <div className="rounded-lg bg-card p-6 text-center text-muted-foreground">
          Nenhuma macrorregião com dado de cobertura pra essa família de equipamento.
        </div>
      </div>
    );
  }

  return (
    <div>
      {header}
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-lg bg-card px-4.5 py-4">
          <div className="mb-2.5 text-sm font-semibold">Equipamentos — Cobertura por macrorregião de saúde</div>
          {geo && (
            <MacroMap
              geo={geo}
              macros={macros}
              coberturaRows={coberturaRows}
              selectedMacroId={selectedMacroId}
              produtividade={equipamento.produtividade}
              onSelectMacro={setSelectedMacroId}
            />
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3.5">
            <div
              className="h-2 w-[140px] rounded"
              style={{
                background:
                  'linear-gradient(to right, var(--destructive) 0%, var(--destructive-bg) 50%, var(--success-bg) 50%, var(--success) 100%)',
              }}
              aria-hidden="true"
            />
            <span className="text-[11px] text-muted-foreground">0x ── 1x ── 2x+</span>
          </div>
        </div>

        <div className="overflow-auto rounded-lg bg-card px-4.5 py-4">
          <MapaDetalheMacro
            macroSelecionada={macroSelecionada}
            coberturaSelecionada={coberturaSelecionada}
            coefSelecionada={coefSelecionada}
            pessoasPorEquipSelecionada={pessoasPorEquipSelecionada}
            regioesSaude={regioesSaude}
            regioesSaudeLoading={regioesSaudeLoading}
            regioesSaudeError={regioesSaudeError}
            equipmentFamily={FAMILIA}
          />
        </div>
      </div>

      <MapaRodoviarioSecao
        geo={geo}
        familia={FAMILIA}
        macros={macros}
        selectedMacroId={selectedMacroId}
        setSelectedMacroId={setSelectedMacroId}
        municipiosMacro={municipiosMacro}
        selectedMunicipioId={selectedMunicipioId}
        setSelectedMunicipioId={setSelectedMunicipioId}
        municipioSelecionado={municipioSelecionado}
        infoSelecionado={infoSelecionado}
        distanciaMaisProximaKm={distanciaMaisProximaKm}
        nomeEquipamentoMaisProximo={nomeEquipamentoMaisProximo}
        pontosMacro={pontosMacro}
        totalEstabelecimentosNoRaio={totalEstabelecimentosNoRaio}
        contornoMunicipio={contornoMunicipio}
        erroContornoMunicipio={erroContornoMunicipio}
      />
    </div>
  );
}
