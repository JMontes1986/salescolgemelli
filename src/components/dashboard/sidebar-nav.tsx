
"use client";

import {
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/icons";
import {
  LayoutDashboard,
  ShoppingCart,
  QrCode,
  Archive,
  Users,
  ClipboardList,
  LogOut,
  Package,
  UserCog,
  Undo2,
  ClipboardCheck,
  FilePenLine,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import type { ModulePermission } from "@/lib/types";

export type NavItem = {
  href: string;
  icon: React.ElementType;
  label: string;
  permission: ModulePermission;
  alternatePermissions?: ModulePermission[];
  external?: boolean;
}

export const navItems: NavItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Panel", permission: 'dashboard' },
  { href: "/dashboard/sales", icon: ShoppingCart, label: "Ventas", permission: 'sales' },
  { href: "/self-service", icon: UserCog, label: "Autogestión", permission: 'self-service', external: true },
  { href: "/dashboard/products", icon: Package, label: "Productos", permission: 'products' },
  { href: "/dashboard/redeem", icon: QrCode, label: "Gestión entrega", permission: 'redeem' },
  { href: "/dashboard/presale", icon: ClipboardCheck, label: "Preventa", permission: 'presale', alternatePermissions: ['cashbox'] },
  { href: "/dashboard/cashbox", icon: Archive, label: "Caja", permission: 'cashbox' },
  { href: "/dashboard/returns", icon: Undo2, label: "Devoluciones", permission: 'returns' },
];

export const adminNavItems: NavItem[] = [
    { href: "/dashboard/bingo", icon: FilePenLine, label: "Landing Bingo", permission: 'users' },
    { href: "/dashboard/users", icon: Users, label: "Usuarios", permission: 'users' },
    { href: "/dashboard/audit", icon: ClipboardList, label: "Auditoría", permission: 'audit' },
]

export function SidebarNav({ navItems: accessibleNavItems }: { navItems: NavItem[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    router.push('/');
  }

  const regularItems = accessibleNavItems.filter(item => navItems.some(nav => nav.href === item.href));
  const adminItems = accessibleNavItems.filter(item => adminNavItems.some(nav => nav.href === item.href));

  return (
    <>
      <SidebarHeader>
        <div className="flex items-center gap-2">
          <Logo className="size-8 text-sidebar-primary" />
          <span className="text-lg font-semibold text-sidebar-foreground">
            ColGemelli
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {regularItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href}
                  tooltip={item.label}
                >
                  <Link href={item.href} target={item.external ? '_blank' : '_self'}>
                    <item.icon />
                    {item.label}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
          ))}
          {adminItems.length > 0 && <SidebarSeparator />}
          {adminItems.map((item) => (
             <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href}
                  tooltip={item.label}
                >
                  <Link href={item.href}>
                    <item.icon />
                    {item.label}
                  </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
        ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout}>
              <LogOut />
              Cerrar Sesión
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  );
}
