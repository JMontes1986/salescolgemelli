

"use client";

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Info, CheckCircle, TicketCheck, AlertTriangle, CreditCard, PackagePlus } from "lucide-react";
import { getPurchasesByCedula, getPurchaseById, getPurchasesByCelular, updatePurchase, confirmPreSaleAndUpdateStock } from '@/lib/services/purchase-service';
import type { Purchase, User } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { addAuditLog } from '@/lib/services/audit-service';

const statusTranslations: Record<Purchase['status'], string> = {
    pending: 'Pendiente',
    paid: 'Pagado',
    delivered: 'Entregado',
    cancelled: 'Cancelado',
    'pre-sale': 'Preventa Pendiente',
    'pre-sale-confirmed': 'Preventa Confirmada',
};

const statusColors: Record<Purchase['status'], string> = {
    pending: 'bg-yellow-500/20 text-yellow-700',
    paid: 'bg-blue-500/20 text-blue-700',
    delivered: 'bg-green-500/20 text-green-700',
    cancelled: 'bg-red-500/20 text-red-700',
    'pre-sale': 'bg-purple-500/20 text-purple-700',
    'pre-sale-confirmed': 'bg-teal-500/20 text-teal-700',
};

function RedeemPageComponent() {
    const searchParams = useSearchParams();
    const codeFromUrl = searchParams.get('code');
    const { currentUser } = useAuth();

    const [searchCedula, setSearchCedula] = useState('');
    const [searchCelular, setSearchCelular] = useState('');
    const [searchCode, setSearchCode] = useState(codeFromUrl || '');
    const [searchResults, setSearchResults] = useState<Purchase[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [searchPerformed, setSearchPerformed] = useState(false);
    const { toast } = useToast();

     const handleSearch = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        
        if (!searchCode && !searchCedula && !searchCelular) {
            toast({
                variant: 'destructive',
                title: 'Campo Requerido',
                description: 'Por favor ingrese al menos un criterio de búsqueda.'
            });
            return;
        }

        setIsLoading(true);
        setSearchPerformed(true);
        setSearchResults([]);

        try {
            let results: Purchase[] = [];
            if (searchCode) {
                const purchase = await getPurchaseById(searchCode);
                if (purchase) {
                    results.push(purchase);
                }
            } else if (searchCedula) {
                results = await getPurchasesByCedula(searchCedula);
            } else if (searchCelular) {
                results = await getPurchasesByCelular(searchCelular);
            }
            setSearchResults(results);
        } catch (error) {
            console.error("Error searching purchases:", error);
            toast({
                variant: 'destructive',
                title: 'Error de Búsqueda',
                description: 'No se pudieron encontrar las compras. Intente de nuevo.'
            });
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        if (codeFromUrl) {
            handleSearch();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [codeFromUrl]);

    const handleUpdateStatus = async (purchaseId: string, newStatus: Purchase['status']) => {
        setIsUpdating(true);

        if (!currentUser) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo identificar al usuario actual.' });
            setIsUpdating(false);
            return;
        }

        try {
            const purchaseToLog = searchResults.find(p => p.id === purchaseId);
            if (!purchaseToLog) {
                throw new Error("No se encontró la compra para registrar en auditoría.");
            }

            if (newStatus === 'pre-sale-confirmed') {
                await confirmPreSaleAndUpdateStock(purchaseId, currentUser);
            } else {
                 await updatePurchase(purchaseId, { status: newStatus });
            }

            setSearchResults(prev => prev.map(p => p.id === purchaseId ? { ...p, status: newStatus } : p));
            toast({
                title: 'Éxito',
                description: `El estado de la compra ha sido actualizado a ${statusTranslations[newStatus]}.`
            });

            // Add audit log for payment confirmation
            if (newStatus === 'paid') {
                 await addAuditLog({
                    userId: currentUser.id,
                    userName: currentUser.name,
                    action: 'PAYMENT_CONFIRM',
                    details: `Pago confirmado para la compra ${purchaseId} por un total de ${formatCurrency(purchaseToLog.total)}.`,
                });
            }

        } catch (error) {
            console.error("Error updating purchase status:", error);
            toast({
                variant: 'destructive',
                title: 'Error de Actualización',
                description: (error as Error).message || 'No se pudo actualizar el estado de la compra.'
            });
        } finally {
            setIsUpdating(false);
        }
    }

    const renderActionButton = (purchase: Purchase) => {
        switch (purchase.status) {
            case 'pre-sale':
                return (
                    <Button
                        className="w-full bg-purple-600 hover:bg-purple-700"
                        onClick={() => handleUpdateStatus(purchase.id, 'pre-sale-confirmed')}
                        disabled={isUpdating}
                    >
                        <PackagePlus className="mr-2 h-4 w-4" />
                        {isUpdating ? 'Confirmando...' : 'Confirmar Preventa y Pagar'}
                    </Button>
                );
             case 'pre-sale-confirmed':
                return (
                     <Button 
                        className="w-full bg-blue-600 hover:bg-blue-700"
                        onClick={() => handleUpdateStatus(purchase.id, 'paid')}
                        disabled={isUpdating}
                    >
                        <CreditCard className="mr-2 h-4 w-4" />
                        {isUpdating ? 'Confirmando...' : 'Confirmar Pago'}
                    </Button>
                );
            case 'pending':
                return (
                    <Button 
                        className="w-full bg-blue-600 hover:bg-blue-700"
                        onClick={() => handleUpdateStatus(purchase.id, 'paid')}
                        disabled={isUpdating}
                    >
                        <CreditCard className="mr-2 h-4 w-4" />
                        {isUpdating ? 'Confirmando...' : 'Confirmar Pago'}
                    </Button>
                );
            case 'paid':
                return (
                    <Button 
                        className="w-full bg-green-600 hover:bg-green-700"
                        onClick={() => handleUpdateStatus(purchase.id, 'delivered')}
                        disabled={isUpdating}
                    >
                        <CheckCircle className="mr-2 h-4 w-4" />
                         {isUpdating ? 'Entregando...' : 'Marcar como Entregado'}
                    </Button>
                );
            case 'delivered':
                 return (
                    <div className="flex items-center justify-center w-full text-green-700 font-semibold">
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Compra Entregada
                    </div>
                );
            default:
                return null;
        }
    }


    return (
        <div>
            <PageHeader
                title="Verificar y Canjear Compra"
                description="Busque una compra por código, cédula o celular para verificar y entregar."
            />
            <div className="grid gap-8 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Buscar Compra</CardTitle>
                        <CardDescription>
                            Ingrese uno de los campos para encontrar el registro de la compra.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form id="search-form" onSubmit={handleSearch} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="ticket-code">Código de Pago</Label>
                                <Input id="ticket-code" placeholder="ej., aBcDeFg123" className="font-mono" value={searchCode} onChange={e => setSearchCode(e.target.value)} />
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="cedula">Cédula del Cliente</Label>
                                <Input id="cedula" placeholder="ej., 123456789" value={searchCedula} onChange={e => setSearchCedula(e.target.value)} />
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="celular">Celular del Cliente</Label>
                                <Input id="celular" placeholder="ej., 3001234567" value={searchCelular} onChange={e => setSearchCelular(e.target.value)} />
                            </div>
                        </form>
                    </CardContent>
                    <CardFooter>
                         <Button className="w-full" type="submit" form="search-form" disabled={isLoading}>
                            <Search className="mr-2 h-4 w-4" />
                            {isLoading ? 'Buscando...' : 'Buscar Compra'}
                        </Button>
                    </CardFooter>
                </Card>

                <Card className="bg-muted/30">
                     <CardHeader>
                        <CardTitle>Resultados de la Búsqueda</CardTitle>
                        <CardDescription>
                            Las compras encontradas se mostrarán a continuación.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-6">
                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center text-center gap-4 p-8">
                                <p>Buscando...</p>
                            </div>
                        ) : !searchPerformed ? (
                             <div className="flex flex-col items-center justify-center text-center gap-4 p-8">
                                <Info className="h-16 w-16 text-muted-foreground" />
                                <p className="text-muted-foreground">
                                   Ingrese los datos de búsqueda y haga clic en "Buscar Compra".
                                </p>
                            </div>
                        ) : searchResults.length > 0 ? (
                            <ScrollArea className="h-[400px]">
                                <div className="space-y-4">
                                    {searchResults.map(purchase => (
                                        <Card key={purchase.id}>
                                            <CardHeader>
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <CardTitle className="text-lg">Código: <span className="font-mono">{purchase.id}</span></CardTitle>
                                                        <CardDescription>
                                                            Fecha: {purchase.date} | Cédula: {purchase.cedula} | Celular: {purchase.celular}
                                                        </CardDescription>
                                                    </div>
                                                    <Badge className={cn("capitalize", statusColors[purchase.status])}>
                                                        {statusTranslations[purchase.status]}
                                                    </Badge>
                                                </div>
                                            </CardHeader>
                                            <CardContent>
                                                <h4 className="font-semibold mb-2">Artículos Comprados:</h4>
                                                <ul className="list-disc list-inside space-y-1 text-sm">
                                                    {purchase.items.map(item => (
                                                        <li key={item.id}>
                                                            {item.name} (x{item.quantity}) - {formatCurrency(item.price * item.quantity)}
                                                        </li>
                                                    ))}
                                                </ul>
                                                <p className="font-bold text-right mt-2">Total: {formatCurrency(purchase.total)}</p>
                                            </CardContent>
                                            <CardFooter>
                                                {renderActionButton(purchase)}
                                            </CardFooter>
                                        </Card>
                                    ))}
                                </div>
                            </ScrollArea>
                        ) : (
                             <div className="flex flex-col items-center justify-center text-center gap-4 p-8">
                                <AlertTriangle className="h-16 w-16 text-destructive" />
                                <h3 className="text-xl font-semibold">No se encontraron compras</h3>
                                <p className="text-muted-foreground">
                                   Verifique los datos ingresados e intente nuevamente.
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

// Wrap the component in Suspense to handle the use of useSearchParams
export default function RedeemPage() {
    return (
        <React.Suspense fallback={<div>Cargando...</div>}>
            <RedeemPageComponent />
        </React.Suspense>
    )
}
