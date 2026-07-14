"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookOpenCheck, KeyRound, LogIn, Ticket, UserCog } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { addUser } from "@/lib/services/user-service";
import { useAuth } from "@/hooks/use-auth";
import type { NewUser, User } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Logo } from "@/components/icons";

type AdminMfaSetup = {
  accountName?: string;
  manualSecret: string;
  qrDataUrl: string;
};

const MFA_SETUP_ACK_PREFIX = "salescolgemelli:mfa-setup-ack:";
const FREEOTP_ANDROID_URL =
  "https://play.google.com/store/apps/details?id=org.fedorahosted.freeotp";
const FREEOTP_IOS_URL =
  "https://apps.apple.com/us/app/freeotp-authenticator/id872559395";
const FREEOTP_QR_SIZE = 180;

function getQrCodeUrl(value: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${FREEOTP_QR_SIZE}x${FREEOTP_QR_SIZE}&data=${encodeURIComponent(
    value,
  )}`;
}

const FREEOTP_DOWNLOAD_OPTIONS = [
  {
    platform: "Android",
    href: FREEOTP_ANDROID_URL,
    qrUrl: getQrCodeUrl(FREEOTP_ANDROID_URL),
  },
  {
    platform: "iOS",
    href: FREEOTP_IOS_URL,
    qrUrl: getQrCodeUrl(FREEOTP_IOS_URL),
  },
];

function getMfaSetupAckKey(username: string) {
  return `${MFA_SETUP_ACK_PREFIX}${username.trim().toLowerCase()}`;
}

function hasAcknowledgedMfaSetup(username: string) {
  if (typeof window === "undefined" || !username.trim()) {
    return false;
  }

  try {
    return window.localStorage.getItem(getMfaSetupAckKey(username)) === "true";
  } catch {
    return false;
  }
}

function acknowledgeMfaSetup(username: string) {
  if (typeof window === "undefined" || !username.trim()) {
    return;
  }

  try {
    window.localStorage.setItem(getMfaSetupAckKey(username), "true");
  } catch {
    // If storage is blocked, the current login attempt can still continue.
  }
}

function CreateUserForm({ onUserCreated }: { onUserCreated: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const newUser: NewUser = {
        name,
        username,
        password,
        role: "seller",
        avatarUrl: `https://picsum.photos/seed/${encodeURIComponent(username)}/100/100`,
      };
      await addUser(newUser);
      toast({
        title: "Usuario creado",
        description: "Tu cuenta ha sido creada con el rol de Vendedor.",
      });
      onUserCreated();
      setIsOpen(false); // Close the dialog on success
    } catch (error) {
      console.error("Error creating user:", error);
      toast({
        variant: "destructive",
        title: "Error al crear usuario",
        description:
          error instanceof Error
            ? error.message
            : "No se pudo crear la cuenta. Inténtalo de nuevo.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="link" className="mt-4">
          Crear una cuenta
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Crear Nueva Cuenta</DialogTitle>
          <DialogDescription>
            Completa el formulario para registrarte. Las nuevas cuentas tendrán
            el rol de Vendedor.
          </DialogDescription>
        </DialogHeader>
        <form id="create-user-form" onSubmit={handleCreateUser}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-name">Nombre Completo</Label>
              <Input
                id="new-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-username">Usuario</Label>
              <Input
                id="new-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">Contraseña</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
          </div>
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary" disabled={isLoading}>
              Cancelar
            </Button>
          </DialogClose>
          <Button type="submit" form="create-user-form" disabled={isLoading}>
            {isLoading ? "Creando..." : "Crear Cuenta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<AdminMfaSetup | null>(null);
  const [mfaSetupEnabled, setMfaSetupEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [key, setKey] = useState(0); // Key to force re-render if needed

  const resetMfa = () => {
    setMfaRequired(false);
    setMfaSetup(null);
    setMfaSetupEnabled(false);
    setTotpCode("");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password, totpCode }),
        cache: "no-store",
      });
      const body = (await response.json()) as {
        user?: User;
        redirectTo?: string;
        mfaRequired?: boolean;
        setupEnabled?: boolean;
        setup?: AdminMfaSetup;
        message?: string;
      };

      if (body.mfaRequired) {
        const setupAcknowledged = hasAcknowledgedMfaSetup(username);

        setMfaRequired(true);
        setMfaSetupEnabled(Boolean(body.setupEnabled));
        setMfaSetup(body.setup && !setupAcknowledged ? body.setup : null);
        setTotpCode("");

        if (!response.ok) {
          toast({
            variant: "destructive",
            title: "Código FreeOTP requerido",
            description:
              body.message ??
              "Ingresa el código de 6 dígitos generado en FreeOTP.",
          });
        }

        return;
      }

      if (!response.ok || !body.user) {
        toast({
          variant: "destructive",
          title: "Error de autenticación",
          description:
            body.message ?? "El usuario o la contraseña son incorrectos.",
        });
        return;
      }

      login(body.user);
      acknowledgeMfaSetup(username);
      resetMfa();
      toast({
        title: "Inicio de sesión exitoso",
        description: `¡Bienvenido de nuevo, ${body.user.name}!`,
      });
      router.push(body.redirectTo ?? "/dashboard");
    } catch {
      toast({
        variant: "destructive",
        title: "Error del sistema",
        description: "No se pudo conectar con el servicio de autenticación.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUserCreation = () => {
    // This function can be used to trigger a re-render or state update if necessary,
    // but with caching removed, it's less critical.
    setKey((prev) => prev + 1);
  };

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-background p-4"
      key={key}
    >
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mb-4 flex items-center justify-center">
            <Logo />
          </div>
          <CardTitle className="text-2xl">Iniciar Sesión</CardTitle>
          <CardDescription>
            Ingrese a su cuenta para acceder al panel de ventas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form id="login-form" onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Usuario o correo electrónico</Label>
              <Input
                id="username"
                name="username"
                type="text"
                placeholder="usuario123 o admin@colegio.edu"
                required
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  resetMfa();
                }}
                disabled={isLoading}
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  resetMfa();
                }}
                disabled={isLoading}
                autoComplete="current-password"
              />
            </div>
            {mfaRequired && (
              <div className="space-y-4 rounded-md border border-border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">
                  Abre FreeOTP e ingresa el código de 6 dígitos del
                  administrador.
                </p>
                {mfaSetup && (
                  <div className="grid gap-3">
                    <div className="flex justify-center">
                      <img
                        src={mfaSetup.qrDataUrl}
                        alt="QR para configurar FreeOTP"
                        className="h-40 w-40 rounded-md border border-border bg-white p-2"
                      />
                    </div>
                    <div className="space-y-1 text-center">
                      <p className="text-sm font-medium">
                        Escanea este QR en FreeOTP como{" "}
                        {mfaSetup.accountName ?? "Molly Ventas Admin"}
                      </p>
                      <p className="break-all rounded-md bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
                        {mfaSetup.manualSecret}
                      </p>
                    </div>
                  </div>
                )}
                {!mfaSetup && !mfaSetupEnabled && (
                  <div className="space-y-3 rounded-md border border-border bg-background px-3 py-3">
                    <p className="text-sm font-medium text-foreground">
                      Descarga FreeOTP escaneando el QR de tu dispositivo:
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {FREEOTP_DOWNLOAD_OPTIONS.map((option) => (
                        <a
                          key={option.platform}
                          href={option.href}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border border-border bg-white p-3 text-center transition hover:border-primary/60 hover:shadow-sm"
                          aria-label={`Descargar FreeOTP para ${option.platform}`}
                        >
                          <img
                            src={option.qrUrl}
                            alt={`QR para descargar FreeOTP en ${option.platform}`}
                            className="mx-auto h-28 w-28"
                          />
                          <span className="mt-2 block text-sm font-semibold text-foreground">
                            {option.platform}
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="totp-code">Código FreeOTP</Label>
                  <Input
                    id="totp-code"
                    name="totpCode"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    required={mfaRequired}
                    value={totpCode}
                    onChange={(e) => {
                      const nextCode = e.target.value
                        .replace(/\D/g, "")
                        .slice(0, 6);

                      setTotpCode(nextCode);
                    }}
                    disabled={isLoading}
                    autoComplete="one-time-code"
                  />
                </div>
              </div>
            )}
          </form>
        </CardContent>
        <CardFooter className="flex flex-col">
          <Button
            className="w-full"
            type="submit"
            form="login-form"
            disabled={isLoading}
          >
            {mfaRequired ? (
              <KeyRound className="mr-2 h-4 w-4" />
            ) : (
              <LogIn className="mr-2 h-4 w-4" />
            )}
            {isLoading
              ? "Validando..."
              : mfaRequired
                ? "Verificar FreeOTP"
                : "Ingresar"}
          </Button>
          <CreateUserForm onUserCreated={handleUserCreation} />
          <div className="mt-4 w-full border-t pt-4">
            <p className="mb-3 text-center text-xs font-medium text-muted-foreground">
              Tutoriales antes de ingresar
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild variant="outline" className="justify-start sm:col-span-2">
                <Link href="/bingo">
                  <Ticket className="mr-2 h-4 w-4" />
                  Bingo Gemellista
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-start">
                <Link href="/tutorial-cajas">
                  <BookOpenCheck className="mr-2 h-4 w-4" />
                  Tutorial cajas
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-start">
                <Link href="/self-service/tutorial">
                  <UserCog className="mr-2 h-4 w-4" />
                  Tutorial padres
                </Link>
              </Button>
            </div>
          </div>
        </CardFooter>
      </Card>
    </main>
  );
}
