import { createClient } from "@/lib/supabase/server";
import LibrosTributariosClient from "./LibrosTributariosClient";

export default async function LibrosTributariosPage() {
  const supabase = await createClient();
  const currentYear = new Date().getFullYear();

  const { data: periodos } = await supabase
    .from("periodos")
    .select("anio, estado")
    .order("anio", { ascending: false });

  return (
    <LibrosTributariosClient periodos={periodos || []} currentYear={currentYear} />
  );
}
