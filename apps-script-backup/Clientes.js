/**
 * ============================================================================
 * Clientes.gs — Saldos CxC por Documento (enfoque Softland)
 * ============================================================================
 * LÓGICA IDÉNTICA A SOFTLAND:
 *   1. Lee TODOS los movimientos de CxC excluyendo APERTURAS
 *      (Softland: CpbNum <> '00000000' | Aquí: TIPO <> 'A')
 *   2. Agrupa por REF (MovTipDocRef + MovNumDocRef + CodAux)
 *   3. Saldo = sum(Debe) - sum(Haber) por cada documento REF
 *   4. CUADRA con contabilidad siempre
 *   5. Cross-year: FAC 2025 con pagos 2026 → saldo correcto
 * ============================================================================
 */

function getResumenClientesUI()    { return toClient(getResumenClientes_()); }
function getClientesListaUI()      { return toClient(getClientesLista_()); }
function getMorososUI()            { return toClient(getMorosos_()); }
function getDetalleClienteUI(rut)  { return toClient(getDetalleCliente_(rut)); }

// =============================================================================
// LECTURA CENTRAL — igual que Softland
// =============================================================================

function getAllDocsCxC_() {
  var config = getConfig();
  var ctaCxC    = config.CUENTA_CLIENTES || '1-1-03-001';
  var ctaCxCBol = config.CUENTA_CLIENTES_BOLETAS || '1-1-03-002';
  var tipoApert = config.TIPO_COMP_APERTURA || 'A';
  
  var ss = getSS(), sheets = getSheetNames();
  var sheetMov  = buscarHoja(ss, sheets.MOV_CONTABLES);
  var sheetComp = buscarHoja(ss, sheets.COMPROBANTES);
  if (!sheetMov || !sheetComp) return [];
  
  var dataMov  = sheetMov.getDataRange().getValues();
  var dataComp = sheetComp.getDataRange().getValues();
  
  // ── Comprobantes vigentes EXCLUYENDO apertura ──
  // Softland: CpbNum <> '00000000' AND CpbEst='V'
  // Aquí:     TIPO <> 'A' AND ESTADO <> 'ANULADO'
  var compVigentes = {};
  for (var i = 1; i < dataComp.length; i++) {
    var tipo   = String(dataComp[i][1] || '').trim().toUpperCase();
    var estado = String(dataComp[i][10] || '').trim().toUpperCase();
    if (tipo === tipoApert || estado === 'ANULADO') continue;
    compVigentes[dataComp[i][0]] = true;
  }
  
  // Cuentas CxC
  var cuentasCxC = {};
  cuentasCxC[ctaCxC] = true;
  if (ctaCxCBol) cuentasCxC[ctaCxCBol] = true;
  
  // ── Agrupar por documento REF (idéntico a Softland) ──
  // Clave: CodAux | PctCod | MovTipDocRef | MovNumDocRef
  var documentos = {};
  
  for (var i = 1; i < dataMov.length; i++) {
    var row = dataMov[i];
    var cuenta = String(row[3] || '').trim();
    if (!cuentasCxC[cuenta]) continue;
    if (!compVigentes[row[1]]) continue;
    
    // REF es la clave maestra (como Softland)
    var refTipo = String(row[11] || row[8] || '').trim();
    var refNum  = String(row[12] || row[9] || '').trim();
    var aux     = String(row[7] || '').trim();
    if (!refTipo || !refNum) continue;
    
    var clave = aux + '|' + cuenta + '|' + refTipo + '|' + refNum;
    
    if (!documentos[clave]) {
      documentos[clave] = {
        auxiliar: aux, cuenta: cuenta,
        tipoDoc: refTipo, numDoc: refNum,
        fechaDoc: null,
        totalDebe: 0, totalHaber: 0,
        movs: []
      };
    }
    
    var doc   = documentos[clave];
    var debe  = parseFloat(row[4]) || 0;
    var haber = parseFloat(row[5]) || 0;
    
    // Clasificar: Registro vs Rebaja (como Softland)
    // Registro: TtdCod/NumDoc == MovTipDocRef/MovNumDocRef
    var ttdCod = String(row[8] || '').trim();
    var numDoc = String(row[9] || '').trim();
    var esReg  = (ttdCod === refTipo && numDoc === refNum);
    
    // Fecha doc: del primer registro
    if (esReg && !doc.fechaDoc && row[10]) {
      doc.fechaDoc = row[10];
    }
    
    doc.totalDebe  += debe;
    doc.totalHaber += haber;
    
    doc.movs.push({
      fecha: row[14] || row[10],  // fecha comprobante o fecha doc
      comprobante: String(row[1] || ''),
      ttdCod: ttdCod, numDoc: numDoc,
      esReg: esReg,
      debe: debe, haber: haber,
      glosa: String(row[6] || '')
    });
  }
  
  // ── Calcular saldos ──
  var resultado = [];
  var hoy = new Date();
  
  for (var clave in documentos) {
    var doc = documentos[clave];
    
    // CxC activo → Saldo = Debe - Haber
    doc.saldo = doc.totalDebe - doc.totalHaber;
    
    // Monto original: lo que entró por REGISTRO
    doc.montoReg = 0;
    doc.montoReb = 0;
    for (var m = 0; m < doc.movs.length; m++) {
      if (doc.movs[m].esReg) {
        doc.montoReg += doc.movs[m].debe;
      } else {
        doc.montoReb += doc.movs[m].haber;
      }
    }
    
    doc.estaPagado = Math.abs(doc.saldo) < 1;
    
    // Nombre auxiliar
    var auxObj = getAuxiliar(doc.auxiliar);
    doc.nombreAux = auxObj ? auxObj.nombre : doc.auxiliar;
    
    // Días de mora (vencimiento = fecha emisión + 5 días)
    if (doc.fechaDoc) {
      var fd = new Date(doc.fechaDoc);
      var diasDesdeEmision = Math.floor((hoy - fd) / 86400000);
      doc.dias = Math.max(0, diasDesdeEmision - 5); // 5 días de plazo de pago
      doc.fechaFmt = fmtF_(fd);
    } else {
      doc.dias = 0;
      doc.fechaFmt = '—';
    }
    
    // Fecha último pago
    doc.fechaUltPago = null;
    for (var m = 0; m < doc.movs.length; m++) {
      var mv = doc.movs[m];
      if (!mv.esReg && mv.haber > 0 && mv.fecha) {
        if (!doc.fechaUltPago || new Date(mv.fecha) > new Date(doc.fechaUltPago)) {
          doc.fechaUltPago = mv.fecha;
        }
      }
    }
    
    // Nro rebajas
    doc.nRebajas = 0;
    for (var m = 0; m < doc.movs.length; m++) {
      if (!doc.movs[m].esReg) doc.nRebajas++;
    }
    
    // Ordenar movimientos por fecha
    doc.movs.sort(function(a, b) {
      return (a.fecha ? new Date(a.fecha) : 0) - (b.fecha ? new Date(b.fecha) : 0);
    });
    
    resultado.push(doc);
  }
  
  return resultado;
}

// =============================================================================
// RESUMEN (KPIs)
// =============================================================================

function getResumenClientes_() {
  var docs = getAllDocsCxC_();
  
  var totalPend = 0, cantPend = 0, cantMor = 0, sumDias = 0;
  
  for (var i = 0; i < docs.length; i++) {
    var d = docs[i];
    if (d.saldo > 1) {
      totalPend += d.saldo;
      cantPend++;
      sumDias += d.dias;
      if (d.dias > 30) cantMor++;
    }
  }
  
  return {
    kpis: {
      totalPendiente: totalPend,
      cantPendientes: cantPend,
      cantMorosos: cantMor,
      diasPromedio: cantPend > 0 ? Math.round(sumDias / cantPend) : 0,
      saldoPromedio: cantPend > 0 ? Math.round(totalPend / cantPend) : 0
    }
  };
}

// =============================================================================
// SALDO POR CLIENTE (Softland H1)
// =============================================================================

function getClientesLista_() {
  var docs = getAllDocsCxC_();
  
  var clientes = {};
  for (var i = 0; i < docs.length; i++) {
    var d = docs[i];
    
    var rut = d.auxiliar;
    if (!clientes[rut]) {
      clientes[rut] = {
        rut: rut, nombre: d.nombreAux,
        debe: 0, haber: 0, saldo: 0,
        cantDocs: 0, cantDocsPend: 0, nReb: 0, diasMax: 0
      };
    }
    var c = clientes[rut];
    c.debe  += d.totalDebe;
    c.haber += d.totalHaber;
    c.saldo += d.saldo;
    c.cantDocs++;
    if (d.saldo > 1) c.cantDocsPend++;
    c.nReb += d.nRebajas;
    if (d.saldo > 1 && d.dias > c.diasMax) c.diasMax = d.dias;
  }
  
  var lista = [];
  // Cruzar con Ficha_Comercial para emails
  var fichaEmails = {};
  try {
    var shFicha = getSS().getSheetByName('Ficha_Comercial');
    if (shFicha) {
      var fData = shFicha.getDataRange().getValues();
      var fHeaders = fData[0];
      var fColMap = {};
      for (var h = 0; h < fHeaders.length; h++) fColMap[String(fHeaders[h]).trim()] = h;
      for (var f = 1; f < fData.length; f++) {
        var fRut = limpiarRUT(String(fData[f][fColMap.RUT] || ''));
        if (fRut) fichaEmails[fRut] = String(fData[f][fColMap.EMAIL] || '');
      }
    }
  } catch(e) {}
  
  for (var rut in clientes) {
    var c = clientes[rut];
    c.rutFmt = formatearRUT(rut);
    c.email = fichaEmails[limpiarRUT(rut)] || '';
    lista.push(c);
  }
  lista.sort(function(a, b) { return b.saldo - a.saldo; });
  
  return { clientes: lista };
}

// =============================================================================
// PENDIENTES / AGING (Softland H4)
// =============================================================================

function getMorosos_() {
  var docs = getAllDocsCxC_();
  
  var pendientes = [];
  var tramos = {};
  var tramoCant = {};
  var tKeys = ['0-30','31-60','61-90','91-180','181-365','+365'];
  for (var t = 0; t < tKeys.length; t++) { tramos[tKeys[t]] = 0; tramoCant[tKeys[t]] = 0; }
  
  for (var i = 0; i < docs.length; i++) {
    var d = docs[i];
    if (d.saldo <= 1) continue;
    
    var tr = d.dias <= 30 ? '0-30' : d.dias <= 60 ? '31-60' :
             d.dias <= 90 ? '61-90' : d.dias <= 180 ? '91-180' :
             d.dias <= 365 ? '181-365' : '+365';
    
    tramos[tr] += d.saldo;
    tramoCant[tr]++;
    
    pendientes.push({
      rut: d.auxiliar, rutFmt: formatearRUT(d.auxiliar),
      nombre: d.nombreAux,
      tipoDoc: d.tipoDoc, numDoc: d.numDoc,
      fechaDoc: d.fechaFmt,
      montoReg: d.montoReg, montoReb: d.montoReb,
      saldo: d.saldo, dias: d.dias, tramo: tr
    });
  }
  
  pendientes.sort(function(a, b) { return b.saldo - a.saldo; });
  
  return {
    documentos: pendientes,
    totalPendiente: pendientes.reduce(function(s, d) { return s + d.saldo; }, 0),
    cantDocumentos: pendientes.length,
    tramos: tramos, tramoCant: tramoCant
  };
}

// =============================================================================
// DETALLE CLIENTE (Softland H2 — docs con movimientos)
// =============================================================================

function getDetalleCliente_(rut) {
  var docs = getAllDocsCxC_();
  var rutLimpio = limpiarRUT(rut);
  
  var docsCliente = [];
  for (var i = 0; i < docs.length; i++) {
    if (limpiarRUT(docs[i].auxiliar) === rutLimpio) {
      docsCliente.push(docs[i]);
    }
  }
  
  // Pendientes primero, luego pagados; dentro por fecha desc
  docsCliente.sort(function(a, b) {
    var ap = Math.abs(a.saldo) > 1 ? 0 : 1;
    var bp = Math.abs(b.saldo) > 1 ? 0 : 1;
    if (ap !== bp) return ap - bp;
    var fa = a.fechaDoc ? new Date(a.fechaDoc).getTime() : 0;
    var fb = b.fechaDoc ? new Date(b.fechaDoc).getTime() : 0;
    return fb - fa;
  });
  
  var aux = getAuxiliar(rut);
  var detalle = [];
  var totDebe = 0, totHaber = 0, totSaldo = 0;
  
  for (var i = 0; i < docsCliente.length; i++) {
    var d = docsCliente[i];
    totDebe  += d.totalDebe;
    totHaber += d.totalHaber;
    totSaldo += d.saldo;
    
    // Formatear movimientos (como Softland H2)
    var movsFmt = [];
    for (var m = 0; m < d.movs.length; m++) {
      var mv = d.movs[m];
      movsFmt.push({
        fecha: mv.fecha ? fmtF_(new Date(mv.fecha)) : '—',
        ttdCod: mv.ttdCod, numDoc: mv.numDoc,
        esReg: mv.esReg,
        debe: mv.debe, haber: mv.haber,
        glosa: mv.glosa ? mv.glosa.substring(0, 50) : ''
      });
    }
    
    detalle.push({
      tipoDoc: d.tipoDoc, numDoc: d.numDoc,
      fechaDoc: d.fechaFmt,
      montoReg: d.montoReg, montoReb: d.montoReb,
      saldo: d.saldo, estaPagado: d.estaPagado,
      dias: d.dias,
      fechaUltPago: d.fechaUltPago ? fmtF_(new Date(d.fechaUltPago)) : '—',
      estado: d.estaPagado ? 'Pagado' : 'Pendiente',
      movs: movsFmt
    });
  }
  
  return {
    rut: rut, rutFmt: formatearRUT(rut),
    nombre: aux ? aux.nombre : rut,
    documentos: detalle,
    totDebe: totDebe, totHaber: totHaber, totSaldo: totSaldo,
    cantDocs: docsCliente.length
  };
}

// =============================================================================
// UTIL
// =============================================================================

function fmtF_(d) {
  if (!d) return '—';
  try {
    if (!(d instanceof Date)) d = new Date(d);
    if (isNaN(d.getTime())) return '—';
    return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
  } catch(e) { return '—'; }
}

// =============================================================================
// EXPORTAR MOROSOS A EXCEL (descarga directa, sin guardar en Drive)
// =============================================================================

function exportarMorososExcelUI() {
  var data = getMorosos_();
  if (!data.documentos || data.documentos.length === 0) {
    return toClient({ error: 'No hay documentos pendientes para exportar' });
  }
  
  var config = getConfig();
  var empresa = config.EMPRESA_NOMBRE || 'Empresa';
  var docs = data.documentos;
  var hoy = new Date();
  var fechaStr = ('0' + hoy.getDate()).slice(-2) + '/' + ('0' + (hoy.getMonth()+1)).slice(-2) + '/' + hoy.getFullYear();
  
  // Crear spreadsheet temporal
  var ss = SpreadsheetApp.create('Morosos_CxC_' + hoy.getFullYear() + ('0'+(hoy.getMonth()+1)).slice(-2));
  var sheet = ss.getActiveSheet();
  sheet.setName('Morosos CxC');
  
  var CLR_HDR = '#1e1b4b';
  var CLR_HDR_FONT = '#ffffff';
  var CLR_TRAMO = '#e8e7f8';
  var CLR_ZEBRA = '#f8fafc';
  var CLR_BORDER = '#d1d5db';
  var COLS = 10;
  
  // ── TÍTULO ──
  sheet.getRange(1, 1, 1, COLS).merge().setValue(empresa + ' — Cuentas por Cobrar Vencidas')
    .setFontSize(14).setFontWeight('bold').setFontColor(CLR_HDR).setHorizontalAlignment('center').setFontFamily('Arial');
  sheet.getRange(2, 1, 1, COLS).merge().setValue('Generado: ' + fechaStr + ' | Total pendiente: $' + Math.round(data.totalPendiente).toLocaleString('es-CL') + ' | Documentos: ' + data.cantDocumentos)
    .setFontSize(10).setFontColor('#64748b').setHorizontalAlignment('center').setFontFamily('Arial');
  
  // ── RESUMEN POR TRAMOS ──
  var fila = 4;
  sheet.getRange(fila, 1, 1, COLS).merge().setValue('RESUMEN POR ANTIGÜEDAD')
    .setFontSize(11).setFontWeight('bold').setFontColor(CLR_HDR).setFontFamily('Arial');
  fila++;
  
  var tKeys = ['0-30','31-60','61-90','91-180','181-365','+365'];
  var tLabels = ['0-30 días','31-60 días','61-90 días','91-180 días','181-365 días','Más de 365 días'];
  var tColors = ['#22c55e','#84cc16','#eab308','#f97316','#ef4444','#991b1b'];
  
  sheet.getRange(fila, 1).setValue('Tramo').setFontWeight('bold');
  sheet.getRange(fila, 2).setValue('Documentos').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(fila, 3).setValue('Monto').setFontWeight('bold').setHorizontalAlignment('right');
  sheet.getRange(fila, 4).setValue('% del Total').setFontWeight('bold').setHorizontalAlignment('right');
  sheet.getRange(fila, 1, 1, 4).setBackground('#f1f5f9').setFontFamily('Arial').setFontSize(10);
  fila++;
  
  for (var t = 0; t < tKeys.length; t++) {
    var monto = data.tramos[tKeys[t]] || 0;
    var cant = data.tramoCant[tKeys[t]] || 0;
    var pct = data.totalPendiente > 0 ? (monto / data.totalPendiente) : 0;
    sheet.getRange(fila, 1).setValue(tLabels[t]).setFontFamily('Arial').setFontSize(10);
    sheet.getRange(fila, 2).setValue(cant).setHorizontalAlignment('center').setFontFamily('Arial').setFontSize(10);
    sheet.getRange(fila, 3).setValue(monto).setNumberFormat('$#,##0').setFontFamily('Arial').setFontSize(10);
    sheet.getRange(fila, 4).setValue(pct).setNumberFormat('0.0%').setFontFamily('Arial').setFontSize(10);
    // Color indicator
    sheet.getRange(fila, 1).setFontColor(tColors[t]);
    if (t % 2 === 1) sheet.getRange(fila, 1, 1, 4).setBackground(CLR_ZEBRA);
    fila++;
  }
  // Total tramos
  sheet.getRange(fila, 1).setValue('TOTAL').setFontWeight('bold').setFontFamily('Arial').setFontSize(10);
  sheet.getRange(fila, 2).setValue(data.cantDocumentos).setHorizontalAlignment('center').setFontWeight('bold').setFontFamily('Arial').setFontSize(10);
  sheet.getRange(fila, 3).setValue(data.totalPendiente).setNumberFormat('$#,##0').setFontWeight('bold').setFontFamily('Arial').setFontSize(10);
  sheet.getRange(fila, 4).setValue(1).setNumberFormat('0.0%').setFontWeight('bold').setFontFamily('Arial').setFontSize(10);
  sheet.getRange(fila, 1, 1, 4).setBackground(CLR_TRAMO);
  sheet.getRange(fila - tKeys.length, 1, tKeys.length + 1, 4)
    .setBorder(true, true, true, true, true, true, CLR_BORDER, SpreadsheetApp.BorderStyle.SOLID);
  
  // ── DETALLE ──
  fila += 2;
  sheet.getRange(fila, 1, 1, COLS).merge().setValue('DETALLE DE DOCUMENTOS PENDIENTES')
    .setFontSize(11).setFontWeight('bold').setFontColor(CLR_HDR).setFontFamily('Arial');
  fila++;
  
  var headers = ['RUT', 'Cliente', 'Tipo', 'N° Doc', 'Fecha', 'Registro', 'Rebajas', 'Saldo', 'Días', 'Tramo'];
  var headerRow = [];
  for (var h = 0; h < headers.length; h++) headerRow.push(headers[h]);
  sheet.getRange(fila, 1, 1, COLS).setValues([headerRow])
    .setBackground(CLR_HDR).setFontColor(CLR_HDR_FONT).setFontWeight('bold').setFontSize(10)
    .setHorizontalAlignment('center').setFontFamily('Arial');
  fila++;
  
  // Data rows — batch write
  var rows = [];
  for (var i = 0; i < docs.length; i++) {
    var d = docs[i];
    rows.push([d.rutFmt, d.nombre, d.tipoDoc, d.numDoc, d.fechaDoc, d.montoReg, d.montoReb, d.saldo, d.dias, d.tramo]);
  }
  
  if (rows.length > 0) {
    sheet.getRange(fila, 1, rows.length, COLS).setValues(rows).setFontSize(10).setFontFamily('Arial');
    
    // Formatos numéricos
    sheet.getRange(fila, 6, rows.length, 3).setNumberFormat('$#,##0'); // Registro, Rebajas, Saldo
    sheet.getRange(fila, 9, rows.length, 1).setHorizontalAlignment('center'); // Días
    sheet.getRange(fila, 10, rows.length, 1).setHorizontalAlignment('center'); // Tramo
    sheet.getRange(fila, 3, rows.length, 1).setHorizontalAlignment('center'); // Tipo
    
    // Zebra + conditional color for días
    for (var i = 0; i < rows.length; i++) {
      if (i % 2 === 1) sheet.getRange(fila + i, 1, 1, COLS).setBackground(CLR_ZEBRA);
      // Colorear saldo en rojo
      sheet.getRange(fila + i, 8).setFontColor('#dc2626').setFontWeight('bold');
      // Colorear días según tramo
      var dias = docs[i].dias;
      var dColor = dias > 365 ? '#991b1b' : dias > 180 ? '#ef4444' : dias > 90 ? '#f97316' : dias > 60 ? '#eab308' : dias > 30 ? '#84cc16' : '#22c55e';
      sheet.getRange(fila + i, 9).setFontColor(dColor).setFontWeight('bold');
    }
    
    // Bordes
    sheet.getRange(fila - 1, 1, rows.length + 1, COLS)
      .setBorder(true, true, true, true, true, true, CLR_BORDER, SpreadsheetApp.BorderStyle.SOLID);
    
    // Total row
    var filaTotal = fila + rows.length;
    sheet.getRange(filaTotal, 1, 1, 5).merge().setValue('TOTAL').setFontWeight('bold').setHorizontalAlignment('right').setFontFamily('Arial').setFontSize(10);
    sheet.getRange(filaTotal, 6).setValue(docs.reduce(function(s,d){return s+d.montoReg},0)).setNumberFormat('$#,##0').setFontWeight('bold').setFontFamily('Arial').setFontSize(10);
    sheet.getRange(filaTotal, 7).setValue(docs.reduce(function(s,d){return s+d.montoReb},0)).setNumberFormat('$#,##0').setFontWeight('bold').setFontFamily('Arial').setFontSize(10);
    sheet.getRange(filaTotal, 8).setValue(data.totalPendiente).setNumberFormat('$#,##0').setFontWeight('bold').setFontColor('#dc2626').setFontFamily('Arial').setFontSize(10);
    sheet.getRange(filaTotal, 9, 1, 2).merge().setValue(data.cantDocumentos + ' docs').setHorizontalAlignment('center').setFontWeight('bold').setFontFamily('Arial').setFontSize(10);
    sheet.getRange(filaTotal, 1, 1, COLS).setBackground(CLR_TRAMO)
      .setBorder(true, true, true, true, true, true, CLR_BORDER, SpreadsheetApp.BorderStyle.SOLID);
  }
  
  // Auto-resize columns
  for (var c = 1; c <= COLS; c++) sheet.autoResizeColumn(c);
  // Freeze headers
  sheet.setFrozenRows(fila - 1);
  
  // ── EXPORTAR COMO XLSX (mismo patrón que Reportes_Excel) ──
  var nombre = 'Morosos_CxC_' + hoy.getFullYear() + ('0'+(hoy.getMonth()+1)).slice(-2) + ('0'+hoy.getDate()).slice(-2);
  
  return toClient({
    url: 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx',
    nombre: nombre + '.xlsx',
    id: ss.getId()
  });
}