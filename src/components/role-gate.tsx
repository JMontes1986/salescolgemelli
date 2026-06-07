
"use client";

import type { ModulePermission } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";

interface PermissionGateProps {
  requiredPermission: ModulePermission;
  children: React.ReactNode;
}

export function PermissionGate({ requiredPermission, children }: PermissionGateProps) {
  const { hasPermission, isMounted } = useAuth();

  if (!isMounted) {
    return null; // or a loading skeleton
  }

  if (!hasPermission(requiredPermission)) {
    return null;
  }

  return <>{children}</>;
}
