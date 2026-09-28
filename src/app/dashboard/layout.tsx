
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
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f5f4ef] px-4 dark:bg-[#121815]">
        <div className="w-full max-w-sm rounded-2xl border border-[#dde1db] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#1b221e]">
          <div className="h-3 w-28 animate-pulse rounded-full bg-[#d7e5df] dark:bg-white/10" />
          <div className="mt-4 h-8 w-52 animate-pulse rounded-lg bg-[#e8ece7] dark:bg-white/10" />
          <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-[#eef0ec] dark:bg-white/10">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-[#176b57]" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Preparando su panel de gestión…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <Header navItems={accessibleNavItems} />
      <main className="mx-auto flex w-full min-w-0 max-w-[1500px] flex-1 px-3 py-4 sm:px-5 sm:py-6 lg:px-8 lg:py-8 [&>*]:min-w-0 [&>*]:w-full">{children}</main>
      <SecurityAiAssistant />
    </div>
  );
}
