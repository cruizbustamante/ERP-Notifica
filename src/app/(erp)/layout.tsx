import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";

export default async function ErpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: userRole } = await supabase
    .from("user_roles")
    .select("rol, nombre, email")
    .eq("user_id", user.id)
    .single();

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={userRole || { email: user.email || "", rol: "consulta", nombre: "" }} />
      <main className="p-6">{children}</main>
    </div>
  );
}
