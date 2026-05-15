/**
 * ============================================================================
 * Ficha.gs — Módulo Ficha Comercial
 * ============================================================================
 * CRUD completo + KPIs comerciales + métricas crecimiento + cruce CxC
 * ============================================================================
 */

// UI WRAPPERS
function getFichaDataUI() { return toClient(getFichaData_()); }
function getFichaClienteUI(rut) { return toClient(getFichaCliente_(rut)); }
function guardarFichaClienteUI(datos, esNuevo) { return toClient(guardarFichaCliente_(datos, esNuevo)); }
function cambiarEstadoFichaUI(rut, nuevoEstado) { return toClient(cambiarEstadoFicha_(rut, nuevoEstado)); }
function eliminarFichaClienteUI(rut) { return toClient(eliminarFichaCliente_(rut)); }

// =============================================================================
// OBTENER TODOS + KPIs + MÉTRICAS CRECIMIENTO
// =============================================================================

function getFichaData_() {
  var ss = getSS();
  var sheet = ss.getSheetByName('Ficha_Comercial');
  if (!sheet) return { error: 'Hoja Ficha_Comercial no encontrada' };
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { clientes: [], kpis: {}, metricas: {} };
  
  var headers = data[0];
  var colMap = {};
  for (var h = 0; h < headers.length; h++) colMap[String(headers[h]).trim()] = h;
  
  // CxC cruzado
  var saldosCxC = {};
  try {
    var cxcData = getClientesLista_();
    if (cxcData && cxcData.clientes) {
      for (var c = 0; c < cxcData.clientes.length; c++) {
        var cl = cxcData.clientes[c];
        saldosCxC[limpiarRUT(cl.rut)] = { saldo: cl.saldo, docs: cl.cantDocs, dias: cl.diasMax };
      }
    }
  } catch(e) {}
  
  var clientes = [];
  var hoy = new Date();
  var añoActual = hoy.getFullYear();
  
  // KPIs
  var kpis = { total: 0, activos: 0, inactivos: 0, mrrUF: 0, tarifaPromUF: 0, 
               descuentosActivos: 0, totalCxC: 0, churnRate: 0 };
  
  // Métricas de crecimiento
  var ingresosPorMes = {};  // { "2026-01": count, ... }
  var bajasPorMes = {};
  var ingresosAño = 0;
  var bajasAño = 0;
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rut = String(row[colMap.RUT] || '').trim();
    if (!rut) continue;
    
    var estado = String(row[colMap.ESTADO] || '').trim();
    var esActivo = estado === 'Activo';
    var tarifaSusc = parseFloat(row[colMap.TARIFA_SUSCRIPCION_UF]) || 0;
    var tarifaCap = parseFloat(row[colMap.TARIFA_CAPACITACION_UF]) || 0;
    var descPct = parseFloat(row[colMap.DESCUENTO_COMERCIAL]) || 0;
    var descMeses = String(row[colMap.DESCUENTO_MESES] || '').trim();
    var fechaIng = parseFechaFicha_(row[colMap.FECHA_INGRESO]);
    var fechaCap = parseFechaFicha_(row[colMap.FECHA_CAPACITACION]);
    var fechaInact = parseFechaFicha_(row[colMap.FECHA_INACTIVIDAD]);
    var fechaFactCap = parseFechaFicha_(row[colMap.FECHA_FACTURA_CAPACITACION]);
    var pagoCuotas = String(row[colMap.PAGO_CUOTAS_CAPACITACION] || '').trim();
    
    // Meses como cliente
    var mesesCliente = 0;
    if (fechaIng) mesesCliente = (hoy.getFullYear() - fechaIng.getFullYear()) * 12 + (hoy.getMonth() - fechaIng.getMonth());
    
    // Descuento activo
    var descMesesNum = parseInt(descMeses) || 0;
    var descuentoActivo = false;
    var fechaFinDesc = null;
    if (descPct > 0 && descMesesNum > 0 && fechaIng) {
      fechaFinDesc = new Date(fechaIng);
      fechaFinDesc.setMonth(fechaFinDesc.getMonth() + descMesesNum);
      descuentoActivo = hoy < fechaFinDesc;
    }
    
    // Tarifa efectiva
    var tarifaEfectiva = tarifaSusc;
    if (descuentoActivo) tarifaEfectiva = tarifaSusc * (1 - descPct / 100);
    
    // CxC
    var rutLimpio = limpiarRUT(rut);
    var cxc = saldosCxC[rutLimpio] || { saldo: 0, docs: 0, dias: 0 };
    
    // Métricas crecimiento — ingresos por mes
    if (fechaIng) {
      var keyIng = fechaIng.getFullYear() + '-' + ('0' + (fechaIng.getMonth()+1)).slice(-2);
      ingresosPorMes[keyIng] = (ingresosPorMes[keyIng] || 0) + 1;
      if (fechaIng.getFullYear() === añoActual) ingresosAño++;
    }
    // Bajas por mes
    if (fechaInact) {
      var keyBaj = fechaInact.getFullYear() + '-' + ('0' + (fechaInact.getMonth()+1)).slice(-2);
      bajasPorMes[keyBaj] = (bajasPorMes[keyBaj] || 0) + 1;
      if (fechaInact.getFullYear() === añoActual) bajasAño++;
    }
    
    var cliente = {
      rowIndex: i + 1, rut: rut,
      razonSocial: String(row[colMap.RAZON_SOCIAL] || ''),
      email: String(row[colMap.EMAIL] || ''),
      estado: estado,
      fechaInactividad: fmtFechaFicha_(fechaInact),
      tarifaSuscUF: tarifaSusc,
      tarifaCapUF: tarifaCap,
      fechaCapacitacion: fmtFechaFicha_(fechaCap),
      descuentoPct: descPct,
      descuentoMeses: descMeses,
      descuentoActivo: descuentoActivo,
      fechaFinDescuento: fechaFinDesc ? fmtFechaFicha_(fechaFinDesc) : '',
      fechaIngreso: fmtFechaFicha_(fechaIng),
      fechaPrimeraFactura: fmtFechaFicha_(parseFechaFicha_(row[colMap.FECHA_PRIMERA_FACTURA])),
      facturacionTipo: String(row[colMap.FACTURACION_TIPO] || ''),
      tipoDoc: String(row[colMap.TIPO_DOC] || ''),
      pagoCuotasCap: pagoCuotas,
      notas: String(row[colMap.NOTAS] || ''),
      giro: String(row[colMap.GIRO] || ''),
      direccion: String(row[colMap.DIRECCION] || ''),
      telefono: String(row[colMap.TELEFONO] || ''),
      fechaFactCap: fmtFechaFicha_(fechaFactCap),
      mesesCliente: mesesCliente,
      tarifaEfectiva: Math.round(tarifaEfectiva * 100) / 100,
      saldoCxC: cxc.saldo, docsCxC: cxc.docs, diasCxC: cxc.dias
    };
    
    clientes.push(cliente);
    
    kpis.total++;
    if (esActivo) { kpis.activos++; kpis.mrrUF += tarifaEfectiva; }
    else { kpis.inactivos++; }
    if (descuentoActivo) kpis.descuentosActivos++;
    kpis.totalCxC += cxc.saldo;
  }
  
  kpis.tarifaPromUF = kpis.activos > 0 ? Math.round(kpis.mrrUF / kpis.activos * 100) / 100 : 0;
  kpis.mrrUF = Math.round(kpis.mrrUF * 100) / 100;
  kpis.churnRate = kpis.total > 0 ? Math.round(kpis.inactivos / kpis.total * 1000) / 10 : 0;
  
  // Métricas de crecimiento
  var mesesConDatos = Object.keys(ingresosPorMes).length;
  var metricas = {
    ingresosAño: ingresosAño,
    bajasAño: bajasAño,
    netoCrecimiento: ingresosAño - bajasAño,
    promedioIngMes: mesesConDatos > 0 ? Math.round(kpis.total / mesesConDatos * 10) / 10 : 0,
    ingresosPorMes: [],
    bajasPorMes: []
  };
  
  // Últimos 12 meses para gráfico
  for (var m = 11; m >= 0; m--) {
    var d = new Date(hoy.getFullYear(), hoy.getMonth() - m, 1);
    var key = d.getFullYear() + '-' + ('0' + (d.getMonth()+1)).slice(-2);
    var nombreMes = getNombreMes(d.getMonth()+1);
    metricas.ingresosPorMes.push({ mes: key, nombre: nombreMes.substring(0,3), ingresos: ingresosPorMes[key] || 0, bajas: bajasPorMes[key] || 0 });
  }
  
  // Alertas (solo morosos y descuentos)
  var alertas = [];
  for (var i = 0; i < clientes.length; i++) {
    var c = clientes[i];
    if (c.estado === 'Activo' && c.saldoCxC > 0 && c.diasCxC > 30)
      alertas.push({ tipo: 'moroso', rut: c.rut, nombre: c.razonSocial, detalle: 'Deuda $' + Math.round(c.saldoCxC).toLocaleString('es-CL') + ' (' + c.diasCxC + ' días)' });
    if (c.descuentoActivo)
      alertas.push({ tipo: 'descuento', rut: c.rut, nombre: c.razonSocial, detalle: 'Descuento ' + c.descuentoPct + '% vigente hasta ' + c.fechaFinDescuento });
  }
  
  clientes.sort(function(a, b) {
    if (a.estado !== b.estado) return a.estado === 'Activo' ? -1 : 1;
    return a.razonSocial.localeCompare(b.razonSocial);
  });
  
  return { clientes: clientes, kpis: kpis, metricas: metricas, alertas: alertas };
}

// =============================================================================
// OBTENER UN CLIENTE
// =============================================================================

function getFichaCliente_(rut) {
  var data = getFichaData_();
  if (data.error) return data;
  var rutBusc = limpiarRUT(rut);
  for (var i = 0; i < data.clientes.length; i++) {
    if (limpiarRUT(data.clientes[i].rut) === rutBusc) return data.clientes[i];
  }
  return { error: 'Cliente no encontrado' };
}

// =============================================================================
// GUARDAR / CREAR
// =============================================================================

function guardarFichaCliente_(datos, esNuevo) {
  validarAccesoEscritura_();
  var ss = getSS();
  var sheet = ss.getSheetByName('Ficha_Comercial');
  if (!sheet) return { success: false, error: 'Hoja no encontrada' };
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var colMap = {};
  for (var h = 0; h < headers.length; h++) colMap[String(headers[h]).trim()] = h;
  
  if (!datos.rut) return { success: false, error: 'RUT es requerido' };
  var rutLimpio = limpiarRUT(datos.rut);
  if (!validarDVRut_(datos.rut)) return { success: false, error: 'RUT inválido' };
  
  if (esNuevo) {
    for (var i = 1; i < data.length; i++) {
      if (limpiarRUT(String(data[i][colMap.RUT] || '')) === rutLimpio)
        return { success: false, error: 'RUT ya existe en la ficha' };
    }
    var newRow = new Array(headers.length).fill('');
    setFichaRow_(newRow, colMap, datos);
    sheet.appendRow(newRow);
  } else {
    var fila = -1;
    for (var i = 1; i < data.length; i++) {
      if (limpiarRUT(String(data[i][colMap.RUT] || '')) === rutLimpio) { fila = i + 1; break; }
    }
    if (fila === -1) return { success: false, error: 'Cliente no encontrado' };
    var rowData = sheet.getRange(fila, 1, 1, headers.length).getValues()[0];
    setFichaRow_(rowData, colMap, datos);
    sheet.getRange(fila, 1, 1, headers.length).setValues([rowData]);
  }
  
  try { asegurarAuxiliar_(rutLimpio, datos.razonSocial || '', 'CLIENTE'); } catch(e) {}
  return { success: true, mensaje: esNuevo ? 'Cliente creado' : 'Cliente actualizado' };
}

function setFichaRow_(row, colMap, d) {
  var fields = {
    'RUT': d.rut, 'RAZON_SOCIAL': d.razonSocial, 'EMAIL': d.email, 'ESTADO': d.estado,
    'FECHA_INACTIVIDAD': d.fechaInactividad, 'TARIFA_SUSCRIPCION_UF': parseFloat(d.tarifaSuscUF) || 0,
    'TARIFA_CAPACITACION_UF': parseFloat(d.tarifaCapUF) || 0, 'FECHA_CAPACITACION': d.fechaCapacitacion,
    'DESCUENTO_COMERCIAL': parseFloat(d.descuentoPct) || '', 'DESCUENTO_MESES': d.descuentoMeses,
    'FECHA_INGRESO': d.fechaIngreso, 'FECHA_PRIMERA_FACTURA': d.fechaPrimeraFactura,
    'FACTURACION_TIPO': d.facturacionTipo, 'TIPO_DOC': d.tipoDoc,
    'PAGO_CUOTAS_CAPACITACION': d.pagoCuotasCap, 'NOTAS': d.notas,
    'GIRO': d.giro, 'DIRECCION': d.direccion, 'TELEFONO': d.telefono,
    'FECHA_FACTURA_CAPACITACION': d.fechaFactCap
  };
  for (var key in fields) {
    if (fields[key] !== undefined && colMap[key] !== undefined) row[colMap[key]] = fields[key] || '';
  }
}

// =============================================================================
// CAMBIAR ESTADO / ELIMINAR
// =============================================================================

function cambiarEstadoFicha_(rut, nuevoEstado) {
  validarAccesoEscritura_();
  var ss = getSS();
  var sheet = ss.getSheetByName('Ficha_Comercial');
  if (!sheet) return { success: false, error: 'Hoja no encontrada' };
  var data = sheet.getDataRange().getValues();
  var colMap = {};
  for (var h = 0; h < data[0].length; h++) colMap[String(data[0][h]).trim()] = h;
  var rutBusc = limpiarRUT(rut);
  for (var i = 1; i < data.length; i++) {
    if (limpiarRUT(String(data[i][colMap.RUT] || '')) === rutBusc) {
      sheet.getRange(i+1, colMap.ESTADO+1).setValue(nuevoEstado);
      sheet.getRange(i+1, colMap.FECHA_INACTIVIDAD+1).setValue(nuevoEstado === 'Inactivo' ? new Date() : '');
      return { success: true, mensaje: 'Estado cambiado a ' + nuevoEstado };
    }
  }
  return { success: false, error: 'Cliente no encontrado' };
}

function eliminarFichaCliente_(rut) {
  validarAccesoEscritura_();
  var ss = getSS();
  var sheet = ss.getSheetByName('Ficha_Comercial');
  if (!sheet) return { success: false, error: 'Hoja no encontrada' };
  var data = sheet.getDataRange().getValues();
  var colMap = {};
  for (var h = 0; h < data[0].length; h++) colMap[String(data[0][h]).trim()] = h;
  var rutBusc = limpiarRUT(rut);
  for (var i = 1; i < data.length; i++) {
    if (limpiarRUT(String(data[i][colMap.RUT] || '')) === rutBusc) {
      sheet.deleteRow(i + 1);
      return { success: true, mensaje: 'Cliente eliminado' };
    }
  }
  return { success: false, error: 'Cliente no encontrado' };
}

// =============================================================================
// UTILS
// =============================================================================

function parseFechaFicha_(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  var d = new Date(String(val).trim());
  return isNaN(d.getTime()) ? null : d;
}

function fmtFechaFicha_(d) {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
  return ('0'+d.getDate()).slice(-2) + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + d.getFullYear();
}

// =============================================================================
// REPORTE FACTURACIÓN — Proyección y Pendientes
// =============================================================================

function getReporteFacturacionUI(año, mes, valorUF) {
  return toClient(getReporteFacturacion_(año, mes, valorUF));
}

function exportarFacturacionExcelUI(año, mes, valorUF) {
  return toClient(exportarFacturacionExcel_(año, mes, valorUF));
}

function getReporteFacturacion_(año, mes, valorUF) {
  año = parseInt(año); mes = parseInt(mes);
  valorUF = parseFloat(valorUF) || 38000;
  var hoy = new Date();
  var esActual = (año === hoy.getFullYear() && mes === hoy.getMonth() + 1);
  var esFuturo = (año > hoy.getFullYear()) || (año === hoy.getFullYear() && mes > hoy.getMonth() + 1);
  
  // 1) Leer clientes activos de Ficha_Comercial
  var ss = getSS();
  var sheet = ss.getSheetByName('Ficha_Comercial');
  if (!sheet) return { error: 'Hoja Ficha_Comercial no encontrada' };
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var colMap = {};
  for (var h = 0; h < headers.length; h++) colMap[String(headers[h]).trim()] = h;
  
  // 2) Leer facturas ya emitidas en el mes (Ventas_SII) — para mes actual Y pasados
  var facturado = {};
  if (!esFuturo) {
    try {
      var sheetV = buscarHoja(ss, getSheetNames().VENTAS);
      if (sheetV) {
        var dv = sheetV.getDataRange().getValues();
        for (var v = 1; v < dv.length; v++) {
          var tipoDTE = parseInt(dv[v][1]) || 0;
          if (tipoDTE !== 33 && tipoDTE !== 34) continue;
          var fv = parseFechaFicha_(dv[v][6]);
          if (!fv || fv.getFullYear() !== año || fv.getMonth() + 1 !== mes) continue;
          var rutV = limpiarRUT(String(dv[v][3] || ''));
          if (!facturado[rutV]) facturado[rutV] = [];
          facturado[rutV].push({
            folio: String(dv[v][5]),
            neto: parseFloat(dv[v][11]) || 0,
            total: parseFloat(dv[v][13]) || 0,
            fecha: fmtFechaFicha_(fv)
          });
        }
      }
    } catch(e) {}
  }
  
  // 3) Procesar cada cliente activo
  var lineas = [];
  var totales = { anticipado: { uf: 0, pesos: 0, count: 0 }, vencido: { uf: 0, pesos: 0, count: 0 },
                  facturado: { uf: 0, pesos: 0, count: 0 }, pendiente: { uf: 0, pesos: 0, count: 0 } };
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var estado = String(row[colMap.ESTADO] || '').trim();
    if (estado !== 'Activo') continue;
    
    var rut = String(row[colMap.RUT] || '').trim();
    var rutLimpio = limpiarRUT(rut);
    var razon = String(row[colMap.RAZON_SOCIAL] || '');
    var tarifa = parseFloat(row[colMap.TARIFA_SUSCRIPCION_UF]) || 0;
    var descPct = parseFloat(row[colMap.DESCUENTO_COMERCIAL]) || 0;
    var descMeses = String(row[colMap.DESCUENTO_MESES] || '').trim();
    var fechaIng = parseFechaFicha_(row[colMap.FECHA_INGRESO]);
    var factTipo = String(row[colMap.FACTURACION_TIPO] || 'Mes Vencido');
    var tipoDoc = String(row[colMap.TIPO_DOC] || 'Factura');
    var tipoPlan = colMap.TIPO_PLAN !== undefined ? String(row[colMap.TIPO_PLAN] || '').trim() : '';
    
    // Calcular descuento activo para el mes consultado
    var descMesesNum = parseInt(descMeses) || 0;
    var descActivo = false;
    if (descPct > 0 && descMesesNum > 0 && fechaIng) {
      var fechaFinDesc = new Date(fechaIng);
      fechaFinDesc.setMonth(fechaFinDesc.getMonth() + descMesesNum);
      var mesFin = new Date(año, mes - 1, 1);
      descActivo = mesFin < fechaFinDesc;
    }
    
    var tarifaEfectiva = tarifa;
    if (descActivo) tarifaEfectiva = Math.round(tarifa * (1 - descPct / 100) * 100) / 100;
    var totalBruto = Math.round(tarifaEfectiva * valorUF);
    var netoSinIVA = Math.round(totalBruto / 1.19);
    var iva = totalBruto - netoSinIVA;
    var total = totalBruto;
    
    // Determinar en qué mes factura
    // Mes Anticipado: se factura a inicio del mes → en marzo se factura marzo
    // Mes Vencido: se factura a fin del mes → en marzo se factura marzo (al cierre)
    var mesBilling = mes;
    
    // Estado: facturado o pendiente (mes actual y pasados cruzan con Ventas_SII)
    var estadoFact = esFuturo ? 'PENDIENTE' : 'PROYECCIÓN';
    var folioFact = '';
    var totalFact = 0;
    
    if (!esFuturo) {
      var facs = facturado[rutLimpio] || [];
      if (facs.length > 0) {
        estadoFact = 'FACTURADO';
        folioFact = facs.map(function(f) { return 'F-' + f.folio; }).join(', ');
        totalFact = facs.reduce(function(s, f) { return s + f.total; }, 0);
        totales.facturado.uf += tarifaEfectiva;
        totales.facturado.pesos += totalFact;
        totales.facturado.count++;
      } else {
        estadoFact = 'PENDIENTE';
        totales.pendiente.uf += tarifaEfectiva;
        totales.pendiente.pesos += total;
        totales.pendiente.count++;
      }
    }
    
    if (factTipo === 'Mes Anticipado') {
      totales.anticipado.uf += tarifaEfectiva;
      totales.anticipado.pesos += total;
      totales.anticipado.count++;
    } else {
      totales.vencido.uf += tarifaEfectiva;
      totales.vencido.pesos += total;
      totales.vencido.count++;
    }
    
    // Calcular fecha fin descuento formateada
    var fechaFinDctoStr = '';
    if (descPct > 0 && descMesesNum > 0 && fechaIng) {
      var fechaFinDesc = new Date(fechaIng);
      fechaFinDesc.setMonth(fechaFinDesc.getMonth() + descMesesNum);
      fechaFinDctoStr = fmtMesAño_(fechaFinDesc);
    }
    
    lineas.push({
      rut: rut, razonSocial: razon, email: String(row[colMap.EMAIL] || ''),
      factTipo: factTipo, tipoDoc: tipoDoc,
      tarifaBase: tarifa, descPct: descActivo ? descPct : 0, descActivo: descActivo,
      descOriginal: descPct, fechaFinDcto: fechaFinDctoStr,
      tarifaEfectiva: tarifaEfectiva,
      neto: netoSinIVA, iva: iva, total: total,
      estado: estadoFact, folioFact: folioFact, totalFact: totalFact,
      tipoPlan: tipoPlan
    });
  }
  
  // Ordenar: pendientes primero, luego anticipado/vencido, luego nombre
  lineas.sort(function(a, b) {
    if (a.estado !== b.estado) {
      if (a.estado === 'PENDIENTE') return -1;
      if (b.estado === 'PENDIENTE') return 1;
    }
    if (a.factTipo !== b.factTipo) return a.factTipo.localeCompare(b.factTipo);
    return a.razonSocial.localeCompare(b.razonSocial);
  });
  
  return {
    lineas: lineas, totales: totales,
    mes: mes, año: año, nombreMes: MESES_NOMBRE[mes] || getNombreMes(mes),
    valorUF: valorUF, esActual: esActual, esFuturo: esFuturo
  };
}

// =============================================================================
// EXPORT EXCEL — Facturación
// =============================================================================

function exportarFacturacionExcel_(año, mes, valorUF) {
  var data = getReporteFacturacion_(año, mes, valorUF);
  if (data.error) return { error: data.error };
  
  var nombre = 'Facturacion_' + data.nombreMes + '_' + año;
  var wb = SpreadsheetApp.create(nombre);
  var sh = wb.getActiveSheet();
  sh.setName('Facturación');
  
  var COLS = 14;
  var UF_CELL = '$N$3';
  var fila = 1;
  
  // ── ROW 1: HEADER ──
  sh.getRange(fila, 1, 1, COLS).merge()
    .setValue('NOTIFICA LEGAL SpA')
    .setFontSize(16).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#1e1b4b').setHorizontalAlignment('center');
  fila++;
  
  // ── ROW 2: SUBTÍTULO ──
  sh.getRange(fila, 1, 1, COLS).merge()
    .setValue('Reporte de Facturación — ' + data.nombreMes + ' ' + año)
    .setFontSize(12).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#4338ca').setHorizontalAlignment('center');
  fila++;
  
  // ── ROW 3: INFO + UF en N3 ──
  sh.getRange(fila, 1, 1, 12).merge()
    .setValue('Generado: ' + Utilities.formatDate(new Date(), 'America/Santiago', 'dd-MM-yyyy HH:mm'))
    .setFontSize(9).setFontColor('#94a3b8').setBackground('#f8fafc');
  sh.getRange(fila, 13).setValue('Valor UF →')
    .setFontSize(10).setFontWeight('bold').setFontColor('#1e1b4b').setBackground('#fef3c7').setHorizontalAlignment('right');
  sh.getRange(fila, 14).setValue(valorUF)
    .setFontSize(12).setFontWeight('bold').setFontColor('#4f46e5').setBackground('#fef3c7')
    .setNumberFormat('#,##0.00').setHorizontalAlignment('center');
  wb.setNamedRange('VALOR_UF', sh.getRange(fila, 14));
  fila += 2; // row 5
  
  // ── ROWS 5-8: RESUMEN (se llenará con fórmulas DESPUÉS de escribir la tabla) ──
  var filaResumen = fila;
  fila += 4; // Reservar 4 filas para resumen (header + 3 datos)
  fila++; // Espacio
  
  // ── TABLA ÚNICA CON TODOS LOS CLIENTES ──
  // Ordenar: PENDIENTE primero, luego FACTURADO, luego PROYECCIÓN
  var lineas = data.lineas;
  lineas.sort(function(a, b) {
    var ord = { 'PENDIENTE': 0, 'FACTURADO': 1, 'PROYECCIÓN': 2 };
    var oa = ord[a.estado] !== undefined ? ord[a.estado] : 3;
    var ob = ord[b.estado] !== undefined ? ord[b.estado] : 3;
    if (oa !== ob) return oa - ob;
    if (a.factTipo !== b.factTipo) return a.factTipo.localeCompare(b.factTipo);
    return a.razonSocial.localeCompare(b.razonSocial);
  });
  
  var filaTablaHeader = fila;
  fila = escribirTablaConFormulas_(sh, fila, lineas, COLS, UF_CELL);
  var filaTablaInicio = filaTablaHeader + 1; // Primera fila de datos
  var filaTablaFin = fila - 2; // Última fila de datos (antes del total)
  
  // ── AHORA LLENAR RESUMEN CON FÓRMULAS ──
  var rng = function(col) { return col + filaTablaInicio + ':' + col + filaTablaFin; };
  // Col C = Tipo Fact, Col I = Tarifa Efectiva UF, Col J = Total $, Col M = Estado
  
  var rc = data.esFuturo ? 4 : 6; // 4 cols sin facturado/pendiente, 6 con
  var resHeaders = ['', 'Anticipado', 'Vencido', 'Total'];
  if (!data.esFuturo) resHeaders.push('Facturado', 'Pendiente');
  
  var fr = filaResumen;
  sh.getRange(fr, 1, 1, rc).setValues([resHeaders])
    .setFontSize(9).setFontWeight('bold').setFontColor('#475569').setBackground('#f1f5f9');
  fr++;
  
  // Fila Clientes (COUNTIFS)
  sh.getRange(fr, 1).setValue('Clientes').setFontWeight('bold').setFontColor('#1e1b4b');
  sh.getRange(fr, 2).setFormula('=COUNTIFS(' + rng('C') + ',"Mes Anticipado")');
  sh.getRange(fr, 3).setFormula('=COUNTIFS(' + rng('C') + ',"Mes Vencido")');
  sh.getRange(fr, 4).setFormula('=B' + fr + '+C' + fr);
  if (!data.esFuturo) {
    sh.getRange(fr, 5).setFormula('=COUNTIFS(' + rng('M') + ',"FACTURADO")');
    sh.getRange(fr, 6).setFormula('=COUNTIFS(' + rng('M') + ',"PENDIENTE")');
  }
  fr++;
  
  // Fila UF (SUMIFS)
  sh.getRange(fr, 1).setValue('UF').setFontWeight('bold').setFontColor('#1e1b4b');
  sh.getRange(fr, 2).setFormula('=SUMIFS(' + rng('I') + ',' + rng('C') + ',"Mes Anticipado")').setNumberFormat('#,##0.00');
  sh.getRange(fr, 3).setFormula('=SUMIFS(' + rng('I') + ',' + rng('C') + ',"Mes Vencido")').setNumberFormat('#,##0.00');
  sh.getRange(fr, 4).setFormula('=B' + fr + '+C' + fr).setNumberFormat('#,##0.00');
  if (!data.esFuturo) {
    sh.getRange(fr, 5).setFormula('=SUMIFS(' + rng('I') + ',' + rng('M') + ',"FACTURADO")').setNumberFormat('#,##0.00');
    sh.getRange(fr, 6).setFormula('=SUMIFS(' + rng('I') + ',' + rng('M') + ',"PENDIENTE")').setNumberFormat('#,##0.00');
  }
  fr++;
  
  // Fila Pesos c/IVA (SUMIFS)
  sh.getRange(fr, 1).setValue('Pesos (c/IVA)').setFontWeight('bold').setFontColor('#1e1b4b');
  sh.getRange(fr, 2).setFormula('=SUMIFS(' + rng('J') + ',' + rng('C') + ',"Mes Anticipado")').setNumberFormat('#,##0');
  sh.getRange(fr, 3).setFormula('=SUMIFS(' + rng('J') + ',' + rng('C') + ',"Mes Vencido")').setNumberFormat('#,##0');
  sh.getRange(fr, 4).setFormula('=B' + fr + '+C' + fr).setNumberFormat('#,##0');
  if (!data.esFuturo) {
    sh.getRange(fr, 5).setFormula('=SUMIFS(' + rng('J') + ',' + rng('M') + ',"FACTURADO")').setNumberFormat('#,##0');
    sh.getRange(fr, 6).setFormula('=SUMIFS(' + rng('J') + ',' + rng('M') + ',"PENDIENTE")').setNumberFormat('#,##0');
  }
  
  // Autofit
  for (var c = 1; c <= COLS; c++) sh.autoResizeColumn(c);
  
  // Hoja referencia Planes
  var shRef = wb.insertSheet('Tipos de Planes');
  crearHojaPlanesExcel_(shRef);
  wb.setActiveSheet(sh);
  
  return {
    url: 'https://docs.google.com/spreadsheets/d/' + wb.getId() + '/export?format=xlsx',
    nombre: nombre + '.xlsx',
    id: wb.getId()
  };
}

function crearHojaPlanesExcel_(sh) {
  var f = 1;
  sh.getRange(f,1,1,5).merge().setValue('TIPOS DE PLANES COMERCIALES').setFontSize(13).setFontWeight('bold').setFontColor('#fff').setBackground('#1e1b4b').setHorizontalAlignment('center');
  f += 2;
  // Plan A
  sh.getRange(f,1,1,3).merge().setValue('PLAN A — Encargos').setFontSize(11).setFontWeight('bold').setFontColor('#fff').setBackground('#2563eb');
  f++;
  sh.getRange(f,1,1,3).setValues([['Nivel','UF Mensual','Límite']]).setFontWeight('bold').setBackground('#dbeafe').setFontSize(9);
  f++;
  sh.getRange(f,1,4,3).setValues([['Básico',2.5,'Hasta 300 encargos'],['Estándar',3.2,'Hasta 500 encargos'],['Medio',3.6,'Hasta 1.000 encargos'],['Estrella',3.9,'Sin límite']]);
  sh.getRange(f,2,4,1).setNumberFormat('#,##0.0');
  f += 5;
  // Plan B
  sh.getRange(f,1,1,3).merge().setValue('PLAN B — Causas').setFontSize(11).setFontWeight('bold').setFontColor('#fff').setBackground('#d97706');
  f++;
  sh.getRange(f,1,1,3).setValues([['Nivel','UF Mensual','Límite']]).setFontWeight('bold').setBackground('#fef3c7').setFontSize(9);
  f++;
  sh.getRange(f,1,4,3).setValues([['Básico',1.5,'Hasta 100 causas'],['Estándar',2.5,'Hasta 350 causas'],['Medio',3.3,'Hasta 500 causas'],['Estrella',3.9,'Sin límite']]);
  sh.getRange(f,2,4,1).setNumberFormat('#,##0.0');
  f += 5;
  // Plan C
  sh.getRange(f,1,1,3).merge().setValue('PLAN C — Especial (sin Estándar)').setFontSize(11).setFontWeight('bold').setFontColor('#fff').setBackground('#059669');
  f++;
  sh.getRange(f,1,1,3).setValues([['Nivel','UF Mensual','Límite']]).setFontWeight('bold').setBackground('#d1fae5').setFontSize(9);
  f++;
  sh.getRange(f,1,3,3).setValues([['Básico',3.2,'Hasta 500 encargos'],['Medio',3.6,'Hasta 1.000 encargos'],['Estrella',3.9,'Sin límite']]);
  sh.getRange(f,2,3,1).setNumberFormat('#,##0.0');
  f += 4;
  // Plan Fijo
  sh.getRange(f,1,1,3).merge().setValue('PLAN FIJO — Tarifa única').setFontSize(11).setFontWeight('bold').setFontColor('#fff').setBackground('#7c3aed');
  f++;
  sh.getRange(f,1,1,3).setValues([['Único',2.5,'Sin límite — 12 meses']]).setFontSize(10);
  sh.getRange(f,2).setNumberFormat('#,##0.0');
  for (var c = 1; c <= 3; c++) sh.autoResizeColumn(c);
}

function escribirTablaConFormulas_(sh, fila, lineas, COLS, UF_CELL) {
  var headers = ['RUT', 'Razón Social', 'Tipo Fact.', 'Tipo Doc', 'Tipo Plan', 'Tarifa UF', 'Desc.%', 'Fin Dcto.', 'Tarifa Efectiva UF', 'Total $ (bruto)', 'Neto $', 'IVA $', 'Estado', 'Folio'];
  
  sh.getRange(fila, 1, 1, headers.length).setValues([headers])
    .setFontSize(9).setFontWeight('bold').setFontColor('#ffffff').setBackground('#334155')
    .setHorizontalAlignment('center');
  fila++;
  
  var filaInicio = fila;
  
  for (var i = 0; i < lineas.length; i++) {
    var l = lineas[i];
    var r = fila + i;
    
    sh.getRange(r, 1).setValue(l.rut);                                        // A: RUT
    sh.getRange(r, 2).setValue(l.razonSocial);                                // B: Razón
    sh.getRange(r, 3).setValue(l.factTipo);                                   // C: Tipo Fact
    sh.getRange(r, 4).setValue(l.tipoDoc);                                    // D: Tipo Doc
    sh.getRange(r, 5).setValue(l.tipoPlan || '');                             // E: Tipo Plan
    sh.getRange(r, 6).setValue(l.tarifaBase).setNumberFormat('#,##0.00');     // F: Tarifa UF
    sh.getRange(r, 7).setValue(l.descPct > 0 ? l.descPct / 100 : '').setNumberFormat('0%'); // G: Desc%
    
    // H: Fin Descuento — muestra mes/año de término con % original
    var finDcto = '';
    if (l.descOriginal > 0 && l.fechaFinDcto) {
      finDcto = l.descOriginal + '% → ' + l.fechaFinDcto;
    } else if (l.descOriginal > 0) {
      finDcto = l.descOriginal + '% Continuo';
    }
    sh.getRange(r, 8).setValue(finDcto).setFontSize(8).setHorizontalAlignment('center');
    if (finDcto && !l.descActivo && l.descOriginal > 0) {
      sh.getRange(r, 8).setFontColor('#dc2626').setFontWeight('bold'); // Venció
    } else if (l.descActivo) {
      sh.getRange(r, 8).setFontColor('#059669').setFontWeight('bold'); // Vigente
    }
    
    // I: Tarifa Efectiva (fórmula)
    sh.getRange(r, 9).setFormula('=IF(G' + r + '="",F' + r + ',ROUND(F' + r + '*(1-G' + r + '),2))').setNumberFormat('#,##0.00');
    // J: Total bruto
    sh.getRange(r, 10).setFormula('=ROUND(I' + r + '*' + UF_CELL + ')').setNumberFormat('#,##0');
    // K: Neto
    sh.getRange(r, 11).setFormula('=ROUND(J' + r + '/1.19)').setNumberFormat('#,##0');
    // L: IVA
    sh.getRange(r, 12).setFormula('=J' + r + '-K' + r).setNumberFormat('#,##0');
    // M: Estado
    sh.getRange(r, 13).setValue(l.estado);
    // N: Folio
    sh.getRange(r, 14).setValue(l.folioFact || '');
    
    // Formato base
    sh.getRange(r, 1, 1, COLS).setFontSize(9);
    if (i % 2 === 1) sh.getRange(r, 1, 1, COLS).setBackground('#f8fafc');
    
    // Color tipo facturación
    if (l.factTipo === 'Mes Anticipado') sh.getRange(r, 3).setFontColor('#2563eb').setFontWeight('bold');
    else sh.getRange(r, 3).setFontColor('#d97706').setFontWeight('bold');
    
    // Color tipo plan
    var planColor = {'Plan A':'#2563eb','Plan B':'#d97706','Plan C':'#059669','Plan Fijo':'#7c3aed'};
    sh.getRange(r, 5).setFontColor(planColor[l.tipoPlan] || '#64748b').setFontWeight('bold');
    
    // Color estado
    if (l.estado === 'FACTURADO') sh.getRange(r, 13).setFontColor('#059669').setFontWeight('bold');
    else if (l.estado === 'PENDIENTE') sh.getRange(r, 13).setFontColor('#dc2626').setFontWeight('bold');
    else sh.getRange(r, 13).setFontColor('#6366f1').setFontWeight('bold');
  }
  
  var filaFin = fila + lineas.length - 1;
  fila = filaFin + 1;
  
  if (lineas.length > 0) {
    sh.getRange(fila, 2).setValue('TOTAL');
    sh.getRange(fila, 9).setFormula('=SUM(I' + filaInicio + ':I' + filaFin + ')').setNumberFormat('#,##0.00');
    sh.getRange(fila, 10).setFormula('=SUM(J' + filaInicio + ':J' + filaFin + ')').setNumberFormat('#,##0');
    sh.getRange(fila, 11).setFormula('=SUM(K' + filaInicio + ':K' + filaFin + ')').setNumberFormat('#,##0');
    sh.getRange(fila, 12).setFormula('=SUM(L' + filaInicio + ':L' + filaFin + ')').setNumberFormat('#,##0');
    sh.getRange(fila, 13).setValue(lineas.length + ' clientes');
    sh.getRange(fila, 1, 1, COLS).setFontSize(10).setFontWeight('bold')
      .setBackground('#1e1b4b').setFontColor('#ffffff');
    fila++;
  }
  
  return fila;
}

function formatMontoExcel_(n) {
  return Math.round(Math.abs(n || 0)).toLocaleString('es-CL');
}

function fmtMesAño_(d) {
  if (!d || !(d instanceof Date)) return '';
  var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return meses[d.getMonth()] + '-' + d.getFullYear();
}


// =============================================================================
// OBTENER VALOR UF DEL DÍA (mindicador.cl)
// =============================================================================

function getValorUFUI() {
  return toClient(getValorUF_());
}

function getValorUF_() {
  try {
    var response = UrlFetchApp.fetch('https://mindicador.cl/api', { muteHttpExceptions: true });
    var data = JSON.parse(response.getContentText());
    return {
      uf: data.uf.valor,
      fecha: data.uf.fecha,
      dolar: data.dolar.valor,
      utm: data.utm.valor
    };
  } catch(e) {
    return { uf: 0, error: e.message };
  }
}