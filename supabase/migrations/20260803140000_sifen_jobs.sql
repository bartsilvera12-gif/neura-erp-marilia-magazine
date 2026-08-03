-- =============================================================================
-- SIFEN — cola persistente de trabajos (`sifen_jobs`)
-- =============================================================================
--
-- Cada Job representa "encolar la emisión SIFEN de un DE" para que el worker
-- in-process (src/lib/sifen/jobs/sifen-worker.ts) la ejecute en background sin
-- bloquear la caja del vendedor.
--
-- El worker llama DIRECTAMENTE las funciones extraídas (handleSifenXmlPost,
-- handleSifenFirmarPost, handleSifenEnviarPost, handleSifenConsultaLotePost);
-- no usa loopback HTTP, por eso basta con congelar empresa_id + data_schema +
-- factura_id / factura_electronica_id en el Job.
--
-- Estados: pendiente → procesando → aprobado | rechazado | error.
-- Etapas:  xml | firmar | enviar | consulta_lote (donde se detuvo el Job).
--
-- Unicidad: un solo Job "vivo" (pendiente|procesando) por factura_electronica
-- (`uq_sifen_jobs_fe_activo`). "Reintentar" tras rechazo/error inserta un Job
-- nuevo, preservando el histórico.
--
-- Idempotente: la tabla puede ya existir (clonada del schema origen); este
-- script sólo agrega lo que falte. Aplica en el schema que tenga
-- `factura_electronica`.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'factura_electronica'
      AND c.relkind = 'r'
  LOOP
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.sifen_jobs (
        id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id                uuid NOT NULL,
        data_schema               text NOT NULL,
        factura_id                uuid NOT NULL,
        factura_electronica_id    uuid NOT NULL REFERENCES %I.factura_electronica(id) ON DELETE CASCADE,

        estado                    text NOT NULL DEFAULT 'pendiente'
          CHECK (estado IN ('pendiente','procesando','aprobado','rechazado','error')),
        etapa                     text
          CHECK (etapa IS NULL OR etapa IN ('xml','firmar','enviar','consulta_lote')),

        intentos                  int  NOT NULL DEFAULT 0,
        max_intentos_auto         int  NOT NULL DEFAULT 2,
        intentos_log              jsonb NOT NULL DEFAULT '[]'::jsonb,

        codigo_error_set          text,
        codigo_sub_error_set      text,
        mensaje_set               text,
        ultimo_error              text,
        tipo_error                text,

        respuesta_recibe_lote     jsonb,
        respuesta_consulta_lote   jsonb,

        cdc                       text,
        protocolo_lote            text,

        tiempo_xml_ms             int,
        tiempo_firmar_ms          int,
        tiempo_enviar_ms          int,
        tiempo_consulta_ms        int,
        tiempo_total_ms           int,

        origen                    text NOT NULL DEFAULT 'auto_venta'
          CHECK (origen IN ('auto_venta','reintento_manual','manual_admin')),

        created_at                timestamptz NOT NULL DEFAULT now(),
        started_at                timestamptz,
        finished_at               timestamptz,
        procesando_desde          timestamptz,
        lock_owner                text,
        proximo_reintento_at      timestamptz,

        veces_re_encolado_consulta int NOT NULL DEFAULT 0
      )$f$, r.sch, r.sch);

    -- Columnas que pueden faltar si la tabla venía de una versión anterior.
    EXECUTE format(
      'ALTER TABLE %I.sifen_jobs
         ADD COLUMN IF NOT EXISTS veces_re_encolado_consulta int NOT NULL DEFAULT 0',
      r.sch
    );
    EXECUTE format(
      'ALTER TABLE %I.sifen_jobs ADD COLUMN IF NOT EXISTS lock_owner text', r.sch);
    EXECUTE format(
      'ALTER TABLE %I.sifen_jobs ADD COLUMN IF NOT EXISTS proximo_reintento_at timestamptz', r.sch);
    EXECUTE format(
      'ALTER TABLE %I.sifen_jobs ADD COLUMN IF NOT EXISTS procesando_desde timestamptz', r.sch);

    -- `tipo_error` debe admitir 'set_timeout' (cierre por SET que nunca confirma
    -- el lote). Recreamos el CHECK completo para no depender de su estado previo.
    DECLARE
      cname text;
    BEGIN
      SELECT conname INTO cname
      FROM pg_constraint
      WHERE conrelid = format('%I.sifen_jobs', r.sch)::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%tipo_error%';
      IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE %I.sifen_jobs DROP CONSTRAINT %I', r.sch, cname);
      END IF;
      EXECUTE format(
        $c$ALTER TABLE %I.sifen_jobs
             ADD CONSTRAINT sifen_jobs_tipo_error_check
             CHECK (tipo_error IS NULL OR tipo_error IN (
               'set_rechazo','fiscal','firma','config',
               'red','http_5xx','storage','inesperado','set_timeout'
             ))$c$,
        r.sch
      );
    END;

    -- Cola FIFO: el worker toma el pendiente más viejo con backoff vencido.
    EXECUTE format($f$
      CREATE INDEX IF NOT EXISTS idx_sifen_jobs_pendientes
        ON %I.sifen_jobs (proximo_reintento_at NULLS FIRST, created_at)
        WHERE estado = 'pendiente'
    $f$, r.sch);

    -- Reclaim de jobs zombie: procesando sin cerrar por más de N minutos.
    EXECUTE format($f$
      CREATE INDEX IF NOT EXISTS idx_sifen_jobs_procesando
        ON %I.sifen_jobs (procesando_desde)
        WHERE estado = 'procesando'
    $f$, r.sch);

    -- Un solo job vivo por DE. Sin esto, el doble clic en "Reintentar" o el
    -- refresh del panel con ?auto=1 duplican envíos reales a SET.
    EXECUTE format($f$
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sifen_jobs_fe_activo
        ON %I.sifen_jobs (factura_electronica_id)
        WHERE estado IN ('pendiente','procesando')
    $f$, r.sch);

    EXECUTE format($f$
      CREATE INDEX IF NOT EXISTS idx_sifen_jobs_empresa_created
        ON %I.sifen_jobs (empresa_id, created_at DESC)
    $f$, r.sch);

    -- Lookup del último job por DE (para /sifen/resumen).
    EXECUTE format($f$
      CREATE INDEX IF NOT EXISTS idx_sifen_jobs_fe_created
        ON %I.sifen_jobs (factura_electronica_id, created_at DESC)
    $f$, r.sch);

    -- RLS: mismo modelo que factura_electronica. El service role la ignora.
    BEGIN
      EXECUTE format('ALTER TABLE %I.sifen_jobs ENABLE ROW LEVEL SECURITY', r.sch);

      EXECUTE format('DROP POLICY IF EXISTS "sifen_jobs_select" ON %I.sifen_jobs', r.sch);
      EXECUTE format('DROP POLICY IF EXISTS "sifen_jobs_insert" ON %I.sifen_jobs', r.sch);
      EXECUTE format('DROP POLICY IF EXISTS "sifen_jobs_update" ON %I.sifen_jobs', r.sch);
      EXECUTE format('DROP POLICY IF EXISTS "sifen_jobs_delete" ON %I.sifen_jobs', r.sch);

      EXECUTE format(
        'CREATE POLICY "sifen_jobs_select" ON %I.sifen_jobs FOR SELECT
           USING (public.puede_acceder_empresa(empresa_id))',
        r.sch
      );
      EXECUTE format(
        'CREATE POLICY "sifen_jobs_insert" ON %I.sifen_jobs FOR INSERT
           WITH CHECK (public.puede_acceder_empresa(empresa_id))',
        r.sch
      );
      EXECUTE format(
        'CREATE POLICY "sifen_jobs_update" ON %I.sifen_jobs FOR UPDATE
           USING (public.puede_acceder_empresa(empresa_id))
           WITH CHECK (public.puede_acceder_empresa(empresa_id))',
        r.sch
      );
      EXECUTE format(
        'CREATE POLICY "sifen_jobs_delete" ON %I.sifen_jobs FOR DELETE
           USING (public.puede_acceder_empresa(empresa_id))',
        r.sch
      );
    EXCEPTION WHEN undefined_function THEN
      -- Schemas legacy sin puede_acceder_empresa: la tabla queda sin RLS
      -- explícita. El service role igual puede leer/escribir.
      NULL;
    END;

    RAISE NOTICE 'sifen_jobs listo en schema %', r.sch;
  END LOOP;
END $$;
