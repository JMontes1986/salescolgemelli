
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
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";

export function Header({ navItems }: { navItems: NavItem[] }) {
  const { currentUser, isMounted, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  
  if (!isMounted) {
    return (
       <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/90 px-3 backdrop-blur-sm sm:h-16 sm:px-5">
         {/* Skeleton or minimal loader */}
       </header>
    );
  }

  const handleLogout = () => {
    logout();
    router.push('/');
  }

  return (
    <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-3 border-b bg-background/90 px-3 shadow-sm shadow-slate-200/60 backdrop-blur-sm sm:min-h-16 sm:px-5 2xl:px-6">
      <nav className="hidden min-w-0 flex-1 items-center gap-4 text-sm font-medium 2xl:flex">
        <Link
          href="/dashboard"
          className="flex min-w-32 items-center gap-2 text-lg font-semibold md:text-base"
        >
          <Logo className="h-auto w-32" />
          <span className="sr-only">ColGemelli</span>
        </Link>
        <TopNav navItems={navItems} />
      </nav>
      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 2xl:hidden"
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle navigation menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[min(88vw,22rem)] overflow-y-auto p-4 sm:p-6">
          <nav className="grid gap-2 text-base font-medium">
            <Link
              href="/dashboard"
              className="mb-3 flex items-center gap-2 text-lg font-semibold"
            >
              <Logo className="h-auto w-24" />
              <span className="sr-only">ColGemelli</span>
            </Link>
            {navItems.map((item) => (
              <SheetClose asChild key={item.href}>
                <Link
                  href={item.href}
                  target={item.external ? "_blank" : "_self"}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 transition-colors active:scale-[0.98] hover:bg-secondary hover:text-foreground",
                    pathname === item.href ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              </SheetClose>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
      <div className="ml-auto flex items-center gap-2">
        {currentUser && (
            <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                <Avatar className="h-9 w-9">
                    <AvatarImage src={currentUser.avatarUrl} alt={currentUser.name} />
                    <AvatarFallback>{currentUser.name.charAt(0)}</AvatarFallback>
                </Avatar>
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
