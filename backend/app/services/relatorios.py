"""Fachada pública dos relatórios Excel/Word (N9: o arquivo único de ~1.500 linhas foi dividido por caso de uso).

Módulos: `relatorios_filtro` (filtro, rótulos e constantes), `relatorios_recorte` (consultas),
`relatorios_tabelas` (tabelas e resumos), `relatorios_xlsx`, `relatorios_docx` e `relatorios_merito`
(análise de mérito). Aqui ficam `montar_relatorio` e a reexportação dos nomes que routers e testes já usavam.

Orquestra a geração dos relatórios Excel/Word -- Plan Mode
docs/arquitetura/planmode-relatorios-2026-09-25.md, Blocos 2, 4 e 5.

Dois relatórios INDEPENDENTES (pedido do usuário 2026-09-26: "separar o
relatório de instrumentos e repasse do relatório de análise de mérito"):

- `instrumentos_repasse`: convênios firmados + propostas candidatas (linhas
  de financiamento do TransfereGov novo, ainda sem virar convênio) +
  monitoramento interno -- é o relatório com riqueza financeira/processual
  (tipo de contratação, componente, situação da proposta, todas as etapas
  do monitoramento). No Word, nível "completo" narra 1 bloco por instrumento
  (mesmo padrão dos briefings reais do departamento, ver `data/relatorios/`
  anexados pelo usuário 2026-09-26) em vez de só uma tabela achatada; no
  Excel continua tabela (pedido explícito do usuário: "o excel serão
  tabelas").
- `analise_merito`: só cobertura/déficit oncológico (MacroCoverage/
  MunicipalityCoverage) -- não existe pra escopo=cnes, que não tem
  granularidade por estabelecimento (mesma limitação já documentada no
  CLAUDE.md).

Ambos filtrados pelo mesmo filtro geográfico hierárquico (Brasil -> Região
-> UF -> Município -> CNES) + `ano` opcional (só usado por
`instrumentos_repasse` -- cobertura não tem essa dimensão, é execução/
competência, não ano civil).

Nível "simplificado" = estado ATUAL (fase corrente, sem histórico).
Nível "completo" = TUDO, inclusive a timeline inteira de eventos do
monitoramento interno.

Gaps conhecidos, NUNCA fabricados: "habilitação" CNES (não existe em
`CnesEstabelecimento`, só nome/endereço/CNPJ/município) e "produção
assistencial" (SIH/SIA/SUS por procedimento) -- essa última é dado do
projeto irmão `nota-informativa-decan` (DuckDB/parquet), fora do banco do
SISGEO; nenhuma das duas seções existe aqui até uma fonte real ser
integrada (ver plan-mode, "Fora de escopo").
"""

from __future__ import annotations

from contextlib import nullcontext

from sqlalchemy.orm import Session

from app.domain_errors import ValidationError
from app.repositories.limites_relatorio import LimiteConsultaExcedido
from app.services.relatorios_admissao import reservar_geracao_docx
from app.services.relatorios_docx import (  # noqa: F401
    _COLUNAS_ACOES_BLOCO,
    _COLUNAS_TIMELINE_BLOCO,
    _DATA_ACOES_BLOCO,
    _DATA_TIMELINE_BLOCO,
    _TIPO_PERSUS_I,
    _bloco_instrumento_narrativo,
    _bloco_monitorado_sem_bloco_oficial,
    _bloco_proposta_narrativo,
    _data_inauguracao_previsao,
    _formatar_ultima_acao,
    _formatar_ultimo_evento,
    _montar_instrumentos_repasse_docx,
    _secao_monitoramento_interno,
    _tabela_acoes_bloco,
    _tabela_equipamentos_bloco,
    _tabela_financeiro_bloco,
)
from app.services.relatorios_filtro import (  # noqa: F401
    _NOTA_VALOR_PERSUS_I,
    _ROTULO_CONTRATACAO,
    _ROTULO_GRUPO_MARCO,
    _SITUACAO_SEM_MONITORAMENTO_ESPERADO,
    _TIPO_EM_CONTRATACAO,
    _TIPO_PROPOSTA,
    Escopo,
    FiltroRelatorio,
    Formato,
    Nivel,
    TipoRelatorio,
    _assunto,
    _descricao_recorte,
    _legendas_resumo,
    _valor_global_confiavel,
)
from app.services.relatorios_merito import (  # noqa: F401
    _competencias_publicadas,
    _linhas_leitura,
    _montar_analise_merito,
    _secao_cobertura_linhas,
)
from app.services.relatorios_recorte import (  # noqa: F401
    _convenios,
    _convenios_do_recorte,
    _instrumentos,
    _instrumentos_do_recorte,
    _propostas,
    _propostas_do_recorte,
)
from app.services.relatorios_tabelas import (  # noqa: F401
    _COLUNAS_CONVENIO_COMPLETO,
    _COLUNAS_CONVENIO_SIMPLIFICADO,
    _COLUNAS_MONITORAMENTO_SIMPLIFICADO,
    _COLUNAS_MONITORAMENTO_TIMELINE,
    _COLUNAS_PROPOSTA_COMPLETO,
    _COLUNAS_PROPOSTA_SIMPLIFICADO,
    _DATA_CONVENIO_COMPLETO,
    _DATA_MONITORAMENTO_TIMELINE,
    _DATA_PROPOSTA,
    _GRUPOS_ORIGEM_CONVENIO,
    _MARCO_INAUGURACAO_CODIGO,
    _MOEDA_CONVENIO_COMPLETO,
    _MOEDA_CONVENIO_SIMPLIFICADO,
    _MOEDA_PROPOSTA,
    _ORDEM_TIPO_CONTRATACAO,
    _PADRAO_PROVENIENCIA_IMPORTACAO,
    _ROTULO_OUTROS_ORIGEM,
    _ROTULO_TIPO_CONTRATACAO,
    _SEM_EVENTO_REGISTRADO,
    _SITUACOES_PROPOSTA,
    _carregar_equipamentos_por_convenio,
    _entregues_por_convenio,
    _linhas_convenio,
    _linhas_proposta,
    _linhas_timeline_instrumento,
    _observacao_publica,
    _resumo_equipamentos,
    _resumo_instrumentos_programas,
    _resumo_propostas,
    _tabela_convenios,
    _tabela_monitoramento_simplificado,
    _tabela_monitoramento_timeline,
    _tabela_propostas,
    _valores_por_item_plano,
)
from app.services.relatorios_xlsx import _montar_instrumentos_repasse_xlsx  # noqa: F401


def _montar_instrumentos_repasse(db: Session, formato: Formato, nivel: Nivel, filtro: FiltroRelatorio) -> bytes:
    if formato == "xlsx":
        return _montar_instrumentos_repasse_xlsx(db, nivel, filtro)
    return _montar_instrumentos_repasse_docx(db, nivel, filtro)


def montar_relatorio(
    *, db: Session, formato: Formato, nivel: Nivel, tipo_relatorio: TipoRelatorio, filtro: FiltroRelatorio
) -> bytes:
    if tipo_relatorio == "analise_merito" and filtro.escopo == "cnes":
        raise ValidationError(
            "Análise de mérito não tem granularidade por estabelecimento (CNES) -- "
            "cobertura/déficit é calculada por macrorregião/município. Escolha outro escopo."
        )
    with reservar_geracao_docx() if formato == "docx" else nullcontext():
        try:
            if filtro.encerramento == "encerrados":
                if tipo_relatorio != "instrumentos_repasse":
                    raise ValidationError("Conclusão só se aplica ao relatório de instrumentos e parcerias.")
                from app.reports.encerrados import gerar_extracao
                from app.services.relatorios_encerrados import extrair_encerrados

                return gerar_extracao(
                    extrair_encerrados(db=db, filtro=filtro.filtro_encerrados()),
                    formato=formato,
                    recorte=filtro.titulo(),
                )
            if filtro.encerramento == "entregues":
                if tipo_relatorio != "instrumentos_repasse":
                    raise ValidationError("Equipamento entregue só se aplica ao relatório de instrumentos e parcerias.")
                from app.reports.entregues import gerar_extracao as gerar_entregues
                from app.services.relatorios_entregues import extrair_entregues

                return gerar_entregues(
                    extrair_entregues(db=db, filtro=filtro.filtro_encerrados()),
                    formato=formato,
                    recorte=filtro.titulo(),
                )
            if tipo_relatorio == "analise_merito":
                return _montar_analise_merito(db, formato, nivel, filtro)
            return _montar_instrumentos_repasse(db, formato, nivel, filtro)
        except LimiteConsultaExcedido as exc:
            raise ValidationError(
                "O recorte excede o limite seguro de exportação. Refine os filtros e gere o relatório novamente."
            ) from exc
