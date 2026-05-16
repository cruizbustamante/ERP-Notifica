import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LayoutShell from "@/components/LayoutShell";

export default async function ErpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: userRole } = await supabase
    .from("user_roles")
    .select("rol, nombre, email")
    .eq("user_id", user.id)
    .single();

  const userData = userRole || {
    email: user.email || "",
    rol: "consulta",
    nombre: "",
  };

  return <LayoutShell user={userData}>{children}</LayoutShell>;
}
