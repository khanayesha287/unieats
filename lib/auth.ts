export type Role = "student" | "canteen_owner" | "driver" | "admin";

export interface StaffProfile {
  id: string;
  email: string;
  name: string;
  role: Role;
  canteen_id?: number | null;
  active: boolean;
}

const ROLE_ROUTE_ACCESS: Record<string, Role[]> = {
  "/admin": ["admin"],
  "/canteen": ["canteen_owner", "admin"],
  "/driver": ["driver", "admin"],
};

export function hasAccessToRoute(role: Role, pathname: string): boolean {
  for (const [route, roles] of Object.entries(ROLE_ROUTE_ACCESS)) {
    if (pathname === route || pathname.startsWith(route + "/")) {
      return roles.includes(role);
    }
  }
  return true;
}

export function getRedirectForRole(role: Role): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "canteen_owner":
      return "/canteen";
    case "driver":
      return "/driver";
    default:
      return "/";
  }
}

export function getRoleBadge(role: Role): string {
  switch (role) {
    case "admin":
      return "Admin";
    case "canteen_owner":
      return "Canteen Owner";
    case "driver":
      return "Driver";
    default:
      return "Student";
  }
}

export function getRoleBadgeColor(role: Role): string {
  switch (role) {
    case "admin":
      return "bg-red-100 text-red-700";
    case "canteen_owner":
      return "bg-violet-100 text-violet-700";
    case "driver":
      return "bg-cyan-100 text-cyan-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}
