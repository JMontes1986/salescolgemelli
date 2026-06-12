
"use client";

import { Header } from "@/components/dashboard/header";
import { useAuth } from "@/hooks/use-auth";
import { navItems, adminNavItems } from "@/components/dashboard/sidebar-nav";
import { useEffect, useState, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";

const allNavItems = [...navItems, ...adminNavItems];
const dashboardRoutePermissions = [
  { href: "/dashboard/self-service-pos", permission: "self-service" },
  { href: "/dashboard/self-service", permission: "self-service" },
  ...allNavItems
    .filter(item => item.href.startsWith("/dashboard"))
    .sort((a, b) => b.href.length - a.href.length),
] as const;

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
        const routePermission = dashboardRoutePermissions.find(item =>
          pathname === item.href || pathname.startsWith(`${item.href}/`)
        )?.permission;
        const canAccessRoute = routePermission
          ? currentUser.permissions.includes(routePermission)
          : false;

        if (!canAccessRoute) {
          const fallbackRoute =
            allNavItems.find(item =>
              item.href.startsWith("/dashboard") &&
              currentUser.permissions.includes(item.permission)
            )?.href ?? "/";
          router.replace(fallbackRoute);
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
      currentUser.permissions.includes(item.permission)
    );
  }, [currentUser]);

  if (!authorized || !currentUser) {
    // Puedes mostrar un skeleton/loader aquí
    return <div>Cargando...</div>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header navItems={accessibleNavItems} />
      <main className="mx-auto flex w-full max-w-[1500px] flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
