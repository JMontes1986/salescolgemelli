"use client";

import { useState } from "react";
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
import { KeyRound, LogIn } from "lucide-react";
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
  manualSecret: string;
  qrDataUrl: string;
};

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
  const [isLoading, setIsLoading] = useState(false);
  const [key, setKey] = useState(0); // Key to force re-render if needed

  const resetMfa = () => {
    setMfaRequired(false);
    setMfaSetup(null);
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
        setup?: AdminMfaSetup;
        message?: string;
      };

      if (body.mfaRequired) {
        setMfaRequired(true);
        setMfaSetup(body.setup ?? mfaSetup);
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
                        Escanea este QR en FreeOTP
                      </p>
                      <p className="break-all rounded-md bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
                        {mfaSetup.manualSecret}
                      </p>
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
                    onChange={(e) =>
                      setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
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
        </CardFooter>
      </Card>
    </main>
  );
}
