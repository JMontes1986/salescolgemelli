
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
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="h-3 w-28 animate-pulse rounded-full bg-primary/20" />
          <div className="mt-4 h-8 w-52 animate-pulse rounded-lg bg-muted" />
          <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
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
