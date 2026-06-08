

"use client";

import React, { useCallback, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Info, CheckCircle, AlertTriangle, CreditCard, PackagePlus, RefreshCw, ClipboardList } from "lucide-react";
import { getPurchasesByCedula, getPurchaseById, getPurchasesByCelular, updatePurchase, confirmPreSaleAndUpdateStock, getSelfServicePurchases } from '@/lib/services/purchase-service';
import type { Purchase, User } from '@/lib/types';
import { toast as showToast, useToast } from '@/hooks/use-toast';
import { formatCurrency, cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { addAuditLog } from '@/lib/services/audit-service';
import { useSupabaseRealtime } from '@/hooks/use-supabase-realtime';

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
    const [recentPurchases, setRecentPurchases] = useState<Purchase[]>([]);
    const [isRecentLoading, setIsRecentLoading] = useState(true);
    const [searchPerformed, setSearchPerformed] = useState(false);
    const { toast } = useToast();
    const realtimeTables = React.useMemo(() => ['products', 'purchases'] as const, []);

    const loadRecentPurchases = useCallback(async (showLoading = true) => {
        if (showLoading) {
            setIsRecentLoading(true);
        }
        try {
            const purchases = await getSelfServicePurchases();
            setRecentPurchases(purchases);
        } catch (error) {
            console.error("Error loading self-service purchases:", error);
            showToast({
                variant: 'destructive',
                title: 'Error al cargar compras',
                description: 'No se pudieron cargar las compras de autogestión.'
            });
        } finally {
            if (showLoading) {
                setIsRecentLoading(false);
            }
        }
    }, []);

    const refreshSearchResults = useCallback(async () => {
        const normalizedCode = searchCode.trim().toUpperCase();
        const normalizedCedula = searchCedula.trim();
        const normalizedCelular = searchCelular.trim();

        if (!searchPerformed || (!normalizedCode && !normalizedCedula && !normalizedCelular)) {
            return;
        }

        let results: Purchase[] = [];
        if (normalizedCode) {
            const purchase = await getPurchaseById(normalizedCode);
            if (purchase) {
                results.push(purchase);
            }
        } else if (normalizedCedula) {
            results = await getPurchasesByCedula(normalizedCedula);
        } else if (normalizedCelular) {
            results = await getPurchasesByCelular(normalizedCelular);
        }

        setSearchResults(results);
    }, [searchCedula, searchCelular, searchCode, searchPerformed]);

     const handleSearch = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        const normalizedCode = searchCode.trim().toUpperCase();
        const normalizedCedula = searchCedula.trim();
        const normalizedCelular = searchCelular.trim();
        
        if (!normalizedCode && !normalizedCedula && !normalizedCelular) {
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
            if (normalizedCode) {
                setSearchCode(normalizedCode);
            }
            let results: Purchase[] = [];
            if (normalizedCode) {
                const purchase = await getPurchaseById(normalizedCode);
                if (purchase) {
                    results.push(purchase);
                }
            } else if (normalizedCedula) {
                results = await getPurchasesByCedula(normalizedCedula);
            } else if (normalizedCelular) {
                results = await getPurchasesByCelular(normalizedCelular);
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
        loadRecentPurchases();
    }, [loadRecentPurchases]);

    useSupabaseRealtime({
        tables: realtimeTables,
        onChange: async () => {
            await Promise.all([
                loadRecentPurchases(false),
                refreshSearchResults(),
            ]);
        },
    });

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
            const purchaseToLog = [...searchResults, ...recentPurchases].find(p => p.id === purchaseId);
            if (!purchaseToLog) {
                throw new Error("No se encontró la compra para registrar en auditoría.");
            }

            if (newStatus === 'pre-sale-confirmed') {
                await confirmPreSaleAndUpdateStock(purchaseId, currentUser);
            } else {
                 await updatePurchase(purchaseId, { status: newStatus });
            }

            setSearchResults(prev => prev.map(p => p.id === purchaseId ? { ...p, status: newStatus } : p));
            setRecentPurchases(prev => prev.map(p => p.id === purchaseId ? { ...p, status: newStatus } : p));
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

    const handleSelectRecentPurchase = (purchase: Purchase) => {
        setSearchCode(purchase.id);
        setSearchCedula('');
        setSearchCelular('');
        setSearchResults([purchase]);
        setSearchPerformed(true);
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
            <Card className="mb-8">
                <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <ClipboardList className="h-5 w-5" />
                            Compras de Autogestión
                        </CardTitle>
                        <CardDescription>
                            Consulte las compras generadas y su estado sin buscar por cliente o código.
                        </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => loadRecentPurchases()} disabled={isRecentLoading}>
                        <RefreshCw className={cn("mr-2 h-4 w-4", isRecentLoading && "animate-spin")} />
                        Actualizar
                    </Button>
                </CardHeader>
                <CardContent>
                    {isRecentLoading ? (
                        <div className="rounded-md border border-dashed bg-muted/40 p-6 text-center text-muted-foreground">
                            Cargando compras de autogestión...
                        </div>
                    ) : recentPurchases.length === 0 ? (
                        <div className="rounded-md border border-dashed bg-muted/40 p-6 text-center text-muted-foreground">
                            No hay compras de autogestión registradas.
                        </div>
                    ) : (
                        <ScrollArea className="h-[360px] pr-4">
                            <div className="space-y-3">
                                {recentPurchases.map(purchase => {
                                    const itemCount = purchase.items.reduce((total, item) => total + item.quantity, 0);
                                    const itemSummary = purchase.items
                                        .map(item => `${item.name} x${item.quantity}`)
                                        .join(', ');

                                    return (
                                        <div key={purchase.id} className="rounded-md border bg-background p-4">
                                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                                <div className="min-w-0 space-y-2">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="font-mono text-lg font-black">{purchase.id}</span>
                                                        <Badge className={cn("capitalize", statusColors[purchase.status])}>
                                                            {statusTranslations[purchase.status]}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-sm text-muted-foreground">{purchase.date}</p>
                                                    <p className="line-clamp-2 text-sm">
                                                        {itemSummary}
                                                    </p>
                                                </div>
                                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:justify-end">
                                                    <div className="text-left sm:text-right">
                                                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                                                            {itemCount} producto{itemCount === 1 ? '' : 's'}
                                                        </p>
                                                        <p className="text-xl font-black">{formatCurrency(purchase.total)}</p>
                                                    </div>
                                                    <div className="grid gap-2 sm:w-48">
                                                        <Button variant="outline" onClick={() => handleSelectRecentPurchase(purchase)}>
                                                            <Search className="mr-2 h-4 w-4" />
                                                            Ver detalle
                                                        </Button>
                                                        {renderActionButton(purchase)}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    )}
                </CardContent>
            </Card>
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
