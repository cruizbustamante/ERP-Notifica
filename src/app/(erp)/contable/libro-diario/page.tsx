import { createClient } from "@/lib/supabase/server";
import LibroDiarioClient from "./LibroDiarioClient";

export default async function LibroDiarioPage() {
  const supabase = await createClient();
  const currentYear = new Date().getFullYear();

  const { data: periodos } = await supabase
    .from("periodos")
    .select("anio, estado")
    .order("anio", { ascending: false });

  return (
    <LibroDiarioClient
      periodos={periodos || []}
      currentYear={currentYear}
    />
  );
}
