# Migrations históricas em quarentena

Estes arquivos não integram `alembic/versions` e não devem ser aplicados ao
clone operacional. Não modificar revisões ou inventar predecessores para
incluí-los na cadeia disponível.

`f0a1b2c3d4e5_aviso_aprovacao_carteira.py` foi recuperado integralmente do
patch histórico registrado em
`rollout-2026-10-07T09-50-45-01a1166a-9110-7153-a930-b90c239d39af.jsonl`
(seção completa 98 do inventário de fragmentos em 13/10). Seu predecessor
`e9f0a1b2c3d4` ainda não foi recuperado. O conteúdo foi preservado sem
alterações. Os testes executam somente esse arquivo em schema sintético;
não comprovam a cadeia histórica completa nem permitem iniciar a aplicação.

`e6a7b8c9d0f1_aviso_descoberta_radar.py` foi recuperado integralmente da
seção Add File do patch completo 299 do inventário em 13/10. Essa é a
revisão observada no clone sobrevivente; o predecessor `d5f6a7b8c9e0`
continua ausente. O arquivo mantém seu conteúdo original e também fica
fora da cadeia ativa. Testar essa expansão de enum não comprova as
migrations anteriores de reavaliação, escopo, recaptura ou aprovação.

`a1c2d3e4f5b6_numero_convenio_alfanumerico.py` foi recuperado integralmente
da seção Add File do patch completo 221. Seu predecessor é a revisão
`f0a1b2c3d4e5` recuperada acima, mas falta a cadeia anterior a ela. Fica
também em quarentena. Seus testes verificam a expansão da identidade e o
bloqueio de rollback com números alfanuméricos; não alteram os critérios de
descoberta nem demonstram que um identificador concreto pertence ao recorte.
