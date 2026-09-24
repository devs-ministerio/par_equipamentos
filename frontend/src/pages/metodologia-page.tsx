import type { ReactNode } from "react";
import { getEquipamento } from "../data/constants";

function FonteItem({
  n,
  titulo,
  url,
  urlLabel,
}: {
  n: number;
  titulo: string;
  url: string;
  urlLabel: string;
}) {
  return (
    <div className="flex items-start gap-3.5">
      <div className="flex h-7 min-w-7 items-center justify-center rounded-full bg-[#e8f0fb] text-xs font-bold text-primary">
        {n}
      </div>
      <div>
        <div className="text-[13px] font-semibold text-[#16213e]">{titulo}</div>
        <div className="text-xs leading-[1.5] text-primary">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            aria-label={`${urlLabel} (abre em nova aba)`}
            className="text-primary"
          >
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
    nomeSingular: "1 tomógrafo",
    nomePlural: "tomógrafos",
    parametroTitulo: "1 tomógrafo",
    parametroDescricao: (
      <>
        por <strong>100 mil habitantes </strong>ou raio de{" "}
        <strong>75 km </strong>
        <span className="text-[11px] text-muted-foreground/70">
          o que for atingido primeiro
        </span>
      </>
    ),
    produtividade: getEquipamento("TOMOGRAFO").produtividade,
    formulaDenominador: <>Pop. SUS-dep. / 100.000</>,
    notaCriterio: (
      <>
        Critério de acesso: raio ≤ 75 km <em>ou</em> ≤ 100 mil hab. (o que for
        atingido primeiro), com foco em urgência/emergência.
      </>
    ),
    codigoElasticnes: "Cód. 11 (e 26 a 30, por nº de canais)",
  },
  RESSONANCIA: {
    nomeSingular: "1 ressonância magnética",
    nomePlural: "ressonâncias magnéticas",
    parametroTitulo: "5.000 exames/ano",
    parametroDescricao: (
      <>
        de capacidade por equipamento, com necessidade estimada de{" "}
        <strong>30 exames/1.000 habitantes/ano</strong>
      </>
    ),
    produtividade: getEquipamento("RESSONANCIA").produtividade,
    formulaDenominador: <>Pop. SUS-dep. / 166.667</>,
    notaCriterio: (
      <>
        Produtividade equivalente: 5.000 exames/ano ÷ (30 exames/1.000 hab.) ={" "}
        <strong>1 equipamento a cada ~166.667 habitantes</strong>.
      </>
    ),
    codigoElasticnes: "Cód. 12 (e 32 a 35, por campo em Tesla)",
  },
};

function formatarProdutividade(produtividade: number): string {
  return Math.round(produtividade).toLocaleString("pt-BR");
}

export function MetodologiaPage({
  equipmentFamily = "TOMOGRAFO",
}: {
  equipmentFamily?: string;
}) {
  const p =
    PARAMETROS_POR_FAMILIA[equipmentFamily] ?? PARAMETROS_POR_FAMILIA.TOMOGRAFO;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[10px] bg-white px-5 py-6 sm:px-8 sm:py-7">
        <div className="mb-1.5 text-[11px] font-bold tracking-[0.08em] text-primary uppercase">
          Escopo
        </div>
        <div className="mb-2 text-xl font-bold text-[#16213e]">
          Verificação por Município
        </div>
        <div className="max-w-[680px] text-[13px] leading-[1.7] text-muted-foreground">
          A metodologia avalia a suficiência de {p.nomePlural} no SUS comparando
          a quantidade em uso com a demanda estimada com base na população{" "}
          <strong>SUS-dependente</strong> (IBGE − beneficiários de plano de
          saúde), granularizada ao nível de município.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-[10px] border-t-[3px] border-t-primary bg-white px-6.5 py-6">
          <div className="mb-2.5 text-[11px] font-bold tracking-[0.06em] text-primary uppercase">
            Parâmetro
          </div>
          <div className="mb-1 text-[19px] font-extrabold text-[#16213e]">
            {p.parametroTitulo}
          </div>
          <div className="text-xs leading-[1.6] text-muted-foreground">
            {p.parametroDescricao}
          </div>
        </div>

        <div className="rounded-[10px] border-t-[3px] border-t-[#475066] bg-white px-6.5 py-6">
          <div className="mb-2.5 text-[11px] font-bold tracking-[0.06em] text-[#475066] uppercase">
            Classificação
          </div>
          <div className="mt-1 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-destructive" />
              <span className="text-[13px] font-bold text-destructive">
                Hipossuficiente
              </span>
              <span className="text-[11px] text-[#475066]">
                coeficiente &lt; 1x
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-success" />
              <span className="text-[13px] font-bold text-success">
                Hiperssuficiente
              </span>
              <span className="text-[11px] text-[#475066]">
                coeficiente ≥ 1x
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-[10px] border-t-[3px] border-t-[#475066] bg-white px-6.5 py-6">
          <div className="mb-2.5 text-[11px] font-bold tracking-[0.06em] text-[#475066] uppercase">
            Fórmula
          </div>
          <div className="max-w-full overflow-x-auto rounded-[6px] bg-background px-3.5 py-2.5 font-mono text-xs leading-[1.6] whitespace-nowrap text-[#16213e]">
            Qtd SUS em uso
            <br />
            ──────────────────
            <br />
            {p.formulaDenominador}
          </div>
          <div className="mt-2 text-[11px] leading-[1.5] text-muted-foreground">
            {p.notaCriterio}
          </div>
        </div>
      </div>

      <div className="rounded-[10px] border-l-4 border-l-primary bg-[#f0f4ff] px-7 py-5">
        <div className="mb-1.5 text-xs font-bold text-primary">
          Como ler o coeficiente
        </div>
        <div className="text-[13px] leading-[1.7] text-[#475066]">
          Em Planilhas e no Mapa, cada macrorregião/região de saúde/município
          mostra um <strong>coeficiente</strong>: quantas {p.nomePlural} SUS em
          uso existem pra cada {formatarProdutividade(p.produtividade)}{" "}
          habitantes SUS-dependentes, sem arredondar a demanda. Abaixo de 1x é{" "}
          <strong>Hipossuficiente</strong>; 1x ou mais é{" "}
          <strong>Hiperssuficiente</strong> -- a meta é estar em
          hiperssuficiência, com capacidade de sobra pra demanda adicional.
        </div>
      </div>

      <div className="rounded-[10px] bg-white px-5 py-6 sm:px-8">
        <div className="mb-3.5 text-[13px] font-bold text-[#16213e]">
          Fontes de dados
        </div>
        <div className="flex flex-col gap-3">
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
            titulo={`Quantidade de ${p.nomePlural} em uso no SUS (ElastiCNES)`}
            url="https://cnes2.datasus.gov.br/Mod_Ind_Equipamentos_Listar.asp?VTipo_Equip=1%20&VListar=1&VEstado=00&VMun=&VComp="
            urlLabel={`cnes2.datasus.gov.br — Módulo de Equipamentos (${p.codigoElasticnes})`}
          />
        </div>
      </div>
    </div>
  );
}
