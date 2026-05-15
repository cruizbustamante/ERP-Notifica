/**
 * ============================================================================
 * REPORTES_EXCEL.gs - Exportación RÁPIDA a Excel (.xlsx)
 * ============================================================================
 * OPTIMIZACIÓN: Escribe TODOS los datos en UNA sola llamada setValues().
 * Aplica formato a rangos completos, no celda por celda.
 * ============================================================================
 */

var CARPETA_REPORTES = 'Reportes_Contables';
var _lastReportData = null; // Cache en memoria del último reporte

/**
 * Exporta reporte a Excel. Reutiliza datos si ya fueron generados.
 */
function exportarReporteExcel(tipo, parametros) {
  try {
    // Consolidado tiene su propio flujo (múltiples hojas)
    if (tipo === 'consolidado') return exportarConsolidado(parametros);
    
    // Generar datos (o reutilizar)
    var data = exportarReporte(tipo, parametros);
    if (!data || data.error) return toClient({ error: data ? data.error : 'Sin datos' });

    var nombre = buildNombreExcel(tipo, parametros);
    var ss = SpreadsheetApp.create(nombre);
    var sheet = ss.getActiveSheet();
    sheet.setName(getHojaNombre(tipo));

    // Render con batch writes
    renderExcelBatch(sheet, tipo, data, parametros, ss);

    return toClient({
      url: 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx',
      nombre: nombre + '.xlsx',
      id: ss.getId()
    });
  } catch (e) {
    return toClient({ error: e.message });
  }
}

function getOCrearCarpetaReportes() {
  var folders = DriveApp.getFoldersByName(CARPETA_REPORTES);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(CARPETA_REPORTES);
}

function buildNombreExcel(tipo, p) {
  var nombres = {
    libro_diario: 'LibroDiario', libro_mayor: 'LibroMayor', balance_8: 'Balance8Col',
    estado_resultados: 'EstadoResultados', cxc: 'CxC', cxp: 'CxP',
    flujo_efectivo: 'FlujoEfectivo', eeff: 'EstadoSituacionFinanciera',
    libro_ventas: 'LibroVentas', libro_compras: 'LibroCompras', libro_honorarios: 'LibroHonorarios',
    consolidado: 'EEFF_Consolidado'
  };
  return (nombres[tipo] || 'Reporte') + '_' + (p.año || 2025) + (p.mes ? '_M' + p.mes : '');
}

function getHojaNombre(tipo) {
  var nombres = {
    libro_diario: 'Libro Diario', libro_mayor: 'Libro Mayor', balance_8: 'Balance 8 Col',
    estado_resultados: 'EERR', cxc: 'CxC', cxp: 'CxP',
    flujo_efectivo: 'EFE', eeff: 'Situación Financiera',
    libro_ventas: 'Ventas', libro_compras: 'Compras', libro_honorarios: 'Honorarios'
  };
  return nombres[tipo] || 'Reporte';
}

// =============================================================================
// ESTILOS - aplicados a RANGOS completos
// =============================================================================

var CLR = { header: '#2321a5', headerFont: '#ffffff', total: '#e8e7f8', zebra: '#f8fafc', border: '#d1d5db' };

function estiloHeader(sheet, fila, cols) {
  var r = sheet.getRange(fila, 1, 1, cols);
  r.setBackground(CLR.header).setFontColor(CLR.headerFont).setFontWeight('bold').setFontSize(10)
    .setHorizontalAlignment('center').setFontFamily('Arial');
}

function estiloTotal(sheet, fila, cols) {
  sheet.getRange(fila, 1, 1, cols).setBackground(CLR.total).setFontWeight('bold').setFontSize(10).setFontFamily('Arial');
}

function estiloTitulo(sheet, cols, titulo, subtitulo) {
  sheet.getRange(1, 1, 1, cols).merge().setValue(titulo).setFontSize(14).setFontWeight('bold').setFontColor(CLR.header).setHorizontalAlignment('center').setFontFamily('Arial');
  if (subtitulo) {
    sheet.getRange(2, 1, 1, cols).merge().setValue(subtitulo).setFontSize(10).setFontColor('#64748b').setHorizontalAlignment('center').setFontFamily('Arial');
  }
}

function aplicarFormatos(sheet, filaData, numFilas, colMonedaInicio, numColsMoneda, numColsTotal) {
  if (numFilas <= 0) return;
  // Moneda
  if (numColsMoneda > 0) {
    sheet.getRange(filaData, colMonedaInicio, numFilas, numColsMoneda).setNumberFormat('$#,##0');
  }
  // Bordes
  sheet.getRange(filaData - 1, 1, numFilas + 1, numColsTotal)
    .setBorder(true, true, true, true, true, true, CLR.border, SpreadsheetApp.BorderStyle.SOLID);
  // Zebra
  for (var i = 0; i < numFilas; i++) {
    if (i % 2 === 1) sheet.getRange(filaData + i, 1, 1, numColsTotal).setBackground(CLR.zebra);
  }
  // Auto-resize
  for (var c = 1; c <= numColsTotal; c++) sheet.autoResizeColumn(c);
}

// =============================================================================
// RENDER BATCH - Construye array completo → UNA llamada setValues
// =============================================================================

function renderExcelBatch(sheet, tipo, data, params, ss) {
  switch (tipo) {
    case 'libro_diario':      batchLibroDiario(sheet, data); break;
    case 'libro_mayor':       batchLibroMayor(sheet, data); break;
    case 'balance_8':         batchBalance8(sheet, data); break;
    case 'estado_resultados': batchEstadoResultados(sheet, data); break;
    case 'flujo_efectivo':    batchFlujoEfectivo(sheet, data); break;
    case 'libro_ventas':      batchLibroTributario(ss, sheet, data, data.ventas || [], 'Ventas', params); break;
    case 'libro_compras':     batchLibroTributario(ss, sheet, data, data.compras || [], 'Compras', params); break;
    case 'libro_honorarios':  batchLibroHonorarios(ss, sheet, data, params); break;
    case 'cxc':               batchCuentasPend(sheet, data, 'Cuentas por Cobrar'); break;
    case 'cxp':               batchCuentasPend(sheet, data, 'Cuentas por Pagar'); break;
    case 'eeff':              batchEstadoSituacion(sheet, data); break;
  }
}

// =============================================================================
// LIBRO DIARIO - BATCH
// =============================================================================

function batchLibroDiario(sheet, data) {
  var NC = 7;
  var per = data.periodo || {};
  var emp = data.empresa || {};
  estiloTitulo(sheet, NC, emp.nombre + ' - Libro Diario', (per.nombreMes || 'Anual') + ' ' + (per.año || ''));

  var headers = ['Fecha', 'Comprobante', 'Tipo', 'Cuenta', 'Glosa', 'Debe', 'Haber'];
  var rows = [];
  var comps = data.comprobantes || [];
  var boldRows = []; // índices relativos de filas bold

  for (var i = 0; i < comps.length; i++) {
    var c = comps[i];
    boldRows.push(rows.length);
    rows.push([fmtFechaGS(c.fecha), c.id || '', c.tipo || '', '', c.glosa || '', c.totalDebe || 0, c.totalHaber || 0]);
    var lineas = c.lineas || [];
    for (var j = 0; j < lineas.length; j++) {
      var l = lineas[j];
      rows.push(['', '', '', l.cuenta || '', l.glosa || '', l.debe || 0, l.haber || 0]);
    }
  }

  var tot = data.totales || {};
  rows.push(['', '', '', '', 'TOTALES', tot.debe || 0, tot.haber || 0]);

  // BATCH WRITE
  var filaInicio = 4;
  sheet.getRange(filaInicio, 1, 1, NC).setValues([headers]);
  estiloHeader(sheet, filaInicio, NC);

  if (rows.length > 0) {
    sheet.getRange(filaInicio + 1, 1, rows.length, NC).setValues(rows);
  }

  // Bold para headers de comprobante
  for (var i = 0; i < boldRows.length; i++) {
    sheet.getRange(filaInicio + 1 + boldRows[i], 1, 1, NC).setFontWeight('bold').setBackground('#f0f4ff');
  }

  // Total row
  estiloTotal(sheet, filaInicio + rows.length, NC);
  aplicarFormatos(sheet, filaInicio + 1, rows.length, 6, 2, NC);
}

// =============================================================================
// LIBRO MAYOR - BATCH
// =============================================================================

function batchLibroMayor(sheet, data) {
  var NC = 9; // Fecha, Comp, Auxiliar, TipoDoc, N°Doc, Debe, Haber, Saldo, Glosa
  var emp = data.empresa || {};
  estiloTitulo(sheet, NC, emp.nombre + ' - Libro Mayor',
    (data.titulo || '') + ' | ' + (data.nombreMesDesde || '') + ' a ' + (data.nombreMesHasta || ''));

  var headers = ['Fecha', 'Comprobante', 'Auxiliar', 'Tipo Doc', 'N° Doc', 'Debe', 'Haber', 'Saldo', 'Glosa'];

  if (data.esMultiple) {
    var fila = 4;
    var cuentas = data.cuentas || [];
    for (var i = 0; i < cuentas.length; i++) {
      var cta = cuentas[i];
      var rows = [];
      rows.push(['', '', '', '', 'Saldo Anterior', '', '', cta.saldoAnterior || 0, '']);
      var movs = cta.movimientos || [];
      for (var j = 0; j < movs.length; j++) {
        var m = movs[j];
        rows.push([fmtFechaGS(m.fecha), m.comprobante || '', m.auxiliar || '', m.tipoDoc || '', m.numDoc || '',
          m.debe || 0, m.haber || 0, m.saldo || 0, m.glosa || '']);
      }
      rows.push(['', '', '', '', 'TOTALES', cta.totalDebe || 0, cta.totalHaber || 0, cta.saldoFinal || 0, '']);

      // Section header
      sheet.getRange(fila, 1, 1, NC).merge().setValue((cta.codigo || cta.cuenta && cta.cuenta.codigo || '') + ' - ' + (cta.nombre || cta.cuenta && cta.cuenta.nombre || ''))
        .setFontWeight('bold').setBackground('#e8e7f8').setFontColor(CLR.header).setFontFamily('Arial');
      fila++;

      sheet.getRange(fila, 1, 1, NC).setValues([headers]);
      estiloHeader(sheet, fila, NC);
      fila++;

      if (rows.length > 0) {
        sheet.getRange(fila, 1, rows.length, NC).setValues(rows);
        sheet.getRange(fila, 1, 1, NC).setFontStyle('italic').setBackground('#fffbeb');
        estiloTotal(sheet, fila + rows.length - 1, NC);
        sheet.getRange(fila, 6, rows.length, 3).setNumberFormat('$#,##0');
        fila += rows.length + 1;
      }
    }
    for (var c = 1; c <= NC; c++) sheet.autoResizeColumn(c);
  } else {
    var rows = [];
    rows.push(['', '', '', '', 'Saldo Anterior', '', '', data.saldoAnterior || 0, '']);
    var movs = data.movimientos || [];
    for (var j = 0; j < movs.length; j++) {
      var m = movs[j];
      rows.push([fmtFechaGS(m.fecha), m.comprobante || '', m.auxiliar || '', m.tipoDoc || '', m.numDoc || '',
        m.debe || 0, m.haber || 0, m.saldo || 0, m.glosa || '']);
    }
    rows.push(['', '', '', '', 'TOTALES', data.totalDebe || 0, data.totalHaber || 0, data.saldoFinal || 0, '']);

    sheet.getRange(4, 1, 1, NC).setValues([headers]);
    estiloHeader(sheet, 4, NC);
    sheet.getRange(5, 1, rows.length, NC).setValues(rows);
    sheet.getRange(5, 1, 1, NC).setFontStyle('italic').setBackground('#fffbeb');
    estiloTotal(sheet, 5 + rows.length - 1, NC);
    aplicarFormatos(sheet, 5, rows.length, 6, 3, NC);
  }
}

// =============================================================================
// BALANCE 8 COLUMNAS - BATCH
// =============================================================================

function batchBalance8(sheet, data) {
  var NC = 10;
  var emp = data.empresa || {};
  estiloTitulo(sheet, NC, emp.nombre + ' - Balance de Comprobación 8 Columnas',
    'Año ' + (data.periodo ? data.periodo.año : '') + ' - Hasta ' + (data.nombreMes || 'Diciembre'));

  // Header doble
  var fila = 4;
  sheet.getRange(fila, 1, 1, 2).merge().setValue('');
  sheet.getRange(fila, 3, 1, 2).merge().setValue('Valores Acumulados').setHorizontalAlignment('center').setBackground('#f1f5f9').setFontWeight('bold');
  sheet.getRange(fila, 5, 1, 2).merge().setValue('Saldos').setHorizontalAlignment('center').setBackground('#f1f5f9').setFontWeight('bold');
  sheet.getRange(fila, 7, 1, 2).merge().setValue('Inventario').setHorizontalAlignment('center').setBackground('#f1f5f9').setFontWeight('bold');
  sheet.getRange(fila, 9, 1, 2).merge().setValue('Resultados').setHorizontalAlignment('center').setBackground('#f1f5f9').setFontWeight('bold');
  fila++;

  var headers = ['Cuenta Contable', '', 'Débitos', 'Créditos', 'Deudor', 'Acreedor', 'Activo', 'Pasivo', 'Pérdida', 'Ganancia'];
  sheet.getRange(fila, 1, 1, NC).setValues([headers]);
  estiloHeader(sheet, fila, NC);
  fila++;

  var cuentas = data.cuentas || [];
  var rows = [];

  for (var i = 0; i < cuentas.length; i++) {
    var c = cuentas[i];
    rows.push([c.codigo, c.nombre, c.debitos||0, c.creditos||0,
      c.deudor||0, c.acreedor||0, c.activo||0, c.pasivo||0, c.perdida||0, c.ganancia||0]);
  }

  if (rows.length > 0) {
    sheet.getRange(fila, 1, rows.length, NC).setValues(rows);
    fila += rows.length;
  }

  // Sub-Totales
  var tot = data.totales || {};
  sheet.getRange(fila, 1, 1, NC).setValues([['', 'Sub-Totales',
    tot.debitos||0, tot.creditos||0, tot.deudor||0, tot.acreedor||0,
    tot.activo||0, tot.pasivo||0, tot.perdida||0, tot.ganancia||0]]);
  sheet.getRange(fila, 1, 1, NC).setFontWeight('bold').setBackground('#f1f5f9');
  sheet.getRange(fila, 1, 1, NC).setBorder(true, null, true, null, null, null);
  fila++;

  // Pérdidas / Ganancias — cuadra cada par
  sheet.getRange(fila, 1, 1, NC).setValues([['', 'Pérdidas / Ganancias',
    '', '', '', '', data.pgActivo||0, data.pgPasivo||0, data.pgPerdida||0, data.pgGanancia||0]]);
  sheet.getRange(fila, 1, 1, NC).setFontWeight('bold').setBackground('#fffbeb');
  fila++;

  // Total General
  sheet.getRange(fila, 1, 1, NC).setValues([['', 'Total General',
    tot.debitos||0, tot.creditos||0, tot.deudor||0, tot.acreedor||0,
    (tot.activo||0) + (data.pgActivo||0), (tot.pasivo||0) + (data.pgPasivo||0),
    (tot.perdida||0) + (data.pgPerdida||0), (tot.ganancia||0) + (data.pgGanancia||0)]]);
  sheet.getRange(fila, 1, 1, NC).setFontWeight('bold').setFontSize(11)
    .setBackground('#0f172a').setFontColor('#f8fafc')
    .setBorder(true, null, true, null, null, null);

  // Formatos moneda
  var dataRows = fila - 5;
  sheet.getRange(6, 3, dataRows, 8).setNumberFormat('$#,##0');
  for (var c = 1; c <= NC; c++) sheet.autoResizeColumn(c);
}

// =============================================================================
// ESTADO DE RESULTADOS - BATCH
// =============================================================================

function batchEstadoResultados(sheet, data) {
  var emp = data.empresa || {};
  var per = data.periodo || {};
  var mDesde = per.mesDesde || 1, mHasta = per.mesHasta || 12;
  var MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var hayPrev = data.hayPrevio;
  
  // Título
  estiloTitulo(sheet, 20,
    emp.nombre + ' - Estado de Resultados',
    (data.nombreMesDesde || 'Enero') + ' a ' + (data.nombreMesHasta || 'Diciembre') + ' ' + (per.año || ''));
  
  var fila = 4;
  
  // Header row
  var headers = ['Código', 'Cuenta'];
  for (var m = mDesde; m <= mHasta; m++) headers.push(MESES[m]);
  headers.push('Total ' + per.año);
  if (hayPrev) {
    headers.push('Total ' + per.añoPrev);
    headers.push('Var %');
    headers.push('Margen');
  }
  var NC = headers.length;
  
  function writeSection(titulo, cuentas, totalMes, total, totalPrev, bgColor, fgColor, totalIngRef) {
    // Section header
    sheet.getRange(fila, 1, 1, NC).merge().setValue(titulo)
      .setFontWeight('bold').setFontSize(11).setBackground(bgColor).setFontColor(fgColor);
    fila++;
    
    // Column headers
    sheet.getRange(fila, 1, 1, NC).setValues([headers]);
    estiloHeader(sheet, fila, NC);
    fila++;
    
    // Data rows
    for (var i = 0; i < cuentas.length; i++) {
      var c = cuentas[i];
      var row = [c.codigo, c.nombre];
      for (var m = mDesde; m <= mHasta; m++) row.push(Math.abs(c.montos[m] || 0));
      row.push(Math.abs(c.total));
      if (hayPrev) {
        row.push(Math.abs(c.totalPrev || 0));
        row.push((c.variacion || 0) / 100);
        row.push(totalIngRef ? Math.abs(c.total) / totalIngRef : 0);
      }
      sheet.getRange(fila, 1, 1, NC).setValues([row]);
      fila++;
    }
    
    // Subtotal
    var subRow = ['', 'Total ' + titulo];
    for (var m = mDesde; m <= mHasta; m++) subRow.push(totalMes[m] || 0);
    subRow.push(total);
    if (hayPrev) {
      subRow.push(totalPrev);
      var varPct = totalPrev ? (total - totalPrev) / Math.abs(totalPrev) : 0;
      subRow.push(varPct);
      subRow.push(totalIngRef ? total / totalIngRef : 0);
    }
    sheet.getRange(fila, 1, 1, NC).setValues([subRow]);
    estiloTotal(sheet, fila, NC);
    sheet.getRange(fila, 1, 1, NC).setFontColor(fgColor);
    fila++;
    fila++; // spacer
  }
  
  writeSection('INGRESOS', data.ingresos || [], data.totalIngMes || {}, data.totalIngresos, data.totalIngPrev || 0, '#d1fae5', '#065f46', data.totalIngresos);
  writeSection('GASTOS', data.gastos || [], data.totalGasMes || {}, data.totalGastos, data.totalGasPrev || 0, '#fee2e2', '#991b1b', data.totalIngresos);
  
  // Resultado Neto
  var resRow = ['', data.resultadoNeto >= 0 ? 'UTILIDAD DEL EJERCICIO' : 'PÉRDIDA DEL EJERCICIO'];
  for (var m = mDesde; m <= mHasta; m++) resRow.push(data.resultadoMes[m] || 0);
  resRow.push(data.resultadoNeto);
  if (hayPrev) {
    resRow.push(data.resultadoPrev || 0);
    var varRes = data.resultadoPrev ? (data.resultadoNeto - data.resultadoPrev) / Math.abs(data.resultadoPrev) : 0;
    resRow.push(varRes);
    resRow.push(data.totalIngresos ? data.resultadoNeto / data.totalIngresos : 0);
  }
  sheet.getRange(fila, 1, 1, NC).setValues([resRow]);
  sheet.getRange(fila, 1, 1, NC).setFontWeight('bold').setFontSize(12)
    .setBackground(data.resultadoNeto >= 0 ? '#d1fae5' : '#fee2e2')
    .setBorder(true, null, true, null, null, null);
  
  // Formatos
  var colMonInicio = 3; // primera columna de montos
  var numColsMon = NC - 2; // todas menos Código y Cuenta
  var dataRows = fila - 4 + 1;
  
  // Montos: formato moneda
  var colsMoneda = (mHasta - mDesde + 1) + 1; // meses + total actual
  if (hayPrev) colsMoneda += 1; // total prev
  sheet.getRange(4, colMonInicio, dataRows, colsMoneda).setNumberFormat('$#,##0');
  
  // Columnas de porcentaje
  if (hayPrev) {
    var colVar = colMonInicio + colsMoneda;
    var colMargen = colVar + 1;
    sheet.getRange(4, colVar, dataRows, 1).setNumberFormat('0.0%');
    sheet.getRange(4, colMargen, dataRows, 1).setNumberFormat('0.0%');
  }
  
  for (var c = 1; c <= NC; c++) sheet.autoResizeColumn(c);
}

// =============================================================================
// FLUJO DE EFECTIVO - BATCH
// =============================================================================

function batchFlujoEfectivo(sheet, data) {
  var emp = data.empresa || {};
  var per = data.periodo || {};
  var mDesde = per.mesDesde || 1, mHasta = per.mesHasta || 12;
  var MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var hayPrev = data.hayPrevio;
  
  estiloTitulo(sheet, 20,
    emp.nombre + ' - Estado de Flujo de Efectivo',
    (data.nombreMesDesde || 'Enero') + ' a ' + (data.nombreMesHasta || 'Diciembre') + ' ' + (per.año || ''));
  
  var fila = 4;
  
  // Headers
  var headers = ['Cód', 'Categoría'];
  for (var m = mDesde; m <= mHasta; m++) headers.push(MESES[m]);
  headers.push('Total ' + per.año);
  if (hayPrev) {
    headers.push('Total ' + per.añoPrev);
    headers.push('Var %');
  }
  var NC = headers.length;
  
  sheet.getRange(fila, 1, 1, NC).setValues([headers]);
  estiloHeader(sheet, fila, NC);
  fila++;
  
  // Saldo inicial
  var rowSI = ['', 'Saldo Inicial de Efectivo'];
  for (var m = mDesde; m <= mHasta; m++) rowSI.push('');
  rowSI.push(data.saldoInicial || 0);
  if (hayPrev) { rowSI.push(data.saldoInicialPrev || 0); rowSI.push(''); }
  sheet.getRange(fila, 1, 1, NC).setValues([rowSI]);
  sheet.getRange(fila, 1, 1, NC).setFontWeight('bold').setBackground('#f1f5f9');
  fila++;
  fila++; // spacer
  
  // Secciones
  var SEC_BG = { 'Operacional': '#eff6ff', 'Inversión': '#f5f3ff', 'Financiamiento': '#fffbeb' };
  var SEC_FG = { 'Operacional': '#1e40af', 'Inversión': '#5b21b6', 'Financiamiento': '#92400e' };
  
  var secciones = data.secciones || [];
  for (var s = 0; s < secciones.length; s++) {
    var sec = secciones[s];
    var bg = SEC_BG[sec.tipo] || '#f8fafc';
    var fg = SEC_FG[sec.tipo] || '#334155';
    
    // Section header
    sheet.getRange(fila, 1, 1, NC).merge()
      .setValue('FLUJOS DE ACTIVIDADES DE ' + sec.tipo.toUpperCase())
      .setFontWeight('bold').setFontSize(11).setBackground(bg).setFontColor(fg);
    fila++;
    
    // Categorías
    var cats = sec.categorias || [];
    for (var c = 0; c < cats.length; c++) {
      var cat = cats[c];
      var row = [cat.codigo, cat.nombre];
      for (var m = mDesde; m <= mHasta; m++) row.push(cat.montos[m] || 0);
      row.push(cat.total);
      if (hayPrev) {
        row.push(cat.totalPrev || 0);
        row.push((cat.variacion || 0) / 100);
      }
      sheet.getRange(fila, 1, 1, NC).setValues([row]);
      fila++;
    }
    
    // Subtotal sección
    var subRow = ['', 'Flujo Neto ' + sec.tipo];
    for (var m = mDesde; m <= mHasta; m++) subRow.push(sec.subTotalMes[m] || 0);
    subRow.push(sec.subTotal);
    if (hayPrev) {
      subRow.push(sec.subTotalPrev || 0);
      subRow.push(sec.subTotalPrev ? (sec.subTotal - sec.subTotalPrev) / Math.abs(sec.subTotalPrev) : 0);
    }
    sheet.getRange(fila, 1, 1, NC).setValues([subRow]);
    estiloTotal(sheet, fila, NC);
    sheet.getRange(fila, 1, 1, NC).setBackground(bg).setFontColor(fg);
    fila++;
    fila++; // spacer
  }
  
  // Sin categoría
  if (data.sinCategoria) {
    var sc = data.sinCategoria;
    var scRow = ['', 'Movimientos sin categoría'];
    for (var m = mDesde; m <= mHasta; m++) scRow.push(sc.montos[m] || 0);
    scRow.push(sc.total);
    if (hayPrev) { scRow.push(sc.totalPrev || 0); scRow.push(''); }
    sheet.getRange(fila, 1, 1, NC).setValues([scRow]);
    sheet.getRange(fila, 1, 1, NC).setBackground('#fffbeb').setFontStyle('italic');
    fila++;
    fila++;
  }
  
  // Variación neta
  var varRow = ['', 'VARIACIÓN NETA DE EFECTIVO'];
  for (var m = mDesde; m <= mHasta; m++) varRow.push(data.totalFlujoMes[m] || 0);
  varRow.push(data.totalFlujo);
  if (hayPrev) {
    varRow.push(data.totalFlujoPrev || 0);
    varRow.push(data.totalFlujoPrev ? (data.totalFlujo - data.totalFlujoPrev) / Math.abs(data.totalFlujoPrev) : 0);
  }
  sheet.getRange(fila, 1, 1, NC).setValues([varRow]);
  sheet.getRange(fila, 1, 1, NC).setFontWeight('bold').setFontSize(12)
    .setBackground(data.totalFlujo >= 0 ? '#d1fae5' : '#fee2e2')
    .setBorder(true, null, true, null, null, null);
  fila++;
  
  // Saldo final
  var sfRow = ['', 'SALDO FINAL DE EFECTIVO'];
  for (var m = mDesde; m <= mHasta; m++) sfRow.push('');
  sfRow.push(data.saldoFinal || 0);
  if (hayPrev) { sfRow.push(data.saldoFinalPrev || 0); sfRow.push(''); }
  sheet.getRange(fila, 1, 1, NC).setValues([sfRow]);
  sheet.getRange(fila, 1, 1, NC).setFontWeight('bold').setFontSize(12)
    .setBackground('#0f172a').setFontColor('#f8fafc');
  fila++;
  
  // Formatos moneda y porcentaje
  var dataRows = fila - 5 + 1;
  var colsMoneda = (mHasta - mDesde + 1) + 1;
  if (hayPrev) colsMoneda += 1;
  sheet.getRange(5, 3, dataRows, colsMoneda).setNumberFormat('$#,##0');
  
  if (hayPrev) {
    var colVar = 3 + colsMoneda;
    sheet.getRange(5, colVar, dataRows, 1).setNumberFormat('0.0%');
  }
  
  for (var c = 1; c <= NC; c++) sheet.autoResizeColumn(c);
}

// =============================================================================
// LIBROS TRIBUTARIOS (Ventas/Compras) - BATCH
// =============================================================================

function batchLibroTributario(ss, sheet, data, docs, titulo, params) {
  var emp = data.empresa || {};
  var per = data.periodo || {};
  var esTodoAño = !params.mes || params.mes === 0;
  var periodoLabel = esTodoAño ? 'Año ' + (per.año || '') : (per.nombreMes || '') + ' ' + (per.año || '');
  
  // =========================================================================
  // AGRUPAR por tipo DTE, dentro de cada grupo ordenar por folio
  // =========================================================================
  var grupos = {}; // { tipoDTE: [docs] }
  var porMes = {};
  
  for (var i = 0; i < docs.length; i++) {
    var d = docs[i];
    var tipoKey = String(d.tipoDTE || 33);
    if (!grupos[tipoKey]) grupos[tipoKey] = [];
    grupos[tipoKey].push(d);
    
    // Acumular por mes para resumen
    var tipoDTE = parseInt(d.tipoDTE) || 33;
    var signo = esNotaCreditoGS(tipoDTE) ? -1 : 1;
    var mesDoc = extraerMesDeTexto(d.fecha);
    if (!porMes[mesDoc]) porMes[mesDoc] = { cant: 0, exento: 0, neto: 0, iva: 0, total: 0 };
    porMes[mesDoc].cant++;
    porMes[mesDoc].exento += (d.exento || 0) * signo;
    porMes[mesDoc].neto += (d.neto || 0) * signo;
    porMes[mesDoc].iva += (d.iva || 0) * signo;
    porMes[mesDoc].total += (d.total || 0) * signo;
  }
  
  // Ordenar tipos: facturas primero (33,34,46), luego ND (56), luego NC (61), resto
  var ordenDTE = [33, 34, 39, 41, 46, 52, 110, 56, 112, 61, 111];
  var tiposOrdenados = Object.keys(grupos).sort(function(a, b) {
    var ia = ordenDTE.indexOf(parseInt(a)), ib = ordenDTE.indexOf(parseInt(b));
    if (ia === -1) ia = 99; if (ib === -1) ib = 99;
    return ia - ib;
  });
  
  // Dentro de cada grupo, ordenar por folio
  for (var t = 0; t < tiposOrdenados.length; t++) {
    grupos[tiposOrdenados[t]].sort(function(a, b) {
      return (parseInt(a.folio) || 0) - (parseInt(b.folio) || 0);
    });
  }
  
  // =========================================================================
  // HOJA 1: DETALLE agrupado por tipo DTE
  // =========================================================================
  sheet.setName('Detalle');
  var NC = 10;
  estiloTitulo(sheet, NC, emp.nombre + ' — Libro de ' + titulo, emp.rut + '  |  ' + periodoLabel);
  
  var headers = ['N°', 'Fecha', 'Tipo DTE', 'Folio', 'RUT', 'Razón Social', 'Exento', 'Neto', 'IVA', 'Total'];
  sheet.getRange(4, 1, 1, NC).setValues([headers]);
  estiloHeader(sheet, 4, NC);
  
  var fila = 5;
  var correlativo = 1;
  var grandExento = 0, grandNeto = 0, grandIva = 0, grandTotal = 0;
  var porTipoDTE = []; // para resumen
  var filasSubtotal = []; // para estilo
  var filaInicio = fila; // para formatos
  
  for (var t = 0; t < tiposOrdenados.length; t++) {
    var tipoKey = tiposOrdenados[t];
    var tipoDTE = parseInt(tipoKey) || 33;
    var grupoNombre = nombreDTE(tipoDTE);
    var grupoDocs = grupos[tipoKey];
    var signo = esNotaCreditoGS(tipoDTE) ? -1 : 1;
    
    // Header de grupo
    sheet.getRange(fila, 1, 1, NC).merge().setValue(grupoNombre + ' (DTE ' + tipoKey + ')')
      .setFontWeight('bold').setFontSize(10).setBackground('#eef2ff').setFontColor('#3730a3').setFontFamily('Arial');
    fila++;
    
    var subExento = 0, subNeto = 0, subIva = 0, subTotal = 0;
    var rows = [];
    
    for (var i = 0; i < grupoDocs.length; i++) {
      var d = grupoDocs[i];
      var ex = (d.exento || 0) * signo;
      var ne = (d.neto || 0) * signo;
      var iv = (d.iva || 0) * signo;
      var to = (d.total || 0) * signo;
      
      rows.push([correlativo, d.fecha, d.tipoDTE, d.folio, d.rut, d.razonSocial || '', ex, ne, iv, to]);
      subExento += ex; subNeto += ne; subIva += iv; subTotal += to;
      correlativo++;
    }
    
    // Fila subtotal del grupo
    rows.push(['', '', '', '', '', 'Subtotal ' + grupoNombre + ' (' + grupoDocs.length + ' docs)', subExento, subNeto, subIva, subTotal]);
    
    // Write grupo
    if (rows.length > 0) {
      sheet.getRange(fila, 1, rows.length, NC).setValues(rows);
      fila += rows.length;
    }
    
    // Estilo subtotal
    var filaSubt = fila - 1;
    filasSubtotal.push(filaSubt);
    sheet.getRange(filaSubt, 1, 1, NC).setBackground('#f0f0ff').setFontWeight('bold').setFontSize(10).setFontFamily('Arial');
    
    // Fila vacía separadora entre grupos
    if (t < tiposOrdenados.length - 1) {
      fila++;
    }
    
    grandExento += subExento; grandNeto += subNeto; grandIva += subIva; grandTotal += subTotal;
    
    // Para resumen
    porTipoDTE.push({ tipo: tipoKey, nombre: grupoNombre, cant: grupoDocs.length,
      exento: subExento, neto: subNeto, iva: subIva, total: subTotal });
  }
  
  // Fila GRAN TOTAL
  fila++;
  sheet.getRange(fila, 1, 1, NC).setValues([['', '', '', '', '', 'TOTAL GENERAL', grandExento, grandNeto, grandIva, grandTotal]]);
  estiloTotal(sheet, fila, NC);
  sheet.getRange(fila, 7, 1, 4).setNumberFormat('$#,##0');
  
  // Formato moneda a todas las filas de datos (desde filaInicio hasta fila)
  var totalFilas = fila - filaInicio + 1;
  if (totalFilas > 0) {
    sheet.getRange(filaInicio, 7, totalFilas, 4).setNumberFormat('$#,##0');
  }
  
  // Bordes completos
  sheet.getRange(4, 1, fila - 3, NC)
    .setBorder(true, true, true, true, true, true, CLR.border, SpreadsheetApp.BorderStyle.SOLID);
  
  // N° correlativo angosto
  sheet.setColumnWidth(1, 45);
  // Auto-resize
  for (var c = 2; c <= NC; c++) sheet.autoResizeColumn(c);
  
  // =========================================================================
  // HOJA 2: RESUMEN
  // =========================================================================
  var shRes = ss.insertSheet('Resumen');
  var NCR = 7;
  estiloTitulo(shRes, NCR, emp.nombre + ' — Resumen Libro de ' + titulo, emp.rut + '  |  ' + periodoLabel);
  
  var filaR = 4;
  
  // --- Resumen por Tipo DTE ---
  shRes.getRange(filaR, 1, 1, NCR).merge().setValue('RESUMEN POR TIPO DE DOCUMENTO')
    .setFontWeight('bold').setFontSize(11).setFontColor(CLR.header).setFontFamily('Arial');
  filaR++;
  
  shRes.getRange(filaR, 1, 1, NCR).setValues([['Tipo DTE', 'Descripción', 'Docs', 'Exento', 'Neto', 'IVA', 'Total']]);
  estiloHeader(shRes, filaR, NCR);
  filaR++;
  
  var rowsTipo = [];
  for (var t = 0; t < porTipoDTE.length; t++) {
    var pt = porTipoDTE[t];
    rowsTipo.push([pt.tipo, pt.nombre, pt.cant, pt.exento, pt.neto, pt.iva, pt.total]);
  }
  rowsTipo.push(['', 'TOTAL GENERAL', docs.length, grandExento, grandNeto, grandIva, grandTotal]);
  
  if (rowsTipo.length > 0) {
    shRes.getRange(filaR, 1, rowsTipo.length, NCR).setValues(rowsTipo);
    shRes.getRange(filaR, 4, rowsTipo.length, 4).setNumberFormat('$#,##0');
    shRes.getRange(filaR, 1, rowsTipo.length, 1).setHorizontalAlignment('center');
    shRes.getRange(filaR, 3, rowsTipo.length, 1).setHorizontalAlignment('center');
    estiloTotal(shRes, filaR + rowsTipo.length - 1, NCR);
    for (var z = 0; z < rowsTipo.length - 1; z++) {
      if (z % 2 === 1) shRes.getRange(filaR + z, 1, 1, NCR).setBackground(CLR.zebra);
    }
    shRes.getRange(filaR - 1, 1, rowsTipo.length + 1, NCR)
      .setBorder(true, true, true, true, true, true, CLR.border, SpreadsheetApp.BorderStyle.SOLID);
  }
  filaR += rowsTipo.length + 2;
  
  // --- Resumen por Mes ---
  shRes.getRange(filaR, 1, 1, NCR).merge().setValue('RESUMEN POR MES')
    .setFontWeight('bold').setFontSize(11).setFontColor(CLR.header).setFontFamily('Arial');
  filaR++;
  
  shRes.getRange(filaR, 1, 1, NCR).setValues([['Mes', 'Docs', 'Exento', 'Neto', 'IVA', 'Total', '% del Total']]);
  estiloHeader(shRes, filaR, NCR);
  filaR++;
  
  var meses = Object.keys(porMes).sort(function(a, b) { return parseInt(a) - parseInt(b); });
  var rowsMes = [];
  for (var m = 0; m < meses.length; m++) {
    var pm = porMes[meses[m]];
    var pct = grandTotal !== 0 ? (pm.total / grandTotal) : 0;
    rowsMes.push([getNombreMes(parseInt(meses[m])), pm.cant, pm.exento, pm.neto, pm.iva, pm.total, pct]);
  }
  rowsMes.push(['TOTALES', docs.length, grandExento, grandNeto, grandIva, grandTotal, 1]);
  
  if (rowsMes.length > 0) {
    shRes.getRange(filaR, 1, rowsMes.length, NCR).setValues(rowsMes);
    shRes.getRange(filaR, 3, rowsMes.length, 4).setNumberFormat('$#,##0');
    shRes.getRange(filaR, 7, rowsMes.length, 1).setNumberFormat('0.0%');
    shRes.getRange(filaR, 2, rowsMes.length, 1).setHorizontalAlignment('center');
    estiloTotal(shRes, filaR + rowsMes.length - 1, NCR);
    for (var z = 0; z < rowsMes.length - 1; z++) {
      if (z % 2 === 1) shRes.getRange(filaR + z, 1, 1, NCR).setBackground(CLR.zebra);
    }
    shRes.getRange(filaR - 1, 1, rowsMes.length + 1, NCR)
      .setBorder(true, true, true, true, true, true, CLR.border, SpreadsheetApp.BorderStyle.SOLID);
  }
  filaR += rowsMes.length + 2;
  
  // --- Cuadro IVA ---
  shRes.getRange(filaR, 1, 1, NCR).merge().setValue('CUADRO IMPUESTO')
    .setFontWeight('bold').setFontSize(11).setFontColor(CLR.header).setFontFamily('Arial');
  filaR++;
  
  var esVentas = titulo === 'Ventas';
  var ivaRows = [
    ['Total ' + titulo + ' Neto', grandNeto],
    ['Total Exento', grandExento],
    ['Base Imponible (Neto)', grandNeto],
    [esVentas ? 'IVA Débito Fiscal (19%)' : 'IVA Crédito Fiscal (19%)', grandIva],
    ['Total ' + titulo, grandTotal]
  ];
  shRes.getRange(filaR, 1, ivaRows.length, 2).setValues(ivaRows);
  shRes.getRange(filaR, 2, ivaRows.length, 1).setNumberFormat('$#,##0');
  shRes.getRange(filaR, 1, ivaRows.length, 2)
    .setBorder(true, true, true, true, true, true, CLR.border, SpreadsheetApp.BorderStyle.SOLID)
    .setFontFamily('Arial').setFontSize(10);
  shRes.getRange(filaR + ivaRows.length - 1, 1, 1, 2).setFontWeight('bold').setBackground(CLR.total);
  
  for (var c = 1; c <= NCR; c++) shRes.autoResizeColumn(c);
}

/**
 * Libro de Honorarios — Detalle + Resumen
 */
function batchLibroHonorarios(ss, sheet, data, params) {
  var emp = data.empresa || {};
  var per = data.periodo || {};
  var esTodoAño = !params.mes || params.mes === 0;
  var periodoLabel = esTodoAño ? 'Año ' + (per.año || '') : (per.nombreMes || '') + ' ' + (per.año || '');
  var hons = data.honorarios || [];
  
  // Ordenar por número boleta
  hons.sort(function(a, b) { return (parseInt(a.numero) || 0) - (parseInt(b.numero) || 0); });
  
  // =========================================================================
  // HOJA 1: DETALLE
  // =========================================================================
  sheet.setName('Detalle');
  var NC = 8;
  estiloTitulo(sheet, NC, emp.nombre + ' — Libro de Honorarios', emp.rut + '  |  ' + periodoLabel);
  
  var headers = ['N°', 'Fecha', 'N° Boleta', 'RUT', 'Nombre', 'Bruto', 'Retención', 'Líquido'];
  var rows = [];
  var totBruto = 0, totRet = 0, totLiq = 0;
  var porMes = {};
  
  for (var i = 0; i < hons.length; i++) {
    var h = hons[i];
    var bruto = h.bruto || 0, ret = h.retencion || 0, liq = h.liquido || 0;
    rows.push([i + 1, h.fecha, h.numero, h.rut, h.nombre || '', bruto, ret, liq]);
    totBruto += bruto; totRet += ret; totLiq += liq;
    
    var mesDoc = extraerMesDeTexto(h.fecha);
    if (!porMes[mesDoc]) porMes[mesDoc] = { mes: mesDoc, cant: 0, bruto: 0, retencion: 0, liquido: 0 };
    porMes[mesDoc].cant++; porMes[mesDoc].bruto += bruto;
    porMes[mesDoc].retencion += ret; porMes[mesDoc].liquido += liq;
  }
  
  rows.push(['', '', '', '', 'TOTALES', totBruto, totRet, totLiq]);
  
  sheet.getRange(4, 1, 1, NC).setValues([headers]);
  estiloHeader(sheet, 4, NC);
  if (rows.length > 0) {
    sheet.getRange(5, 1, rows.length, NC).setValues(rows);
  }
  estiloTotal(sheet, 5 + rows.length - 1, NC);
  aplicarFormatos(sheet, 5, rows.length, 6, 3, NC);
  sheet.setColumnWidth(1, 45);
  
  // =========================================================================
  // HOJA 2: RESUMEN
  // =========================================================================
  var shRes = ss.insertSheet('Resumen');
  var NCR = 6;
  estiloTitulo(shRes, NCR, emp.nombre + ' — Resumen Libro de Honorarios', emp.rut + '  |  ' + periodoLabel);
  
  var fila = 4;
  
  // Resumen por Mes
  shRes.getRange(fila, 1, 1, NCR).merge().setValue('RESUMEN POR MES')
    .setFontWeight('bold').setFontSize(11).setFontColor(CLR.header).setFontFamily('Arial');
  fila++;
  
  var hdrMes = ['Mes', 'Boletas', 'Bruto', 'Retención', 'Líquido', '% del Total'];
  shRes.getRange(fila, 1, 1, NCR).setValues([hdrMes]);
  estiloHeader(shRes, fila, NCR);
  fila++;
  
  var meses = Object.keys(porMes).sort(function(a, b) { return parseInt(a) - parseInt(b); });
  var rowsMes = [];
  for (var m = 0; m < meses.length; m++) {
    var pm = porMes[meses[m]];
    var pct = totBruto !== 0 ? (pm.bruto / totBruto) : 0;
    rowsMes.push([getNombreMes(parseInt(meses[m])), pm.cant, pm.bruto, pm.retencion, pm.liquido, pct]);
  }
  rowsMes.push(['TOTALES', hons.length, totBruto, totRet, totLiq, 1]);
  
  if (rowsMes.length > 0) {
    shRes.getRange(fila, 1, rowsMes.length, NCR).setValues(rowsMes);
    shRes.getRange(fila, 3, rowsMes.length, 3).setNumberFormat('$#,##0');
    shRes.getRange(fila, 6, rowsMes.length, 1).setNumberFormat('0.0%');
    shRes.getRange(fila, 2, rowsMes.length, 1).setHorizontalAlignment('center');
    estiloTotal(shRes, fila + rowsMes.length - 1, NCR);
    for (var z = 0; z < rowsMes.length - 1; z++) {
      if (z % 2 === 1) shRes.getRange(fila + z, 1, 1, NCR).setBackground(CLR.zebra);
    }
    shRes.getRange(fila - 1, 1, rowsMes.length + 1, NCR)
      .setBorder(true, true, true, true, true, true, CLR.border, SpreadsheetApp.BorderStyle.SOLID);
  }
  fila += rowsMes.length + 2;
  
  // Cuadro Retención
  shRes.getRange(fila, 1, 1, NCR).merge().setValue('CUADRO RETENCIÓN')
    .setFontWeight('bold').setFontSize(11).setFontColor(CLR.header).setFontFamily('Arial');
  fila++;
  
  var retRows = [
    ['Total Honorarios Bruto', totBruto],
    ['Retención (13,75%)', totRet],
    ['Total Líquido a Pagar', totLiq],
    ['Cantidad de Boletas', hons.length]
  ];
  shRes.getRange(fila, 1, retRows.length, 2).setValues(retRows);
  shRes.getRange(fila, 2, 3, 1).setNumberFormat('$#,##0');
  shRes.getRange(fila + 3, 2, 1, 1).setNumberFormat('#,##0');
  shRes.getRange(fila, 1, retRows.length, 2)
    .setBorder(true, true, true, true, true, true, CLR.border, SpreadsheetApp.BorderStyle.SOLID)
    .setFontFamily('Arial').setFontSize(10);
  shRes.getRange(fila + retRows.length - 2, 1, 1, 2).setFontWeight('bold').setBackground(CLR.total);
  
  for (var c = 1; c <= NCR; c++) shRes.autoResizeColumn(c);
}

// =============================================================================
// UTILIDADES LIBROS TRIBUTARIOS
// =============================================================================

/**
 * Detecta si un tipo DTE es Nota de Crédito (debe restar)
 */
function esNotaCreditoGS(tipoDTE) {
  var t = parseInt(tipoDTE);
  return t === 61 || t === 56 || t === 60;
}

/**
 * Extrae número de mes desde texto de fecha (dd/mm/yyyy o dd-mm-yyyy)
 */
function extraerMesDeTexto(fechaStr) {
  if (!fechaStr) return 0;
  var str = String(fechaStr);
  var parts = str.split(/[\/\-]/);
  if (parts.length >= 3) {
    // dd/mm/yyyy
    var m = parseInt(parts[1]);
    if (m >= 1 && m <= 12) return m;
  }
  // Intentar como Date
  var d = new Date(fechaStr);
  return isNaN(d.getTime()) ? 0 : d.getMonth() + 1;
}

/**
 * Nombre descriptivo de tipo DTE
 */
function nombreDTE(tipoDTE) {
  var nombres = {
    33: 'Factura Electrónica', 34: 'Factura Exenta', 39: 'Boleta Electrónica',
    41: 'Boleta Exenta', 46: 'Factura Compra', 52: 'Guía Despacho',
    56: 'Nota Débito', 61: 'Nota Crédito',
    110: 'Factura Exportación', 111: 'NC Exportación', 112: 'ND Exportación'
  };
  return nombres[parseInt(tipoDTE)] || 'DTE ' + tipoDTE;
}

/**
 * Formatea fecha ISO a dd-mm-yyyy
 */
function fmtFechaGS(f) {
  if (!f) return '';
  try {
    var d = new Date(f);
    if (isNaN(d.getTime())) return String(f);
    var dd = ('0' + d.getDate()).slice(-2);
    var mm = ('0' + (d.getMonth() + 1)).slice(-2);
    return dd + '-' + mm + '-' + d.getFullYear();
  } catch(e) { return String(f); }
}

// =============================================================================
// CxC / CxP - BATCH
// =============================================================================

function batchCuentasPend(sheet, data, titulo) {
  var multiCuenta = data.cuentas && data.cuentas.length > 1;
  var NC = multiCuenta ? 8 : 7;
  var emp = data.empresa || {};
  var subtitulo = data.cuenta ? (data.cuenta.codigo + ' - ' + data.cuenta.nombre) : '';
  estiloTitulo(sheet, NC, emp.nombre + ' - ' + titulo, subtitulo);

  // Aging summary en fila 3
  var rangos = data.antiguedad || [];
  var agingLabels = ['Antigüedad:'];
  var agingValues = [''];
  for (var i = 0; i < rangos.length; i++) {
    agingLabels.push(rangos[i].nombre);
    agingValues.push(rangos[i].total || 0);
  }
  while (agingLabels.length < NC) { agingLabels.push(''); agingValues.push(''); }
  sheet.getRange(3, 1, 1, NC).setValues([agingLabels.slice(0, NC)]).setFontWeight('bold');
  sheet.getRange(4, 1, 1, NC).setValues([agingValues.slice(0, NC)]);
  sheet.getRange(4, 2, 1, NC - 1).setNumberFormat('$#,##0').setFontWeight('bold');

  var headers = multiCuenta ? ['Cuenta', 'RUT', 'Nombre', 'Documento', 'Fecha', 'Días', 'Monto Orig.', 'Saldo']
                            : ['RUT', 'Nombre', 'Documento', 'Fecha', 'Días', 'Monto Orig.', 'Saldo'];
  var docs = data.documentos || [];
  var rows = [];

  for (var i = 0; i < docs.length; i++) {
    var d = docs[i];
    var fila = multiCuenta 
      ? [d.cuenta || '', d.rut || '', d.nombre || '', (d.tipoDoc || '') + ' ' + (d.numDoc || ''), d.fecha || '', d.diasAntiguedad || 0, d.montoOriginal || 0, d.saldo || 0]
      : [d.rut || '', d.nombre || '', (d.tipoDoc || '') + ' ' + (d.numDoc || ''), d.fecha || '', d.diasAntiguedad || 0, d.montoOriginal || 0, d.saldo || 0];
    rows.push(fila);
  }
  var totalRow = multiCuenta 
    ? ['', '', '', '', '', 'TOTAL', data.totalSaldo || 0, '']
    : ['', '', '', '', 'TOTAL', data.totalSaldo || 0, ''];
  rows.push(totalRow);

  sheet.getRange(6, 1, 1, NC).setValues([headers]);
  estiloHeader(sheet, 6, NC);
  if (rows.length > 0) {
    sheet.getRange(7, 1, rows.length, NC).setValues(rows);
  }
  estiloTotal(sheet, 7 + rows.length - 1, NC);
  // Formato moneda en columnas monto y saldo
  var colMonto = multiCuenta ? 7 : 6;
  var colSaldo = multiCuenta ? 8 : 7;
  if (rows.length > 0) {
    sheet.getRange(7, colMonto, rows.length, 1).setNumberFormat('$#,##0');
    sheet.getRange(7, colSaldo, rows.length, 1).setNumberFormat('$#,##0');
  }
}

// =============================================================================
// ESTADO DE SITUACIÓN FINANCIERA - BATCH (formato foto EEFF)
// =============================================================================

function batchEstadoSituacion(sheet, data) {
  var emp = data.empresa || {};
  var per = data.periodo || {};
  var hayPrev = data.hayPrevio;
  var MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var fechaStr = 'Al ' + per.mesHasta + ' de ' + (MESES[per.mesHasta] || 'Diciembre') + ' ' + per.año;
  
  // Colores estilo foto 3
  var CLR_HEADER = '#1a1a4e';
  var CLR_FONT   = '#ffffff';
  var CLR_TOTAL1 = '#1a1a4e'; // Total Activos/Pasivos (fondo oscuro)
  var CLR_TOTAL2 = '#e8e7f8'; // Subtotales (fondo claro)
  
  var NC = hayPrev ? 6 : 2; // Sin prev: Cuenta | Actual  /  Con prev: Cuenta | Actual | Prev | Var$ | Var% | (spacer)
  
  // Título
  sheet.getRange(1, 1, 1, NC).merge().setValue(emp.nombre + ' - ESTADO DE SITUACIÓN FINANCIERA').setFontWeight('bold').setFontSize(13).setHorizontalAlignment('center');
  sheet.getRange(2, 1, 1, NC).merge().setValue(fechaStr).setFontStyle('italic').setHorizontalAlignment('center');
  
  var fila = 4;
  
  function writeSeccion(seccion) {
    // Sección header (ACTIVOS, PASIVOS, PATRIMONIO)
    sheet.getRange(fila, 1, 1, NC).merge().setValue(seccion.label)
      .setFontWeight('bold').setFontSize(12).setBackground(CLR_HEADER).setFontColor(CLR_FONT);
    fila++;
    
    // Columnas header
    var headers = [''];
    headers.push(per.mesHasta + '-12-' + per.año + '\n$$');
    if (hayPrev) {
      headers.push(per.mesHasta + '-12-' + per.añoPrev + '\n$$');
      headers.push('Variación\n$$');
      headers.push('Var\n%');
      headers.push('');
    }
    sheet.getRange(fila, 1, 1, NC).setValues([headers.slice(0, NC)]);
    sheet.getRange(fila, 1, 1, NC).setFontWeight('bold').setHorizontalAlignment('center').setBackground('#f0f0f0');
    fila++;
    
    for (var g = 0; g < seccion.grupos.length; g++) {
      var grupo = seccion.grupos[g];
      
      // Grupo header (Activos Corrientes, Pasivos Corrientes, etc.)
      sheet.getRange(fila, 1).setValue(grupo.nombre).setFontWeight('bold').setFontSize(10);
      fila++;
      
      // Items (nivel 3)
      for (var it = 0; it < grupo.items.length; it++) {
        var item = grupo.items[it];
        var row = ['    ' + item.nombre, item.saldo];
        if (hayPrev) {
          row.push(item.saldoPrev);
          row.push(item.variacion);
          row.push(item.saldoPrev !== 0 ? item.variacionPct / 100 : '');
        }
        while (row.length < NC) row.push('');
        sheet.getRange(fila, 1, 1, NC).setValues([row.slice(0, NC)]);
        fila++;
      }
      
      // Total del grupo
      var totalRow = ['Total ' + grupo.nombre, grupo.total];
      if (hayPrev) {
        totalRow.push(grupo.totalPrev);
        totalRow.push(grupo.variacion);
        totalRow.push(grupo.totalPrev !== 0 ? grupo.variacionPct / 100 : '');
      }
      while (totalRow.length < NC) totalRow.push('');
      sheet.getRange(fila, 1, 1, NC).setValues([totalRow.slice(0, NC)]);
      sheet.getRange(fila, 1, 1, NC).setFontWeight('bold').setBackground(CLR_TOTAL2);
      sheet.getRange(fila, 1, 1, NC).setBorder(true, null, true, null, null, null);
      fila++;
      fila++; // spacer
    }
    
    // TOTAL SECCION
    var secRow = ['Total ' + seccion.label, seccion.total];
    if (hayPrev) {
      secRow.push(seccion.totalPrev);
      secRow.push(seccion.variacion);
      secRow.push(seccion.totalPrev !== 0 ? seccion.variacionPct / 100 : '');
    }
    while (secRow.length < NC) secRow.push('');
    sheet.getRange(fila, 1, 1, NC).setValues([secRow.slice(0, NC)]);
    sheet.getRange(fila, 1, 1, NC).setFontWeight('bold').setFontSize(11).setBackground(CLR_HEADER).setFontColor(CLR_FONT);
    fila++;
    fila++; // spacer
    
    return fila;
  }
  
  writeSeccion(data.activos);
  fila++; // extra spacer between A y P
  writeSeccion(data.pasivos);
  writeSeccion(data.patrimonio);
  
  // TOTAL PASIVO + PATRIMONIO
  var tppRow = ['Total Pasivos + Patrimonio', data.totalPasivoPatrimonio];
  if (hayPrev) {
    tppRow.push(data.totalPasivoPatrimonioPrev);
    tppRow.push(data.totalPasivoPatrimonio - data.totalPasivoPatrimonioPrev);
    var varTPP = data.totalPasivoPatrimonioPrev !== 0 ? ((data.totalPasivoPatrimonio - data.totalPasivoPatrimonioPrev) / Math.abs(data.totalPasivoPatrimonioPrev)) : 0;
    tppRow.push(varTPP);
  }
  while (tppRow.length < NC) tppRow.push('');
  sheet.getRange(fila, 1, 1, NC).setValues([tppRow.slice(0, NC)]);
  sheet.getRange(fila, 1, 1, NC).setFontWeight('bold').setFontSize(11).setBackground(CLR_HEADER).setFontColor(CLR_FONT);
  fila++;
  
  // Formatos
  var dataRows = fila - 4;
  sheet.getRange(4, 2, dataRows, 1).setNumberFormat('$#,##0');
  if (hayPrev) {
    sheet.getRange(4, 3, dataRows, 1).setNumberFormat('$#,##0');
    sheet.getRange(4, 4, dataRows, 1).setNumberFormat('$#,##0');
    sheet.getRange(4, 5, dataRows, 1).setNumberFormat('0.0%');
  }
  
  sheet.setColumnWidth(1, 280);
  for (var c = 2; c <= NC; c++) sheet.setColumnWidth(c, 140);
}

// =============================================================================
// REPORTE CONSOLIDADO (todas las hojas en un solo workbook)
// =============================================================================

function exportarConsolidado(parametros) {
  try {
    var año = parseInt(parametros.año) || new Date().getFullYear();
    var mesHasta = parseInt(parametros.mesHasta) || 12;
    var mesDesde = parseInt(parametros.mesDesde) || 1;
    var config = getConfig();
    var emp = { nombre: config.EMPRESA_NOMBRE || 'Empresa', rut: config.EMPRESA_RUT || '' };
    
    var nombre = 'EEFF_Consolidado_' + año;
    var ss = SpreadsheetApp.create(nombre);
    
    // 1. ESTADO DE SITUACIÓN FINANCIERA
    var sheetEEFF = ss.getActiveSheet();
    sheetEEFF.setName('Situación Financiera');
    var dataEEFF = getEstadoSituacionFinanciera(año, mesHasta);
    dataEEFF.empresa = emp;
    batchEstadoSituacion(sheetEEFF, dataEEFF);
    
    // 2. ESTADO DE RESULTADOS
    var sheetEERR = ss.insertSheet('EERR');
    var dataEERR = getReporteEstadoResultados(año, mesDesde, mesHasta);
    dataEERR.empresa = emp;
    batchEstadoResultados(sheetEERR, dataEERR);
    
    // 3. FLUJO DE EFECTIVO
    var sheetEFE = ss.insertSheet('EFE');
    var dataEFE = getReporteFlujoEfectivo(año, mesDesde, mesHasta);
    dataEFE.empresa = emp;
    batchFlujoEfectivo(sheetEFE, dataEFE);
    
    // 4. BALANCE 8 COLUMNAS
    var sheetB8 = ss.insertSheet('Balance 8 Col');
    var dataB8 = getReporteBalance8Columnas(año, mesHasta);
    dataB8.empresa = emp;
    batchBalance8(sheetB8, dataB8);
    
    // 5. LIBRO MAYOR
    var sheetLM = ss.insertSheet('Libro Mayor');
    var dataLM = getReporteLibroMayor('TODAS', año, mesDesde, mesHasta);
    dataLM.empresa = emp;
    batchLibroMayor(sheetLM, dataLM);
    
    return toClient({
      url: 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx',
      nombre: nombre + '.xlsx',
      id: ss.getId(),
      hojas: ['Situación Financiera', 'EERR', 'EFE', 'Balance 8 Col', 'Libro Mayor']
    });
  } catch (e) {
    return toClient({ error: e.message });
  }
}