/**
 * CENTRALIZACION.gs - Módulo de Centralización de Documentos Tributarios
 * ========================================================================
 * 
 * DEPENDENCIA TOTAL del Core_Contable_v3.gs. No duplica funciones.
 * Funciones del Core usadas:
 *   getSS(), getSheetNames(), buscarHoja(), getConfig(), invalidarCache()
 *   getCuenta(), getCuentasMovimiento(), getAuxiliar(), crearAuxiliar(), limpiarRUT()
 *   getTiposComprobante(), crearComprobante(), anularComprobante()
 *   getNombreMes(), periodoEstaAbierto()
 *
 * MECÁNICA CLAVE:
 *   - Centralización POR DOCUMENTO para cuentas con atributos (auxiliar/doc)
 *   - NC (DTE 61): tipoDoc=NC, numDoc=NCfolio, refTipo=FAC, refNum=FACoriginal → REBAJA
 *   - ND (DTE 56): tipoDoc=ND, numDoc=NDfolio, refTipo=FAC, refNum=FACoriginal → REBAJA
 *   - Facturas: tipoDoc=FAC, numDoc=folio, refTipo=FAC, refNum=folio → REGISTRO
 */

// =============================================================================
// MAPEO DTE → TIPO DOCUMENTO INTERNO
// =============================================================================

var MAPA_DTE = {
  33: 'FAC', 34: 'FEX', 39: 'BV', 41: 'BVE',
  46: 'FC',  48: 'VT',  52: 'GD',  56: 'ND', 61: 'NC',
  110: 'FEX', 111: 'NCE', 112: 'NDE'
};

var DTES_NOTA_CREDITO = [61, 111];
var DTES_NOTA_DEBITO  = [56, 112];

function mapearDTE(codigoDTE) {
  if (!codigoDTE && codigoDTE !== 0) return '';
  var cod = parseInt(codigoDTE);
  if (isNaN(cod) || cod === 0) return '';
  return MAPA_DTE[cod] || String(codigoDTE);
}

function esNotaCredito(codigoDTE) {
  return DTES_NOTA_CREDITO.indexOf(parseInt(codigoDTE)) !== -1;
}

function esNotaDebito(codigoDTE) {
  return DTES_NOTA_DEBITO.indexOf(parseInt(codigoDTE)) !== -1;
}

// =============================================================================
// UI WRAPPERS (con toClient para serialización GAS→Cliente)
// =============================================================================

function getDataCentralizacionUI(año) {
  return toClient(getDataCentralizacion(año));
}

function getDocumentosCentralizarUI(tipo, año, mes) {
  return toClient(getDocumentosCentralizar(tipo, año, mes));
}

function centralizarDocumentosUI(tipo, año, mes, cuentaContrapartida, opciones) {
  return toClient(centralizarDocumentos(tipo, año, mes, cuentaContrapartida, opciones));
}

function anularCentralizacionUI(idCentralizacion) {
  return toClient(anularCentralizacion_(idCentralizacion));
}

function getCuentasParaCentralizacionUI(tipo) {
  return toClient(getCuentasParaCentralizacion(tipo));
}

function centralizarTransbankUI(año, mes, lineas, cuentaVentas) {
  return toClient(centralizarTransbank(año, mes, lineas, cuentaVentas));
}

function getResumenTransbankUI(año) {
  return toClient(getResumenTransbank(año));
}

// =============================================================================
// CARGA DE DATOS PRINCIPAL
// =============================================================================

function getDataCentralizacion(año) {
  var config = getConfig();
  if (!año) año = parseInt(config.AÑO_FISCAL_INICIO) || new Date().getFullYear();
  
  return {
    añoActivo: año,
    resumen: {
      ventas:         leerResumenLibro('VENTAS', año),
      compras:        leerResumenLibro('COMPRAS', año),
      honorarios:     leerResumenLibro('HONORARIOS', año),
      boletas_ventas: leerResumenLibro('BOLETAS_VENTAS', año),
      transbank:      getResumenTransbank(año)
    },
    historial: getHistorialCentralizaciones_(año),
    añosDisponibles: getAñosDisponibles_()
  };
}

function getAñosDisponibles_() {
  var config = getConfig();
  var inicio = parseInt(config.AÑO_FISCAL_INICIO) || 2024;
  var actual = new Date().getFullYear();
  var años = [];
  for (var a = inicio; a <= actual; a++) años.push(a);
  return años;
}

// =============================================================================
// LECTURA DE LIBROS SII (Ventas, Compras, Honorarios, Boletas Ventas)
// =============================================================================

/**
 * Resuelve la clave de hoja según tipo de libro
 */
function resolverSheetKey_(tipo) {
  var t = tipo.toUpperCase().replace(/ /g, '_');
  if (t === 'VENTAS') return 'VENTAS';
  if (t === 'COMPRAS') return 'COMPRAS';
  if (t === 'HONORARIOS') return 'HONORARIOS';
  if (t === 'BOLETAS_VENTAS' || t === 'BOLETAS') return 'BOLETAS_VENTAS';
  return t;
}

/**
 * Estructura de columnas por tipo de libro.
 * Se detectan automáticamente las columnas de referencia.
 */
function getColumnasLibro(tipo) {
  if (tipo === 'VENTAS') {
    return {
      TIPO: 1, RUT: 3, RAZON: 4, FOLIO: 5, FECHA: 6,
      NETO: 11, IVA: 12, TOTAL: 13,
      // Columnas de referencia NC/ND (se auto-detectan si no están aquí)
      REF_TIPO: -1, REF_FOLIO: -1,
      // Honorarios-specific (unused)
      BRUTO: -1, RETENCION: -1, LIQUIDO: -1
    };
  } else if (tipo === 'COMPRAS') {
    return {
      TIPO: 1, RUT: 3, RAZON: 4, FOLIO: 5, FECHA: 6,
      FECHA_RECEP: -1, // Se auto-detecta en headers
      NETO: 10, IVA: 11, TOTAL: 14,
      REF_TIPO: -1, REF_FOLIO: -1,
      BRUTO: -1, RETENCION: -1, LIQUIDO: -1
    };
  } else if (tipo === 'BOLETAS_VENTAS') {
    return {
      TIPO: 4, RUT: 9, RAZON: 10, FOLIO: 0, FECHA: 5,
      NETO: 1, IVA: 2, TOTAL: 3,
      REF_TIPO: -1, REF_FOLIO: -1,
      BRUTO: -1, RETENCION: -1, LIQUIDO: -1
    };
  } else { // HONORARIOS
    return {
      TIPO: -1, RUT: 4, RAZON: 5, FOLIO: 0, FECHA: 1,
      NETO: -1, IVA: -1, TOTAL: -1,
      REF_TIPO: -1, REF_FOLIO: -1,
      BRUTO: 7, RETENCION: 8, LIQUIDO: 9
    };
  }
}

/**
 * Auto-detecta columnas de referencia (Folio Ref, Tipo Ref) buscando en headers.
 * Patrones SII comunes:
 *   "Tipo Docto. Referencia", "Tipo Doc. Ref.", "Tipo Doc Ref"
 *   "Folio Docto. Referencia", "Folio Doc. Ref.", "Folio Doc Ref"
 */
/**
 * Detecta columna Fecha Recepción en headers de Compras_SII.
 * Patrones SII: "Fecha Recepción", "Fecha Recep", "Fecha_Recepcion", "FechaRecep"
 */
function detectarColumnaFechaRecep(headers) {
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).toUpperCase().trim()
      .replace(/\./g, '').replace(/_/g, ' ').replace(/\s+/g, ' ');
    if (h.indexOf('RECEP') !== -1 && h.indexOf('FECHA') !== -1) return i;
    if (h === 'FECHA RECEPCION' || h === 'FECHA RECEP' || h === 'FECHA RECEPCIÓN') return i;
  }
  return -1;
}

/**
 * Para COMPRAS: devuelve fecha recepción si existe, sino fecha documento.
 * Para otros libros: devuelve fecha documento normal.
 */
function getFechaLibro_(row, cols, tipoUpper, colFechaRecep) {
  if (tipoUpper === 'COMPRAS' && colFechaRecep >= 0) {
    var fRecep = parseFecha_(row[colFechaRecep]);
    if (fRecep) return fRecep;
  }
  return parseFecha_(row[cols.FECHA]);
}

function detectarColumnasReferencia(headers) {
  var refTipo = -1, refFolio = -1;
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).toUpperCase().trim().replace(/\./g, '').replace(/_/g, ' ');
    
    // Columna de TIPO referencia: contiene "TIPO" Y ("REF" o "REFERENCIA")
    if (refTipo === -1 && h.indexOf('TIPO') !== -1 && (h.indexOf('REF') !== -1 || h.indexOf('REFERENCIA') !== -1)) {
      refTipo = i;
    }
    // Columna de FOLIO referencia
    if (h.indexOf('FOLIO') !== -1 && (h.indexOf('REF') !== -1 || h.indexOf('REFERENCIA') !== -1)) {
      refFolio = i;
    }
    // Patrones exactos comunes
    var hClean = h.replace(/\s+/g, ' ');
    if (refFolio === -1 && (hClean === 'REF' || hClean === 'REFERENCIA' || hClean === 'DOC REF' || hClean === 'FOLIO REF' || hClean === 'NRO REF')) {
      refFolio = i;
    }
  }
  return { refTipo: refTipo, refFolio: refFolio };
}

/**
 * Detecta columna CENTRALIZADO en headers, la crea si no existe.
 * @returns {number} índice (0-based) de la columna
 */
function getColCentralizado(sheet, headers) {
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).toUpperCase().trim() === 'CENTRALIZADO') return i;
  }
  // Crear columna
  var col = headers.length;
  sheet.getRange(1, col + 1).setValue('CENTRALIZADO');
  return col;
}

/**
 * Lee resumen de un libro SII por mes (solo documentos NO centralizados).
 */
function leerResumenLibro(tipo, año) {
  var ss = getSS();
  var sheets = getSheetNames();
  var sheetKey = resolverSheetKey_(tipo);
  var sheet = buscarHoja(ss, sheets[sheetKey]);
  if (!sheet) return { porMes: [], totalPendiente: 0, totalCentralizado: 0 };
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { porMes: [], totalPendiente: 0, totalCentralizado: 0 };
  
  var cols = getColumnasLibro(tipo);
  var headers = data[0];
  var colCent = -1;
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).toUpperCase().trim() === 'CENTRALIZADO') { colCent = i; break; }
  }
  
  var esHon = (tipo === 'HONORARIOS');
  var esBol = (tipo === 'BOLETAS_VENTAS');
  
  // COMPRAS: detectar columna Fecha Recepción para clasificar por mes de recepción
  var colFechaRecep = (tipo === 'COMPRAS') ? detectarColumnaFechaRecep(headers) : -1;
  
  // Detectar columna Estado (honorarios: ESTADO, boletas: ESTADO_BOLETA)
  var colEstado = -1;
  if (esHon || esBol) {
    for (var i = 0; i < headers.length; i++) {
      var h = String(headers[i]).toUpperCase().trim().replace(/ /g, '_');
      if (esHon && h === 'ESTADO') { colEstado = i; break; }
      if (esBol && (h === 'ESTADO_BOLETA' || h === 'ESTADO')) { colEstado = i; break; }
    }
  }
  
  var porMes = {};
  for (var m = 1; m <= 12; m++) {
    porMes[m] = { pendiente: 0, centralizado: 0, cantPend: 0, cantCent: 0,
                  neto: 0, iva: 0, bruto: 0, retencion: 0 };
  }
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    
    // Filtrar por estado: honorarios=VIGENTE, boletas=ACEPTADA
    if (colEstado !== -1) {
      var estado = String(row[colEstado]).toUpperCase().trim();
      if (esHon && estado !== 'VIGENTE') continue;
      if (esBol && estado !== 'ACEPTADA') continue;
    }
    
    // COMPRAS: usar fecha recepción para clasificar mes (si existe)
    var fecha = getFechaLibro_(row, cols, tipo, colFechaRecep);
    if (!fecha || fecha.getFullYear() !== año) continue;
    var mes = fecha.getMonth() + 1;
    var centralizado = (colCent !== -1 && row[colCent] === 'S');
    
    if (esHon) {
      var bruto = parseFloat(row[cols.BRUTO]) || 0;
      if (centralizado) { porMes[mes].centralizado += bruto; porMes[mes].cantCent++; }
      else { porMes[mes].pendiente += bruto; porMes[mes].cantPend++; porMes[mes].bruto += bruto; porMes[mes].retencion += parseFloat(row[cols.RETENCION]) || 0; }
    } else {
      var tipoDTE = parseInt(row[cols.TIPO]) || 33;
      // Excluir Transbank (tipo=48) del resumen regular de Ventas — tiene su propia pestaña
      if (tipo === 'VENTAS' && tipoDTE === 48) continue;
      var signo = esNotaCredito(tipoDTE) ? -1 : 1;
      var total = (parseFloat(row[cols.TOTAL]) || 0) * signo;
      var neto = (parseFloat(row[cols.NETO]) || 0) * signo;
      var iva = (parseFloat(row[cols.IVA]) || 0) * signo;
      if (centralizado) { porMes[mes].centralizado += total; porMes[mes].cantCent++; }
      else { porMes[mes].pendiente += total; porMes[mes].cantPend++; porMes[mes].neto += neto; porMes[mes].iva += iva; }
    }
  }
  
  var resultado = [];
  var totalPend = 0, totalCent = 0;
  for (var m = 1; m <= 12; m++) {
    var pm = porMes[m];
    if (pm.cantPend > 0 || pm.cantCent > 0) {
      resultado.push({
        mes: m, nombreMes: getNombreMes(m),
        cantPendiente: pm.cantPend, cantCentralizado: pm.cantCent,
        montoPendiente: pm.pendiente, montoCentralizado: pm.centralizado,
        neto: pm.neto, iva: pm.iva, bruto: pm.bruto, retencion: pm.retencion
      });
      totalPend += pm.pendiente;
      totalCent += pm.centralizado;
    }
  }
  
  return { porMes: resultado, totalPendiente: totalPend, totalCentralizado: totalCent };
}

// =============================================================================
// DOCUMENTOS PARA CENTRALIZAR (detalle por mes)
// =============================================================================

/**
 * Obtiene documentos pendientes de centralizar para un tipo/año/mes.
 * Incluye detección de referencia para NC/ND.
 */
function getDocumentosCentralizar(tipo, año, mes) {
  var ss = getSS();
  var sheets = getSheetNames();
  var sheetKey = resolverSheetKey_(tipo);
  var sheet = buscarHoja(ss, sheets[sheetKey]);
  if (!sheet) return { docs: [], error: 'Hoja no encontrada' };
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { docs: [] };
  
  var tipoUpper = tipo.toUpperCase();
  var cols = getColumnasLibro(tipoUpper);
  var headers = data[0];
  var colCent = -1;
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).toUpperCase().trim() === 'CENTRALIZADO') { colCent = i; break; }
  }
  
  // Auto-detectar columnas referencia
  var refCols = detectarColumnasReferencia(headers);
  
  var esHon = (tipoUpper === 'HONORARIOS');
  var esBol = (tipoUpper === 'BOLETAS_VENTAS');
  
  // COMPRAS: detectar columna Fecha Recepción
  var colFechaRecep = (tipoUpper === 'COMPRAS') ? detectarColumnaFechaRecep(headers) : -1;
  
  // Detectar columna Estado (honorarios: ESTADO, boletas: ESTADO_BOLETA)
  var colEstado = -1;
  if (esHon || esBol) {
    for (var i = 0; i < headers.length; i++) {
      var h = String(headers[i]).toUpperCase().trim().replace(/ /g, '_');
      if (esHon && h === 'ESTADO') { colEstado = i; break; }
      if (esBol && (h === 'ESTADO_BOLETA' || h === 'ESTADO')) { colEstado = i; break; }
    }
  }
  
  var docs = [];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (colCent !== -1 && row[colCent] === 'S') continue; // ya centralizado
    
    // Filtrar por estado: honorarios=VIGENTE, boletas=ACEPTADA
    if (colEstado !== -1) {
      var estado = String(row[colEstado]).toUpperCase().trim();
      if (esHon && estado !== 'VIGENTE') continue;
      if (esBol && estado !== 'ACEPTADA') continue;
    }
    
    // COMPRAS: clasificar por fecha recepción (no fecha documento)
    var fechaLibro = getFechaLibro_(row, cols, tipoUpper, colFechaRecep);
    var fecha = parseFecha_(row[cols.FECHA]) || fechaLibro; // doc date, fallback to recepción
    if (!fechaLibro || fechaLibro.getFullYear() !== año || fechaLibro.getMonth() + 1 !== mes) continue;
    
    if (esHon) {
      docs.push({
        rowIndex: i + 1,
        tipo: 'BH',
        tipoDTE: 0,
        folio: String(row[cols.FOLIO]),
        fecha: fmtFecha_(fecha),
        rut: String(row[cols.RUT]),
        razonSocial: String(row[cols.RAZON]),
        bruto: parseFloat(row[cols.BRUTO]) || 0,
        retencion: parseFloat(row[cols.RETENCION]) || 0,
        liquido: parseFloat(row[cols.LIQUIDO]) || 0,
        neto: 0, iva: 0, total: parseFloat(row[cols.BRUTO]) || 0,
        esNC: false, esND: false,
        refTipoOriginal: '', refFolioOriginal: ''
      });
    } else {
      var tipoDTE = parseInt(row[cols.TIPO]) || 33;
      // Excluir Transbank del listado regular de Ventas
      if (tipoUpper === 'VENTAS' && tipoDTE === 48) continue;
      var tipoDocInterno = mapearDTE(tipoDTE);
      var neto = parseFloat(row[cols.NETO]) || 0;
      var iva  = parseFloat(row[cols.IVA]) || 0;
      var total = parseFloat(row[cols.TOTAL]) || 0;
      
      // Detectar referencia para NC/ND
      var refTipoOrig = '', refFolioOrig = '';
      if (esNotaCredito(tipoDTE) || esNotaDebito(tipoDTE)) {
        // Intentar desde columnas detectadas
        if (refCols.refFolio !== -1) {
          refFolioOrig = String(row[refCols.refFolio] || '').trim();
        }
        if (refCols.refTipo !== -1) {
          var refDTEVal = row[refCols.refTipo];
          // Puede venir como número DTE (33, 56, 61) o como texto
          var refDTEMapped = mapearDTE(refDTEVal);
          if (refDTEMapped) {
            refTipoOrig = refDTEMapped;
          } else {
            // Intentar interpretar texto descriptivo
            var refTexto = String(refDTEVal || '').toUpperCase().trim();
            if (refTexto.indexOf('NOTA') !== -1 && refTexto.indexOf('CR') !== -1) refTipoOrig = 'NC';
            else if (refTexto.indexOf('NOTA') !== -1 && refTexto.indexOf('D') !== -1) refTipoOrig = 'ND';
            else if (refTexto.indexOf('BOLETA') !== -1 || refTexto === 'BV' || refTexto === 'BOL') refTipoOrig = 'BV';
            else if (refTexto.indexOf('FACTURA') !== -1 || refTexto === 'FAC') refTipoOrig = 'FAC';
          }
        }
        // Si tenemos folio pero no tipo, buscar el folio entre los docs del mismo mes
        // para determinar si es FAC, NC, BV, etc.
        if (refFolioOrig && !refTipoOrig) {
          // 1) Buscar en data del mismo sheet (Ventas_SII)
          for (var j = 1; j < data.length; j++) {
            if (j === i) continue;
            var folioJ = String(data[j][cols.FOLIO] || '').trim();
            if (folioJ === refFolioOrig) {
              var dteJ = parseInt(data[j][cols.TIPO]) || 0;
              refTipoOrig = mapearDTE(dteJ);
              break;
            }
          }
          // 2) Si no se encontró, buscar en Boletas_Ventas_SII (NC puede anular boleta)
          if (!refTipoOrig && tipoUpper === 'VENTAS') {
            var sheetBol = buscarHoja(ss, sheets.BOLETAS_VENTAS);
            if (sheetBol) {
              var dataBol = sheetBol.getDataRange().getValues();
              var colsBol = getColumnasLibro('BOLETAS_VENTAS'); // FOLIO=0, TIPO=4
              for (var j = 1; j < dataBol.length; j++) {
                var folioBol = String(dataBol[j][colsBol.FOLIO] || '').trim();
                if (folioBol === refFolioOrig) {
                  var dteBol = parseInt(dataBol[j][colsBol.TIPO]) || 39;
                  refTipoOrig = mapearDTE(dteBol) || 'BV';
                  break;
                }
              }
            }
          }
          // 3) Si aún no se encontró, para NC asumir FAC, para ND NO asumir
          if (!refTipoOrig) {
            if (esNotaCredito(tipoDTE)) {
              refTipoOrig = 'FAC'; // último recurso
            }
          }
        }
      }
      
      docs.push({
        rowIndex: i + 1,
        tipo: tipoDocInterno,
        tipoDTE: tipoDTE,
        folio: String(row[cols.FOLIO]),
        fecha: fmtFecha_(fecha),
        rut: String(row[cols.RUT]),
        razonSocial: String(row[cols.RAZON]),
        neto: neto, iva: iva, total: total,
        bruto: 0, retencion: 0, liquido: 0,
        esNC: esNotaCredito(tipoDTE),
        esND: esNotaDebito(tipoDTE),
        refTipoOriginal: refTipoOrig,
        refFolioOriginal: refFolioOrig
      });
    }
  }
  
  // Ordenar: primero facturas, luego NC, luego ND
  docs.sort(function(a, b) {
    if (a.esNC !== b.esNC) return a.esNC ? 1 : -1;
    if (a.esND !== b.esND) return a.esND ? 1 : -1;
    return parseInt(a.folio) - parseInt(b.folio);
  });
  
  // Enriquecer con cuenta gasto del auxiliar (si existe)
  if (tipoUpper === 'COMPRAS') {
    for (var i = 0; i < docs.length; i++) {
      var aux = getAuxiliar(docs[i].rut);
      docs[i].cuentaGasto = (aux && aux.cuentaGasto) ? aux.cuentaGasto : '';
    }
  }
  
  return {
    docs: docs,
    tieneReferencias: refCols.refFolio !== -1,
    periodo: { año: año, mes: mes, nombreMes: getNombreMes(mes) }
  };
}

// =============================================================================
// CENTRALIZAR DOCUMENTOS
// =============================================================================

/**
 * Ejecuta la centralización creando comprobante con líneas POR DOCUMENTO.
 * 
 * @param {string} tipo - 'ventas', 'compras', 'honorarios'
 * @param {number} año
 * @param {number} mes
 * @param {string} cuentaContrapartida - cuenta de ventas/gastos/honorarios
 * @param {Object} opciones - { docsSeleccionados: [{rowIndex, refTipoOriginal, refFolioOriginal}...] }
 */
function centralizarDocumentos(tipo, año, mes, cuentaContrapartida, opciones) {
  validarAccesoEscritura_();
  opciones = opciones || {};
  var config = getConfig();
  
  // Obtener documentos pendientes
  var resultado = getDocumentosCentralizar(tipo, año, mes);
  var todosLosDocumentos = resultado.docs;
  
  if (!todosLosDocumentos || todosLosDocumentos.length === 0) {
    return { success: false, error: 'No hay documentos pendientes para centralizar' };
  }
  
  // Filtrar por selección si se proporcionó
  var documentos = todosLosDocumentos;
  var docsSeleccionados = opciones.docsSeleccionados;
  if (docsSeleccionados && docsSeleccionados.length > 0) {
    var rowsMap = {};
    for (var s = 0; s < docsSeleccionados.length; s++) {
      var ds = docsSeleccionados[s];
      rowsMap[ds.rowIndex] = ds; // puede traer refTipoOriginal/refFolioOriginal editados
    }
    var filtrados = [];
    for (var i = 0; i < documentos.length; i++) {
      if (rowsMap[documentos[i].rowIndex]) {
        // Aplicar ref editada por usuario si existe
        // IMPORTANTE: usar hasOwnProperty para permitir valores vacíos (usuario borró la ref)
        var override = rowsMap[documentos[i].rowIndex];
        if (override.hasOwnProperty('refTipoOriginal'))  documentos[i].refTipoOriginal = override.refTipoOriginal || '';
        if (override.hasOwnProperty('refFolioOriginal')) documentos[i].refFolioOriginal = override.refFolioOriginal || '';
        if (override.cuentaGasto) documentos[i].cuentaGasto = override.cuentaGasto;
        filtrados.push(documentos[i]);
      }
    }
    documentos = filtrados;
  }
  
  if (documentos.length === 0) {
    return { success: false, error: 'No hay documentos seleccionados' };
  }
  
  // Construir líneas según tipo
  var lineas;
  if (tipo === 'ventas') {
    lineas = buildLineasVentas(documentos, cuentaContrapartida, config);
  } else if (tipo === 'compras') {
    lineas = buildLineasCompras(documentos, cuentaContrapartida, config);
  } else if (tipo === 'boletas_ventas') {
    lineas = buildLineasBoletas(documentos, cuentaContrapartida, config);
  } else {
    lineas = buildLineasHonorarios(documentos, cuentaContrapartida, config);
  }
  
  if (lineas.error) return { success: false, error: lineas.error };
  
  // Verificar cuadratura antes de enviar
  var totalDebe = 0, totalHaber = 0;
  for (var i = 0; i < lineas.length; i++) {
    totalDebe += lineas[i].debe || 0;
    totalHaber += lineas[i].haber || 0;
  }
  if (Math.abs(totalDebe - totalHaber) > 1) {
    return { success: false, error: 'Descuadre: Debe=' + totalDebe + ' Haber=' + totalHaber + '. Diferencia=' + Math.abs(totalDebe - totalHaber) };
  }
  
  // Crear comprobante
  var tiposComp = getTiposComprobante();
  var ultimoDia = new Date(año, mes, 0).getDate();
  var tipoLabel = tipo.charAt(0).toUpperCase() + tipo.slice(1);
  
  var compResult = crearComprobante({
    tipo: tiposComp.TRASPASO,
    fecha: new Date(año, mes - 1, ultimoDia),
    glosa: 'CENTRALIZA ' + tipoLabel.toUpperCase() + ' ' + getNombreMes(mes).toUpperCase() + ' ' + año,
    lineas: lineas,
    origen: 'CENTRALIZA_' + tipo.toUpperCase(),
    origenRef: año + '-' + mes,
    forzarDuplicados: true
  });
  
  if (!compResult.success) return compResult;
  
  // Marcar documentos como centralizados
  var rows = [];
  for (var i = 0; i < documentos.length; i++) rows.push(documentos[i].rowIndex);
  marcarCentralizados_(tipo, rows);
  
  // Registrar en historial
  var total = 0;
  for (var i = 0; i < documentos.length; i++) {
    if (tipo === 'honorarios') total += documentos[i].bruto;
    else total += documentos[i].total * (documentos[i].esNC ? -1 : 1);
  }
  registrarCentralizacion_(tipo.toUpperCase(), año, mes, compResult.comprobante, documentos.length, total);
  
  invalidarCache();
  
  return {
    success: true,
    comprobante: compResult.comprobante,
    documentos: documentos.length,
    total: total,
    warnings: compResult.warnings || []
  };
}

// =============================================================================
// BUILDERS DE LÍNEAS CONTABLES
// =============================================================================

/**
 * Construye líneas para centralización de VENTAS.
 * Cuentas involucradas: Clientes (Debe), IVA Débito (Haber), Ventas (Haber)
 * NC: invierte → Clientes (Haber), IVA Débito (Debe), Ventas (Debe)
 *     NC REF apunta a la factura original → genera REBAJA automática
 * ND: Clientes (Debe), IVA Débito (Haber), Ventas (Haber) — como FAC
 *     ND REF apunta al doc original (puede ser FAC o NC) → genera REBAJA del referenciado
 */
function buildLineasVentas(docs, cuentaVentas, config) {
  var ctaClientes = config.CUENTA_CLIENTES || '1-1-03-001';
  var ctaClientesBol = config.CUENTA_CLIENTES_BOLETAS || '1-1-03-002';
  var ctaIVADebito = config.CUENTA_IVA_DEBITO || '2-1-06-001';
  var ctaVentas = cuentaVentas || config.CUENTA_VENTAS || '4-1-01-001';
  
  var lineas = [];
  var totalNeto = 0, totalIVA = 0;
  
  for (var i = 0; i < docs.length; i++) {
    var doc = docs[i];
    var rut = limpiarRUT(doc.rut);
    var esNC = doc.esNC;
    var esND = doc.esND;
    var esNota = esNC || esND;
    
    // Asegurar auxiliar existe
    asegurarAuxiliar_(rut, doc.razonSocial, 'CLIENTE');
    
    var montoTotal = Math.round(Math.abs(doc.total));
    var montoNeto = Math.round(Math.abs(doc.neto));
    var montoIVA = Math.round(Math.abs(doc.iva));
    
    // Determinar refTipo y refNum según tipo de documento
    // NC → REF apunta a FAC original (REBAJA de la FAC)
    // ND → REF apunta al doc original según "Tipo Docto. Referencia":
    //       - Si ref = NC → REBAJA de la NC (anula/reduce la NC)
    //       - Si ref = FAC → REBAJA de la FAC (agrega cargo)
    // FAC → REF apunta a sí misma (REGISTRO)
    var refTipo, refNum;
    if (esNota && doc.refFolioOriginal && doc.refTipoOriginal) {
      // Tiene referencia completa (tipo + folio)
      refTipo = doc.refTipoOriginal;
      refNum = String(doc.refFolioOriginal);
    } else if (esNota && doc.refFolioOriginal && !doc.refTipoOriginal) {
      // Solo tiene folio sin tipo — para NC asumir FAC, para ND dejar como REGISTRO propio
      if (esNC) {
        refTipo = 'FAC';
        refNum = String(doc.refFolioOriginal);
      } else {
        // ND sin tipo ref conocido → REGISTRO propio (no asumir FAC)
        refTipo = doc.tipo;
        refNum = doc.folio;
      }
    } else {
      // Sin referencia → REGISTRO del propio documento
      refTipo = doc.tipo;
      refNum = doc.folio;
    }
    
    // Determinar cuenta CxC correcta para este documento
    // - FAC, ND → ctaClientes (1-1-03-001)
    // - BV → ctaClientesBol (1-1-03-002)
    // - NC/ND que referencia BV → ctaClientesBol (rebaja de boleta)
    // - NC/ND que referencia FAC → ctaClientes (rebaja de factura)
    var ctaCxCDoc = ctaClientes;
    if (doc.tipo === 'BV' || doc.tipo === 'BVE') {
      ctaCxCDoc = ctaClientesBol;
    } else if (esNota && refTipo === 'BV') {
      ctaCxCDoc = ctaClientesBol;
    }
    
    // Línea Clientes (por documento)
    lineas.push({
      cuenta: ctaCxCDoc,
      debe: esNC ? 0 : montoTotal,
      haber: esNC ? montoTotal : 0,
      glosa: doc.razonSocial + ' ' + doc.tipo + ' ' + doc.folio,
      auxiliar: rut,
      tipoDoc: doc.tipo,
      numDoc: doc.folio,
      fechaDoc: doc.fecha,
      refTipo: refTipo,
      refNum: refNum
    });
    
    // Acumular IVA y Neto con signo
    var signo = esNC ? -1 : 1;
    totalNeto += montoNeto * signo;
    totalIVA += montoIVA * signo;
  }
  
  // Línea IVA Débito (resumen)
  if (totalIVA !== 0) {
    lineas.push({
      cuenta: ctaIVADebito,
      debe: totalIVA < 0 ? Math.abs(totalIVA) : 0,
      haber: totalIVA > 0 ? totalIVA : 0,
      glosa: 'IVA Débito Fiscal'
    });
  }
  
  // Línea Ventas (resumen)
  if (totalNeto !== 0) {
    lineas.push({
      cuenta: ctaVentas,
      debe: totalNeto < 0 ? Math.abs(totalNeto) : 0,
      haber: totalNeto > 0 ? totalNeto : 0,
      glosa: 'Ventas'
    });
  }
  
  return lineas;
}

/**
 * Construye líneas para centralización de COMPRAS.
 * Cuentas: Gasto (Debe), IVA Crédito (Debe), Proveedores (Haber)
 * NC: invierte → Gasto (Haber), IVA Crédito (Haber), Proveedores (Debe)
 */
function buildLineasCompras(docs, cuentaGasto, config) {
  var ctaProveedores = config.CUENTA_PROVEEDORES || '2-1-02-001';
  var ctaIVACredito = config.CUENTA_IVA_CREDITO || '1-1-07-002';
  var ctaGastoDefault = cuentaGasto || '5-1-01-001';
  
  var lineas = [];
  var totalIVA = 0;
  var netoPorCuenta = {}; // { cuentaCodigo: netoAcumulado }
  
  for (var i = 0; i < docs.length; i++) {
    var doc = docs[i];
    var rut = limpiarRUT(doc.rut);
    var esNC = doc.esNC;
    
    asegurarAuxiliar_(rut, doc.razonSocial, 'PROVEEDOR');
    
    var montoTotal = Math.round(Math.abs(doc.total));
    var montoNeto = Math.round(Math.abs(doc.neto));
    var montoIVA = Math.round(Math.abs(doc.iva));
    
    var refTipo, refNum;
    if ((esNC || doc.esND) && doc.refFolioOriginal && doc.refTipoOriginal) {
      // Tiene referencia completa
      refTipo = doc.refTipoOriginal;
      refNum = String(doc.refFolioOriginal);
    } else if ((esNC || doc.esND) && doc.refFolioOriginal && !doc.refTipoOriginal) {
      // Solo folio sin tipo
      if (esNC) {
        refTipo = 'FAC';
        refNum = String(doc.refFolioOriginal);
      } else {
        // ND sin tipo ref → REGISTRO propio
        refTipo = doc.tipo;
        refNum = doc.folio;
      }
    } else {
      refTipo = doc.tipo;
      refNum = doc.folio;
    }
    
    // Línea Proveedores (por documento)
    lineas.push({
      cuenta: ctaProveedores,
      debe: esNC ? montoTotal : 0,
      haber: esNC ? 0 : montoTotal,
      glosa: doc.razonSocial + ' ' + doc.tipo + ' ' + doc.folio,
      auxiliar: rut,
      tipoDoc: doc.tipo,
      numDoc: doc.folio,
      fechaDoc: doc.fecha,
      refTipo: refTipo,
      refNum: refNum
    });
    
    // Acumular neto por cuenta de gasto
    var ctaDoc = doc.cuentaGasto || ctaGastoDefault;
    var signo = esNC ? -1 : 1;
    if (!netoPorCuenta[ctaDoc]) netoPorCuenta[ctaDoc] = 0;
    netoPorCuenta[ctaDoc] += montoNeto * signo;
    totalIVA += montoIVA * signo;
  }
  
  // Líneas Gasto (una por cuenta distinta)
  var cuentasGasto = Object.keys(netoPorCuenta);
  for (var g = 0; g < cuentasGasto.length; g++) {
    var ctaG = cuentasGasto[g];
    var neto = netoPorCuenta[ctaG];
    if (neto !== 0) {
      var ctaInfo = getCuenta(ctaG);
      var ctaNombre = ctaInfo ? ctaInfo.nombre : 'Gastos';
      lineas.push({
        cuenta: ctaG,
        debe: neto > 0 ? neto : 0,
        haber: neto < 0 ? Math.abs(neto) : 0,
        glosa: ctaNombre
      });
    }
  }
  
  // Línea IVA Crédito (resumen)
  if (totalIVA !== 0) {
    lineas.push({
      cuenta: ctaIVACredito,
      debe: totalIVA > 0 ? totalIVA : 0,
      haber: totalIVA < 0 ? Math.abs(totalIVA) : 0,
      glosa: 'IVA Crédito Fiscal'
    });
  }
  
  return lineas;
}

/**
 * Construye líneas para centralización de BOLETAS DE VENTA.
 * Cuentas: Clientes Boletas (Debe), IVA Débito (Haber), Ventas (Haber)
 * Las boletas no tienen NC/ND → siempre son REGISTRO.
 */
function buildLineasBoletas(docs, cuentaVentas, config) {
  var ctaClientesBol = config.CUENTA_CLIENTES_BOLETAS || '1-1-03-002';
  var ctaIVADebito = config.CUENTA_IVA_DEBITO || '2-1-06-001';
  var ctaVentas = cuentaVentas || config.CUENTA_VENTAS || '4-1-01-001';
  
  var lineas = [];
  var totalNeto = 0, totalIVA = 0;
  
  for (var i = 0; i < docs.length; i++) {
    var doc = docs[i];
    var rut = limpiarRUT(doc.rut);
    
    // Asegurar auxiliar existe
    asegurarAuxiliar_(rut, doc.razonSocial, 'CLIENTE');
    
    var montoTotal = Math.round(Math.abs(doc.total));
    var montoNeto = Math.round(Math.abs(doc.neto));
    var montoIVA = Math.round(Math.abs(doc.iva));
    
    // Boletas siempre son REGISTRO (no hay NC/ND)
    lineas.push({
      cuenta: ctaClientesBol,
      debe: montoTotal,
      haber: 0,
      glosa: doc.razonSocial + ' BV ' + doc.folio,
      auxiliar: rut,
      tipoDoc: 'BV',
      numDoc: doc.folio,
      fechaDoc: doc.fecha,
      refTipo: 'BV',
      refNum: doc.folio
    });
    
    totalNeto += montoNeto;
    totalIVA += montoIVA;
  }
  
  // Línea IVA Débito (resumen)
  if (totalIVA > 0) {
    lineas.push({
      cuenta: ctaIVADebito,
      debe: 0,
      haber: totalIVA,
      glosa: 'IVA Débito Boletas'
    });
  }
  
  // Línea Ventas (resumen)
  if (totalNeto > 0) {
    lineas.push({
      cuenta: ctaVentas,
      debe: 0,
      haber: totalNeto,
      glosa: 'Ventas Boletas'
    });
  }
  
  return lineas;
}


/**
 * Construye líneas para centralización de HONORARIOS.
 * Cuentas: Gasto Honorarios (Debe), Retención (Haber), Proveedores (Haber)
 * Cada boleta es por documento contra Proveedores.
 */
function buildLineasHonorarios(docs, cuentaHonorarios, config) {
  var ctaHonorarios = cuentaHonorarios || config.CUENTA_HONORARIOS || '5-1-02-001';
  var ctaRetencion = config.CUENTA_RETENCION_HONORARIOS || '2-1-07-001';
  var ctaHonPagar = config.CUENTA_HONORARIOS_PAGAR || '2-1-04-001';
  
  var lineas = [];
  var totalBruto = 0, totalRetencion = 0;
  
  // Por cada boleta: línea individual en Proveedores
  for (var i = 0; i < docs.length; i++) {
    var doc = docs[i];
    var rut = limpiarRUT(doc.rut);
    
    asegurarAuxiliar_(rut, doc.razonSocial, 'PROVEEDOR');
    
    var liquido = Math.round(doc.liquido);
    
    lineas.push({
      cuenta: ctaHonPagar,
      debe: 0,
      haber: liquido,
      glosa: doc.razonSocial + ' BH ' + doc.folio,
      auxiliar: rut,
      tipoDoc: 'BH',
      numDoc: doc.folio,
      fechaDoc: doc.fecha,
      refTipo: 'BH',
      refNum: doc.folio
    });
    
    totalBruto += Math.round(doc.bruto);
    totalRetencion += Math.round(doc.retencion);
  }
  
  // Gasto Honorarios (resumen)
  if (totalBruto > 0) {
    lineas.push({
      cuenta: ctaHonorarios,
      debe: totalBruto,
      haber: 0,
      glosa: 'Honorarios'
    });
  }
  
  // Retención (resumen)
  if (totalRetencion > 0) {
    lineas.push({
      cuenta: ctaRetencion,
      debe: 0,
      haber: totalRetencion,
      glosa: 'Retención Honorarios'
    });
  }
  
  return lineas;
}

// =============================================================================
// CENTRALIZACIÓN TRANSBANK (entrada manual, escribe a Ventas_SII)
// =============================================================================

/**
 * Lee Ventas_SII buscando entradas Transbank (tipoDTE=48) para resumen por mes.
 */
function getResumenTransbank(año) {
  var ss = getSS();
  var sheets = getSheetNames();
  var sheet = buscarHoja(ss, sheets.VENTAS);
  if (!sheet) return { porMes: [], totalPendiente: 0, totalCentralizado: 0 };
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { porMes: [], totalPendiente: 0, totalCentralizado: 0 };
  
  var cols = getColumnasLibro('VENTAS');
  var headers = data[0];
  var colCent = -1;
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).toUpperCase().trim() === 'CENTRALIZADO') { colCent = i; break; }
  }
  
  var porMes = {};
  for (var m = 1; m <= 12; m++) {
    porMes[m] = { pendiente: 0, centralizado: 0, cantPend: 0, cantCent: 0, neto: 0, iva: 0 };
  }
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var tipoDTE = parseInt(row[cols.TIPO]);
    if (tipoDTE !== 48) continue; // Solo Transbank
    
    var fecha = parseFecha_(row[cols.FECHA]);
    if (!fecha || fecha.getFullYear() !== año) continue;
    var mes = fecha.getMonth() + 1;
    var total = parseFloat(row[cols.TOTAL]) || 0;
    var centralizado = (colCent !== -1 && row[colCent] === 'S');
    
    if (centralizado) { porMes[mes].centralizado += total; porMes[mes].cantCent++; }
    else { porMes[mes].pendiente += total; porMes[mes].cantPend++; porMes[mes].neto += parseFloat(row[cols.NETO]) || 0; porMes[mes].iva += parseFloat(row[cols.IVA]) || 0; }
  }
  
  var MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var resultado = [];
  var totalPend = 0, totalCent = 0;
  for (var m = 1; m <= 12; m++) {
    var pm = porMes[m];
    resultado.push({
      mes: m, nombreMes: MESES[m],
      montoPendiente: pm.pendiente, montoCentralizado: pm.centralizado,
      cantPendiente: pm.cantPend, cantCentralizado: pm.cantCent
    });
    totalPend += pm.pendiente;
    totalCent += pm.centralizado;
  }
  return { porMes: resultado, totalPendiente: totalPend, totalCentralizado: totalCent };
}

/**
 * Centraliza vouchers Transbank: escribe a Ventas_SII + crea comprobante.
 * @param {number} año
 * @param {number} mes
 * @param {Array} lineas - [{fecha, referencia, neto, iva, total}]
 * @param {string} cuentaVentas - cuenta de ingresos
 */
function centralizarTransbank(año, mes, lineas, cuentaVentas) {
  validarAccesoEscritura_();
  if (!lineas || lineas.length === 0) return { success: false, error: 'No hay líneas para centralizar' };
  
  var config = getConfig();
  var ctaClientesTB = config.CUENTA_CLIENTES_TRANSBANK || '1-1-03-003';
  var ctaIVADebito = config.CUENTA_IVA_DEBITO || '2-1-06-001';
  var ctaVentas = cuentaVentas || config.CUENTA_VENTAS || '4-1-01-001';
  
  // Verificar que todas las líneas tengan auxiliar
  for (var v = 0; v < lineas.length; v++) {
    if (!lineas[v].rut || !lineas[v].rut.trim()) {
      return { success: false, error: 'Línea ' + (v + 1) + ' no tiene auxiliar asignado' };
    }
  }
  
  // 1. Escribir a Ventas_SII
  var ss = getSS();
  var sheets = getSheetNames();
  var sheetVentas = buscarHoja(ss, sheets.VENTAS);
  if (!sheetVentas) return { success: false, error: 'Hoja Ventas_SII no encontrada' };
  
  var headersV = sheetVentas.getRange(1, 1, 1, sheetVentas.getLastColumn()).getValues()[0];
  var colCent = getColCentralizado(sheetVentas, headersV);
  var cols = getColumnasLibro('VENTAS');
  
  var rowsInsertados = [];
  var totalNeto = 0, totalIVA = 0, totalMonto = 0;
  
  for (var i = 0; i < lineas.length; i++) {
    var ln = lineas[i];
    var neto = Math.round(parseFloat(ln.neto) || 0);
    var iva = Math.round(parseFloat(ln.iva) || 0);
    var total = Math.round(parseFloat(ln.total) || 0);
    if (total === 0) continue;
    
    var rutLimpio = limpiarRUT(ln.rut);
    asegurarAuxiliar_(rutLimpio, ln.razonSocial || 'CLIENTE TRANSBANK', 'CLIENTE');
    
    // Construir fila para Ventas_SII
    var newRow = [];
    for (var c = 0; c <= Math.max(cols.TOTAL, colCent); c++) newRow.push('');
    newRow[cols.TIPO] = 48;
    newRow[cols.RUT] = formatearRUT(rutLimpio);
    newRow[cols.RAZON] = ln.razonSocial || '';
    newRow[cols.FOLIO] = ln.referencia || ('TB-' + mes + '-' + (i + 1));
    newRow[cols.FECHA] = ln.fecha || new Date(año, mes - 1, new Date(año, mes, 0).getDate());
    newRow[cols.NETO] = neto;
    newRow[cols.IVA] = iva;
    newRow[cols.TOTAL] = total;
    newRow[colCent] = 'S';
    
    sheetVentas.appendRow(newRow);
    rowsInsertados.push(sheetVentas.getLastRow());
    
    totalNeto += neto;
    totalIVA += iva;
    totalMonto += total;
  }
  
  if (totalMonto === 0) return { success: false, error: 'Monto total es $0' };
  
  // 2. Construir líneas del comprobante (una línea DEBE por cada voucher con auxiliar)
  var lineasComp = [];
  
  for (var i = 0; i < lineas.length; i++) {
    var ln = lineas[i];
    var total = Math.round(parseFloat(ln.total) || 0);
    if (total === 0) continue;
    var rutLimpio = limpiarRUT(ln.rut);
    var folio = ln.referencia || ('TB-' + mes + '-' + (i + 1));
    
    lineasComp.push({
      cuenta: ctaClientesTB,
      debe: total,
      haber: 0,
      glosa: (ln.razonSocial || 'Transbank') + ' VT ' + folio,
      auxiliar: rutLimpio,
      tipoDoc: 'VT',
      numDoc: folio,
      fechaDoc: ln.fecha || new Date(año, mes - 1, new Date(año, mes, 0).getDate()),
      refTipo: 'VT',
      refNum: folio
    });
  }
  
  // HABER: IVA Débito (resumen)
  if (totalIVA > 0) {
    lineasComp.push({
      cuenta: ctaIVADebito,
      debe: 0,
      haber: totalIVA,
      glosa: 'IVA Débito Transbank ' + mes + '/' + año
    });
  }
  
  // HABER: Ventas (resumen)
  if (totalNeto > 0) {
    lineasComp.push({
      cuenta: ctaVentas,
      debe: 0,
      haber: totalNeto,
      glosa: 'Ventas Transbank ' + mes + '/' + año
    });
  }
  
  // Verificar cuadratura
  var tDebe = 0, tHaber = 0;
  for (var i = 0; i < lineasComp.length; i++) {
    tDebe += lineasComp[i].debe || 0;
    tHaber += lineasComp[i].haber || 0;
  }
  if (Math.abs(tDebe - tHaber) > 1) {
    for (var i = rowsInsertados.length - 1; i >= 0; i--) sheetVentas.deleteRow(rowsInsertados[i]);
    return { success: false, error: 'Descuadre: Debe=' + tDebe + ' Haber=' + tHaber };
  }
  
  // 3. Crear comprobante
  var tiposComp = getTiposComprobante();
  var ultimoDia = new Date(año, mes, 0).getDate();
  
  var compResult = crearComprobante({
    tipo: tiposComp.TRASPASO,
    fecha: new Date(año, mes - 1, ultimoDia),
    glosa: 'Centralización Transbank ' + mes + '/' + año,
    lineas: lineasComp
  });
  
  if (!compResult.success) {
    // Rollback
    for (var i = rowsInsertados.length - 1; i >= 0; i--) sheetVentas.deleteRow(rowsInsertados[i]);
    return { success: false, error: 'Error creando comprobante: ' + compResult.error };
  }
  
  // 4. Registrar centralización
  registrarCentralizacion_('transbank', año, mes, compResult, lineas.length, totalMonto);
  
  invalidarCache();
  return {
    success: true,
    comprobante: compResult.id,
    documentos: lineas.length,
    totalNeto: totalNeto,
    totalIVA: totalIVA,
    totalMonto: totalMonto
  };
}

/**
 * Elimina entradas Transbank de Ventas_SII para un mes específico.
 * Se usa al revertir centralización.
 */
function eliminarTransbankDeVentas_(año, mes) {
  var ss = getSS();
  var sheets = getSheetNames();
  var sheet = buscarHoja(ss, sheets.VENTAS);
  if (!sheet) return;
  
  var data = sheet.getDataRange().getValues();
  var cols = getColumnasLibro('VENTAS');
  var filasEliminar = [];
  
  for (var i = 1; i < data.length; i++) {
    var tipoDTE = parseInt(data[i][cols.TIPO]);
    if (tipoDTE !== 48) continue;
    var fecha = parseFecha_(data[i][cols.FECHA]);
    if (!fecha) continue;
    if (fecha.getFullYear() === año && fecha.getMonth() + 1 === mes) {
      filasEliminar.push(i + 1);
    }
  }
  
  // Eliminar de abajo hacia arriba
  for (var i = filasEliminar.length - 1; i >= 0; i--) {
    sheet.deleteRow(filasEliminar[i]);
  }
}

// =============================================================================
// CUENTAS PARA SELECTOR
// =============================================================================

function getCuentasParaCentralizacion(tipo) {
  var cuentas = getCuentasMovimiento();
  var resultado = [];
  for (var i = 0; i < cuentas.length; i++) {
    var c = cuentas[i];
    if (tipo === 'ventas' && c.tipo === 'I') resultado.push({ codigo: c.codigo, nombre: c.nombre });
    else if (tipo === 'compras' && c.tipo === 'G') resultado.push({ codigo: c.codigo, nombre: c.nombre });
    else if (tipo === 'honorarios' && c.tipo === 'G') resultado.push({ codigo: c.codigo, nombre: c.nombre });
    else if (tipo === 'boletas_ventas' && c.tipo === 'I') resultado.push({ codigo: c.codigo, nombre: c.nombre });
    else if (tipo === 'transbank' && c.tipo === 'I') resultado.push({ codigo: c.codigo, nombre: c.nombre });
  }
  return resultado;
}

// =============================================================================
// HISTORIAL Y ANULACIÓN
// =============================================================================

function registrarCentralizacion_(tipo, año, mes, comprobante, cantDocs, monto) {
  var ss = getSS();
  var sheets = getSheetNames();
  var sheet = buscarHoja(ss, sheets.CENTRALIZACIONES);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheets.CENTRALIZACIONES);
    sheet.appendRow(['ID', 'FECHA', 'TIPO', 'AÑO', 'MES', 'COMPROBANTE', 'DOCUMENTOS', 'MONTO', 'USUARIO', 'ESTADO']);
  }
  
  sheet.appendRow([
    'CENT-' + Date.now(), new Date(), tipo, año, mes,
    comprobante.id, cantDocs, monto,
    Session.getActiveUser().getEmail() || 'Sistema', 'ACTIVO'
  ]);
}

function getHistorialCentralizaciones_(año) {
  var ss = getSS();
  var sheets = getSheetNames();
  var sheet = buscarHoja(ss, sheets.CENTRALIZACIONES);
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  var historial = [];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var regAño = parseInt(row[3]);
    if (año && regAño !== año) continue;
    
    historial.push({
      id: row[0], fecha: row[1], tipo: row[2],
      año: regAño, mes: parseInt(row[4]),
      nombreMes: getNombreMes(parseInt(row[4])),
      comprobante: row[5], documentos: parseInt(row[6]) || 0,
      monto: parseFloat(row[7]) || 0, usuario: row[8], estado: row[9]
    });
  }
  
  historial.sort(function(a, b) { return new Date(b.fecha) - new Date(a.fecha); });
  return historial;
}

function anularCentralizacion_(idCentralizacion) {
  validarAccesoEscritura_();
  var ss = getSS();
  var sheets = getSheetNames();
  var sheet = buscarHoja(ss, sheets.CENTRALIZACIONES);
  if (!sheet) return { success: false, error: 'Hoja no encontrada' };
  
  var data = sheet.getDataRange().getValues();
  
  var idBusc = String(idCentralizacion).trim();
  
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === idBusc) {
      var estadoCent = String(data[i][9] || '').toUpperCase().trim();
      if (estadoCent === 'ANULADO') return { success: false, error: 'Ya está anulada' };
      
      var compId = String(data[i][5] || '').trim();
      var tipo = String(data[i][2]).toLowerCase();
      var año = parseInt(data[i][3]);
      var mes = parseInt(data[i][4]);
      
      // 1. Anular comprobante asociado
      if (compId) {
        var resAnul = anularComprobante(compId, 'Reversión centralización ' + tipo + ' ' + mes + '/' + año, true);
        if (!resAnul.success) return { success: false, error: 'Error anulando comprobante: ' + resAnul.error };
        
        // 2. Eliminar comprobante + movimientos (limpio, sin basura en los reportes)
        var resElim = eliminarComprobante(compId);
        if (!resElim.success) return { success: false, error: 'Error eliminando comprobante: ' + resElim.error };
      }
      
      // 3. Desmarcar documentos (para poder re-centralizar)
      if (tipo === 'transbank') {
        // Transbank: eliminar entradas de Ventas_SII (tipoDTE=48)
        eliminarTransbankDeVentas_(año, mes);
      } else {
        desmarcarCentralizados_(tipo, año, mes);
      }
      
      // 4. Marcar centralización como ANULADO
      sheet.getRange(i + 1, 10).setValue('ANULADO');
      
      invalidarCache();
      return { 
        success: true, 
        mensaje: 'Centralización revertida. Comprobante ' + compId + ' eliminado. Documentos desmarcados para re-centralización.'
      };
    }
  }
  return { success: false, error: 'Centralización no encontrada' };
}

// =============================================================================
// MARCADO DE DOCUMENTOS
// =============================================================================

function marcarCentralizados_(tipo, rowIndices) {
  var ss = getSS();
  var sheets = getSheetNames();
  var sheetKey = resolverSheetKey_(tipo);
  var sheet = buscarHoja(ss, sheets[sheetKey]);
  if (!sheet) return;
  
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colCent = getColCentralizado(sheet, headers);
  
  for (var i = 0; i < rowIndices.length; i++) {
    sheet.getRange(rowIndices[i], colCent + 1).setValue('S');
  }
}

function desmarcarCentralizados_(tipo, año, mes) {
  var ss = getSS();
  var sheets = getSheetNames();
  var sheetKey = resolverSheetKey_(tipo);
  var sheet = buscarHoja(ss, sheets[sheetKey]);
  if (!sheet) return;
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var colCent = -1;
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).toUpperCase().trim() === 'CENTRALIZADO') { colCent = i; break; }
  }
  if (colCent === -1) return;
  
  var tipoUpper = tipo.toUpperCase();
  var cols = getColumnasLibro(tipoUpper);
  
  // COMPRAS: usar fecha recepción para identificar el mes correcto
  var colFechaRecep = (tipoUpper === 'COMPRAS') ? detectarColumnaFechaRecep(headers) : -1;
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][colCent] !== 'S') continue;
    var fecha = getFechaLibro_(data[i], cols, tipoUpper, colFechaRecep);
    if (!fecha) continue;
    if (fecha.getFullYear() === año && fecha.getMonth() + 1 === mes) {
      sheet.getRange(i + 1, colCent + 1).setValue('');
    }
  }
}

// =============================================================================
// UTILIDADES INTERNAS (no duplicadas del Core)
// =============================================================================

function asegurarAuxiliar_(rut, nombre, tipo) {
  var rutLimpio = limpiarRUT(rut);
  if (!rutLimpio) return;
  if (getAuxiliar(rutLimpio)) return; // ya existe
  try {
    crearAuxiliar({ rut: rutLimpio, nombre: nombre || '', tipo: tipo || 'OTRO', plazoPago: 30 });
  } catch(e) {
    Logger.log('⚠️ No se pudo crear auxiliar: ' + rutLimpio + ' - ' + e.message);
  }
}

function parseFecha_(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor;
  var str = String(valor).trim();
  var m1 = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) return new Date(parseInt(m1[3]), parseInt(m1[2]) - 1, parseInt(m1[1]));
  var m2 = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m2) return new Date(parseInt(m2[1]), parseInt(m2[2]) - 1, parseInt(m2[3]));
  var f = new Date(valor);
  return isNaN(f.getTime()) ? null : f;
}

function fmtFecha_(fecha) {
  if (!fecha) return '';
  var d = fecha.getDate(), m = fecha.getMonth() + 1, y = fecha.getFullYear();
  return (d < 10 ? '0' : '') + d + '/' + (m < 10 ? '0' : '') + m + '/' + y;
}