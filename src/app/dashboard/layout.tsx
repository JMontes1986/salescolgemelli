
"use client";

import { Header } from "@/components/dashboard/header";
import { useAuth } from "@/hooks/use-auth";
import { navItems, adminNavItems } from "@/components/dashboard/sidebar-nav";
import { useEffect, useState, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  canAccessDashboardPath,
  getDefaultDashboardPath,
} from "@/lib/auth/route-access";
import { SecurityAiAssistant } from "@/components/security-ai-assistant";

const allNavItems = [...navItems, ...adminNavItems];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { currentUser, isMounted } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (isMounted) {
      if (!currentUser) {
        router.push("/");
      } else {
        const canAccessRoute = canAccessDashboardPath(currentUser, pathname);

        if (!canAccessRoute) {
          router.replace(getDefaultDashboardPath(currentUser));
          setAuthorized(false);
          return;
        }

        setAuthorized(true);
      }
    }
  }, [isMounted, currentUser, pathname, router]);

  const accessibleNavItems = useMemo(() => {
    if (!currentUser?.permissions) {
      return [];
    }
    return allNavItems.filter(item =>
      [item.permission, ...(item.alternatePermissions ?? [])].some(permission =>
        currentUser.permissions.includes(permission)
      )
    );
  }, [currentUser]);

  if (!authorized || !currentUser) {
    // Puedes mostrar un skeleton/loader aquí
    return <div>Cargando...</div>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header navItems={accessibleNavItems} />
      <main className="mx-auto flex w-full min-w-0 max-w-[1500px] flex-1 px-3 py-4 sm:px-5 sm:py-6 lg:px-8 lg:py-8 [&>*]:min-w-0 [&>*]:w-full">{children}</main>
      <SecurityAiAssistant />
    </div>
  );
}
