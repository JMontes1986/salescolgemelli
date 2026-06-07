
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
import { LogIn } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AuthenticationError, authenticateUser, addUser } from "@/lib/services/user-service";
import { useAuth } from "@/hooks/use-auth";
import type { NewUser } from "@/lib/types";
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
import { addAuditLog } from "@/lib/services/audit-service";

function CreateUserForm({ onUserCreated }: { onUserCreated: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const newUser: NewUser = {
        name,
        username: email,
        password,
        role: 'seller', // Public registrations are sellers by default
        avatarUrl: `https://picsum.photos/seed/${encodeURIComponent(email)}/100/100`,
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
        description: "No se pudo crear la cuenta. Inténtalo de nuevo.",
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
            Completa el formulario para registrarte. Las nuevas cuentas tendrán el rol de Vendedor.
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
              <Label htmlFor="new-email">Correo Electrónico</Label>
              <Input
                id="new-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [key, setKey] = useState(0); // Key to force re-render if needed

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      console.log(`Attempting to authenticate user: ${email}`);
      const authenticatedUser = await authenticateUser(email, password);
      
      if (authenticatedUser) {
        const { user, session } = authenticatedUser;

        console.log("Authentication successful for:", user.name);
        login(user, session);
        toast({
          title: "Inicio de sesión exitoso",
          description: `¡Bienvenido de nuevo, ${user.name}!`,
        });

        addAuditLog({
          userId: user.id,
          userName: user.name,
          action: 'USER_LOGIN',
          details: `Usuario ${user.name} (${user.username}) ha iniciado sesión.`,
        }).catch((error) => {
          console.warn("No se pudo registrar auditoría de login.", error);
        });

        if (user.role === 'cashier') {
            router.push("/dashboard/sales");
        } else {
            router.push("/dashboard");
        }
      } else {
        console.log(`Authentication failed for user: ${email}`);
        toast({
          variant: "destructive",
          title: "Error de autenticación",
          description: "El usuario o la contraseña son incorrectos.",
        });
      }
    } catch (error) {
      if (error instanceof AuthenticationError) {
        toast({
          variant: "destructive",
          title: "Error de autenticación",
          description: error.message,
        });
        return;
      }

      console.error("Login system error:", error);
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
    setKey(prev => prev + 1);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4" key={key}>
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
              <Label htmlFor="email">Correo Electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@colegio.edu"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col">
          <Button className="w-full" type="submit" form="login-form" disabled={isLoading}>
            <LogIn className="mr-2 h-4 w-4" />
            {isLoading ? "Ingresando..." : "Ingresar"}
          </Button>
          <CreateUserForm onUserCreated={handleUserCreation} />
        </CardFooter>
      </Card>
    </main>
  );
}
