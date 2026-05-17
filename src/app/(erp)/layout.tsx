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

  const { data: userRole, error: roleError } = await supabase
    .from("user_roles")
    .select("rol, nombre, email")
    .eq("user_id", user.id)
    .single();

  if (roleError) {
    console.error("Error fetching user role:", roleError.message, "user_id:", user.id);
  }

  const userData = userRole || {
    email: user.email || "",
    rol: "admin",
    nombre: user.email?.split("@")[0] || "",
  };

  return <LayoutShell user={userData}>{children}</LayoutShell>;
}
