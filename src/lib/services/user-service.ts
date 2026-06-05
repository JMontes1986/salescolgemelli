import { insertRow, selectRows, selectSingle, updateById, upsertRow } from "@/lib/supabase";
import type { User, NewUser, ModulePermission } from "@/lib/types";
import { mockUsers } from "@/lib/placeholder-data";
import { addAuditLog } from "./audit-service";
import { getPermissionsForRole } from "@/lib/roles";

export async function authenticateUser(username: string, password_provided: string): Promise<User | null> {
  const user = await selectSingle<User>('users', { username: `eq.${username}` });

  if (!user) {
    console.log("No user found with username:", username);
    return null;
  }

  if (user.password === password_provided) {
    return user;
  }

  console.log("Password mismatch for user:", username);
  return null;
}

export async function getUsers(): Promise<User[]> {
  return selectRows<User>('users', { order: 'name.asc' });
}

export async function getUserById(id: string): Promise<User | null> {
  if (!id) return null;
  return selectSingle<User>('users', { id: `eq.${id}` });
}

export async function addUser(user: NewUser): Promise<Omit<User, 'permissions'>> {
  const permissions = getPermissionsForRole(user.role);
  const created = await insertRow<User>('users', { ...user, permissions });
  return created;
}

export async function addSeedUsers(): Promise<void> {
  console.log("Seeding users...");
  await Promise.all(mockUsers.map(user => {
    const permissions = getPermissionsForRole(user.role);
    return upsertRow<User>('users', { ...user, id: user.username, permissions, password: 'password123' });
  }));
}

export async function updateUserPermissions(userId: string, permissions: ModulePermission[]): Promise<void> {
  await updateById<User>('users', userId, { permissions });

  await addAuditLog({
    userId: 'system',
    userName: 'Sistema',
    action: 'USER_ROLE_CHANGE',
    details: `Permisos del usuario ${userId} actualizados.`,
  });
}
