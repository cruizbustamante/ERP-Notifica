/**
 * ============================================================================
 * CORE CONTABLE v3 - NOTIFICA LEGAL ERP
 * ============================================================================
 * Núcleo contable con mecánica REF estilo Softland
 * Todo parametrizable desde tablas Google Sheets
 * 
 * CHANGELOG v3 (sobre v2):
 * - Cierre SOLO ANUAL (eliminado cierre mensual)
 * - Períodos: 1 fila por año (ABIERTO/CERRADO), no 12 por mes
 * - Año abierto = cualquier mes disponible para contabilizar
 * - Archivo histórico: al cerrar año, mueve datos a otro Spreadsheet
 * 
 * De v2:
 * - Caché por ejecución (getPlanCuentas, getAuxiliares, getTiposDocumento)
 * - Validación de cuentas nivel 4 (movimiento) al contabilizar
 * - Uso consistente de buscarHoja() en todo el módulo
 * - Detección de documentos duplicados en ventas/compras
 * - Validación de montos negativos en debe/haber
 * - Advertencia de referencias cruzadas al anular comprobantes
 * ============================================================================
 */

// =============================================================================

// ID del Spreadsheet - necesario para contexto web app
var SPREADSHEET_ID = '1G_8l7S3bX-jLgd5T5-RQPwBaN1BuWOX9k9Ix9KX6brU';

function getSS() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ss;
}
// CACHÉ POR EJECUCIÓN
// =============================================================================

/**
 * Caché en memoria que dura solo la ejecución actual de GAS.
 * Evita leer la misma hoja múltiples veces en una sola llamada.
 * Se resetea automáticamente en cada nueva ejecución.
 */
var _cache = {
  planCuentas: null,
  auxiliares: null,
  tiposDocumento: null,
  catFlujo: null,
  config: null,
  sheetNames: null
};

function invalidarCache() {
  _cache = {
    planCuentas: null,
    auxiliares: null,
    tiposDocumento: null,
    catFlujo: null,
    config: null,
    sheetNames: null
  };
}

// =============================================================================
// CONFIGURACIÓN
// =============================================================================

function getConfig() {
  if (_cache.config) return _cache.config;
  
  var ss = getSS();
  var configSheet = ss.getSheetByName('Config');
  
  if (!configSheet) {
    Logger.log('Hoja Config no encontrada, usando valores por defecto');
    _cache.config = {};
    return _cache.config;
  }
  
  var data = configSheet.getDataRange().getValues();
  var config = {};
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) config[data[i][0]] = data[i][1];
  }
  
  _cache.config = config;
  return config;
}

function getSheetNames() {
  if (_cache.sheetNames) return _cache.sheetNames;
  
  var config = getConfig();
  _cache.sheetNames = {
    PLAN_CUENTAS: config.SHEET_PLAN_CUENTAS || 'Plan_Cuentas',
    AUXILIARES: config.SHEET_AUXILIARES || 'Auxiliares',
    TIPOS_DOCUMENTO: config.SHEET_TIPOS_DOCUMENTO || 'Tipos_Documentos',
    COMPROBANTES: config.SHEET_COMPROBANTES || 'Comprobantes',
    MOV_CONTABLES: config.SHEET_MOV_CONTABLES || 'Mov_Contables',
    PERIODOS: config.SHEET_PERIODOS || 'Periodos',
    CARTOLA: config.SHEET_CARTOLA || 'Cartolas',
    VENTAS: config.SHEET_VENTAS || 'Ventas_SII',
    COMPRAS: config.SHEET_COMPRAS || 'Compras_SII',
    HONORARIOS: config.SHEET_HONORARIOS || 'Honorarios_SII',
    BOLETAS_VENTAS: config.SHEET_BOLETAS_VENTAS || 'Boletas_Ventas_SII',
    CONCILIACION: config.SHEET_CONCILIACION || 'Conciliacion_Bancaria',
    REGLAS_CONCILIACION: config.SHEET_REGLAS_CONCILIACION || 'Reglas_Conciliacion',
    CENTRALIZACIONES: config.SHEET_CENTRALIZACIONES || 'Centralizaciones',
    CATEGORIA_FLUJO: config.SHEET_CATEGORIA_FLUJO || 'Categoria_Flujo'
  };
  return _cache.sheetNames;
}

/**
 * Función de diagnóstico para ver qué hojas existen
 */
function diagnosticarHojas() {
  var ss = getSS();
  var allSheets = ss.getSheets();
  var sheetNames = allSheets.map(function(s) { return s.getName(); });
  
  var esperadas = getSheetNames();
  var resultado = {
    hojasExistentes: sheetNames,
    hojasEsperadas: esperadas,
    faltantes: [],
    encontradas: {}
  };
  
  for (var key in esperadas) {
    var nombre = esperadas[key];
    var existe = sheetNames.indexOf(nombre) !== -1;
    resultado.encontradas[key] = existe ? nombre : 'NO ENCONTRADA';
    if (!existe) {
      resultado.faltantes.push(key + ': ' + nombre);
    }
  }
  
  Logger.log('=== DIAGNÓSTICO DE HOJAS ===');
  Logger.log('Hojas existentes: ' + sheetNames.join(', '));
  Logger.log('Faltantes: ' + resultado.faltantes.join(', '));
  
  return resultado;
}

/**
 * Busca una hoja por nombre, intentando variaciones comunes.
 * USO CONSISTENTE: todas las funciones del módulo usan esto.
 */
function buscarHoja(ss, nombreBase) {
  // Intentar nombre exacto primero (rápido)
  var sheet = ss.getSheetByName(nombreBase);
  if (sheet) return sheet;
  
  // Intentar variaciones
  var variaciones = [
    nombreBase.replace(/_/g, ' '),
    nombreBase.replace(/ /g, '_'),
    nombreBase.toLowerCase(),
    nombreBase.toUpperCase()
  ];
  
  for (var i = 0; i < variaciones.length; i++) {
    sheet = ss.getSheetByName(variaciones[i]);
    if (sheet) {
      Logger.log('Hoja encontrada con variación: ' + variaciones[i] + ' (buscaba: ' + nombreBase + ')');
      return sheet;
    }
  }
  
  return null;
}

/**
 * Helper: obtiene una hoja del sistema con buscarHoja consistente.
 * @param {string} claveSheet - Clave del objeto getSheetNames() (ej: 'COMPROBANTES')
 * @returns {Sheet|null}
 */
function getSheet(claveSheet) {
  var ss = getSS();
  var sheets = getSheetNames();
  var nombre = sheets[claveSheet];
  if (!nombre) {
    Logger.log('Clave de hoja no reconocida: ' + claveSheet);
    return null;
  }
  return buscarHoja(ss, nombre);
}

// =============================================================================
// PLAN DE CUENTAS (CON CACHÉ)
// =============================================================================

function getPlanCuentas(soloActivas) {
  if (soloActivas === undefined) soloActivas = true;
  
  // Usar caché: siempre cacheamos TODAS, luego filtramos
  if (!_cache.planCuentas) {
    var sheet = getSheet('PLAN_CUENTAS');
    if (!sheet) { _cache.planCuentas = []; return []; }
    
    var data = sheet.getDataRange().getValues();
    var cuentas = [];
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[0]) continue;
      
      var valorActivo = String(row[11]).toUpperCase().trim();
      var estaActiva = valorActivo !== 'N' && valorActivo !== 'I' && valorActivo !== 'FALSE';
      
      cuentas.push({
        codigo: String(row[0]).trim(),
        nombre: row[1],
        tipo: String(row[2]).toUpperCase().trim(),
        naturaleza: row[3],
        nivel: parseInt(row[4]) || calcularNivel(String(row[0])),
        requiereAuxiliar: row[5] === 'X' || row[5] === 'S' || row[5] === true,
        ctrlDocumento: row[6] === 'X' || row[6] === 'S' || row[6] === true,
        requiereDocumento: row[7] === 'X' || row[7] === 'S' || row[7] === true,
        esConciliable: row[8] === 'X' || row[8] === 'S' || row[8] === true,
        afectaEfe: row[9] === 'X' || row[9] === 'S' || row[9] === true,
        centroCosto: row[10] === 'X' || row[10] === 'S' || row[10] === true,
        activa: estaActiva,
        rowIndex: i + 1
      });
    }
    _cache.planCuentas = cuentas;
  }
  
  if (soloActivas) {
    return _cache.planCuentas.filter(function(c) { return c.activa; });
  }
  return _cache.planCuentas;
}

function calcularNivel(codigo) {
  var partes = codigo.split('-');
  var nivel = 0;
  for (var i = 0; i < partes.length; i++) {
    if (partes[i] !== '00' && partes[i] !== '000') nivel++;
  }
  return nivel;
}

function getCuenta(codigo) {
  var cuentas = getPlanCuentas(false);
  for (var i = 0; i < cuentas.length; i++) {
    if (cuentas[i].codigo === codigo) return cuentas[i];
  }
  return null;
}

/**
 * Verifica si una cuenta es de movimiento (nivel 4).
 * Formato esperado: X-X-XX-XXX donde 3er segmento ≠ 00 y 4to ≠ 000
 */
function esCuentaDeMovimiento(codigo) {
  var partes = String(codigo).trim().split('-');
  if (partes.length !== 4) return false;
  if (partes[2] === '00') return false;
  if (partes[3] === '000') return false;
  return true;
}

function getCuentasMovimiento() {
  var cuentas = getPlanCuentas(true);
  return cuentas.filter(function(cuenta) {
    return esCuentaDeMovimiento(cuenta.codigo);
  });
}

function getCuentasParaSelector() {
  var cuentas = getCuentasMovimiento();
  var grupos = {
    'A': { nombre: 'ACTIVOS', cuentas: [] },
    'P': { nombre: 'PASIVOS', cuentas: [] },
    'T': { nombre: 'PATRIMONIO', cuentas: [] },
    'I': { nombre: 'INGRESOS', cuentas: [] },
    'G': { nombre: 'GASTOS', cuentas: [] }
  };
  
  for (var i = 0; i < cuentas.length; i++) {
    var c = cuentas[i];
    var tipo = String(c.tipo).toUpperCase().trim();
    if (grupos[tipo]) {
      grupos[tipo].cuentas.push({
        codigo: c.codigo,
        nombre: c.nombre,
        tipo: tipo,
        requiereAuxiliar: c.requiereAuxiliar === true,
        requiereDocumento: c.requiereDocumento === true,
        afectaEfe: c.afectaEfe === true
      });
    }
  }
  
  return grupos;
}

// =============================================================================
// CATEGORÍAS FLUJO DE EFECTIVO (CON CACHÉ)
// =============================================================================

function getCategoriasFlujoCash() {
  if (_cache.catFlujo) return _cache.catFlujo;
  
  var sheet = getSheet('CATEGORIA_FLUJO');
  if (!sheet) { _cache.catFlujo = []; return []; }
  
  var data = sheet.getDataRange().getValues();
  var cats = [];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0] && row[0] !== 0) continue;
    var activo = String(row[4]).toUpperCase().trim();
    if (activo === 'N' || activo === 'NO') continue;
    cats.push({
      codigo: parseInt(row[0]) || 0,
      nombre: String(row[1]).trim(),
      tipo: String(row[2]).trim(),
      orden: parseInt(row[3]) || 0
    });
  }
  
  cats.sort(function(a, b) { return a.orden - b.orden; });
  _cache.catFlujo = cats;
  return cats;
}

/**
 * Retorna categorías agrupadas por tipo para selectores
 */
function getCategoriasFlujoCashUI() {
  return toClient(getCategoriasFlujoCash());
}

// =============================================================================
// TIPOS DE DOCUMENTO (CON CACHÉ)
// =============================================================================

function getTiposDocumento(soloActivos) {
  if (soloActivos === undefined) soloActivos = true;
  
  if (!_cache.tiposDocumento) {
    var sheet = getSheet('TIPOS_DOCUMENTO');
    if (!sheet) { _cache.tiposDocumento = []; return []; }
    
    var data = sheet.getDataRange().getValues();
    var tipos = [];
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[0]) continue;
      
      tipos.push({
        codigo: String(row[0]).trim(),
        nombre: row[1],
        abreviatura: String(row[0]).trim(),
        esTributario: row[2] === 'S' || row[2] === 'X' || row[2] === true,
        codigoSII: row[3] || 0,
        libro: row[4] || '',
        invierteSigno: row[5] === 'S' || row[5] === 'X' || row[5] === true,
        activo: row[6] !== 'N' && row[6] !== false && row[6] !== 'I',
        afectaIVA: row[2] === 'S' || row[2] === 'X' || row[2] === true,
        operacion: row[4] || '',
        modulo: row[4] || ''
      });
    }
    _cache.tiposDocumento = tipos;
  }
  
  if (soloActivos) {
    return _cache.tiposDocumento.filter(function(t) { return t.activo; });
  }
  return _cache.tiposDocumento;
}

function getTipoDocumento(codigo) {
  var tipos = getTiposDocumento(false);
  for (var i = 0; i < tipos.length; i++) {
    if (tipos[i].codigo === codigo) return tipos[i];
  }
  return null;
}

/**
 * Determina si un tipo de documento pertenece a libro de VENTAS o COMPRAS
 * (usado para detección de duplicados)
 */
function esDocumentoVentaCompra(codigoTipoDoc) {
  var tipo = getTipoDocumento(codigoTipoDoc);
  if (!tipo) return false;
  var libro = String(tipo.libro).toUpperCase().trim();
  return libro === 'VENTAS' || libro === 'COMPRAS' || libro === 'BOLETAS';
}

// =============================================================================
// AUXILIARES (CON CACHÉ)
// =============================================================================

function getAuxiliares(soloActivos) {
  if (soloActivos === undefined) soloActivos = true;
  
  if (!_cache.auxiliares) {
    var sheet = getSheet('AUXILIARES');
    if (!sheet) { _cache.auxiliares = []; return []; }
    
    var data = sheet.getDataRange().getValues();
    var auxiliares = [];
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[0]) continue;
      
      auxiliares.push({
        rut: formatearRUT(String(row[0])),
        rutNumero: limpiarRUT(String(row[0])),
        nombre: row[1],
        tipo: row[2],
        plazoPago: parseInt(row[3]) || 0,
        email: row[4] || '',
        telefono: row[5] || '',
        direccion: row[6] || '',
        activo: row[7] !== 'N' && row[7] !== false,
        cuentaGasto: row[8] ? String(row[8]).trim() : '',
        rowIndex: i + 1
      });
    }
    _cache.auxiliares = auxiliares;
  }
  
  if (soloActivos) {
    return _cache.auxiliares.filter(function(a) { return a.activo; });
  }
  return _cache.auxiliares;
}

function getAuxiliar(rut) {
  var rutLimpio = limpiarRUT(rut);
  var auxiliares = getAuxiliares(false);
  for (var i = 0; i < auxiliares.length; i++) {
    if (auxiliares[i].rutNumero === rutLimpio) return auxiliares[i];
  }
  return null;
}

function buscarAuxiliares(texto, limite) {
  if (!limite) limite = 10;
  var auxiliares = getAuxiliares(true);
  var textoLower = texto.toLowerCase();
  var textoRUT = limpiarRUT(texto); // limpiar para comparar con rutNumero
  var resultados = [];
  
  for (var i = 0; i < auxiliares.length; i++) {
    var a = auxiliares[i];
    if ((textoRUT && a.rutNumero.indexOf(textoRUT) !== -1) || 
        a.nombre.toLowerCase().indexOf(textoLower) !== -1) {
      resultados.push(a);
      if (resultados.length >= limite) break;
    }
  }
  return resultados;
}

function crearAuxiliar(datos) {
  var sheets = getSheetNames();
  var sheet = getSheet('AUXILIARES');
  var rutLimpio = limpiarRUT(datos.rut);
  
  var existente = getAuxiliar(rutLimpio);
  if (existente) return { success: false, error: 'El auxiliar ya existe', auxiliar: existente };
  
  sheet.appendRow([
    formatearRUT(rutLimpio), datos.nombre, datos.tipo || 'OTRO',
    datos.plazoPago || 0, datos.email || '', datos.telefono || '', datos.direccion || '', 'S',
    datos.cuentaGasto || ''
  ]);
  
  // Invalidar caché de auxiliares
  _cache.auxiliares = null;
  
  return { success: true, auxiliar: { rut: formatearRUT(rutLimpio), rutNumero: rutLimpio, nombre: datos.nombre } };
}

// =============================================================================
// PERÍODOS (1 FILA POR AÑO - CIERRE SOLO ANUAL)
// =============================================================================

/**
 * Estructura Periodos: AÑO | ESTADO | FECHA_APERTURA | FECHA_CIERRE | USUARIO_CIERRE | ARCHIVO_URL
 * Solo 1 fila por año. Estado: ABIERTO o CERRADO.
 */
function getPeriodos() {
  var sheet = getSheet('PERIODOS');
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  var periodos = [];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    periodos.push({
      año: parseInt(row[0]),
      estado: row[1],
      fechaApertura: row[2],
      fechaCierre: row[3],
      usuarioCierre: row[4],
      archivoUrl: row[5] || '',
      rowIndex: i + 1
    });
  }
  return periodos;
}

/**
 * Verifica si se puede contabilizar en un año/mes.
 * Lógica v3: si el AÑO está abierto, cualquier mes está disponible.
 */
function periodoEstaAbierto(año, mes) {
  return añoEstaAbierto(año);
}

function añoEstaAbierto(año) {
  var periodos = getPeriodos();
  for (var i = 0; i < periodos.length; i++) {
    if (periodos[i].año === año) {
      return periodos[i].estado === 'ABIERTO';
    }
  }
  return false;
}

function getAñoFiscalActivo() {
  var periodos = getPeriodos();
  var maxAño = null;
  for (var i = 0; i < periodos.length; i++) {
    if (periodos[i].estado === 'ABIERTO') {
      if (maxAño === null || periodos[i].año > maxAño) {
        maxAño = periodos[i].año;
      }
    }
  }
  return maxAño;
}

// =============================================================================
// NUMERACIÓN COMPROBANTES
// =============================================================================

function getRangoFoliosMes(mes) {
  var inicio = (mes - 1) * 1000 + 1;
  var fin = mes * 1000;
  return { inicio: inicio, fin: fin };
}

function getSiguienteNumeroComprobante(tipoComprobante, año, mes) {
  var sheet = getSheet('COMPROBANTES');
  var rango = getRangoFoliosMes(mes);
  if (!sheet) return rango.inicio;
  
  var data = sheet.getDataRange().getValues();
  var maxNumero = rango.inicio - 1;
  var tipoBusc = String(tipoComprobante).trim();
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (String(row[1]).trim() === tipoBusc && parseInt(row[2]) === año && parseInt(row[3]) === mes) {
      var num = parseInt(row[4]) || 0;
      if (num > maxNumero) maxNumero = num;
    }
  }
  
  var siguiente = maxNumero + 1;
  if (siguiente > rango.fin) throw new Error('Folios agotados para ' + tipoComprobante + ' en ' + mes + '/' + año);
  return siguiente;
}

function getTiposComprobante() {
  var config = getConfig();
  return {
    INGRESO: config.TIPO_COMP_INGRESO || 'I',
    EGRESO: config.TIPO_COMP_EGRESO || 'E',
    TRASPASO: config.TIPO_COMP_TRASPASO || 'T',
    APERTURA: config.TIPO_COMP_APERTURA || 'A',
    CIERRE: config.TIPO_COMP_CIERRE || 'C'
  };
}

// =============================================================================
// DETECCIÓN DE DUPLICADOS - VENTAS / COMPRAS
// =============================================================================

/**
 * Verifica si un documento tributario ya existe en los movimientos contables.
 * Busca por combinación única: auxiliar + tipo_documento + numero_documento
 * Solo aplica a documentos de tipo REGISTRO en movimientos vigentes.
 *
 * @param {string} auxiliar - RUT del auxiliar
 * @param {string} tipoDoc - Código del tipo de documento (FA, FC, NC, etc)
 * @param {string} numDoc  - Número del documento
 * @returns {Object|null} - Info del duplicado encontrado, o null si no existe
 */
function buscarDocumentoDuplicado(auxiliar, tipoDoc, numDoc) {
  if (!auxiliar || !tipoDoc || !numDoc) return null;
  
  // Solo verificar duplicados para documentos tributarios de venta/compra
  if (!esDocumentoVentaCompra(tipoDoc)) return null;
  
  var sheetMov = getSheet('MOV_CONTABLES');
  var sheetComp = getSheet('COMPROBANTES');
  if (!sheetMov || !sheetComp) return null;
  
  var dataComp = sheetComp.getDataRange().getValues();
  var dataMov = sheetMov.getDataRange().getValues();
  
  // Mapa de comprobantes vigentes
  var compVigentes = {};
  for (var i = 1; i < dataComp.length; i++) {
    if (dataComp[i][10] !== 'ANULADO') {
      compVigentes[dataComp[i][0]] = {
        fecha: dataComp[i][5],
        glosa: dataComp[i][6]
      };
    }
  }
  
  var rutLimpio = limpiarRUT(auxiliar);
  var numDocStr = String(numDoc).trim();
  var tipoDocStr = String(tipoDoc).trim();
  
  for (var i = 1; i < dataMov.length; i++) {
    var row = dataMov[i];
    
    // Solo REGISTRO en comprobantes vigentes
    if (row[13] !== 'REGISTRO') continue;
    if (!compVigentes[row[1]]) continue;
    
    // Comparar auxiliar + tipoDoc + numDoc
    var movAuxiliar = limpiarRUT(row[7]);
    var movTipoDoc = String(row[8]).trim();
    var movNumDoc = String(row[9]).trim();
    
    if (movAuxiliar === rutLimpio && movTipoDoc === tipoDocStr && movNumDoc === numDocStr) {
      var comp = compVigentes[row[1]];
      return {
        duplicado: true,
        comprobante: row[1],
        cuenta: row[3],
        fecha: row[14],
        debe: parseFloat(row[4]) || 0,
        haber: parseFloat(row[5]) || 0,
        glosa: row[6],
        fechaComprobante: comp.fecha,
        mensaje: 'DUPLICADO: Documento ' + tipoDocStr + ' N°' + numDocStr +
                 ' del auxiliar ' + rutLimpio + ' ya existe en comprobante ' + row[1]
      };
    }
  }
  
  return null;
}

/**
 * Verificación masiva de duplicados para un conjunto de líneas.
 * Retorna array de alertas (vacío si no hay duplicados).
 *
 * @param {Array} lineas - Líneas del comprobante a verificar
 * @returns {Array} - Lista de alertas de duplicados encontrados
 */
function verificarDuplicadosEnLineas(lineas) {
  var alertas = [];
  var yaVerificados = {}; // Para no buscar el mismo doc dos veces en el mismo comprobante
  
  for (var i = 0; i < lineas.length; i++) {
    var linea = lineas[i];
    if (!linea.tipoDoc || !linea.numDoc) continue;
    
    // Solo verificar documentos de REGISTRO (no rebajas)
    var esRegistro = true;
    if (linea.refTipo && linea.refNum) {
      if (linea.refTipo !== linea.tipoDoc || linea.refNum !== linea.numDoc) {
        esRegistro = false; // Es REBAJA, no verificar como duplicado
      }
    }
    if (!esRegistro) continue;
    
    var claveVerif = (linea.auxiliar || '') + '|' + linea.tipoDoc + '|' + linea.numDoc;
    if (yaVerificados[claveVerif]) continue;
    yaVerificados[claveVerif] = true;
    
    var duplicado = buscarDocumentoDuplicado(linea.auxiliar, linea.tipoDoc, linea.numDoc);
    if (duplicado) {
      alertas.push({
        linea: i + 1,
        tipoDoc: linea.tipoDoc,
        numDoc: linea.numDoc,
        auxiliar: linea.auxiliar,
        comprobanteExistente: duplicado.comprobante,
        mensaje: duplicado.mensaje
      });
    }
  }
  
  return alertas;
}

// =============================================================================
// COMPROBANTES - MECÁNICA REF (MEJORADO)
// =============================================================================

/**
 * Crea un comprobante contable con validaciones reforzadas.
 * 
 * Validaciones v2:
 *   1. Período abierto
 *   2. Cuadratura debe = haber
 *   3. Montos no negativos en debe/haber
 *   4. Cuentas existen, activas y de movimiento (nivel 4)
 *   5. Auxiliar obligatorio si cuenta lo exige
 *   6. Documento obligatorio si cuenta lo exige
 *   7. Auxiliar existe en maestro
 *   8. Folio disponible en rango del mes
 *   9. Detección de duplicados en ventas/compras
 *
 * @param {Object} datos - { tipo, fecha, glosa, lineas[], origen, origenRef, forzarDuplicados }
 *   - forzarDuplicados: si es true, permite grabar aún con duplicados (genera warnings)
 * @returns {Object} - { success, comprobante, warnings[] } o { success: false, error }
 */
function crearComprobante(datos) {
  validarAccesoEscritura_();
  var ss = getSS();
  var sheets = getSheetNames();
  var warnings = [];
  
  var fecha = new Date(datos.fecha);
  var año = fecha.getFullYear();
  var mes = fecha.getMonth() + 1;
  
  // 1. Período abierto
  if (!periodoEstaAbierto(año, mes)) {
    return { success: false, error: 'Período ' + mes + '/' + año + ' no está abierto' };
  }
  
  // 2. Cuadratura + 3. Montos no negativos
  var totalDebe = 0, totalHaber = 0;
  for (var i = 0; i < datos.lineas.length; i++) {
    var l = datos.lineas[i];
    var monDebe = parseFloat(l.debe) || 0;
    var monHaber = parseFloat(l.haber) || 0;
    
    // NUEVO: Validar montos no negativos
    if (monDebe < 0) {
      return { success: false, error: 'Línea ' + (i + 1) + ': monto DEBE no puede ser negativo (' + monDebe + ')' };
    }
    if (monHaber < 0) {
      return { success: false, error: 'Línea ' + (i + 1) + ': monto HABER no puede ser negativo (' + monHaber + ')' };
    }
    
    totalDebe += monDebe;
    totalHaber += monHaber;
  }
  
  if (Math.abs(totalDebe - totalHaber) > 0.01) {
    return { success: false, error: 'No cuadra. Debe: ' + totalDebe + ', Haber: ' + totalHaber };
  }
  
  // 4-7. Validar líneas
  for (var i = 0; i < datos.lineas.length; i++) {
    var linea = datos.lineas[i];
    var cuenta = getCuenta(linea.cuenta);
    
    if (!cuenta) {
      return { success: false, error: 'Cuenta ' + linea.cuenta + ' no existe' };
    }
    if (!cuenta.activa) {
      return { success: false, error: 'Cuenta ' + linea.cuenta + ' está inactiva' };
    }
    
    // NUEVO: Validar que sea cuenta de movimiento (nivel 4)
    if (!esCuentaDeMovimiento(linea.cuenta)) {
      return { 
        success: false, 
        error: 'Cuenta ' + linea.cuenta + ' (' + cuenta.nombre + ') no es cuenta de movimiento. ' +
               'Solo se puede contabilizar en cuentas de nivel 4 (formato X-X-XX-XXX)'
      };
    }
    
    if (cuenta.requiereAuxiliar && !linea.auxiliar) {
      return { success: false, error: 'Cuenta ' + linea.cuenta + ' requiere auxiliar' };
    }
    if (cuenta.requiereDocumento && (!linea.tipoDoc || !linea.numDoc)) {
      return { success: false, error: 'Cuenta ' + linea.cuenta + ' requiere documento (tipo y número)' };
    }
    // Solo validar auxiliar si la cuenta lo requiere; si no, limpiar
    if (cuenta.requiereAuxiliar && linea.auxiliar && !getAuxiliar(linea.auxiliar)) {
      return { success: false, error: 'Auxiliar ' + linea.auxiliar + ' no existe en el maestro' };
    }
    if (!cuenta.requiereAuxiliar) {
      linea.auxiliar = '';
    }
  }
  
  // 9. NUEVO: Detección de duplicados en ventas/compras
  var alertasDuplicados = verificarDuplicadosEnLineas(datos.lineas);
  
  if (alertasDuplicados.length > 0) {
    if (!datos.forzarDuplicados) {
      // Rechazar por defecto — el usuario debe confirmar con forzarDuplicados=true
      var mensajes = [];
      for (var d = 0; d < alertasDuplicados.length; d++) {
        mensajes.push(alertasDuplicados[d].mensaje);
      }
      return { 
        success: false, 
        error: 'DOCUMENTOS DUPLICADOS DETECTADOS',
        duplicados: alertasDuplicados,
        detalle: mensajes.join(' | '),
        requiereConfirmacion: true
      };
    } else {
      // Permitir pero registrar warnings
      for (var d = 0; d < alertasDuplicados.length; d++) {
        warnings.push('DUPLICADO FORZADO: ' + alertasDuplicados[d].mensaje);
      }
      Logger.log('⚠️ Comprobante creado CON duplicados forzados: ' + warnings.join('; '));
    }
  }
  
  // 7b. Validar saldos para líneas que rebajan documentos existentes
  var planCuentasVal = getPlanCuentas(false);
  var planMapVal = {};
  var cuentasDocVal = {};
  for (var i = 0; i < planCuentasVal.length; i++) {
    planMapVal[planCuentasVal[i].codigo] = planCuentasVal[i];
    if (planCuentasVal[i].requiereDocumento) cuentasDocVal[planCuentasVal[i].codigo] = true;
  }
  
  // Verificar si hay líneas que reducen saldo
  var tieneRebajas = false;
  for (var i = 0; i < datos.lineas.length; i++) {
    var linV = datos.lineas[i];
    var ctaV = planMapVal[linV.cuenta];
    if (!ctaV || !ctaV.requiereDocumento) continue;
    var rTipoV = linV.refTipo || linV.tipoDoc || '';
    var rNumV  = linV.refNum  || linV.numDoc  || '';
    if (!rTipoV || !rNumV) continue;
    var esActV = ctaV.tipo === 'A';
    var montoReduceV = esActV ? (parseFloat(linV.haber) || 0) : (parseFloat(linV.debe) || 0);
    if (montoReduceV > 0) { tieneRebajas = true; break; }
  }
  
  if (tieneRebajas) {
    var configVal = getConfig();
    var tipoApertVal = configVal.TIPO_COMP_APERTURA || getTiposComprobante().APERTURA || 'A';
    var sheetCompVal = buscarHoja(ss, sheets.COMPROBANTES);
    var sheetMovVal  = buscarHoja(ss, sheets.MOV_CONTABLES);
    var dataCompVal  = sheetCompVal.getDataRange().getValues();
    var dataMovVal   = sheetMovVal.getDataRange().getValues();
    
    var compVigVal = {};
    for (var i = 1; i < dataCompVal.length; i++) {
      var tipoCV = String(dataCompVal[i][1] || '').trim().toUpperCase();
      var estadoCV = String(dataCompVal[i][10] || '').trim().toUpperCase();
      if (tipoCV !== tipoApertVal && estadoCV !== 'ANULADO') compVigVal[dataCompVal[i][0]] = true;
    }
    
    var saldoMapVal = {};
    for (var i = 1; i < dataMovVal.length; i++) {
      var rowV = dataMovVal[i];
      var ctaCodV = String(rowV[3] || '').trim();
      if (!cuentasDocVal[ctaCodV] || !compVigVal[rowV[1]]) continue;
      var rTV = rowV[11] || rowV[8];
      var rNV = rowV[12] || rowV[9];
      if (!rTV || !rNV) continue;
      var auxV = limpiarRUT(rowV[7]) || '';
      var clV = ctaCodV + '|' + auxV + '|' + rTV + '|' + rNV;
      if (!saldoMapVal[clV]) saldoMapVal[clV] = { debe: 0, haber: 0 };
      saldoMapVal[clV].debe  += (parseFloat(rowV[4]) || 0);
      saldoMapVal[clV].haber += (parseFloat(rowV[5]) || 0);
    }
    
    for (var i = 0; i < datos.lineas.length; i++) {
      var linR = datos.lineas[i];
      var ctaR = planMapVal[linR.cuenta];
      if (!ctaR || !ctaR.requiereDocumento) continue;
      var rTipoR = linR.refTipo || linR.tipoDoc || '';
      var rNumR  = linR.refNum  || linR.numDoc  || '';
      if (!rTipoR || !rNumR) continue;
      // Si referencia a sí mismo (mismo tipo+folio) → es REGISTRO, no REBAJA
      var tipoDocR = linR.tipoDoc || '';
      var numDocR  = linR.numDoc  || '';
      if (rTipoR === tipoDocR && String(rNumR) === String(numDocR)) continue;
      var esActR = ctaR.tipo === 'A';
      var montoReduceR = esActR ? (parseFloat(linR.haber) || 0) : (parseFloat(linR.debe) || 0);
      if (montoReduceR <= 0) continue;
      var auxR = limpiarRUT(linR.auxiliar) || '';
      var clR = linR.cuenta + '|' + auxR + '|' + rTipoR + '|' + rNumR;
      var sR = saldoMapVal[clR] || { debe: 0, haber: 0 };
      var saldoR = esActR ? (sR.debe - sR.haber) : (sR.haber - sR.debe);
      var saldoDispR = Math.abs(saldoR);
      if (montoReduceR > saldoDispR + 1) {
        return { success: false, error: rTipoR + ' ' + rNumR + ': rebaja $' + montoReduceR + ' excede saldo $' + Math.round(saldoDispR) };
      }
    }
  }
  
  // 8. Asignar número
  var numero = getSiguienteNumeroComprobante(datos.tipo, año, mes);
  var idComprobante = datos.tipo + '-' + año + '-' + String(numero).padStart(6, '0');
  
  // Guardar cabecera — INSERTAR EN POSICIÓN ORDENADA POR AÑO
  var sheetComp = buscarHoja(ss, sheets.COMPROBANTES);
  var filaComp = buscarPosicionInsercion_(sheetComp, año);
  var rowComp = [
    idComprobante, datos.tipo, año, mes, numero, fecha, datos.glosa,
    totalDebe, totalHaber, datos.lineas.length, 'VIGENTE',
    datos.origen || 'MANUAL', datos.origenRef || '', new Date(), Session.getActiveUser().getEmail()
  ];
  if (filaComp > 0) {
    sheetComp.insertRowBefore(filaComp);
    sheetComp.getRange(filaComp, 1, 1, rowComp.length).setValues([rowComp]);
  } else {
    sheetComp.appendRow(rowComp);
  }
  
  // Guardar movimientos con mecánica REF — INSERTAR EN POSICIÓN ORDENADA
  var sheetMov = buscarHoja(ss, sheets.MOV_CONTABLES);
  var lineaNum = 1;
  var rowsMov = [];
  
  for (var i = 0; i < datos.lineas.length; i++) {
    var linea = datos.lineas[i];
    var idMovimiento = idComprobante + '-' + String(lineaNum).padStart(3, '0');
    
    // Consultar atributos de la cuenta para determinar qué campos aplican
    var ctaInfo = getCuenta(linea.cuenta);
    var ctaReqDoc = ctaInfo && ctaInfo.requiereDocumento;
    var ctaEfe = ctaInfo && ctaInfo.afectaEfe;
    
    // Determinar campos según tipo de cuenta:
    // 1) requiereDocumento → TIPO_DOC, NUM_DOC, FECHA_DOC, REF, TIPO_MOVIMIENTO = REGISTRO/REBAJA
    // 2) afectaEfe (banco/caja) → solo TIPO_DOC y NUM_DOC (instrumento pago), sin REF ni FECHA_DOC, SIN_DOC
    // 3) cualquier otra → todo vacío, SIN_DOC
    
    var wTipoDoc = '', wNumDoc = '', wFechaDoc = '', wRefTipo = '', wRefNum = '';
    var tipoMovimiento = 'SIN_DOC';
    
    if (ctaReqDoc) {
      // Cuenta con control de documentos: mecánica REF completa
      wTipoDoc = linea.tipoDoc || '';
      wNumDoc = linea.numDoc || '';
      wFechaDoc = linea.fechaDoc || '';
      wRefTipo = linea.refTipo || '';
      wRefNum = linea.refNum || '';
      
      if (wTipoDoc && wNumDoc) {
        if (wTipoDoc === (wRefTipo || wTipoDoc) && wNumDoc === (wRefNum || wNumDoc)) {
          tipoMovimiento = 'REGISTRO';
        } else if (wRefTipo && wRefNum) {
          tipoMovimiento = 'REBAJA';
        } else {
          tipoMovimiento = 'REGISTRO';
        }
      }
    } else if (ctaEfe) {
      // Cuenta de efectivo (banco/caja): solo instrumento de pago
      wTipoDoc = linea.tipoDoc || '';
      wNumDoc = linea.numDoc || '';
      // Sin FECHA_DOC, sin REF → SIN_DOC
    }
    // Cualquier otra cuenta: todo vacío, SIN_DOC
    
    rowsMov.push([
      idMovimiento, idComprobante, lineaNum, linea.cuenta,
      parseFloat(linea.debe) || 0, parseFloat(linea.haber) || 0,
      linea.glosa || datos.glosa, limpiarRUT(linea.auxiliar) || '',
      wTipoDoc, wNumDoc, wFechaDoc,
      wRefTipo, wRefNum, tipoMovimiento, fecha, año, mes,
      linea.categoriaFlujo || ''
    ]);
    lineaNum++;
  }
  
  // Insertar movimientos en posición ordenada por año
  if (rowsMov.length > 0) {
    var filaMov = buscarPosicionInsercionMov_(sheetMov, año);
    if (filaMov > 0) {
      sheetMov.insertRowsBefore(filaMov, rowsMov.length);
      sheetMov.getRange(filaMov, 1, rowsMov.length, 18).setValues(rowsMov);
    } else {
      for (var ri = 0; ri < rowsMov.length; ri++) {
        sheetMov.appendRow(rowsMov[ri]);
      }
    }
  }
  
  var resultado = {
    success: true,
    comprobante: {
      id: idComprobante, tipo: datos.tipo, numero: numero,
      fecha: fecha, totalDebe: totalDebe, totalHaber: totalHaber,
      lineas: datos.lineas.length
    }
  };
  
  // Incluir warnings si los hay
  if (warnings.length > 0) {
    resultado.warnings = warnings;
  }
  
  return resultado;
}

/**
 * BATCH: Crea múltiples comprobantes de una sola vez.
 * Escribe TODAS las cabeceras y movimientos con setValues en lugar de fila por fila.
 * ~10x más rápido que llamar crearComprobante() en loop.
 *
 * @param {Array<Object>} datosArray - Array de objetos con misma estructura que crearComprobante()
 * @returns {Object} { results: [{success, comprobante, error}], compRows, movRows }
 */
function crearComprobantesBatch_(datosArray) {
  if (!datosArray || datosArray.length === 0) return { results: [] };
  
  var ss = getSS();
  var sheets = getSheetNames();
  var sheetComp = buscarHoja(ss, sheets.COMPROBANTES);
  var sheetMov  = buscarHoja(ss, sheets.MOV_CONTABLES);
  
  // Pre-cargar datos necesarios para validación
  var planCuentas = getPlanCuentas(false);
  var planMap = {};
  var cuentasDocSet = {};
  for (var i = 0; i < planCuentas.length; i++) {
    planMap[planCuentas[i].codigo] = planCuentas[i];
    if (planCuentas[i].requiereDocumento) cuentasDocSet[planCuentas[i].codigo] = true;
  }
  
  // Leer números existentes para asignar folios secuenciales
  var dataComp = sheetComp.getDataRange().getValues();
  var config = getConfig();
  var tipoApert = config.TIPO_COMP_APERTURA || getTiposComprobante().APERTURA || 'A';
  
  var maxNums = {}; // { "tipo|año|mes": maxNumero }
  var compVigentes = {};
  for (var i = 1; i < dataComp.length; i++) {
    var t = String(dataComp[i][1]).trim();
    var a = parseInt(dataComp[i][2]);
    var m = parseInt(dataComp[i][3]);
    var n = parseInt(dataComp[i][4]) || 0;
    var k = t + '|' + a + '|' + m;
    if (!maxNums[k] || n > maxNums[k]) maxNums[k] = n;
    
    // Comprobantes vigentes excluyendo apertura (para validar saldos)
    var estadoC = String(dataComp[i][10] || '').trim().toUpperCase();
    if (t.toUpperCase() !== tipoApert && estadoC !== 'ANULADO') {
      compVigentes[dataComp[i][0]] = true;
    }
  }
  
  // ═══════════════════════════════════════════
  // PRE-CARGAR SALDOS POR DOCUMENTO (para validar REBAJAS)
  // Clave: "cuenta|auxiliar|tipoDoc|numDoc"
  // ═══════════════════════════════════════════
  var dataMov = sheetMov.getDataRange().getValues();
  var saldoDocsMap = {};
  for (var i = 1; i < dataMov.length; i++) {
    var row = dataMov[i];
    var ctaCod = String(row[3] || '').trim();
    if (!cuentasDocSet[ctaCod]) continue;
    if (!compVigentes[row[1]]) continue;
    
    var refTipo = row[11] || row[8];
    var refNum  = row[12] || row[9];
    if (!refTipo || !refNum) continue;
    
    var auxRut = limpiarRUT(row[7]) || '';
    var clave = ctaCod + '|' + auxRut + '|' + refTipo + '|' + refNum;
    if (!saldoDocsMap[clave]) saldoDocsMap[clave] = { debe: 0, haber: 0 };
    saldoDocsMap[clave].debe  += (parseFloat(row[4]) || 0);
    saldoDocsMap[clave].haber += (parseFloat(row[5]) || 0);
  }
  
  // Convertir a saldo absoluto
  var saldoAbsMap = {};
  var clavesDoc = Object.keys(saldoDocsMap);
  for (var k = 0; k < clavesDoc.length; k++) {
    var s = saldoDocsMap[clavesDoc[k]];
    var ctaCod = clavesDoc[k].split('|')[0];
    var ctaInfo = planMap[ctaCod];
    var esActivo = ctaInfo && ctaInfo.tipo === 'A';
    var saldo = esActivo ? (s.debe - s.haber) : (s.haber - s.debe);
    saldoAbsMap[clavesDoc[k]] = Math.abs(saldo);
  }
  
  var compRows = [];
  var movRows  = [];
  var results  = [];
  
  for (var idx = 0; idx < datosArray.length; idx++) {
    var datos = datosArray[idx];
    
    try {
      var fecha = new Date(datos.fecha);
      var año = fecha.getFullYear();
      var mes = fecha.getMonth() + 1;
      
      // Validar período
      if (!periodoEstaAbierto(año, mes)) {
        results.push({ success: false, error: 'Período ' + mes + '/' + año + ' cerrado' });
        continue;
      }
      
      // Validar cuadratura
      var totalDebe = 0, totalHaber = 0;
      var lineaError = null;
      for (var i = 0; i < datos.lineas.length; i++) {
        var ld = parseFloat(datos.lineas[i].debe) || 0;
        var lh = parseFloat(datos.lineas[i].haber) || 0;
        if (ld < 0 || lh < 0) { lineaError = 'Línea ' + (i+1) + ': monto negativo'; break; }
        totalDebe += ld;
        totalHaber += lh;
      }
      if (lineaError) { results.push({ success: false, error: lineaError }); continue; }
      if (Math.abs(totalDebe - totalHaber) > 0.01) {
        results.push({ success: false, error: 'No cuadra D:' + totalDebe + ' H:' + totalHaber });
        continue;
      }
      
      // Validar cuentas
      var cuentaError = null;
      for (var i = 0; i < datos.lineas.length; i++) {
        var linea = datos.lineas[i];
        var cta = planMap[linea.cuenta];
        if (!cta) { cuentaError = 'Cuenta ' + linea.cuenta + ' no existe'; break; }
        if (!cta.activa) { cuentaError = 'Cuenta ' + linea.cuenta + ' inactiva'; break; }
        if (!esCuentaDeMovimiento(linea.cuenta)) { cuentaError = linea.cuenta + ' no es cuenta movimiento'; break; }
        if (cta.requiereAuxiliar && !linea.auxiliar) { cuentaError = linea.cuenta + ' requiere auxiliar'; break; }
        if (cta.requiereDocumento && (!linea.tipoDoc || !linea.numDoc)) { cuentaError = linea.cuenta + ' requiere documento'; break; }
        if (!cta.requiereAuxiliar) linea.auxiliar = '';
      }
      if (cuentaError) { results.push({ success: false, error: cuentaError }); continue; }
      
      // ═══════════════════════════════════════════
      // VALIDAR SALDOS: líneas que rebajan documentos existentes
      // ═══════════════════════════════════════════
      var saldoError = null;
      for (var i = 0; i < datos.lineas.length; i++) {
        var linea = datos.lineas[i];
        var cta = planMap[linea.cuenta];
        if (!cta || !cta.requiereDocumento) continue;
        
        // Determinar documento referenciado
        var rTipo = linea.refTipo || linea.tipoDoc || '';
        var rNum  = linea.refNum  || linea.numDoc  || '';
        if (!rTipo || !rNum) continue;
        // Si referencia a sí mismo → REGISTRO, no REBAJA
        var tipoDocB = linea.tipoDoc || '';
        var numDocB  = linea.numDoc  || '';
        if (rTipo === tipoDocB && String(rNum) === String(numDocB)) continue;
        
        // ¿Esta línea REDUCE el saldo del documento?
        var esActivo = cta.tipo === 'A';
        var montoReduce = esActivo ? (parseFloat(linea.haber) || 0) : (parseFloat(linea.debe) || 0);
        if (montoReduce <= 0) continue; // no reduce saldo → skip
        
        // Buscar saldo disponible
        var auxLimpio = limpiarRUT(linea.auxiliar) || '';
        var claveSaldo = linea.cuenta + '|' + auxLimpio + '|' + rTipo + '|' + rNum;
        var saldoDisp = saldoAbsMap[claveSaldo] || 0;
        
        if (montoReduce > saldoDisp + 1) { // tolerancia $1
          saldoError = rTipo + ' ' + rNum + ': rebaja $' + montoReduce + ' excede saldo $' + Math.round(saldoDisp);
          break;
        }
      }
      if (saldoError) { results.push({ success: false, error: saldoError }); continue; }
      
      // Asignar número secuencial
      var k = datos.tipo + '|' + año + '|' + mes;
      var rango = getRangoFoliosMes(mes);
      if (!maxNums[k]) maxNums[k] = rango.inicio - 1;
      maxNums[k]++;
      var numero = maxNums[k];
      if (numero > rango.fin) {
        results.push({ success: false, error: 'Folios agotados ' + datos.tipo + ' ' + mes + '/' + año });
        continue;
      }
      
      var idComprobante = datos.tipo + '-' + año + '-' + String(numero).padStart(6, '0');
      
      // Cabecera comprobante
      compRows.push([
        idComprobante, datos.tipo, año, mes, numero, fecha, datos.glosa,
        totalDebe, totalHaber, datos.lineas.length, 'VIGENTE',
        datos.origen || 'MANUAL', datos.origenRef || '', new Date(), Session.getActiveUser().getEmail()
      ]);
      
      // Líneas de movimiento
      var lineaNum = 1;
      for (var i = 0; i < datos.lineas.length; i++) {
        var linea = datos.lineas[i];
        var idMov = idComprobante + '-' + String(lineaNum).padStart(3, '0');
        var ctaInfo = planMap[linea.cuenta];
        var ctaReqDoc = ctaInfo && ctaInfo.requiereDocumento;
        var ctaEfe = ctaInfo && ctaInfo.afectaEfe;
        
        var wTipoDoc = '', wNumDoc = '', wFechaDoc = '', wRefTipo = '', wRefNum = '';
        var tipoMovimiento = 'SIN_DOC';
        
        if (ctaReqDoc) {
          wTipoDoc = linea.tipoDoc || '';
          wNumDoc = linea.numDoc || '';
          wFechaDoc = linea.fechaDoc || '';
          wRefTipo = linea.refTipo || '';
          wRefNum = linea.refNum || '';
          if (wTipoDoc && wNumDoc) {
            if (wTipoDoc === (wRefTipo || wTipoDoc) && wNumDoc === (wRefNum || wNumDoc)) {
              tipoMovimiento = 'REGISTRO';
            } else if (wRefTipo && wRefNum) {
              tipoMovimiento = 'REBAJA';
            } else {
              tipoMovimiento = 'REGISTRO';
            }
          }
        } else if (ctaEfe) {
          wTipoDoc = linea.tipoDoc || '';
          wNumDoc = linea.numDoc || '';
        }
        
        movRows.push([
          idMov, idComprobante, lineaNum, linea.cuenta,
          parseFloat(linea.debe) || 0, parseFloat(linea.haber) || 0,
          linea.glosa || datos.glosa, limpiarRUT(linea.auxiliar) || '',
          wTipoDoc, wNumDoc, wFechaDoc,
          wRefTipo, wRefNum, tipoMovimiento, fecha, año, mes,
          linea.categoriaFlujo || ''
        ]);
        lineaNum++;
      }
      
      results.push({
        success: true,
        comprobante: { id: idComprobante, tipo: datos.tipo, numero: numero, fecha: fecha, totalDebe: totalDebe, totalHaber: totalHaber, lineas: datos.lineas.length }
      });
      
      // Actualizar saldos running para validar siguientes comprobantes del batch
      for (var i = 0; i < datos.lineas.length; i++) {
        var linUp = datos.lineas[i];
        var ctaUp = planMap[linUp.cuenta];
        if (!ctaUp || !ctaUp.requiereDocumento) continue;
        var rTipoUp = linUp.refTipo || linUp.tipoDoc || '';
        var rNumUp  = linUp.refNum  || linUp.numDoc  || '';
        if (!rTipoUp || !rNumUp) continue;
        var auxUp = limpiarRUT(linUp.auxiliar) || '';
        var claveUp = linUp.cuenta + '|' + auxUp + '|' + rTipoUp + '|' + rNumUp;
        var esActUp = ctaUp.tipo === 'A';
        var debeUp  = parseFloat(linUp.debe) || 0;
        var haberUp = parseFloat(linUp.haber) || 0;
        var delta = esActUp ? (debeUp - haberUp) : (haberUp - debeUp);
        if (!saldoAbsMap[claveUp]) saldoAbsMap[claveUp] = 0;
        saldoAbsMap[claveUp] = Math.abs(saldoAbsMap[claveUp] + delta);
      }
      
    } catch (e) {
      results.push({ success: false, error: e.message });
    }
  }
  
  // ═══════════════════════════════════════════
  // ESCRITURA BATCH — todo de una sola vez
  // ═══════════════════════════════════════════
  if (compRows.length > 0) {
    // Determinar año para inserción ordenada (usar el primero)
    var añoBatch = compRows[0][2];
    
    var filaComp = buscarPosicionInsercion_(sheetComp, añoBatch);
    if (filaComp > 0) {
      sheetComp.insertRowsBefore(filaComp, compRows.length);
      sheetComp.getRange(filaComp, 1, compRows.length, 15).setValues(compRows);
    } else {
      var lastRowComp = sheetComp.getLastRow();
      sheetComp.getRange(lastRowComp + 1, 1, compRows.length, 15).setValues(compRows);
    }
  }
  
  if (movRows.length > 0) {
    var añoBatchMov = movRows[0][15];
    var filaMov = buscarPosicionInsercionMov_(sheetMov, añoBatchMov);
    if (filaMov > 0) {
      sheetMov.insertRowsBefore(filaMov, movRows.length);
      sheetMov.getRange(filaMov, 1, movRows.length, 18).setValues(movRows);
    } else {
      var lastRowMov = sheetMov.getLastRow();
      sheetMov.getRange(lastRowMov + 1, 1, movRows.length, 18).setValues(movRows);
    }
  }
  
  return { results: results, compCount: compRows.length, movCount: movRows.length };
}

/**
 * Anula un comprobante con verificación de referencias cruzadas.
 * Si el comprobante tiene documentos que fueron rebajados por otros comprobantes,
 * se advierte al usuario.
 *
 * @param {string} idComprobante - ID del comprobante a anular
 * @param {string} motivo - Motivo de la anulación
 * @param {boolean} forzar - Si es true, anula aún con referencias cruzadas
 * @returns {Object}
 */
function anularComprobante(idComprobante, motivo, forzar) {
  validarAccesoEscritura_();
  var ss = getSS();
  var sheets = getSheetNames();
  var sheetComp = buscarHoja(ss, sheets.COMPROBANTES);
  var data = sheetComp.getDataRange().getValues();
  var idBusc = String(idComprobante).trim();
  
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === idBusc) {
      var estado = String(data[i][10] || '').trim().toUpperCase();
      if (estado === 'ANULADO') {
        return { success: false, error: 'Ya está anulado' };
      }
      if (!periodoEstaAbierto(parseInt(data[i][2]), parseInt(data[i][3]))) {
        return { success: false, error: 'Período cerrado' };
      }
      
      // NUEVO: Verificar referencias cruzadas
      var referencias = buscarReferenciasCruzadas(idComprobante);
      if (referencias.length > 0 && !forzar) {
        var detalle = [];
        for (var r = 0; r < referencias.length; r++) {
          detalle.push(referencias[r].comprobanteRef + ' (doc: ' + 
                       referencias[r].tipoDoc + ' ' + referencias[r].numDoc + ')');
        }
        return {
          success: false,
          error: 'COMPROBANTE TIENE REFERENCIAS CRUZADAS',
          referencias: referencias,
          detalle: 'Los siguientes comprobantes referencian documentos de este comprobante: ' + detalle.join(', '),
          requiereConfirmacion: true
        };
      }
      
      sheetComp.getRange(i + 1, 11).setValue('ANULADO');
      sheetComp.getRange(i + 1, 13).setValue('ANULADO: ' + motivo + ' - ' + new Date().toISOString());
      
      var resultado = { success: true };
      if (referencias.length > 0) {
        resultado.warnings = ['Comprobante anulado CON referencias cruzadas activas. Revise consistencia.'];
        resultado.referencias = referencias;
      }
      return resultado;
    }
  }
  return { success: false, error: 'Comprobante no encontrado' };
}

/**
 * Busca comprobantes que referencian documentos originados en el comprobante dado.
 * Es decir, busca REBAJAs que apuntan a documentos REGISTRADOs en este comprobante.
 *
 * @param {string} idComprobante - ID del comprobante origen
 * @returns {Array} - Lista de referencias encontradas
 */
function buscarReferenciasCruzadas(idComprobante) {
  var sheetMov = getSheet('MOV_CONTABLES');
  var sheetComp = getSheet('COMPROBANTES');
  if (!sheetMov || !sheetComp) return [];
  
  var dataMov = sheetMov.getDataRange().getValues();
  var dataComp = sheetComp.getDataRange().getValues();
  
  // Comprobantes vigentes (excluir ya anulados)
  var compVigentes = {};
  for (var i = 1; i < dataComp.length; i++) {
    if (dataComp[i][10] !== 'ANULADO') {
      compVigentes[dataComp[i][0]] = true;
    }
  }
  
  // Paso 1: Obtener documentos REGISTRADOS en este comprobante
  var docsRegistrados = {};
  for (var i = 1; i < dataMov.length; i++) {
    var row = dataMov[i];
    if (row[1] === idComprobante && row[13] === 'REGISTRO') {
      var clave = limpiarRUT(row[7]) + '|' + String(row[8]).trim() + '|' + String(row[9]).trim();
      docsRegistrados[clave] = {
        auxiliar: row[7],
        tipoDoc: row[8],
        numDoc: row[9]
      };
    }
  }
  
  if (Object.keys(docsRegistrados).length === 0) return [];
  
  // Paso 2: Buscar REBAJAs en OTROS comprobantes vigentes que apunten a estos docs
  var referencias = [];
  for (var i = 1; i < dataMov.length; i++) {
    var row = dataMov[i];
    if (row[1] === idComprobante) continue; // Ignorar el mismo comprobante
    if (row[13] !== 'REBAJA') continue;
    if (!compVigentes[row[1]]) continue;
    
    var claveRef = limpiarRUT(row[7]) + '|' + String(row[11]).trim() + '|' + String(row[12]).trim();
    if (docsRegistrados[claveRef]) {
      referencias.push({
        comprobanteRef: row[1],
        lineaRef: row[2],
        auxiliar: row[7],
        tipoDoc: row[11],
        numDoc: row[12],
        debe: parseFloat(row[4]) || 0,
        haber: parseFloat(row[5]) || 0
      });
    }
  }
  
  return referencias;
}

/**
 * Elimina permanentemente un comprobante ANULADO y sus movimientos.
 * Solo permite eliminar comprobantes con estado ANULADO.
 */
function eliminarComprobante(idComprobante) {
  validarAccesoEscritura_();
  var ss = getSS();
  var sheets = getSheetNames();
  var sheetComp = buscarHoja(ss, sheets.COMPROBANTES);
  var sheetMov = buscarHoja(ss, sheets.MOV_CONTABLES);
  
  if (!sheetComp) return { success: false, error: 'Hoja de comprobantes no encontrada' };
  
  var idBusc = String(idComprobante).trim();
  var dataComp = sheetComp.getDataRange().getValues();
  var filaComp = -1;
  
  for (var i = 1; i < dataComp.length; i++) {
    if (String(dataComp[i][0]).trim() === idBusc) {
      if (String(dataComp[i][10] || '').trim().toUpperCase() !== 'ANULADO') {
        return { success: false, error: 'Solo se pueden eliminar comprobantes anulados. Estado actual: ' + dataComp[i][10] };
      }
      filaComp = i + 1; // 1-indexed para deleteRow
      break;
    }
  }
  
  if (filaComp === -1) return { success: false, error: 'Comprobante no encontrado: ' + idBusc };
  
  // Eliminar movimientos (de abajo hacia arriba para no desplazar índices)
  var filasAEliminar = [];
  if (sheetMov) {
    var dataMov = sheetMov.getDataRange().getValues();
    for (var i = 1; i < dataMov.length; i++) {
      if (String(dataMov[i][1]).trim() === idBusc) {
        filasAEliminar.push(i + 1);
      }
    }
    // Eliminar de abajo hacia arriba
    for (var i = filasAEliminar.length - 1; i >= 0; i--) {
      sheetMov.deleteRow(filasAEliminar[i]);
    }
  }
  
  // Eliminar comprobante
  sheetComp.deleteRow(filaComp);
  
  // Invalidar caché
  invalidarCache();
  
  Logger.log('🗑️ Comprobante eliminado: ' + idBusc + ' (' + filasAEliminar.length + ' movimientos)');
  return { success: true };
}

function getComprobante(idComprobante) {
  var ss = getSS();
  var sheets = getSheetNames();
  
  var sheetComp = buscarHoja(ss, sheets.COMPROBANTES);
  if (!sheetComp) return null;
  var dataComp = sheetComp.getDataRange().getValues();
  
  var comprobante = null;
  for (var i = 1; i < dataComp.length; i++) {
    if (dataComp[i][0] === idComprobante) {
      comprobante = {
        id: dataComp[i][0], tipo: dataComp[i][1], año: dataComp[i][2], mes: dataComp[i][3],
        numero: dataComp[i][4], fecha: dataComp[i][5], glosa: dataComp[i][6],
        totalDebe: dataComp[i][7], totalHaber: dataComp[i][8], cantidadLineas: dataComp[i][9],
        estado: dataComp[i][10], origen: dataComp[i][11], lineas: []
      };
      break;
    }
  }
  if (!comprobante) return null;
  
  var sheetMov = buscarHoja(ss, sheets.MOV_CONTABLES);
  if (!sheetMov) return comprobante;
  var dataMov = sheetMov.getDataRange().getValues();
  
  for (var i = 1; i < dataMov.length; i++) {
    if (dataMov[i][1] === idComprobante) {
      var cuenta = getCuenta(dataMov[i][3]);
      var auxiliar = dataMov[i][7] ? getAuxiliar(dataMov[i][7]) : null;
      
      comprobante.lineas.push({
        linea: dataMov[i][2], cuenta: dataMov[i][3],
        nombreCuenta: cuenta ? cuenta.nombre : '',
        debe: dataMov[i][4], haber: dataMov[i][5], glosa: dataMov[i][6],
        auxiliar: dataMov[i][7], nombreAuxiliar: auxiliar ? auxiliar.nombre : '',
        tipoDoc: dataMov[i][8], numDoc: dataMov[i][9], fechaDoc: dataMov[i][10],
        refTipo: dataMov[i][11], refNum: dataMov[i][12], tipoMovimiento: dataMov[i][13]
      });
    }
  }
  comprobante.lineas.sort(function(a, b) { return a.linea - b.linea; });
  return comprobante;
}

// =============================================================================
// REPORTES
// =============================================================================

function getLibroDiario(año, mes, opciones) {
  opciones = opciones || {};
  var ss = getSS();
  var sheets = getSheetNames();
  
  var sheetComp = buscarHoja(ss, sheets.COMPROBANTES);
  var sheetMov = buscarHoja(ss, sheets.MOV_CONTABLES);
  
  if (!sheetComp) {
    Logger.log('Hoja COMPROBANTES no encontrada: ' + sheets.COMPROBANTES);
    return [];
  }
  if (!sheetMov) {
    Logger.log('Hoja MOV_CONTABLES no encontrada: ' + sheets.MOV_CONTABLES);
    return [];
  }
  
  var dataComp = sheetComp.getDataRange().getValues();
  var dataMov = sheetMov.getDataRange().getValues();
  
  var comprobantes = [];
  var compMap = {};
  var añoBuscado = parseInt(año);
  var mesBuscado = mes ? parseInt(mes) : null;
  
  for (var i = 1; i < dataComp.length; i++) {
    var row = dataComp[i];
    if (!row[0]) continue;
    
    var compAño = parseInt(row[2]);
    var compMes = parseInt(row[3]);
    
    if (compAño !== añoBuscado) continue;
    if (mesBuscado && compMes !== mesBuscado) continue;
    if (!opciones.incluirAnulados && row[10] === 'ANULADO') continue;
    
    var comp = {
      id: row[0], tipo: row[1], numero: parseInt(row[4]) || 0,
      fecha: row[5], glosa: row[6],
      totalDebe: parseFloat(row[7]) || 0, totalHaber: parseFloat(row[8]) || 0,
      estado: row[10] || 'VIGENTE', lineas: []
    };
    comprobantes.push(comp);
    compMap[comp.id] = comp;
  }
  
  for (var i = 1; i < dataMov.length; i++) {
    var row = dataMov[i];
    var idComp = row[1];
    
    if (compMap[idComp]) {
      var cuenta = getCuenta(row[3]);
      compMap[idComp].lineas.push({
        linea: parseInt(row[2]) || 0, cuenta: row[3],
        nombreCuenta: cuenta ? cuenta.nombre : '',
        debe: parseFloat(row[4]) || 0, haber: parseFloat(row[5]) || 0,
        glosa: row[6], auxiliar: row[7], tipoDoc: row[8], numDoc: row[9]
      });
    }
  }
  
  comprobantes.sort(function(a, b) {
    var fechaDiff = new Date(a.fecha) - new Date(b.fecha);
    if (fechaDiff !== 0) return fechaDiff;
    return a.numero - b.numero;
  });
  
  for (var i = 0; i < comprobantes.length; i++) {
    comprobantes[i].lineas.sort(function(a, b) { return a.linea - b.linea; });
  }
  
  return comprobantes;
}

function getLibroMayor(codigoCuenta, año, mesDesde, mesHasta) {
  var result = getLibroMayorBulk([codigoCuenta], año, mesDesde, mesHasta);
  return result[codigoCuenta] || null;
}

/**
 * Libro Mayor BULK - lee hojas UNA sola vez y procesa N cuentas.
 * Si codigosCuenta es null → auto-descubre TODAS las cuentas desde movimientos.
 * Retorna objeto { codigoCuenta: { cuenta, periodo, saldoAnterior, movimientos, ... } }
 */
function getLibroMayorBulk(codigosCuenta, año, mesDesde, mesHasta) {
  mesDesde = mesDesde || 1;
  mesHasta = mesHasta || 12;
  
  var ss = getSS();
  var sheets = getSheetNames();
  var sheetMov = buscarHoja(ss, sheets.MOV_CONTABLES);
  var sheetComp = buscarHoja(ss, sheets.COMPROBANTES);
  if (!sheetMov || !sheetComp) return {};
  
  // Leer hojas UNA VEZ
  var dataMov = sheetMov.getDataRange().getValues();
  var dataComp = sheetComp.getDataRange().getValues();
  
  // Mapa comprobantes vigentes
  var compMap = {};
  for (var i = 1; i < dataComp.length; i++) {
    if (dataComp[i][10] !== 'ANULADO') {
      compMap[dataComp[i][0]] = {
        fecha: dataComp[i][5], tipo: dataComp[i][1],
        numero: dataComp[i][4], glosa: dataComp[i][6]
      };
    }
  }
  
  // Cache del plan de cuentas para lookup rápido
  var planMap = {};
  var planCuentas = getPlanCuentas(false);
  for (var i = 0; i < planCuentas.length; i++) {
    planMap[planCuentas[i].codigo] = planCuentas[i];
  }
  
  // Modo auto-descubrimiento: si no vienen códigos, descubrir desde movimientos
  var autoDescubrir = !codigosCuenta || codigosCuenta.length === 0;
  
  // Set de cuentas a procesar
  var cuentasSet = {};
  
  function asegurarCuenta(codCta) {
    if (cuentasSet[codCta]) return true;
    var ctaPlan = planMap[codCta];
    var tipo = 'A'; // default
    var nombre = codCta; // fallback
    if (ctaPlan) {
      tipo = ctaPlan.tipo;
      nombre = ctaPlan.nombre;
    } else {
      // Inferir tipo por primer dígito
      var primer = String(codCta).charAt(0);
      if (primer === '1') tipo = 'A';
      else if (primer === '2') tipo = 'P';
      else if (primer === '3') tipo = 'T';
      else if (primer === '4') tipo = 'I';
      else tipo = 'G';
    }
    cuentasSet[codCta] = {
      cuenta: { codigo: codCta, nombre: nombre, tipo: tipo },
      esDeudora: (tipo === 'A' || tipo === 'G'),
      movimientos: [],
      saldoAnterior: 0
    };
    return true;
  }
  
  // Si no es auto-descubrimiento, pre-registrar las cuentas pedidas
  if (!autoDescubrir) {
    for (var i = 0; i < codigosCuenta.length; i++) {
      asegurarCuenta(codigosCuenta[i]);
    }
  }
  
  // Detectar tipo comprobante apertura
  var configLM = getConfig();
  var tipoApertLM = (configLM.TIPO_COMP_APERTURA || getTiposComprobante().APERTURA || 'A').toUpperCase();
  
  // Marcar comprobantes de apertura en compMap
  for (var id in compMap) {
    compMap[id].esApertura = (String(compMap[id].tipo).toUpperCase() === tipoApertLM);
  }
  
  var añoBuscado = parseInt(año);
  var mesDesdeBuscado = parseInt(mesDesde);
  var mesHastaBuscado = parseInt(mesHasta);
  
  // UN SOLO recorrido de movimientos
  for (var i = 1; i < dataMov.length; i++) {
    var row = dataMov[i];
    var codCta = row[3];
    if (!codCta) continue;
    if (!compMap[row[1]]) continue; // Comp anulado o inexistente
    
    // En modo auto-descubrir, registrar cualquier cuenta encontrada
    if (autoDescubrir) {
      asegurarCuenta(codCta);
    } else if (!cuentasSet[codCta]) {
      continue; // No es una cuenta que nos pidieron
    }
    
    var info = cuentasSet[codCta];
    if (!info) continue;
    
    var movAño = parseInt(row[15]) || 0;
    var movMes = parseInt(row[16]) || 0;
    var debe = parseFloat(row[4]) || 0;
    var haber = parseFloat(row[5]) || 0;
    var comp = compMap[row[1]];
    
    // APERTURA: siempre va a saldoAnterior, nunca como movimiento visible
    if (comp.esApertura) {
      if (movAño === añoBuscado) {
        info.saldoAnterior += info.esDeudora ? (debe - haber) : (haber - debe);
      }
      continue;
    }
    
    // Meses anteriores al rango → saldoAnterior
    if (movAño === añoBuscado && movMes < mesDesdeBuscado) {
      info.saldoAnterior += info.esDeudora ? (debe - haber) : (haber - debe);
      continue;
    }
    
    // Movimientos de otros años se ignoran (apertura ya trae saldos anteriores)
    if (movAño !== añoBuscado) continue;
    
    if (movAño === añoBuscado && movMes >= mesDesdeBuscado && movMes <= mesHastaBuscado) {
      info.movimientos.push({
        fecha: comp.fecha, comprobante: comp.tipo + '-' + comp.numero,
        idComprobante: row[1], glosa: row[6] || comp.glosa,
        auxiliar: row[7] || '', tipoDoc: row[8] || '', numDoc: row[9] || '',
        debe: debe, haber: haber
      });
    }
  }
  
  // Calcular saldos y totales
  var resultado = {};
  for (var cod in cuentasSet) {
    var info = cuentasSet[cod];
    info.movimientos.sort(function(a, b) { return new Date(a.fecha) - new Date(b.fecha); });
    
    var saldoAcum = info.saldoAnterior;
    var totalDebe = 0, totalHaber = 0;
    for (var j = 0; j < info.movimientos.length; j++) {
      var mov = info.movimientos[j];
      saldoAcum += info.esDeudora ? (mov.debe - mov.haber) : (mov.haber - mov.debe);
      mov.saldo = saldoAcum;
      totalDebe += mov.debe;
      totalHaber += mov.haber;
    }
    
    resultado[cod] = {
      cuenta: info.cuenta,
      periodo: { año: añoBuscado, mesDesde: mesDesdeBuscado, mesHasta: mesHastaBuscado },
      saldoAnterior: info.saldoAnterior, movimientos: info.movimientos,
      saldoFinal: saldoAcum, totalDebe: totalDebe, totalHaber: totalHaber
    };
  }
  
  return resultado;
}

function getBalanceComprobacion(año, mesHasta) {
  mesHasta = mesHasta || 12;
  var ss = getSS();
  var sheets = getSheetNames();
  
  var cuentas = getPlanCuentas(true);
  var sheetMov = buscarHoja(ss, sheets.MOV_CONTABLES);
  var sheetComp = buscarHoja(ss, sheets.COMPROBANTES);
  
  if (!sheetMov || !sheetComp) {
    return { error: 'Hojas no encontradas' };
  }
  
  var dataMov = sheetMov.getDataRange().getValues();
  var dataComp = sheetComp.getDataRange().getValues();
  var añoBuscado = parseInt(año);
  var mesHastaBuscado = parseInt(mesHasta);
  
  var compVigentes = {};
  for (var i = 1; i < dataComp.length; i++) {
    if (dataComp[i][10] !== 'ANULADO') {
      compVigentes[dataComp[i][0]] = true;
    }
  }
  
  // Acumular débitos y créditos SOLO del año indicado hasta el mes indicado
  var saldosPorCuenta = {};
  
  for (var i = 1; i < dataMov.length; i++) {
    var row = dataMov[i];
    if (!compVigentes[row[1]]) continue;
    
    var movAño = parseInt(row[15]) || 0;
    var movMes = parseInt(row[16]) || 0;
    
    // Solo movimientos del año solicitado, hasta el mes indicado
    if (movAño !== añoBuscado) continue;
    if (movMes > mesHastaBuscado) continue;
    
    var codigo = row[3];
    var debe = parseFloat(row[4]) || 0;
    var haber = parseFloat(row[5]) || 0;
    
    if (!saldosPorCuenta[codigo]) {
      saldosPorCuenta[codigo] = { debitos: 0, creditos: 0 };
    }
    
    saldosPorCuenta[codigo].debitos += debe;
    saldosPorCuenta[codigo].creditos += haber;
  }
  
  // Construir filas del balance
  var resultado = [];
  var totales = {
    debitos: 0, creditos: 0,
    deudor: 0, acreedor: 0,
    activo: 0, pasivo: 0,
    perdida: 0, ganancia: 0
  };
  
  for (var i = 0; i < cuentas.length; i++) {
    var cuenta = cuentas[i];
    var saldo = saldosPorCuenta[cuenta.codigo];
    if (!saldo) continue;
    
    var debitos = saldo.debitos;
    var creditos = saldo.creditos;
    
    // Si no hay movimiento, no mostrar
    if (debitos === 0 && creditos === 0) continue;
    
    // Saldos: Deudor si Déb > Créd, Acreedor si Créd > Déb
    var neto = debitos - creditos;
    var deudor = neto > 0 ? neto : 0;
    var acreedor = neto < 0 ? Math.abs(neto) : 0;
    
    // Clasificación según tipo de cuenta
    var activo = 0, pasivo = 0, perdida = 0, ganancia = 0;
    
    if (cuenta.tipo === 'A' || cuenta.tipo === 'P' || cuenta.tipo === 'T') {
      // Inventario (Balance)
      activo = deudor;
      pasivo = acreedor;
    } else {
      // Resultados (I, G)
      perdida = deudor;
      ganancia = acreedor;
    }
    
    resultado.push({
      codigo: cuenta.codigo, nombre: cuenta.nombre, tipo: cuenta.tipo,
      debitos: debitos, creditos: creditos,
      deudor: deudor, acreedor: acreedor,
      activo: activo, pasivo: pasivo,
      perdida: perdida, ganancia: ganancia
    });
    
    totales.debitos += debitos;
    totales.creditos += creditos;
    totales.deudor += deudor;
    totales.acreedor += acreedor;
    totales.activo += activo;
    totales.pasivo += pasivo;
    totales.perdida += perdida;
    totales.ganancia += ganancia;
  }
  
  // Pérdidas / Ganancias: cuadrar cada par independientemente
  var difInventario = totales.pasivo - totales.activo;   // positivo → falta Activo
  var difResultados = totales.perdida - totales.ganancia; // positivo → falta Ganancia
  
  return {
    periodo: { año: añoBuscado, mesHasta: mesHastaBuscado },
    cuentas: resultado, totales: totales,
    // P/G row: cuadra inventario y resultados por separado
    pgActivo: difInventario > 0 ? difInventario : 0,
    pgPasivo: difInventario < 0 ? Math.abs(difInventario) : 0,
    pgPerdida: difResultados < 0 ? Math.abs(difResultados) : 0,
    pgGanancia: difResultados > 0 ? difResultados : 0,
    utilidadPerdida: totales.ganancia - totales.perdida
  };
}

function getEstadoResultados(año, mesDesde, mesHasta) {
  if (!mesDesde) mesDesde = 1;
  if (!mesHasta) mesHasta = 12;
  
  var ss = getSS();
  var sheets = getSheetNames();
  
  var todasCuentas = getPlanCuentas(true);
  var cuentas = todasCuentas.filter(function(c) { return c.tipo === 'I' || c.tipo === 'G'; });
  
  var sheetMov = buscarHoja(ss, sheets.MOV_CONTABLES);
  var sheetComp = buscarHoja(ss, sheets.COMPROBANTES);
  
  var dataMov = sheetMov.getDataRange().getValues();
  var dataComp = sheetComp.getDataRange().getValues();
  
  var compVigentes = {};
  for (var i = 1; i < dataComp.length; i++) {
    if (dataComp[i][10] !== 'ANULADO') compVigentes[dataComp[i][0]] = true;
  }
  
  // Acumular por cuenta Y por mes, para año actual y anterior
  var saldos = {};     // { codigo: { mes: { debe, haber } } }
  var saldosPrev = {}; // año anterior
  var añoPrev = año - 1;
  
  for (var i = 1; i < dataMov.length; i++) {
    var row = dataMov[i];
    if (!compVigentes[row[1]]) continue;
    
    var movAño = parseInt(row[15]), movMes = parseInt(row[16]);
    var codigo = row[3];
    var debe = parseFloat(row[4]) || 0;
    var haber = parseFloat(row[5]) || 0;
    
    // Año actual
    if (movAño === año && movMes >= mesDesde && movMes <= mesHasta) {
      if (!saldos[codigo]) saldos[codigo] = {};
      if (!saldos[codigo][movMes]) saldos[codigo][movMes] = { debe: 0, haber: 0 };
      saldos[codigo][movMes].debe += debe;
      saldos[codigo][movMes].haber += haber;
    }
    // Año anterior (mismo rango de meses)
    if (movAño === añoPrev && movMes >= mesDesde && movMes <= mesHasta) {
      if (!saldosPrev[codigo]) saldosPrev[codigo] = {};
      if (!saldosPrev[codigo][movMes]) saldosPrev[codigo][movMes] = { debe: 0, haber: 0 };
      saldosPrev[codigo][movMes].debe += debe;
      saldosPrev[codigo][movMes].haber += haber;
    }
  }
  
  // Calcular neto por cuenta para clasificar I/G
  function calcNeto(tipo, saldosMes) {
    var neto = 0;
    var keys = Object.keys(saldosMes || {});
    for (var k = 0; k < keys.length; k++) {
      var s = saldosMes[keys[k]];
      neto += tipo === 'I' ? (s.haber - s.debe) : (s.debe - s.haber);
    }
    return neto;
  }
  
  function calcNetoPorMes(tipo, saldosMes, mDesde, mHasta) {
    var montos = {};
    var total = 0;
    for (var m = mDesde; m <= mHasta; m++) {
      var s = (saldosMes || {})[m];
      var neto = 0;
      if (s) neto = tipo === 'I' ? (s.haber - s.debe) : (s.debe - s.haber);
      montos[m] = neto;
      total += neto;
    }
    return { montos: montos, total: total };
  }
  
  var ingresos = [], gastos = [];
  var totalIngMes = {}, totalGasMes = {};
  var totalIngresos = 0, totalGastos = 0;
  var totalIngPrev = 0, totalGasPrev = 0;
  var totalIngMesPrev = {}, totalGasMesPrev = {};
  
  // Inicializar totales mensuales
  for (var m = mesDesde; m <= mesHasta; m++) {
    totalIngMes[m] = 0; totalGasMes[m] = 0;
    totalIngMesPrev[m] = 0; totalGasMesPrev[m] = 0;
  }
  
  for (var i = 0; i < cuentas.length; i++) {
    var cuenta = cuentas[i];
    var sal = saldos[cuenta.codigo];
    var salP = saldosPrev[cuenta.codigo];
    if (!sal && !salP) continue;
    
    var actual = calcNetoPorMes(cuenta.tipo, sal, mesDesde, mesHasta);
    var prev = calcNetoPorMes(cuenta.tipo, salP, mesDesde, mesHasta);
    
    if (actual.total === 0 && prev.total === 0) continue;
    
    var item = {
      codigo: cuenta.codigo,
      nombre: cuenta.nombre,
      tipo: cuenta.tipo,
      montos: actual.montos,
      total: actual.total,
      totalPrev: prev.total,
      montosPrev: prev.montos,
      variacion: prev.total !== 0 ? ((actual.total - prev.total) / Math.abs(prev.total)) * 100 : (actual.total !== 0 ? 100 : 0)
    };
    
    // Clasificar: Ingresos tipo I con neto positivo, Gastos tipo G con neto positivo
    // Si neto negativo, va al lado contrario
    var esIngreso = (cuenta.tipo === 'I' && actual.total >= 0) || (cuenta.tipo === 'G' && actual.total < 0);
    
    if (esIngreso) {
      item.monto = Math.abs(actual.total);
      ingresos.push(item);
      totalIngresos += Math.abs(actual.total);
      totalIngPrev += Math.abs(prev.total);
      for (var m = mesDesde; m <= mesHasta; m++) {
        totalIngMes[m] += Math.abs(actual.montos[m] || 0);
        totalIngMesPrev[m] += Math.abs(prev.montos[m] || 0);
      }
    } else {
      item.monto = Math.abs(actual.total);
      gastos.push(item);
      totalGastos += Math.abs(actual.total);
      totalGasPrev += Math.abs(prev.total);
      for (var m = mesDesde; m <= mesHasta; m++) {
        totalGasMes[m] += Math.abs(actual.montos[m] || 0);
        totalGasMesPrev[m] += Math.abs(prev.montos[m] || 0);
      }
    }
  }
  
  // Ordenar por monto desc
  ingresos.sort(function(a, b) { return b.monto - a.monto; });
  gastos.sort(function(a, b) { return b.monto - a.monto; });
  
  var resultadoNeto = totalIngresos - totalGastos;
  var resultadoPrev = totalIngPrev - totalGasPrev;
  
  // Resultado mensual
  var resultadoMes = {}, resultadoMesPrev = {};
  for (var m = mesDesde; m <= mesHasta; m++) {
    resultadoMes[m] = (totalIngMes[m] || 0) - (totalGasMes[m] || 0);
    resultadoMesPrev[m] = (totalIngMesPrev[m] || 0) - (totalGasMesPrev[m] || 0);
  }
  
  return {
    periodo: { año: año, añoPrev: añoPrev, mesDesde: mesDesde, mesHasta: mesHasta },
    ingresos: ingresos, totalIngresos: totalIngresos,
    gastos: gastos, totalGastos: totalGastos,
    resultadoNeto: resultadoNeto,
    // Comparativo
    totalIngPrev: totalIngPrev, totalGasPrev: totalGasPrev,
    resultadoPrev: resultadoPrev,
    // Mensuales
    totalIngMes: totalIngMes, totalGasMes: totalGasMes,
    totalIngMesPrev: totalIngMesPrev, totalGasMesPrev: totalGasMesPrev,
    resultadoMes: resultadoMes, resultadoMesPrev: resultadoMesPrev,
    hayPrevio: totalIngPrev > 0 || totalGasPrev > 0
  };
}

// =============================================================================
// ESTADO DE FLUJO DE EFECTIVO
// =============================================================================

/**
 * Genera datos para el Estado de Flujo de Efectivo.
 * Lee movimientos en cuentas afecta_efe, agrupados por CATEGORIA_FLUJO.
 * Incluye saldo inicial, desglose mensual y comparativo con año anterior.
 */
function getFlujoEfectivo(año, mesDesde, mesHasta) {
  if (!mesDesde) mesDesde = 1;
  if (!mesHasta) mesHasta = 12;
  
  var ss = getSS();
  var sheets = getSheetNames();
  var añoPrev = año - 1;
  
  // Cuentas que afectan EFE
  var todasCuentas = getPlanCuentas(true);
  var cuentasEfe = {};
  for (var i = 0; i < todasCuentas.length; i++) {
    if (todasCuentas[i].afectaEfe) cuentasEfe[todasCuentas[i].codigo] = true;
  }
  
  // Categorías de flujo
  var catFlujo = getCategoriasFlujoCash();
  var catMap = {};
  for (var i = 0; i < catFlujo.length; i++) catMap[catFlujo[i].codigo] = catFlujo[i];
  
  // Comprobantes vigentes
  var sheetComp = buscarHoja(ss, sheets.COMPROBANTES);
  var dataComp = sheetComp.getDataRange().getValues();
  var compVigentes = {};
  for (var i = 1; i < dataComp.length; i++) {
    if (dataComp[i][10] !== 'ANULADO') compVigentes[dataComp[i][0]] = true;
  }
  
  // Leer movimientos
  var sheetMov = buscarHoja(ss, sheets.MOV_CONTABLES);
  var dataMov = sheetMov.getDataRange().getValues();
  
  // Acumuladores: { catCodigo: { mes: neto } }
  var flujos = {};       // año actual
  var flujosPrev = {};   // año anterior
  var saldoInicial = 0;  // saldo EFE antes del período
  var saldoInicialPrev = 0;
  
  // Detectar tipo comprobante apertura
  var configEFE = getConfig();
  var tipoApertEFE = (configEFE.TIPO_COMP_APERTURA || getTiposComprobante().APERTURA || 'A').toUpperCase();
  
  // Marcar comprobantes apertura
  var compApertura = {};
  for (var i = 1; i < dataComp.length; i++) {
    if (String(dataComp[i][1]).trim().toUpperCase() === tipoApertEFE) {
      compApertura[dataComp[i][0]] = true;
    }
  }
  
  for (var i = 1; i < dataMov.length; i++) {
    var row = dataMov[i];
    if (!compVigentes[row[1]]) continue;
    
    var cuenta = row[3];
    var movAño = parseInt(row[15]);
    var movMes = parseInt(row[16]);
    var debe = parseFloat(row[4]) || 0;
    var haber = parseFloat(row[5]) || 0;
    var catCode = row[17]; // CATEGORIA_FLUJO
    
    // Solo cuentas EFE
    if (!cuentasEfe[cuenta]) continue;
    
    var neto = debe - haber; // positivo = entra plata, negativo = sale
    
    // APERTURA: siempre va a saldoInicial, nunca como flujo del período
    if (compApertura[row[1]]) {
      if (movAño === año) saldoInicial += neto;
      if (movAño === añoPrev) saldoInicialPrev += neto;
      continue;
    }
    
    // Saldo inicial: movimientos del año actual ANTES del rango
    if (movAño === año && movMes < mesDesde) {
      saldoInicial += neto;
    }
    // Saldo inicial año anterior
    if (movAño === añoPrev && movMes < mesDesde) {
      saldoInicialPrev += neto;
    }
    
    // Flujos del período actual
    if (movAño === año && movMes >= mesDesde && movMes <= mesHasta) {
      var key = catCode ? String(catCode) : '_SIN_CAT';
      if (!flujos[key]) flujos[key] = {};
      if (!flujos[key][movMes]) flujos[key][movMes] = 0;
      flujos[key][movMes] += neto;
    }
    
    // Flujos período anterior
    if (movAño === añoPrev && movMes >= mesDesde && movMes <= mesHasta) {
      var key = catCode ? String(catCode) : '_SIN_CAT';
      if (!flujosPrev[key]) flujosPrev[key] = {};
      if (!flujosPrev[key][movMes]) flujosPrev[key][movMes] = 0;
      flujosPrev[key][movMes] += neto;
    }
  }
  
  // Construir resultado por tipo — leer tipos dinámicamente de Categoria_Flujo
  var tiposSet = {};
  var tiposOrden = [];
  for (var i = 0; i < catFlujo.length; i++) {
    var t = catFlujo[i].tipo;
    if (!tiposSet[t]) {
      tiposSet[t] = true;
      tiposOrden.push(t);
    }
  }
  var secciones = [];
  var totalFlujoMes = {}, totalFlujoPrevMes = {};
  var totalFlujo = 0, totalFlujoPrev = 0;
  
  for (var m = mesDesde; m <= mesHasta; m++) {
    totalFlujoMes[m] = 0;
    totalFlujoPrevMes[m] = 0;
  }
  
  for (var t = 0; t < tiposOrden.length; t++) {
    var tipo = tiposOrden[t];
    var categorias = [];
    var subTotalMes = {}, subTotalPrevMes = {};
    var subTotal = 0, subTotalPrev = 0;
    
    for (var m = mesDesde; m <= mesHasta; m++) {
      subTotalMes[m] = 0;
      subTotalPrevMes[m] = 0;
    }
    
    for (var c = 0; c < catFlujo.length; c++) {
      var cat = catFlujo[c];
      if (cat.tipo !== tipo) continue;
      
      var key = String(cat.codigo);
      var montos = flujos[key] || {};
      var montosPrev = flujosPrev[key] || {};
      var total = 0, tPrev = 0;
      var montosArr = {}, montosPrevArr = {};
      
      for (var m = mesDesde; m <= mesHasta; m++) {
        var val = montos[m] || 0;
        var valP = montosPrev[m] || 0;
        montosArr[m] = val;
        montosPrevArr[m] = valP;
        total += val;
        tPrev += valP;
        subTotalMes[m] += val;
        subTotalPrevMes[m] += valP;
      }
      
      if (total === 0 && tPrev === 0) continue;
      
      categorias.push({
        codigo: cat.codigo,
        nombre: cat.nombre,
        montos: montosArr,
        total: total,
        totalPrev: tPrev,
        montosPrev: montosPrevArr,
        variacion: tPrev !== 0 ? ((total - tPrev) / Math.abs(tPrev)) * 100 : (total !== 0 ? 100 : 0)
      });
      
      subTotal += total;
      subTotalPrev += tPrev;
    }
    
    for (var m = mesDesde; m <= mesHasta; m++) {
      totalFlujoMes[m] += subTotalMes[m];
      totalFlujoPrevMes[m] += subTotalPrevMes[m];
    }
    totalFlujo += subTotal;
    totalFlujoPrev += subTotalPrev;
    
    secciones.push({
      tipo: tipo,
      categorias: categorias,
      subTotal: subTotal,
      subTotalPrev: subTotalPrev,
      subTotalMes: subTotalMes,
      subTotalPrevMes: subTotalPrevMes,
      variacion: subTotalPrev !== 0 ? ((subTotal - subTotalPrev) / Math.abs(subTotalPrev)) * 100 : (subTotal !== 0 ? 100 : 0)
    });
  }
  
  // Sin categoría
  var sinCat = flujos['_SIN_CAT'];
  var sinCatPrev = flujosPrev['_SIN_CAT'];
  var sinCatTotal = 0, sinCatTotalPrev = 0;
  var sinCatMes = {}, sinCatPrevMes = {};
  for (var m = mesDesde; m <= mesHasta; m++) {
    sinCatMes[m] = sinCat ? (sinCat[m] || 0) : 0;
    sinCatPrevMes[m] = sinCatPrev ? (sinCatPrev[m] || 0) : 0;
    sinCatTotal += sinCatMes[m];
    sinCatTotalPrev += sinCatPrevMes[m];
    totalFlujoMes[m] += sinCatMes[m];
    totalFlujoPrevMes[m] += sinCatPrevMes[m];
  }
  totalFlujo += sinCatTotal;
  totalFlujoPrev += sinCatTotalPrev;
  
  var saldoFinal = saldoInicial + totalFlujo;
  var saldoFinalPrev = saldoInicialPrev + totalFlujoPrev;
  
  var hayPrevio = totalFlujoPrev !== 0 || saldoInicialPrev !== 0;
  
  return {
    periodo: { año: año, añoPrev: añoPrev, mesDesde: mesDesde, mesHasta: mesHasta },
    secciones: secciones,
    saldoInicial: saldoInicial,
    saldoInicialPrev: saldoInicialPrev,
    totalFlujo: totalFlujo,
    totalFlujoPrev: totalFlujoPrev,
    totalFlujoMes: totalFlujoMes,
    totalFlujoPrevMes: totalFlujoPrevMes,
    saldoFinal: saldoFinal,
    saldoFinalPrev: saldoFinalPrev,
    sinCategoria: sinCatTotal !== 0 ? { total: sinCatTotal, totalPrev: sinCatTotalPrev, montos: sinCatMes, montosPrev: sinCatPrevMes } : null,
    hayPrevio: hayPrevio
  };
}

// =============================================================================
// SALDOS POR DOCUMENTO (MECÁNICA REF)
// =============================================================================

// =============================================================================
// ESTADO DE SITUACIÓN FINANCIERA (BALANCE CLASIFICADO)
// =============================================================================

/**
 * Estado de Situación Financiera — construido bottom-up desde Mov_Contables.
 * 1. Acumula saldos por cuenta nivel 4 (movimiento) desde Mov_Contables
 * 2. Clasifica cada cuenta usando Plan_Cuentas (tipo, nombre, jerarquía)
 * 3. Agrupa automáticamente por nivel 3 (detalle) y nivel 2 (subtotal)
 */
function getEstadoSituacionFinanciera(año, mesHasta) {
  mesHasta = mesHasta || 12;
  var ss = getSS();
  var sheets = getSheetNames();
  var añoPrev = año - 1;
  
  // ═══════════════════════════════════════════
  // 1. LEER PLAN DE CUENTAS (mapa completo)
  // ═══════════════════════════════════════════
  var todasCuentas = getPlanCuentas(true);
  var planMap = {};
  for (var i = 0; i < todasCuentas.length; i++) planMap[todasCuentas[i].codigo] = todasCuentas[i];
  
  // ═══════════════════════════════════════════
  // 2. LEER MOV_CONTABLES — acumular saldos
  // ═══════════════════════════════════════════
  var sheetMov = buscarHoja(ss, sheets.MOV_CONTABLES);
  var sheetComp = buscarHoja(ss, sheets.COMPROBANTES);
  if (!sheetMov || !sheetComp) return { error: 'Hojas no encontradas' };
  
  var dataMov = sheetMov.getDataRange().getValues();
  var dataComp = sheetComp.getDataRange().getValues();
  
  var compVigentes = {};
  for (var i = 1; i < dataComp.length; i++) {
    if (String(dataComp[i][10]).trim().toUpperCase() !== 'ANULADO') compVigentes[dataComp[i][0]] = true;
  }
  
  // Saldos: { codigoCuenta: { debe, haber } }
  var saldos = {};
  var saldosPrev = {};
  
  for (var i = 1; i < dataMov.length; i++) {
    var row = dataMov[i];
    if (!compVigentes[row[1]]) continue;
    
    var codigo = String(row[3] || '').trim();
    if (!codigo) continue;
    
    var movAño = parseInt(row[15]) || 0;
    var movMes = parseInt(row[16]) || 0;
    var debe = parseFloat(row[4]) || 0;
    var haber = parseFloat(row[5]) || 0;
    
    if (movAño === año && movMes <= mesHasta) {
      if (!saldos[codigo]) saldos[codigo] = { debe: 0, haber: 0 };
      saldos[codigo].debe += debe;
      saldos[codigo].haber += haber;
    }
    if (movAño === añoPrev && movMes <= mesHasta) {
      if (!saldosPrev[codigo]) saldosPrev[codigo] = { debe: 0, haber: 0 };
      saldosPrev[codigo].debe += debe;
      saldosPrev[codigo].haber += haber;
    }
  }
  
  // ═══════════════════════════════════════════
  // 3. CLASIFICAR CUENTAS Y CALCULAR SALDO NETO
  // ═══════════════════════════════════════════
  // Función para obtener código padre
  // "1-1-03-001" → N3: "1-1-03", N2: "1-1", N1: "1"
  // El plan usa códigos completos con ceros: 1-1-01-000 (N3), 1-1-00-000 (N2), 1-0-00-000 (N1)
  // Formato: X-X-XX-XXX
  function getPadre(codigo, nivelPadre) {
    var partes = codigo.split('-');
    if (partes.length < 4) return codigo;
    if (nivelPadre === 3) return partes[0] + '-' + partes[1] + '-' + partes[2] + '-000';
    if (nivelPadre === 2) return partes[0] + '-' + partes[1] + '-00-000';
    if (nivelPadre === 1) return partes[0] + '-0-00-000';
    return codigo;
  }
  
  function getNombreCuenta(codigo) {
    if (planMap[codigo]) return planMap[codigo].nombre;
    // Fallback: si no existe con ceros, intentar sin ceros
    return codigo;
  }
  
  function getTipoCuenta(codigo) {
    if (planMap[codigo]) return planMap[codigo].tipo;
    var p = String(codigo).charAt(0);
    if (p === '1') return 'A';
    if (p === '2') return 'P';
    if (p === '3') return 'T';
    if (p === '4') return 'I';
    return 'G';
  }
  
  function calcSaldoNeto(saldoObj, tipo) {
    if (!saldoObj) return 0;
    // Activos: saldo deudor (debe - haber)
    // Pasivos/Patrimonio: saldo acreedor (haber - debe)
    return (tipo === 'A') ? (saldoObj.debe - saldoObj.haber) : (saldoObj.haber - saldoObj.debe);
  }
  
  // Resultado del Ejercicio (I-G)
  var resultadoEjercicio = 0, resultadoPrev = 0;
  
  // Recolectar todas las cuentas nivel 4 con saldo de balance (A, P, T) y resultados (I, G)
  var allCodigos = {};
  for (var cod in saldos) allCodigos[cod] = true;
  for (var cod in saldosPrev) allCodigos[cod] = true;
  
  // Acumuladores por nivel 3: { "1-1-03": { nombre, tipo, saldo, saldoPrev } }
  var n3Map = {};
  
  for (var cod in allCodigos) {
    var tipo = getTipoCuenta(cod);
    var saldoActual = calcSaldoNeto(saldos[cod], tipo);
    var saldoPrevio = calcSaldoNeto(saldosPrev[cod], tipo);
    
    if (tipo === 'I' || tipo === 'G') {
      // Resultado: I → positivo si haber > debe, G → negativo si debe > haber
      var netoI = saldos[cod] ? (saldos[cod].haber - saldos[cod].debe) : 0;
      var netoIP = saldosPrev[cod] ? (saldosPrev[cod].haber - saldosPrev[cod].debe) : 0;
      if (tipo === 'G') { netoI = -netoI; netoIP = -netoIP; }
      // Wait — gastos: debe - haber = gasto positivo, pero para resultado es negativo
      // Mejor: Ingresos += (haber - debe), Gastos -= (debe - haber)
      if (tipo === 'I') {
        resultadoEjercicio += (saldos[cod] ? (saldos[cod].haber - saldos[cod].debe) : 0);
        resultadoPrev += (saldosPrev[cod] ? (saldosPrev[cod].haber - saldosPrev[cod].debe) : 0);
      } else {
        resultadoEjercicio -= (saldos[cod] ? (saldos[cod].debe - saldos[cod].haber) : 0);
        resultadoPrev -= (saldosPrev[cod] ? (saldosPrev[cod].debe - saldosPrev[cod].haber) : 0);
      }
      continue; // No va al balance directamente
    }
    
    if (saldoActual === 0 && saldoPrevio === 0) continue;
    
    // Agrupar bajo nivel 3
    var n3Code = getPadre(cod, 3);
    if (!n3Map[n3Code]) {
      n3Map[n3Code] = { 
        codigo: n3Code, nombre: getNombreCuenta(n3Code), tipo: tipo,
        saldo: 0, saldoPrev: 0
      };
    }
    n3Map[n3Code].saldo += saldoActual;
    n3Map[n3Code].saldoPrev += saldoPrevio;
  }
  
  // ═══════════════════════════════════════════
  // 4. AGRUPAR NIVEL 3 → NIVEL 2 → SECCIONES
  // ═══════════════════════════════════════════
  // n2Map: { "1-1": { nombre, tipo, items: [{n3}], total, totalPrev } }
  var n2Map = {};
  
  var n3Codes = Object.keys(n3Map).sort();
  for (var i = 0; i < n3Codes.length; i++) {
    var n3 = n3Map[n3Codes[i]];
    var n2Code = getPadre(n3.codigo, 2);
    
    if (!n2Map[n2Code]) {
      n2Map[n2Code] = {
        codigo: n2Code, nombre: getNombreCuenta(n2Code), tipo: n3.tipo,
        items: [], total: 0, totalPrev: 0
      };
    }
    
    var variacion = n3.saldo - n3.saldoPrev;
    n2Map[n2Code].items.push({
      codigo: n3.codigo, nombre: n3.nombre,
      saldo: n3.saldo, saldoPrev: n3.saldoPrev,
      variacion: variacion,
      variacionPct: n3.saldoPrev !== 0 ? (variacion / Math.abs(n3.saldoPrev)) * 100 : (n3.saldo !== 0 ? 100 : 0)
    });
    n2Map[n2Code].total += n3.saldo;
    n2Map[n2Code].totalPrev += n3.saldoPrev;
  }
  
  // ═══════════════════════════════════════════
  // 5. CONSTRUIR SECCIONES POR TIPO (A, P, T)
  // ═══════════════════════════════════════════
  function buildSeccion(tipoFiltro, label) {
    var grupos = [];
    var total = 0, totalPrev = 0;
    
    var codigos = Object.keys(n2Map).sort();
    for (var i = 0; i < codigos.length; i++) {
      var g = n2Map[codigos[i]];
      if (g.tipo !== tipoFiltro) continue;
      if (g.items.length === 0) continue;
      
      var varG = g.total - g.totalPrev;
      grupos.push({
        codigo: g.codigo, nombre: g.nombre,
        items: g.items, total: g.total, totalPrev: g.totalPrev,
        variacion: varG,
        variacionPct: g.totalPrev !== 0 ? (varG / Math.abs(g.totalPrev)) * 100 : (g.total !== 0 ? 100 : 0)
      });
      total += g.total;
      totalPrev += g.totalPrev;
    }
    var varSec = total - totalPrev;
    return {
      label: label, tipo: tipoFiltro, grupos: grupos,
      total: total, totalPrev: totalPrev,
      variacion: varSec,
      variacionPct: totalPrev !== 0 ? (varSec / Math.abs(totalPrev)) * 100 : (total !== 0 ? 100 : 0)
    };
  }
  
  var activos = buildSeccion('A', 'ACTIVOS');
  var pasivos = buildSeccion('P', 'PASIVOS');
  var patrimonio = buildSeccion('T', 'PATRIMONIO');
  
  // Agregar resultado del ejercicio al patrimonio
  if (resultadoEjercicio !== 0 || resultadoPrev !== 0) {
    var varRes = resultadoEjercicio - resultadoPrev;
    patrimonio.grupos.push({
      codigo: '', nombre: 'Resultado del Ejercicio',
      items: [{
        codigo: '', nombre: 'Resultado del Ejercicio',
        saldo: resultadoEjercicio, saldoPrev: resultadoPrev,
        variacion: varRes,
        variacionPct: resultadoPrev !== 0 ? (varRes / Math.abs(resultadoPrev)) * 100 : 0
      }],
      total: resultadoEjercicio, totalPrev: resultadoPrev,
      variacion: varRes,
      variacionPct: resultadoPrev !== 0 ? (varRes / Math.abs(resultadoPrev)) * 100 : 0
    });
    patrimonio.total += resultadoEjercicio;
    patrimonio.totalPrev += resultadoPrev;
    patrimonio.variacion = patrimonio.total - patrimonio.totalPrev;
    patrimonio.variacionPct = patrimonio.totalPrev !== 0 ? ((patrimonio.total - patrimonio.totalPrev) / Math.abs(patrimonio.totalPrev)) * 100 : 0;
  }
  
  var totalPasivoPatrimonio = pasivos.total + patrimonio.total;
  var totalPasivoPatrimonioPrev = pasivos.totalPrev + patrimonio.totalPrev;
  
  // Verificar si hay datos del año anterior
  var hayPrevio = false;
  for (var cod in saldosPrev) {
    if (saldosPrev[cod].debe !== 0 || saldosPrev[cod].haber !== 0) { hayPrevio = true; break; }
  }
  
  return {
    periodo: { año: año, añoPrev: añoPrev, mesHasta: mesHasta },
    activos: activos,
    pasivos: pasivos,
    patrimonio: patrimonio,
    totalPasivoPatrimonio: totalPasivoPatrimonio,
    totalPasivoPatrimonioPrev: totalPasivoPatrimonioPrev,
    resultadoEjercicio: resultadoEjercicio,
    resultadoPrev: resultadoPrev,
    hayPrevio: hayPrevio
  };
}

function getSaldosPorDocumento(codigoCuenta, auxiliar, año) {
  var ss = getSS();
  var sheets = getSheetNames();
  
  var cuenta = getCuenta(codigoCuenta);
  if (!cuenta || !cuenta.requiereDocumento) return { error: 'Cuenta no requiere documento' };
  
  var config = getConfig();
  var tipoApert = config.TIPO_COMP_APERTURA || getTiposComprobante().APERTURA || 'A';
  
  var sheetMov = buscarHoja(ss, sheets.MOV_CONTABLES);
  var sheetComp = buscarHoja(ss, sheets.COMPROBANTES);
  
  var dataMov = sheetMov.getDataRange().getValues();
  var dataComp = sheetComp.getDataRange().getValues();
  
  // Enfoque Softland: TODOS los vigentes excluyendo apertura (sin filtro de año)
  // Esto garantiza que docs cross-year tengan saldo correcto
  var compVigentes = {};
  for (var i = 1; i < dataComp.length; i++) {
    var tipo   = String(dataComp[i][1] || '').trim().toUpperCase();
    var estado = String(dataComp[i][10] || '').trim().toUpperCase();
    if (tipo !== tipoApert && estado !== 'ANULADO') {
      compVigentes[dataComp[i][0]] = true;
    }
  }
  
  var documentos = {};
  
  for (var i = 1; i < dataMov.length; i++) {
    var row = dataMov[i];
    if (String(row[3]).trim() !== codigoCuenta || !compVigentes[row[1]]) continue;
    if (auxiliar && limpiarRUT(auxiliar) !== limpiarRUT(row[7])) continue;
    
    var refTipo = row[11] || row[8];
    var refNum = row[12] || row[9];
    var claveDoc = row[7] + '|' + refTipo + '|' + refNum;
    
    if (!documentos[claveDoc]) {
      documentos[claveDoc] = {
        auxiliar: row[7], nombreAuxiliar: '', tipoDoc: refTipo, numDoc: refNum,
        fechaDoc: null, montoOriginal: 0, cargos: 0, abonos: 0, movimientos: []
      };
    }
    
    var doc = documentos[claveDoc];
    var debe = parseFloat(row[4]) || 0, haber = parseFloat(row[5]) || 0;
    
    if (row[13] === 'REGISTRO') {
      doc.montoOriginal = cuenta.tipo === 'A' ? debe : haber;
      if (row[10]) doc.fechaDoc = row[10]; // Solo setear si tiene fecha
    }
    
    doc.cargos += debe;
    doc.abonos += haber;
    doc.movimientos.push({
      comprobante: row[1], fecha: row[14], tipoDoc: row[8], numDoc: row[9],
      tipoMov: row[13], debe: debe, haber: haber, glosa: row[6]
    });
  }
  
  var resultado = [];
  for (var clave in documentos) {
    var doc = documentos[clave];
    doc.saldo = cuenta.tipo === 'A' ? doc.cargos - doc.abonos : doc.abonos - doc.cargos;
    if (Math.abs(doc.saldo) > 0.01) {
      var aux = getAuxiliar(doc.auxiliar);
      doc.nombreAuxiliar = aux ? aux.nombre : doc.auxiliar;
      doc.diasAntiguedad = doc.fechaDoc ? Math.floor((new Date() - new Date(doc.fechaDoc)) / 86400000) : 0;
      resultado.push(doc);
    }
  }
  
  resultado.sort(function(a, b) { return b.diasAntiguedad - a.diasAntiguedad; });
  
  return {
    cuenta: { codigo: cuenta.codigo, nombre: cuenta.nombre },
    año: año,
    documentos: resultado,
    totalSaldo: resultado.reduce(function(s, d) { return s + d.saldo; }, 0),
    cantidadDocumentos: resultado.length
  };
}

function getCuentasPorCobrar(año) {
  var config = getConfig();
  // Si no se especifica año, getSaldosPorDocumento usará el año fiscal activo
  return getSaldosPorDocumento(config.CUENTA_CLIENTES || '1-1-03-001', null, año || null);
}

function getCuentasPorPagar(año) {
  var config = getConfig();
  return getSaldosPorDocumento(config.CUENTA_PROVEEDORES || '2-1-02-001', null, año || null);
}

// =============================================================================
// CIERRE ANUAL Y APERTURA (SIN CIERRE MENSUAL)
// =============================================================================

/**
 * Cierra el año fiscal completo.
 * 1. Genera comprobante de cierre (salda I y G contra Resultado Ejercicio)
 * 2. Marca el año como CERRADO
 * 3. Archiva datos del año cerrado a otro Spreadsheet
 *
 * @param {number} año - Año a cerrar
 * @param {boolean} archivar - Si true, mueve datos a Spreadsheet de archivo (default: true)
 * @returns {Object}
 */
function cerrarAño(año, archivar) {
  if (archivar === undefined) archivar = true;
  
  var ss = getSS();
  var sheets = getSheetNames();
  
  // Verificar que el año está abierto
  if (!añoEstaAbierto(año)) {
    return { success: false, error: 'Año ' + año + ' no está abierto' };
  }
  
  // Generar comprobante de cierre
  var estado = getEstadoResultados(año, 1, 12);
  var config = getConfig();
  var tiposComp = getTiposComprobante();
  var cuentaResultado = config.CUENTA_RESULTADO_EJERCICIO || '3-3-01-001';
  
  var lineas = [];
  
  for (var i = 0; i < estado.ingresos.length; i++) {
    lineas.push({
      cuenta: estado.ingresos[i].codigo,
      debe: estado.ingresos[i].monto, haber: 0,
      glosa: 'Cierre ' + año + ' - ' + estado.ingresos[i].nombre,
      tipoDoc: 'CI', numDoc: String(año)
    });
  }
  
  for (var i = 0; i < estado.gastos.length; i++) {
    lineas.push({
      cuenta: estado.gastos[i].codigo,
      debe: 0, haber: estado.gastos[i].monto,
      glosa: 'Cierre ' + año + ' - ' + estado.gastos[i].nombre,
      tipoDoc: 'CI', numDoc: String(año)
    });
  }
  
  if (estado.resultadoNeto !== 0) {
    lineas.push({
      cuenta: cuentaResultado,
      debe: estado.resultadoNeto < 0 ? Math.abs(estado.resultadoNeto) : 0,
      haber: estado.resultadoNeto > 0 ? estado.resultadoNeto : 0,
      glosa: (estado.resultadoNeto >= 0 ? 'Utilidad' : 'Pérdida') + ' Ejercicio ' + año,
      tipoDoc: 'CI', numDoc: String(año)
    });
  }
  
  if (lineas.length > 0) {
    var resultadoComp = crearComprobante({
      tipo: tiposComp.CIERRE, fecha: new Date(año, 11, 31),
      glosa: 'CIERRE EJERCICIO ' + año, lineas: lineas,
      origen: 'CIERRE', origenRef: String(año)
    });
    
    if (!resultadoComp.success) return resultadoComp;
  }
  
  // Marcar año como CERRADO
  var sheetPeriodos = buscarHoja(ss, sheets.PERIODOS);
  var periodos = getPeriodos();
  for (var i = 0; i < periodos.length; i++) {
    if (periodos[i].año === año) {
      sheetPeriodos.getRange(periodos[i].rowIndex, 2).setValue('CERRADO');
      sheetPeriodos.getRange(periodos[i].rowIndex, 4).setValue(new Date());
      sheetPeriodos.getRange(periodos[i].rowIndex, 5).setValue(Session.getActiveUser().getEmail());
      break;
    }
  }
  
  // Archivar datos del año cerrado
  var archivoUrl = '';
  if (archivar) {
    var resArchivo = archivarAño(año);
    if (resArchivo.success) {
      archivoUrl = resArchivo.url;
      // Guardar URL del archivo en períodos
      for (var i = 0; i < periodos.length; i++) {
        if (periodos[i].año === año) {
          sheetPeriodos.getRange(periodos[i].rowIndex, 6).setValue(archivoUrl);
          break;
        }
      }
    } else {
      Logger.log('Advertencia: año cerrado pero archivo falló: ' + resArchivo.error);
    }
  }
  
  return {
    success: true,
    comprobante: lineas.length > 0 ? resultadoComp.comprobante : null,
    resultadoEjercicio: estado.resultadoNeto,
    archivoUrl: archivoUrl
  };
}

/**
 * Archiva los datos del año cerrado en un Spreadsheet separado.
 * Copia Comprobantes y Mov_Contables del año, luego los elimina del activo.
 *
 * @param {number} año - Año a archivar
 * @returns {Object} - { success, url, id }
 */
function archivarAño(año) {
  var ss = getSS();
  var sheets = getSheetNames();
  var config = getConfig();
  var empresaNombre = config.EMPRESA_NOMBRE || 'Empresa';
  
  try {
    // Crear Spreadsheet de archivo
    var nombreArchivo = 'Contabilidad_' + empresaNombre.replace(/\s+/g, '_') + '_' + año + '_Archivo';
    var ssArchivo = SpreadsheetApp.create(nombreArchivo);
    
    // Mover a la misma carpeta del spreadsheet activo
    var archivoActivo = DriveApp.getFileById(ss.getId());
    var carpetas = archivoActivo.getParents();
    if (carpetas.hasNext()) {
      var carpeta = carpetas.next();
      DriveApp.getFileById(ssArchivo.getId()).moveTo(carpeta);
    }
    
    // --- ARCHIVAR COMPROBANTES ---
    var sheetComp = buscarHoja(ss, sheets.COMPROBANTES);
    if (sheetComp) {
      var dataComp = sheetComp.getDataRange().getValues();
      var headerComp = dataComp[0];
      var filasArchivo = [headerComp];
      var filasEliminar = []; // índices de fila (1-based) a eliminar
      
      for (var i = 1; i < dataComp.length; i++) {
        if (parseInt(dataComp[i][2]) === año) {
          filasArchivo.push(dataComp[i]);
          filasEliminar.push(i + 1);
        }
      }
      
      if (filasArchivo.length > 1) {
        var sheetArchivoComp = ssArchivo.getSheets()[0];
        sheetArchivoComp.setName('Comprobantes_' + año);
        sheetArchivoComp.getRange(1, 1, filasArchivo.length, filasArchivo[0].length).setValues(filasArchivo);
        
        // Eliminar del activo (de abajo hacia arriba para no alterar índices)
        for (var j = filasEliminar.length - 1; j >= 0; j--) {
          sheetComp.deleteRow(filasEliminar[j]);
        }
      }
    }
    
    // --- ARCHIVAR MOVIMIENTOS ---
    var sheetMov = buscarHoja(ss, sheets.MOV_CONTABLES);
    if (sheetMov) {
      var dataMov = sheetMov.getDataRange().getValues();
      var headerMov = dataMov[0];
      var filasArchivoMov = [headerMov];
      var filasEliminarMov = [];
      
      for (var i = 1; i < dataMov.length; i++) {
        if (parseInt(dataMov[i][15]) === año) { // columna AÑO
          filasArchivoMov.push(dataMov[i]);
          filasEliminarMov.push(i + 1);
        }
      }
      
      if (filasArchivoMov.length > 1) {
        var sheetArchivoMov = ssArchivo.insertSheet('Mov_Contables_' + año);
        sheetArchivoMov.getRange(1, 1, filasArchivoMov.length, filasArchivoMov[0].length).setValues(filasArchivoMov);
        
        for (var j = filasEliminarMov.length - 1; j >= 0; j--) {
          sheetMov.deleteRow(filasEliminarMov[j]);
        }
      }
    }
    
    // --- ARCHIVAR CENTRALIZACIONES ---
    var sheetCent = buscarHoja(ss, sheets.CENTRALIZACIONES);
    if (sheetCent) {
      var dataCent = sheetCent.getDataRange().getValues();
      var headerCent = dataCent[0];
      var filasArchivoCent = [headerCent];
      var filasEliminarCent = [];
      
      for (var i = 1; i < dataCent.length; i++) {
        if (parseInt(dataCent[i][2]) === año) { // columna AÑO
          filasArchivoCent.push(dataCent[i]);
          filasEliminarCent.push(i + 1);
        }
      }
      
      if (filasArchivoCent.length > 1) {
        var sheetArchivoCent = ssArchivo.insertSheet('Centralizaciones_' + año);
        sheetArchivoCent.getRange(1, 1, filasArchivoCent.length, filasArchivoCent[0].length).setValues(filasArchivoCent);
        
        for (var j = filasEliminarCent.length - 1; j >= 0; j--) {
          sheetCent.deleteRow(filasEliminarCent[j]);
        }
      }
    }
    
    Logger.log('Año ' + año + ' archivado en: ' + ssArchivo.getUrl());
    
    return {
      success: true,
      url: ssArchivo.getUrl(),
      id: ssArchivo.getId(),
      nombre: nombreArchivo
    };
    
  } catch (e) {
    Logger.log('Error archivando año ' + año + ': ' + e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Abre un nuevo año fiscal.
 * 1. Verifica que el año anterior esté cerrado (si existe)
/**
 * Abre un nuevo año fiscal.
 * 1. Verifica que el año anterior EXISTA (no requiere CERRADO)
 * 2. Crea 1 fila en Periodos con estado ABIERTO
 * 3. Genera comprobante de apertura con saldos del año anterior
 *    - Cuentas A/P/T → misma cuenta
 *    - Resultado Ejercicio → Resultados Acumulados
 *    - Utilidad/Pérdida del ejercicio (I-G) → Resultados Acumulados
 *
 * @param {number} año - Año a abrir
 * @returns {Object}
 */
function abrirAño(año, cuentaAcumulados) {
  var ss = getSS();
  var sheets = getSheetNames();
  
  // Verificar que no exista ya
  var periodos = getPeriodos();
  for (var i = 0; i < periodos.length; i++) {
    if (periodos[i].año === año) {
      return { success: false, error: 'Año ' + año + ' ya existe (estado: ' + periodos[i].estado + ')' };
    }
  }
  
  // Verificar año anterior existe (si no es el primer año)
  var añoAnterior = año - 1;
  var existeAnterior = false;
  for (var i = 0; i < periodos.length; i++) {
    if (periodos[i].año === añoAnterior) { existeAnterior = true; break; }
  }
  
  // Crear fila en Periodos
  var sheetPeriodos = buscarHoja(ss, sheets.PERIODOS);
  sheetPeriodos.appendRow([año, 'ABIERTO', new Date(año, 0, 1), '', '', '']);
  
  // Si no hay año anterior, abrir sin saldos
  if (!existeAnterior) {
    return { success: true, mensaje: 'Año ' + año + ' abierto (primer año)' };
  }
  
  // Generar comprobante de apertura
  var resultado = generarComprobanteApertura_(año, cuentaAcumulados);
  if (!resultado.success) return resultado;
  
  return { success: true, comprobante: resultado.comprobante, mensaje: 'Año ' + año + ' abierto con saldos de ' + añoAnterior };
}

/**
 * Reabre un año cerrado.
 * 1. Anula el comprobante de cierre
 * 2. Cambia estado CERRADO → ABIERTO
 *
 * @param {number} año
 * @returns {Object}
 */
function reabrirAño(año) {
  var ss = getSS();
  var sheets = getSheetNames();
  
  var periodos = getPeriodos();
  var periodo = null;
  for (var i = 0; i < periodos.length; i++) {
    if (periodos[i].año === año) { periodo = periodos[i]; break; }
  }
  
  if (!periodo) return { success: false, error: 'Año ' + año + ' no existe' };
  if (periodo.estado !== 'CERRADO') return { success: false, error: 'Año ' + año + ' no está cerrado' };
  
  // Buscar y anular comprobante de cierre
  var compCierre = buscarComprobantePorOrigen_('CIERRE', String(año));
  if (compCierre) {
    var resAnular = anularComprobante(compCierre.id, 'Reapertura año ' + año, true);
    if (!resAnular.success) {
      return { success: false, error: 'Error anulando comprobante de cierre: ' + resAnular.error };
    }
  }
  
  // Cambiar estado a ABIERTO
  var sheetPeriodos = buscarHoja(ss, sheets.PERIODOS);
  sheetPeriodos.getRange(periodo.rowIndex, 2).setValue('ABIERTO');
  sheetPeriodos.getRange(periodo.rowIndex, 4).setValue(''); // Limpiar fecha cierre
  sheetPeriodos.getRange(periodo.rowIndex, 5).setValue(''); // Limpiar usuario cierre
  
  // Invalidar caché
  _cache = {};
  
  return { success: true, mensaje: 'Año ' + año + ' reabierto' };
}

/**
 * Recalcula los saldos de apertura de un año.
 * 1. Anula el comprobante de apertura existente
 * 2. Genera uno nuevo con los saldos actualizados del año anterior
 *
 * @param {number} año
 * @returns {Object}
 */
function reApertura(año, cuentaAcumulados) {
  // Verificar que el año exista y esté abierto
  if (!añoEstaAbierto(año)) {
    return { success: false, error: 'Año ' + año + ' no está abierto' };
  }
  
  // Verificar que existe año anterior
  var añoAnterior = año - 1;
  var periodos = getPeriodos();
  var existeAnterior = false;
  for (var i = 0; i < periodos.length; i++) {
    if (periodos[i].año === añoAnterior) { existeAnterior = true; break; }
  }
  if (!existeAnterior) {
    return { success: false, error: 'No existe año anterior ' + añoAnterior };
  }
  
  // ════════════════════════════════════════
  // ELIMINAR FÍSICAMENTE aperturas anteriores
  // (Softland elimina y recrea, no anula)
  // ════════════════════════════════════════
  var ss = getSS();
  var sheets = getSheetNames();
  var sheetComp = buscarHoja(ss, sheets.COMPROBANTES);
  var sheetMov = buscarHoja(ss, sheets.MOV_CONTABLES);
  var tiposComp = getTiposComprobante();
  
  var dataComp = sheetComp.getDataRange().getValues();
  var eliminados = 0;
  
  // Paso 1: Encontrar IDs de comprobantes de apertura del año
  var idsApertura = [];
  for (var i = 1; i < dataComp.length; i++) {
    var tipo   = String(dataComp[i][1] || '').trim().toUpperCase();
    var compAño = parseInt(dataComp[i][2]);
    var estado = String(dataComp[i][10] || '').trim().toUpperCase();
    var origen = String(dataComp[i][11] || '').trim().toUpperCase();
    
    var esApertura = (origen === 'APERTURA' && compAño === año) || 
                     (tipo === tiposComp.APERTURA && compAño === año);
    
    if (esApertura && estado !== 'ANULADO') {
      idsApertura.push(String(dataComp[i][0]));
    }
  }
  
  // Paso 2: Eliminar movimientos de esas aperturas (de abajo hacia arriba)
  if (idsApertura.length > 0) {
    var dataMov = sheetMov.getDataRange().getValues();
    var idsSet = {};
    for (var k = 0; k < idsApertura.length; k++) idsSet[idsApertura[k]] = true;
    
    var filasElimMov = [];
    for (var i = 1; i < dataMov.length; i++) {
      if (idsSet[String(dataMov[i][1] || '')]) {
        filasElimMov.push(i + 1); // +1 porque Sheet es 1-based
      }
    }
    // Eliminar de abajo hacia arriba para no desplazar índices
    for (var f = filasElimMov.length - 1; f >= 0; f--) {
      sheetMov.deleteRow(filasElimMov[f]);
    }
    Logger.log('reApertura: eliminados ' + filasElimMov.length + ' movimientos de apertura');
    
    // Paso 3: Eliminar comprobantes de apertura (de abajo hacia arriba)
    var filasElimComp = [];
    for (var i = 1; i < dataComp.length; i++) {
      if (idsSet[String(dataComp[i][0] || '')]) {
        filasElimComp.push(i + 1);
      }
    }
    for (var f = filasElimComp.length - 1; f >= 0; f--) {
      sheetComp.deleteRow(filasElimComp[f]);
    }
    eliminados = idsApertura.length;
    Logger.log('reApertura: eliminados ' + eliminados + ' comprobante(s) de apertura');
  }
  
  // También eliminar aperturas ANULADAS (basura de reprocesos anteriores)
  dataComp = sheetComp.getDataRange().getValues();
  var idsAnulados = [];
  var filasAnuladas = [];
  for (var i = 1; i < dataComp.length; i++) {
    var tipo   = String(dataComp[i][1] || '').trim().toUpperCase();
    var compAño = parseInt(dataComp[i][2]);
    var estado = String(dataComp[i][10] || '').trim().toUpperCase();
    var origen = String(dataComp[i][11] || '').trim().toUpperCase();
    var esApertura = (origen === 'APERTURA' && compAño === año) || 
                     (tipo === tiposComp.APERTURA && compAño === año);
    if (esApertura && estado === 'ANULADO') {
      idsAnulados.push(String(dataComp[i][0]));
      filasAnuladas.push(i + 1);
    }
  }
  // Eliminar movimientos de anuladas
  if (idsAnulados.length > 0) {
    var dataMov2 = sheetMov.getDataRange().getValues();
    var idsAnuSet = {};
    for (var k = 0; k < idsAnulados.length; k++) idsAnuSet[idsAnulados[k]] = true;
    var filasElimMov2 = [];
    for (var i = 1; i < dataMov2.length; i++) {
      if (idsAnuSet[String(dataMov2[i][1] || '')]) filasElimMov2.push(i + 1);
    }
    for (var f = filasElimMov2.length - 1; f >= 0; f--) sheetMov.deleteRow(filasElimMov2[f]);
  }
  // Eliminar comprobantes anulados
  for (var f = filasAnuladas.length - 1; f >= 0; f--) {
    sheetComp.deleteRow(filasAnuladas[f]);
  }
  
  // Invalidar caché
  _cache = {};
  
  // Generar nuevo comprobante de apertura
  var resultado = generarComprobanteApertura_(año, cuentaAcumulados);
  if (!resultado.success) return resultado;
  
  return { 
    success: true, comprobante: resultado.comprobante, 
    eliminados: eliminados, 
    mensaje: 'Reapertura ' + año + ' completada (' + eliminados + ' apertura(s) anterior(es) eliminada(s))' 
  };
}

// =============================================================================
// HELPERS INTERNOS — APERTURA / CIERRE
// =============================================================================

/**
 * Genera el comprobante de apertura para un año.
 * Toma saldos del año anterior:
 *   - Cuentas A/P/T → misma cuenta con saldo neto
 *   - Cuenta Resultado Ejercicio → redirige a Resultados Acumulados
 *   - Utilidad/Pérdida (I-G) → se suma a Resultados Acumulados
 *
 * @param {number} año
 * @returns {Object} { success, comprobante }
 */
function generarComprobanteApertura_(año, cuentaAcumuladosParam) {
  var añoAnterior = año - 1;
  var config = getConfig();
  var tiposComp = getTiposComprobante();
  var cuentaResultado = config.CUENTA_RESULTADO_EJERCICIO || '3-3-01-001';
  var cuentaAcumulados = cuentaAcumuladosParam || config.CUENTA_RESULTADOS_ACUMULADOS || '3-2-01-001';
  
  var ss = getSS();
  var sheets = getSheetNames();
  var sheetMov = buscarHoja(ss, sheets.MOV_CONTABLES);
  var sheetComp = buscarHoja(ss, sheets.COMPROBANTES);
  if (!sheetMov || !sheetComp) return { success: false, error: 'Hojas no encontradas' };
  
  var dataMov = sheetMov.getDataRange().getValues();
  var dataComp = sheetComp.getDataRange().getValues();
  
  // Comprobantes vigentes SOLO del año anterior
  // Porque ese año ya tiene su propia apertura que arrastra todo lo de antes
  var compVigentes = {};
  for (var i = 1; i < dataComp.length; i++) {
    if (dataComp[i][10] !== 'ANULADO' && parseInt(dataComp[i][2]) === añoAnterior) {
      compVigentes[dataComp[i][0]] = true;
    }
  }
  
  // Plan de cuentas → atributos
  var planCuentas = getPlanCuentas(false);
  var planMap = {};
  for (var i = 0; i < planCuentas.length; i++) {
    planMap[planCuentas[i].codigo] = planCuentas[i];
  }
  
  // =============================================
  // Recorrer Mov_Contables del año anterior
  // Agrupar según atributos de la cuenta
  // =============================================
  var grupos = {};
  
  for (var i = 1; i < dataMov.length; i++) {
    var row = dataMov[i];
    var compId = row[1];
    if (!compVigentes[compId]) continue;
    
    var codigoCta = String(row[3] || '').trim();
    if (!codigoCta) continue;
    
    var cta = planMap[codigoCta];
    if (!cta) continue;
    
    // Solo cuentas de balance (A, P, T)
    if (cta.tipo !== 'A' && cta.tipo !== 'P' && cta.tipo !== 'T') continue;
    
    // Saltar Resultado Ejercicio (se maneja aparte)
    if (codigoCta === cuentaResultado) continue;
    
    var debe = parseFloat(row[4]) || 0;
    var haber = parseFloat(row[5]) || 0;
    var auxiliar = row[7] ? String(row[7]).trim() : '';
    var refTipo = row[11] ? String(row[11]).trim() : '';
    var refNum = row[12] ? String(row[12]).trim() : '';
    
    // Clave de agrupación según atributos
    var clave;
    if (cta.requiereDocumento && refTipo && refNum) {
      clave = codigoCta + '|' + auxiliar + '|' + refTipo + '|' + refNum;
    } else if (cta.requiereAuxiliar && auxiliar) {
      clave = codigoCta + '|' + auxiliar;
    } else {
      clave = codigoCta;
    }
    
    if (!grupos[clave]) {
      grupos[clave] = {
        cuenta: codigoCta,
        auxiliar: (cta.requiereAuxiliar || cta.requiereDocumento) ? auxiliar : '',
        refTipo: cta.requiereDocumento ? refTipo : '',
        refNum: cta.requiereDocumento ? refNum : '',
        tipoDoc: cta.requiereDocumento ? refTipo : 'AP',
        numDoc: cta.requiereDocumento ? refNum : String(año),
        debe: 0, haber: 0
      };
    }
    
    grupos[clave].debe += debe;
    grupos[clave].haber += haber;
  }
  
  // =============================================
  // Generar líneas de apertura
  // =============================================
  var lineas = [];
  var saldoAcumulados = 0;
  
  var claves = Object.keys(grupos);
  for (var k = 0; k < claves.length; k++) {
    var g = grupos[claves[k]];
    var neto = g.debe - g.haber;
    if (Math.abs(neto) < 1) continue;
    
    // Resultados Acumulados → acumular para fusionar
    if (g.cuenta === cuentaAcumulados) {
      saldoAcumulados += neto;
      continue;
    }
    
    var nombreCta = planMap[g.cuenta] ? planMap[g.cuenta].nombre : '';
    var glosa = 'Apertura ' + año;
    if (g.refTipo && g.refNum) {
      glosa += ' - ' + g.refTipo + ' ' + g.refNum;
    } else {
      glosa += ' - ' + nombreCta;
    }
    
    var linea = {
      cuenta: g.cuenta,
      debe: neto > 0 ? neto : 0,
      haber: neto < 0 ? Math.abs(neto) : 0,
      glosa: glosa,
      tipoDoc: g.tipoDoc, numDoc: g.numDoc
    };
    
    if (g.auxiliar) linea.auxiliar = g.auxiliar;
    if (g.refTipo && g.refNum) {
      linea.refTipo = g.refTipo;
      linea.refNum = g.refNum;
    }
    
    lineas.push(linea);
  }
  
  // =============================================
  // Resultado Ejercicio + Utilidad/Pérdida → Acumulados
  // =============================================
  // Buscar saldo de Resultado Ejercicio en mov del año anterior
  var saldoRE = 0;
  for (var i = 1; i < dataMov.length; i++) {
    if (!compVigentes[dataMov[i][1]]) continue;
    if (String(dataMov[i][3]).trim() === cuentaResultado) {
      saldoRE += (parseFloat(dataMov[i][4]) || 0) - (parseFloat(dataMov[i][5]) || 0);
    }
  }
  saldoAcumulados += saldoRE;
  
  // Utilidad/Pérdida de I-G del año anterior (si no está cerrado)
  var balance = getBalanceComprobacion(añoAnterior, 12);
  if (balance && balance.utilidadPerdida && Math.abs(balance.utilidadPerdida) >= 1) {
    // utilidadPerdida positiva = ganancia → acreedor → neto negativo
    saldoAcumulados -= balance.utilidadPerdida;
  }
  
  if (Math.abs(saldoAcumulados) >= 1) {
    lineas.push({
      cuenta: cuentaAcumulados,
      debe: saldoAcumulados > 0 ? saldoAcumulados : 0,
      haber: saldoAcumulados < 0 ? Math.abs(saldoAcumulados) : 0,
      glosa: 'Apertura ' + año + ' - Resultados Acumulados',
      tipoDoc: 'AP', numDoc: String(año)
    });
  }
  
  if (lineas.length === 0) {
    return { success: true, mensaje: 'Sin saldos para apertura' };
  }
  
  // ════════════════════════════════════════
  // CREAR COMPROBANTE CON NÚMERO 0 (Softland = 00000000)
  // No usar crearComprobante() — necesitamos ID fijo y posición ordenada
  // ════════════════════════════════════════
  var sheetCompDest = buscarHoja(ss, sheets.COMPROBANTES);
  var sheetMovDest = buscarHoja(ss, sheets.MOV_CONTABLES);
  
  var idComprobante = tiposComp.APERTURA + '-' + año + '-000000';
  var numero = 0;
  var fecha = new Date(año, 0, 1);
  
  var totalDebe = 0, totalHaber = 0;
  for (var li = 0; li < lineas.length; li++) {
    totalDebe += parseFloat(lineas[li].debe) || 0;
    totalHaber += parseFloat(lineas[li].haber) || 0;
  }
  
  // Insertar cabecera de comprobante en posición ordenada por año
  var filaComp = buscarPosicionInsercion_(sheetCompDest, año);
  if (filaComp > 0) {
    sheetCompDest.insertRowBefore(filaComp);
    sheetCompDest.getRange(filaComp, 1, 1, 15).setValues([[
      idComprobante, tiposComp.APERTURA, año, 1, numero, fecha,
      'APERTURA EJERCICIO ' + año,
      totalDebe, totalHaber, lineas.length, 'VIGENTE',
      'APERTURA', String(año), new Date(), Session.getActiveUser().getEmail()
    ]]);
  } else {
    sheetCompDest.appendRow([
      idComprobante, tiposComp.APERTURA, año, 1, numero, fecha,
      'APERTURA EJERCICIO ' + año,
      totalDebe, totalHaber, lineas.length, 'VIGENTE',
      'APERTURA', String(año), new Date(), Session.getActiveUser().getEmail()
    ]);
  }
  
  // Insertar movimientos en posición ordenada (antes del primer mov del año)
  var filaMov = buscarPosicionInsercionMov_(sheetMovDest, año);
  var lineaNum = 1;
  var rowsMov = [];
  
  for (var li = 0; li < lineas.length; li++) {
    var linea = lineas[li];
    var idMov = idComprobante + '-' + String(lineaNum).padStart(3, '0');
    
    var ctaInfo = getCuenta(linea.cuenta);
    var ctaReqDoc = ctaInfo && ctaInfo.requiereDocumento;
    
    var wTipoDoc = '', wNumDoc = '', wFechaDoc = '', wRefTipo = '', wRefNum = '';
    var tipoMovimiento = 'SIN_DOC';
    
    if (ctaReqDoc) {
      wTipoDoc = linea.tipoDoc || '';
      wNumDoc = linea.numDoc || '';
      wFechaDoc = linea.fechaDoc || '';
      wRefTipo = linea.refTipo || linea.tipoDoc || '';
      wRefNum = linea.refNum || linea.numDoc || '';
      tipoMovimiento = 'REGISTRO';
    }
    
    rowsMov.push([
      idMov, idComprobante, lineaNum, linea.cuenta,
      parseFloat(linea.debe) || 0, parseFloat(linea.haber) || 0,
      linea.glosa || 'Apertura ' + año,
      limpiarRUT(linea.auxiliar) || '',
      wTipoDoc, wNumDoc, wFechaDoc,
      wRefTipo, wRefNum, tipoMovimiento, fecha, año, 1, ''
    ]);
    lineaNum++;
  }
  
  // Insertar todas las filas de movimientos de una vez
  if (rowsMov.length > 0) {
    if (filaMov > 0) {
      sheetMovDest.insertRowsBefore(filaMov, rowsMov.length);
      sheetMovDest.getRange(filaMov, 1, rowsMov.length, 18).setValues(rowsMov);
    } else {
      for (var ri = 0; ri < rowsMov.length; ri++) {
        sheetMovDest.appendRow(rowsMov[ri]);
      }
    }
  }
  
  var resultado = {
    success: true,
    comprobante: {
      id: idComprobante, tipo: tiposComp.APERTURA, numero: numero,
      fecha: fecha, totalDebe: totalDebe, totalHaber: totalHaber,
      lineas: lineas.length
    }
  };
  
  return resultado;
}

/**
 * Busca la fila donde insertar un comprobante para mantener orden por AÑO.
 * Retorna la fila (1-based) del PRIMER comprobante de un año POSTERIOR,
 * o 0 si debe ir al final (appendRow).
 * 
 * Columna AÑO en Comprobantes = col 3 (índice 2)
 */
function buscarPosicionInsercion_(sheet, año) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var compAño = parseInt(data[i][2]);
    if (compAño > año) {
      return i + 1; // Fila 1-based
    }
  }
  return 0; // Ir al final
}

/**
 * Busca la fila donde insertar movimientos para mantener orden por AÑO.
 * Retorna la fila (1-based) del PRIMER movimiento de un año POSTERIOR,
 * o 0 si debe ir al final.
 * 
 * Columna AÑO en Mov_Contables = col 16 (índice 15)
 */
function buscarPosicionInsercionMov_(sheet, año) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var movAño = parseInt(data[i][15]);
    if (movAño > año) {
      return i + 1;
    }
  }
  return 0; // Ir al final
}

/**
 * Busca un comprobante VIGENTE por origen y origenRef
 * @param {string} origen - APERTURA, CIERRE, etc.
 * @param {string} origenRef - referencia (ej: '2025')
 * @returns {Object|null} - comprobante o null
 */
function buscarComprobantePorOrigen_(origen, origenRef) {
  var ss = getSS();
  var sheets = getSheetNames();
  var sheetComp = buscarHoja(ss, sheets.COMPROBANTES);
  if (!sheetComp) return null;
  
  var data = sheetComp.getDataRange().getValues();
  var origenBusc = String(origen).trim().toUpperCase();
  var refBusc = String(origenRef).trim();
  
  for (var i = 1; i < data.length; i++) {
    var estado = String(data[i][10] || '').trim().toUpperCase();
    var origenRow = String(data[i][11] || '').trim().toUpperCase();
    var refRow = String(data[i][12] || '').trim();
    
    if (origenRow === origenBusc && refRow === refBusc && estado === 'VIGENTE') {
      return {
        id: data[i][0], tipo: data[i][1], año: parseInt(data[i][2]), mes: parseInt(data[i][3]),
        numero: parseInt(data[i][4]), glosa: data[i][6], estado: data[i][10], rowIndex: i + 1
      };
    }
  }
  
  // Fallback: buscar por ID que empiece con tipo apertura + año
  // Ej: "A-2026-" para capturar aperturas que no tengan origen seteado
  var tiposComp = getTiposComprobante();
  var prefijo = tiposComp.APERTURA + '-' + refBusc + '-';
  for (var i = 1; i < data.length; i++) {
    var id = String(data[i][0] || '');
    var estado2 = String(data[i][10] || '').trim().toUpperCase();
    if (id.indexOf(prefijo) === 0 && estado2 === 'VIGENTE') {
      Logger.log('buscarComprobantePorOrigen_: encontrado por ID fallback: ' + id);
      return {
        id: data[i][0], tipo: data[i][1], año: parseInt(data[i][2]), mes: parseInt(data[i][3]),
        numero: parseInt(data[i][4]), glosa: data[i][6], estado: data[i][10], rowIndex: i + 1
      };
    }
  }
  
  Logger.log('buscarComprobantePorOrigen_: NO encontrado. Buscando origen=' + origenBusc + ', ref=' + refBusc);
  return null;
}

/**
 * Consulta datos de un año archivado.
 * Abre el Spreadsheet de archivo y lee los comprobantes.
 *
 * @param {number} año - Año a consultar
 * @returns {Object} - { success, comprobantes[] } o error
 */
function consultarAñoArchivado(año) {
  var periodos = getPeriodos();
  var periodo = null;
  for (var i = 0; i < periodos.length; i++) {
    if (periodos[i].año === año) { periodo = periodos[i]; break; }
  }
  
  if (!periodo) return { success: false, error: 'Año ' + año + ' no encontrado' };
  if (!periodo.archivoUrl) return { success: false, error: 'Año ' + año + ' no tiene archivo asociado' };
  
  try {
    // Extraer ID del URL
    var match = periodo.archivoUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) return { success: false, error: 'URL de archivo inválida' };
    
    var ssArchivo = SpreadsheetApp.openById(match[1]);
    var sheetComp = ssArchivo.getSheetByName('Comprobantes_' + año);
    
    if (!sheetComp) return { success: false, error: 'Hoja de comprobantes no encontrada en archivo' };
    
    var data = sheetComp.getDataRange().getValues();
    var comprobantes = [];
    
    for (var i = 1; i < data.length; i++) {
      comprobantes.push({
        id: data[i][0], tipo: data[i][1], año: data[i][2], mes: data[i][3],
        numero: data[i][4], fecha: data[i][5], glosa: data[i][6],
        totalDebe: data[i][7], totalHaber: data[i][8], estado: data[i][10]
      });
    }
    
    return {
      success: true,
      año: año,
      archivoUrl: periodo.archivoUrl,
      comprobantes: comprobantes,
      cantidad: comprobantes.length
    };
    
  } catch (e) {
    return { success: false, error: 'Error al abrir archivo: ' + e.message };
  }
}

// =============================================================================
// UTILIDADES
// =============================================================================

function limpiarRUT(rut) {
  if (!rut) return '';
  return String(rut).replace(/[^0-9kK]/g, '').toUpperCase();
}

function formatearRUT(rut) {
  var limpio = limpiarRUT(rut);
  if (limpio.length < 2) return limpio;
  var cuerpo = limpio.slice(0, -1);
  var dv = limpio.slice(-1);
  var formato = '';
  var contador = 0;
  for (var i = cuerpo.length - 1; i >= 0; i--) {
    formato = cuerpo[i] + formato;
    contador++;
    if (contador === 3 && i > 0) { formato = '.' + formato; contador = 0; }
  }
  return formato + '-' + dv;
}

function validarRUT(rut) {
  var limpio = limpiarRUT(rut);
  if (limpio.length < 2) return false;
  var cuerpo = limpio.slice(0, -1);
  var dvIngresado = limpio.slice(-1);
  var suma = 0, multiplo = 2;
  for (var i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i]) * multiplo;
    multiplo = multiplo === 7 ? 2 : multiplo + 1;
  }
  var resto = suma % 11;
  var dvCalculado = resto === 0 ? '0' : resto === 1 ? 'K' : String(11 - resto);
  return dvCalculado === dvIngresado;
}

function getNombreMes(mes) {
  var nombres = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return nombres[mes] || '';
}

// =============================================================================
// INICIALIZACIÓN
// =============================================================================

function inicializarHojasContables() {
  var ss = getSS();
  
  // Primero crear Config si no existe
  if (!ss.getSheetByName('Config')) {
    var s = ss.insertSheet('Config');
    s.appendRow(['CLAVE', 'VALOR', 'DESCRIPCION']);
    var configs = [
      ['SHEET_PLAN_CUENTAS', 'Plan_Cuentas', 'Hoja del plan de cuentas'],
      ['SHEET_AUXILIARES', 'Auxiliares', 'Hoja de auxiliares'],
      ['SHEET_TIPOS_DOCUMENTO', 'Tipos_Documentos', 'Hoja de tipos de documento'],
      ['SHEET_COMPROBANTES', 'Comprobantes', 'Hoja de comprobantes'],
      ['SHEET_MOV_CONTABLES', 'Mov_Contables', 'Hoja de movimientos contables'],
      ['SHEET_PERIODOS', 'Periodos', 'Hoja de períodos'],
      ['SHEET_CARTOLA', 'Cartolas', 'Hoja de cartola bancaria'],
      ['SHEET_VENTAS', 'Ventas_SII', 'Hoja de ventas'],
      ['SHEET_COMPRAS', 'Compras_SII', 'Hoja de compras'],
      ['SHEET_HONORARIOS', 'Honorarios_SII', 'Hoja de honorarios'],
      ['SHEET_BOLETAS_VENTAS', 'Boletas_Ventas_SII', 'Hoja de boletas de venta'],
      ['SHEET_CONCILIACION', 'Conciliacion_Bancaria', 'Hoja de conciliación'],
      ['SHEET_CENTRALIZACIONES', 'Centralizaciones', 'Hoja de centralizaciones'],
      ['SHEET_CATEGORIA_FLUJO', 'Categoria_Flujo', 'Hoja categorías flujo efectivo'],
      ['CUENTA_CAJA', '1-1-01-001', 'Cuenta de caja'],
      ['CUENTA_BANCO', '1-1-01-002', 'Cuenta Banco Santander'],
      ['CUENTA_CLIENTES', '1-1-03-001', 'Cuenta clientes nacionales'],
      ['CUENTA_CLIENTES_BOLETAS', '1-1-03-002', 'Cuenta clientes boletas'],
      ['CUENTA_CLIENTES_TRANSBANK', '1-1-03-003', 'Cuenta clientes voucher Transbank'],
      ['CUENTA_PROVEEDORES', '2-1-02-001', 'Cuenta proveedores nacionales'],
      ['CUENTA_IVA_CREDITO', '1-1-07-002', 'Cuenta IVA crédito fiscal'],
      ['CUENTA_IVA_DEBITO', '2-1-06-001', 'Cuenta IVA débito fiscal'],
      ['CUENTA_VENTAS', '4-1-01-000', 'Cuenta de ventas'],
      ['CUENTA_HONORARIOS', '5-1-02-001', 'Cuenta honorarios profesionales'],
      ['CUENTA_RETENCION_HONORARIOS', '2-1-07-001', 'Cuenta retención honorarios'],
      ['CUENTA_HONORARIOS_PAGAR', '2-1-04-001', 'Cuenta pasivo honorarios por pagar'],
      ['CUENTA_AJUSTE_SENCILLO', '5-2-02-024', 'Cuenta ajuste sencillo (diferencias cobranza/pago)'],
      ['CUENTA_RESULTADO_EJERCICIO', '3-3-01-000', 'Cuenta resultado ejercicio'],
      ['CUENTA_RESULTADOS_ACUMULADOS', '3-2-01-001', 'Cuenta resultados acumulados'],
      ['TIPO_COMP_INGRESO', 'I', 'Tipo comprobante ingreso'],
      ['TIPO_COMP_EGRESO', 'E', 'Tipo comprobante egreso'],
      ['TIPO_COMP_TRASPASO', 'T', 'Tipo comprobante traspaso'],
      ['TIPO_COMP_APERTURA', 'A', 'Tipo comprobante apertura'],
      ['TIPO_COMP_CIERRE', 'C', 'Tipo comprobante cierre'],
      ['EMPRESA_NOMBRE', 'Notifica Legal SpA', 'Nombre de la empresa'],
      ['EMPRESA_RUT', '77.123.456-7', 'RUT de la empresa'],
      ['AÑO_FISCAL_INICIO', '2025', 'Año fiscal inicial']
    ];
    for (var c = 0; c < configs.length; c++) {
      s.appendRow(configs[c]);
    }
  }
  
  var sheets = getSheetNames();
  
  if (!buscarHoja(ss, sheets.PLAN_CUENTAS)) {
    ss.insertSheet(sheets.PLAN_CUENTAS).appendRow(['codigo', 'descripcion', 'tipo', 'naturaleza', 'nivel', 'usa_auxiliar', 'ctrl_documento', 'exige_documento', 'conciliacion', 'afecta_efe', 'centro_costo', 'activo']);
  }
  
  if (!buscarHoja(ss, sheets.AUXILIARES)) {
    ss.insertSheet(sheets.AUXILIARES).appendRow(['RUT', 'NOMBRE', 'TIPO', 'PLAZO_PAGO', 'EMAIL', 'TELEFONO', 'DIRECCION', 'ACTIVO', 'CUENTA_GASTO']);
  }
  
  if (!buscarHoja(ss, sheets.TIPOS_DOCUMENTO)) {
    ss.insertSheet(sheets.TIPOS_DOCUMENTO).appendRow(['codigo', 'descripcion', 'es_tributario', 'codigo_sii', 'libro', 'invierte_signo', 'activo']);
  }
  
  if (!buscarHoja(ss, sheets.COMPROBANTES)) {
    ss.insertSheet(sheets.COMPROBANTES).appendRow(['ID', 'TIPO', 'AÑO', 'MES', 'NUMERO', 'FECHA', 'GLOSA', 'TOTAL_DEBE', 'TOTAL_HABER', 'CANTIDAD_LINEAS', 'ESTADO', 'ORIGEN', 'ORIGEN_REF', 'FECHA_CREACION', 'USUARIO']);
  }
  
  if (!buscarHoja(ss, sheets.MOV_CONTABLES)) {
    ss.insertSheet(sheets.MOV_CONTABLES).appendRow(['ID', 'ID_COMPROBANTE', 'LINEA', 'CUENTA', 'DEBE', 'HABER', 'GLOSA', 'AUXILIAR', 'TIPO_DOC', 'NUM_DOC', 'FECHA_DOC', 'REF_TIPO', 'REF_NUM', 'TIPO_MOVIMIENTO', 'FECHA', 'AÑO', 'MES', 'CATEGORIA_FLUJO']);
  }
  
  if (!buscarHoja(ss, sheets.PERIODOS)) {
    var s = ss.insertSheet(sheets.PERIODOS);
    s.appendRow(['AÑO', 'ESTADO', 'FECHA_APERTURA', 'FECHA_CIERRE', 'USUARIO_CIERRE', 'ARCHIVO_URL']);
    s.appendRow([2025, 'ABIERTO', new Date(2025, 0, 1), '', '', '']);
  }
  
  if (!buscarHoja(ss, sheets.CONCILIACION)) {
    ss.insertSheet(sheets.CONCILIACION).appendRow(['ID', 'CUENTA', 'MOV_CONTABLE_ID', 'CARTOLA_ID', 'FECHA_MATCH', 'USUARIO', 'DIFERENCIA', 'ESTADO']);
    ss.insertSheet(sheets.REGLAS_CONCILIACION).appendRow(['ID', 'PATRON', 'TIPO_CONTAB', 'AUXILIAR', 'CUENTA_CONTRA', 'GLOSA_TEMPLATE', 'CATEGORIA_FLUJO', 'ACTIVA']);
  }
  
  if (!buscarHoja(ss, sheets.CENTRALIZACIONES)) {
    ss.insertSheet(sheets.CENTRALIZACIONES).appendRow(['ID', 'TIPO', 'AÑO', 'MES', 'COMPROBANTE', 'CANTIDAD_DOCS', 'TOTAL_NETO', 'TOTAL_IVA', 'TOTAL_GENERAL', 'FECHA', 'USUARIO']);
  }
  
  // Invalidar caché tras inicialización
  invalidarCache();
  
  return { success: true, mensaje: 'Sistema inicializado correctamente' };
}