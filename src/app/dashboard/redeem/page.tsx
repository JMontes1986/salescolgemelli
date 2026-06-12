

"use client";

import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Info, CheckCircle, AlertTriangle, PackagePlus, RefreshCw, ClipboardList, PackageCheck, Minus, Plus, Camera, VideoOff } from "lucide-react";
import { getPurchasesByCedula, getPurchaseById, getPurchasesByCelular, updatePurchase, confirmPreSaleAndUpdateStock, confirmPendingPurchaseAndUpdateStock, getSelfServicePurchases, deliverPurchaseItems } from '@/lib/services/purchase-service';
import type { Purchase, User } from '@/lib/types';
import { toast as showToast, useToast } from '@/hooks/use-toast';
import { formatCurrency, cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { addAuditLog } from '@/lib/services/audit-service';
import { useSupabaseRealtime } from '@/hooks/use-supabase-realtime';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const statusTranslations: Record<Purchase['status'], string> = {
    pending: 'Pendiente',
    paid: 'Pagado',
    delivered: 'Entregado',
    'partially-delivered': 'Entrega parcial',
    cancelled: 'Cancelado',
    'pre-sale': 'Preventa Pendiente',
    'pre-sale-confirmed': 'Preventa Confirmada',
};

const statusColors: Record<Purchase['status'], string> = {
    pending: 'bg-yellow-500/20 text-yellow-700',
    paid: 'bg-blue-500/20 text-blue-700',
    delivered: 'bg-green-500/20 text-green-700',
    'partially-delivered': 'bg-emerald-500/20 text-emerald-700',
    cancelled: 'bg-red-500/20 text-red-700',
    'pre-sale': 'bg-purple-500/20 text-purple-700',
    'pre-sale-confirmed': 'bg-teal-500/20 text-teal-700',
};

type BarcodeDetectorResult = {
    rawValue?: string;
};

type BarcodeDetectorInstance = {
    detect: (source: HTMLVideoElement) => Promise<BarcodeDetectorResult[]>;
};

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

type WindowWithBarcodeDetector = Window &
    typeof globalThis & {
        BarcodeDetector?: BarcodeDetectorConstructor;
    };

function parsePurchaseLookup(searchCode: string, deliveryCode: string) {
    const rawCode = searchCode.trim();
    let normalizedCode = rawCode.toUpperCase();
    let normalizedDeliveryCode = deliveryCode.trim().toUpperCase();

    if (rawCode) {
        try {
            const parsedUrl = new URL(rawCode, window.location.origin);
            const codeFromQr = parsedUrl.searchParams.get('code')?.trim();
            const deliveryFromQr = parsedUrl.searchParams.get('delivery')?.trim();

            if (codeFromQr) {
                normalizedCode = codeFromQr.toUpperCase();
            }

            if (deliveryFromQr && !normalizedDeliveryCode) {
                normalizedDeliveryCode = deliveryFromQr.toUpperCase();
            }
        } catch {
            // The input is a plain purchase code, not a URL payload.
        }
    }

    return { normalizedCode, normalizedDeliveryCode };
}

function RedeemPageComponent() {
    const searchParams = useSearchParams();
    const codeFromUrl = searchParams.get('code');
    const deliveryCodeFromUrl = searchParams.get('delivery');
    const { currentUser } = useAuth();
    const isSeller = currentUser?.role === 'seller';

    const [searchCedula, setSearchCedula] = useState('');
    const [searchCelular, setSearchCelular] = useState('');
    const [searchCode, setSearchCode] = useState(codeFromUrl || '');
    const [deliveryCode, setDeliveryCode] = useState(deliveryCodeFromUrl || '');
    const [searchResults, setSearchResults] = useState<Purchase[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [recentPurchases, setRecentPurchases] = useState<Purchase[]>([]);
    const [isRecentLoading, setIsRecentLoading] = useState(true);
    const [searchPerformed, setSearchPerformed] = useState(false);
    const [deliveryQuantities, setDeliveryQuantities] = useState<Record<string, Record<string, number>>>({});
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [isScannerStarting, setIsScannerStarting] = useState(false);
    const [scannerError, setScannerError] = useState('');
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const scannerStreamRef = useRef<MediaStream | null>(null);
    const scannerFrameRef = useRef<number | null>(null);
    const { toast } = useToast();
    const realtimeTables = React.useMemo(() => ['products', 'purchases'] as const, []);

    const loadRecentPurchases = useCallback(async (showLoading = true) => {
        if (isSeller) {
            setRecentPurchases([]);
            setIsRecentLoading(false);
            return;
        }

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
    }, [isSeller]);

    const refreshSearchResults = useCallback(async () => {
        const { normalizedCode } = parsePurchaseLookup(searchCode, deliveryCode);
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
        } else if (!isSeller && normalizedCedula) {
            results = await getPurchasesByCedula(normalizedCedula);
        } else if (!isSeller && normalizedCelular) {
            results = await getPurchasesByCelular(normalizedCelular);
        }

        setSearchResults(results);
    }, [deliveryCode, isSeller, searchCedula, searchCelular, searchCode, searchPerformed]);

    const stopScanner = useCallback(() => {
        if (scannerFrameRef.current !== null) {
            cancelAnimationFrame(scannerFrameRef.current);
            scannerFrameRef.current = null;
        }

        scannerStreamRef.current?.getTracks().forEach(track => track.stop());
        scannerStreamRef.current = null;

        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }

        setIsScannerStarting(false);
    }, []);

    const searchByQrPayload = useCallback(async (qrPayload: string) => {
        const { normalizedCode, normalizedDeliveryCode } = parsePurchaseLookup(qrPayload, deliveryCode);

        if (!normalizedCode) {
            toast({
                variant: 'destructive',
                title: 'QR no válido',
                description: 'No se encontró un código de compra dentro del QR.'
            });
            return;
        }

        setSearchCode(normalizedCode);
        setDeliveryCode(normalizedDeliveryCode);
        setSearchCedula('');
        setSearchCelular('');
        setIsLoading(true);
        setSearchPerformed(true);
        setSearchResults([]);

        try {
            const purchase = await getPurchaseById(normalizedCode);
            setSearchResults(purchase ? [purchase] : []);
            toast({
                title: purchase ? 'QR escaneado' : 'Compra no encontrada',
                description: purchase
                    ? 'Los productos de la compra ya están listos para revisar.'
                    : 'No se encontró una compra con el código leído.'
            });
        } catch (error) {
            console.error("Error searching scanned purchase:", error);
            toast({
                variant: 'destructive',
                title: 'Error de Búsqueda',
                description: 'No se pudo cargar la compra del QR. Intente de nuevo.'
            });
        } finally {
            setIsLoading(false);
        }
    }, [deliveryCode, toast]);

     const handleSearch = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        const { normalizedCode, normalizedDeliveryCode } = parsePurchaseLookup(searchCode, deliveryCode);
        const normalizedCedula = searchCedula.trim();
        const normalizedCelular = searchCelular.trim();
        
        if (isSeller && !normalizedCode) {
            toast({
                variant: 'destructive',
                title: 'Código requerido',
                description: 'Ingrese o escanee el código de compra para registrar la entrega.'
            });
            return;
        }

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
            if (normalizedDeliveryCode) {
                setDeliveryCode(normalizedDeliveryCode);
            }
            let results: Purchase[] = [];
            if (normalizedCode) {
                const purchase = await getPurchaseById(normalizedCode);
                if (purchase) {
                    results.push(purchase);
                }
            } else if (!isSeller && normalizedCedula) {
                results = await getPurchasesByCedula(normalizedCedula);
            } else if (!isSeller && normalizedCelular) {
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

    const handleScannerOpenChange = (open: boolean) => {
        setIsScannerOpen(open);

        if (!open) {
            stopScanner();
        }
    };

    useEffect(() => {
        if (!isScannerOpen) {
            return;
        }

        let cancelled = false;

        const startScanner = async () => {
            setScannerError('');
            setIsScannerStarting(true);

            if (!navigator.mediaDevices?.getUserMedia) {
                setScannerError('Este navegador no permite acceder a la cámara.');
                setIsScannerStarting(false);
                return;
            }

            const BarcodeDetector = (window as WindowWithBarcodeDetector).BarcodeDetector;

            if (!BarcodeDetector) {
                setScannerError('Este navegador no soporta lectura directa de QR. Puede pegar o digitar el código manualmente.');
                setIsScannerStarting(false);
                return;
            }

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' } },
                    audio: false,
                });

                if (cancelled) {
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }

                scannerStreamRef.current = stream;

                if (!videoRef.current) {
                    throw new Error('No se pudo preparar la cámara.');
                }

                videoRef.current.srcObject = stream;
                await videoRef.current.play();
                setIsScannerStarting(false);

                const detector = new BarcodeDetector({ formats: ['qr_code'] });

                const scanFrame = async () => {
                    const video = videoRef.current;

                    if (!video || cancelled) {
                        return;
                    }

                    try {
                        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                            const codes = await detector.detect(video);
                            const qrValue = codes.find(code => Boolean(code.rawValue))?.rawValue;

                            if (qrValue) {
                                stopScanner();
                                setIsScannerOpen(false);
                                await searchByQrPayload(qrValue);
                                return;
                            }
                        }
                    } catch (error) {
                        console.warn('No se pudo leer el cuadro actual del QR.', error);
                    }

                    scannerFrameRef.current = requestAnimationFrame(scanFrame);
                };

                scannerFrameRef.current = requestAnimationFrame(scanFrame);
            } catch (error) {
                console.error('Error starting QR scanner:', error);
                stopScanner();
                setScannerError(
                    error instanceof Error
                        ? error.message
                        : 'No se pudo iniciar la cámara para escanear el QR.'
                );
            }
        };

        startScanner();

        return () => {
            cancelled = true;
            stopScanner();
        };
    }, [isScannerOpen, searchByQrPayload, stopScanner]);

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
            if (deliveryCodeFromUrl) setDeliveryCode(deliveryCodeFromUrl);
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
            } else if (newStatus === 'paid' && purchaseToLog.status === 'pending') {
                await confirmPendingPurchaseAndUpdateStock(purchaseId, currentUser);
            } else {
                 await updatePurchase(purchaseId, { status: newStatus });
            }

            setSearchResults(prev => prev.map(p => p.id === purchaseId ? { ...p, status: newStatus } : p));
            setRecentPurchases(prev => prev.map(p => p.id === purchaseId ? { ...p, status: newStatus } : p));
            toast({
                title: 'Éxito',
                description: `El estado de la compra ha sido actualizado a ${statusTranslations[newStatus]}.`
            });

            // Add audit log for payment confirmation when no stock-moving service already logged it.
            if (newStatus === 'paid' && purchaseToLog.status !== 'pending') {
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

    const getSelectedDeliveryQuantity = (purchaseId: string, productId: string) => (
        deliveryQuantities[purchaseId]?.[productId] || 0
    );

    const setSelectedDeliveryQuantity = (purchase: Purchase, productId: string, quantity: number) => {
        const item = purchase.items.find(currentItem => currentItem.id === productId);
        if (!item) return;
        const pendingQuantity = Math.max(item.quantity - (item.deliveredQuantity || 0), 0);
        const nextQuantity = Math.min(Math.max(quantity, 0), pendingQuantity);
        setDeliveryQuantities(prev => ({
            ...prev,
            [purchase.id]: {
                ...(prev[purchase.id] || {}),
                [productId]: nextQuantity,
            },
        }));
    };

    const selectAllPendingForDelivery = (purchase: Purchase) => {
        setDeliveryQuantities(prev => ({
            ...prev,
            [purchase.id]: purchase.items.reduce<Record<string, number>>((acc, item) => {
                acc[item.id] = Math.max(item.quantity - (item.deliveredQuantity || 0), 0);
                return acc;
            }, {}),
        }));
    };

    const handleDeliverSelectedItems = async (purchase: Purchase) => {
        if (!currentUser) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo identificar al usuario actual.' });
            return;
        }

        setIsUpdating(true);
        try {
            const updatedPurchase = await deliverPurchaseItems(
                purchase.id,
                deliveryQuantities[purchase.id] || {},
                currentUser,
                deliveryCode.trim().toUpperCase() || undefined
            );
            setSearchResults(prev => prev.map(item => item.id === purchase.id ? updatedPurchase : item));
            setRecentPurchases(prev => prev.map(item => item.id === purchase.id ? updatedPurchase : item));
            setDeliveryQuantities(prev => ({ ...prev, [purchase.id]: {} }));
            toast({ title: 'Entrega registrada', description: 'Las unidades seleccionadas fueron marcadas como entregadas.' });
        } catch (error) {
            console.error('Error delivering purchase items:', error);
            toast({
                variant: 'destructive',
                title: 'Error de entrega',
                description: (error as Error).message || 'No se pudieron entregar los productos.',
            });
        } finally {
            setIsUpdating(false);
        }
    };

    const renderDeliveryButton = (purchase: Purchase) => {
        const selectedTotal = Object.values(deliveryQuantities[purchase.id] || {}).reduce((total, quantity) => total + quantity, 0);
        const pendingTotal = purchase.items.reduce((total, item) => total + Math.max(item.quantity - (item.deliveredQuantity || 0), 0), 0);

        if (pendingTotal <= 0) {
            return (
                <div className="flex items-center justify-center w-full text-green-700 font-semibold">
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Compra Entregada
                </div>
            );
        }

        return (
            <div className="grid w-full gap-2">
                <Button type="button" variant="outline" onClick={() => selectAllPendingForDelivery(purchase)} disabled={isUpdating}>
                    Seleccionar todo pendiente ({pendingTotal})
                </Button>
                <Button
                    className="w-full bg-green-600 hover:bg-green-700"
                    onClick={() => handleDeliverSelectedItems(purchase)}
                    disabled={isUpdating || selectedTotal <= 0}
                >
                    <PackageCheck className="mr-2 h-4 w-4" />
                    {isUpdating
                        ? 'Entregando...'
                        : purchase.status === 'pending'
                            ? `Entregar y descontar (${selectedTotal})`
                            : `Entregar seleccionados (${selectedTotal})`}
                </Button>
            </div>
        );
    };

    const renderActionButton = (purchase: Purchase) => {
        if (isSeller && !['paid', 'pre-sale-confirmed', 'partially-delivered', 'delivered'].includes(purchase.status)) {
            return (
                <div className="w-full rounded-md border border-dashed bg-muted/50 p-3 text-center text-sm text-muted-foreground">
                    Esta compra debe estar confirmada antes de entregarla.
                </div>
            );
        }

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
                return renderDeliveryButton(purchase);
            case 'pending':
                return renderDeliveryButton(purchase);
            case 'paid':
            case 'partially-delivered':
                return renderDeliveryButton(purchase);
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
                description={isSeller ? "Escanee el QR o ingrese el código de compra para entregar productos." : "Busque una compra por código, cédula o celular para verificar y entregar."}
            />
            {!isSeller && <Card className="mb-8">
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
            </Card>}
            <div className="grid gap-8 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Buscar Compra</CardTitle>
                        <CardDescription>
                            {isSeller ? 'Escanee el QR o digite el código entregado al cliente.' : 'Ingrese uno de los campos para encontrar el registro de la compra.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form id="search-form" onSubmit={handleSearch} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="ticket-code">Código de compra o QR</Label>
                                <Input id="ticket-code" placeholder="ej., PVX0001" className="font-mono" value={searchCode} onChange={e => setSearchCode(e.target.value)} />
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="delivery-code">Código adicional del QR</Label>
                                <Input id="delivery-code" placeholder="ej., A1B2C3D4" className="font-mono uppercase" value={deliveryCode} onChange={e => setDeliveryCode(e.target.value.toUpperCase())} />
                            </div>
                            {!isSeller && (
                                <>
                             <div className="space-y-2">
                                <Label htmlFor="cedula">Cédula del Cliente</Label>
                                <Input id="cedula" placeholder="ej., 123456789" value={searchCedula} onChange={e => setSearchCedula(e.target.value)} />
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="celular">Celular del Cliente</Label>
                                <Input id="celular" placeholder="ej., 3001234567" value={searchCelular} onChange={e => setSearchCelular(e.target.value)} />
                            </div>
                                </>
                            )}
                        </form>
                    </CardContent>
                    <CardFooter className="grid gap-2 sm:grid-cols-2">
                         <Button variant="outline" type="button" onClick={() => setIsScannerOpen(true)} disabled={isLoading}>
                            <Camera className="mr-2 h-4 w-4" />
                            Escanear QR
                        </Button>
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
                                                            {isSeller ? `Fecha: ${purchase.date}` : `Fecha: ${purchase.date} | Cédula: ${purchase.cedula} | Celular: ${purchase.celular}`}
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
                                                    {purchase.items.map(item => {
                                                        const delivered = item.deliveredQuantity || 0;
                                                        const pending = Math.max(item.quantity - delivered, 0);
                                                        const selected = getSelectedDeliveryQuantity(purchase.id, item.id);

                                                        return (
                                                            <li key={item.id} className="flex flex-col gap-2 rounded-md border bg-background p-2 sm:flex-row sm:items-center sm:justify-between">
                                                                <div>
                                                                    <p className="font-medium">{item.name} (x{item.quantity}) - {formatCurrency(item.price * item.quantity)}</p>
                                                                    <p className="text-xs text-muted-foreground">Entregado: {delivered} | Pendiente: {pending}</p>
                                                                </div>
                                                                {pending > 0 && (purchase.status === 'pending' || purchase.status === 'paid' || purchase.status === 'pre-sale-confirmed' || purchase.status === 'partially-delivered') && (
                                                                    <div className="flex items-center gap-2">
                                                                        <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setSelectedDeliveryQuantity(purchase, item.id, selected - 1)}>
                                                                            <Minus className="h-3 w-3" />
                                                                        </Button>
                                                                        <Input
                                                                            className="h-7 w-14 text-center"
                                                                            value={selected}
                                                                            onChange={event => setSelectedDeliveryQuantity(purchase, item.id, Number(event.target.value.replace(/[^0-9]/g, '') || 0))}
                                                                        />
                                                                        <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setSelectedDeliveryQuantity(purchase, item.id, selected + 1)}>
                                                                            <Plus className="h-3 w-3" />
                                                                        </Button>
                                                                    </div>
                                                                )}
                                                            </li>
                                                        );
                                                    })}
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
            <Dialog open={isScannerOpen} onOpenChange={handleScannerOpenChange}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Escanear QR de compra</DialogTitle>
                        <DialogDescription>
                            Al detectar el código, se cargará la compra con sus productos pendientes.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="overflow-hidden rounded-md border bg-black">
                        <video
                            ref={videoRef}
                            className="aspect-video w-full object-cover"
                            muted
                            playsInline
                        />
                    </div>
                    {isScannerStarting && (
                        <p className="text-sm text-muted-foreground">Activando cámara...</p>
                    )}
                    {scannerError && (
                        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                            <VideoOff className="mt-0.5 h-4 w-4 shrink-0" />
                            <p>{scannerError}</p>
                        </div>
                    )}
                    <DialogFooter>
                        <Button type="button" variant="secondary" onClick={() => handleScannerOpenChange(false)}>
                            Cerrar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
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
