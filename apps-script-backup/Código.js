/**
 * ============================================================================
 * CODE.gs - ROUTER PRINCIPAL
 * ============================================================================
 * Notifica Legal ERP - Sistema Contable Integrado
 * ============================================================================
 */

/**
 * Punto de entrada principal - maneja todas las solicitudes GET
 */
function doGet(e) {
  var page = e.parameter.page || 'dashboard';
  
  // Validar que la página existe
  var paginasValidas = [
    'dashboard', 'contabilidad', 'conciliacion', 'centralizacion', 'cierre', 'clientes', 'ficha'
  ];
  
  if (paginasValidas.indexOf(page) === -1) {
    page = 'dashboard';
  }
  
  try {
    return HtmlService.createTemplateFromFile(page)
      .evaluate()
      .setTitle('Notifica Legal ERP')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (error) {
    Logger.log('Error cargando página ' + page + ': ' + error.message);
    console.error('Error cargando página ' + page + ': ' + error.message);
    
    return HtmlService.createHtmlOutput(
      '<h1>Error cargando ' + page + '</h1>' +
      '<p>' + error.message + '</p>' +
      '<p><a href="?page=dashboard">Volver al Dashboard</a></p>'
    ).setTitle('Error - Notifica Legal ERP');
  }
}

/**
 * Incluir archivos HTML parciales
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Obtener email del usuario actual
 */
function getUserEmail() {
  return Session.getActiveUser().getEmail();
}

/**
 * Obtener URL del script para navegación
 */
function getWebAppUrl() {
  return ScriptApp.getService().getUrl();
}

/**
 * Test para verificar que las cuentas se cargan bien
 */
function testCuentas() {
  const cuentas = getCuentasMovimiento();
  const grupos = getCuentasParaSelector();
  
  Logger.log('=== TEST CUENTAS ===');
  Logger.log('Total cuentas de movimiento: ' + cuentas.length);
  
  let total = 0;
  Object.keys(grupos).forEach(tipo => {
    const cant = grupos[tipo].cuentas.length;
    total += cant;
    Logger.log(tipo + ' (' + grupos[tipo].nombre + '): ' + cant + ' cuentas');
    if (cant > 0 && cant <= 5) {
      grupos[tipo].cuentas.forEach(c => {
        Logger.log('  - ' + c.codigo + ' | ' + c.nombre);
      });
    }
  });
  
  Logger.log('Total en grupos: ' + total);
  Logger.log('Año fiscal activo: ' + getAñoFiscalActivo());
  
  const periodos = getPeriodos();
  Logger.log('Períodos encontrados: ' + periodos.length);
  if (periodos.length > 0) {
    Logger.log('Primer período: ' + JSON.stringify(periodos[0]));
  }
  
  return {
    cuentasMovimiento: cuentas.length,
    gruposParaSelector: total,
    añoFiscalActivo: getAñoFiscalActivo(),
    periodos: periodos.length
  };
}

/**
 * Obtener datos según el módulo
 */
function getModulo(modulo) {
  switch(modulo) {
    case 'contabilidad':
      return getDataContabilidad();
    case 'conciliacion':
      return getDataConciliacion();
    case 'centralizacion':
      return getDataCentralizacion();
    case 'clientes':
      return {};
    default:
      return {};
  }
}

/**
 * Inicialización del sistema - crear hojas y configuración inicial
 */
function inicializarSistema() {
  inicializarHojasContables();
  cargarPlanCuentasInicial();
  cargarTiposDocumentoInicial();
  return { success: true, mensaje: 'Sistema inicializado correctamente' };
}

/**
 * Carga el plan de cuentas inicial de Notifica Legal
 */
function cargarPlanCuentasInicial() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = getSheetNames();
  const sheet = ss.getSheetByName(sheets.PLAN_CUENTAS);
  
  const data = sheet.getDataRange().getValues();
  if (data.length > 1) return;
  
  const cuentas = [
    ['1-0-00-000', 'ACTIVOS', 'A', '', '', '', 1, 'S'],
    ['1-1-00-000', 'ACTIVO CIRCULANTE', 'A', '', '', '', 2, 'S'],
    ['1-1-01-000', 'CAJA Y BANCOS', 'A', '', '', '', 3, 'S'],
    ['1-1-01-001', 'CAJA CHICA', 'A', '', '', '', 4, 'S'],
    ['1-1-01-010', 'BANCO SANTANDER CLP', 'A', '', '', 'X', 4, 'S'],
    ['1-1-01-011', 'BANCO SANTANDER USD', 'A', '', '', 'X', 4, 'S'],
    ['1-1-03-000', 'CLIENTES', 'A', '', '', '', 3, 'S'],
    ['1-1-03-001', 'CLIENTES NACIONALES', 'A', 'X', 'X', '', 4, 'S'],
    ['1-1-04-000', 'ANTICIPOS', 'A', '', '', '', 3, 'S'],
    ['1-1-04-012', 'ANTICIPOS A PROVEEDORES', 'A', 'X', 'X', '', 4, 'S'],
    ['1-1-07-000', 'IMPUESTOS POR RECUPERAR', 'A', '', '', '', 3, 'S'],
    ['1-1-07-001', 'IVA CRÉDITO FISCAL', 'A', '', '', '', 4, 'S'],
    ['1-1-07-002', 'PPM POR RECUPERAR', 'A', '', '', '', 4, 'S'],
    ['2-0-00-000', 'PASIVO', 'P', '', '', '', 1, 'S'],
    ['2-1-00-000', 'PASIVO CIRCULANTE', 'P', '', '', '', 2, 'S'],
    ['2-1-03-000', 'PROVEEDORES', 'P', '', '', '', 3, 'S'],
    ['2-1-03-001', 'PROVEEDORES NACIONALES', 'P', 'X', 'X', '', 4, 'S'],
    ['2-1-05-000', 'IMPUESTOS POR PAGAR', 'P', '', '', '', 3, 'S'],
    ['2-1-05-001', 'IVA DÉBITO FISCAL', 'P', '', '', '', 4, 'S'],
    ['2-1-05-002', 'PPM POR PAGAR', 'P', '', '', '', 4, 'S'],
    ['2-1-06-000', 'RETENCIONES', 'P', '', '', '', 3, 'S'],
    ['2-1-06-001', 'RETENCIÓN HONORARIOS 13%', 'P', 'X', '', '', 4, 'S'],
    ['2-1-06-002', 'RETENCIÓN AFP/SALUD', 'P', '', '', '', 4, 'S'],
    ['2-1-07-000', 'REMUNERACIONES POR PAGAR', 'P', '', '', '', 3, 'S'],
    ['2-1-07-001', 'SUELDOS POR PAGAR', 'P', 'X', '', '', 4, 'S'],
    ['3-0-00-000', 'PATRIMONIO', 'T', '', '', '', 1, 'S'],
    ['3-1-00-000', 'CAPITAL', 'T', '', '', '', 2, 'S'],
    ['3-1-01-001', 'CAPITAL PAGADO', 'T', '', '', '', 4, 'S'],
    ['3-3-00-000', 'RESULTADOS', 'T', '', '', '', 2, 'S'],
    ['3-3-01-001', 'RESULTADO DEL EJERCICIO', 'T', '', '', '', 4, 'S'],
    ['3-3-01-002', 'RESULTADOS ACUMULADOS', 'T', '', '', '', 4, 'S'],
    ['4-0-00-000', 'INGRESOS', 'I', '', '', '', 1, 'S'],
    ['4-1-00-000', 'INGRESOS OPERACIONALES', 'I', '', '', '', 2, 'S'],
    ['4-1-01-001', 'VENTAS SERVICIOS NOTIFICACIÓN', 'I', '', '', '', 4, 'S'],
    ['4-1-01-002', 'VENTAS OTROS SERVICIOS', 'I', '', '', '', 4, 'S'],
    ['4-2-00-000', 'OTROS INGRESOS', 'I', '', '', '', 2, 'S'],
    ['4-2-01-001', 'INTERESES GANADOS', 'I', '', '', '', 4, 'S'],
    ['4-2-01-002', 'DIFERENCIA DE CAMBIO GANADA', 'I', '', '', '', 4, 'S'],
    ['7-0-00-000', 'COSTOS Y GASTOS', 'G', '', '', '', 1, 'S'],
    ['7-1-00-000', 'COSTOS OPERACIONALES', 'G', '', '', '', 2, 'S'],
    ['7-1-01-001', 'COSTO SERVICIOS EXTERNOS', 'G', '', '', '', 4, 'S'],
    ['7-1-01-002', 'COSTO PLATAFORMAS', 'G', '', '', '', 4, 'S'],
    ['7-2-00-000', 'GASTOS DE ADMINISTRACIÓN', 'G', '', '', '', 2, 'S'],
    ['7-2-01-001', 'REMUNERACIONES', 'G', '', '', '', 4, 'S'],
    ['7-2-01-002', 'HONORARIOS PROFESIONALES', 'G', '', '', '', 4, 'S'],
    ['7-2-01-003', 'GRATIFICACIONES', 'G', '', '', '', 4, 'S'],
    ['7-2-02-001', 'ARRIENDOS OFICINA', 'G', '', '', '', 4, 'S'],
    ['7-2-03-001', 'SERVICIOS BÁSICOS', 'G', '', '', '', 4, 'S'],
    ['7-2-03-002', 'TELEFONÍA', 'G', '', '', '', 4, 'S'],
    ['7-2-04-001', 'GASTOS BANCARIOS', 'G', '', '', '', 4, 'S'],
    ['7-2-04-002', 'INTERESES PAGADOS', 'G', '', '', '', 4, 'S'],
    ['7-2-05-001', 'GASTOS LEGALES', 'G', '', '', '', 4, 'S'],
    ['7-2-05-002', 'GASTOS NOTARIALES', 'G', '', '', '', 4, 'S'],
    ['7-2-06-001', 'DEPRECIACIÓN', 'G', '', '', '', 4, 'S'],
    ['7-2-07-001', 'GASTOS VARIOS', 'G', '', '', '', 4, 'S']
  ];
  
  cuentas.forEach(cuenta => { sheet.appendRow(cuenta); });
}

/**
 * Carga los tipos de documento iniciales
 */
function cargarTiposDocumentoInicial() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = getSheetNames();
  const sheet = ss.getSheetByName(sheets.TIPOS_DOCUMENTO);
  
  const data = sheet.getDataRange().getValues();
  if (data.length > 1) return;
  
  const tipos = [
    ['33', 33, 'Factura Electrónica', 'FAC', 'COMPRA/VENTA', 'S', 'CENTRAL', 'S'],
    ['34', 34, 'Factura Exenta Electrónica', 'FEX', 'COMPRA/VENTA', 'N', 'CENTRAL', 'S'],
    ['56', 56, 'Nota de Débito Electrónica', 'ND', 'COMPRA/VENTA', 'S', 'CENTRAL', 'S'],
    ['61', 61, 'Nota de Crédito Electrónica', 'NC', 'COMPRA/VENTA', 'S', 'CENTRAL', 'S'],
    ['PM', 0, 'Pago Masivo', 'PM', 'PAGO', 'N', 'BANCO', 'S'],
    ['TR', 0, 'Transferencia', 'TR', 'PAGO', 'N', 'BANCO', 'S'],
    ['CH', 0, 'Cheque', 'CH', 'PAGO', 'N', 'BANCO', 'S'],
    ['DP', 0, 'Depósito', 'DP', 'COBRANZA', 'N', 'BANCO', 'S'],
    ['VV', 0, 'Vale Vista', 'VV', 'PAGO', 'N', 'BANCO', 'S'],
    ['BH', 0, 'Boleta de Honorarios', 'BH', 'COMPRA', 'N', 'CENTRAL', 'S'],
    ['BE', 0, 'Boleta Honorarios Electrónica', 'BE', 'COMPRA', 'N', 'CENTRAL', 'S'],
    ['AN', 0, 'Anticipo', 'AN', 'INTERNO', 'N', 'MANUAL', 'S'],
    ['AB', 0, 'Abono', 'AB', 'INTERNO', 'N', 'MANUAL', 'S'],
    ['AP', 0, 'Apertura', 'AP', 'APERTURA', 'N', 'CIERRE', 'S'],
    ['RG', 0, 'Regularización', 'RG', 'INTERNO', 'N', 'MANUAL', 'S'],
    ['CI', 0, 'Cierre', 'CI', 'CIERRE', 'N', 'CIERRE', 'S'],
    ['00', 0, 'Sin Documento', 'SD', 'INTERNO', 'N', 'TODOS', 'S']
  ];
  
  tipos.forEach(tipo => { sheet.appendRow(tipo); });
}

/**
 * Menú personalizado en Google Sheets
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 Notifica Legal ERP')
    .addItem('🚀 Abrir Sistema', 'abrirSistema')
    .addSeparator()
    .addItem('⚙️ Inicializar Sistema', 'inicializarSistema')
    .addItem('📋 Crear Hojas Base', 'inicializarHojasContables')
    .addToUi();
}

/**
 * Abre el sistema en una nueva pestaña
 */
function abrirSistema() {
  var url = ScriptApp.getService().getUrl();
  var html = '<script>window.open("' + url + '");google.script.host.close();</script>';
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setHeight(1),
    'Abriendo sistema...'
  );
}

function testVentasYCompras() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  var ventas = ss.getSheetByName('Ventas_SII');
  if (ventas) {
    var data = ventas.getRange(1, 1, 3, 15).getValues();
    Logger.log('=== VENTAS_SII ===');
    Logger.log('Headers: ' + JSON.stringify(data[0]));
    Logger.log('Fila 2: ' + JSON.stringify(data[1]));
    Logger.log('Fila 3: ' + JSON.stringify(data[2]));
  }
  
  var compras = ss.getSheetByName('Compras_SII');
  if (compras) {
    var data = compras.getRange(1, 1, 3, 15).getValues();
    Logger.log('=== COMPRAS_SII ===');
    Logger.log('Headers: ' + JSON.stringify(data[0]));
    Logger.log('Fila 2: ' + JSON.stringify(data[1]));
    Logger.log('Fila 3: ' + JSON.stringify(data[2]));
  }
}

function verificarComprobantes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hojas = ss.getSheets().map(function(s) { return s.getName(); });
  Logger.log('Hojas existentes: ' + hojas.join(', '));
  
  var sheet = ss.getSheetByName('Comprobantes');
  if (sheet) {
    var data = sheet.getDataRange().getValues();
    Logger.log('Filas en Comprobantes: ' + data.length);
    Logger.log('Headers: ' + data[0].join(' | '));
    if (data.length > 1) {
      Logger.log('Primer registro: ' + data[1].join(' | '));
    }
  } else {
    Logger.log('ERROR: No existe hoja Comprobantes');
  }
}

// =============================================================================
// CONTROL DE ACCESO — Roles de Usuario
// =============================================================================

var ADMIN_USERS = ['carlos@notificalegal.cl', 'tesoreria@notificalegal.cl'];

function getUserRoleUI() {
  var email = Session.getActiveUser().getEmail().toLowerCase().trim();
  var esAdmin = ADMIN_USERS.indexOf(email) !== -1;
  return {
    email: email,
    rol: esAdmin ? 'admin' : 'consulta',
    esAdmin: esAdmin,
    nombre: email.split('@')[0]
  };
}

/**
 * Validar acceso de escritura en backend.
 * Llamar al inicio de TODA función que modifique datos.
 */
function validarAccesoEscritura_() {
  var email = Session.getActiveUser().getEmail().toLowerCase().trim();
  if (ADMIN_USERS.indexOf(email) === -1) {
    throw new Error('Acceso denegado. Su usuario (' + email + ') es solo consulta.');
  }
}

// Eliminar archivo temporal de Drive después de descarga
function eliminarArchivoTempUI(fileId) {
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
    return { success: true };
  } catch(e) { return { success: false }; }
}