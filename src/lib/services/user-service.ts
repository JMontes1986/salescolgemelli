import { insertRow, selectRows, selectSingle, supabaseAuthRequest, updateById } from "@/lib/supabase";
import type { User, NewUser, ModulePermission, UserRole } from "@/lib/types";
import { addAuditLog } from "./audit-service";
import { getPermissionsForRole } from "@/lib/roles";

type AuthUserMetadata = {
  name?: string;
  full_name?: string;
  username?: string;
  role?: string;
  avatarUrl?: string;
  avatar_url?: string;
};

type SupabaseAuthUser = {
  id: string;
  email?: string;
  user_metadata?: AuthUserMetadata;
  app_metadata?: AuthUserMetadata;
};

export type SupabaseAuthSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
};

type SupabaseAuthResponse = Partial<SupabaseAuthSession> & {
  user: SupabaseAuthUser;
};

export type AuthenticatedUser = {
  user: User;
  session: SupabaseAuthSession;
};

const userRoles: UserRole[] = ['admin', 'cashier', 'seller', 'auditor'];

function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && userRoles.includes(value as UserRole);
}

function getAuthMetadata(authUser: SupabaseAuthUser): AuthUserMetadata {
  return {
    ...authUser.user_metadata,
    ...authUser.app_metadata,
  };
}

function getAuthSession(response: SupabaseAuthResponse): SupabaseAuthSession | null {
  if (!response.access_token || !response.refresh_token) {
    return null;
  }

  return {
    access_token: response.access_token,
    refresh_token: response.refresh_token,
    expires_at: response.expires_at,
    expires_in: response.expires_in,
    token_type: response.token_type,
  };
}

function buildProfileFromAuthUser(authUser: SupabaseAuthUser, fallback?: Partial<NewUser>): User {
  const metadata = getAuthMetadata(authUser);
  const username = fallback?.username ?? metadata.username ?? authUser.email ?? authUser.id;
  const name = fallback?.name ?? metadata.name ?? metadata.full_name ?? username;
  const role = isUserRole(fallback?.role) ? fallback.role : isUserRole(metadata.role) ? metadata.role : 'seller';

  return {
    id: authUser.id,
    name,
    username,
    role,
    permissions: getPermissionsForRole(role),
    avatarUrl:
      fallback?.avatarUrl ??
      metadata.avatarUrl ??
      metadata.avatar_url ??
      `https://picsum.photos/seed/${encodeURIComponent(username)}/100/100`,
  };
}

async function getOrCreateProfileForAuthUser(authUser: SupabaseAuthUser, fallback?: Partial<NewUser>): Promise<User> {
  const existingProfile = await getUserById(authUser.id);

  if (existingProfile) {
    return existingProfile;
  }

  const username = fallback?.username ?? authUser.email ?? getAuthMetadata(authUser).username;
  const legacyProfile = username ? await selectSingle<User>('users', { username: `eq.${username}` }) : null;

  if (legacyProfile) {
    const migratedProfile = await updateById<User>('users', legacyProfile.id, {
      id: authUser.id,
    });

    if (migratedProfile) {
      return migratedProfile;
    }
  }

  return insertRow<User>('users', buildProfileFromAuthUser(authUser, fallback));
}

export async function authenticateUser(username: string, password_provided: string): Promise<AuthenticatedUser | null> {
  let response: SupabaseAuthResponse;

  try {
    response = await supabaseAuthRequest<SupabaseAuthResponse>('token', {
      method: 'POST',
      query: { grant_type: 'password' },
      body: {
        email: username.trim(),
        password: password_provided,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('(400)')) {
      return null;
    }

    throw error;
  }

  const session = getAuthSession(response);

  if (!session) {
    return null;
  }

  const user = await getOrCreateProfileForAuthUser(response.user, { username: response.user.email ?? username.trim() });

  return { user, session };
}

export async function getAuthenticatedUser(accessToken: string): Promise<User | null> {
  const authUser = await supabaseAuthRequest<SupabaseAuthUser>('user', { accessToken });
  return getOrCreateProfileForAuthUser(authUser);
}

export async function refreshAuthenticatedSession(refreshToken: string): Promise<AuthenticatedUser | null> {
  const response = await supabaseAuthRequest<SupabaseAuthResponse>('token', {
    method: 'POST',
    query: { grant_type: 'refresh_token' },
    body: {
      refresh_token: refreshToken,
    },
  });

  const session = getAuthSession(response);

  if (!session) {
    return null;
  }

  const user = await getOrCreateProfileForAuthUser(response.user);
  return { user, session };
}

export async function signOutAuthenticatedUser(accessToken: string): Promise<void> {
  await supabaseAuthRequest<void>('logout', {
    method: 'POST',
    accessToken,
  });
}

export async function getUsers(): Promise<User[]> {
  return selectRows<User>('users', { order: 'name.asc' });
}

export async function getUserById(id: string): Promise<User | null> {
  if (!id) return null;
  return selectSingle<User>('users', { id: `eq.${id}` });
}

export async function addUser(user: NewUser): Promise<User> {
  const response = await supabaseAuthRequest<SupabaseAuthResponse>('signup', {
    method: 'POST',
    body: {
      email: user.username.trim(),
      password: user.password,
      data: {
        name: user.name,
        username: user.username.trim(),
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    },
  });

  const permissions = getPermissionsForRole(user.role);
  const session = getAuthSession(response);
  const created = await insertRow<User>('users', {
    id: response.user.id,
    name: user.name,
    username: response.user.email ?? user.username.trim(),
    role: user.role,
    permissions,
    avatarUrl: user.avatarUrl,
  }, session?.access_token);

  return created;
}

export async function addSeedUsers(): Promise<void> {
  throw new Error("La creación masiva de usuarios de prueba fue deshabilitada. Crea usuarios desde Supabase Authentication.");
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
