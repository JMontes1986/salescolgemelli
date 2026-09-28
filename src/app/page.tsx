"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowRight,
  BookOpenCheck,
  KeyRound,
  LayoutDashboard,
  LogIn,
  ShieldCheck,
  ShoppingBasket,
  Ticket,
  UserCog,
} from "lucide-react";
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

const FREEOTP_ANDROID_URL =
  "https://play.google.com/store/apps/details?id=org.fedorahosted.freeotp";
const FREEOTP_IOS_URL =
  "https://apps.apple.com/us/app/freeotp-authenticator/id872559395";

const FREEOTP_DOWNLOAD_OPTIONS = [
  {
    platform: "Android",
    href: FREEOTP_ANDROID_URL,
  },
  {
    platform: "iOS",
    href: FREEOTP_IOS_URL,
  },
];

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
        setMfaRequired(true);
        setMfaSetupEnabled(Boolean(body.setupEnabled));
        setMfaSetup(body.setup ?? null);
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
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#f5f4ef] px-4 py-8 text-[#202522] dark:bg-[#121815] dark:text-[#f4f6f3] sm:px-6 lg:px-8" key={key}>
      <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(23,107,87,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(23,107,87,0.055)_1px,transparent_1px)] [background-size:48px_48px] dark:opacity-20" />
      <div className="relative mx-auto grid min-h-[calc(100dvh-4rem)] w-full max-w-6xl overflow-hidden rounded-[1.75rem] border border-[#d8ddd7] bg-white shadow-[0_32px_80px_-48px_rgba(32,37,34,0.42)] dark:border-white/10 dark:bg-[#1b221e] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative flex flex-col justify-between overflow-hidden bg-[#174f43] p-6 text-white sm:p-10 lg:p-12">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full border border-white/10" />

          <div className="relative">
            <div className="inline-flex rounded-2xl bg-white px-4 py-2 shadow-sm">
              <Logo className="h-14 w-auto object-contain" />
            </div>
            <p className="mt-10 text-sm font-semibold tracking-wide text-white/[0.72]">Colegio Franciscano Agustín Gemelli</p>
            <h1 className="mt-3 max-w-xl text-[clamp(2.25rem,5vw,4.25rem)] font-bold leading-[0.98] tracking-[-0.045em]">
              Ventas escolares, claras de principio a fin.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-white/[0.78] sm:text-lg">
              Un solo lugar para comprar, registrar ventas y consultar pedidos sin perderse entre procesos.
            </p>

            <div className="mt-8 space-y-3 border-t border-white/[0.16] pt-6">
              <div className="flex items-start gap-3">
                <ShoppingBasket className="mt-0.5 h-5 w-5 shrink-0 text-[#b8d7cc]" />
                <div>
                  <p className="font-semibold">Autogestión para familias</p>
                  <p className="mt-0.5 text-sm leading-6 text-white/[0.66]">Elija productos, confirme el celular y reciba su código de pago.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <LayoutDashboard className="mt-0.5 h-5 w-5 shrink-0 text-[#b8d7cc]" />
                <div>
                  <p className="font-semibold">Operación para el equipo</p>
                  <p className="mt-0.5 text-sm leading-6 text-white/[0.66]">Ventas, inventario, caja y entregas con información centralizada.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="relative mt-10 flex flex-col gap-3 sm:flex-row">
            <Button asChild className="h-12 justify-between rounded-xl bg-white px-5 font-semibold text-[#174f43] hover:bg-[#edf4f1] active:translate-y-px">
              <Link href="/self-service">
                Ir a Autogestión
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="ghost" className="h-12 rounded-xl border border-white/20 px-5 font-semibold text-white hover:bg-white/10 hover:text-white">
              <Link href="/self-service/tutorial">Ver cómo comprar</Link>
            </Button>
          </div>
        </section>

        <section className="flex items-center p-5 sm:p-10 lg:p-12">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e5f0eb] text-[#176b57] dark:bg-[#176b57]/25 dark:text-[#9ed0bf]">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-[#176b57] dark:text-[#9ed0bf]">Acceso del equipo</p>
              <h2 className="mt-1 text-3xl font-bold tracking-[-0.035em]">Iniciar sesión</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Ingrese sus credenciales para administrar ventas, productos y entregas.</p>
            </div>

          <form id="login-form" onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-semibold">Usuario o correo electrónico</Label>
              <Input
                id="username"
                name="username"
                type="text"
                placeholder="Escriba su usuario"
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
              <Label htmlFor="password" className="text-sm font-semibold">Contraseña</Label>
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
              <div className="space-y-4 rounded-2xl border border-[#d8ddd7] bg-[#f7f8f5] p-4 dark:border-white/10 dark:bg-white/5">
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
                  <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-amber-950">
                    <p className="text-sm font-medium">
                      El QR para vincular una cuenta nueva no está habilitado.
                    </p>
                    <p className="text-xs">
                      Los siguientes enlaces solo instalan FreeOTP; no generan
                      un código nuevo para este administrador.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {FREEOTP_DOWNLOAD_OPTIONS.map((option) => (
                        <a
                          key={option.platform}
                          href={option.href}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border border-amber-300 bg-white px-3 py-2 text-center text-sm font-semibold text-foreground transition hover:border-primary/60 hover:shadow-sm"
                          aria-label={`Descargar FreeOTP para ${option.platform}`}
                        >
                          Descargar para {option.platform}
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

          <div className="mt-6">
          <Button
            className="h-12 w-full rounded-xl bg-[#176b57] font-semibold text-white hover:bg-[#125746] active:translate-y-px"
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
          <div className="mt-6 w-full border-t border-[#dde1db] pt-5 dark:border-white/10">
            <p className="mb-3 text-xs font-semibold text-muted-foreground">
              Accesos de consulta
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild variant="outline" className="h-11 justify-start rounded-xl sm:col-span-2">
                <Link href="/bingo">
                  <Ticket className="mr-2 h-4 w-4" />
                  Bingo Gemellista
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-11 justify-start rounded-xl">
                <Link href="/tutorial-cajas">
                  <BookOpenCheck className="mr-2 h-4 w-4" />
                  Tutorial cajas
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-11 justify-start rounded-xl">
                <Link href="/self-service/tutorial">
                  <UserCog className="mr-2 h-4 w-4" />
                  Tutorial padres
                </Link>
              </Button>
            </div>
          </div>
          </div>
          </div>
        </section>
      </div>
    </main>
  );
}
