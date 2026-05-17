import ExcelJS from "exceljs";

const EMPRESA = "NOTIFICA LEGAL SpA";
const RUT_EMPRESA = "78.036.379-7";

const COLOR_HEADER = "1F3864";
const COLOR_SUBHEADER = "D6E4F0";
const COLOR_TOTALES = "E2EFDA";
const FONT_HEADER = { name: "Calibri", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
const FONT_SUBHEADER = { name: "Calibri", size: 10, bold: true, color: { argb: "FF1F3864" } };
const FONT_NORMAL = { name: "Calibri", size: 10 };
const FONT_TOTALES = { name: "Calibri", size: 10, bold: true };
const BORDER_THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD0D0D0" } },
  bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
  left: { style: "thin", color: { argb: "FFD0D0D0" } },
  right: { style: "thin", color: { argb: "FFD0D0D0" } },
};

type ColumnDef = {
  key: string;
  header: string;
  width?: number;
  numFmt?: string;
  alignment?: Partial<ExcelJS.Alignment>;
};

export function crearLibroCorporativo(opts: {
  titulo: string;
  periodo: string;
  hoja: string;
  columnas: ColumnDef[];
  datos: Record<string, unknown>[];
  totales?: Record<string, unknown>;
  totalesLabel?: string;
}): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = EMPRESA;
  wb.created = new Date();

  const ws = wb.addWorksheet(opts.hoja, {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const totalCols = opts.columnas.length;

  // Row 1: Company name
  ws.mergeCells(1, 1, 1, totalCols);
  const cellEmpresa = ws.getCell(1, 1);
  cellEmpresa.value = EMPRESA;
  cellEmpresa.font = FONT_HEADER;
  cellEmpresa.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_HEADER } };
  cellEmpresa.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 30;

  // Row 2: RUT
  ws.mergeCells(2, 1, 2, totalCols);
  const cellRut = ws.getCell(2, 1);
  cellRut.value = `RUT: ${RUT_EMPRESA}`;
  cellRut.font = { name: "Calibri", size: 10, color: { argb: "FFFFFFFF" } };
  cellRut.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_HEADER } };
  cellRut.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(2).height = 20;

  // Row 3: Report title + period
  ws.mergeCells(3, 1, 3, totalCols);
  const cellTitulo = ws.getCell(3, 1);
  cellTitulo.value = `${opts.titulo}  —  ${opts.periodo}`;
  cellTitulo.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF1F3864" } };
  cellTitulo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_SUBHEADER } };
  cellTitulo.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(3).height = 24;

  // Row 4: empty separator
  ws.getRow(4).height = 6;

  // Row 5: Column headers
  const headerRow = ws.getRow(5);
  opts.columnas.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = FONT_SUBHEADER;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_SUBHEADER } };
    cell.alignment = col.alignment || { horizontal: "left", vertical: "middle" };
    cell.border = {
      top: { style: "medium", color: { argb: "FF1F3864" } },
      bottom: { style: "medium", color: { argb: "FF1F3864" } },
      left: { style: "thin", color: { argb: "FF8FAADC" } },
      right: { style: "thin", color: { argb: "FF8FAADC" } },
    };
    ws.getColumn(i + 1).width = col.width || 14;
  });
  headerRow.height = 22;

  // Data rows
  let rowIdx = 6;
  for (let di = 0; di < opts.datos.length; di++) {
    const d = opts.datos[di];
    const row = ws.getRow(rowIdx);
    const isAlt = di % 2 === 1;

    opts.columnas.forEach((col, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = d[col.key] as ExcelJS.CellValue;
      cell.font = FONT_NORMAL;
      cell.border = BORDER_THIN;
      cell.alignment = col.alignment || { horizontal: "left", vertical: "middle" };
      if (col.numFmt) cell.numFmt = col.numFmt;
      if (isAlt) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F7FA" } };
      }
    });
    row.height = 18;
    rowIdx++;
  }

  // Totals row
  if (opts.totales) {
    const totRow = ws.getRow(rowIdx);
    totRow.height = 24;
    opts.columnas.forEach((col, ci) => {
      const cell = totRow.getCell(ci + 1);
      const val = opts.totales![col.key];
      if (ci === 0 && !val) {
        cell.value = opts.totalesLabel || "TOTALES";
      } else {
        cell.value = val as ExcelJS.CellValue;
      }
      cell.font = FONT_TOTALES;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_TOTALES } };
      cell.border = {
        top: { style: "medium", color: { argb: "FF1F3864" } },
        bottom: { style: "medium", color: { argb: "FF1F3864" } },
        left: { style: "thin", color: { argb: "FF8FAADC" } },
        right: { style: "thin", color: { argb: "FF8FAADC" } },
      };
      cell.alignment = col.alignment || { horizontal: "left", vertical: "middle" };
      if (col.numFmt) cell.numFmt = col.numFmt;
    });
  }

  // Freeze header rows
  ws.views = [{ state: "frozen", ySplit: 5, xSplit: 0 }];

  // Auto-filter
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: rowIdx - 1, column: totalCols } };

  return wb;
}

export function crearLibroMayorCorporativo(opts: {
  periodo: string;
  cuentas: {
    codigo: string;
    nombre: string;
    saldoAnterior: number;
    movimientos: Record<string, unknown>[];
    totalDebe: number;
    totalHaber: number;
    saldoFinal: number;
  }[];
}): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = EMPRESA;
  wb.created = new Date();

  const ws = wb.addWorksheet("Libro Mayor", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const cols = [
    { key: "cuenta", header: "Cuenta", width: 14 },
    { key: "nombre", header: "Nombre", width: 28 },
    { key: "fecha", header: "Fecha", width: 12 },
    { key: "comprobante", header: "Comp.", width: 12 },
    { key: "auxiliar", header: "Auxiliar", width: 14 },
    { key: "documento", header: "Documento", width: 14 },
    { key: "debe", header: "Debe", width: 16 },
    { key: "haber", header: "Haber", width: 16 },
    { key: "saldo", header: "Saldo", width: 16 },
    { key: "glosa", header: "Glosa", width: 30 },
  ];
  const totalCols = cols.length;

  // Header rows
  ws.mergeCells(1, 1, 1, totalCols);
  const c1 = ws.getCell(1, 1);
  c1.value = EMPRESA;
  c1.font = FONT_HEADER;
  c1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_HEADER } };
  c1.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 30;

  ws.mergeCells(2, 1, 2, totalCols);
  const c2 = ws.getCell(2, 1);
  c2.value = `RUT: ${RUT_EMPRESA}`;
  c2.font = { name: "Calibri", size: 10, color: { argb: "FFFFFFFF" } };
  c2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_HEADER } };
  c2.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(2).height = 20;

  ws.mergeCells(3, 1, 3, totalCols);
  const c3 = ws.getCell(3, 1);
  c3.value = `LIBRO MAYOR  —  ${opts.periodo}`;
  c3.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF1F3864" } };
  c3.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_SUBHEADER } };
  c3.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(3).height = 24;

  ws.getRow(4).height = 6;

  // Column headers
  const headerRow = ws.getRow(5);
  cols.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = FONT_SUBHEADER;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_SUBHEADER } };
    cell.alignment = { horizontal: i >= 6 ? "right" : "left", vertical: "middle" };
    cell.border = {
      top: { style: "medium", color: { argb: "FF1F3864" } },
      bottom: { style: "medium", color: { argb: "FF1F3864" } },
      left: { style: "thin", color: { argb: "FF8FAADC" } },
      right: { style: "thin", color: { argb: "FF8FAADC" } },
    };
    ws.getColumn(i + 1).width = col.width;
  });
  headerRow.height = 22;

  let rowIdx = 6;
  const MONEY_FMT = "#,##0";
  const rightAlign: Partial<ExcelJS.Alignment> = { horizontal: "right", vertical: "middle" };

  for (const cuenta of opts.cuentas) {
    // Saldo anterior row
    if (cuenta.saldoAnterior !== 0) {
      const r = ws.getRow(rowIdx);
      r.getCell(1).value = cuenta.codigo;
      r.getCell(2).value = cuenta.nombre;
      r.getCell(7).value = "";
      r.getCell(8).value = "";
      r.getCell(9).value = cuenta.saldoAnterior;
      r.getCell(9).numFmt = MONEY_FMT;
      r.getCell(9).alignment = rightAlign;
      r.getCell(10).value = "SALDO ANTERIOR";
      for (let ci = 1; ci <= totalCols; ci++) {
        const cell = r.getCell(ci);
        cell.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF4472C4" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } };
        cell.border = BORDER_THIN;
      }
      r.height = 18;
      rowIdx++;
    }

    // Movement rows
    let altToggle = 0;
    for (const m of cuenta.movimientos) {
      const r = ws.getRow(rowIdx);
      r.getCell(1).value = cuenta.codigo;
      r.getCell(2).value = cuenta.nombre;
      r.getCell(3).value = m.fecha as string;
      r.getCell(4).value = m.comprobante as string;
      r.getCell(5).value = m.auxiliar as string;
      r.getCell(6).value = m.documento as string;
      r.getCell(7).value = (m.debe as number) || "";
      r.getCell(8).value = (m.haber as number) || "";
      r.getCell(9).value = m.saldo as number;
      r.getCell(10).value = m.glosa as string;

      for (let ci = 1; ci <= totalCols; ci++) {
        const cell = r.getCell(ci);
        cell.font = FONT_NORMAL;
        cell.border = BORDER_THIN;
        if (ci >= 7) { cell.alignment = rightAlign; cell.numFmt = MONEY_FMT; }
        if (altToggle % 2 === 1) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F7FA" } };
        }
      }
      r.height = 18;
      rowIdx++;
      altToggle++;
    }

    // Totals row for this account
    const tr = ws.getRow(rowIdx);
    tr.getCell(1).value = cuenta.codigo;
    tr.getCell(2).value = cuenta.nombre;
    tr.getCell(6).value = "TOTALES";
    tr.getCell(7).value = cuenta.totalDebe;
    tr.getCell(8).value = cuenta.totalHaber;
    tr.getCell(9).value = cuenta.saldoFinal;
    for (let ci = 1; ci <= totalCols; ci++) {
      const cell = tr.getCell(ci);
      cell.font = FONT_TOTALES;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_TOTALES } };
      cell.border = {
        top: { style: "medium", color: { argb: "FF1F3864" } },
        bottom: { style: "medium", color: { argb: "FF1F3864" } },
        left: { style: "thin", color: { argb: "FF8FAADC" } },
        right: { style: "thin", color: { argb: "FF8FAADC" } },
      };
      if (ci >= 7) { cell.alignment = rightAlign; cell.numFmt = MONEY_FMT; }
    }
    tr.height = 22;
    rowIdx++;

    // Separator row
    ws.getRow(rowIdx).height = 6;
    rowIdx++;
  }

  ws.views = [{ state: "frozen", ySplit: 5, xSplit: 0 }];

  return wb;
}

export async function descargarWorkbook(wb: ExcelJS.Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
