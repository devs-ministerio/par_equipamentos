import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { limparMonitoramentoHttp } from "@/test-fixtures/monitoramento-hooks";
import { prepararPainel } from "@/test-fixtures/monitoramento-painel";
import { MonitoramentoMeuPainelPage } from "./monitoramento-meu-painel-page";

const ROTA = "/monitoramento/painel-tecnico";
const CARTEIRA = `${ROTA}/carteira`;

afterEach(() => {
  cleanup();
  limparMonitoramentoHttp();
});

function preparar() {
  const h = prepararPainel("colaborador");
  const contagem = {
    instrumentos: 2,
    com_registro: 2,
    sem_registro: 0,
    concluidos: 1,
    com_repasse: 2,
    com_entrega: 2,
  };
  h.respostas.set(ROTA, {
    body: {
      escopo: "individual",
      usuario: { id: 1, nome: "Usuário sintético", papel: "colaborador" },
      ufs: ["BA", "GO"],
      gerado_em: "2026-10-20T10:00:00Z",
      carteira: {
        elegiveis: 2,
        monitorados: 2,
        cobertura_pct: 100,
        faltam_em_aberto: 0,
        faltam_concluidos: 0,
        valor_faltam_em_aberto: 0,
        valor_faltam_concluidos: 0,
      },
      regiao: contagem,
      regiao_sem_titular: 0,
      meus: contagem,
      atividade: {
        lancamentos_total: 0,
        lancamentos_15d: 0,
        instrumentos_tocados: 0,
        ultimo_lancamento: null,
        por_semana: [],
      },
    },
    status: 200,
  });
  h.respostas.set(CARTEIRA, {
    body: h.instrumentos.map((i) => ({
      numero: i.nr_convenio,
      uf: i.uf,
      municipio: i.municipio,
      convenente: i.nome_convenente,
      cnpj_convenente: null,
      tipo_contratacao: "Convênio",
      situacao: null,
      fase: i.fase_atual,
      cnes: null,
      entrou_radar_em: null,
      valor_global: 1000,
      em_aberto: i.fase_atual !== "Concluído",
      monitorado: true,
      titular: i.tecnico_titular,
      eventos: 1,
      acoes: 0,
      acoes_abertas: 0,
      acoes_atrasadas: 0,
      lancado_recente: false,
      sem_registro: false,
    })),
    status: 200,
  });
  h.resumo.equipamentos_por_instrumento = [
    { nr_convenio: "QA001", familia: "Mamógrafo", planejado: 1, entregue: 1 },
    { nr_convenio: "QA002", familia: "Tomógrafo", planejado: 2, entregue: 1 },
    { nr_convenio: "QA099", familia: "Ultrassom", planejado: 1, entregue: 0 },
  ];
  h.resumo.etapas_por_instrumento = [
    {
      nr_convenio: "QA001",
      publicacao: null,
      entrega: "2026-10-10",
      inauguracao: null,
      conclusao: "2026-10-11",
      inauguracao_dispensada: true,
      conclusao_resultado: "integral",
      tem_acelerador_linear: false,
      unidades_entregues: [{ data: "2026-10-10", quantidade: 1 }],
    },
  ];
  return h;
}

function montar(h: ReturnType<typeof preparar>) {
  render(
    <MemoryRouter>
      <MonitoramentoMeuPainelPage />
    </MemoryRouter>,
    { wrapper: h.wrapper },
  );
  return userEvent.setup();
}

it("cruza os gráficos com a carteira do técnico e restaura o recorte inicial", async () => {
  const user = montar(preparar());
  const secaoCarteira = await screen.findByRole("region", { name: "Carteira" });
  const scrollIntoView = vi.fn();
  Object.assign(secaoCarteira, { scrollIntoView });
  const carteira = within(secaoCarteira);
  const situacoes = within(
    screen.getByRole("list", { name: /instrumentos por situação/i }),
  );
  const tipo = await screen.findByRole("button", { name: /Mamógrafo/ });

  expect(
    screen.queryByRole("button", { name: /Ultrassom/ }),
  ).not.toBeInTheDocument();
  expect(tipo).toHaveTextContent("1 de 1");
  expect(screen.getByRole("button", { name: /Tomógrafo/ })).toHaveTextContent(
    "0 de 2",
  );

  await user.click(tipo);
  const concluido = situacoes.getByRole("button", { name: /Concluído/ });
  expect(concluido).toHaveAttribute("title", "Concluído: 1 (100%)");
  expect(carteira.getByText("1 de 2 instrumentos")).toBeInTheDocument();
  expect(carteira.queryByText("QA002")).not.toBeInTheDocument();

  await user.click(concluido);
  expect(
    screen.queryByRole("button", { name: /Tomógrafo/ }),
  ).not.toBeInTheDocument();
  expect(tipo).toHaveAttribute("aria-pressed", "true");

  await user.click(
    screen.getByRole("button", { name: /Cobertura do monitoramento/ }),
  );
  expect(carteira.getByText("2 de 2 instrumentos")).toBeInTheDocument();
  expect(tipo).toHaveAttribute("aria-pressed", "false");
  expect(concluido).toHaveAttribute("aria-pressed", "false");
  await waitFor(() => expect(scrollIntoView).toHaveBeenCalledOnce());
});

it("troca o marcador Monitorado por Novo nos 7 dias seguintes à entrada pelo Radar", async () => {
  const h = preparar();
  const resposta = h.respostas.get(CARTEIRA)!;
  const linhas = resposta.body as Array<Record<string, unknown>>;
  linhas[0].entrou_radar_em = new Date().toISOString();
  const carteira = within(
    await (async () => {
      montar(h);
      return screen.findByRole("region", { name: "Carteira" });
    })(),
  );
  const nova = (await carteira.findByText("QA001")).closest("tr")!;
  const antiga = carteira.getByText("QA002").closest("tr")!;
  expect(within(nova).getByText("Novo")).toBeInTheDocument();
  expect(within(nova).queryByText("Monitorado")).not.toBeInTheDocument();
  expect(within(antiga).getByText("Monitorado")).toBeInTheDocument();
  expect(within(antiga).queryByText("Novo")).not.toBeInTheDocument();
});

it("aguarda a carteira e oferece nova tentativa se a fonte de prazos falhar", async () => {
  const h = preparar();
  const respostaCarteira = h.respostas.get(CARTEIRA)!;
  let resolver!: (resposta: Response) => void;
  respostaCarteira.pendente = new Promise<Response>((resolve) => {
    resolver = resolve;
  });
  h.respostas.set("/convenios", { body: {}, status: 503 });
  montar(h);

  expect(
    screen.getByRole("status", { name: "Carregando painel" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Cobertura do monitoramento/ }),
  ).not.toBeInTheDocument();
  await act(async () => {
    resolver(h.json(respostaCarteira.body));
  });

  const prazos = within(
    await screen.findByRole("region", { name: "Prazos e pendências" }),
  );
  expect(
    await prazos.findByText("Não foi possível carregar prazos e pendências."),
  ).toBeInTheDocument();
  expect(
    prazos.getByRole("button", { name: "Tentar novamente" }),
  ).toBeEnabled();
});
