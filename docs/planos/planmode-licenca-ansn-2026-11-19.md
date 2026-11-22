# Licença de operação pela fonte oficial da ANSN (19/11/2026)

Substitui a §8d do plano do fluxo de acompanhamento (licença por item). Estado: **em implementação** (aprovado em 19/11/2026).

Decisões finais do usuário: (1) a equipe entrega os vínculos **já validados**; não há fila de revisão nem sugestão automática na
aplicação (a análise de candidatas ficou em planilha avulsa); (2) a carga real da ANSN e dos vínculos é feita **depois, direto no banco**,
nada é carregado agora; (3) 825374: excluir só o documento de licença (TRP e TRD ficam); (4) instrumento sem CNES fica sem card até o
CNES existir.

## 1. Decisões já tomadas

- A licença **sai do equipamento** e liga-se ao **estabelecimento (CNES)**. Motivo: a matrícula da ANSN autoriza a instalação (o serviço),
  não a máquina; 730663 tem dois aceleradores (um entregue) sob a mesma instalação.
- O card **"Licença de operação" volta ao instrumento**, só para quem tem ao menos um item de família que exige licença
  (`equipamento_catalogo.exige_licenca`).
- A data de validade passa a vir da fonte oficial. Antes de substituir, é preciso **ligar** cada estabelecimento à matrícula.
- 825374 (mamógrafo, não exige licença da ANSN): os documentos de licença foram lançados por engano e serão excluídos (exclusão com motivo, `AuditLog`).

## 2. O que a fonte entrega (JSON de 19/11, 2.299 registros)

2.253 válidas (com validade) e 46 suspensas (sem validade e sem data da suspensão). Campos: matrícula, designação, cidade, UF, área de atuação, setor.
**Não há** CNPJ, CNES, ato nem série. **Não há base pública de vencidas**: matrícula que sumiu da lista não prova vencimento.
As 46 suspensas não alteram nenhum casamento nosso (nenhuma candidata dos nossos estabelecimentos está suspensa).

## 3. Medição sobre o clone da produção (ensaio 5d)

206 instrumentos com item que exige licença, em **144 estabelecimentos** (36 CNES compartilhados por mais de um instrumento; 14 CNES exigem as duas áreas).
9 instrumentos não têm CNES e ficam fora até o CNES ser definido.

| Estabelecimentos (CNES) | Qtd |
|---|---|
| Matrícula já informada pela equipe (PERSUS I) | 16 (15 conferem na ANSN; 1, a 16902, não consta: provável vencida) |
| Candidata forte e única (nome + cidade + área) | 68 |
| Forte, mas 2+ candidatas (várias instalações) | 8 |
| Média, exige revisão | 22 |
| Fraca | 16 |
| Sem candidata na cidade e área | 14 |

Verdade de referência: nas 16 matrículas informadas, o casamento por nome acerta 15 (o 16º não está na fonte). Amostra dos 68 fortes parece correta, mas
nome genérico ("Hospital Geral") na mesma cidade é o risco; por isso **sugestão nunca confirma sozinha**.

## 4. Modelo

Migration nova, depois da `b9c0d1e2f3a4`. A `a3b4c5d6e7f8` (ainda não lançada) deixa de criar `documento_instrumento.item_plano_id`.

- `carga_ansn`: `id`, `consultado_em`, `sha256_validas`, `sha256_suspensas`, totais, URLs da fonte.
- `instalacao_ansn`: `matricula` (PK, texto), `designacao`, `cidade`, `uf`, `area_atuacao`, `setor_atuacao`, `status` (`valida`/`suspensa`), `validade` (nula na suspensa),
  `primeira_carga_id`, `ultima_carga_id`. Matrícula ausente na carga mais nova mantém o registro com `ultima_carga_id` antigo: tela mostra
  "não consta na última carga" (nunca "vencida").
- `vinculo_licenca_estabelecimento`: `cnes` (FK `cnes_estabelecimento`), `matricula` (texto, **sem FK**, para aceitar matrícula informada que não está na fonte),
  `area_atuacao`, `metodo` (`matricula_informada`/`sugestao`/`manual`), `status` (`sugerido`/`confirmado`/`rejeitado`), `pontuacao`, `decidido_por_id`, `decidido_em`, `motivo`.
  Append-only (`substituido_por_id`, `deletado_em`); único ativo por (`cnes`, `matricula`). Um CNES pode ter vários vínculos (uma matrícula por área; várias na mesma área é legítimo).

Rejeitado também é guardado, para a sugestão não voltar.

## 5. Regras

- **Matrícula informada** (`Mat: N`, número puro ou `N/ano…` no documento) entra `confirmado` pelo método `matricula_informada`, desde que UF e cidade batam com o CNES (senão `sugerido`).
- **Sugestão** (`sugerir_vinculos_ansn`, simulação por padrão): chave é o **CNES** (nome do estabelecimento, depois nome do convenente), cidade e UF do CNES e do instrumento,
  área compatível (acelerador/cobalto/radioterapia/braquiterapia → RADIOTERAPIA; PET-CT/gama-câmara → MEDICINA NUCLEAR). Só grava `sugerido`; confirmar é decisão da equipe
  (gestor/admin, ou colaborador titular), com confirmação em lote para os fortes e únicos.
- **Validade oficial** entra no alerta e no card só com vínculo `confirmado`. Sem vínculo confirmado, vale o dado interno rotulado "sem fonte oficial".
  O documento interno `cnen_licenca` não é alterado nem apagado (append-only); passa a ser histórico "registro interno" e o número do ato fica nele.
- **Suspensa** aparece como "Suspensa" (alerta próprio, sem prazo). **Não consta** aparece como "Não consta na ANSN" (pede conferência), nunca "sem licença" nem "vencida".
- **Alerta** passa a ser por estabelecimento + área (não mais por item), com a lista de equipamentos do instrumento daquela área como contexto.

## 6. Tela

- Card "Licença de operação" no detalhe do instrumento (somente com item que exige licença): por vínculo, matrícula, área, situação, validade oficial, dias; botão para vincular/trocar;
  aviso "área sem vínculo" quando o instrumento exige uma área que nenhum vínculo cobre.
- Fila `/monitoramento-equipamentos/revisao-licencas` (gestor/admin), no desenho da revisão de itens: um cartão por CNES com candidatas, confirmar, trocar, rejeitar, em lote para os fortes.
- Some o "Licença ANSN: …" do item e `LicencaItemRead` (`licenca` por item) e o seletor de equipamento no documento de licença.

## 7. Entregue

1. `a3b4` sem `item_plano_id`; licença por item removida (backend, front, testes).
2. Migration `c8d9e0f1a2b3` (`instalacao_ansn`, `vinculo_licenca_estabelecimento`), repositório, serviço e `GET /monitoramento/instrumentos/{nr}/licenca-operacao`.
3. Card "Licença de operação" no instrumento (só com item que exige licença); alerta do resumo por vínculo oficial, com o registro interno como
   reserva rotulada ("interna") enquanto não houver vínculo.
4. `scripts/importar_licencas_ansn.py` (carga de instalações e vínculos, simulação por padrão): **não rodado em nenhum banco**.
5. `scripts/excluir_documentos_instrumento.py` (soft delete com motivo e `AuditLog`); uso previsto:
   `--instrumento 825374 --tipo cnen_licenca`.
6. No release: migration `c8d9e0f1a2b3` depois da `b9c0d1e2f3a4`; a carga da ANSN só quando os dados validados chegarem.

## 8. Fora de escopo

Vínculo por equipamento; vencimento inferido por ausência; qualquer uso na metodologia de cobertura; carga automática agendada (a fonte exige sessão anônima; fica para depois da primeira rodada manual).

## 9. Em aberto

- Formato do arquivo de vínculos validado (o script aceita CSV/XLSX com colunas `CNES` e `Matrícula`) e como a carga será feita no banco.
- Se a equipe quer, depois, vincular e trocar matrícula pela tela (hoje só leitura).
