import { createClient } from "@/lib/supabase/server";
import ConfigClient from "./ConfigClient";

export default async function ConfiguracionPage() {
  const supabase = await createClient();

  const [
    { data: configRows },
    { data: categorias },
    { data: tiposDoc },
    { data: planes },
    { data: usuarios },
  ] = await Promise.all([
    supabase.from("config").select("clave, valor"),
    supabase.from("categoria_flujo").select("*").order("orden"),
    supabase.from("tipos_documento").select("*").order("codigo"),
    supabase.from("planes").select("*").order("codigo"),
    supabase.from("user_roles").select("*").order("created_at"),
  ]);

  const config: Record<string, string> = {};
  for (const r of configRows || []) config[r.clave] = r.valor;

  return (
    <ConfigClient
      config={config}
      categorias={categorias || []}
      tiposDoc={tiposDoc || []}
      planes={planes || []}
      usuarios={usuarios || []}
    />
  );
}
