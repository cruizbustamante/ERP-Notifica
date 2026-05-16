import { createClient } from "@/lib/supabase/server";
import PlanCuentasClient from "./PlanCuentasClient";

export default async function PlanCuentasPage() {
  const supabase = await createClient();
  const { data: cuentas } = await supabase
    .from("plan_cuentas")
    .select("*")
    .order("codigo");

  return <PlanCuentasClient cuentas={cuentas || []} />;
}
