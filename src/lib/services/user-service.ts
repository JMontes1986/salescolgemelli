import {
  deleteById,
  insertRow,
  selectRows,
  selectSingle,
  supabaseAuthRequest,
  updateById,
  upsertRow,
} from "@/lib/supabase";
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

function authEmailForUsername(username: string): string {
  const trimmed = username.trim().toLowerCase();
  if (trimmed.includes("@")) {
    return trimmed;
  }

  const localPart = trimmed
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/(^\.|\.$)/g, "");

  if (!localPart) {
    throw new Error(
      "El nombre de usuario no es válido para generar el correo interno. Usa solo letras, números, puntos, guiones o guiones bajos.",
    );
  }

  return `${localPart}@ventas.invalid`;
}

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

const localSessionPrefix = "local:";
const localRefreshTokenPrefix = "local-refresh:";
const localSessionDurationSeconds = 60 * 60 * 8;

type SupabaseAuthResponse = Partial<SupabaseAuthSession> & {
  user: SupabaseAuthUser;
};

type StoredUser = User & {
  password?: string;
  passwordHash?: string;
};

export type UpdateUserInput = {
  name: string;
  role: UserRole;
  permissions: ModulePermission[];
  password?: string;
};

export type AuthenticatedUser = {
  user: User;
  session: SupabaseAuthSession;
  authUser?: SupabaseAuthUser;
};

export type AuthenticationErrorCode =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "local_password_missing"
  | "auth_error";

export class AuthenticationError extends Error {
  code: AuthenticationErrorCode;

  constructor(code: AuthenticationErrorCode, message: string) {
    super(message);
    this.name = "AuthenticationError";
    this.code = code;
  }
}

const userRoles: UserRole[] = ["admin", "cashier", "seller", "auditor"];
const adminEmails = ["sistemas@colgemelli.edu.co"];
const safeUserSelect = "id,name,username,role,permissions,avatarUrl";

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && userRoles.includes(value as UserRole);
}

function getAuthMetadata(authUser: SupabaseAuthUser): AuthUserMetadata {
  return {
    ...authUser.user_metadata,
    ...authUser.app_metadata,
  };
}

function sanitizeUser<T extends User>(user: T): User {
  const { password, passwordHash, ...safeUser } = user as T & {
    passwordHash?: string;
  };
  void password;
  void passwordHash;
  return {
    ...safeUser,
    permissions: safeUser.permissions?.length
      ? safeUser.permissions
      : getPermissionsForRole(safeUser.role),
  };
}

function getLocalSession(userId: string): SupabaseAuthSession {
  const expiresAt = Math.floor(Date.now() / 1000) + localSessionDurationSeconds;
  const payload = JSON.stringify({ userId, expiresAt });
  const encodedPayload = globalThis.btoa(payload);

  return {
    access_token: `${localSessionPrefix}${encodedPayload}`,
    refresh_token: `${localRefreshTokenPrefix}${userId}`,
    expires_at: expiresAt,
    expires_in: localSessionDurationSeconds,
    token_type: "local",
  };
}

function readLocalSession(
  accessToken: string,
): { userId: string; expiresAt: number } | null {
  if (!accessToken.startsWith(localSessionPrefix)) {
    return null;
  }

  try {
    const encodedPayload = accessToken.slice(localSessionPrefix.length);
    const payload = globalThis.atob(encodedPayload);
    const parsed = JSON.parse(payload) as {
      userId?: string;
      expiresAt?: number;
    };

    if (
      !parsed.userId ||
      !parsed.expiresAt ||
      parsed.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return { userId: parsed.userId, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

async function hashPassword(password?: string): Promise<string> {
  if (!password) {
    throw new Error("La contraseña es obligatoria.");
  }

  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getAuthSession(
  response: SupabaseAuthResponse,
): SupabaseAuthSession | null {
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

function buildProfileFromAuthUser(
  authUser: SupabaseAuthUser,
  fallback?: Partial<NewUser>,
): User {
  const metadata = getAuthMetadata(authUser);
  const username =
    fallback?.username ?? metadata.username ?? authUser.email ?? authUser.id;
  const name =
    fallback?.name ?? metadata.name ?? metadata.full_name ?? username;
  const normalizedEmail = authUser.email?.trim().toLowerCase();
  const role = adminEmails.includes(normalizedEmail ?? "")
    ? "admin"
    : isUserRole(fallback?.role)
      ? fallback.role
      : isUserRole(metadata.role)
        ? metadata.role
        : "seller";

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

function applyAuthOverrides(user: User, authUser: SupabaseAuthUser): User {
  const normalizedEmail = authUser.email?.trim().toLowerCase();

  if (!adminEmails.includes(normalizedEmail ?? "")) {
    return user;
  }

  return {
    ...user,
    role: "admin",
    permissions: getPermissionsForRole("admin"),
  };
}

function buildPersistedAuthProfile(
  authUser: SupabaseAuthUser,
  fallback?: Partial<NewUser>,
  existingProfile?: StoredUser | null,
) {
  const generatedProfile = buildProfileFromAuthUser(authUser, fallback);
  const metadata = getAuthMetadata(authUser);
  const normalizedEmail = authUser.email?.trim().toLowerCase();
  const role = adminEmails.includes(normalizedEmail ?? "")
    ? "admin"
    : isUserRole(fallback?.role)
      ? fallback.role
      : isUserRole(metadata.role)
        ? metadata.role
        : existingProfile?.role ?? generatedProfile.role;

  return {
    id: authUser.id,
    name: (existingProfile?.name ?? generatedProfile.name).trim(),
    username: (existingProfile?.username ?? generatedProfile.username).trim(),
    role,
    permissions: existingProfile?.permissions?.length
      ? existingProfile.permissions
      : getPermissionsForRole(role),
    avatarUrl: existingProfile?.avatarUrl || generatedProfile.avatarUrl,
  };
}

async function syncAuthProfile(
  authUser: SupabaseAuthUser,
  fallback?: Partial<NewUser>,
  existingProfile?: StoredUser | null,
  accessToken?: string,
): Promise<User> {
  const persistedProfile = buildPersistedAuthProfile(
    authUser,
    fallback,
    existingProfile,
  );

  if (!accessToken) {
    return applyAuthOverrides(
      sanitizeUser(existingProfile ?? persistedProfile),
      authUser,
    );
  }

  const storedProfile =
    existingProfile && existingProfile.id !== authUser.id
      ? await updateById<StoredUser>(
          "users",
          existingProfile.id,
          persistedProfile,
          accessToken,
        )
      : await upsertRow<StoredUser>(
          "users",
          persistedProfile,
          "id",
          accessToken,
        );

  return applyAuthOverrides(
    sanitizeUser(storedProfile ?? persistedProfile),
    authUser,
  );
}

function getAuthenticationError(error: unknown): AuthenticationError | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const message = error.message.toLowerCase();

  if (
    message.includes("email not confirmed") ||
    message.includes("email_not_confirmed")
  ) {
    return new AuthenticationError(
      "email_not_confirmed",
      "El correo existe en Supabase Authentication, pero todavía no está confirmado.",
    );
  }

  if (
    message.includes("invalid login credentials") ||
    message.includes("invalid_credentials") ||
    message.includes("(400)")
  ) {
    return new AuthenticationError(
      "invalid_credentials",
      "El usuario o la contraseña son incorrectos.",
    );
  }

  if (
    message.includes("supabase auth request failed (5") ||
    message.includes("web server is down") ||
    message.includes("cloudflare")
  ) {
    return new AuthenticationError(
      "auth_error",
      "No se pudo conectar con Supabase Auth. Revisa que NEXT_PUBLIC_SUPABASE_URL apunte al proyecto activo de Supabase y que el proyecto no este pausado.",
    );
  }

  return null;
}

function isUsersRlsError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("row-level security policy") &&
    message.includes("table \"users\"")
  );
}

function isMissingUsersTableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("pgrst205") ||
    message.includes("could not find the table 'public.users'")
  );
}

function isMissingPasswordHashColumnError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("passwordhash") && message.includes("column");
}

function getStoredPasswordHash(storedUser: StoredUser): string | undefined {
  return storedUser.passwordHash ?? storedUser.password;
}

async function getLocalUserForLogin(username: string): Promise<StoredUser | null> {
  const loginIdentifier = username.trim();

  if (!loginIdentifier) {
    return null;
  }

  const exactUsername = await selectSingle<StoredUser>("users", {
    username: `eq.${loginIdentifier}`,
  });

  if (exactUsername) {
    return exactUsername;
  }

  if (loginIdentifier.includes("@")) {
    return null;
  }

  const usernameMatch = await selectSingle<StoredUser>("users", {
    username: `ilike.${loginIdentifier}`,
  });

  if (usernameMatch) {
    return usernameMatch;
  }

  const nameMatch = await selectSingle<StoredUser>("users", {
    name: `ilike.${loginIdentifier}`,
  });

  if (
    nameMatch &&
    (nameMatch.role === "cashier" || nameMatch.role === "seller")
  ) {
    return nameMatch;
  }

  return null;
}

async function insertLocalUser(row: StoredUser): Promise<StoredUser> {
  try {
    return await insertRow<StoredUser>("users", row);
  } catch (error) {
    if (!isMissingPasswordHashColumnError(error)) {
      throw error;
    }

    const { passwordHash, ...legacyRow } = row;
    return insertRow<StoredUser>("users", {
      ...legacyRow,
      password: passwordHash,
    });
  }
}

async function updateUserWithPasswordFallback(
  userId: string,
  patch: Partial<StoredUser>,
): Promise<StoredUser | null> {
  try {
    return await updateById<StoredUser>("users", userId, patch);
  } catch (error) {
    if (!isMissingPasswordHashColumnError(error) || !patch.passwordHash) {
      throw error;
    }

    const { passwordHash, ...legacyPatch } = patch;
    return updateById<StoredUser>("users", userId, {
      ...legacyPatch,
      password: passwordHash,
    });
  }
}

async function getProfileForAuthUser(
  authUser: SupabaseAuthUser,
  fallback?: Partial<NewUser>,
  accessToken?: string,
): Promise<User> {
  try {
    const existingProfile = await selectSingle<StoredUser>(
      "users",
      { select: safeUserSelect, id: `eq.${authUser.id}` },
      accessToken,
    );

    if (existingProfile) {
      return applyAuthOverrides(sanitizeUser(existingProfile), authUser);
    }

    const username =
      fallback?.username ??
      authUser.email ??
      getAuthMetadata(authUser).username;
    const legacyProfile = username
      ? await selectSingle<StoredUser>(
          "users",
          { username: `eq.${username}` },
          accessToken,
        )
      : null;

    if (legacyProfile) {
      return syncAuthProfile(authUser, fallback, legacyProfile, accessToken);
    }

    return syncAuthProfile(authUser, fallback, null, accessToken);
  } catch (error) {
    console.warn(
      "No se pudo sincronizar el perfil público del usuario con Supabase Authentication.",
      error,
    );
  }

  return applyAuthOverrides(
    buildProfileFromAuthUser(authUser, fallback),
    authUser,
  );
}

export async function authenticateUser(
  username: string,
  password_provided: string,
): Promise<AuthenticatedUser | null> {
  const normalizedUsername = username.trim();

  if (!normalizedUsername.includes("@")) {
    const localUser = await authenticateLocalUser(
      normalizedUsername,
      password_provided,
    );

    if (localUser) {
      return localUser;
    }
  }

  let response: SupabaseAuthResponse;

  try {
    response = await supabaseAuthRequest<SupabaseAuthResponse>("token", {
      method: "POST",
      query: { grant_type: "password" },
      body: {
        email: authEmailForUsername(normalizedUsername),
        password: password_provided,
      },
    });
  } catch (error) {
    const authenticationError = getAuthenticationError(error);

    if (authenticationError) {
      if (normalizedUsername.includes("@")) {
        let localUser: AuthenticatedUser | null = null;

        try {
          localUser = await authenticateLocalUser(
            normalizedUsername,
            password_provided,
          );
        } catch (localAuthError) {
          if (!isMissingUsersTableError(localAuthError)) {
            throw localAuthError;
          }

          console.warn(
            "No se pudo intentar autenticacion local porque falta public.users en Supabase.",
            localAuthError,
          );
        }

        if (localUser) {
          return localUser;
        }
      }

      throw authenticationError;
    }

    throw error;
  }

  const session = getAuthSession(response);

  if (!session) {
    return null;
  }

  const authUser = response.user;
  const shouldUseUsername =
    authUser.user_metadata?.role !== "admin" &&
    authUser.user_metadata?.role !== "auditor";
  const fallbackUsername = shouldUseUsername
    ? username.trim()
    : (authUser.email ?? username.trim());

  const user = await getProfileForAuthUser(response.user, {
    username: fallbackUsername,
  }, session.access_token);

  return { user, session, authUser };
}

export async function getAuthenticatedUser(
  accessToken: string,
): Promise<User | null> {
  const localSession = readLocalSession(accessToken);

  if (localSession) {
    return getUserById(localSession.userId);
  }

  const authUser = await supabaseAuthRequest<SupabaseAuthUser>("user", {
    accessToken,
  });
  return getProfileForAuthUser(authUser, undefined, accessToken);
}

export async function refreshAuthenticatedSession(
  refreshToken: string,
): Promise<AuthenticatedUser | null> {
  if (refreshToken.startsWith(localRefreshTokenPrefix)) {
    const userId = refreshToken.slice(localRefreshTokenPrefix.length);
    const user = await getUserById(userId);

    if (!user) {
      return null;
    }

    return { user, session: getLocalSession(user.id) };
  }

  const response = await supabaseAuthRequest<SupabaseAuthResponse>("token", {
    method: "POST",
    query: { grant_type: "refresh_token" },
    body: {
      refresh_token: refreshToken,
    },
  });

  const session = getAuthSession(response);

  if (!session) {
    return null;
  }

  const user = await getProfileForAuthUser(
    response.user,
    undefined,
    session.access_token,
  );
  return { user, session, authUser: response.user };
}

export async function signOutAuthenticatedUser(
  accessToken: string,
): Promise<void> {
  if (accessToken.startsWith(localSessionPrefix)) {
    return;
  }

  await supabaseAuthRequest<void>("logout", {
    method: "POST",
    accessToken,
  });
}

export async function getUsers(): Promise<User[]> {
  const users = await selectRows<StoredUser>("users", {
    select: safeUserSelect,
    order: "name.asc",
  });
  return users.map(sanitizeUser);
}

export async function getUserById(id: string): Promise<User | null> {
  if (!id) return null;
  const user = await selectSingle<StoredUser>("users", {
    select: safeUserSelect,
    id: `eq.${id}`,
  });
  return user ? sanitizeUser(user) : null;
}

async function authenticateLocalUser(
  username: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const storedUser = await getLocalUserForLogin(username);

  if (
    !storedUser ||
    storedUser.role === "admin" ||
    storedUser.role === "auditor"
  ) {
    return null;
  }

  const storedPasswordHash = getStoredPasswordHash(storedUser);

  if (!storedPasswordHash) {
    throw new AuthenticationError(
      "local_password_missing",
      "El usuario existe en Gestion de Usuarios, pero no tiene una contrasena local guardada. Edita el usuario y asigna una contrasena nueva.",
    );
  }

  const providedPasswordHash = await hashPassword(password);

  if (storedPasswordHash !== providedPasswordHash) {
    return null;
  }

  const user = sanitizeUser({
    ...storedUser,
    permissions: storedUser.permissions?.length
      ? storedUser.permissions
      : getPermissionsForRole(storedUser.role),
  });

  return { user, session: getLocalSession(storedUser.id) };
}

export async function addUser(user: NewUser): Promise<User> {
  const username = user.username.trim();

  if (
    (user.role === "admin" || user.role === "auditor") &&
    !username.includes("@")
  ) {
    throw new Error(
      "Para los roles administrador y auditor se requiere un correo electrónico válido.",
    );
  }

  if (user.role === "admin" || user.role === "auditor") {
    const response = await supabaseAuthRequest<SupabaseAuthResponse>("signup", {
      method: "POST",
      body: {
        email: authEmailForUsername(username),
        password: user.password,
        data: {
          name: user.name,
          username,
          role: user.role,
          avatarUrl: user.avatarUrl,
        },
      },
    });

    const profile = buildProfileFromAuthUser(response.user, user);
    const session = getAuthSession(response);
    const persistedProfile = {
      id: profile.id,
      name: profile.name.trim(),
      username,
      role: profile.role,
      permissions: getPermissionsForRole(profile.role),
      avatarUrl: profile.avatarUrl,
    };

    try {
      const existingProfile = await selectSingle<StoredUser>("users", {
        username: `eq.${username}`,
      });

      if (existingProfile) {
        const updatedProfile = await updateById<StoredUser>(
          "users",
          existingProfile.id,
          {
            id: persistedProfile.id,
            name: persistedProfile.name,
            role: persistedProfile.role,
            permissions: user.permissions?.length
              ? user.permissions
              : persistedProfile.permissions,
            avatarUrl: persistedProfile.avatarUrl,
          },
          session?.access_token,
        );

        return sanitizeUser(updatedProfile ?? existingProfile);
      }

      const storedProfile = await upsertRow<StoredUser>(
        "users",
        {
          ...persistedProfile,
          permissions: user.permissions?.length
            ? user.permissions
            : persistedProfile.permissions,
        },
        "id",
        session?.access_token,
      );

      return sanitizeUser(storedProfile);
    } catch (error) {
      if (isUsersRlsError(error)) {
        throw new Error(
          "Supabase esta bloqueando la creacion del usuario por RLS. Aplica nuevamente el SQL de supabase/schema.sql para crear las politicas de public.users.",
        );
      }

      throw error;
    }
  }

  let localUser: StoredUser;

  try {
    localUser = await insertLocalUser({
      id: crypto.randomUUID(),
      name: user.name.trim(),
      username,
      role: user.role,
      permissions: user.permissions?.length
        ? user.permissions
        : getPermissionsForRole(user.role),
      avatarUrl: user.avatarUrl,
      passwordHash: await hashPassword(user.password),
    });
  } catch (error) {
    if (isUsersRlsError(error)) {
      throw new Error(
        "Supabase esta bloqueando la creacion del usuario por RLS. Aplica nuevamente el SQL de supabase/schema.sql para crear las politicas de public.users.",
      );
    }

    throw error;
  }

  return sanitizeUser(localUser);
}

export async function updateUser(
  userId: string,
  updates: UpdateUserInput,
): Promise<User> {
  const existingUser = await selectSingle<StoredUser>("users", {
    id: `eq.${userId}`,
  });

  if (!existingUser) {
    throw new Error("No se encontró el usuario que quieres editar.");
  }

  const name = updates.name.trim();

  if (!name) {
    throw new Error("El nombre del usuario es obligatorio.");
  }

  const patch: Partial<StoredUser> = {
    name,
    role: updates.role,
    permissions: updates.permissions.length
      ? updates.permissions
      : getPermissionsForRole(updates.role),
  };

  const password = updates.password?.trim();

  if (password) {
    if (
      existingUser.role === "admin" ||
      existingUser.role === "auditor" ||
      updates.role === "admin" ||
      updates.role === "auditor"
    ) {
      throw new Error(
        "La contraseña de administradores y auditores se gestiona desde Supabase Authentication.",
      );
    }

    patch.passwordHash = await hashPassword(password);
  }

  let updatedUser: StoredUser | null;

  try {
    updatedUser = await updateUserWithPasswordFallback(userId, patch);
  } catch (error) {
    if (isUsersRlsError(error)) {
      throw new Error(
        "Supabase esta bloqueando la edicion del usuario por RLS. Aplica nuevamente el SQL de supabase/schema.sql para crear las politicas de public.users.",
      );
    }

    throw error;
  }

  if (!updatedUser) {
    throw new Error("No se pudo actualizar el usuario.");
  }

  await addAuditLog({
    userId: "system",
    userName: "Sistema",
    action: "USER_ROLE_CHANGE",
    details: `Usuario ${existingUser.username} actualizado: rol ${existingUser.role} -> ${updates.role}.`,
  });

  return sanitizeUser(updatedUser);
}

export async function deleteUser(userId: string): Promise<User> {
  const existingUser = await selectSingle<StoredUser>("users", {
    id: `eq.${userId}`,
  });

  if (!existingUser) {
    throw new Error("No se encontró el usuario que quieres eliminar.");
  }

  if (existingUser.role !== "cashier" && existingUser.role !== "seller") {
    throw new Error("Solo se pueden eliminar usuarios con rol cajero o vendedor.");
  }

  let deletedUser: StoredUser | null;

  try {
    deletedUser = await deleteById<StoredUser>("users", userId);
  } catch (error) {
    if (isUsersRlsError(error)) {
      throw new Error(
        "Supabase esta bloqueando la eliminacion del usuario por RLS. Aplica nuevamente el SQL de supabase/schema.sql para crear las politicas de public.users.",
      );
    }

    throw error;
  }

  if (!deletedUser) {
    throw new Error("No se pudo eliminar el usuario.");
  }

  await addAuditLog({
    userId: "system",
    userName: "Sistema",
    action: "USER_ROLE_CHANGE",
    details: `Usuario ${existingUser.username} eliminado: rol ${existingUser.role}.`,
  });

  return sanitizeUser(deletedUser);
}

export async function addSeedUsers(): Promise<void> {
  throw new Error(
    "La creación masiva de usuarios de prueba fue deshabilitada. Crea usuarios desde Supabase Authentication.",
  );
}

export async function updateUserPermissions(
  userId: string,
  permissions: ModulePermission[],
): Promise<void> {
  await updateById<User>("users", userId, { permissions });

  await addAuditLog({
    userId: "system",
    userName: "Sistema",
    action: "USER_ROLE_CHANGE",
    details: `Permisos del usuario ${userId} actualizados.`,
  });
}
