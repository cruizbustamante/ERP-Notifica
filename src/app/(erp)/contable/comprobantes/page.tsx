import { createClient } from "@/lib/supabase/server";
import ComprobantesClient from "./ComprobantesClient";

export default async function ComprobantesPage() {
  const supabase = await createClient();

  const currentYear = new Date().getFullYear();

  const [{ data: comprobantes }, { data: periodos }] = await Promise.all([
    supabase
      .from("comprobantes")
      .select("*, mov_contables(debe, haber)")
      .eq("anio", currentYear)
      .order("fecha", { ascending: false })
      .order("numero", { ascending: false }),
    supabase.from("periodos").select("anio, estado").order("anio", { ascending: false }),
  ]);

  return (
    <ComprobantesClient
      initialData={comprobantes || []}
      periodos={periodos || []}
      currentYear={currentYear}
    />
  );
}
