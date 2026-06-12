"use client";

import { Moon, Sun } from "lucide-react";
import { usePathname } from "next/navigation";

import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { isDark, setTheme, isMounted } = useTheme();

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border bg-background/92 px-2.5 py-2 text-foreground shadow-sm shadow-slate-950/10 backdrop-blur supports-[backdrop-filter]:bg-background/75 dark:shadow-black/30",
        className
      )}
      aria-label="Selector de tema"
    >
      <Sun
        className={cn(
          "h-4 w-4 transition-colors",
          !isDark ? "text-amber-500" : "text-muted-foreground"
        )}
        aria-hidden="true"
      />
      <Switch
        checked={isMounted ? isDark : false}
        onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
        aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        className="h-6 w-11 data-[state=checked]:bg-slate-700 data-[state=unchecked]:bg-amber-200"
      />
      <Moon
        className={cn(
          "h-4 w-4 transition-colors",
          isDark ? "text-sky-300" : "text-muted-foreground"
        )}
        aria-hidden="true"
      />
    </div>
  );
}

export function FloatingThemeToggle() {
  const pathname = usePathname();
  const isSelfService = pathname === "/self-service";

  return (
    <ThemeToggle
      className={cn(
        "fixed right-3 z-50 sm:right-5",
        isSelfService ? "top-3 sm:top-5" : "bottom-4 sm:bottom-5"
      )}
    />
  );
}
