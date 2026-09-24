from scripts.validar_cobertura import avaliar_cobertura


def test_aceita_pisos_por_linha_e_branch():
    dados = {
        "files": {
            "/tmp/app/services/exemplo.py": {"summary": {"covered_lines": 8, "num_statements": 10, "covered_branches": 8, "num_branches": 10}},
            "/tmp/app/repositories/exemplo.py": {"summary": {"covered_lines": 7, "num_statements": 10, "covered_branches": 7, "num_branches": 10}},
            "/tmp/app/routers/exemplo.py": {"summary": {"covered_lines": 6, "num_statements": 10, "covered_branches": 6, "num_branches": 10}},
        }
    }

    assert avaliar_cobertura(dados) == []


def test_rejeita_branch_abaixo_do_piso_mesmo_com_linhas_suficientes():
    dados = {
        "files": {
            "/tmp/app/services/exemplo.py": {"summary": {"covered_lines": 9, "num_statements": 10, "covered_branches": 7, "num_branches": 10}},
            "/tmp/app/repositories/exemplo.py": {"summary": {"covered_lines": 7, "num_statements": 10, "covered_branches": 7, "num_branches": 10}},
            "/tmp/app/routers/exemplo.py": {"summary": {"covered_lines": 6, "num_statements": 10, "covered_branches": 6, "num_branches": 10}},
        }
    }

    assert avaliar_cobertura(dados) == ["services: linhas=90.0% branches=70.0% abaixo de 80.0%"]
