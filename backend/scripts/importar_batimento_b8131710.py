"""ARQUIVO HISTÓRICO ONE-SHOT — não é carga operacional vigente.

Importa os FAF/TED "realmente novos" da planilha `data/B8131710.xlsx`
(aba "Batimento sistema 2026-09") pro monitoramento interno -- achado
2026-09-11, pedido do usuario: "Os pronons, faf e ted pode subir no
sistema" (depois de validar os 6 "Convênio" nao encontrados contra a API
ao vivo do Portal da Transparencia -- ver sessao, nao entram aqui).

Essa planilha e uma fonte DIFERENTE da usada em
`importar_planilha_monitoramento.py` ("Monitoramento Base de Dados"): a
equipe ja fez um batimento proprio (`Encontrado no nosso sistema?`) contra
o SISPRO. Achados antes de escrever este script:
  - 463 linhas, 403 batem com o universo de 403 (`convenios_flat.json`) --
    confirma que `Convênio` aqui e o MESMO `nr_convenio` real quando
    presente.
  - Das 60 que nao batem: 44 FAF, 7 PRONON, 6 "Convênio", 3 TED.
  - Os 6 "Convênio" NAO entram aqui -- 3 (945991/945994/945989, Fundacao
    Napoleao Laureano) sao convenios REAIS confirmados ao vivo no Portal
    da Transparencia (`encontrado: true` em
    scripts/output/sispro_novos_validados.json, sessao anterior) mas com
    objeto de REFORMA DE OBRA CIVIL, nao aquisicao de equipamento --
    corretamente fora do escopo deste sistema, nao e bug. Os outros 3
    (Hospital Oswaldo Cruz/IMIP/Fundacao Beneficencia, "Cirurgia
    Robótica") nao tem nenhum identificador (CNPJ/numero) pra confirmar
    na API nem pra importar.
  - Dos 44 FAF + 3 TED, 13 JA FORAM IMPORTADOS numa rodada anterior
    (`importar_planilha_monitoramento.py`, planilha "Monitoramento Base
    de Dados") -- essa planilha `B8131710.xlsx` esta desatualizada em
    relacao a esse trabalho (o `NU_PROCESSO` bate digito-a-digito com o
    NUP SEI ja usado como nr_convenio). Excluidos daqui por dedup real
    (compara contra InstrumentoEquipamento existente, nao so contra uma
    lista fixa).
  - Sobram 34 FAF genuinamente novos, dos quais 33 tem `NU_PROPOSTA`
    (CNPJ, 14 digitos) -- usado como identificador (mesmo raciocinio de
    `_resolver_identificador` no outro script: NUP SEI/`NU_PROCESSO`
    primeiro quando disponivel, senao CNPJ, sempre so digitos, nunca
    fabrica). 1 FAF (Hospital Universitario do Ceara) e os 7 PRONON NAO
    tem CNPJ nem NUP SEI -- ficam de fora, logados (nao da pra importar
    sem identificador, mesmo com autorizacao do tipo).
  - Sem colisao de CNPJ entre as 33 linhas novas (conferido antes de
    escrever este script).
  - `Equipamento` = "Vários" quando a linha cobre mais de 1 item -- NUNCA
    vira `equipamento_descricao` (seria inventar um equipamento
    especifico que a planilha nao informa); so os valores especificos
    (ex. "Mamógrafo", "PET/CT") viram `equipamento_descricao`.

Idempotente -- mesmo padrao dos outros scripts de import: upsert por
nr_convenio, roda de novo sem duplicar.

Uso: python -m scripts.importar_batimento_b8131710 (de dentro de
backend/, venv ativo, DATABASE_URL configurada).

Antes de qualquer nova execução, revisar o inventário de fontes do Plan Mode
database/ingestão de 2026-09-21: a planilha é defasada para parte das cargas
e este script não substitui os importadores FAF/TED ativos.
"""
from __future__ import annotations

import re
from pathlib import Path

import openpyxl

from app.db.base import SessionLocal
from app.db.models import InstrumentoEquipamento

PLANILHA = Path(__file__).parent.parent.parent / "data" / "B8131710.xlsx"
ABA = "Batimento sistema 2026-09"

TIPOS_ALVO = {"FAF", "TED", "PRONON"}
PLACEHOLDER_EQUIPAMENTO = {"VÁRIOS", "VARIOS", ""}


def _texto(v) -> str | None:
    if v is None:
        return None
    s = str(v).replace("\xa0", " ").strip()
    return s or None


def _so_digitos(v) -> str | None:
    s = _texto(v)
    if not s:
        return None
    d = re.sub(r"\D", "", s)
    return d or None


def _cnpj_formatado(digitos: str) -> str:
    if len(digitos) == 14:
        return f"{digitos[0:2]}.{digitos[2:5]}.{digitos[5:8]}/{digitos[8:12]}-{digitos[12:14]}"
    return digitos


def run() -> None:
    wb = openpyxl.load_workbook(PLANILHA, data_only=True)
    ws = wb[ABA]
    header = [c.value for c in ws[1]]
    idx = {h: i for i, h in enumerate(header) if isinstance(h, str)}

    db = SessionLocal()
    try:
        existentes = {i.nr_convenio for i in db.query(InstrumentoEquipamento).all()}

        criados, atualizados, sem_identificador, ja_existia = 0, 0, [], []

        for linha in ws.iter_rows(min_row=2, values_only=True):
            if linha[0] is None and linha[3] is None:
                continue
            tipo = _texto(linha[idx["Tipo de Contratação"]])
            if tipo not in TIPOS_ALVO:
                continue
            if _texto(linha[idx["Encontrado no nosso sistema?"]]) == "Sim":
                continue

            # Resolve identificador: NU_PROCESSO (NUP SEI) primeiro, senao
            # NU_PROPOSTA (CNPJ) -- mesmo raciocinio de
            # importar_planilha_monitoramento.py::_resolver_identificador,
            # so digitos, nunca fabrica.
            identificador = _so_digitos(linha[idx["NU_PROCESSO"]]) or _so_digitos(linha[idx["NU_PROPOSTA"]])
            if not identificador:
                sem_identificador.append((tipo, _texto(linha[idx["Entidade"]])))
                continue
            if identificador in existentes:
                ja_existia.append((tipo, _texto(linha[idx["Entidade"]]), identificador))
                continue

            equipamento = _texto(linha[idx["Equipamento"]])
            if equipamento and equipamento.upper() in PLACEHOLDER_EQUIPAMENTO:
                equipamento = None

            cnpj_digitos = _so_digitos(linha[idx["NU_PROPOSTA"]])
            dados_instrumento = dict(
                nr_convenio=identificador,
                cnpj_convenente=_cnpj_formatado(cnpj_digitos) if cnpj_digitos else "",
                nome_convenente=_texto(linha[idx["Entidade"]]) or "",
                municipio=_texto(linha[idx["Município"]]),
                uf=_texto(linha[idx["UF"]]),
                equipamento_descricao=equipamento,
                ano_instrumento=int(linha[idx["Ano"]]) if linha[idx["Ano"]] else None,
                tipo_contratacao=tipo,
            )

            instrumento = db.query(InstrumentoEquipamento).filter_by(nr_convenio=identificador).one_or_none()
            if instrumento is None:
                db.add(InstrumentoEquipamento(**dados_instrumento))
                existentes.add(identificador)
                criados += 1
            else:
                for campo, valor in dados_instrumento.items():
                    if campo != "nr_convenio" and valor is not None:
                        setattr(instrumento, campo, valor)
                atualizados += 1

        db.commit()
        print(f"Instrumentos: {criados} criado(s), {atualizados} atualizado(s).")
        print(f"Ja existiam no banco (nr_convenio bateu, planilha desatualizada): {len(ja_existia)}")
        for tipo, nome, ident in ja_existia:
            print(f"   [INFO] {tipo} {ident!r} — {nome}")
        print(f"Sem identificador (nem NU_PROCESSO nem NU_PROPOSTA) -- fora, logado: {len(sem_identificador)}")
        for tipo, nome in sem_identificador:
            print(f"   [AVISO] {tipo} — {nome}")
    finally:
        db.close()


if __name__ == "__main__":
    run()
