import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const CONFIG = {
  from: "Notifica Legal <tesoreria@notificalegal.cl>",
  cc: ["carlos@notificalegal.cl"],
  banco: "Santander",
  tipoCuenta: "Cuenta Corriente",
  cuenta: "0-000-9698176-7",
  rutEmpresa: "78.036.379-7",
  razonEmpresa: "Notifica Legal SpA",
  emailPagos: "tesoreria@notificalegal.cl",
};

const MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function formatMontoEmail(n: number): string {
  return Math.round(Math.abs(n || 0)).toLocaleString("es-CL");
}

function datosBancarios(folio?: string): string {
  let h = '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin:16px 0">';
  h += '<div style="font-size:12px;font-weight:700;color:#059669;margin-bottom:8px">DATOS PARA TRANSFERENCIA</div>';
  h += '<table style="font-size:13px;color:#334155">';
  h += `<tr><td style="padding:2px 12px 2px 0;color:#64748b">Titular:</td><td style="font-weight:600">${CONFIG.razonEmpresa}</td></tr>`;
  h += `<tr><td style="padding:2px 12px 2px 0;color:#64748b">RUT:</td><td style="font-weight:600">${CONFIG.rutEmpresa}</td></tr>`;
  h += `<tr><td style="padding:2px 12px 2px 0;color:#64748b">Banco:</td><td style="font-weight:600">${CONFIG.banco}</td></tr>`;
  h += `<tr><td style="padding:2px 12px 2px 0;color:#64748b">Tipo:</td><td style="font-weight:600">${CONFIG.tipoCuenta}</td></tr>`;
  h += `<tr><td style="padding:2px 12px 2px 0;color:#64748b">N° Cuenta:</td><td style="font-weight:600">${CONFIG.cuenta}</td></tr>`;
  h += `<tr><td style="padding:2px 12px 2px 0;color:#64748b">Comprobante a:</td><td style="font-weight:600">${CONFIG.emailPagos}</td></tr>`;
  if (folio) h += `<tr><td style="padding:2px 12px 2px 0;color:#64748b">Referencia:</td><td style="font-weight:600">Fac-${folio}</td></tr>`;
  h += "</table></div>";
  return h;
}

export function buildFacturaHtml(params: {
  nombre: string;
  facturacionTipo: string;
  periodo: string;
  folio: string;
  total: number;
}): string {
  const esAnticipado = params.facturacionTipo === "Mes Anticipado";
  const periodoLabel = esAnticipado ? "PERÍODO DE SERVICIO" : "PERÍODO FACTURADO";
  const badgeColor = esAnticipado ? "#2563eb" : "#d97706";
  const badgeBg = esAnticipado ? "#dbeafe" : "#fef3c7";
  const badgeText = esAnticipado ? "MES ANTICIPADO" : "MES VENCIDO";
  const intro = esAnticipado
    ? "Adjuntamos la factura correspondiente a su suscripción mensual."
    : "Adjuntamos la factura correspondiente a los servicios prestados.";

  let html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#ffffff">';
  html += '<div style="background:linear-gradient(135deg,#1e1b4b,#4338ca);padding:28px 32px;text-align:center">';
  html += '<h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:-.5px">Notifica Legal</h1>';
  html += '<p style="color:rgba(255,255,255,.7);margin:4px 0 0;font-size:13px">Servicios Jurídicos Digitales</p></div>';

  html += '<div style="padding:28px 32px">';
  html += `<p style="color:#334155;font-size:15px;margin:0 0 16px">Estimado/a <strong>${params.nombre}</strong>,</p>`;
  html += `<p style="color:#475569;font-size:14px;margin:0 0 20px">${intro}</p>`;

  html += `<div style="display:inline-block;background:${badgeBg};color:${badgeColor};padding:6px 16px;border-radius:8px;font-weight:700;font-size:13px;margin-bottom:16px">${badgeText}</div>`;

  html += '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:20px">';
  html += `<div style="font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:600;letter-spacing:.5px">${periodoLabel}</div>`;
  html += `<div style="font-size:18px;font-weight:700;color:#1e1b4b;margin-top:4px">${params.periodo}</div>`;
  if (!esAnticipado) html += '<div style="font-size:12px;color:#64748b;margin-top:2px">Servicios ya prestados</div>';
  html += "</div>";

  html += '<div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:20px">';
  html += '<div style="background:#fafbfd;padding:10px 16px;font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:600;border-bottom:1px solid #e2e8f0">Detalle</div>';
  html += '<div style="padding:14px 16px;display:flex;justify-content:space-between;align-items:center">';
  html += `<span style="color:#334155;font-size:14px">Factura N° <strong>${params.folio}</strong></span>`;
  html += `<span style="font-size:16px;font-weight:700;color:#1e1b4b">$${formatMontoEmail(params.total)}</span>`;
  html += "</div></div>";

  const vencMsg = esAnticipado
    ? "<strong>PAGO:</strong> Agradecemos realizar la transferencia dentro de los primeros 5 días del mes."
    : "<strong>VENCIMIENTO:</strong> 5 días desde la fecha de emisión de la factura.";
  html += `<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:10px 16px;margin-bottom:20px;font-size:13px;color:#92400e">${vencMsg}</div>`;

  html += datosBancarios(params.folio);

  html += '<p style="color:#475569;font-size:14px;margin:20px 0 0">Quedamos atentos a cualquier consulta.</p>';
  html += '<p style="color:#334155;font-size:14px;margin:8px 0 0"><strong>Saludos cordiales,</strong><br><span style="color:#64748b">Equipo Notifica Legal</span></p>';
  html += "</div>";

  html += '<div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center">';
  html += '<span style="color:#94a3b8;font-size:12px">tesoreria@notificalegal.cl</span></div></div>';

  return html;
}

export type DocCobranza = {
  tipoDoc: string;
  numDoc: string;
  dias: number;
  saldo: number;
};

export function buildCobranzaHtml(params: {
  nombre: string;
  docs: DocCobranza[];
  totalDeuda: number;
  maxDias: number;
  nivel: "RECORDATORIO" | "URGENTE" | "CRITICO";
}): string {
  const { nombre, docs, totalDeuda, maxDias, nivel } = params;

  let headerBg: string, headerIcon: string, intro: string;
  if (nivel === "CRITICO") {
    headerBg = "linear-gradient(135deg,#991b1b,#dc2626)";
    headerIcon = "AVISO FINAL";
    intro = "A pesar de nuestros intentos de contacto, su cuenta presenta una deuda significativa sin regularizar:";
  } else if (nivel === "URGENTE") {
    headerBg = "linear-gradient(135deg,#92400e,#d97706)";
    headerIcon = "AVISO URGENTE";
    intro = "Registra documentos con más de 30 días de mora:";
  } else {
    headerBg = "linear-gradient(135deg,#1e1b4b,#4338ca)";
    headerIcon = "RECORDATORIO";
    intro = "Le recordamos amablemente que tiene documentos pendientes de pago:";
  }

  let html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#fff">';
  html += `<div style="background:${headerBg};padding:28px 32px;text-align:center">`;
  html += '<h1 style="color:#fff;margin:0;font-size:22px">Notifica Legal</h1>';
  html += `<div style="color:rgba(255,255,255,.9);font-size:14px;margin-top:8px;font-weight:700">${headerIcon}</div></div>`;

  html += '<div style="padding:28px 32px">';
  html += `<p style="color:#334155;font-size:15px">Estimado/a <strong>${nombre}</strong>,</p>`;
  html += `<p style="color:#475569;font-size:14px">${intro}</p>`;

  html += '<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">';
  html += '<thead><tr style="background:#f8fafc"><th style="padding:8px 12px;text-align:left;color:#64748b;font-size:11px;border-bottom:1px solid #e2e8f0">DOCUMENTO</th>';
  html += '<th style="padding:8px 12px;text-align:center;color:#64748b;font-size:11px;border-bottom:1px solid #e2e8f0">DÍAS VENCIDOS</th>';
  html += '<th style="padding:8px 12px;text-align:right;color:#64748b;font-size:11px;border-bottom:1px solid #e2e8f0">PENDIENTE</th></tr></thead><tbody>';

  for (const d of docs) {
    const diasColor = d.dias > 60 ? "#dc2626" : d.dias > 30 ? "#d97706" : "#334155";
    html += '<tr style="border-bottom:1px solid #f1f5f9">';
    html += `<td style="padding:8px 12px;color:#334155">${d.tipoDoc} N° ${d.numDoc}</td>`;
    html += `<td style="padding:8px 12px;text-align:center;color:${diasColor};font-weight:700">${d.dias}d</td>`;
    html += `<td style="padding:8px 12px;text-align:right;color:#dc2626;font-weight:700">$${formatMontoEmail(d.saldo)}</td>`;
    html += "</tr>";
  }
  html += "</tbody></table>";

  html += '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 20px;margin:16px 0;display:flex;justify-content:space-between;align-items:center">';
  html += '<span style="color:#991b1b;font-weight:600;font-size:14px">TOTAL ADEUDADO</span>';
  html += `<span style="color:#dc2626;font-weight:800;font-size:20px">$${formatMontoEmail(totalDeuda)}</span></div>`;

  if (nivel === "CRITICO") {
    html += '<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:13px;color:#92400e">';
    html += "<strong>CONSECUENCIAS DE NO PAGO:</strong><br>";
    html += "1. Suspensión inmediata del servicio<br>";
    html += "2. Inicio de acciones de cobranza<br>";
    html += "3. Posible informe a registros comerciales</div>";
  }

  html += datosBancarios();

  html += '<p style="color:#475569;font-size:14px;margin:20px 0 0">Si ya realizó el pago, por favor envíenos el comprobante.</p>';
  html += `<p style="color:#334155;font-size:14px;margin:8px 0"><strong>Atentamente,</strong><br><span style="color:#64748b">${nivel === "CRITICO" ? "Departamento de Cobranzas" : "Equipo Notifica Legal"}</span></p>`;
  html += "</div>";

  html += '<div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center">';
  html += '<span style="color:#94a3b8;font-size:12px">tesoreria@notificalegal.cl</span></div></div>';

  return html;
}

export function getAsuntoFactura(facturacionTipo: string, periodo: string): string {
  return facturacionTipo === "Mes Anticipado"
    ? `Factura Suscripción ${periodo} - Notifica Legal`
    : `Factura Servicios ${periodo} - Notifica Legal`;
}

export function getAsuntoCobranza(nivel: string): string {
  if (nivel === "CRITICO") return "AVISO FINAL: Suspensión Inminente - Notifica Legal";
  if (nivel === "URGENTE") return "URGENTE: Deuda Vencida - Notifica Legal";
  return "Recordatorio de Pago - Notifica Legal";
}

export async function enviarEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await resend.emails.send({
      from: CONFIG.from,
      to: params.to,
      cc: CONFIG.cc,
      subject: params.subject,
      html: params.html,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error desconocido" };
  }
}
