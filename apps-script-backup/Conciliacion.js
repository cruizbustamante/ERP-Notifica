/**
 * ============================================================================
 * CONCILIACION_BANCARIA.gs - Contabilización desde Cartola Bancaria
 * ============================================================================
 * Lee movimientos de cartola, permite contabilizar con lógica Core,
 * busca documentos pendientes para pagos/cobranzas (mecánica REF),
 * soporta contabilización batch y tracking por comprobante.
 * 
 * DEPENDENCIAS CORE: getSS, getSheetNames, buscarHoja, getConfig,
 *   getCuenta, getCuentasMovimiento, getCuentasParaSelector,
 *   getAuxiliar, crearAuxiliar, buscarAuxiliares, limpiarRUT,
 *   getTiposComprobante, crearComprobante, anularComprobante,
 *   getSaldosPorDocumento, getNombreMes, periodoEstaAbierto,
 *   invalidarCache, toClient
 * ============================================================================
 */

// =============================================================================
// CONSTANTES - Mapeo de columnas Cartolas
// =============================================================================

var CART = {
  MONTO: 0, DESC: 1, FECHA: 2, SALDO: 3, NDOC: 4,
  SUCURSAL: 5, TIPO: 6, COD_CONTABLE: 7, NOMBRE: 8,
  CONTABILIZADO: 9, ID_COMPROBANTE: 10, CATEGORIA_FLUJO: 11
};

var CART_HEADERS_EXTRA = ['CONTABILIZADO', 'ID_COMPROBANTE', 'CATEGORIA_FLUJO'];

// =============================================================================
// FUNCIONES UI (llamadas desde frontend)
// =============================================================================

/**
 * Datos iniciales para el módulo
 */
function getDataCartolaBancariaUI(año) {
  var config = getConfig();
  var cuentaBanco = config.CUENTA_BANCO || '1-1-01-002';
  if (!año) año = new Date().getFullYear();
  
  var resumenMeses = getResumenCartolaPorMes_(año);
  
  return toClient({
    cuentaBanco: cuentaBanco,
    empresaNombre: config.EMPRESA_NOMBRE || '',
    año: año,
    meses: resumenMeses.meses,
    totales: resumenMeses.totales,
    categoriasFlujo: getCategoriasFlujoCash()
  });
}

/**
 * Movimientos de cartola para un mes con estado de contabilización
 */
function getMovimientosCartolaUI(año, mes) {
  var movs = getMovimientosCartola_(año, mes);
  return toClient(movs);
}

/**
 * Cuentas agrupadas para selector de contrapartida
 */
function getCuentasContabUI() {
  return toClient(getCuentasParaSelector());
}

/**
 * Verifica si una cuenta requiere auxiliar/documento
 */
function verificarAtributosCuentaUI(codigo) {
  var cuenta = getCuenta(codigo);
  if (!cuenta) return toClient({ existe: false });
  return toClient({
    existe: true,
    codigo: cuenta.codigo,
    nombre: cuenta.nombre,
    requiereAuxiliar: cuenta.requiereAuxiliar === true,
    requiereDocumento: cuenta.requiereDocumento === true,
    afectaEfe: cuenta.afectaEfe === true
  });
}

/**
 * Buscar auxiliares por texto (para autocomplete)
 */
function buscarAuxiliaresCartolaUI(texto) {
  return toClient(buscarAuxiliares(texto, 10));
}

/**
 * Documentos pendientes de un auxiliar en una cuenta (CxC o CxP)
 */
function getDocsPendientesCartUI(codigoCuenta, auxiliar) {
  var resultado = getSaldosPorDocumento(codigoCuenta, auxiliar, null);
  return toClient(resultado);
}

function getCuentasMovimientoUI() {
  var ctas = getCuentasMovimiento();
  var config = getConfig();
  var result = [];
  for (var i = 0; i < ctas.length; i++) {
    result.push({ codigo: ctas[i].codigo, nombre: ctas[i].nombre });
  }
  return toClient({ cuentas: result, defaultAjuste: config.CUENTA_AJUSTE_SENCILLO || '5-2-02-024' });
}

/**
 * Contabilizar lote de movimientos
 * @param {Array} movimientos - [{rowIndex, tipoContab, cuentaContra, auxiliar, glosa, docs:[{tipoDoc, numDoc, monto}]}]
 */
function contabilizarLoteUI(movimientos) {
  var resultado = contabilizarLote_(movimientos);
  return toClient(resultado);
}

/**
 * Anular contabilización de un movimiento
 */
function anularContabCartUI(rowIndex) {
  var resultado = anularContabilizacionCart_(rowIndex);
  return toClient(resultado);
}

// =============================================================================
// LECTURA DE CARTOLA
// =============================================================================

/**
 * Asegura que existan las columnas de tracking en Cartolas
 */
function asegurarColumnasCartola_(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var lastCol = headers.length;
  
  // Buscar si ya existen
  var colContab = -1, colComp = -1, colFlujo = -1;
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).toUpperCase().trim();
    if (h === 'CONTABILIZADO') colContab = i;
    if (h === 'ID_COMPROBANTE') colComp = i;
    if (h === 'CATEGORIA_FLUJO') colFlujo = i;
  }
  
  // Agregar si no existen
  if (colContab === -1) {
    colContab = lastCol;
    sheet.getRange(1, lastCol + 1).setValue('CONTABILIZADO');
    lastCol++;
  }
  if (colComp === -1) {
    colComp = lastCol;
    sheet.getRange(1, lastCol + 1).setValue('ID_COMPROBANTE');
    lastCol++;
  }
  if (colFlujo === -1) {
    colFlujo = lastCol;
    sheet.getRange(1, lastCol + 1).setValue('CATEGORIA_FLUJO');
    lastCol++;
  }
  
  return { colContab: colContab, colComp: colComp, colFlujo: colFlujo };
}

/**
 * Resumen por mes para dashboard
 */
function getResumenCartolaPorMes_(año) {
  var ss = getSS();
  var sheets = getSheetNames();
  var sheet = buscarHoja(ss, sheets.CARTOLA);
  if (!sheet) return { meses: [], totales: { pendientes: 0, contabilizados: 0, montoPend: 0, montoContab: 0 } };
  
  var cols = asegurarColumnasCartola_(sheet);
  var data = sheet.getDataRange().getValues();
  
  var porMes = {};
  for (var m = 1; m <= 12; m++) {
    porMes[m] = { mes: m, nombre: getNombreMes(m), pendientes: 0, contabilizados: 0, 
                  abonos: 0, cargos: 0, montoPend: 0, montoContab: 0 };
  }
  
  var totPend = 0, totContab = 0, mPend = 0, mContab = 0;
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var fecha = parseFechaCart_(row[CART.FECHA]);
    if (!fecha || fecha.getFullYear() !== año) continue;
    
    var mes = fecha.getMonth() + 1;
    var monto = Math.abs(parseFloat(row[CART.MONTO]) || 0);
    var esAbono = String(row[CART.TIPO]).toUpperCase().trim() === 'A';
    var contab = String(row[cols.colContab] || '').toUpperCase().trim() === 'S';
    
    if (esAbono) porMes[mes].abonos += monto;
    else porMes[mes].cargos += monto;
    
    if (contab) {
      porMes[mes].contabilizados++;
      porMes[mes].montoContab += monto;
      totContab++; mContab += monto;
    } else {
      porMes[mes].pendientes++;
      porMes[mes].montoPend += monto;
      totPend++; mPend += monto;
    }
  }
  
  var meses = [];
  for (var m = 1; m <= 12; m++) meses.push(porMes[m]);
  
  return {
    meses: meses,
    totales: { pendientes: totPend, contabilizados: totContab, montoPend: mPend, montoContab: mContab }
  };
}

/**
 * Movimientos de un mes específico
 */
function getMovimientosCartola_(año, mes) {
  var ss = getSS();
  var sheets = getSheetNames();
  var sheet = buscarHoja(ss, sheets.CARTOLA);
  if (!sheet) return { movimientos: [], resumen: {} };
  
  var cols = asegurarColumnasCartola_(sheet);
  var data = sheet.getDataRange().getValues();
  var movimientos = [];
  var totAbono = 0, totCargo = 0, pend = 0, contab = 0;
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var fecha = parseFechaCart_(row[CART.FECHA]);
    if (!fecha || fecha.getFullYear() !== año) continue;
    if (mes && fecha.getMonth() + 1 !== mes) continue;
    
    var monto = parseFloat(row[CART.MONTO]) || 0;
    var montoAbs = Math.abs(monto);
    var esAbono = String(row[CART.TIPO]).toUpperCase().trim() === 'A';
    var contabilizado = String(row[cols.colContab] || '').toUpperCase().trim() === 'S';
    var idComprobante = row[cols.colComp] || '';
    var descripcion = String(row[CART.DESC] || '');
    
    // Extraer RUT de la descripción
    var rutExtraido = extraerRUTDeDesc_(descripcion);
    // Extraer nombre (quitar RUT y prefijo)
    var nombreExtraido = extraerNombreDeDesc_(descripcion);
    
    movimientos.push({
      rowIndex: i + 1, // 1-based for sheet operations
      fecha: formatFechaCart_(fecha),
      fechaRaw: fecha.toISOString(),
      monto: montoAbs,
      esAbono: esAbono,
      saldo: parseFloat(row[CART.SALDO]) || 0,
      descripcion: descripcion,
      nDoc: row[CART.NDOC] || '',
      sucursal: row[CART.SUCURSAL] || '',
      codContable: row[CART.COD_CONTABLE] || '',
      nombreBanco: row[CART.NOMBRE] || '',
      rutExtraido: rutExtraido,
      nombreExtraido: nombreExtraido,
      contabilizado: contabilizado,
      idComprobante: idComprobante
    });
    
    if (esAbono) totAbono += montoAbs; else totCargo += montoAbs;
    if (contabilizado) contab++; else pend++;
  }
  
  // Saldo banco = suma de columna A (Monto) de TODA la cartola (no filtrado por mes)
  var saldoBanco = 0;
  for (var s = 1; s < data.length; s++) {
    var montoS = parseFloat(data[s][CART.MONTO]) || 0;
    saldoBanco += montoS;
  }
  
  // Ordenar por fecha desc
  movimientos.sort(function(a, b) { return new Date(b.fechaRaw) - new Date(a.fechaRaw); });
  
  return {
    movimientos: movimientos,
    resumen: {
      totalAbonos: totAbono,
      totalCargos: totCargo,
      pendientes: pend,
      contabilizados: contab,
      total: movimientos.length,
      saldoBanco: saldoBanco
    }
  };
}

// =============================================================================
// CONTABILIZACIÓN
// =============================================================================

/**
 * Contabiliza un lote de movimientos de cartola
 * @param {Array} movimientos - Array de objetos con datos de contabilización
 */
function contabilizarLote_(movimientos) {
  validarAccesoEscritura_();
  if (!movimientos || movimientos.length === 0) {
    return { success: false, error: 'No hay movimientos para contabilizar' };
  }
  
  var ss = getSS();
  var sheets = getSheetNames();
  var sheet = buscarHoja(ss, sheets.CARTOLA);
  if (!sheet) return { success: false, error: 'Hoja Cartolas no encontrada' };
  
  var cols = asegurarColumnasCartola_(sheet);
  var config = getConfig();
  var tipos = getTiposComprobante();
  var cuentaBanco = config.CUENTA_BANCO || '1-1-01-002';
  var cuentaClientes = config.CUENTA_CLIENTES || '1-1-03-001';
  var cuentaClientesBol = config.CUENTA_CLIENTES_BOLETAS || '1-1-03-002';
  var cuentaProveedores = config.CUENTA_PROVEEDORES || '2-1-02-001';
  var cuentaHonPagar = config.CUENTA_HONORARIOS_PAGAR || '2-1-04-001';
  
  // =============================================
  // PRE-CARGAR: Cartola completa (verificar contabilizados)
  // =============================================
  var cartolaData = sheet.getDataRange().getValues();
  
  // Validación de saldos delegada a Core (crearComprobantesBatch_)
  
  // =============================================
  // PROCESAR MOVIMIENTOS
  // =============================================
  var resultados = [];
  var exitosos = 0, fallidos = 0;
  var marcasCartola = []; // [{rowIndex, contab, compId, flujo}]
  var batchDatos = [];    // Comprobantes a crear en batch
  var batchMovIdx = [];   // Índice en movimientos[] para cada batch item
  
  for (var m = 0; m < movimientos.length; m++) {
    var mov = movimientos[m];
    
    try {
      // Verificar si ya contabilizado (desde datos pre-cargados)
      var rowIdx = mov.rowIndex - 1; // 0-based
      if (rowIdx < cartolaData.length && String(cartolaData[rowIdx][cols.colContab] || '').toUpperCase().trim() === 'S') {
        resultados.push({ rowIndex: mov.rowIndex, success: false, error: 'Ya contabilizado' });
        fallidos++;
        continue;
      }
      
      var monto = parseFloat(mov.monto) || 0;
      var fecha = new Date(mov.fecha);
      var esAbono = mov.esAbono;
      var tipoContab = mov.tipoContab;
      var glosa = mov.glosa || mov.descripcion || '';
      
      // Construir líneas del comprobante
      var lineas = [];
      var tipoComp = '';
      
      if (tipoContab === 'COBRANZA') {
        tipoComp = tipos.INGRESO;
        var ctaCobroDefault = cuentaClientes;
        if (mov.cuentaCobro) {
          ctaCobroDefault = mov.cuentaCobro;
        } else if (mov.docs && mov.docs.length > 0) {
          var esBV = mov.docs[0].tipoDoc === 'BV';
          if (esBV) ctaCobroDefault = cuentaClientesBol;
        }
        
        lineas.push({
          cuenta: cuentaBanco, debe: monto, haber: 0,
          glosa: glosa, tipoDoc: 'DP', numDoc: String(mov.rowIndex)
        });
        
        if (mov.docs && mov.docs.length > 0) {
          for (var d = 0; d < mov.docs.length; d++) {
            var doc = mov.docs[d];
            var montoDoc = parseFloat(doc.monto) || monto;
            var ctaDoc = doc.cuentaOrigen || ctaCobroDefault;
            lineas.push({
              cuenta: ctaDoc, debe: 0, haber: montoDoc,
              glosa: 'Cobranza ' + doc.tipoDoc + ' ' + doc.numDoc,
              auxiliar: mov.auxiliar,
              tipoDoc: 'DP', numDoc: String(mov.rowIndex),
              refTipo: doc.tipoDoc || 'FAC', refNum: String(doc.numDoc)
            });
          }
          var hasLinAd = mov.lineasAdicionales && mov.lineasAdicionales.length > 0;
          if (!hasLinAd) {
            // Sin líneas adicionales → ajustar banco a total docs
            var totalDocs = 0;
            for (var d = 0; d < mov.docs.length; d++) totalDocs += (parseFloat(mov.docs[d].monto) || 0);
            lineas[0].debe = totalDocs;
          }
        } else {
          lineas.push({
            cuenta: ctaCobroDefault, debe: 0, haber: monto,
            glosa: glosa, auxiliar: mov.auxiliar,
            tipoDoc: 'DP', numDoc: String(mov.rowIndex)
          });
        }
        
      } else if (tipoContab === 'PAGO') {
        tipoComp = tipos.EGRESO;
        var ctaPagoDefault = cuentaProveedores;
        if (mov.cuentaPago) {
          ctaPagoDefault = mov.cuentaPago;
        } else if (mov.docs && mov.docs.length > 0) {
          var esBH = mov.docs[0].tipoDoc === 'BH';
          if (esBH) ctaPagoDefault = cuentaHonPagar;
        }
        
        if (mov.docs && mov.docs.length > 0) {
          var totalDocs = 0;
          for (var d = 0; d < mov.docs.length; d++) {
            var doc = mov.docs[d];
            var montoDoc = parseFloat(doc.monto) || monto;
            totalDocs += montoDoc;
            var ctaDoc = doc.cuentaOrigen || ctaPagoDefault;
            lineas.push({
              cuenta: ctaDoc, debe: montoDoc, haber: 0,
              glosa: 'Pago ' + doc.tipoDoc + ' ' + doc.numDoc,
              auxiliar: mov.auxiliar,
              tipoDoc: 'EG', numDoc: String(mov.rowIndex),
              refTipo: doc.tipoDoc || 'FAC', refNum: String(doc.numDoc)
            });
          }
          var hasLinAd = mov.lineasAdicionales && mov.lineasAdicionales.length > 0;
          lineas.push({
            cuenta: cuentaBanco, debe: 0, haber: hasLinAd ? monto : totalDocs,
            glosa: glosa, tipoDoc: 'EG', numDoc: String(mov.rowIndex)
          });
        } else {
          lineas.push({
            cuenta: ctaPagoDefault, debe: monto, haber: 0,
            glosa: glosa, auxiliar: mov.auxiliar,
            tipoDoc: 'EG', numDoc: String(mov.rowIndex)
          });
          lineas.push({
            cuenta: cuentaBanco, debe: 0, haber: monto,
            glosa: glosa, tipoDoc: 'EG', numDoc: String(mov.rowIndex)
          });
        }
        
      } else if (tipoContab === 'GASTO') {
        tipoComp = tipos.EGRESO;
        var refMode = mov.refMode || 'REGISTRO';
        
        if (refMode === 'REBAJA' && mov.docs && mov.docs.length > 0) {
          var totalDocs = 0;
          for (var d = 0; d < mov.docs.length; d++) {
            var doc = mov.docs[d];
            var montoDoc = parseFloat(doc.monto) || monto;
            totalDocs += montoDoc;
            lineas.push({
              cuenta: mov.cuentaContra, debe: montoDoc, haber: 0,
              glosa: 'Rebaja ' + doc.tipoDoc + ' ' + doc.numDoc,
              auxiliar: mov.auxiliar,
              tipoDoc: 'EG', numDoc: String(mov.rowIndex),
              refTipo: doc.tipoDoc, refNum: String(doc.numDoc)
            });
          }
          var hasLinAd = mov.lineasAdicionales && mov.lineasAdicionales.length > 0;
          lineas.push({
            cuenta: cuentaBanco, debe: 0, haber: hasLinAd ? monto : totalDocs,
            glosa: glosa, tipoDoc: 'EG', numDoc: String(mov.rowIndex)
          });
        } else {
          var regTipoDoc = mov.regTipoDoc || 'EG';
          var regNumDoc = mov.regNumDoc || String(mov.rowIndex);
          var lineaGasto = {
            cuenta: mov.cuentaContra, debe: monto, haber: 0,
            glosa: glosa, tipoDoc: regTipoDoc, numDoc: regNumDoc
          };
          if (mov.auxiliar) {
            lineaGasto.auxiliar = mov.auxiliar;
            lineaGasto.refTipo = regTipoDoc;
            lineaGasto.refNum = regNumDoc;
          }
          lineas.push(lineaGasto);
          lineas.push({
            cuenta: cuentaBanco, debe: 0, haber: monto,
            glosa: glosa, tipoDoc: regTipoDoc, numDoc: regNumDoc
          });
        }
        
      } else if (tipoContab === 'INGRESO') {
        tipoComp = tipos.INGRESO;
        var refMode = mov.refMode || 'REGISTRO';
        
        if (refMode === 'REBAJA' && mov.docs && mov.docs.length > 0) {
          lineas.push({
            cuenta: cuentaBanco, debe: monto, haber: 0,
            glosa: glosa, tipoDoc: 'DP', numDoc: String(mov.rowIndex)
          });
          for (var d = 0; d < mov.docs.length; d++) {
            var doc = mov.docs[d];
            var montoDoc = parseFloat(doc.monto) || monto;
            lineas.push({
              cuenta: mov.cuentaContra, debe: 0, haber: montoDoc,
              glosa: 'Rebaja ' + doc.tipoDoc + ' ' + doc.numDoc,
              auxiliar: mov.auxiliar,
              tipoDoc: 'DP', numDoc: String(mov.rowIndex),
              refTipo: doc.tipoDoc, refNum: String(doc.numDoc)
            });
          }
          var hasLinAd = mov.lineasAdicionales && mov.lineasAdicionales.length > 0;
          if (!hasLinAd) {
            // Sin líneas adicionales → ajustar banco a total docs
            var totalDocs = 0;
            for (var d = 0; d < mov.docs.length; d++) totalDocs += (parseFloat(mov.docs[d].monto) || 0);
            lineas[0].debe = totalDocs;
          }
        } else {
          var regTipoDoc = mov.regTipoDoc || 'DP';
          var regNumDoc = mov.regNumDoc || String(mov.rowIndex);
          lineas.push({
            cuenta: cuentaBanco, debe: monto, haber: 0,
            glosa: glosa, tipoDoc: regTipoDoc, numDoc: regNumDoc
          });
          var lineaIng = {
            cuenta: mov.cuentaContra, debe: 0, haber: monto,
            glosa: glosa, tipoDoc: regTipoDoc, numDoc: regNumDoc
          };
          if (mov.auxiliar) {
            lineaIng.auxiliar = mov.auxiliar;
            lineaIng.refTipo = regTipoDoc;
            lineaIng.refNum = regNumDoc;
          }
          lineas.push(lineaIng);
        }
        
      } else if (tipoContab === 'TRANSFERENCIA') {
        tipoComp = tipos.TRASPASO;
        if (esAbono) {
          lineas.push({ cuenta: cuentaBanco, debe: monto, haber: 0, glosa: glosa });
          lineas.push({ cuenta: mov.cuentaContra, debe: 0, haber: monto, glosa: glosa });
        } else {
          lineas.push({ cuenta: mov.cuentaContra, debe: monto, haber: 0, glosa: glosa });
          lineas.push({ cuenta: cuentaBanco, debe: 0, haber: monto, glosa: glosa });
        }
        
      } else {
        resultados.push({ rowIndex: mov.rowIndex, success: false, error: 'Tipo contabilización inválido: ' + tipoContab });
        fallidos++;
        continue;
      }
      
      // Asignar categoría de flujo a línea del banco
      if (mov.categoriaFlujo) {
        for (var lf = 0; lf < lineas.length; lf++) {
          if (lineas[lf].cuenta === cuentaBanco) {
            lineas[lf].categoriaFlujo = mov.categoriaFlujo;
          }
        }
      }
      
      // Agregar líneas adicionales (ej: comisión Transbank, retenciones, etc.)
      if (mov.lineasAdicionales && mov.lineasAdicionales.length > 0) {
        var tipoDocBase = esAbono ? 'DP' : 'EG';
        for (var la = 0; la < mov.lineasAdicionales.length; la++) {
          var lnAd = mov.lineasAdicionales[la];
          if (!lnAd.cuenta) continue;
          var debeAd = Math.round(parseFloat(lnAd.debe) || 0);
          var haberAd = Math.round(parseFloat(lnAd.haber) || 0);
          if (debeAd === 0 && haberAd === 0) continue;
          var lineaAd = {
            cuenta: lnAd.cuenta,
            debe: debeAd,
            haber: haberAd,
            glosa: lnAd.glosa || glosa
          };
          if (lnAd.auxiliar) {
            var auxLimpio = limpiarRUT(lnAd.auxiliar);
            lineaAd.auxiliar = auxLimpio;
            asegurarAuxiliar_(auxLimpio, '', '');
          }
          if (lnAd.refTipo && lnAd.refNum) {
            // REBAJA de documento existente
            lineaAd.tipoDoc = tipoDocBase;
            lineaAd.numDoc = String(mov.rowIndex);
            lineaAd.refTipo = lnAd.refTipo;
            lineaAd.refNum = String(lnAd.refNum);
          } else if (lnAd.tipoDoc && lnAd.numDoc) {
            // REGISTRO de documento nuevo
            lineaAd.tipoDoc = lnAd.tipoDoc;
            lineaAd.numDoc = String(lnAd.numDoc);
            lineaAd.refTipo = lnAd.tipoDoc;
            lineaAd.refNum = String(lnAd.numDoc);
          }
          lineas.push(lineaAd);
        }
      }
      
      // Acumular para escritura BATCH (no escribir aún)
      batchDatos.push({
        tipo: tipoComp, fecha: fecha, glosa: glosa, lineas: lineas,
        origen: 'CARTOLA', origenRef: 'ROW-' + mov.rowIndex,
        forzarDuplicados: true
      });
      batchMovIdx.push(m); // Índice en movimientos[] para mapear resultado
      
    } catch (e) {
      resultados.push({ rowIndex: mov.rowIndex, success: false, error: e.message });
      fallidos++;
    }
  }
  
  // ═══════════════════════════════════════════════════════
  // BATCH WRITE: Crear TODOS los comprobantes de una vez
  // ═══════════════════════════════════════════════════════
  if (batchDatos.length > 0) {
    var batchRes = crearComprobantesBatch_(batchDatos);
    
    for (var b = 0; b < batchRes.results.length; b++) {
      var res = batchRes.results[b];
      var movOrigIdx = batchMovIdx[b];
      var mov = movimientos[movOrigIdx];
      
      if (res.success) {
        marcasCartola.push({
          rowIndex: mov.rowIndex,
          contab: 'S',
          compId: res.comprobante.id,
          flujo: mov.categoriaFlujo || ''
        });
        resultados.push({
          rowIndex: mov.rowIndex, success: true,
          idComprobante: res.comprobante.id, numero: res.comprobante.numero
        });
        exitosos++;
      } else {
        resultados.push({ rowIndex: mov.rowIndex, success: false, error: res.error || 'Error' });
        fallidos++;
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════
  // BATCH WRITE: Marcar cartola de una vez (TRUE batch)
  // ═══════════════════════════════════════════════════════
  if (marcasCartola.length > 0) {
    // Agrupar en rangos contiguos para minimizar llamadas
    for (var w = 0; w < marcasCartola.length; w++) {
      var marca = marcasCartola[w];
      var row = marca.rowIndex;
      sheet.getRange(row, cols.colContab + 1).setValue(marca.contab);
      sheet.getRange(row, cols.colComp + 1).setValue(marca.compId);
      sheet.getRange(row, cols.colFlujo + 1).setValue(marca.flujo);
    }
    SpreadsheetApp.flush();
  }
  return {
    success: exitosos > 0,
    exitosos: exitosos,
    fallidos: fallidos,
    total: movimientos.length,
    resultados: resultados
  };
}

/**
 * Anular contabilización de un movimiento de cartola
 */
function anularContabilizacionCart_(rowIndex) {
  var ss = getSS();
  var sheets = getSheetNames();
  var sheet = buscarHoja(ss, sheets.CARTOLA);
  if (!sheet) return { success: false, error: 'Hoja Cartolas no encontrada' };
  
  var cols = asegurarColumnasCartola_(sheet);
  var row = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  var idComprobante = row[cols.colComp];
  if (!idComprobante) return { success: false, error: 'No tiene comprobante asociado' };
  
  // Anular comprobante via Core
  var resultado = anularComprobante(idComprobante, 'Anulación desde Cartola Bancaria', true);
  
  if (resultado.success) {
    // Desmarcar en Cartolas
    sheet.getRange(rowIndex, cols.colContab + 1).setValue('');
    sheet.getRange(rowIndex, cols.colComp + 1).setValue('');
    sheet.getRange(rowIndex, cols.colFlujo + 1).setValue('');
    return { success: true, mensaje: 'Comprobante ' + idComprobante + ' anulado' };
  }
  
  return resultado;
}

// =============================================================================
// MATCH AUTOMÁTICO
// =============================================================================

/**
 * Busca matches automáticos entre movimientos de cartola y documentos pendientes
 * Solo funciona en año abierto según Core
 */
function buscarMatchesAutomaticosUI(año, mes) {
  return toClient(buscarMatchesAutomaticos_(año, mes));
}

/**
 * Contabiliza los matches seleccionados (reutiliza contabilizarLote_)
 */
function contabilizarMatchesUI(matches) {
  return toClient(contabilizarLote_(matches));
}

function buscarMatchesAutomaticos_(año, mes) {
  if (!periodoEstaAbierto(año)) {
    return { success: false, error: 'El año ' + año + ' no está abierto', matches: [] };
  }
  
  var config = getConfig();
  var cuentaClientes = config.CUENTA_CLIENTES || '1-1-03-001';
  var cuentaClientesBol = config.CUENTA_CLIENTES_BOLETAS || '1-1-03-002';
  var cuentaProveedores = config.CUENTA_PROVEEDORES || '2-1-02-001';
  var cuentaHonPagar = config.CUENTA_HONORARIOS_PAGAR || '2-1-04-001';
  
  // Cuentas documento que participan en match
  var cuentasDoc = {};
  cuentasDoc[cuentaClientes] = 'CXC';
  cuentasDoc[cuentaClientesBol] = 'CXC';
  cuentasDoc[cuentaProveedores] = 'CXP';
  cuentasDoc[cuentaHonPagar] = 'CXP';
  
  var movData = getMovimientosCartola_(año, mes);
  var pendientes = [];
  for (var i = 0; i < movData.movimientos.length; i++) {
    var m = movData.movimientos[i];
    if (!m.contabilizado && m.rutExtraido) pendientes.push(m);
  }
  
  if (pendientes.length === 0) {
    return { success: true, matches: [], mensaje: 'No hay movimientos pendientes con RUT detectado' };
  }
  
  // Agrupar por RUT para saber qué RUTs buscar
  var porRUT = {};
  var rutsNecesarios = {};
  for (var i = 0; i < pendientes.length; i++) {
    var rut = limpiarRUT(pendientes[i].rutExtraido);
    if (!porRUT[rut]) porRUT[rut] = [];
    porRUT[rut].push(pendientes[i]);
    rutsNecesarios[rut] = true;
  }
  
  // =============================================
  // LEER DATOS UNA SOLA VEZ
  // =============================================
  var ss = getSS();
  var sheets = getSheetNames();
  var sheetMov = buscarHoja(ss, sheets.MOV_CONTABLES);
  var sheetComp = buscarHoja(ss, sheets.COMPROBANTES);
  var dataMov = sheetMov.getDataRange().getValues();
  var dataComp = sheetComp.getDataRange().getValues();
  
  // Comprobantes vigentes EXCLUYENDO apertura (enfoque Softland — sin filtro de año)
  var tipoApert = config.TIPO_COMP_APERTURA || getTiposComprobante().APERTURA || 'A';
  var compVigentes = {};
  for (var i = 1; i < dataComp.length; i++) {
    var tipo   = String(dataComp[i][1] || '').trim().toUpperCase();
    var estado = String(dataComp[i][10] || '').trim().toUpperCase();
    if (tipo !== tipoApert && estado !== 'ANULADO') {
      compVigentes[dataComp[i][0]] = true;
    }
  }
  
  // Plan cuentas para saber tipo (A/P)
  var planMap = {};
  var plan = getPlanCuentas(false);
  for (var i = 0; i < plan.length; i++) planMap[plan[i].codigo] = plan[i];
  
  // =============================================
  // CONSTRUIR MAPA DE DOCUMENTOS PENDIENTES EN UNA PASADA
  // =============================================
  // Estructura: { rut: { CXC: [docs], CXP: [docs] } }
  var docsTemp = {}; // { "rut|cuenta|refTipo|refNum": { cargos, abonos, ... } }
  
  for (var i = 1; i < dataMov.length; i++) {
    var row = dataMov[i];
    var ctaCod = String(row[3] || '').trim();
    if (!cuentasDoc[ctaCod]) continue;
    if (!compVigentes[row[1]]) continue;
    
    var auxRut = row[7] ? limpiarRUT(row[7]) : '';
    if (!auxRut || !rutsNecesarios[auxRut]) continue;
    
    var refTipo = row[11] || row[8];
    var refNum = row[12] || row[9];
    if (!refTipo || !refNum) continue;
    
    var clave = auxRut + '|' + ctaCod + '|' + refTipo + '|' + refNum;
    
    if (!docsTemp[clave]) {
      docsTemp[clave] = {
        auxiliar: auxRut, cuenta: ctaCod, tipoDoc: refTipo, numDoc: refNum,
        tipoCuenta: cuentasDoc[ctaCod], // CXC o CXP
        cargos: 0, abonos: 0
      };
    }
    
    docsTemp[clave].cargos += (parseFloat(row[4]) || 0);
    docsTemp[clave].abonos += (parseFloat(row[5]) || 0);
  }
  
  // Calcular saldos y agrupar por RUT
  // docsPorRUT: { rut: { CXC: [{doc}], CXP: [{doc}] } }
  var docsPorRUT = {};
  var claves = Object.keys(docsTemp);
  for (var k = 0; k < claves.length; k++) {
    var d = docsTemp[claves[k]];
    var ctaInfo = planMap[d.cuenta];
    var esActivo = ctaInfo && ctaInfo.tipo === 'A';
    var saldo = esActivo ? (d.cargos - d.abonos) : (d.abonos - d.cargos);
    if (Math.abs(saldo) < 1) continue;
    
    if (!docsPorRUT[d.auxiliar]) docsPorRUT[d.auxiliar] = { CXC: [], CXP: [] };
    
    var docObj = {
      tipoDoc: d.tipoDoc, numDoc: d.numDoc, saldo: saldo,
      auxiliar: d.auxiliar, _cuenta: d.cuenta
    };
    // Marcar cuenta origen
    if (d.tipoCuenta === 'CXC') {
      docObj._cuentaCobro = d.cuenta;
      docsPorRUT[d.auxiliar].CXC.push(docObj);
    } else {
      docObj._cuentaPago = d.cuenta;
      docsPorRUT[d.auxiliar].CXP.push(docObj);
    }
  }
  
  // =============================================
  // MATCHING
  // =============================================
  var matches = [];
  var rutsArr = Object.keys(porRUT);
  
  for (var r = 0; r < rutsArr.length; r++) {
    var rut = rutsArr[r];
    var movs = porRUT[rut];
    
    var aux = getAuxiliar(rut);
    if (!aux) continue;
    
    var rutDocs = docsPorRUT[rut];
    if (!rutDocs) continue;
    
    for (var m = 0; m < movs.length; m++) {
      var mov = movs[m];
      var monto = mov.monto;
      
      // ABONO (entra plata) → CxC / CARGO (sale plata) → CxP
      var docsPool, tipoContab, cuentaAux;
      if (mov.esAbono) {
        docsPool = rutDocs.CXC;
        tipoContab = 'COBRANZA';
        cuentaAux = cuentaClientes;
      } else {
        docsPool = rutDocs.CXP;
        tipoContab = 'PAGO';
        cuentaAux = cuentaProveedores;
      }
      
      if (!docsPool || docsPool.length === 0) continue;
      
      // 1) Match exacto
      var matchExacto = null;
      for (var d = 0; d < docsPool.length; d++) {
        var saldoDoc = Math.abs(parseFloat(docsPool[d].saldo) || 0);
        if (Math.abs(saldoDoc - monto) < 1) {
          matchExacto = docsPool[d];
          break;
        }
      }
      
      if (matchExacto) {
        var ctaMatch = matchExacto._cuentaPago || matchExacto._cuentaCobro || cuentaAux;
        matches.push({
          rowIndex: mov.rowIndex, esAbono: mov.esAbono, monto: monto,
          fecha: mov.fechaRaw, descripcion: mov.descripcion,
          auxiliar: rut, auxiliarNombre: aux.nombre || mov.nombreExtraido || '',
          cuentaAux: ctaMatch,
          cuentaPago: matchExacto._cuentaPago || '',
          cuentaCobro: matchExacto._cuentaCobro || '',
          tipoContab: tipoContab, matchTipo: 'EXACTO',
          categoriaFlujo: mov.esAbono ? 1 : (matchExacto._cuentaPago === cuentaHonPagar ? 4 : 2),
          docs: [{ tipoDoc: matchExacto.tipoDoc || 'FAC', numDoc: String(matchExacto.numDoc), monto: monto, saldoOriginal: Math.abs(parseFloat(matchExacto.saldo) || 0) }],
          glosa: (mov.esAbono ? 'Cobranza ' : 'Pago ') + (matchExacto.tipoDoc || 'FAC') + ' ' + matchExacto.numDoc + ' ' + aux.nombre
        });
        // Sacar doc del pool
        var idxUsado = docsPool.indexOf(matchExacto);
        if (idxUsado >= 0) docsPool.splice(idxUsado, 1);
        continue;
      }
      
      // 2) Match combinado
      var docsOrd = docsPool.slice().sort(function(a, b) {
        return Math.abs(parseFloat(b.saldo) || 0) - Math.abs(parseFloat(a.saldo) || 0);
      });
      var acum = 0, docsMatch = [];
      for (var d = 0; d < docsOrd.length; d++) {
        var sDoc = Math.abs(parseFloat(docsOrd[d].saldo) || 0);
        if (acum + sDoc <= monto + 1) {
          acum += sDoc;
          docsMatch.push({ tipoDoc: docsOrd[d].tipoDoc || 'FAC', numDoc: String(docsOrd[d].numDoc), monto: sDoc, saldoOriginal: sDoc, _ref: docsOrd[d] });
        }
        if (Math.abs(acum - monto) < 1) break;
      }
      
      if (docsMatch.length > 0 && Math.abs(acum - monto) < 1) {
        var docsDesc = docsMatch.map(function(d) { return d.tipoDoc + ' ' + d.numDoc; }).join(', ');
        var ctaMatchComb = docsOrd[0]._cuentaPago || docsOrd[0]._cuentaCobro || cuentaAux;
        matches.push({
          rowIndex: mov.rowIndex, esAbono: mov.esAbono, monto: monto,
          fecha: mov.fechaRaw, descripcion: mov.descripcion,
          auxiliar: rut, auxiliarNombre: aux.nombre || mov.nombreExtraido || '',
          cuentaAux: ctaMatchComb,
          cuentaPago: docsOrd[0]._cuentaPago || '',
          cuentaCobro: docsOrd[0]._cuentaCobro || '',
          tipoContab: tipoContab, matchTipo: 'COMBINADO',
          categoriaFlujo: mov.esAbono ? 1 : (ctaMatchComb === cuentaHonPagar ? 4 : 2),
          docs: docsMatch.map(function(d) { return { tipoDoc: d.tipoDoc, numDoc: d.numDoc, monto: d.monto, saldoOriginal: d.saldoOriginal }; }),
          glosa: (mov.esAbono ? 'Cobranza ' : 'Pago ') + docsDesc + ' ' + aux.nombre
        });
        // Sacar docs usados del pool
        for (var du = 0; du < docsMatch.length; du++) {
          if (docsMatch[du]._ref) {
            var idxU = docsPool.indexOf(docsMatch[du]._ref);
            if (idxU >= 0) docsPool.splice(idxU, 1);
          }
        }
      }
    }
  }
  
  // =============================================
  // 2. MATCH POR REGLAS (movimientos sin RUT)
  // =============================================
  var allPendientes = [];
  for (var i = 0; i < movData.movimientos.length; i++) {
    var m = movData.movimientos[i];
    if (!m.contabilizado) allPendientes.push(m);
  }
  
  var matchesRegla = aplicarReglasMatch_(allPendientes, año);
  
  // Combinar, evitando duplicados por rowIndex
  var rowsUsados = {};
  for (var i = 0; i < matches.length; i++) rowsUsados[matches[i].rowIndex] = true;
  for (var i = 0; i < matchesRegla.length; i++) {
    if (!rowsUsados[matchesRegla[i].rowIndex]) {
      matches.push(matchesRegla[i]);
    }
  }
  
  return { success: true, matches: matches, total: allPendientes.length };
}

// =============================================================================
// UTILIDADES
// =============================================================================

/**
 * Parsea fecha de cartola (puede ser Date, string ISO, dd/mm/yyyy, yyyy-mm-dd)
 */
function parseFechaCart_(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor;
  // Serial date de Google Sheets (número entero como 45678)
  if (typeof valor === 'number' && valor > 30000 && valor < 100000) {
    var epoch = new Date(1899, 11, 30);
    epoch.setDate(epoch.getDate() + valor);
    return epoch;
  }
  var str = String(valor).trim();
  // dd/mm/yyyy o dd-mm-yyyy
  var m1 = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) return new Date(parseInt(m1[3]), parseInt(m1[2]) - 1, parseInt(m1[1]));
  // dd/mm/yy
  var m1b = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (m1b) return new Date(2000 + parseInt(m1b[3]), parseInt(m1b[2]) - 1, parseInt(m1b[1]));
  // yyyy-mm-dd o yyyy/mm/dd (con posible hora T...)
  var m2 = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m2) return new Date(parseInt(m2[1]), parseInt(m2[2]) - 1, parseInt(m2[3]));
  var d = new Date(valor);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formatea fecha para display
 */
function formatFechaCart_(fecha) {
  if (!fecha) return '';
  var dd = ('0' + fecha.getDate()).slice(-2);
  var mm = ('0' + (fecha.getMonth() + 1)).slice(-2);
  return dd + '/' + mm + '/' + fecha.getFullYear();
}

/**
 * Extrae RUT de la descripción del movimiento bancario
 * Busca patrones como: 12.345.678-9, 12345678-9, o número largo al inicio
 */
function extraerRUTDeDesc_(desc) {
  if (!desc) return '';
  var str = String(desc);
  
  // ═══════════════════════════════════════════════════════
  // SOLO extraer RUT cuando tiene FORMATO EXPLÍCITO:
  //   - Con puntos y guión: 12.345.678-9
  //   - Con guión sin puntos: 12345678-9
  //   - Precedido por "RUT": RUT 123456789, RUT: 12345678-9
  // NUNCA tomar números sueltos → son referencias bancarias
  // ═══════════════════════════════════════════════════════
  
  // 1) Formato con puntos y guión: XX.XXX.XXX-X (SII estándar)
  var m1 = str.match(/(\d{1,2}\.\d{3}\.\d{3}-[\dkK])/);
  if (m1 && validarDVRut_(m1[1])) return m1[1];
  
  // 2) Formato con guión sin puntos: XXXXXXXX-X o XXXXXXX-X
  var m2 = str.match(/(\d{7,8}-[\dkK])/i);
  if (m2 && validarDVRut_(m2[1])) return m2[1];
  
  // 3) Precedido por "RUT" explícitamente: RUT 12345678-9 o RUT: 123456789
  var m3 = str.match(/RUT[:\s]+(\d[\d.\s]{5,10}[\dkK])/i);
  if (m3) {
    var rutCandidate = m3[1].replace(/[\.\s]/g, '');
    if (rutCandidate.indexOf('-') === -1 && rutCandidate.length >= 8) {
      rutCandidate = rutCandidate.slice(0, -1) + '-' + rutCandidate.slice(-1);
    }
    if (validarDVRut_(rutCandidate)) return rutCandidate;
  }
  
  // 4) Número RAW al INICIO de la descripción (9-10 dígitos, banco pone RUT del origen)
  //    Ej: "0126662203 Transf." → 12.666.220-3
  var m4 = str.match(/^0*(\d{7,9}[\dkK])\b/i);
  if (m4) {
    var raw = m4[1];
    if (raw.indexOf('-') === -1 && raw.length >= 8) {
      raw = raw.slice(0, -1) + '-' + raw.slice(-1);
    }
    if (validarDVRut_(raw)) return raw;
  }
  
  // NO extraer números sueltos en medio del texto
  return '';
}

/**
 * Valida el dígito verificador de un RUT chileno.
 * Acepta formatos: "12.345.678-9", "12345678-9", "123456789"
 * @param {string} rut 
 * @returns {boolean}
 */
function validarDVRut_(rut) {
  if (!rut) return false;
  var limpio = String(rut).replace(/[^0-9kK]/g, '').toUpperCase();
  if (limpio.length < 2) return false;
  var cuerpo = limpio.slice(0, -1);
  var dvIngresado = limpio.slice(-1);
  
  var suma = 0;
  var multiplicador = 2;
  for (var i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  var resto = suma % 11;
  var dvCalculado;
  if (resto === 0) dvCalculado = '0';
  else if (resto === 1) dvCalculado = 'K';
  else dvCalculado = String(11 - resto);
  
  return dvIngresado === dvCalculado;
}

/**
 * Extrae nombre de persona/empresa de la descripción
 */
function extraerNombreDeDesc_(desc) {
  if (!desc) return '';
  var str = String(desc);
  
  // Quitar RUT numérico del inicio
  str = str.replace(/^0*\d{7,10}\s+/, '');
  // Quitar prefijos comunes
  str = str.replace(/^(Transf\.|Transferencia|Transf|Pago Automático|COM\.|ABN CRD DB TRAN)\s*/i, '');
  // Quitar "de " o "a " al inicio
  str = str.replace(/^(de|a)\s+/i, '');
  // Quitar RUT con formato
  str = str.replace(/\d{1,2}\.\d{3}\.\d{3}-[\dkK]/g, '');
  // Limpiar
  str = str.replace(/Transf\.?\s*/gi, '').trim();
  
  return str || String(desc).substring(0, 50);
}

// =============================================================================
// REGLAS DE CONCILIACIÓN AUTOMÁTICA
// =============================================================================
//
// Permiten asignar cuenta/auxiliar/tipo a movimientos de cartola según patrón
// en la descripción. Ej: "MANTENCION PLAN" → COBRANZA de cliente X
//
// Hoja REGLAS_CONCILIACION:
//   ID | PATRON | TIPO_CONTAB | AUXILIAR | CUENTA_CONTRA | GLOSA_TEMPLATE | CATEGORIA_FLUJO | ACTIVA
//
// TIPO_CONTAB:
//   COBRANZA = abono banco → rebaja CxC (necesita auxiliar con docs pendientes)
//   PAGO     = cargo banco → rebaja CxP (necesita auxiliar con docs pendientes)
//   GASTO    = cargo banco → directo a cuenta_contra (sin docs)
//   INGRESO  = abono banco → directo a cuenta_contra (sin docs)
// =============================================================================

function getReglasUI()               { return toClient(getReglas_()); }
function guardarReglaUI(regla)       { return toClient(guardarRegla_(regla)); }
function eliminarReglaUI(id)         { return toClient(eliminarRegla_(id)); }

/**
 * Lee todas las reglas de conciliación
 */
function getReglas_() {
  var ss = getSS();
  var sheets = getSheetNames();
  var sheet = buscarHoja(ss, sheets.REGLAS_CONCILIACION);
  if (!sheet) {
    // Crear hoja si no existe
    sheet = ss.insertSheet(sheets.REGLAS_CONCILIACION);
    sheet.appendRow(['ID', 'PATRON', 'TIPO_CONTAB', 'AUXILIAR', 'CUENTA_CONTRA', 'GLOSA_TEMPLATE', 'CATEGORIA_FLUJO', 'ACTIVA']);
    return { reglas: [] };
  }
  
  var data = sheet.getDataRange().getValues();
  var reglas = [];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var auxiliar = String(row[3] || '').trim();
    var aux = auxiliar ? getAuxiliar(auxiliar) : null;
    
    reglas.push({
      id: String(row[0] || ''),
      patron: String(row[1] || ''),
      tipoContab: String(row[2] || '').toUpperCase(),
      auxiliar: auxiliar,
      auxiliarNombre: aux ? aux.nombre : '',
      cuentaContra: String(row[4] || ''),
      glosaTemplate: String(row[5] || ''),
      categoriaFlujo: parseInt(row[6]) || 0,
      activa: String(row[7] || 'S').toUpperCase() !== 'N',
      rowIndex: i + 1
    });
  }
  
  return { reglas: reglas };
}

/**
 * Guarda o actualiza una regla
 * @param {Object} regla - { id?, patron, tipoContab, auxiliar, cuentaContra, glosaTemplate, categoriaFlujo }
 */
function guardarRegla_(regla) {
  if (!regla.patron || !regla.patron.trim()) {
    return { success: false, error: 'El patrón es obligatorio' };
  }
  if (!regla.tipoContab) {
    return { success: false, error: 'El tipo de contabilización es obligatorio' };
  }
  
  // Validar: COBRANZA/PAGO necesitan auxiliar, GASTO/INGRESO necesitan cuentaContra
  var tipo = regla.tipoContab.toUpperCase();
  if ((tipo === 'COBRANZA' || tipo === 'PAGO') && !regla.auxiliar) {
    return { success: false, error: tipo + ' requiere un auxiliar (RUT)' };
  }
  if ((tipo === 'GASTO' || tipo === 'INGRESO') && !regla.cuentaContra) {
    return { success: false, error: tipo + ' requiere una cuenta contable' };
  }
  
  var ss = getSS();
  var sheets = getSheetNames();
  var sheet = buscarHoja(ss, sheets.REGLAS_CONCILIACION);
  if (!sheet) {
    sheet = ss.insertSheet(sheets.REGLAS_CONCILIACION);
    sheet.appendRow(['ID', 'PATRON', 'TIPO_CONTAB', 'AUXILIAR', 'CUENTA_CONTRA', 'GLOSA_TEMPLATE', 'CATEGORIA_FLUJO', 'ACTIVA']);
  }
  
  var cat = parseInt(regla.categoriaFlujo) || 0;
  if (!cat) {
    // Auto-asignar categoría por defecto
    if (tipo === 'COBRANZA') cat = 1;
    else if (tipo === 'PAGO') cat = 2;
    else if (tipo === 'GASTO') cat = 3;
    else if (tipo === 'INGRESO') cat = 1;
  }
  
  if (regla.id) {
    // Actualizar existente
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(regla.id)) {
        sheet.getRange(i + 1, 2, 1, 7).setValues([[
          regla.patron.trim(),
          tipo,
          limpiarRUT(regla.auxiliar) || '',
          regla.cuentaContra || '',
          regla.glosaTemplate || '',
          cat,
          'S'
        ]]);
        return { success: true, mensaje: 'Regla actualizada' };
      }
    }
    return { success: false, error: 'Regla no encontrada' };
  } else {
    // Nueva
    var id = 'R-' + Date.now();
    sheet.appendRow([
      id,
      regla.patron.trim(),
      tipo,
      limpiarRUT(regla.auxiliar) || '',
      regla.cuentaContra || '',
      regla.glosaTemplate || '',
      cat,
      'S'
    ]);
    return { success: true, id: id, mensaje: 'Regla creada' };
  }
}

/**
 * Elimina una regla
 */
function eliminarRegla_(id) {
  var ss = getSS();
  var sheets = getSheetNames();
  var sheet = buscarHoja(ss, sheets.REGLAS_CONCILIACION);
  if (!sheet) return { success: false, error: 'Hoja no encontrada' };
  
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, error: 'Regla no encontrada' };
}

// =============================================================================
// MATCH AUTOMÁTICO MEJORADO (con reglas)
// =============================================================================

/**
 * buscarMatchesAutomaticos_ MEJORADO:
 * 1. Match por RUT extraído (lógica original)
 * 2. Match por REGLAS de conciliación (nuevo)
 *    - COBRANZA/PAGO: busca docs pendientes del auxiliar configurado
 *    - GASTO/INGRESO: match directo contra cuenta, sin docs
 */
// Se reemplaza al final del buscarMatchesAutomaticos_ existente
// Las reglas se aplican DESPUÉS del match por RUT

function aplicarReglasMatch_(movsPendientes, año) {
  var config = getConfig();
  var cuentaClientes    = config.CUENTA_CLIENTES || '1-1-03-001';
  var cuentaClientesBol = config.CUENTA_CLIENTES_BOLETAS || '1-1-03-002';
  var cuentaProveedores = config.CUENTA_PROVEEDORES || '2-1-02-001';
  
  // Cargar reglas activas
  var reglasData = getReglas_();
  var reglas = (reglasData.reglas || []).filter(function(r) { return r.activa; });
  if (reglas.length === 0) return [];
  
  // Filtrar movimientos que NO fueron matcheados por RUT
  // (las reglas aplican como fallback para CUALQUIER mov sin match)
  var movsParaRegla = movsPendientes;
  if (movsParaRegla.length === 0) return [];
  
  // Matchear descripción contra patrones
  var matchesPorRegla = []; // { mov, regla }
  
  for (var m = 0; m < movsParaRegla.length; m++) {
    var mov = movsParaRegla[m];
    var descUpper = mov.descripcion.toUpperCase();
    
    for (var r = 0; r < reglas.length; r++) {
      var regla = reglas[r];
      var patronUpper = regla.patron.toUpperCase();
      
      if (descUpper.indexOf(patronUpper) !== -1) {
        // Match! Verificar coherencia tipo ↔ abono/cargo
        var tipoOk = false;
        if (mov.esAbono && (regla.tipoContab === 'COBRANZA' || regla.tipoContab === 'INGRESO')) tipoOk = true;
        if (!mov.esAbono && (regla.tipoContab === 'PAGO' || regla.tipoContab === 'GASTO')) tipoOk = true;
        
        if (tipoOk) {
          matchesPorRegla.push({ mov: mov, regla: regla });
          break; // Primera regla que matchea gana
        }
      }
    }
  }
  
  if (matchesPorRegla.length === 0) return [];
  
  // Para reglas COBRANZA/PAGO: necesitamos docs pendientes
  var rutsNecesarios = {};
  for (var i = 0; i < matchesPorRegla.length; i++) {
    var mr = matchesPorRegla[i];
    if (mr.regla.tipoContab === 'COBRANZA' || mr.regla.tipoContab === 'PAGO') {
      rutsNecesarios[limpiarRUT(mr.regla.auxiliar)] = true;
    }
  }
  
  // Leer docs pendientes para esos RUTs (una sola pasada)
  var docsPorRUT = {};
  if (Object.keys(rutsNecesarios).length > 0) {
    docsPorRUT = leerDocsPendientesPorRUT_(rutsNecesarios, año);
  }
  
  // Generar matches
  var matches = [];
  
  for (var i = 0; i < matchesPorRegla.length; i++) {
    var mr = matchesPorRegla[i];
    var mov = mr.mov;
    var regla = mr.regla;
    var monto = mov.monto;
    
    if (regla.tipoContab === 'COBRANZA' || regla.tipoContab === 'PAGO') {
      // ── COBRANZA/PAGO: buscar docs pendientes ──
      var rut = limpiarRUT(regla.auxiliar);
      var aux = getAuxiliar(rut);
      if (!aux) continue;
      
      var rutDocs = docsPorRUT[rut];
      if (!rutDocs) continue;
      
      var docsPool = regla.tipoContab === 'COBRANZA' ? (rutDocs.CXC || []) : (rutDocs.CXP || []);
      if (docsPool.length === 0) continue;
      
      // Match exacto
      var matchExacto = null;
      for (var d = 0; d < docsPool.length; d++) {
        var saldoDoc = Math.abs(parseFloat(docsPool[d].saldo) || 0);
        if (Math.abs(saldoDoc - monto) < 1) {
          matchExacto = docsPool[d];
          break;
        }
      }
      
      if (matchExacto) {
        var ctaMatch = matchExacto._cuentaCobro || matchExacto._cuentaPago || cuentaClientes;
        var glosa = regla.glosaTemplate || 
          (regla.tipoContab === 'COBRANZA' ? 'Cobranza ' : 'Pago ') + 
          matchExacto.tipoDoc + ' ' + matchExacto.numDoc + ' ' + aux.nombre;
        
        matches.push({
          rowIndex: mov.rowIndex, esAbono: mov.esAbono, monto: monto,
          fecha: mov.fechaRaw, descripcion: mov.descripcion,
          auxiliar: rut, auxiliarNombre: aux.nombre,
          cuentaAux: ctaMatch,
          cuentaCobro: matchExacto._cuentaCobro || '',
          cuentaPago: matchExacto._cuentaPago || '',
          tipoContab: regla.tipoContab, matchTipo: 'REGLA_EXACTO',
          categoriaFlujo: regla.categoriaFlujo,
          docs: [{ tipoDoc: matchExacto.tipoDoc, numDoc: String(matchExacto.numDoc), monto: monto, saldoOriginal: Math.abs(parseFloat(matchExacto.saldo) || 0) }],
          glosa: glosa, reglaPatron: regla.patron
        });
        var idx = docsPool.indexOf(matchExacto);
        if (idx >= 0) docsPool.splice(idx, 1);
        continue;
      }
      
      // Match combinado
      var docsOrd = docsPool.slice().sort(function(a, b) {
        return Math.abs(parseFloat(b.saldo) || 0) - Math.abs(parseFloat(a.saldo) || 0);
      });
      var acum = 0, docsMatch = [];
      for (var d = 0; d < docsOrd.length; d++) {
        var sDoc = Math.abs(parseFloat(docsOrd[d].saldo) || 0);
        if (acum + sDoc <= monto + 1) {
          acum += sDoc;
          docsMatch.push({ tipoDoc: docsOrd[d].tipoDoc, numDoc: String(docsOrd[d].numDoc), monto: sDoc, saldoOriginal: sDoc, _ref: docsOrd[d] });
        }
        if (Math.abs(acum - monto) < 1) break;
      }
      
      if (docsMatch.length > 0 && Math.abs(acum - monto) < 1) {
        var docsDesc = docsMatch.map(function(d) { return d.tipoDoc + ' ' + d.numDoc; }).join(', ');
        var ctaComb = docsOrd[0]._cuentaCobro || docsOrd[0]._cuentaPago || cuentaClientes;
        matches.push({
          rowIndex: mov.rowIndex, esAbono: mov.esAbono, monto: monto,
          fecha: mov.fechaRaw, descripcion: mov.descripcion,
          auxiliar: rut, auxiliarNombre: aux.nombre,
          cuentaAux: ctaComb,
          cuentaCobro: docsOrd[0]._cuentaCobro || '',
          cuentaPago: docsOrd[0]._cuentaPago || '',
          tipoContab: regla.tipoContab, matchTipo: 'REGLA_COMBINADO',
          categoriaFlujo: regla.categoriaFlujo,
          docs: docsMatch.map(function(d) { return { tipoDoc: d.tipoDoc, numDoc: d.numDoc, monto: d.monto, saldoOriginal: d.saldoOriginal }; }),
          glosa: regla.glosaTemplate || (regla.tipoContab === 'COBRANZA' ? 'Cobranza ' : 'Pago ') + docsDesc + ' ' + aux.nombre,
          reglaPatron: regla.patron
        });
        for (var du = 0; du < docsMatch.length; du++) {
          if (docsMatch[du]._ref) {
            var idxU = docsPool.indexOf(docsMatch[du]._ref);
            if (idxU >= 0) docsPool.splice(idxU, 1);
          }
        }
      }
      
    } else {
      // ── GASTO/INGRESO: match directo contra cuenta (sin docs) ──
      var rut2 = regla.auxiliar ? limpiarRUT(regla.auxiliar) : '';
      var aux2 = rut2 ? getAuxiliar(rut2) : null;
      var glosa2 = regla.glosaTemplate || mov.descripcion;
      
      matches.push({
        rowIndex: mov.rowIndex, esAbono: mov.esAbono, monto: monto,
        fecha: mov.fechaRaw, descripcion: mov.descripcion,
        auxiliar: rut2, auxiliarNombre: aux2 ? aux2.nombre : '',
        cuentaContra: regla.cuentaContra,
        tipoContab: regla.tipoContab, matchTipo: 'REGLA_DIRECTO',
        categoriaFlujo: regla.categoriaFlujo,
        docs: [],
        glosa: glosa2, reglaPatron: regla.patron
      });
    }
  }
  
  return matches;
}

/**
 * Lee docs pendientes por RUT (helper para reglas)
 * Retorna { rut: { CXC: [docs], CXP: [docs] } }
 */
function leerDocsPendientesPorRUT_(rutsNecesarios, año) {
  var config = getConfig();
  var cuentaClientes    = config.CUENTA_CLIENTES || '1-1-03-001';
  var cuentaClientesBol = config.CUENTA_CLIENTES_BOLETAS || '1-1-03-002';
  var cuentaProveedores = config.CUENTA_PROVEEDORES || '2-1-02-001';
  var cuentaHonPagar    = config.CUENTA_HONORARIOS_PAGAR || '2-1-04-001';
  var tipoApert         = config.TIPO_COMP_APERTURA || 'A';
  
  var cuentasDoc = {};
  cuentasDoc[cuentaClientes] = 'CXC';
  cuentasDoc[cuentaClientesBol] = 'CXC';
  cuentasDoc[cuentaProveedores] = 'CXP';
  cuentasDoc[cuentaHonPagar] = 'CXP';
  
  var ss = getSS();
  var sheets = getSheetNames();
  var sheetMov  = buscarHoja(ss, sheets.MOV_CONTABLES);
  var sheetComp = buscarHoja(ss, sheets.COMPROBANTES);
  var dataMov  = sheetMov.getDataRange().getValues();
  var dataComp = sheetComp.getDataRange().getValues();
  
  // Comprobantes vigentes (excluir apertura)
  var compVigentes = {};
  for (var i = 1; i < dataComp.length; i++) {
    var tipo   = String(dataComp[i][1] || '').trim().toUpperCase();
    var estado = String(dataComp[i][10] || '').trim().toUpperCase();
    if (tipo !== tipoApert && estado !== 'ANULADO') {
      compVigentes[dataComp[i][0]] = true;
    }
  }
  
  var planMap = {};
  var plan = getPlanCuentas(false);
  for (var i = 0; i < plan.length; i++) planMap[plan[i].codigo] = plan[i];
  
  var docsTemp = {};
  for (var i = 1; i < dataMov.length; i++) {
    var row = dataMov[i];
    var ctaCod = String(row[3] || '').trim();
    if (!cuentasDoc[ctaCod]) continue;
    if (!compVigentes[row[1]]) continue;
    
    var auxRut = row[7] ? limpiarRUT(row[7]) : '';
    if (!auxRut || !rutsNecesarios[auxRut]) continue;
    
    var refTipo = row[11] || row[8];
    var refNum  = row[12] || row[9];
    if (!refTipo || !refNum) continue;
    
    var clave = auxRut + '|' + ctaCod + '|' + refTipo + '|' + refNum;
    if (!docsTemp[clave]) {
      docsTemp[clave] = {
        auxiliar: auxRut, cuenta: ctaCod, tipoDoc: refTipo, numDoc: refNum,
        tipoCuenta: cuentasDoc[ctaCod],
        cargos: 0, abonos: 0
      };
    }
    docsTemp[clave].cargos += (parseFloat(row[4]) || 0);
    docsTemp[clave].abonos += (parseFloat(row[5]) || 0);
  }
  
  var docsPorRUT = {};
  var claves = Object.keys(docsTemp);
  for (var k = 0; k < claves.length; k++) {
    var d = docsTemp[claves[k]];
    var ctaInfo = planMap[d.cuenta];
    var esActivo = ctaInfo && ctaInfo.tipo === 'A';
    var saldo = esActivo ? (d.cargos - d.abonos) : (d.abonos - d.cargos);
    if (Math.abs(saldo) < 1) continue;
    
    if (!docsPorRUT[d.auxiliar]) docsPorRUT[d.auxiliar] = { CXC: [], CXP: [] };
    
    var docObj = {
      tipoDoc: d.tipoDoc, numDoc: d.numDoc, saldo: saldo,
      auxiliar: d.auxiliar, _cuenta: d.cuenta,
      _cuentaCobro: d.tipoCuenta === 'CXC' ? d.cuenta : '',
      _cuentaPago: d.tipoCuenta === 'CXP' ? d.cuenta : ''
    };
    
    if (d.tipoCuenta === 'CXC') {
      docsPorRUT[d.auxiliar].CXC.push(docObj);
    } else {
      docsPorRUT[d.auxiliar].CXP.push(docObj);
    }
  }
  
  return docsPorRUT;
}