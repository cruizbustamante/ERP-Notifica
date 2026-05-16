import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

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

  const userData = userRole || { email: user.email || "", rol: "consulta", nombre: "" };

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar user={userData} />
      <div className="ml-64 transition-all duration-300">
        <Topbar user={userData} />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
