
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
import { getUsers, addUser } from "@/lib/services/user-service";
import { useToast } from "@/hooks/use-toast";
import { PermissionGate } from "@/components/permission-gate";
import { PlusCircle } from "lucide-react";
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

const roleNames: Record<UserRole, string> = {
  admin: 'Administrador',
  cashier: 'Cajero',
  seller: 'Vendedor',
  auditor: 'Auditor',
};

function UserForm({
    mode,
    initialData,
    onUserAdded,
}: {
    mode: 'create';
    initialData?: User;
    onUserAdded: (user: User) => void;
}) {
    const { toast } = useToast();
    const [name, setName] = useState(initialData?.name || '');
    const [username, setUsername] = useState(initialData?.username || '');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<UserRole>('seller');
    const [isOpen, setIsOpen] = useState(false);

    const isEmailRole = role === 'admin' || role === 'auditor';
    const handleOpenChange = (open: boolean) => {
        setIsOpen(open);
        if (open) {
            setName('');
            setUsername('');
            setPassword('');
            setRole('seller');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const newUserData: NewUser = {
            name,
            username,
            password,
            role,
            avatarUrl: `https://picsum.photos/seed/${encodeURIComponent(username)}/100/100`,
        };

        try {
            const addedUser = await addUser(newUserData);
            onUserAdded(addedUser as User);
            toast({ title: "Éxito", description: "Usuario añadido correctamente." });
            setIsOpen(false);
        } catch (error) {
            console.error("Error adding user:", error);
            toast({ variant: "destructive", title: "Error", description: "No se pudo añadir el usuario." });
        }
    };

    const trigger = (
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
                    <DialogTitle>Crear Nuevo Usuario</DialogTitle>
                    <DialogDescription>
                        Complete los detalles y asigne un rol al nuevo usuario.
                    </DialogDescription>
                </DialogHeader>
                <form id={`user-form-${initialData?.id || 'create'}`} onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="user-name">Nombre Completo</Label>
                            <Input id="user-name" placeholder="Ej: Juan Pérez" value={name} onChange={e => setName(e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="user-credential">
                              {isEmailRole ? 'Correo Electrónico' : 'Usuario'}
                            </Label>
                            <Input
                              id="user-credential"
                              type={isEmailRole ? 'email' : 'text'}
                              placeholder={isEmailRole ? 'admin@colegio.edu' : 'juan.perez'}
                              value={username}
                              onChange={e => setUsername(e.target.value)}
                              required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="user-password">Contraseña</Label>
                            <Input id="user-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="user-role">Rol</Label>
                            <Select value={role} onValueChange={(value) => setRole(value as UserRole)}>
                                <SelectTrigger id="user-role">
                                    <SelectValue placeholder="Seleccione un rol" />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(roleNames).map(([key, name]) => (
                                        <SelectItem key={key} value={key}>{name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </form>
                <DialogFooter>
                    <DialogClose asChild><Button type="button" variant="secondary">Cancelar</Button></DialogClose>
                    <Button type="submit" form={`user-form-${initialData?.id || 'create'}`}>Guardar Usuario</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
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
        toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los usuarios." });
      } finally {
        setIsLoading(false);
      }
    }
    loadUsers();
  }, [toast]); // Empty dependency array ensures this runs only once on mount

  const handleUserAdded = (newUser: User) => {
    setUsers(prevUsers => [...prevUsers, newUser]);
  };

  return (
    <div>
      <PageHeader
        title="Gestión de Usuarios"
        description="Administrar usuarios y sus roles en el sistema."
      >
        <PermissionGate requiredPermission="users">
           <UserForm mode="create" onUserAdded={handleUserAdded} />
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
                            <p className="text-sm text-muted-foreground">{user.username}</p>
                        </div>
                        </div>
                    </TableCell>
                    <TableCell>
                       <Badge variant="secondary" className="capitalize">
                            {roleNames[user.role] || user.role}
                        </Badge>
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
