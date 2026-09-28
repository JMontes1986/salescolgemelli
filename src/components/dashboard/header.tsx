
"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import type { NavItem } from "./sidebar-nav";
import Link from "next/link";
import { Logo } from "../icons";
import { useRouter } from "next/navigation";
import { TopNav } from "./top-nav";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ExternalLink, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";

export function Header({ navItems }: { navItems: NavItem[] }) {
  const { currentUser, isMounted, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const currentNavItem = navItems.find((item) => (
    item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href)
  ));
  
  if (!isMounted) {
    return (
       <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-white/90 px-3 backdrop-blur-sm dark:bg-background/90 sm:px-5">
         {/* Skeleton or minimal loader */}
       </header>
    );
  }

  const handleLogout = () => {
    logout();
    router.push('/');
  }

  return (
    <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-3 border-b border-border bg-white/92 px-3 shadow-[0_8px_28px_-24px_rgba(7,59,114,0.38)] backdrop-blur-md dark:bg-background/92 sm:px-5 2xl:px-6">
      <nav className="hidden min-w-0 flex-1 items-center gap-4 text-sm font-medium 2xl:flex">
        <Link
          href="/dashboard"
          className="flex min-w-40 items-center gap-3 border-r border-border pr-5 text-lg font-semibold md:text-base"
        >
          <Logo className="h-auto w-28" />
          <span className="sr-only">ColGemelli</span>
        </Link>
        <TopNav navItems={navItems} />
      </nav>
      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-xl border-border bg-white text-primary hover:bg-accent hover:text-accent-foreground dark:bg-transparent 2xl:hidden"
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Abrir menú de navegación</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[min(88vw,22rem)] overflow-y-auto border-r-border bg-sidebar p-4 sm:p-6">
          <nav className="grid gap-2 text-base font-medium">
            <Link
              href="/dashboard"
              className="mb-5 flex items-center gap-2 border-b border-border pb-5 text-lg font-semibold"
            >
              <Logo className="h-auto w-24" />
              <span className="sr-only">ColGemelli</span>
            </Link>
            <p className="px-3 pb-1 text-xs font-semibold text-muted-foreground">Módulos de gestión</p>
            {navItems.map((item) => (
              <SheetClose asChild key={item.href}>
                <Link
                  href={item.href}
                  target={item.external ? "_blank" : "_self"}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors active:translate-y-px hover:bg-accent hover:text-accent-foreground",
                    pathname === item.href ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground",
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                  {item.external && <ExternalLink className="ml-auto h-4 w-4 opacity-60" />}
                </Link>
              </SheetClose>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
      <div className="min-w-0 2xl:hidden">
        <p className="text-[11px] font-semibold text-primary">Panel de gestión</p>
        <p className="truncate text-sm font-bold text-foreground sm:text-base">{currentNavItem?.label ?? "Ventas ColGemelli"}</p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {currentUser && (
            <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-11 gap-2 rounded-xl px-1.5 hover:bg-accent hover:text-accent-foreground sm:px-2">
                <Avatar className="h-9 w-9 border border-border">
                    <AvatarImage src={currentUser.avatarUrl} alt={currentUser.name} />
                    <AvatarFallback>{currentUser.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <span className="hidden max-w-32 truncate text-sm font-semibold lg:inline">{currentUser.name}</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{currentUser.name}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                    {currentUser.username}
                    </p>
                </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>Cerrar Sesión</DropdownMenuItem>
            </DropdownMenuContent>
            </DropdownMenu>
        )}
      </div>
    </header>
  );
}
