import type { AuthUser } from "@/services/auth";
import type { InstrumentoTimeline } from "@/services/monitoramento-instrumentos";
import type { AcaoMonitoramento } from "@/services/monitoramento-acoes";
import { criarDetalheConvenioResposta } from "./convenios-detalhe";
import { criarMarcosInteracao } from "./monitoramento-interacoes";
import {
  criarAcaoTeste,
  criarEventoTeste,
  criarInstrumentoTeste,
  prepararMonitoramentoHttp,
} from "./monitoramento-hooks";

/** Simula somente respostas HTTP; não simula persistência ou regras SQL. */
export function prepararOrquestracao() {
  const h = prepararMonitoramentoHttp();
  const controle = {
    timelineStatus: 200,
    marcosStatus: 200,
    acoesStatus: 200,
    escritaStatus: 200,
    usuario: {
      id: 1,
      name: "Gestor sintético",
      email: "qa@example.invalid",
      role: "gestor",
      status: "active",
      created_at: "2026-10-20T10:00:00Z",
    } satisfies AuthUser as AuthUser,
    timeline: {
      instrumento: criarInstrumentoTeste({
        tecnico_titular_id: 1,
        tecnico_titular: "Gestor sintético",
        responsavel_execucao_nome: "Responsável QA001",
      }),
      eventos: [],
      ao_vivo: { disponivel: false, valor_suspeito: false },
    } as InstrumentoTimeline,
    acoes: [
      criarAcaoTeste(),
      criarAcaoTeste({
        id: 22,
        nr_convenio: "QA002",
        descricao: "Ação de outro instrumento",
      }),
    ] as AcaoMonitoramento[],
  };
  h.fetch.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname;
    const metodo = init?.method ?? "GET";
    const corpo = init?.body ? JSON.parse(String(init.body)) : {};
    if (metodo !== "GET" && controle.escritaStatus !== 200)
      return h.json(
        {
          detail:
            controle.escritaStatus < 500
              ? "Operação não autorizada."
              : "diagnóstico reservado",
        },
        controle.escritaStatus,
      );
    if (path === "/auth/me") return h.json(controle.usuario);
    if (path === "/monitoramento/marcos")
      return h.json(
        controle.marcosStatus === 200 ? criarMarcosInteracao() : {},
        controle.marcosStatus,
      );
    const daLeitura = path.match(
      /^\/monitoramento\/instrumentos\/([^/]+)\/acoes$/,
    );
    if (daLeitura && metodo === "GET") {
      const nr = decodeURIComponent(daLeitura[1]);
      const doInstrumento = controle.acoes.filter((a) => a.nr_convenio === nr);
      return h.json(
        controle.acoesStatus === 200
          ? { data: doInstrumento, meta: { total: doInstrumento.length } }
          : {},
        controle.acoesStatus,
      );
    }
    if (path === "/monitoramento/acoes")
      return h.json(
        controle.acoesStatus === 200 ? controle.acoes : {},
        controle.acoesStatus,
      );
    if (path.endsWith("/repasse") && metodo === "GET")
      return h.json({
        repasse: null,
        repasse_previsto: false,
        fase_calculada: "Acompanhamento iniciado",
      });
    if (path.endsWith("/conclusao") && metodo === "GET")
      return h.json({
        nr_convenio: "x",
        pode_editar: true,
        conclusao: null,
        resultado: "sem_entregas",
        exige_justificativa: true,
        itens_exigidos: 0,
        itens_completos: 0,
        impedimentos: [],
      });
    if (path.endsWith("/equipamentos") && metodo === "GET")
      return h.json({
        nr_convenio: "x",
        pode_editar: true,
        itens: [],
        outros_itens: 0,
      });
    if (path.endsWith("/licenca-operacao") && metodo === "GET")
      return h.json({
        exige: false,
        cnes: null,
        sem_cnes: true,
        areas_exigidas: [],
        areas_sem_vinculo: [],
        ultima_carga: null,
        vinculos: [],
      });
    if (path.endsWith("/documentos") && metodo === "GET")
      return h.json({ nr_convenio: "x", pode_editar: true, documentos: [] });
    if (path === "/monitoramento/colaboradores")
      return h.json([{ id: 1, name: "Gestor sintético" }]);
    if (path.startsWith("/convenios/"))
      return h.json(
        criarDetalheConvenioResposta({
          numero: decodeURIComponent(path.split("/").at(-1)!),
        }),
      );
    if (path.endsWith("/concluir")) {
      const id = Number(path.split("/").at(-2));
      const acao = controle.acoes.find((a) => a.id === id)!;
      acao.data_conclusao = "2026-10-20";
      return h.json(acao);
    }
    if (path.endsWith("/acoes") && metodo === "POST") {
      const acao = criarAcaoTeste({ id: 31, ...corpo });
      controle.acoes.push(acao);
      return h.json(acao);
    }
    if (path.startsWith("/monitoramento/acoes/") && metodo !== "GET") {
      const id = Number(path.split("/").at(-1));
      const original = controle.acoes.find((a) => a.id === id)!;
      const resposta = {
        ...original,
        ...corpo,
        id: metodo === "PATCH" ? 32 : id,
        ativo: metodo !== "DELETE",
      };
      controle.acoes = controle.acoes.filter((a) => a.id !== id);
      if (metodo === "PATCH") controle.acoes.push(resposta);
      return h.json(resposta);
    }
    if (path.endsWith("/eventos") && metodo === "POST") {
      const evento = criarEventoTeste({ id: 41, ...corpo });
      controle.timeline.eventos.push(evento);
      return h.json(evento);
    }
    if (path.startsWith("/monitoramento/eventos/") && metodo !== "GET") {
      const id = Number(path.split("/").at(-1));
      const original = controle.timeline.eventos.find((e) => e.id === id)!;
      const resposta = {
        ...original,
        ...corpo,
        id: metodo === "PATCH" ? 42 : id,
        ativo: metodo !== "DELETE",
      };
      controle.timeline.eventos = controle.timeline.eventos.filter(
        (e) => e.id !== id,
      );
      if (metodo === "PATCH") controle.timeline.eventos.push(resposta);
      return h.json(resposta);
    }
    if (path.startsWith("/monitoramento/instrumentos/")) {
      if (metodo === "PATCH") {
        Object.assign(controle.timeline.instrumento, corpo);
        return h.json(controle.timeline.instrumento);
      }
      return h.json(
        controle.timelineStatus === 200 ? controle.timeline : {},
        controle.timelineStatus,
      );
    }
    throw new Error(`Rota sintética não prevista: ${metodo} ${path}`);
  });
  return { ...h, controle };
}
