
"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DoorOpen, DoorClosed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";
import type { CashboxSession } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { getActiveSessionForUser, getCashboxHistory, openCashboxSession, closeCashboxSession } from "@/lib/services/cashbox-service";
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

export default function CashboxPage() {
    const [openingBalance, setOpeningBalance] = useState("");
    const [closingBalance, setClosingBalance] = useState("");
    const [currentSession, setCurrentSession] = useState<CashboxSession | null>(null);
    const [cashboxHistory, setCashboxHistory] = useState<CashboxSession[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const { currentUser, isMounted } = useAuth();
    const { toast } = useToast();

    const loadCashboxData = useCallback(async () => {
        if (!isMounted) return;

        if (!currentUser) {
            setCurrentSession(null);
            setCashboxHistory([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        try {
            const [activeSession, history] = await Promise.all([
                getActiveSessionForUser(currentUser.id),
                getCashboxHistory()
            ]);
            setCurrentSession(activeSession);
            setCashboxHistory(history);
        } catch (error) {
            console.error("Error loading cashbox data:", error);
            toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los datos de la caja." });
        } finally {
            setIsLoading(false);
        }
    }, [currentUser, isMounted, toast]);

    useEffect(() => {
        loadCashboxData();
    }, [loadCashboxData]);
    
    const handleBalanceChange = (setter: React.Dispatch<React.SetStateAction<string>>) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value.replace(/[^0-9]/g, '');
        const numericValue = parseInt(rawValue, 10);

        if (isNaN(numericValue)) {
            setter("");
        } else {
            setter(new Intl.NumberFormat('es-CO').format(numericValue));
        }
    };

    const parseFormattedNumber = (formattedValue: string): number => {
        return parseInt(formattedValue.replace(/[^0-9]/g, ''), 10) || 0;
    }

    const handleOpenCashbox = async () => {
        if (!currentUser) return;
        const balance = parseFormattedNumber(openingBalance);

        if (balance <= 0) {
            toast({ variant: "destructive", title: "Error", description: "El saldo de apertura debe ser mayor que cero." });
            return;
        }

        setIsProcessing(true);
        try {
            await openCashboxSession(balance, currentUser);
            toast({ title: "Caja Abierta", description: `La sesión se ha iniciado con ${formatCurrency(balance)}.` });
            setOpeningBalance("");
            loadCashboxData();
        } catch (error) {
             console.error("Error opening cashbox:", error);
            toast({ variant: "destructive", title: "Error", description: (error as Error).message || "No se pudo abrir la caja." });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCloseCashbox = async () => {
        if (!currentUser || !currentSession) return;
        const balance = parseFormattedNumber(closingBalance);

        if (balance < 0) {
            toast({ variant: "destructive", title: "Error", description: "El saldo de cierre no puede ser negativo." });
            return;
        }

        setIsProcessing(true);
        try {
            await closeCashboxSession(currentSession.id, balance, currentUser);
            toast({ title: "Caja Cerrada", description: "La sesión ha finalizado correctamente." });
            setClosingBalance("");
            loadCashboxData();
        } catch (error) {
            console.error("Error closing cashbox:", error);
            toast({ variant: "destructive", title: "Error", description: (error as Error).message || "No se pudo cerrar la caja." });
        } finally {
            setIsProcessing(false);
        }
    }
    
    const expectedInCash = currentSession ? currentSession.openingBalance + currentSession.totalSales : 0;
    const cashDiscrepancy = currentSession ? parseFormattedNumber(closingBalance) - expectedInCash : 0;

    return (
        <div>
            <PageHeader
                title="Gestión de Caja"
                description="Abrir, cerrar y revisar las sesiones de caja."
            />
            <div className="grid gap-8 lg:grid-cols-3">
                <div className="lg:col-span-1">
                    <Card>
                        <CardHeader>
                            <CardTitle>
                                {currentSession ? "Sesión Actual" : "Nueva Sesión"}
                            </CardTitle>
                            <CardDescription>
                                {currentSession ? `Sesión para ${currentSession.userName}` : "Iniciar una nueva sesión de caja para el día."}
                            </CardDescription>
                        </CardHeader>
                        {currentSession ? (
                            <>
                                <CardContent className="space-y-4">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Saldo de Apertura:</span>
                                        <span className="font-medium">{formatCurrency(currentSession.openingBalance)}</span>
                                    </div>
                                     <div className="flex justify-between">
                                        <span className="text-muted-foreground">Ventas Totales:</span>
                                        <span className="font-medium">{formatCurrency(currentSession.totalSales)}</span>
                                    </div>
                                    <div className="flex justify-between font-bold text-lg">
                                        <span>Esperado en Caja:</span>
                                        <span>{formatCurrency(expectedInCash)}</span>
                                    </div>
                                </CardContent>
                                <CardFooter>
                                     <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                             <Button variant="destructive" className="w-full" disabled={isProcessing}>
                                                <DoorClosed className="mr-2 h-4 w-4" />
                                                Cerrar Caja
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                            <AlertDialogTitle>Confirmar Cierre de Caja</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Por favor, cuente el dinero en efectivo y ingrese el monto final para cerrar la sesión. Esta acción no se puede deshacer.
                                            </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="closing-balance">Saldo de Cierre (Efectivo Contado)</Label>
                                                    <Input 
                                                        id="closing-balance" 
                                                        type="text" 
                                                        placeholder="100.000" 
                                                        value={closingBalance}
                                                        onChange={handleBalanceChange(setClosingBalance)}
                                                    />
                                                </div>
                                                <div className="space-y-2 rounded-lg border p-4">
                                                    <h4 className="font-medium">Resumen de Cierre</h4>
                                                    <div className="flex justify-between text-sm">
                                                        <span>Esperado en Caja:</span>
                                                        <span>{formatCurrency(expectedInCash)}</span>
                                                    </div>
                                                    <div className="flex justify-between text-sm">
                                                        <span>Monto Contado:</span>
                                                        <span>{formatCurrency(parseFormattedNumber(closingBalance))}</span>
                                                    </div>
                                                    <div className={cn("flex justify-between font-bold text-lg pt-2 border-t", cashDiscrepancy !== 0 ? (cashDiscrepancy > 0 ? 'text-green-600' : 'text-red-600') : '')}>
                                                        <span>Descuadre:</span>
                                                        <span>{formatCurrency(cashDiscrepancy)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <AlertDialogFooter>
                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleCloseCashbox} disabled={isProcessing}>
                                                {isProcessing ? 'Cerrando...' : 'Confirmar y Cerrar Caja'}
                                            </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </CardFooter>
                            </>
                        ) : (
                             <>
                                <CardContent>
                                    <div className="space-y-2">
                                        <Label htmlFor="opening-balance">Saldo de Apertura</Label>
                                        <Input 
                                            id="opening-balance" 
                                            type="text" 
                                            placeholder="100.000" 
                                            value={openingBalance}
                                            onChange={handleBalanceChange(setOpeningBalance)}
                                            disabled={isProcessing}
                                        />
                                    </div>
                                </CardContent>
                                <CardFooter>
                                    <Button onClick={handleOpenCashbox} className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={isProcessing}>
                                        <DoorOpen className="mr-2 h-4 w-4" />
                                        {isProcessing ? 'Abriendo...' : 'Abrir Caja'}
                                    </Button>
                                </CardFooter>
                            </>
                        )}
                    </Card>
                </div>
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Historial de Sesiones</CardTitle>
                            <CardDescription>Revisión de sesiones de caja anteriores.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Usuario</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead>Fecha de Cierre</TableHead>
                                        <TableHead className="text-right">Descuadre</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-24 text-center">Cargando historial...</TableCell>
                                        </TableRow>
                                    ) : cashboxHistory.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-24 text-center">
                                                No hay sesiones de caja.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        cashboxHistory.map(session => {
                                            const discrepancy = session.closingBalance !== undefined ? session.closingBalance - (session.openingBalance + session.totalSales) : undefined;
                                            return (
                                                <TableRow key={session.id}>
                                                    <TableCell>{session.userName}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className={cn(session.status === 'open' ? 'text-green-700 border-green-300' : 'text-gray-700 border-gray-300', "capitalize")}>
                                                            {session.status === 'open' ? 'Abierta' : 'Cerrada'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        {session.closedAt ? new Date(session.closedAt).toLocaleString() : 'N/A'}
                                                    </TableCell>
                                                    <TableCell className={cn("text-right font-medium", discrepancy !== undefined && discrepancy !== 0 ? (discrepancy > 0 ? 'text-green-600' : 'text-red-600') : '')}>
                                                        {discrepancy !== undefined ? formatCurrency(discrepancy) : 'N/A'}
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
