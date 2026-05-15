/**
 * ============================================================================
 * Email.gs — Envío de Facturas y Cobranza por Email
 * ============================================================================
 * - Busca PDFs en Drive por folio (Suscripciones/{año}/{mes} o Implementación)
 * - Genera emails HTML corporativos
 * - Crea borradores en Gmail con PDF adjunto
 * - Envío masivo de facturación mensual
 * - Cobranza por niveles (recordatorio, urgente, crítico)
 * ============================================================================
 */

var EMAIL_CONFIG = {
  CARPETA_FACTURAS: '1ipEPKkLDaCdpa1ZmoF6SsYtd0iPMZXRC',
  CARPETA_SUSCRIPCIONES: '1qCV0PwQAvlFXxlaAeFYYd4AAIEm1gpvH',
  CARPETA_IMPLEMENTACION: '1C3HeZZfAwqMtFL5sdGIMcHrPvlI23xmS',
  CC_DEFAULT: 'carlos@notificalegal.cl, vicente@notificalegal.cl',
  REMITENTE: 'Notifica Legal',
  BANCO: 'Santander',
  TIPO_CUENTA: 'Cuenta Corriente',
  CUENTA: '0-000-9698176-7',
  RUT_EMPRESA: '78.036.379-7',
  RAZON_EMPRESA: 'Notifica Legal SpA',
  EMAIL_PAGOS: 'tesoreria@notificalegal.cl'
};

var MESES_NOMBRE = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// =============================================================================
// UI WRAPPERS
// =============================================================================

function getEmailConfigUI() { return toClient(EMAIL_CONFIG); }
function getFacturasMesUI(año, mes) { return toClient(getFacturasMes_(año, mes)); }
function enviarFacturaUI(datos) { return toClient(enviarFactura_(datos)); }
function enviarFacturasMasivoUI(facturas, cc) { return toClient(enviarFacturasMasivo_(facturas, cc)); }
function enviarCobranzaUI(datos) { return toClient(enviarCobranza_(datos)); }
function enviarCobranzaMasivoUI(clientes, cc) { return toClient(enviarCobranzaMasivo_(clientes, cc)); }
function previewEmailFacturaUI(rut, folio, año, mes) { return toClient(previewEmailFactura_(rut, folio, año, mes)); }
function previewEmailCobranzaUI(rut) { return toClient(previewEmailCobranza_(rut)); }

// =============================================================================
// BUSCAR PDF EN DRIVE
// =============================================================================

function buscarPdfSuscripcion_(folio, año, mes) {
  try {
    var folderSusc = DriveApp.getFolderById(EMAIL_CONFIG.CARPETA_SUSCRIPCIONES);
    // Navegar: {año} → {mes}. {MesNombre}
    var yearFolder = buscarSubcarpeta_(folderSusc, String(año));
    if (!yearFolder) return { success: false, error: 'Carpeta ' + año + ' no encontrada' };
    
    var mesStr = mes + '. ' + MESES_NOMBRE[mes];
    var monthFolder = buscarSubcarpeta_(yearFolder, mesStr);
    if (!monthFolder) return { success: false, error: 'Carpeta ' + mesStr + ' no encontrada' };
    
    // Buscar F-{folio} en el nombre
    var prefix = 'F-' + folio;
    var files = monthFolder.getFiles();
    while (files.hasNext()) {
      var file = files.next();
      var nombre = file.getName();
      // Matchear: "F-122 " o "F-122." al inicio
      if (nombre.indexOf(prefix + ' ') === 0 || nombre.indexOf(prefix + '.') === 0 || nombre === prefix + '.pdf') {
        return { success: true, id: file.getId(), nombre: file.getName() };
      }
    }
    return { success: false, error: 'PDF F-' + folio + ' no encontrado en ' + mesStr + ' ' + año };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function buscarPdfImplementacion_(folio) {
  try {
    var folder = DriveApp.getFolderById(EMAIL_CONFIG.CARPETA_IMPLEMENTACION);
    var prefix = 'F-' + folio;
    var files = folder.getFiles();
    while (files.hasNext()) {
      var file = files.next();
      var nombre = file.getName();
      if (nombre.indexOf(prefix + ' ') === 0 || nombre.indexOf(prefix + '.') === 0) {
        return { success: true, id: file.getId(), nombre: file.getName() };
      }
    }
    return { success: false, error: 'PDF F-' + folio + ' no encontrado en Implementación' };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function buscarSubcarpeta_(parentFolder, nombre) {
  var folders = parentFolder.getFolders();
  while (folders.hasNext()) {
    var f = folders.next();
    if (f.getName().indexOf(nombre) !== -1 || nombre.indexOf(f.getName()) !== -1) return f;
  }
  return null;
}

// =============================================================================
// OBTENER FACTURAS DEL MES (cruce Ventas_SII + Ficha_Comercial)
// =============================================================================

function getFacturasMes_(año, mes) {
  var ss = getSS();
  var sheets = getSheetNames();
  var sheetVentas = buscarHoja(ss, sheets.VENTAS);
  if (!sheetVentas) return { error: 'Hoja Ventas no encontrada' };
  
  var data = sheetVentas.getDataRange().getValues();
  // Leer ficha comercial para cruzar
  var fichas = getFichaMap_();
  
  var facturas = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var tipoDTE = parseInt(row[1]) || 0;
    if (tipoDTE !== 33 && tipoDTE !== 34) continue; // Solo facturas
    
    var fecha = parseFechaFicha_(row[6]);
    if (!fecha) continue;
    if (fecha.getFullYear() !== año || fecha.getMonth() + 1 !== mes) continue;
    
    var folio = String(row[5]);
    var rut = String(row[3] || '').trim();
    var razon = String(row[4] || '').trim();
    var neto = parseFloat(row[11]) || 0;
    var iva = parseFloat(row[12]) || 0;
    var total = parseFloat(row[13]) || 0;
    
    var rutLimpio = limpiarRUT(rut);
    var ficha = fichas[rutLimpio] || {};
    
    // Buscar PDF
    var pdf = buscarPdfSuscripcion_(folio, año, mes);
    
    facturas.push({
      folio: folio, rut: rut, rutLimpio: rutLimpio,
      razonSocial: razon, email: ficha.email || '',
      neto: neto, iva: iva, total: total,
      fecha: fmtFechaFicha_(fecha),
      facturacionTipo: ficha.facturacionTipo || 'Mes Vencido',
      tipoDoc: ficha.tipoDoc || 'Factura',
      pdfEncontrado: pdf.success,
      pdfId: pdf.success ? pdf.id : '',
      pdfNombre: pdf.success ? pdf.nombre : '',
      enviado: false
    });
  }
  
  facturas.sort(function(a, b) { return parseInt(a.folio) - parseInt(b.folio); });
  return { facturas: facturas, mes: mes, año: año, nombreMes: MESES_NOMBRE[mes] };
}

function getFichaMap_() {
  var ss = getSS();
  var sheet = ss.getSheetByName('Ficha_Comercial');
  if (!sheet) return {};
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var colMap = {};
  for (var h = 0; h < headers.length; h++) colMap[String(headers[h]).trim()] = h;
  
  var map = {};
  for (var i = 1; i < data.length; i++) {
    var rut = limpiarRUT(String(data[i][colMap.RUT] || ''));
    if (!rut) continue;
    map[rut] = {
      email: String(data[i][colMap.EMAIL] || ''),
      facturacionTipo: String(data[i][colMap.FACTURACION_TIPO] || ''),
      tipoDoc: String(data[i][colMap.TIPO_DOC] || ''),
      razonSocial: String(data[i][colMap.RAZON_SOCIAL] || '')
    };
  }
  return map;
}

// =============================================================================
// PREVIEW EMAIL
// =============================================================================

function previewEmailFactura_(rut, folio, año, mes) {
  var fichas = getFichaMap_();
  var rutLimpio = limpiarRUT(rut);
  var ficha = fichas[rutLimpio] || {};
  var facturacionTipo = ficha.facturacionTipo || 'Mes Vencido';
  var periodo = MESES_NOMBRE[mes] + ' ' + año;
  
  var asunto, intro;
  if (facturacionTipo === 'Mes Anticipado') {
    asunto = 'Factura Suscripción ' + periodo + ' - Notifica Legal';
    intro = 'Adjuntamos la factura correspondiente a su suscripción mensual.';
  } else {
    asunto = 'Factura Servicios ' + periodo + ' - Notifica Legal';
    intro = 'Adjuntamos la factura correspondiente a los servicios prestados.';
  }
  
  var html = buildEmailHtml_(ficha.razonSocial || rut, intro, facturacionTipo, periodo, folio, '', '');
  return { asunto: asunto, cuerpo: html, email: ficha.email || '', facturacionTipo: facturacionTipo };
}

function previewEmailCobranza_(rut) {
  var fichas = getFichaMap_();
  var rutLimpio = limpiarRUT(rut);
  var ficha = fichas[rutLimpio] || {};
  
  var morosos = getMorosos_();
  var docs = [];
  var maxDias = 0;
  var totalDeuda = 0;
  var pdfIds = [];
  
  for (var i = 0; i < morosos.documentos.length; i++) {
    var d = morosos.documentos[i];
    if (limpiarRUT(d.rut) === rutLimpio) {
      docs.push(d);
      if (d.dias > maxDias) maxDias = d.dias;
      totalDeuda += d.saldo;
      
      // Buscar PDF de cada factura pendiente
      if (d.tipoDoc === 'FAC' && d.numDoc) {
        var fechaParts = (d.fechaDoc || '').split('/');
        if (fechaParts.length === 3) {
          var pdfMes = parseInt(fechaParts[1]);
          var pdfAño = parseInt(fechaParts[2]);
          var pdf = buscarPdfSuscripcion_(d.numDoc, pdfAño, pdfMes);
          if (pdf.success) pdfIds.push(pdf.id);
        }
      }
    }
  }
  
  var nivel, asunto;
  if (maxDias > 60) { nivel = 'CRITICO'; asunto = '🔴 AVISO FINAL: Suspensión Inminente - Notifica Legal'; }
  else if (maxDias > 30) { nivel = 'URGENTE'; asunto = '⚠️ URGENTE: Deuda Vencida - Notifica Legal'; }
  else { nivel = 'RECORDATORIO'; asunto = 'Recordatorio de Pago - Notifica Legal'; }
  
  var html = buildCobranzaHtml_(ficha.razonSocial || rut, docs, totalDeuda, maxDias, nivel);
  return { asunto: asunto, cuerpo: html, email: ficha.email || '', nivel: nivel, 
           totalDeuda: totalDeuda, docs: docs.length, maxDias: maxDias, pdfIds: pdfIds };
}

// =============================================================================
// ENVIAR EMAIL DIRECTO (individual — desde modal editable)
// =============================================================================

function enviarEmailDirectoUI(datos) {
  validarAccesoEscritura_();
  return toClient(enviarEmailDirecto_(datos));
}

function enviarEmailDirecto_(datos) {
  if (!datos.email) return { success: false, error: 'Email no proporcionado' };
  
  try {
    var opciones = { htmlBody: datos.cuerpo, name: EMAIL_CONFIG.REMITENTE };
    if (datos.cc) opciones.cc = datos.cc;
    
    // Adjuntar PDFs (singular o array)
    var adjuntos = [];
    if (datos.pdfId) {
      try { adjuntos.push(DriveApp.getFileById(datos.pdfId).getAs(MimeType.PDF)); } catch(e) {}
    }
    if (datos.pdfIds && datos.pdfIds.length > 0) {
      for (var i = 0; i < datos.pdfIds.length; i++) {
        try { adjuntos.push(DriveApp.getFileById(datos.pdfIds[i]).getAs(MimeType.PDF)); } catch(e) {}
      }
    }
    if (adjuntos.length > 0) opciones.attachments = adjuntos;
    
    GmailApp.sendEmail(datos.email, datos.asunto, '', opciones);
    var msg = 'Correo enviado a ' + datos.email;
    if (adjuntos.length > 0) msg += ' (' + adjuntos.length + ' adjunto' + (adjuntos.length > 1 ? 's' : '') + ')';
    return { success: true, mensaje: msg };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// =============================================================================
// ENVIAR FACTURA (individual — llamada desde masivo)
// =============================================================================

function enviarFactura_(datos) {
  validarAccesoEscritura_();
  if (!datos.email) return { success: false, error: 'Email no proporcionado' };
  
  try {
    var opciones = { htmlBody: datos.cuerpo, name: EMAIL_CONFIG.REMITENTE };
    if (datos.cc) opciones.cc = datos.cc;
    
    // Adjuntar PDF si existe
    if (datos.pdfId) {
      try {
        var archivo = DriveApp.getFileById(datos.pdfId);
        opciones.attachments = [archivo.getAs(MimeType.PDF)];
      } catch(e) { /* PDF no encontrado, enviar sin adjunto */ }
    }
    
    GmailApp.sendEmail(datos.email, datos.asunto, '', opciones);
    return { success: true, mensaje: 'Correo enviado a ' + datos.email };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// =============================================================================
// ENVÍO MASIVO FACTURACIÓN
// =============================================================================

function enviarFacturasMasivo_(facturas, cc) {
  validarAccesoEscritura_();
  var resultados = [];
  var exitosos = 0, fallidos = 0;
  
  for (var i = 0; i < facturas.length; i++) {
    var f = facturas[i];
    if (!f.email) { resultados.push({ folio: f.folio, success: false, error: 'Sin email' }); fallidos++; continue; }
    
    try {
      // Generar email específico
      var preview = previewEmailFactura_(f.rut, f.folio, f.año, f.mes);
      var opciones = { htmlBody: preview.cuerpo, name: EMAIL_CONFIG.REMITENTE };
      if (cc) opciones.cc = cc;
      
      if (f.pdfId) {
        try {
          var archivo = DriveApp.getFileById(f.pdfId);
          opciones.attachments = [archivo.getAs(MimeType.PDF)];
        } catch(e) {}
      }
      
      GmailApp.sendEmail(f.email, preview.asunto, '', opciones);
      resultados.push({ folio: f.folio, razon: f.razonSocial, success: true });
      exitosos++;
    } catch(e) {
      resultados.push({ folio: f.folio, razon: f.razonSocial, success: false, error: e.message });
      fallidos++;
    }
  }
  
  return { success: true, exitosos: exitosos, fallidos: fallidos, total: facturas.length, resultados: resultados };
}

// =============================================================================
// ENVIAR COBRANZA (individual)
// =============================================================================

function enviarCobranza_(datos) {
  validarAccesoEscritura_();
  if (!datos.email) return { success: false, error: 'Email no proporcionado' };
  
  try {
    var opciones = { htmlBody: datos.cuerpo, name: EMAIL_CONFIG.REMITENTE };
    if (datos.cc) opciones.cc = datos.cc;
    
    GmailApp.sendEmail(datos.email, datos.asunto, '', opciones);
    return { success: true, mensaje: 'Cobranza enviada a ' + datos.email };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// =============================================================================
// ENVÍO MASIVO COBRANZA
// =============================================================================

function enviarCobranzaMasivo_(clientes, cc) {
  validarAccesoEscritura_();
  var resultados = [];
  var exitosos = 0, fallidos = 0;
  
  for (var i = 0; i < clientes.length; i++) {
    var c = clientes[i];
    try {
      var preview = previewEmailCobranza_(c.rut);
      if (!preview.email) { resultados.push({ rut: c.rut, nombre: c.nombre, success: false, error: 'Sin email' }); fallidos++; continue; }
      
      var opciones = { htmlBody: preview.cuerpo, name: EMAIL_CONFIG.REMITENTE };
      if (cc) opciones.cc = cc;
      
      // Adjuntar PDFs de facturas pendientes
      if (preview.pdfIds && preview.pdfIds.length > 0) {
        var adjuntos = [];
        for (var p = 0; p < preview.pdfIds.length; p++) {
          try { adjuntos.push(DriveApp.getFileById(preview.pdfIds[p]).getAs(MimeType.PDF)); } catch(e) {}
        }
        if (adjuntos.length > 0) opciones.attachments = adjuntos;
      }
      
      GmailApp.sendEmail(preview.email, preview.asunto, '', opciones);
      var adjCount = (opciones.attachments || []).length;
      resultados.push({ rut: c.rut, nombre: c.nombre, success: true, nivel: preview.nivel, adjuntos: adjCount });
      exitosos++;
    } catch(e) {
      resultados.push({ rut: c.rut, nombre: c.nombre, success: false, error: e.message });
      fallidos++;
    }
  }
  
  return { success: true, exitosos: exitosos, fallidos: fallidos, total: clientes.length, resultados: resultados };
}

// =============================================================================
// HTML TEMPLATES
// =============================================================================

function buildEmailHtml_(nombre, intro, facturacionTipo, periodo, folio, neto, total) {
  var esAnticipado = facturacionTipo === 'Mes Anticipado';
  var periodoLabel = esAnticipado ? 'PERÍODO DE SERVICIO' : 'PERÍODO FACTURADO';
  var badgeColor = esAnticipado ? '#2563eb' : '#d97706';
  var badgeBg = esAnticipado ? '#dbeafe' : '#fef3c7';
  var badgeText = esAnticipado ? '📅 MES ANTICIPADO' : '📅 MES VENCIDO';
  
  var html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#ffffff">';
  // Header
  html += '<div style="background:linear-gradient(135deg,#1e1b4b,#4338ca);padding:28px 32px;text-align:center">';
  html += '<h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:-.5px">Notifica Legal</h1>';
  html += '<p style="color:rgba(255,255,255,.7);margin:4px 0 0;font-size:13px">Servicios Jurídicos Digitales</p>';
  html += '</div>';
  
  // Body
  html += '<div style="padding:28px 32px">';
  html += '<p style="color:#334155;font-size:15px;margin:0 0 16px">Estimado/a <strong>' + nombre + '</strong>,</p>';
  html += '<p style="color:#475569;font-size:14px;margin:0 0 20px">' + intro + '</p>';
  
  // Badge facturación
  html += '<div style="display:inline-block;background:' + badgeBg + ';color:' + badgeColor + ';padding:6px 16px;border-radius:8px;font-weight:700;font-size:13px;margin-bottom:16px">' + badgeText + '</div>';
  
  // Periodo
  html += '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:20px">';
  html += '<div style="font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:600;letter-spacing:.5px">' + periodoLabel + '</div>';
  html += '<div style="font-size:18px;font-weight:700;color:#1e1b4b;margin-top:4px">' + periodo + '</div>';
  if (!esAnticipado) html += '<div style="font-size:12px;color:#64748b;margin-top:2px">Servicios ya prestados</div>';
  html += '</div>';
  
  // Detalle factura
  if (folio) {
    html += '<div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:20px">';
    html += '<div style="background:#fafbfd;padding:10px 16px;font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:600;border-bottom:1px solid #e2e8f0">Detalle</div>';
    html += '<div style="padding:14px 16px;display:flex;justify-content:space-between;align-items:center">';
    html += '<span style="color:#334155;font-size:14px">Factura N° <strong>' + folio + '</strong></span>';
    if (total) html += '<span style="font-size:16px;font-weight:700;color:#1e1b4b">$' + formatMontoEmail_(total) + '</span>';
    html += '</div></div>';
  }
  
  // Vencimiento
  var vencMsg = esAnticipado 
    ? '⏰ <strong>PAGO:</strong> Agradecemos realizar la transferencia dentro de los primeros 5 días del mes.'
    : '⏰ <strong>VENCIMIENTO:</strong> 5 días desde la fecha de emisión de la factura.';
  html += '<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:10px 16px;margin-bottom:20px;font-size:13px;color:#92400e">' + vencMsg + '</div>';
  
  // Datos bancarios
  html += buildDatosBancarios_(folio);
  
  // Footer
  html += '<p style="color:#475569;font-size:14px;margin:20px 0 0">Quedamos atentos a cualquier consulta.</p>';
  html += '<p style="color:#334155;font-size:14px;margin:8px 0 0"><strong>Saludos cordiales,</strong><br><span style="color:#64748b">Equipo Notifica Legal</span></p>';
  html += '</div>';
  
  // Footer bar
  html += '<div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center">';
  html += '<span style="color:#94a3b8;font-size:12px">📧 tesoreria@notificalegal.cl</span>';
  html += '</div></div>';
  
  return html;
}

function buildCobranzaHtml_(nombre, docs, totalDeuda, maxDias, nivel) {
  var headerBg, headerIcon, intro;
  if (nivel === 'CRITICO') {
    headerBg = 'linear-gradient(135deg,#991b1b,#dc2626)';
    headerIcon = '🔴 AVISO FINAL';
    intro = 'A pesar de nuestros intentos de contacto, su cuenta presenta una deuda significativa sin regularizar:';
  } else if (nivel === 'URGENTE') {
    headerBg = 'linear-gradient(135deg,#92400e,#d97706)';
    headerIcon = '⚠️ AVISO URGENTE';
    intro = 'Registra documentos con más de 30 días de mora:';
  } else {
    headerBg = 'linear-gradient(135deg,#1e1b4b,#4338ca)';
    headerIcon = '📋 RECORDATORIO';
    intro = 'Le recordamos amablemente que tiene documentos pendientes de pago:';
  }
  
  var html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#fff">';
  html += '<div style="background:' + headerBg + ';padding:28px 32px;text-align:center">';
  html += '<h1 style="color:#fff;margin:0;font-size:22px">Notifica Legal</h1>';
  html += '<div style="color:rgba(255,255,255,.9);font-size:14px;margin-top:8px;font-weight:700">' + headerIcon + '</div>';
  html += '</div>';
  
  html += '<div style="padding:28px 32px">';
  html += '<p style="color:#334155;font-size:15px">Estimado/a <strong>' + nombre + '</strong>,</p>';
  html += '<p style="color:#475569;font-size:14px">' + intro + '</p>';
  
  // Tabla documentos
  html += '<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">';
  html += '<thead><tr style="background:#f8fafc"><th style="padding:8px 12px;text-align:left;color:#64748b;font-size:11px;border-bottom:1px solid #e2e8f0">DOCUMENTO</th>';
  html += '<th style="padding:8px 12px;text-align:center;color:#64748b;font-size:11px;border-bottom:1px solid #e2e8f0">DÍAS VENCIDOS</th>';
  html += '<th style="padding:8px 12px;text-align:right;color:#64748b;font-size:11px;border-bottom:1px solid #e2e8f0">PENDIENTE</th></tr></thead><tbody>';
  
  for (var i = 0; i < docs.length; i++) {
    var d = docs[i];
    var diasColor = d.dias > 60 ? '#dc2626' : d.dias > 30 ? '#d97706' : '#334155';
    html += '<tr style="border-bottom:1px solid #f1f5f9">';
    html += '<td style="padding:8px 12px;color:#334155">' + d.tipoDoc + ' N° ' + d.numDoc + '</td>';
    html += '<td style="padding:8px 12px;text-align:center;color:' + diasColor + ';font-weight:700">' + d.dias + 'd</td>';
    html += '<td style="padding:8px 12px;text-align:right;color:#dc2626;font-weight:700">$' + formatMontoEmail_(d.saldo) + '</td>';
    html += '</tr>';
  }
  html += '</tbody></table>';
  
  // Total
  html += '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 20px;margin:16px 0;display:flex;justify-content:space-between;align-items:center">';
  html += '<span style="color:#991b1b;font-weight:600;font-size:14px">TOTAL ADEUDADO</span>';
  html += '<span style="color:#dc2626;font-weight:800;font-size:20px">$' + formatMontoEmail_(totalDeuda) + '</span>';
  html += '</div>';
  
  if (nivel === 'CRITICO') {
    html += '<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:13px;color:#92400e">';
    html += '<strong>⚠️ CONSECUENCIAS DE NO PAGO:</strong><br>';
    html += '1. Suspensión inmediata del servicio<br>';
    html += '2. Inicio de acciones de cobranza<br>';
    html += '3. Posible informe a registros comerciales';
    html += '</div>';
  }
  
  // Datos bancarios
  html += buildDatosBancarios_(null);
  
  html += '<p style="color:#475569;font-size:14px;margin:20px 0 0">Si ya realizó el pago, por favor envíenos el comprobante.</p>';
  html += '<p style="color:#334155;font-size:14px;margin:8px 0"><strong>Atentamente,</strong><br><span style="color:#64748b">' + (nivel === 'CRITICO' ? 'Departamento de Cobranzas' : 'Equipo Notifica Legal') + '</span></p>';
  html += '</div>';
  
  html += '<div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center">';
  html += '<span style="color:#94a3b8;font-size:12px">📧 tesoreria@notificalegal.cl</span></div></div>';
  
  return html;
}

function buildDatosBancarios_(folio) {
  var h = '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin:16px 0">';
  h += '<div style="font-size:12px;font-weight:700;color:#059669;margin-bottom:8px">🏦 DATOS PARA TRANSFERENCIA</div>';
  h += '<table style="font-size:13px;color:#334155">';
  h += '<tr><td style="padding:2px 12px 2px 0;color:#64748b">Titular:</td><td style="font-weight:600">' + EMAIL_CONFIG.RAZON_EMPRESA + '</td></tr>';
  h += '<tr><td style="padding:2px 12px 2px 0;color:#64748b">RUT:</td><td style="font-weight:600">' + EMAIL_CONFIG.RUT_EMPRESA + '</td></tr>';
  h += '<tr><td style="padding:2px 12px 2px 0;color:#64748b">Banco:</td><td style="font-weight:600">' + EMAIL_CONFIG.BANCO + '</td></tr>';
  h += '<tr><td style="padding:2px 12px 2px 0;color:#64748b">Tipo:</td><td style="font-weight:600">' + EMAIL_CONFIG.TIPO_CUENTA + '</td></tr>';
  h += '<tr><td style="padding:2px 12px 2px 0;color:#64748b">N° Cuenta:</td><td style="font-weight:600">' + EMAIL_CONFIG.CUENTA + '</td></tr>';
  h += '<tr><td style="padding:2px 12px 2px 0;color:#64748b">Comprobante a:</td><td style="font-weight:600">' + EMAIL_CONFIG.EMAIL_PAGOS + '</td></tr>';
  if (folio) h += '<tr><td style="padding:2px 12px 2px 0;color:#64748b">Referencia:</td><td style="font-weight:600">Fac-' + folio + '</td></tr>';
  h += '</table></div>';
  return h;
}

function formatMontoEmail_(n) {
  return Math.round(Math.abs(n || 0)).toLocaleString('es-CL');
}