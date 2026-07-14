import type { ModulePermission, User } from "@/lib/types";

type DashboardRoutePermission = {
  prefix: string;
  permission: ModulePermission;
  alternatePermissions?: ModulePermission[];
};

const dashboardRoutePermissions = [
  { prefix: "/dashboard/self-service-pos", permission: "self-service" },
  { prefix: "/dashboard/self-service", permission: "self-service" },
  { prefix: "/dashboard/products", permission: "products" },
  { prefix: "/dashboard/presale", permission: "presale", alternatePermissions: ["cashbox"] },
  { prefix: "/dashboard/returns", permission: "returns" },
  { prefix: "/dashboard/cashbox", permission: "cashbox" },
  { prefix: "/dashboard/redeem", permission: "redeem" },
  { prefix: "/dashboard/bingo", permission: "users" },
  { prefix: "/dashboard/users", permission: "users" },
  { prefix: "/dashboard/audit", permission: "audit" },
  { prefix: "/dashboard/sales", permission: "sales" },
  { prefix: "/dashboard", permission: "dashboard" },
] satisfies DashboardRoutePermission[];

function matchesDashboardPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function getDashboardRoutePermission(pathname: string) {
  return dashboardRoutePermissions.find((route) =>
    matchesDashboardPrefix(pathname, route.prefix),
  )?.permission;
}

export function canAccessDashboardPath(user: User, pathname: string) {
  const routePermission = getDashboardRoutePermission(pathname);

  if (!routePermission) {
    return false;
  }

  const route = dashboardRoutePermissions.find((route) =>
    matchesDashboardPrefix(pathname, route.prefix),
  );

  if (!route) {
    return false;
  }

  return [route.permission, ...(route.alternatePermissions ?? [])].some((permission) =>
    user.permissions.includes(permission),
  );
}

export function getDefaultDashboardPath(user: User) {
  if (user.permissions.includes("dashboard")) {
    return user.role === "auditor" ? "/dashboard/audit" : "/dashboard";
  }

  if (user.permissions.includes("sales")) {
    return "/dashboard/sales";
  }

  if (user.permissions.includes("redeem")) {
    return "/dashboard/redeem";
  }

  return "/";
}
