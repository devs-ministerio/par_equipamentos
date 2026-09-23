WITH itens AS (
    SELECT c.id AS convenio_id, item->>'DESCRICAO_ITEM' AS descricao
    FROM convenio c
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.siconv_raw->'itens_plano_aplicacao', '[]'::jsonb)) item
    WHERE NOT EXISTS (SELECT 1 FROM equipamento_marcador m WHERE m.convenio_id = c.id)
      AND COALESCE(item->>'DESCRICAO_ITEM', '') <> ''
), classificados AS (
    SELECT convenio_id, descricao,
      CASE
        WHEN upper(descricao) ~ 'ACELERADOR[[:space:]]*LINEAR' THEN 'acelerador_linear'
        WHEN upper(descricao) ~ 'MAMOGRAFO' THEN 'mamografo'
        WHEN upper(descricao) ~ 'PET[ /-]*CT' THEN 'pet_ct'
        WHEN upper(descricao) ~ 'GAMA[[:space:]]*CAMARA|CAMARA[[:space:]]*CINTILOGRAFICA|SPECT' THEN 'gama_camera_spect'
        WHEN upper(descricao) ~ 'BRAQUITERAPIA' THEN 'braquiterapia'
        WHEN upper(descricao) ~ 'ENDOSCOP' THEN 'endoscopia'
        WHEN upper(descricao) ~ 'CITOMETR' THEN 'citometro_fluxo'
        ELSE 'item_plano_' || substring(md5(upper(regexp_replace(descricao, '^\\s*[0-9]+\\s*-\\s*', ''))) for 16)
      END AS codigo,
      regexp_replace(descricao, '^\\s*[0-9]+\\s*-\\s*', '') AS nome
    FROM itens
), novos_catalogos AS (
    INSERT INTO equipamento_catalogo (codigo, nome, prioritario)
    SELECT DISTINCT codigo, nome, false FROM classificados
    WHERE codigo LIKE 'item_plano_%'
    ON CONFLICT (codigo) DO NOTHING
    RETURNING id
), inseridos AS (
    INSERT INTO equipamento_marcador
      (equipamento_catalogo_id, convenio_id, descricao_original, tipo_evidencia, relacao, confianca, chave_evidencia)
    SELECT ec.id, c.convenio_id, c.descricao, 'item_orcamentario', 'aquisicao', 100,
      md5('convenio|' || c.convenio_id || '|' || c.codigo || '|' || c.descricao || '|item_orcamentario')
    FROM classificados c
    JOIN equipamento_catalogo ec ON ec.codigo = c.codigo
    ON CONFLICT DO NOTHING
    RETURNING convenio_id
)
SELECT (SELECT count(*) FROM inseridos) AS marcadores_criados,
       (SELECT count(*) FROM novos_catalogos) AS catalogos_criados;
