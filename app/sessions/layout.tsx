import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { AccountHeader } from "@/components/account/AccountHeader";

export const dynamic = "force-dynamic";

export default async function SessionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await auth.getUser();
  if (!user) redirect("/login");
  return (
    <div className="min-h-dvh bg-cream text-charcoal">
      <AccountHeader />
      {children}
    </div>
  );
}
