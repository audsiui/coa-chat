import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AuthForm } from "./auth-form";

export const metadata = { title: "登录 — CoaChat" };

export default async function LoginPage() {
  const user = await getSessionUser().catch(() => null);
  if (user) redirect("/chat");
  return <AuthForm />;
}
