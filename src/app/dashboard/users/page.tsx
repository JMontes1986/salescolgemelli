"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { User, NewUser, UserRole } from "@/lib/types";
import {
  getUsers,
  addUser,
  updateUser,
  deleteUser,
} from "@/lib/services/user-service";
import { useToast } from "@/hooks/use-toast";
import { PermissionGate } from "@/components/permission-gate";
import { Pencil, PlusCircle, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const roleNames: Record<UserRole, string> = {
  admin: "Administrador",
  cashier: "Cajero",
  seller: "Vendedor",
  auditor: "Auditor",
};

function UserForm({
  mode,
  initialData,
  onUserSaved,
}: {
  mode: "create" | "edit";
  initialData?: User;
  onUserSaved: (user: User) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(initialData?.name || "");
  const [username, setUsername] = useState(initialData?.username || "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(initialData?.role || "seller");
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEmailRole = role === "admin" || role === "auditor";
  const formId = `user-form-${initialData?.id || "create"}`;
  const fieldPrefix = `user-${initialData?.id || "create"}`;
  const isEditMode = mode === "edit";
  const isAuthManagedPassword = isEditMode && isEmailRole;

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setName(initialData?.name || "");
      setUsername(initialData?.username || "");
      setPassword("");
      setRole(initialData?.role || "seller");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (isEditMode) {
        if (!initialData) {
          throw new Error("No se encontró el usuario que quieres editar.");
        }

        const updatedUser = await updateUser(initialData.id, {
          name,
          role,
          password: password || undefined,
        });

        onUserSaved(updatedUser);
        toast({
          title: "Éxito",
          description: "Usuario actualizado correctamente.",
        });
      } else {
        const newUserData: NewUser = {
          name,
          username,
          password,
          role,
          avatarUrl: `https://picsum.photos/seed/${encodeURIComponent(username)}/100/100`,
        };

        const addedUser = await addUser(newUserData);
        onUserSaved(addedUser as User);
        toast({
          title: "Éxito",
          description: "Usuario añadido correctamente.",
        });
      }

      setIsOpen(false);
    } catch (error) {
      console.error("Error saving user:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "No se pudo guardar el usuario.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const trigger = isEditMode ? (
    <Button variant="ghost" size="icon" aria-label={`Editar ${initialData?.name}`}>
      <Pencil className="h-4 w-4" />
    </Button>
  ) : (
    <Button>
      <PlusCircle className="mr-2 h-4 w-4" />
      Crear Usuario
    </Button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Editar Usuario" : "Crear Nuevo Usuario"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Actualice los datos principales del usuario."
              : "Complete los detalles y asigne un rol al nuevo usuario."}
          </DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor={`${fieldPrefix}-name`}>Nombre Completo</Label>
              <Input
                id={`${fieldPrefix}-name`}
                name="name"
                placeholder="Ej: Juan Pérez"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${fieldPrefix}-credential`}>
                {isEmailRole ? "Correo Electrónico" : "Usuario"}
              </Label>
              <Input
                id={`${fieldPrefix}-credential`}
                name="username"
                type={isEmailRole ? "email" : "text"}
                placeholder={isEmailRole ? "admin@colegio.edu" : "juan.perez"}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={isSubmitting || isEditMode}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${fieldPrefix}-password`}>Contraseña</Label>
              <Input
                id={`${fieldPrefix}-password`}
                name="password"
                type="password"
                placeholder={
                  isAuthManagedPassword
                    ? "Gestionada en Supabase Auth"
                    : isEditMode
                      ? "Dejar en blanco para conservarla"
                      : ""
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={!isEditMode}
                disabled={isSubmitting || isAuthManagedPassword}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${fieldPrefix}-role`}>Rol</Label>
              <Select
                name="role"
                value={role}
                onValueChange={(value) => {
                  const nextRole = value as UserRole;
                  setRole(nextRole);

                  if (
                    isEditMode &&
                    (nextRole === "admin" || nextRole === "auditor")
                  ) {
                    setPassword("");
                  }
                }}
                disabled={isSubmitting}
              >
                <SelectTrigger id={`${fieldPrefix}-role`}>
                  <SelectValue placeholder="Seleccione un rol" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(roleNames).map(([key, name]) => (
                    <SelectItem key={key} value={key}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary" disabled={isSubmitting}>
              Cancelar
            </Button>
          </DialogClose>
          <Button type="submit" form={formId} disabled={isSubmitting}>
            {isSubmitting ? "Guardando..." : "Guardar Usuario"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserButton({
  user,
  onUserDeleted,
}: {
  user: User;
  onUserDeleted: (userId: string) => void;
}) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const canDelete = user.role === "cashier" || user.role === "seller";

  if (!canDelete) {
    return null;
  }

  const handleDelete = async () => {
    setIsDeleting(true);

    try {
      await deleteUser(user.id);
      onUserDeleted(user.id);
      setIsOpen(false);
      toast({
        title: "Usuario eliminado",
        description: `${user.name} fue eliminado correctamente.`,
      });
    } catch (error) {
      console.error("Error deleting user:", error);
      toast({
        variant: "destructive",
        title: "Error al eliminar",
        description:
          error instanceof Error
            ? error.message
            : "No se pudo eliminar el usuario.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Eliminar ${user.name}`}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar usuario</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción eliminará a {user.name} ({roleNames[user.role]}) del
            sistema. No se pueden eliminar administradores ni auditores desde
            esta pantalla.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isDeleting}
            onClick={(event) => {
              event.preventDefault();
              void handleDelete();
            }}
          >
            {isDeleting ? "Eliminando..." : "Eliminar usuario"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  useEffect(() => {
    async function loadUsers() {
      setIsLoading(true);
      try {
        const fetchedUsers = await getUsers();
        setUsers(fetchedUsers);
      } catch (error) {
        console.error("Error fetching users:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "No se pudieron cargar los usuarios.",
        });
      } finally {
        setIsLoading(false);
      }
    }
    loadUsers();
  }, [toast]); // Empty dependency array ensures this runs only once on mount

  const handleUserAdded = (newUser: User) => {
    setUsers((prevUsers) => [...prevUsers, newUser]);
  };

  const handleUserUpdated = (updatedUser: User) => {
    setUsers((prevUsers) =>
      prevUsers.map((user) =>
        user.id === updatedUser.id ? updatedUser : user,
      ),
    );
  };

  const handleUserDeleted = (userId: string) => {
    setUsers((prevUsers) => prevUsers.filter((user) => user.id !== userId));
  };

  return (
    <div>
      <PageHeader
        title="Gestión de Usuarios"
        description="Administrar usuarios y sus roles en el sistema."
      >
        <PermissionGate requiredPermission="users">
          <UserForm mode="create" onUserSaved={handleUserAdded} />
        </PermissionGate>
      </PageHeader>
      <Card>
        <CardHeader>
          <CardTitle>Usuarios</CardTitle>
          <CardDescription>
            Una lista de todos los usuarios del sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Cargando usuarios...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead className="w-28 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={user.avatarUrl} alt={user.name} />
                          <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{user.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {user.username}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {roleNames[user.role] || user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <PermissionGate requiredPermission="users">
                        <div className="flex justify-end gap-1">
                          <UserForm
                            mode="edit"
                            initialData={user}
                            onUserSaved={handleUserUpdated}
                          />
                          <DeleteUserButton
                            user={user}
                            onUserDeleted={handleUserDeleted}
                          />
                        </div>
                      </PermissionGate>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
