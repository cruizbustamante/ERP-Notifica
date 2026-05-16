import { createClient } from "@/lib/supabase/server";
import BalanceClient from "./BalanceClient";

export default async function BalancePage() {
  const supabase = await createClient();
  const currentYear = new Date().getFullYear();

  const { data: periodos } = await supabase
    .from("periodos")
    .select("anio, estado")
    .order("anio", { ascending: false });

  return (
    <BalanceClient periodos={periodos || []} currentYear={currentYear} />
  );
}
