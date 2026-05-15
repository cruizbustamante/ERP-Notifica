/**
 * ============================================================================
 * CONTABILIDAD.gs - MÓDULO DE CONTABILIDAD (UI)
 * ============================================================================
 * Funciones de UI para el módulo de comprobantes y reportes
 * LEE TODAS LAS FUNCIONES BASE DESDE Core_Contable.gs
 * 
 * IMPORTANTE: Todas las funciones que devuelven datos al frontend via
 * google.script.run DEBEN usar toClient() para serializar correctamente.
 * GAS no puede pasar objetos Date ni estructuras complejas al cliente.
 * ============================================================================
 */

// =============================================================================
// HELPER: Serialización segura para google.script.run
// =============================================================================

function toClient(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// =============================================================================
// DIAGNÓSTICO
// =============================================================================

function diagnosticarSistema() {
  var ss = getSS();
  var allSheets = ss.getSheets().map(function(s) { return s.getName(); });
  var sheets = getSheetNames();
  
  var resultado = {
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    hojasExistentes: allSheets,
    hojasEsperadas: sheets,
    estadoHojas: {}
  };
  
  var claves = Object.keys(sheets);
  for (var i = 0; i < claves.length; i++) {
    var clave = claves[i];
    var nombreEsperado = sheets[clave];
    var sheet = buscarHoja(ss, nombreEsperado);
    
    if (sheet) {
      var data = sheet.getDataRange().getValues();
      resultado.estadoHojas[clave] = {
        encontrada: true, nombre: sheet.getName(),
        filas: data.length, columnas: data[0] ? data[0].length : 0,
        headers: data[0] ? data[0].slice(0, 5).join(', ') + '...' : 'Sin datos'
      };
    } else {
      resultado.estadoHojas[clave] = { encontrada: false, nombreBuscado: nombreEsperado };
    }
  }
  
  var configSheet = ss.getSheetByName('Config');
  resultado.configExiste = !!configSheet;
  if (configSheet) resultado.configFilas = configSheet.getDataRange().getValues().length;
  
  Logger.log(JSON.stringify(resultado, null, 2));
  return toClient(resultado);
}

// =============================================================================
// DATOS PARA LA INTERFAZ
// =============================================================================

function getDataContabilidad() {
  var config = getConfig();
  var añoActivo = getAñoFiscalActivo();
  if (!añoActivo) añoActivo = parseInt(config.AÑO_FISCAL_INICIO) || 2025;
  
  var periodos = getPeriodos();
  var periodoActual = null;
  for (var i = 0; i < periodos.length; i++) {
    if (periodos[i].año === añoActivo) { periodoActual = periodos[i]; break; }
  }
  
  return toClient({
    empresa: { nombre: config.EMPRESA_NOMBRE || 'Empresa', rut: config.EMPRESA_RUT || '' },
    añoActivo: añoActivo,
    periodo: periodoActual,
    tiposComprobante: getTiposComprobante(),
    tiposDocumento: getTiposDocumento(true),
    resumen: getResumenContable(añoActivo),
    ultimosComprobantes: getUltimosComprobantes(10)
  });
}

function getResumenContable(año) {
  var ss = getSS();
  var sheets = getSheetNames();
  var sheetComp = buscarHoja(ss, sheets.COMPROBANTES);
  if (!sheetComp) return { totalComprobantes: 0, comprobantesEsteMes: 0, totalDebe: 0, totalHaber: 0 };
  
  var data = sheetComp.getDataRange().getValues();
  var mesActual = new Date().getMonth() + 1;
  var totalComprobantes = 0, comprobantesEsteMes = 0, totalDebe = 0, totalHaber = 0;
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    var compAño = parseInt(row[2]) || 0;
    var compMes = parseInt(row[3]) || 0;
    var estado = row[10] || 'VIGENTE';
    if (compAño === año && estado !== 'ANULADO') {
      totalComprobantes++;
      totalDebe += parseFloat(row[7]) || 0;
      totalHaber += parseFloat(row[8]) || 0;
      if (compMes === mesActual) comprobantesEsteMes++;
    }
  }
  return { totalComprobantes: totalComprobantes, comprobantesEsteMes: comprobantesEsteMes, totalDebe: totalDebe, totalHaber: totalHaber };
}

function getUltimosComprobantes(limite) {
  limite = limite || 10;
  var ss = getSS();
  var sheets = getSheetNames();
  var sheetComp = buscarHoja(ss, sheets.COMPROBANTES);
  if (!sheetComp) return [];
  
  var data = sheetComp.getDataRange().getValues();
  var comprobantes = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    comprobantes.push({
      id: row[0], tipo: row[1], numero: parseInt(row[4]) || 0,
      fecha: row[5], glosa: row[6],
      totalDebe: parseFloat(row[7]) || 0, totalHaber: parseFloat(row[8]) || 0,
      estado: row[10] || 'VIGENTE', origen: row[11] || ''
    });
  }
  comprobantes.sort(function(a, b) { return new Date(b.fecha) - new Date(a.fecha); });
  return comprobantes.slice(0, limite);
}

function getComprobantes(filtros) {
  filtros = filtros || {};
  var ss = getSS();
  var sheets = getSheetNames();
  var sheetComp = buscarHoja(ss, sheets.COMPROBANTES);
  if (!sheetComp) return [];
  
  var data = sheetComp.getDataRange().getValues();
  var comprobantes = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    var comp = {
      id: row[0], tipo: row[1],
      año: parseInt(row[2]) || 0, mes: parseInt(row[3]) || 0,
      numero: parseInt(row[4]) || 0, fecha: row[5], glosa: row[6],
      totalDebe: parseFloat(row[7]) || 0, totalHaber: parseFloat(row[8]) || 0,
      cantidadLineas: parseInt(row[9]) || 0, estado: row[10] || 'VIGENTE',
      origen: row[11] || '', origenRef: row[12] || '',
      fechaCreacion: row[13], usuario: row[14]
    };
    var filtroAño = parseInt(filtros.año) || 0;
    var filtroMes = parseInt(filtros.mes) || 0;
    if (filtroAño > 0 && comp.año !== filtroAño) continue;
    if (filtroMes > 0 && comp.mes !== filtroMes) continue;
    if (filtros.tipo && comp.tipo !== filtros.tipo) continue;
    if (filtros.estado && comp.estado !== filtros.estado) continue;
    if (!filtros.incluirAnulados && comp.estado === 'ANULADO') continue;
    comprobantes.push(comp);
  }
  comprobantes.sort(function(a, b) { return new Date(b.fecha) - new Date(a.fecha); });
  return toClient(comprobantes);
}

// =============================================================================
// GUARDAR / ANULAR COMPROBANTE
// =============================================================================

function guardarComprobanteUI(datos) {
  if (!datos.tipo) return toClient({ success: false, error: 'Debe seleccionar el tipo de comprobante' });
  if (!datos.fecha) return toClient({ success: false, error: 'Debe ingresar la fecha' });
  if (!datos.glosa || datos.glosa.trim() === '') return toClient({ success: false, error: 'Debe ingresar una glosa' });
  if (!datos.lineas || datos.lineas.length === 0) return toClient({ success: false, error: 'Debe ingresar al menos una línea' });
  
  var lineasProcesadas = [];
  for (var i = 0; i < datos.lineas.length; i++) {
    var linea = datos.lineas[i];
    lineasProcesadas.push({
      cuenta: linea.cuenta, debe: parseFloat(linea.debe) || 0, haber: parseFloat(linea.haber) || 0,
      glosa: linea.glosa || datos.glosa, auxiliar: linea.auxiliar || '',
      tipoDoc: linea.tipoDoc || '', numDoc: linea.numDoc || '',
      fechaDoc: linea.fechaDoc || datos.fecha,
      refTipo: linea.refTipo || linea.tipoDoc || '', refNum: linea.refNum || linea.numDoc || ''
    });
  }
  
  return toClient(crearComprobante({
    tipo: datos.tipo, fecha: new Date(datos.fecha), glosa: datos.glosa,
    lineas: lineasProcesadas, origen: datos.origen || 'MANUAL',
    origenRef: datos.origenRef || '', forzarDuplicados: datos.forzarDuplicados || false
  }));
}

function anularComprobanteUI(idComprobante, motivo, forzar) {
  return toClient(anularComprobante(idComprobante, motivo, forzar || false));
}

function eliminarComprobanteUI(idComprobante) {
  return toClient(eliminarComprobante(idComprobante));
}

// =============================================================================
// WRAPPERS de funciones Core para frontend (serialización segura)
// =============================================================================

function getComprobanteUI(id) {
  return toClient(getComprobante(id));
}

function getCuentasParaSelectorUI() {
  return toClient(getCuentasParaSelector());
}

function getTiposDocumentoUI(soloActivos) {
  return toClient(getTiposDocumento(soloActivos));
}

// =============================================================================
// REPORTES
// =============================================================================

function getReporteLibroDiario(año, mes) {
  var comprobantes = getLibroDiario(año, mes);
  var config = getConfig();
  return {
    empresa: { nombre: config.EMPRESA_NOMBRE || 'Empresa', rut: config.EMPRESA_RUT || '' },
    periodo: { año: año, mes: mes, nombreMes: mes ? getNombreMes(mes) : 'Todo el año' },
    comprobantes: comprobantes,
    totales: {
      comprobantes: comprobantes.length,
      debe: comprobantes.reduce(function(sum, c) { return sum + c.totalDebe; }, 0),
      haber: comprobantes.reduce(function(sum, c) { return sum + c.totalHaber; }, 0)
    }
  };
}

function getReporteLibroMayor(codigoCuenta, año, mesDesde, mesHasta) {
  var config = getConfig();
  mesDesde = mesDesde || 1;
  mesHasta = mesHasta || 12;
  var titulo = '';
  var filtroGrupo = null; // null = todas, o función de filtro por código
  
  if (codigoCuenta === 'TODAS') {
    titulo = 'TODAS LAS CUENTAS';
  } else if (codigoCuenta === 'ACTIVOS') {
    titulo = 'ACTIVOS';
    filtroGrupo = function(cod) { return cod.indexOf('1-') === 0; };
  } else if (codigoCuenta === 'PASIVOS') {
    titulo = 'PASIVOS';
    filtroGrupo = function(cod) { return cod.indexOf('2-') === 0; };
  } else if (codigoCuenta === 'PATRIMONIO') {
    titulo = 'PATRIMONIO';
    filtroGrupo = function(cod) { return cod.indexOf('3-') === 0; };
  } else if (codigoCuenta === 'INGRESOS') {
    titulo = 'INGRESOS';
    filtroGrupo = function(cod) { return cod.indexOf('4-') === 0; };
  } else if (codigoCuenta === 'GASTOS') {
    titulo = 'GASTOS';
    filtroGrupo = function(cod) { return cod.indexOf('5-') === 0 || cod.indexOf('6-') === 0 || cod.indexOf('7-') === 0; };
  } else {
    // Cuenta individual
    var mayor = getLibroMayor(codigoCuenta, año, mesDesde, mesHasta);
    if (!mayor) return { error: 'Cuenta no encontrada: ' + codigoCuenta };
    return {
      empresa: { nombre: config.EMPRESA_NOMBRE || 'Empresa', rut: config.EMPRESA_RUT || '' },
      titulo: mayor.cuenta.codigo + ' - ' + mayor.cuenta.nombre,
      cuenta: mayor.cuenta, periodo: mayor.periodo,
      saldoAnterior: mayor.saldoAnterior, movimientos: mayor.movimientos,
      saldoFinal: mayor.saldoFinal, totalDebe: mayor.totalDebe, totalHaber: mayor.totalHaber,
      nombreMesDesde: getNombreMes(mesDesde), nombreMesHasta: getNombreMes(mesHasta), esMultiple: false
    };
  }
  
  // BULK: auto-descubre TODAS las cuentas desde movimientos (null = auto)
  var bulkData = getLibroMayorBulk(null, año, mesDesde, mesHasta);
  
  var resultado = {
    empresa: { nombre: config.EMPRESA_NOMBRE || 'Empresa', rut: config.EMPRESA_RUT || '' },
    titulo: titulo, periodo: { año: año, mesDesde: mesDesde, mesHasta: mesHasta },
    nombreMesDesde: getNombreMes(mesDesde), nombreMesHasta: getNombreMes(mesHasta),
    cuentas: [], esMultiple: true, totalGeneralDebe: 0, totalGeneralHaber: 0
  };
  
  // Ordenar códigos de cuenta
  var codigos = Object.keys(bulkData).sort();
  
  for (var i = 0; i < codigos.length; i++) {
    var cod = codigos[i];
    // Aplicar filtro de grupo si corresponde
    if (filtroGrupo && !filtroGrupo(cod)) continue;
    
    var mayor = bulkData[cod];
    if (mayor && (mayor.movimientos.length > 0 || mayor.saldoAnterior !== 0 || mayor.saldoFinal !== 0)) {
      resultado.cuentas.push({
        codigo: mayor.cuenta.codigo, nombre: mayor.cuenta.nombre, tipo: mayor.cuenta.tipo,
        saldoAnterior: mayor.saldoAnterior, movimientos: mayor.movimientos,
        saldoFinal: mayor.saldoFinal, totalDebe: mayor.totalDebe, totalHaber: mayor.totalHaber
      });
      resultado.totalGeneralDebe += mayor.totalDebe;
      resultado.totalGeneralHaber += mayor.totalHaber;
    }
  }
  return resultado;
}

function getReporteBalance8Columnas(año, mesHasta) {
  mesHasta = mesHasta || 12;
  var balance = getBalanceComprobacion(año, mesHasta);
  var config = getConfig();
  balance.empresa = { nombre: config.EMPRESA_NOMBRE || 'Empresa', rut: config.EMPRESA_RUT || '' };
  balance.nombreMes = getNombreMes(mesHasta);
  return balance;
}

function getReporteEstadoResultados(año, mesDesde, mesHasta) {
  mesDesde = mesDesde || 1; mesHasta = mesHasta || 12;
  var resultado = getEstadoResultados(año, mesDesde, mesHasta);
  var config = getConfig();
  resultado.empresa = { nombre: config.EMPRESA_NOMBRE || 'Empresa', rut: config.EMPRESA_RUT || '' };
  resultado.nombreMesDesde = getNombreMes(mesDesde);
  resultado.nombreMesHasta = getNombreMes(mesHasta);
  return resultado;
}

function getReporteFlujoEfectivo(año, mesDesde, mesHasta) {
  mesDesde = mesDesde || 1; mesHasta = mesHasta || 12;
  var resultado = getFlujoEfectivo(año, mesDesde, mesHasta);
  var config = getConfig();
  resultado.empresa = { nombre: config.EMPRESA_NOMBRE || 'Empresa', rut: config.EMPRESA_RUT || '' };
  resultado.nombreMesDesde = getNombreMes(mesDesde);
  resultado.nombreMesHasta = getNombreMes(mesHasta);
  return resultado;
}

function getReporteEstadoSituacion(año, mesHasta) {
  mesHasta = mesHasta || 12;
  var resultado = getEstadoSituacionFinanciera(parseInt(año), parseInt(mesHasta));
  var config = getConfig();
  resultado.empresa = { nombre: config.EMPRESA_NOMBRE || 'Empresa', rut: config.EMPRESA_RUT || '' };
  return resultado;
}

function getReporteCuentasPorCobrar(año, cuenta, auxiliar, vista) {
  return getReporteCuentasPendientes('A', año, cuenta, auxiliar, vista);
}

function getReporteCuentasPorPagar(año, cuenta, auxiliar, vista) {
  return getReporteCuentasPendientes('P', año, cuenta, auxiliar, vista);
}

/**
 * Reporte genérico de cuentas pendientes (CxC o CxP).
 * @param {string} tipoCuenta - 'A' para activo (CxC), 'P' para pasivo (CxP)
 * @param {number} año
 * @param {string} cuentaFiltro - código cuenta específica, o vacío/null para TODAS del tipo
 * @param {string} auxiliarFiltro - rutNumero del auxiliar, o vacío para todos
 * @param {string} vista - 'pendientes' (solo saldo>0) o 'todos' (incluye pagados, con detalle movimientos)
 */
function getReporteCuentasPendientes(tipoCuenta, año, cuentaFiltro, auxiliarFiltro, vista) {
  var config = getConfig();
  vista = vista || 'pendientes';
  
  // Determinar qué cuentas consultar
  var cuentasAConsultar = [];
  if (cuentaFiltro && cuentaFiltro !== 'TODAS') {
    cuentasAConsultar.push(cuentaFiltro);
  } else {
    var todas = getCuentasMovimiento();
    for (var i = 0; i < todas.length; i++) {
      if (todas[i].tipo === tipoCuenta && todas[i].requiereDocumento) {
        cuentasAConsultar.push(todas[i].codigo);
      }
    }
    if (cuentasAConsultar.length === 0) {
      var defCuenta = tipoCuenta === 'A' 
        ? (config.CUENTA_CLIENTES || '1-1-03-001') 
        : (config.CUENTA_PROVEEDORES || '2-1-02-001');
      cuentasAConsultar.push(defCuenta);
    }
  }
  
  // Consultar documentos de todas las cuentas
  var todosDocumentos = [];
  var cuentasUsadas = [];
  
  for (var c = 0; c < cuentasAConsultar.length; c++) {
    var codigoCta = cuentasAConsultar[c];
    var datos = getSaldosPorDocumentoCompleto(codigoCta, auxiliarFiltro || null, año || null, vista === 'todos');
    if (datos && datos.documentos && datos.documentos.length > 0) {
      var ctaInfo = getCuenta(codigoCta);
      cuentasUsadas.push({ codigo: codigoCta, nombre: ctaInfo ? ctaInfo.nombre : codigoCta });
      for (var d = 0; d < datos.documentos.length; d++) {
        var doc = datos.documentos[d];
        var auxObj = doc.auxiliar ? getAuxiliar(doc.auxiliar) : null;
        var docMapeado = {
          cuenta: codigoCta,
          nombreCuenta: ctaInfo ? ctaInfo.nombre : codigoCta,
          rut: auxObj ? auxObj.rut : (doc.auxiliar || ''),
          nombre: doc.nombreAuxiliar || (auxObj ? auxObj.nombre : ''),
          tipoDoc: doc.tipoDoc || '',
          numDoc: doc.numDoc || '',
          fecha: doc.fechaDoc ? fmtFechaISO(doc.fechaDoc) : '',
          saldo: doc.saldo || 0,
          montoOriginal: doc.montoOriginal || 0,
          diasAntiguedad: doc.diasAntiguedad || 0,
          estado: Math.abs(doc.saldo) < 1 ? 'PAGADO' : 'PENDIENTE'
        };
        // Si vista=todos, incluir movimientos (pagos/rebajas)
        if (vista === 'todos' && doc.movimientos) {
          docMapeado.movimientos = [];
          for (var m = 0; m < doc.movimientos.length; m++) {
            var mov = doc.movimientos[m];
            docMapeado.movimientos.push({
              comprobante: mov.comprobante,
              fecha: mov.fecha ? fmtFechaISO(mov.fecha) : '',
              tipoDoc: mov.tipoDoc || '',
              numDoc: mov.numDoc || '',
              tipoMov: mov.tipoMov || '',
              debe: mov.debe || 0,
              haber: mov.haber || 0,
              glosa: mov.glosa || ''
            });
          }
        }
        todosDocumentos.push(docMapeado);
      }
    }
  }
  
  todosDocumentos.sort(function(a, b) { return b.diasAntiguedad - a.diasAntiguedad; });
  
  // Calcular aging (solo sobre pendientes)
  var rangosConfig = tipoCuenta === 'A' 
    ? [
        { nombre: '0-30 días', min: 0, max: 30, total: 0, documentos: [] },
        { nombre: '31-60 días', min: 31, max: 60, total: 0, documentos: [] },
        { nombre: '61-90 días', min: 61, max: 90, total: 0, documentos: [] },
        { nombre: '91-120 días', min: 91, max: 120, total: 0, documentos: [] },
        { nombre: 'Más de 120 días', min: 121, max: 99999, total: 0, documentos: [] }
      ]
    : [
        { nombre: '0-30 días', min: 0, max: 30, total: 0, documentos: [] },
        { nombre: '31-60 días', min: 31, max: 60, total: 0, documentos: [] },
        { nombre: '61-90 días', min: 61, max: 90, total: 0, documentos: [] },
        { nombre: 'Más de 90 días', min: 91, max: 99999, total: 0, documentos: [] }
      ];
  
  var totalSaldo = 0;
  var totalPendientes = 0;
  var totalPagados = 0;
  for (var i = 0; i < todosDocumentos.length; i++) {
    var doc = todosDocumentos[i];
    totalSaldo += doc.saldo;
    if (doc.estado === 'PENDIENTE') {
      totalPendientes++;
      for (var r = 0; r < rangosConfig.length; r++) {
        if (doc.diasAntiguedad >= rangosConfig[r].min && doc.diasAntiguedad <= rangosConfig[r].max) {
          rangosConfig[r].total += doc.saldo;
          rangosConfig[r].documentos.push(doc);
          break;
        }
      }
    } else {
      totalPagados++;
    }
  }
  
  return {
    empresa: { nombre: config.EMPRESA_NOMBRE || 'Empresa', rut: config.EMPRESA_RUT || '' },
    cuentas: cuentasUsadas,
    cuenta: cuentasUsadas.length === 1 ? cuentasUsadas[0] : { codigo: 'TODAS', nombre: tipoCuenta === 'A' ? 'Todas las cuentas por cobrar' : 'Todas las cuentas por pagar' },
    documentos: todosDocumentos,
    totalSaldo: totalSaldo,
    cantidadDocumentos: todosDocumentos.length,
    totalPendientes: totalPendientes,
    totalPagados: totalPagados,
    auxiliarFiltro: auxiliarFiltro || '',
    vista: vista,
    antiguedad: rangosConfig,
    fechaReporte: new Date().toISOString()
  };
}

/**
 * Versión extendida de getSaldosPorDocumento que opcionalmente incluye docs con saldo 0.
 */
function getSaldosPorDocumentoCompleto(codigoCuenta, auxiliar, año, incluirPagados) {
  var ss = getSS();
  var sheets = getSheetNames();
  
  var cuenta = getCuenta(codigoCuenta);
  if (!cuenta || !cuenta.requiereDocumento) return { error: 'Cuenta no requiere documento' };
  
  // Con apertura multi-año, cada año es autocontenido
  if (!año) {
    año = getAñoFiscalActivo();
  }
  
  var sheetMov = buscarHoja(ss, sheets.MOV_CONTABLES);
  var sheetComp = buscarHoja(ss, sheets.COMPROBANTES);
  
  var dataMov = sheetMov.getDataRange().getValues();
  var dataComp = sheetComp.getDataRange().getValues();
  
  // Solo comprobantes vigentes del año solicitado
  var compVigentes = {};
  for (var i = 1; i < dataComp.length; i++) {
    if (String(dataComp[i][10] || '').trim().toUpperCase() !== 'ANULADO' && parseInt(dataComp[i][2]) === año) {
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
      if (row[10]) doc.fechaDoc = row[10];
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
    var aux = getAuxiliar(doc.auxiliar);
    doc.nombreAuxiliar = aux ? aux.nombre : doc.auxiliar;
    doc.diasAntiguedad = doc.fechaDoc ? Math.floor((new Date() - new Date(doc.fechaDoc)) / 86400000) : 0;
    
    if (incluirPagados || Math.abs(doc.saldo) > 0.01) {
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

/** Formatea fecha a dd-mm-yyyy para reportes */
function fmtFechaISO(f) {
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
// LIBROS TRIBUTARIOS
// =============================================================================

function getLibroVentas(año, mes) {
  var ss = getSS();
  var sheets = getSheetNames();
  var sheetVentas = buscarHoja(ss, sheets.VENTAS);
  if (!sheetVentas) return { error: 'Hoja de ventas no encontrada' };
  
  var data = sheetVentas.getDataRange().getValues();
  var ventas = [];
  var COL_TIPO = 1, COL_RUT = 3, COL_RAZON = 4, COL_FOLIO = 5, COL_FECHA = 6;
  var COL_NETO = 11, COL_IVA = 12, COL_TOTAL = 13;
  var totalExento = 0, totalNeto = 0, totalIVA = 0, totalTotal = 0;
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var fecha = parsearFechaSimple(row[COL_FECHA]);
    if (!fecha) continue;
    if (fecha.getFullYear() !== año) continue;
    if (mes && fecha.getMonth() + 1 !== mes) continue;
    var tipoDTE = row[COL_TIPO];
    var neto = parseFloat(row[COL_NETO]) || 0;
    var iva = parseFloat(row[COL_IVA]) || 0;
    var total = parseFloat(row[COL_TOTAL]) || 0;
    var esExento = (parseInt(tipoDTE) === 34) || (iva === 0 && neto === 0 && total > 0);
    ventas.push({
      fecha: formatearFechaSimple(fecha), tipoDTE: tipoDTE, folio: row[COL_FOLIO],
      rut: row[COL_RUT], razonSocial: row[COL_RAZON],
      exento: esExento ? total : 0, neto: esExento ? 0 : neto, iva: iva, total: total
    });
    if (esExento) { totalExento += total; } else { totalNeto += neto; totalIVA += iva; }
    totalTotal += total;
  }
  
  // ── BOLETAS DE VENTA ──
  var sheetBoletas = buscarHoja(ss, sheets.BOLETAS_VENTAS);
  if (sheetBoletas) {
    var dataBol = sheetBoletas.getDataRange().getValues();
    // Columnas Boletas_Ventas_SII: FOLIO=0, NETO=1, IVA=2, TOTAL=3, TIPO=4, FECHA=5, RUT=9, RAZON=10
    // Detectar columna ESTADO_BOLETA para filtrar solo ACEPTADA
    var colEstBol = -1;
    for (var h = 0; h < dataBol[0].length; h++) {
      var hdr = String(dataBol[0][h]).toUpperCase().trim().replace(/ /g, '_');
      if (hdr === 'ESTADO_BOLETA' || hdr === 'ESTADO') { colEstBol = h; break; }
    }
    for (var i = 1; i < dataBol.length; i++) {
      var row = dataBol[i];
      // Filtrar solo ACEPTADA
      if (colEstBol !== -1) {
        var estado = String(row[colEstBol]).toUpperCase().trim();
        if (estado !== 'ACEPTADA') continue;
      }
      var fecha = parsearFechaSimple(row[5]);
      if (!fecha) continue;
      if (fecha.getFullYear() !== año) continue;
      if (mes && fecha.getMonth() + 1 !== mes) continue;
      var tipoDTE = row[4] || 39; // 39 = Boleta electrónica
      var neto = parseFloat(row[1]) || 0;
      var iva = parseFloat(row[2]) || 0;
      var total = parseFloat(row[3]) || 0;
      var esExento = (parseInt(tipoDTE) === 41) || (iva === 0 && neto === 0 && total > 0);
      ventas.push({
        fecha: formatearFechaSimple(fecha), tipoDTE: tipoDTE, folio: row[0],
        rut: row[9] || '', razonSocial: row[10] || 'Boleta',
        exento: esExento ? total : 0, neto: esExento ? 0 : neto, iva: iva, total: total
      });
      if (esExento) { totalExento += total; } else { totalNeto += neto; totalIVA += iva; }
      totalTotal += total;
    }
  }
  
  ventas.sort(function(a, b) { return a.folio - b.folio; });
  var config = getConfig();
  return {
    empresa: { nombre: config.EMPRESA_NOMBRE || 'Empresa', rut: config.EMPRESA_RUT || '' },
    periodo: { año: año, mes: mes, nombreMes: getNombreMes(mes) },
    ventas: ventas,
    totales: { exento: totalExento, neto: totalNeto, iva: totalIVA, total: totalTotal, cantidad: ventas.length }
  };
}

function getLibroCompras(año, mes) {
  var ss = getSS();
  var sheets = getSheetNames();
  var sheetCompras = buscarHoja(ss, sheets.COMPRAS);
  if (!sheetCompras) return { error: 'Hoja de compras no encontrada' };
  
  var data = sheetCompras.getDataRange().getValues();
  var compras = [];
  var COL_TIPO = 1, COL_RUT = 3, COL_RAZON = 4, COL_FOLIO = 5, COL_FECHA = 6;
  var COL_NETO = 10, COL_IVA = 11, COL_TOTAL = 14;
  var totalExento = 0, totalNeto = 0, totalIVA = 0, totalTotal = 0;
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var fecha = parsearFechaSimple(row[COL_FECHA]);
    if (!fecha) continue;
    if (fecha.getFullYear() !== año) continue;
    if (mes && fecha.getMonth() + 1 !== mes) continue;
    var tipoDTE = row[COL_TIPO];
    var neto = parseFloat(row[COL_NETO]) || 0;
    var iva = parseFloat(row[COL_IVA]) || 0;
    var total = parseFloat(row[COL_TOTAL]) || 0;
    var esExento = (parseInt(tipoDTE) === 34) || (iva === 0 && neto === 0 && total > 0);
    compras.push({
      fecha: formatearFechaSimple(fecha), tipoDTE: tipoDTE, folio: row[COL_FOLIO],
      rut: row[COL_RUT], razonSocial: row[COL_RAZON],
      exento: esExento ? total : 0, neto: esExento ? 0 : neto, iva: iva, total: total
    });
    if (esExento) { totalExento += total; } else { totalNeto += neto; totalIVA += iva; }
    totalTotal += total;
  }
  compras.sort(function(a, b) { return a.folio - b.folio; });
  var config = getConfig();
  return {
    empresa: { nombre: config.EMPRESA_NOMBRE || 'Empresa', rut: config.EMPRESA_RUT || '' },
    periodo: { año: año, mes: mes, nombreMes: getNombreMes(mes) },
    compras: compras,
    totales: { exento: totalExento, neto: totalNeto, iva: totalIVA, total: totalTotal, cantidad: compras.length }
  };
}

function getLibroHonorarios(año, mes) {
  var ss = getSS();
  var sheets = getSheetNames();
  var sheetHonorarios = buscarHoja(ss, sheets.HONORARIOS);
  if (!sheetHonorarios) return { error: 'Hoja de honorarios no encontrada' };
  
  var data = sheetHonorarios.getDataRange().getValues();
  
  // Usar misma detección de columnas que Centralización
  // Honorarios_SII: FOLIO=0, FECHA=1, RUT=4, RAZON=5, BRUTO=7, RETENCION=8, LIQUIDO=9
  var cols;
  if (typeof getColumnasLibro === 'function') {
    cols = getColumnasLibro('HONORARIOS');
  } else {
    cols = { FOLIO: 0, FECHA: 1, RUT: 4, RAZON: 5, BRUTO: 7, RETENCION: 8, LIQUIDO: 9 };
  }
  
  var honorarios = [];
  var totalBruto = 0, totalRetencion = 0, totalLiquido = 0;
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var fecha = parsearFechaSimple(row[cols.FECHA]);
    if (!fecha) continue;
    if (fecha.getFullYear() !== año) continue;
    if (mes && fecha.getMonth() + 1 !== mes) continue;
    var bruto = parseFloat(row[cols.BRUTO]) || 0;
    var retencion = parseFloat(row[cols.RETENCION]) || 0;
    var liquido = parseFloat(row[cols.LIQUIDO]) || 0;
    honorarios.push({
      fecha: formatearFechaSimple(fecha),
      numero: row[cols.FOLIO],
      rut: row[cols.RUT],
      nombre: row[cols.RAZON],
      bruto: bruto, retencion: retencion, liquido: liquido
    });
    totalBruto += bruto; totalRetencion += retencion; totalLiquido += liquido;
  }
  var config = getConfig();
  return {
    empresa: { nombre: config.EMPRESA_NOMBRE || 'Empresa', rut: config.EMPRESA_RUT || '' },
    periodo: { año: año, mes: mes, nombreMes: getNombreMes(mes) },
    honorarios: honorarios,
    totales: { bruto: totalBruto, retencion: totalRetencion, liquido: totalLiquido, cantidad: honorarios.length }
  };
}

function parsearFechaSimple(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor;
  var str = String(valor).trim();
  var match1 = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (match1) return new Date(parseInt(match1[3]), parseInt(match1[2]) - 1, parseInt(match1[1]));
  var match2 = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (match2) return new Date(parseInt(match2[1]), parseInt(match2[2]) - 1, parseInt(match2[3]));
  var fecha = new Date(valor);
  return isNaN(fecha.getTime()) ? null : fecha;
}

function formatearFechaSimple(fecha) {
  if (!fecha) return '';
  var d = fecha.getDate(), m = fecha.getMonth() + 1, y = fecha.getFullYear();
  return (d < 10 ? '0' : '') + d + '/' + (m < 10 ? '0' : '') + m + '/' + y;
}

// =============================================================================
// PLAN DE CUENTAS CRUD
// =============================================================================

function getPlanCuentasUI() {
  var cuentas = getPlanCuentas(false);
  var config = getConfig();
  var arbol = [];
  var mapa = {};
  for (var i = 0; i < cuentas.length; i++) {
    mapa[cuentas[i].codigo] = { codigo: cuentas[i].codigo, nombre: cuentas[i].nombre, tipo: cuentas[i].tipo, nivel: cuentas[i].nivel, requiereAuxiliar: cuentas[i].requiereAuxiliar, requiereDocumento: cuentas[i].requiereDocumento, esConciliable: cuentas[i].esConciliable, activa: cuentas[i].activa, hijos: [] };
  }
  for (var i = 0; i < cuentas.length; i++) {
    var c = cuentas[i];
    var partes = c.codigo.split('-');
    var encontroPadre = false;
    for (var j = partes.length - 1; j > 0; j--) {
      var codigoPadre = partes.slice(0, j).join('-');
      if (mapa[codigoPadre]) { mapa[codigoPadre].hijos.push(mapa[c.codigo]); encontroPadre = true; break; }
    }
    if (!encontroPadre) arbol.push(mapa[c.codigo]);
  }
  return toClient({ empresa: { nombre: config.EMPRESA_NOMBRE || 'Empresa' }, cuentas: cuentas, arbol: arbol });
}

function guardarCuentaUI(datos) {
  var ss = getSS();
  var sheets = getSheetNames();
  var sheet = buscarHoja(ss, sheets.PLAN_CUENTAS);
  if (!sheet) return toClient({ success: false, error: 'Hoja no encontrada' });
  if (!datos.codigo || !/^\d(-\d{1,2}){1,4}$/.test(datos.codigo)) return toClient({ success: false, error: 'Código inválido' });
  var cuentaExistente = getCuenta(datos.codigo);
  if (cuentaExistente && !datos.actualizar) return toClient({ success: false, error: 'La cuenta ya existe' });
  var fila = [
    datos.codigo, datos.nombre, datos.tipo, datos.naturaleza || '',
    datos.nivel || calcularNivel(datos.codigo),
    datos.requiereAuxiliar ? 'X' : '', datos.ctrlDocumento ? 'X' : '',
    datos.requiereDocumento ? 'X' : '', datos.esConciliable ? 'X' : '',
    datos.afectaEfe ? 'X' : '', datos.centroCosto ? 'X' : '',
    datos.activa !== false ? 'S' : 'N'
  ];
  if (cuentaExistente) { sheet.getRange(cuentaExistente.rowIndex, 1, 1, fila.length).setValues([fila]); }
  else { sheet.appendRow(fila); }
  invalidarCache();
  return toClient({ success: true });
}

// =============================================================================
// AUXILIARES CRUD
// =============================================================================

function getAuxiliaresUI(filtros) {
  filtros = filtros || {};
  var auxiliares = getAuxiliares(!filtros.incluirInactivos);
  if (filtros.tipo) auxiliares = auxiliares.filter(function(a) { return a.tipo === filtros.tipo; });
  if (filtros.busqueda) {
    var busq = filtros.busqueda.toLowerCase();
    auxiliares = auxiliares.filter(function(a) { return a.rutNumero.indexOf(busq) !== -1 || a.nombre.toLowerCase().indexOf(busq) !== -1; });
  }
  return toClient(auxiliares);
}

function buscarAuxiliaresUI(texto) {
  return toClient(buscarAuxiliares(texto, 10));
}

function getDocsPendientesUI(codigoCuenta, auxiliar) {
  var resultado = getSaldosPorDocumento(codigoCuenta, auxiliar, null);
  return toClient(resultado);
}

function getCuentasConDocumentoUI(tipoCuenta) {
  var cuentas = getCuentasMovimiento();
  var resultado = [];
  for (var i = 0; i < cuentas.length; i++) {
    if (cuentas[i].tipo === tipoCuenta && cuentas[i].requiereDocumento) {
      resultado.push({ codigo: cuentas[i].codigo, nombre: cuentas[i].nombre });
    }
  }
  return toClient(resultado);
}

function guardarAuxiliarUI(datos) {
  if (!validarRUT(datos.rut)) return toClient({ success: false, error: 'RUT inválido' });
  var rutLimpio = limpiarRUT(datos.rut);
  var existente = getAuxiliar(rutLimpio);
  if (existente && !datos.actualizar) return toClient({ success: false, error: 'El auxiliar ya existe' });
  if (!existente) return toClient(crearAuxiliar(datos));
  var ss = getSS();
  var sheets = getSheetNames();
  var sheet = buscarHoja(ss, sheets.AUXILIARES);
  var fila = [
    formatearRUT(rutLimpio), datos.nombre, datos.tipo || 'OTRO',
    datos.plazoPago || 0, datos.email || '', datos.telefono || '', datos.direccion || '',
    datos.activo !== false ? 'S' : 'N'
  ];
  sheet.getRange(existente.rowIndex, 1, 1, fila.length).setValues([fila]);
  invalidarCache();
  return toClient({ success: true });
}

// =============================================================================
// CIERRE Y APERTURA (v3: SOLO ANUAL)
// =============================================================================

function getEstadoCierreUI(año) {
  var config = getConfig();
  var periodos = getPeriodos();
  var periodoAño = null;
  for (var i = 0; i < periodos.length; i++) { if (periodos[i].año === año) { periodoAño = periodos[i]; break; } }
  var estadoResultados = getEstadoResultados(año, 1, 12);
  var añoSiguienteExiste = false;
  var añoAnteriorExiste = false;
  for (var i = 0; i < periodos.length; i++) {
    if (periodos[i].año === año + 1) { añoSiguienteExiste = true; }
    if (periodos[i].año === año - 1) { añoAnteriorExiste = true; }
  }
  
  // Verificar si el año tiene comprobante de apertura vigente
  var tieneApertura = false;
  var compApertura = buscarComprobantePorOrigen_('APERTURA', String(año));
  if (compApertura) tieneApertura = true;
  
  return toClient({
    año: año,
    estado: periodoAño ? periodoAño.estado : 'NO EXISTE',
    fechaApertura: periodoAño ? periodoAño.fechaApertura : null,
    fechaCierre: periodoAño ? periodoAño.fechaCierre : null,
    archivoUrl: periodoAño ? periodoAño.archivoUrl : '',
    // Abrir siguiente: el año actual debe existir, el siguiente no
    puedeAbrirSiguiente: periodoAño && !añoSiguienteExiste,
    // Cerrar: año debe estar abierto
    puedeCerrar: periodoAño && periodoAño.estado === 'ABIERTO',
    // Reabrir: año debe estar cerrado
    puedeReabrir: periodoAño && periodoAño.estado === 'CERRADO',
    // Reapertura (recalcular saldos): año abierto con año anterior existente y con apertura previa
    puedeReapertura: periodoAño && periodoAño.estado === 'ABIERTO' && añoAnteriorExiste && tieneApertura,
    resultadoProyectado: estadoResultados.resultadoNeto,
    añoSiguienteExiste: añoSiguienteExiste,
    defaultAcumulados: config.CUENTA_RESULTADOS_ACUMULADOS || '3-2-01-001'
  });
}

function cerrarAñoUI(año) {
  var resultado = cerrarAño(año);
  if (resultado.success) {
    return toClient({ success: true, mensaje: 'Año ' + año + ' cerrado', comprobante: resultado.comprobante, resultadoEjercicio: resultado.resultadoEjercicio, archivoUrl: resultado.archivoUrl || '' });
  }
  return toClient(resultado);
}

function abrirAñoUI(año, cuentaAcumulados) {
  var resultado = abrirAño(año, cuentaAcumulados);
  if (resultado.success) {
    return toClient({ success: true, mensaje: resultado.mensaje || 'Año ' + año + ' abierto', comprobante: resultado.comprobante });
  }
  return toClient(resultado);
}

function reabrirAñoUI(año) {
  var resultado = reabrirAño(año);
  if (resultado.success) {
    return toClient({ success: true, mensaje: resultado.mensaje });
  }
  return toClient(resultado);
}

function reAperturaUI(año, cuentaAcumulados) {
  var resultado = reApertura(año, cuentaAcumulados);
  if (resultado.success) {
    return toClient({ success: true, mensaje: resultado.mensaje, comprobante: resultado.comprobante });
  }
  return toClient(resultado);
}

function consultarAñoArchivadoUI(año) {
  return toClient(consultarAñoArchivado(año));
}

// =============================================================================
// EXPORTAR REPORTES — toClient en wrapper central
// =============================================================================

function exportarReporte(tipo, parametros) {
  var resultado;
  switch (tipo) {
    case 'libro_diario':      resultado = getReporteLibroDiario(parametros.año, parametros.mes); break;
    case 'libro_mayor':       resultado = getReporteLibroMayor(parametros.cuenta, parametros.año, parametros.mesDesde, parametros.mesHasta); break;
    case 'balance_8':         resultado = getReporteBalance8Columnas(parametros.año, parametros.mesHasta); break;
    case 'estado_resultados': resultado = getReporteEstadoResultados(parametros.año, parametros.mesDesde, parametros.mesHasta); break;
    case 'flujo_efectivo':    resultado = getReporteFlujoEfectivo(parametros.año, parametros.mesDesde, parametros.mesHasta); break;
    case 'cxc':               resultado = getReporteCuentasPorCobrar(parametros.año, parametros.cuenta, parametros.auxiliar, parametros.vista); break;
    case 'cxp':               resultado = getReporteCuentasPorPagar(parametros.año, parametros.cuenta, parametros.auxiliar, parametros.vista); break;
    case 'libro_ventas':      resultado = getLibroVentas(parametros.año, parametros.mes); break;
    case 'libro_compras':     resultado = getLibroCompras(parametros.año, parametros.mes); break;
    case 'libro_honorarios':  resultado = getLibroHonorarios(parametros.año, parametros.mes); break;
    case 'eeff':              resultado = getReporteEstadoSituacion(parametros.año, parametros.mesHasta); break;
    case 'consolidado':       return exportarConsolidado(parametros);
    default: resultado = { error: 'Tipo de reporte no válido' };
  }
  return toClient(resultado);
}

// =============================================================================
// CSV
// =============================================================================

function exportarLibroVentasCSV(año, mes) {
  var libro = getLibroVentas(año, mes);
  if (libro.error) return toClient({ error: libro.error });
  var csv = 'Fecha,Tipo,Folio,RUT,Razon Social,Exento,Neto,IVA,Total\n';
  for (var i = 0; i < libro.ventas.length; i++) {
    var v = libro.ventas[i];
    csv += v.fecha + ',' + v.tipoDTE + ',' + v.folio + ',"' + v.rut + '","' + (v.razonSocial || '').replace(/"/g, '""') + '",' + v.exento + ',' + v.neto + ',' + v.iva + ',' + v.total + '\n';
  }
  csv += '\nTOTALES,' + libro.totales.cantidad + ' docs,,,,' + libro.totales.exento + ',' + libro.totales.neto + ',' + libro.totales.iva + ',' + libro.totales.total;
  return toClient({ nombre: 'LibroVentas_' + año + '_' + (mes < 10 ? '0' : '') + mes + '.csv', contenido: csv, tipo: 'text/csv' });
}

function exportarLibroComprasCSV(año, mes) {
  var libro = getLibroCompras(año, mes);
  if (libro.error) return toClient({ error: libro.error });
  var csv = 'Fecha,Tipo,Folio,RUT,Razon Social,Exento,Neto,IVA,Total\n';
  for (var i = 0; i < libro.compras.length; i++) {
    var c = libro.compras[i];
    csv += c.fecha + ',' + c.tipoDTE + ',' + c.folio + ',"' + c.rut + '","' + (c.razonSocial || '').replace(/"/g, '""') + '",' + c.exento + ',' + c.neto + ',' + c.iva + ',' + c.total + '\n';
  }
  csv += '\nTOTALES,' + libro.totales.cantidad + ' docs,,,,' + libro.totales.exento + ',' + libro.totales.neto + ',' + libro.totales.iva + ',' + libro.totales.total;
  return toClient({ nombre: 'LibroCompras_' + año + '_' + (mes < 10 ? '0' : '') + mes + '.csv', contenido: csv, tipo: 'text/csv' });
}

function exportarLibroMayorCSV(cuenta, año, mesDesde, mesHasta) {
  var reporte = getReporteLibroMayor(cuenta, año, mesDesde, mesHasta);
  if (reporte.error) return toClient({ error: reporte.error });
  var csv = '';
  if (reporte.esMultiple) {
    csv = 'LIBRO MAYOR - ' + reporte.titulo + '\nPeriodo: ' + reporte.nombreMesDesde + ' a ' + reporte.nombreMesHasta + ' ' + reporte.periodo.año + '\n\n';
    for (var i = 0; i < reporte.cuentas.length; i++) {
      var cta = reporte.cuentas[i];
      csv += '\n' + cta.codigo + ' - ' + cta.nombre + '\nFecha,Comprobante,Glosa,Debe,Haber,Saldo\nSaldo Anterior,,,,,,' + cta.saldoAnterior + '\n';
      for (var j = 0; j < cta.movimientos.length; j++) { var m = cta.movimientos[j]; csv += m.fecha + ',' + m.comprobante + ',"' + (m.glosa || '').replace(/"/g, '""') + '",' + m.debe + ',' + m.haber + ',' + m.saldo + '\n'; }
      csv += 'TOTALES CUENTA,,,' + cta.totalDebe + ',' + cta.totalHaber + ',' + cta.saldoFinal + '\n';
    }
    csv += '\nTOTALES GENERALES,,,' + reporte.totalGeneralDebe + ',' + reporte.totalGeneralHaber + '\n';
  } else {
    csv = 'Cuenta: ' + reporte.cuenta.codigo + ' - ' + reporte.cuenta.nombre + '\nPeriodo: ' + reporte.nombreMesDesde + ' a ' + reporte.nombreMesHasta + ' ' + reporte.periodo.año + '\n\nFecha,Comprobante,Glosa,Debe,Haber,Saldo\nSaldo Anterior,,,,,,' + reporte.saldoAnterior + '\n';
    if (reporte.movimientos) { for (var i = 0; i < reporte.movimientos.length; i++) { var m = reporte.movimientos[i]; csv += m.fecha + ',' + m.comprobante + ',"' + (m.glosa || '').replace(/"/g, '""') + '",' + m.debe + ',' + m.haber + ',' + m.saldo + '\n'; } }
    csv += '\nTOTALES,,,' + reporte.totalDebe + ',' + reporte.totalHaber + ',' + reporte.saldoFinal;
  }
  return toClient({ nombre: 'LibroMayor_' + cuenta + '_' + año + '.csv', contenido: csv, tipo: 'text/csv' });
}

function exportarBalanceCSV(año, mes) {
  var reporte = getReporteBalance8Columnas(año, mes);
  if (reporte.error) return toClient({ error: reporte.error });
  var csv = 'Balance de Comprobacion - ' + año + '\n\nCodigo,Cuenta,Saldo Ant Debe,Saldo Ant Haber,Debe Mes,Haber Mes,Deudor,Acreedor,Activo,Pasivo,Perdida,Ganancia\n';
  if (reporte.cuentas) {
    for (var i = 0; i < reporte.cuentas.length; i++) {
      var c = reporte.cuentas[i];
      csv += c.codigo + ',"' + c.nombre + '",' + (c.saldoAnteriorDebe||0) + ',' + (c.saldoAnteriorHaber||0) + ',' + (c.debeMes||0) + ',' + (c.haberMes||0) + ',' + (c.saldoDeudor||0) + ',' + (c.saldoAcreedor||0) + ',' + (c.inventarioActivo||0) + ',' + (c.inventarioPasivo||0) + ',' + (c.resultadoPerdida||0) + ',' + (c.resultadoGanancia||0) + '\n';
    }
  }
  return toClient({ nombre: 'Balance_' + año + '_' + (mes < 10 ? '0' : '') + mes + '.csv', contenido: csv, tipo: 'text/csv' });
}

function exportarEstadoResultadosCSV(año, mesDesde, mesHasta) {
  var reporte = getReporteEstadoResultados(año, mesDesde, mesHasta);
  if (reporte.error) return toClient({ error: reporte.error });
  var csv = 'Estado de Resultados - ' + año + '\n\nCodigo,Cuenta,Monto\n\nINGRESOS\n';
  if (reporte.ingresos) { for (var i = 0; i < reporte.ingresos.length; i++) { var ing = reporte.ingresos[i]; csv += ing.codigo + ',"' + ing.nombre + '",' + ing.monto + '\n'; } }
  csv += ',Total Ingresos,' + reporte.totalIngresos + '\n\nGASTOS\n';
  if (reporte.gastos) { for (var i = 0; i < reporte.gastos.length; i++) { var gto = reporte.gastos[i]; csv += gto.codigo + ',"' + gto.nombre + '",' + gto.monto + '\n'; } }
  csv += ',Total Gastos,' + reporte.totalGastos + '\n\n,RESULTADO NETO,' + reporte.resultadoNeto;
  return toClient({ nombre: 'EstadoResultados_' + año + '.csv', contenido: csv, tipo: 'text/csv' });
}

function getAñosDisponibles() {
  var periodos = getPeriodos();
  var años = [];
  for (var i = 0; i < periodos.length; i++) { if (años.indexOf(periodos[i].año) === -1) años.push(periodos[i].año); }
  años.sort();
  return años;
}

// =============================================================================
// DASHBOARD — Centro de Comando
// =============================================================================

function getDashboardDataUI(año) {
  año = parseInt(año) || new Date().getFullYear();
  var config = getConfig();
  var mesActual = new Date().getMonth() + 1;
  var result = {
    empresa: config.EMPRESA_NOMBRE || 'Empresa',
    rut: config.EMPRESA_RUT || '',
    año: año,
    mesActual: mesActual,
    nombreMes: getNombreMes(mesActual)
  };
  
  // ── 1. RESULTADO DEL EJERCICIO ──
  try {
    var eerr = getEstadoResultados(año, 1, mesActual);
    result.resultado = {
      ingresos: eerr.totalIngresos || 0,
      gastos: eerr.totalGastos || 0,
      resultadoNeto: eerr.resultadoNeto || 0,
      resultadoPrev: eerr.resultadoPrev || 0
    };
    // Resultado por mes (usar datos mensuales ya calculados en EERR, sin llamar N veces)
    var resultadoPorMes = [];
    for (var m = 1; m <= mesActual; m++) {
      resultadoPorMes.push({
        mes: m, nombre: getNombreMes(m),
        ingresos: eerr.totalIngMes[m] || 0,
        gastos: eerr.totalGasMes[m] || 0,
        resultado: eerr.resultadoMes[m] || 0
      });
    }
    result.resultadoPorMes = resultadoPorMes;
  } catch(e) {
    result.resultado = { ingresos: 0, gastos: 0, resultadoNeto: 0, resultadoPrev: 0 };
    result.resultadoPorMes = [];
  }
  
  // ── 2. SALDO BANCO (misma lógica que Conciliación) ──
  try {
    var ctaBanco = config.CUENTA_BANCO || '1-1-01-002';
    var ctaInfo = getCuenta(ctaBanco);
    var nombreBanco = ctaInfo ? ctaInfo.nombre : 'Banco';
    var saldoBanco = 0;
    // Buscar desde mes actual hacia atrás hasta encontrar datos
    for (var bm = mesActual; bm >= 1; bm--) {
      var movCart = getMovimientosCartola_(año, bm);
      if (movCart.movimientos && movCart.movimientos.length > 0) {
        saldoBanco = movCart.resumen.saldoBanco || 0;
        break;
      }
    }
    result.banco = { nombre: nombreBanco, saldo: saldoBanco };
  } catch(e) { result.banco = { nombre: 'Banco', saldo: 0 }; }
  
  // ── 3. CUENTAS POR COBRAR ──
  try {
    var cxcData = getResumenClientes_();
    result.cxc = {
      totalPendiente: cxcData.kpis.totalPendiente,
      cantPendientes: cxcData.kpis.cantPendientes,
      cantMorosos: cxcData.kpis.cantMorosos,
      diasPromedio: cxcData.kpis.diasPromedio
    };
  } catch(e) { result.cxc = { totalPendiente: 0, cantPendientes: 0, cantMorosos: 0, diasPromedio: 0 }; }
  
  // ── 4. CUENTAS POR PAGAR ──
  try {
    var ctaProv = config.CUENTA_PROVEEDORES || '2-1-02-001';
    var ctaHon = config.CUENTA_HONORARIOS_PAGAR || '2-1-04-001';
    var cxpTotal = 0, cxpDocs = 0;
    var saldosProv = getSaldosPorDocumento(ctaProv, null, null);
    if (saldosProv && saldosProv.documentos) {
      for (var i = 0; i < saldosProv.documentos.length; i++) {
        if (saldosProv.documentos[i].saldo > 1) { cxpTotal += saldosProv.documentos[i].saldo; cxpDocs++; }
      }
    }
    var saldosHon = getSaldosPorDocumento(ctaHon, null, null);
    if (saldosHon && saldosHon.documentos) {
      for (var i = 0; i < saldosHon.documentos.length; i++) {
        if (saldosHon.documentos[i].saldo > 1) { cxpTotal += saldosHon.documentos[i].saldo; cxpDocs++; }
      }
    }
    result.cxp = { totalPendiente: cxpTotal, cantDocs: cxpDocs };
  } catch(e) { result.cxp = { totalPendiente: 0, cantDocs: 0 }; }
  
  // ── 5. COMPROBANTES ──
  try {
    var compData = getComprobantes(año);
    var vigentes = compData.filter(function(c) { return c.estado !== 'ANULADO'; });
    var delMes = vigentes.filter(function(c) { return c.mes === mesActual; });
    result.comprobantes = { total: vigentes.length, mes: delMes.length };
  } catch(e) { result.comprobantes = { total: 0, mes: 0 }; }
  
  // ── 6. CONCILIACIÓN ──
  try {
    var cartData = getResumenCartolaPorMes_(año);
    var meses = cartData.meses || [];
    var mesCart = null;
    // meses[i] = { mes, pendientes, contabilizados, abonos, cargos, ... }
    for (var m = meses.length - 1; m >= 0; m--) {
      var totalM = (meses[m].pendientes || 0) + (meses[m].contabilizados || 0);
      if (totalM > 0) { mesCart = meses[m]; mesCart._total = totalM; break; }
    }
    if (mesCart) {
      var totalMovs = mesCart._total;
      result.conciliacion = {
        mes: mesCart.mes,
        nombreMes: getNombreMes(mesCart.mes),
        totalMovs: totalMovs,
        contabilizados: mesCart.contabilizados,
        pendientes: mesCart.pendientes,
        pctAvance: totalMovs > 0 ? Math.round(mesCart.contabilizados / totalMovs * 100) : 0
      };
    } else {
      result.conciliacion = { mes: 0, nombreMes: '', totalMovs: 0, contabilizados: 0, pendientes: 0, pctAvance: 0 };
    }
  } catch(e) { result.conciliacion = { mes: 0, nombreMes: '', totalMovs: 0, contabilizados: 0, pendientes: 0, pctAvance: 0 }; }
  
  // ── 7. CENTRALIZACIÓN ──
  try {
    var centData = getHistorialCentralizaciones_(año);
    var activas = centData.filter(function(c) { return c.estado !== 'ANULADO'; });
    result.centralizacion = { total: activas.length };
  } catch(e) { result.centralizacion = { total: 0 }; }
  
  // ── 8. TOP MOROSOS ──
  try {
    var morData = getMorosos_();
    var topMor = [];
    var rutVisto = {};
    for (var i = 0; i < morData.documentos.length && topMor.length < 5; i++) {
      var d = morData.documentos[i];
      if (!rutVisto[d.rut]) {
        // Sumar todo del mismo rut
        var totalRut = 0, docsRut = 0, maxDias = 0;
        for (var j = 0; j < morData.documentos.length; j++) {
          if (morData.documentos[j].rut === d.rut) {
            totalRut += morData.documentos[j].saldo;
            docsRut++;
            if (morData.documentos[j].dias > maxDias) maxDias = morData.documentos[j].dias;
          }
        }
        topMor.push({ rut: d.rutFmt, nombre: d.nombre, saldo: totalRut, docs: docsRut, dias: maxDias });
        rutVisto[d.rut] = true;
      }
    }
    result.topMorosos = topMor;
  } catch(e) { result.topMorosos = []; }
  
  return toClient(result);
}




// TEST: Diagnosticar saldo cartola
function testDiagnosticoCartola() {
  var ss = getSS();
  var sheets = getSheetNames();
  var sheet = buscarHoja(ss, sheets.CARTOLA);
  if (!sheet) return 'Hoja no encontrada';
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var resultado = {
    headers: [],
    totalFilas: data.length - 1,
    sumaColA: 0,
    ultimoSaldoColD: 0,
    porAño: {}
  };
  
  for (var h = 0; h < Math.min(headers.length, 12); h++) {
    resultado.headers.push({ col: h, header: String(headers[h]) });
  }
  
  for (var i = 1; i < data.length; i++) {
    var monto = parseFloat(data[i][0]) || 0;
    var saldo = parseFloat(data[i][3]) || 0;
    var fecha = data[i][2];
    resultado.sumaColA += monto;
    resultado.ultimoSaldoColD = saldo;
    
    if (fecha instanceof Date) {
      var año = fecha.getFullYear();
      if (!resultado.porAño[año]) resultado.porAño[año] = { filas: 0, sumaMontos: 0, ultimoSaldo: 0 };
      resultado.porAño[año].filas++;
      resultado.porAño[año].sumaMontos += monto;
      resultado.porAño[año].ultimoSaldo = saldo;
    }
  }
  
  for (var i = Math.max(1, data.length - 5); i < data.length; i++) {
    if (!resultado.ultimasFila) resultado.ultimasFila = [];
    resultado.ultimasFila.push({
      fila: i + 1,
      colA: data[i][0],
      colB: String(data[i][1]).substring(0, 30),
      colC: data[i][2],
      colD: data[i][3],
      colG_tipo: data[i][6]
    });
  }
  
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}