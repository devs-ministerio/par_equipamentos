"""Popula o catalogo de marcos + 1 instrumento de prova (convenio 948686,
Acelerador Linear HALCYON, IGESDF/Brasilia) pro monitoramento interno
pos-repasse -- ver app/db/models.py (secao 8) pro desenho.

Fonte do catalogo: planilha "Monitoramento Base de Dados - Convenio FAF
TED.xlsx", aba Instrucional (tabela de correlacao Situacao/Fase/%/Site) e
as colunas de cronograma fisico/regulatorio da aba "Planilha Monitoramento".
Fonte do instrumento 948686: mesma planilha, aba "Planilha Monitoramento",
linha do convenio 948686 (dado real, ja conferido contra
scripts/output/siconv_legado.json -- mesmo convenio, mesmos valores).

So roda esse instrumento de proposito (decisao do usuario 2026-09-03:
"implante em apenas um instrumento pra irmos pensando") -- escalar pros
71 fica pra depois de validar o desenho.

Uso: python -m scripts.seed_monitoramento (de dentro de backend/, venv ativo).
Idempotente: pode rodar de novo, so ignora o que ja existe (nao duplica)."""
from __future__ import annotations

from datetime import date

from app.db.base import SessionLocal
from app.db.models import EventoMarco, InstrumentoEquipamento, MarcoCatalogo, MarcoGrupo

# Catalogo -- (codigo, grupo, ordem, pct_referencia, rotulo, descricao_referencia).
# ordem/pct so fazem sentido em fase_geral (definem a barra de progresso);
# nos outros grupos sao so pontos de data, sem ordem entre si.
CATALOGO = [
    # --- fase_geral: a mesma tabela de correlacao Situacao/Fase/% da planilha ---
    ("fase_nao_iniciado", MarcoGrupo.fase_geral, 0, 0.0, "Não iniciado", "Em ação preparatória"),
    ("fase_em_licitacao", MarcoGrupo.fase_geral, 1, 0.10, "Em licitação", "Instrumento formalizado, cotação prévia em andamento"),
    ("fase_aguardando_repasse", MarcoGrupo.fase_geral, 2, 0.20, "Aguardando repasse", "Licitação homologada, sem repasse do FNS"),
    ("fase_equipamento_em_aquisicao", MarcoGrupo.fase_geral, 3, 0.30, "Equipamento em aquisição", "Repasse feito para a entidade"),
    ("fase_contratado", MarcoGrupo.fase_geral, 4, 0.50, "Contratado", "Invoice emitido, reforma não iniciada"),
    ("fase_em_andamento", MarcoGrupo.fase_geral, 5, 0.80, "Em andamento", "Invoice emitido, reforma iniciada"),
    ("fase_comissionamento", MarcoGrupo.fase_geral, 6, 0.95, "Comissionamento", "Equipamento no local, aguardando licença de operação"),
    ("fase_equipamento_entregue", MarcoGrupo.fase_geral, 7, 0.99, "Equipamento entregue", "Com licença, aguardando inauguração"),
    ("fase_concluido", MarcoGrupo.fase_geral, 8, 1.0, "Concluído", "Inaugurado e com licença de operação emitida pela CNEN"),

    # --- cronograma_fisico: datas pontuais, sem status de sistema nenhum ---
    ("cronograma_inicio_fabricacao", MarcoGrupo.cronograma_fisico, None, None, "Início da fabricação", None),
    ("cronograma_chegada_porto", MarcoGrupo.cronograma_fisico, None, None, "Chegada no Brasil (porto)", None),
    ("cronograma_entrega", MarcoGrupo.cronograma_fisico, None, None, "Entrega no estabelecimento", None),
    ("cronograma_instalacao_inicio", MarcoGrupo.cronograma_fisico, None, None, "Instalação — início", None),
    ("cronograma_instalacao_fim", MarcoGrupo.cronograma_fisico, None, None, "Instalação — final", None),
    ("cronograma_comissionamento", MarcoGrupo.cronograma_fisico, None, None, "Comissionamento (teste de aceite)", None),
    ("cronograma_obra_inicio", MarcoGrupo.cronograma_fisico, None, None, "Início da reforma/obra", None),
    ("cronograma_obra_ponto_critico", MarcoGrupo.cronograma_fisico, None, None, "Ponto crítico da obra", None),
    ("cronograma_obra_fim", MarcoGrupo.cronograma_fisico, None, None, "Fim da reforma/obra", None),
    ("cronograma_previsao_inauguracao", MarcoGrupo.cronograma_fisico, None, None, "Previsão de inauguração", None),

    # --- regulatorio: so relevante pra equipamento que emite radiacao (linac,
    # braquiterapia, PET-CT, gama camara) -- status vem do vocabulario da
    # propria CNEN/planilha (NI/NA/Em análise/Em diligência/Deferido).
    ("regulatorio_matricula_cnen", MarcoGrupo.regulatorio, None, None, "Matrícula CNEN", None),
    ("regulatorio_descomissionamento", MarcoGrupo.regulatorio, None, None, "SCRA descomissionamento (equipamento antigo)", None),
    ("regulatorio_modificacao_casamata", MarcoGrupo.regulatorio, None, None, "SCRA modificação/casamata", None),
    ("regulatorio_licenca_operacao", MarcoGrupo.regulatorio, None, None, "Licença de operação/alteração", None),
]

INSTRUMENTO_948686 = dict(
    nr_convenio="948686",
    cnpj_convenente="28.481.233/0001-72",
    nome_convenente="INSTITUTO DE GESTAO ESTRATEGICA DE SAUDE DO DISTRITO FEDERAL - IGESDF",
    municipio="BRASILIA",
    uf="DF",
    cnes="0010456",
    equipamento_descricao="010911-Acelerador Linear só de Fótons (monoenergético 6 MV) — Modelo HALCYON (Varian Medical Systems)",
    programa="ATENÇÃO ESPECIALIZADA EM SAÚDE - Políticas de Atenção Ambulatorial Especializada e Serviços Hospitalares de Alta Complexidade - Hospital",
    tp_instrumento_programa="Transferências Fundo a Fundo da Saúde",
    componente="RADIOTERAPIA",
    ano_instrumento=2023,
    # Sem valor_global/valor_repasse/valor_contrapartida de proposito --
    # decisao do usuario 2026-09-03: esses campos vem SEMPRE ao vivo da API
    # (Portal da Transparencia), nunca congelados aqui (ver models.py).
    tecnico_titular="PRISCILA",
    tecnico_suplente="BRUNA",
    nivel_monitoramento="ESTRATÉGICO",
    finalidade="Substituição",
    modalidade_onco="Tratamento",
)

# Eventos reconstruidos da planilha real (2026-09-03) -- a "fase atual" la e
# "Equipamento em aquisicao" (30%), com SCRA de modificacao de casamata
# deferido e o restante do cronograma fisico "Sem previsao" (nao lancado
# aqui -- so registra o que TEM data real; "sem previsao" nao e um evento,
# e ausencia de um).
# Tupla: (codigo, data_ocorrencia, data_prevista, status_regulatorio,
# numero_documento, data_validade, observacao). numero_documento/data_validade
# achados 2026-09-09 (antes o numero da matricula ia dentro de
# status_regulatorio por engano -- ver migration a9cd77597629, que tambem
# corrige quem ja rodou este seed antes dessa mudanca).
EVENTOS_948686 = [
    ("fase_equipamento_em_aquisicao", date(2025, 7, 25), None, None, None, None,
     "Repasse FNS realizado (R$ 9.003.200,00) — fonte: Portal da Transparência/SICONV."),
    ("regulatorio_matricula_cnen", None, None, None, "16981", None,
     "Matrícula CNEN registrada pra este instrumento."),
    ("regulatorio_modificacao_casamata", date(2025, 10, 13), None, "Deferido", None, None,
     "SCRA 2025SCRA2197 de modificação/casamata enviado à CNEN em 13/10/25 e deferido. "
     "Contexto: em 08/10/25 foi solicitado esclarecimento via TransfereGov/SEI sobre "
     "revisão do RPAS; instituição respondeu em 13/10 com o SCRA."),
]


def run() -> None:
    db = SessionLocal()
    try:
        marcos_por_codigo = {m.codigo: m for m in db.query(MarcoCatalogo).all()}
        for codigo, grupo, ordem, pct, rotulo, desc in CATALOGO:
            if codigo in marcos_por_codigo:
                continue
            marco = MarcoCatalogo(
                codigo=codigo, grupo=grupo, ordem=ordem,
                execucao_fisica_pct_referencia=pct, rotulo=rotulo, descricao_referencia=desc,
            )
            db.add(marco)
        db.flush()
        marcos_por_codigo = {m.codigo: m for m in db.query(MarcoCatalogo).all()}
        print(f"Catálogo: {len(marcos_por_codigo)} marco(s).")

        instrumento = db.query(InstrumentoEquipamento).filter_by(nr_convenio="948686").one_or_none()
        if instrumento is None:
            instrumento = InstrumentoEquipamento(**INSTRUMENTO_948686)
            db.add(instrumento)
            db.flush()
            print(f"Instrumento 948686 criado (id={instrumento.id}).")
        else:
            print(f"Instrumento 948686 já existe (id={instrumento.id}) — não duplicado.")

        eventos_existentes = {
            (e.marco_id, e.observacao) for e in
            db.query(EventoMarco).filter_by(instrumento_id=instrumento.id).all()
        }
        criados = 0
        for codigo, data_ocorrencia, data_prevista, status_reg, numero_documento, data_validade, observacao in EVENTOS_948686:
            marco = marcos_por_codigo[codigo]
            if (marco.id, observacao) in eventos_existentes:
                continue
            db.add(EventoMarco(
                instrumento_id=instrumento.id, marco_id=marco.id,
                data_ocorrencia=data_ocorrencia, data_prevista=data_prevista,
                status_regulatorio=status_reg, numero_documento=numero_documento,
                data_validade=data_validade, observacao=observacao,
                autor_id=None,  # autoria em texto livre por enquanto (login fica pra depois)
            ))
            criados += 1
        print(f"Eventos: {criados} novo(s) (de {len(EVENTOS_948686)} candidatos).")

        db.commit()
        print("Concluído.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
