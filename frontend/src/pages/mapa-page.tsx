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

/**
 * Mapa nacional por macrorregiao de saude, com drill-down no painel lateral
 * (decisao 2026-08-22): clicar numa macro no mapa busca as regioes de saude
 * dela (GET /health-region-coverage?macro_code=) e mostra com SubNivelRows --
 * MESMO componente que o Dashboard usa pra expandir uma linha de macro
 * (CoberturaTable), entao a cadeia Regiao de Saude -> Municipio vem de
 * graca, sem duplicar logica (sem botao de detalhe nessa sub-camada --
 * removido 2026-08-24, os cards de resumo acima do filtro substituem essa
 * necessidade).
 *
 * Substitui a versao anterior (mapa colorido por UF, clicar no estado listava
 * as macros dele com a lista crua de estabelecimentos) -- o mapa agora colore
 * CADA MACRO com o dado exato dela (sem media por UF, ver MacroMap.tsx), e o
 * drill-down vai direto a fundo (Regiao de Saude -> Municipio) em vez de
 * parar em "lista de estabelecimentos da macro". A lista crua de
 * estabelecimentos por CNES continua disponivel no Dashboard
 * (EstabelecimentoTable, filtravel por macro).
 *
 * Toda a busca de dado mora em hooks dedicados (`useMapaFiltros`,
 * `useEstabelecimentosMapa`, `useEquipamentoMaisProximo`,
 * `useContornoMunicipio`, `useMacroGeojson`), e o layout foi partido em
 * `MapaDetalheMacro` (painel de detalhe da macro selecionada) e
 * `MapaRodoviarioSecao` (filtro + mapa de ruas) -- essa pagina só compõe a
 * UI a partir do que eles devolvem.
 */
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

  const contornoMunicipio = useContornoMunicipio(municipioSelecionado?.ibgeCode7);

  // Dado unificado pros cards de resumo do "Recorte" -- municipio
  // selecionado tem prioridade (granularidade mais fina); sem municipio,
  // cai pra macro. Mesmo shape dos dois lados (pop/ofertaTotal) pra nao
  // duplicar o JSX dos cards por fonte.
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
      {/* 1 coluna abaixo de `lg` (1024px) -- em telas estreitas o painel
          lateral de detalhe (1fr) ficava com ~120px de largura e o texto
          quebrava palavra por palavra (achado da auditoria visual). */}
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
            {/* Mesma logica de MacroMap.tsx::escalaCor -- duas gradacoes com
                corte duro em 100%. var() em vez de hex cru -- 4 paradas na
                mesma barra, arbitrary-value Tailwind ficaria ilegivel. */}
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

        {/* Sem altura fixa/maxHeight aqui -- deixa o grid (alignItems:
            'stretch', explicito acima por clareza) esticar esse card pra
            bater exatamente com a altura do mapa ao lado. */}
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
      />
    </div>
  );
}
