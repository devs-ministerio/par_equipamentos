"""Fachada dos casos de uso de monitoramento (N9: o arquivo de ~740 linhas foi dividido).

Implementação em `monitoramento_comum`, `monitoramento_cadastro`, `monitoramento_registro_eventos` e
`monitoramento_acoes`; aqui só ficam as reexportações que routers, serviços e testes já usavam.
"""

from __future__ import annotations

from app.services.monitoramento_acoes import (  # noqa: F401
    _resumo_acao,
    concluir_acao_monitorada,
    editar_acao_monitorada,
    excluir_acao_monitorada,
    listar_acoes_monitoradas,
    obter_nr_convenio_da_acao_monitorada,
    registrar_acao_monitorada,
)
from app.services.monitoramento_cadastro import (  # noqa: F401
    DadosEquipamentoEntregue,
    _obter_colaborador_ativo,
    _resumo_equipamento_entregue,
    atualizar_cadastro_instrumento,
    substituir_responsaveis_instrumento,
)
from app.services.monitoramento_comum import (  # noqa: F401
    _MODALIDADES_ONCO_VALIDAS,
    _TIPOLOGIAS_VALIDAS,
    _agora_utc,
    _compor_observacao,
    _notificar_edicao_manual,
)
from app.services.monitoramento_registro_eventos import (  # noqa: F401
    NovoEventoMonitorado,
    _aplicar_dados_equipamento_entregue,
    _registrar_inauguracao_confirmada,
    _resumo_evento,
    _validar_dados_novo_evento,
    _validar_fase_geral_id,
    editar_evento_monitorado,
    excluir_evento_monitorado,
    registrar_evento_monitorado,
)
