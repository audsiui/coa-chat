import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export default async function RootPage() {
  const user = await getSessionUser().catch(() => null);
  redirect(user ? "/chat" : "/login");
}
