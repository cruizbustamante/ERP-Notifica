"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ComprobanteForm, { ComprobanteFormData } from "../ComprobanteForm";
import { crearComprobante } from "../actions";

type Cuenta = { codigo: string; nombre: string; tipo: string; usa_auxiliar: string; usa_documento: string; conciliable: string };
type TipoDoc = { codigo: string; nombre: string; abreviatura: string };
type Auxiliar = { rut: string; razon_social: string };
type CategoriaFlujo = { id: number; codigo: string; nombre: string; tipo: string; flujo: string; orden: number };

type Props = { cuentas: Cuenta[]; tiposDoc: TipoDoc[]; auxiliares: Auxiliar[]; categoriasFlujo: CategoriaFlujo[] };

export default function NuevoComprobanteClient({ cuentas, tiposDoc, auxiliares, categoriasFlujo }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(data: ComprobanteFormData): Promise<{ error: string | null }> {
    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await crearComprobante({
          tipo: data.tipo,
          fecha: data.fecha,
          glosa: data.glosa,
          lineas: data.lineas,
        });
        if (result.error) {
          resolve({ error: result.error });
        } else {
          router.push("/contable/comprobantes");
          resolve({ error: null });
        }
      });
    });
  }

  return (
    <div className="space-y-4 max-w-full overflow-hidden">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/contable/comprobantes" className="text-gray-400 hover:text-gray-600 transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </Link>
            <div>
              <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">Nuevo Comprobante</h1>
              <p className="text-gray-500 text-xs sm:text-sm mt-0.5">Ingreso de comprobante contable manual</p>
            </div>
          </div>
          <Link href="/contable/comprobantes"
            className="text-gray-500 hover:text-gray-700 text-xs sm:text-sm font-medium px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition shrink-0">
            Cancelar
          </Link>
        </div>
      </div>

      <ComprobanteForm
        cuentas={cuentas}
        tiposDoc={tiposDoc}
        auxiliares={auxiliares}
        categoriasFlujo={categoriasFlujo}
        modo="crear"
        onSubmit={handleSubmit}
        submitting={isPending}
      />
    </div>
  );
}
