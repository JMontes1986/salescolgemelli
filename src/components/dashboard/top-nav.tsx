
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavItem } from "./sidebar-nav";

interface TopNavProps extends React.HTMLAttributes<HTMLElement> {
    navItems: NavItem[];
}

export function TopNav({
  className,
  navItems: accessibleNavItems,
  ...props
}: TopNavProps) {
  const pathname = usePathname();

  return (
    <nav
      className={cn("flex min-w-0 items-center gap-1", className)}
      {...props}
    >
      {accessibleNavItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          target={item.external ? '_blank' : '_self'}
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors hover:bg-[#eef0ec] hover:text-[#174f43] dark:hover:bg-white/10 dark:hover:text-white",
            pathname === item.href ? "bg-[#e5f0eb] text-[#174f43] shadow-sm hover:bg-[#e5f0eb] hover:text-[#174f43] dark:bg-[#203c33] dark:text-[#d5ebe3]" : "text-muted-foreground"
          )}
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
