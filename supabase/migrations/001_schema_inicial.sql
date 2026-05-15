-- ============================================================================
-- NOTIFICA LEGAL ERP - Schema Inicial
-- Migración de Google Sheets a Supabase/Postgres
-- ============================================================================

-- Configuración del sistema
CREATE TABLE config (
  clave TEXT PRIMARY KEY,
  valor TEXT
);

INSERT INTO config (clave, valor) VALUES
  ('EMPRESA_NOMBRE', 'Notifica Legal SpA'),
  ('EMPRESA_RUT', '78.036.379-7'),
  ('AÑO_FISCAL_INICIO', '2025'),
  ('MONEDA', 'CLP');

-- Periodos fiscales
CREATE TABLE periodos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  anio INTEGER NOT NULL UNIQUE,
  estado TEXT NOT NULL DEFAULT 'ABIERTO' CHECK (estado IN ('ABIERTO', 'CERRADO')),
  fecha_apertura DATE,
  fecha_cierre DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Plan de cuentas
CREATE TABLE plan_cuentas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('A', 'P', 'T', 'I', 'G')),
  usa_auxiliar TEXT DEFAULT '',
  usa_documento TEXT DEFAULT '',
  conciliable TEXT DEFAULT '',
  nivel INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'S' CHECK (estado IN ('S', 'N')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auxiliares (clientes, proveedores, etc.)
CREATE TABLE auxiliares (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rut TEXT NOT NULL UNIQUE,
  razon_social TEXT NOT NULL,
  giro TEXT DEFAULT '',
  direccion TEXT DEFAULT '',
  comuna TEXT DEFAULT '',
  telefono TEXT DEFAULT '',
  email TEXT DEFAULT '',
  tipo TEXT DEFAULT '' CHECK (tipo IN ('', 'CLIENTE', 'PROVEEDOR', 'EMPLEADO', 'OTRO')),
  estado TEXT NOT NULL DEFAULT 'S' CHECK (estado IN ('S', 'N')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tipos de documento
CREATE TABLE tipos_documento (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  codigo_sii INTEGER DEFAULT 0,
  nombre TEXT NOT NULL,
  abreviatura TEXT NOT NULL,
  clasificacion TEXT NOT NULL,
  afecto_iva TEXT DEFAULT 'N',
  origen TEXT DEFAULT 'MANUAL',
  estado TEXT NOT NULL DEFAULT 'S' CHECK (estado IN ('S', 'N'))
);

INSERT INTO tipos_documento (codigo, codigo_sii, nombre, abreviatura, clasificacion, afecto_iva, origen, estado) VALUES
  ('33', 33, 'Factura Electrónica', 'FAC', 'COMPRA/VENTA', 'S', 'CENTRAL', 'S'),
  ('34', 34, 'Factura Exenta Electrónica', 'FEX', 'COMPRA/VENTA', 'N', 'CENTRAL', 'S'),
  ('56', 56, 'Nota de Débito Electrónica', 'ND', 'COMPRA/VENTA', 'S', 'CENTRAL', 'S'),
  ('61', 61, 'Nota de Crédito Electrónica', 'NC', 'COMPRA/VENTA', 'S', 'CENTRAL', 'S'),
  ('PM', 0, 'Pago Masivo', 'PM', 'PAGO', 'N', 'BANCO', 'S'),
  ('TR', 0, 'Transferencia', 'TR', 'PAGO', 'N', 'BANCO', 'S'),
  ('CH', 0, 'Cheque', 'CH', 'PAGO', 'N', 'BANCO', 'S'),
  ('DP', 0, 'Depósito', 'DP', 'COBRANZA', 'N', 'BANCO', 'S'),
  ('VV', 0, 'Vale Vista', 'VV', 'PAGO', 'N', 'BANCO', 'S'),
  ('BH', 0, 'Boleta de Honorarios', 'BH', 'COMPRA', 'N', 'CENTRAL', 'S'),
  ('BE', 0, 'Boleta Honorarios Electrónica', 'BE', 'COMPRA', 'N', 'CENTRAL', 'S'),
  ('AN', 0, 'Anticipo', 'AN', 'INTERNO', 'N', 'MANUAL', 'S'),
  ('AB', 0, 'Abono', 'AB', 'INTERNO', 'N', 'MANUAL', 'S'),
  ('AP', 0, 'Apertura', 'AP', 'APERTURA', 'N', 'CIERRE', 'S'),
  ('RG', 0, 'Regularización', 'RG', 'INTERNO', 'N', 'MANUAL', 'S'),
  ('CI', 0, 'Cierre', 'CI', 'CIERRE', 'N', 'CIERRE', 'S'),
  ('00', 0, 'Sin Documento', 'SD', 'INTERNO', 'N', 'TODOS', 'S');

-- Comprobantes contables (cabecera)
CREATE TABLE comprobantes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  fecha DATE NOT NULL,
  glosa TEXT DEFAULT '',
  anio INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE', 'ANULADO')),
  usuario TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(numero, tipo, anio)
);

-- Movimientos contables (detalle de comprobantes)
CREATE TABLE mov_contables (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  comprobante_id BIGINT NOT NULL REFERENCES comprobantes(id),
  linea INTEGER NOT NULL,
  cuenta_codigo TEXT NOT NULL REFERENCES plan_cuentas(codigo),
  debe NUMERIC(15,2) DEFAULT 0,
  haber NUMERIC(15,2) DEFAULT 0,
  glosa TEXT DEFAULT '',
  auxiliar_rut TEXT DEFAULT '',
  tipo_doc TEXT DEFAULT '',
  num_doc TEXT DEFAULT '',
  fecha_doc DATE,
  referencia TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cartolas bancarias
CREATE TABLE cartolas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cuenta_banco TEXT NOT NULL,
  fecha DATE NOT NULL,
  descripcion TEXT DEFAULT '',
  referencia TEXT DEFAULT '',
  monto NUMERIC(15,2) NOT NULL,
  saldo NUMERIC(15,2) DEFAULT 0,
  tipo TEXT DEFAULT '',
  estado_conciliacion TEXT DEFAULT 'PENDIENTE' CHECK (estado_conciliacion IN ('PENDIENTE', 'CONCILIADO', 'OMITIDO')),
  comprobante_id BIGINT REFERENCES comprobantes(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ventas SII
CREATE TABLE ventas_sii (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  periodo TEXT,
  tipo_dte INTEGER,
  tipo_dte_nombre TEXT DEFAULT '',
  rut_receptor TEXT,
  razon_social TEXT DEFAULT '',
  folio TEXT,
  fecha_emision DATE,
  fecha_recepcion DATE,
  monto_exento NUMERIC(15,2) DEFAULT 0,
  monto_neto NUMERIC(15,2) DEFAULT 0,
  monto_iva NUMERIC(15,2) DEFAULT 0,
  monto_total NUMERIC(15,2) DEFAULT 0,
  estado_sii TEXT DEFAULT '',
  centralizado BOOLEAN DEFAULT FALSE,
  comprobante_id BIGINT REFERENCES comprobantes(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compras SII
CREATE TABLE compras_sii (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  periodo TEXT,
  tipo_dte INTEGER,
  tipo_dte_nombre TEXT DEFAULT '',
  rut_emisor TEXT,
  razon_social TEXT DEFAULT '',
  folio TEXT,
  fecha_emision DATE,
  fecha_recepcion DATE,
  monto_exento NUMERIC(15,2) DEFAULT 0,
  monto_neto NUMERIC(15,2) DEFAULT 0,
  monto_iva NUMERIC(15,2) DEFAULT 0,
  monto_total NUMERIC(15,2) DEFAULT 0,
  estado_sii TEXT DEFAULT '',
  centralizado BOOLEAN DEFAULT FALSE,
  comprobante_id BIGINT REFERENCES comprobantes(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Honorarios SII
CREATE TABLE honorarios_sii (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  periodo TEXT,
  rut_emisor TEXT,
  razon_social TEXT DEFAULT '',
  folio TEXT,
  fecha_emision DATE,
  monto_bruto NUMERIC(15,2) DEFAULT 0,
  retencion NUMERIC(15,2) DEFAULT 0,
  monto_liquido NUMERIC(15,2) DEFAULT 0,
  centralizado BOOLEAN DEFAULT FALSE,
  comprobante_id BIGINT REFERENCES comprobantes(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Boletas de ventas SII
CREATE TABLE boletas_ventas_sii (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  periodo TEXT,
  fecha DATE,
  cantidad INTEGER DEFAULT 0,
  monto_neto NUMERIC(15,2) DEFAULT 0,
  monto_iva NUMERIC(15,2) DEFAULT 0,
  monto_total NUMERIC(15,2) DEFAULT 0,
  centralizado BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conciliación bancaria
CREATE TABLE conciliacion_bancaria (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cuenta_banco TEXT NOT NULL,
  anio INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  cartola_id BIGINT REFERENCES cartolas(id),
  mov_contable_id BIGINT REFERENCES mov_contables(id),
  monto NUMERIC(15,2) DEFAULT 0,
  fecha_conciliacion DATE,
  metodo TEXT DEFAULT 'MANUAL' CHECK (metodo IN ('MANUAL', 'AUTOMATICO', 'REGLA')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reglas de conciliación automática
CREATE TABLE reglas_conciliacion (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre TEXT NOT NULL,
  cuenta_banco TEXT NOT NULL,
  patron TEXT NOT NULL,
  cuenta_contable TEXT REFERENCES plan_cuentas(codigo),
  tipo_doc TEXT DEFAULT '',
  activa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Centralizaciones
CREATE TABLE centralizaciones (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo TEXT NOT NULL,
  periodo TEXT NOT NULL,
  fecha DATE NOT NULL,
  comprobante_id BIGINT REFERENCES comprobantes(id),
  total_debe NUMERIC(15,2) DEFAULT 0,
  total_haber NUMERIC(15,2) DEFAULT 0,
  registros INTEGER DEFAULT 0,
  usuario TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categorías de flujo de caja
CREATE TABLE categoria_flujo (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('INGRESO', 'EGRESO')),
  orden INTEGER DEFAULT 0,
  estado TEXT DEFAULT 'S'
);

-- Ficha comercial de clientes
CREATE TABLE ficha_comercial (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rut TEXT NOT NULL UNIQUE,
  razon_social TEXT NOT NULL,
  nombre_fantasia TEXT DEFAULT '',
  giro TEXT DEFAULT '',
  direccion TEXT DEFAULT '',
  comuna TEXT DEFAULT '',
  telefono TEXT DEFAULT '',
  email TEXT DEFAULT '',
  contacto_nombre TEXT DEFAULT '',
  contacto_email TEXT DEFAULT '',
  facturacion_tipo TEXT DEFAULT 'Mes Vencido',
  tipo_doc TEXT DEFAULT 'Factura',
  plan TEXT DEFAULT '',
  valor_plan NUMERIC(15,2) DEFAULT 0,
  fecha_inicio DATE,
  estado TEXT DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'SUSPENDIDO', 'INACTIVO')),
  notas TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Plan de cuentas inicial
INSERT INTO plan_cuentas (codigo, nombre, tipo, usa_auxiliar, usa_documento, conciliable, nivel, estado) VALUES
  ('1-0-00-000', 'ACTIVOS', 'A', '', '', '', 1, 'S'),
  ('1-1-00-000', 'ACTIVO CIRCULANTE', 'A', '', '', '', 2, 'S'),
  ('1-1-01-000', 'CAJA Y BANCOS', 'A', '', '', '', 3, 'S'),
  ('1-1-01-001', 'CAJA CHICA', 'A', '', '', '', 4, 'S'),
  ('1-1-01-010', 'BANCO SANTANDER CLP', 'A', '', '', 'X', 4, 'S'),
  ('1-1-01-011', 'BANCO SANTANDER USD', 'A', '', '', 'X', 4, 'S'),
  ('1-1-03-000', 'CLIENTES', 'A', '', '', '', 3, 'S'),
  ('1-1-03-001', 'CLIENTES NACIONALES', 'A', 'X', 'X', '', 4, 'S'),
  ('1-1-04-000', 'ANTICIPOS', 'A', '', '', '', 3, 'S'),
  ('1-1-04-012', 'ANTICIPOS A PROVEEDORES', 'A', 'X', 'X', '', 4, 'S'),
  ('1-1-07-000', 'IMPUESTOS POR RECUPERAR', 'A', '', '', '', 3, 'S'),
  ('1-1-07-001', 'IVA CRÉDITO FISCAL', 'A', '', '', '', 4, 'S'),
  ('1-1-07-002', 'PPM POR RECUPERAR', 'A', '', '', '', 4, 'S'),
  ('2-0-00-000', 'PASIVO', 'P', '', '', '', 1, 'S'),
  ('2-1-00-000', 'PASIVO CIRCULANTE', 'P', '', '', '', 2, 'S'),
  ('2-1-03-000', 'PROVEEDORES', 'P', '', '', '', 3, 'S'),
  ('2-1-03-001', 'PROVEEDORES NACIONALES', 'P', 'X', 'X', '', 4, 'S'),
  ('2-1-05-000', 'IMPUESTOS POR PAGAR', 'P', '', '', '', 3, 'S'),
  ('2-1-05-001', 'IVA DÉBITO FISCAL', 'P', '', '', '', 4, 'S'),
  ('2-1-05-002', 'PPM POR PAGAR', 'P', '', '', '', 4, 'S'),
  ('2-1-06-000', 'RETENCIONES', 'P', '', '', '', 3, 'S'),
  ('2-1-06-001', 'RETENCIÓN HONORARIOS 13%', 'P', 'X', '', '', 4, 'S'),
  ('2-1-06-002', 'RETENCIÓN AFP/SALUD', 'P', '', '', '', 4, 'S'),
  ('2-1-07-000', 'REMUNERACIONES POR PAGAR', 'P', '', '', '', 3, 'S'),
  ('2-1-07-001', 'SUELDOS POR PAGAR', 'P', 'X', '', '', 4, 'S'),
  ('3-0-00-000', 'PATRIMONIO', 'T', '', '', '', 1, 'S'),
  ('3-1-00-000', 'CAPITAL', 'T', '', '', '', 2, 'S'),
  ('3-1-01-001', 'CAPITAL PAGADO', 'T', '', '', '', 4, 'S'),
  ('3-3-00-000', 'RESULTADOS', 'T', '', '', '', 2, 'S'),
  ('3-3-01-001', 'RESULTADO DEL EJERCICIO', 'T', '', '', '', 4, 'S'),
  ('3-3-01-002', 'RESULTADOS ACUMULADOS', 'T', '', '', '', 4, 'S'),
  ('4-0-00-000', 'INGRESOS', 'I', '', '', '', 1, 'S'),
  ('4-1-00-000', 'INGRESOS OPERACIONALES', 'I', '', '', '', 2, 'S'),
  ('4-1-01-001', 'VENTAS SERVICIOS NOTIFICACIÓN', 'I', '', '', '', 4, 'S'),
  ('4-1-01-002', 'VENTAS OTROS SERVICIOS', 'I', '', '', '', 4, 'S'),
  ('4-2-00-000', 'OTROS INGRESOS', 'I', '', '', '', 2, 'S'),
  ('4-2-01-001', 'INTERESES GANADOS', 'I', '', '', '', 4, 'S'),
  ('4-2-01-002', 'DIFERENCIA DE CAMBIO GANADA', 'I', '', '', '', 4, 'S'),
  ('7-0-00-000', 'COSTOS Y GASTOS', 'G', '', '', '', 1, 'S'),
  ('7-1-00-000', 'COSTOS OPERACIONALES', 'G', '', '', '', 2, 'S'),
  ('7-1-01-001', 'COSTO SERVICIOS EXTERNOS', 'G', '', '', '', 4, 'S'),
  ('7-1-01-002', 'COSTO PLATAFORMAS', 'G', '', '', '', 4, 'S'),
  ('7-2-00-000', 'GASTOS DE ADMINISTRACIÓN', 'G', '', '', '', 2, 'S'),
  ('7-2-01-001', 'REMUNERACIONES', 'G', '', '', '', 4, 'S'),
  ('7-2-01-002', 'HONORARIOS PROFESIONALES', 'G', '', '', '', 4, 'S'),
  ('7-2-01-003', 'GRATIFICACIONES', 'G', '', '', '', 4, 'S'),
  ('7-2-02-001', 'ARRIENDOS OFICINA', 'G', '', '', '', 4, 'S'),
  ('7-2-03-001', 'SERVICIOS BÁSICOS', 'G', '', '', '', 4, 'S'),
  ('7-2-03-002', 'TELEFONÍA', 'G', '', '', '', 4, 'S'),
  ('7-2-04-001', 'GASTOS BANCARIOS', 'G', '', '', '', 4, 'S'),
  ('7-2-04-002', 'INTERESES PAGADOS', 'G', '', '', '', 4, 'S'),
  ('7-2-05-001', 'GASTOS LEGALES', 'G', '', '', '', 4, 'S'),
  ('7-2-05-002', 'GASTOS NOTARIALES', 'G', '', '', '', 4, 'S'),
  ('7-2-06-001', 'DEPRECIACIÓN', 'G', '', '', '', 4, 'S'),
  ('7-2-07-001', 'GASTOS VARIOS', 'G', '', '', '', 4, 'S');

-- Periodo inicial
INSERT INTO periodos (anio, estado, fecha_apertura) VALUES (2025, 'ABIERTO', '2025-01-01');

-- Índices para rendimiento
CREATE INDEX idx_mov_contables_comprobante ON mov_contables(comprobante_id);
CREATE INDEX idx_mov_contables_cuenta ON mov_contables(cuenta_codigo);
CREATE INDEX idx_comprobantes_periodo ON comprobantes(anio, mes);
CREATE INDEX idx_ventas_sii_periodo ON ventas_sii(periodo);
CREATE INDEX idx_compras_sii_periodo ON compras_sii(periodo);
CREATE INDEX idx_cartolas_cuenta ON cartolas(cuenta_banco, fecha);
CREATE INDEX idx_ficha_comercial_rut ON ficha_comercial(rut);

-- RLS (Row Level Security) básico
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_cuentas ENABLE ROW LEVEL SECURITY;
ALTER TABLE auxiliares ENABLE ROW LEVEL SECURITY;
ALTER TABLE tipos_documento ENABLE ROW LEVEL SECURITY;
ALTER TABLE comprobantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mov_contables ENABLE ROW LEVEL SECURITY;
ALTER TABLE cartolas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas_sii ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras_sii ENABLE ROW LEVEL SECURITY;
ALTER TABLE honorarios_sii ENABLE ROW LEVEL SECURITY;
ALTER TABLE boletas_ventas_sii ENABLE ROW LEVEL SECURITY;
ALTER TABLE conciliacion_bancaria ENABLE ROW LEVEL SECURITY;
ALTER TABLE reglas_conciliacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE centralizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE categoria_flujo ENABLE ROW LEVEL SECURITY;
ALTER TABLE ficha_comercial ENABLE ROW LEVEL SECURITY;

-- Políticas: permitir lectura a usuarios autenticados
CREATE POLICY "Lectura autenticados" ON config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticados" ON periodos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticados" ON plan_cuentas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticados" ON auxiliares FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticados" ON tipos_documento FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticados" ON comprobantes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticados" ON mov_contables FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticados" ON cartolas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticados" ON ventas_sii FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticados" ON compras_sii FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticados" ON honorarios_sii FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticados" ON boletas_ventas_sii FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticados" ON conciliacion_bancaria FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticados" ON reglas_conciliacion FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticados" ON centralizaciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticados" ON categoria_flujo FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lectura autenticados" ON ficha_comercial FOR SELECT TO authenticated USING (true);

-- Políticas: escritura para usuarios autenticados
CREATE POLICY "Escritura autenticados" ON config FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escritura autenticados" ON periodos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escritura autenticados" ON plan_cuentas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escritura autenticados" ON auxiliares FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escritura autenticados" ON tipos_documento FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escritura autenticados" ON comprobantes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escritura autenticados" ON mov_contables FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escritura autenticados" ON cartolas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escritura autenticados" ON ventas_sii FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escritura autenticados" ON compras_sii FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escritura autenticados" ON honorarios_sii FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escritura autenticados" ON boletas_ventas_sii FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escritura autenticados" ON conciliacion_bancaria FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escritura autenticados" ON reglas_conciliacion FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escritura autenticados" ON centralizaciones FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escritura autenticados" ON categoria_flujo FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escritura autenticados" ON ficha_comercial FOR ALL TO authenticated USING (true) WITH CHECK (true);
