import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
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

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: userRole } = await admin
    .from("user_roles")
    .select("rol, nombre, email")
    .eq("user_id", user.id)
    .single();

  const userData = userRole || {
    email: user.email || "",
    rol: "admin",
    nombre: user.email?.split("@")[0] || "",
  };

  return <LayoutShell user={userData}>{children}</LayoutShell>;
}
