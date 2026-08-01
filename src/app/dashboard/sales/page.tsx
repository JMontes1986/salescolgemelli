
"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Product, Ticket, Purchase, User } from "@/lib/types";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Plus, Minus, Hourglass, Search, XCircle } from "lucide-react";
import { formatCurrency, cn } from '@/lib/utils';
import { getProductsByAvailability } from '@/lib/services/product-service';
import { addPurchase, type NewPurchase, cancelPurchaseAndUpdateStock, deleteSelfServicePurchaseHistoryByCedula, getSelfServicePendingPurchases, getSelfServiceReservedQuantityMap } from '@/lib/services/purchase-service';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import Link from 'next/link';
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
import { addAuditLog } from '@/lib/services/audit-service';
import { useSupabaseRealtime } from '@/hooks/use-supabase-realtime';
import { PurchaseModifiedIndicator } from '@/components/purchase-modified-indicator';


type CartItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  type: 'product' | 'ticket';
  stock?: number;
};

export default function SalesPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerPayment, setCustomerPayment] = useState<number>(0);
  const [customerCedula, setCustomerCedula] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [pendingSelfServicePurchases, setPendingSelfServicePurchases] = useState<Purchase[]>([]);
  const [selfServiceReservedQuantities, setSelfServiceReservedQuantities] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { currentUser, isMounted } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [historyCedulaToDelete, setHistoryCedulaToDelete] = useState('');
  const [isDeletingHistory, setIsDeletingHistory] = useState(false);
  const realtimeTables = useMemo(() => ['products', 'purchases', 'self_service_reservations'] as const, []);

  const loadData = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setIsLoading(true);
    }
    try {
        const [fetchedProducts, pendingPurchases, reservedQuantities] = await Promise.all([
            getProductsByAvailability('pos'),
            getSelfServicePendingPurchases(),
            getSelfServiceReservedQuantityMap(undefined, 0),
        ]);
        setProducts(fetchedProducts);
        setPendingSelfServicePurchases(pendingPurchases);
        setSelfServiceReservedQuantities(reservedQuantities);
    } catch (error) {
        console.error("Error fetching data:", error);
    } finally {
        if (showLoading) {
          setIsLoading(false);
        }
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useSupabaseRealtime({
    tables: realtimeTables,
    onChange: () => loadData(false),
    fallbackIntervalMs: 3_000,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') {
        void loadData(false);
      }
    };

    const intervalId = window.setInterval(refreshIfVisible, 3_000);
    window.addEventListener('focus', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [loadData]);

  const selfServicePendingQuantities = selfServiceReservedQuantities;

  useEffect(() => {
    setCart((prevCart) => prevCart.reduce<CartItem[]>((nextCart, item) => {
      if (item.type !== 'product') {
        nextCart.push(item);
        return nextCart;
      }

      const product = products.find((currentProduct) => currentProduct.id === item.id);
      if (!product) return nextCart;

      const availableStock = Math.max(product.stock - (selfServiceReservedQuantities[product.id] || 0), 0);
      if (availableStock <= 0) return nextCart;

      nextCart.push({
        ...item,
        stock: availableStock,
        quantity: Math.min(item.quantity, availableStock),
      });
      return nextCart;
    }, []));
  }, [products, selfServiceReservedQuantities]);

  const addToCart = (item: Product) => {
    const product = products.find(p => p.id === item.id);
    if (!product) return;

    const existingItem = cart.find((cartItem) => cartItem.id === item.id);
    const availableStock = Math.max(product.stock - (selfServiceReservedQuantities[product.id] || 0), 0);

    if (availableStock <= 0) {
      toast({ variant: "destructive", title: "Sin Stock", description: `${product.name} está agotado.` });
      return;
    }
    if (existingItem && existingItem.quantity >= availableStock) {
      toast({ variant: "destructive", title: "Límite de Stock", description: `No puedes agregar más ${product.name}.` });
      return;
    }
      
    setCart((prevCart) => {
      if (existingItem) {
        return prevCart.map((cartItem) =>
          cartItem.id === item.id
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem
        );
      }
      return [...prevCart, { id: item.id, name: item.name, price: item.price, quantity: 1, type: 'product', stock: item.stock }];
    });
  };

  const updateQuantity = (id: string, newQuantity: number) => {
    const itemToUpdate = cart.find(item => item.id === id);
    const productInDb = products.find(p => p.id === id);

    let finalQuantity = newQuantity;

    if (itemToUpdate?.type === 'product' && productInDb) {
      const availableStock = Math.max(productInDb.stock - (selfServiceReservedQuantities[productInDb.id] || 0), 0);
      if (finalQuantity > availableStock) {
          toast({ variant: "destructive", title: "Límite de Stock", description: `Solo quedan ${availableStock} unidades disponibles de ${itemToUpdate.name}.` });
          finalQuantity = availableStock;
      }
    }
    
    setCart((prevCart) => {
      if (finalQuantity <= 0) {
        return prevCart.filter((item) => item.id !== id);
      }
      return prevCart.map((item) =>
        item.id === id ? { ...item, quantity: finalQuantity } : item
      );
    });
  };

  const removeFromCart = (id: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== id));
  };
  
  const clearCart = () => {
    setCart([]);
    setCustomerPayment(0);
    setCustomerCedula('');
  };

  const handlePurchase = async () => {
    if (cart.length === 0) {
        toast({ variant: "destructive", title: "Error", description: "El carrito está vacío." });
        return;
    }
    setIsProcessing(true);


    const newPurchaseData: NewPurchase = {
        date: new Date().toLocaleString('es-CO'),
        total: subtotal,
        items: cart,
        cedula: customerCedula.trim(), // Optional POS customer profile association
        celular: 'N/A',
        sellerId: currentUser?.id,
        sellerName: currentUser?.name,
        status: 'paid', // POS sales are directly paid
    };

    try {
        await addPurchase(newPurchaseData);
        toast({ title: "Venta Exitosa", description: "La compra ha sido registrada." });
        clearCart();
        loadData(); // Reload data after purchase
    } catch (error) {
        console.error("Error creating purchase:", error);
        toast({ variant: "destructive", title: "Error en la Venta", description: (error as Error).message || "No se pudo registrar la venta." });
    } finally {
        setIsProcessing(false);
    }
  }

  const handleDeleteSelfServiceHistory = async () => {
    if (currentUser?.role !== 'admin') return;

    const cedulaToDelete = historyCedulaToDelete.trim();
    if (!cedulaToDelete) {
      toast({ variant: "destructive", title: "Ingrese la cédula", description: "Escriba la cédula del padre de familia." });
      return;
    }

    setIsDeletingHistory(true);
    try {
      const deletedCount = await deleteSelfServicePurchaseHistoryByCedula(cedulaToDelete);
      toast({
        title: "Historial eliminado",
        description: deletedCount > 0
          ? `Se eliminaron ${deletedCount} compra(s) de autogestión para la cédula ${cedulaToDelete}.`
          : `No había compras de autogestión para la cédula ${cedulaToDelete}.`,
      });
      setHistoryCedulaToDelete('');
      await loadData(false);
    } catch (error) {
      toast({ variant: "destructive", title: "No se pudo eliminar", description: (error as Error).message || "Revise la cédula e intente de nuevo." });
    } finally {
      setIsDeletingHistory(false);
    }
  };


  const handleCancelPurchase = async (purchase: Purchase) => {
    if (!currentUser) return;
    try {
        await cancelPurchaseAndUpdateStock(purchase.id);
        await addAuditLog({
            userId: currentUser.id,
            userName: currentUser.name,
            action: 'TICKET_VOID', // Reusing this for cancellation
            details: purchase.status === 'pre-sale' || (!purchase.sellerId && purchase.status === 'pending')
              ? `Reserva anterior de autogestión ${purchase.id} cancelada. Stock real sin cambios.`
              : `Compra pendiente ${purchase.id} cancelada. Stock devuelto.`,
        });
        toast({
            title: "Compra Cancelada",
            description: purchase.status === 'pre-sale' || (!purchase.sellerId && purchase.status === 'pending')
              ? "La reserva anterior fue cancelada sin mover el stock real."
              : "La compra ha sido cancelada y el stock devuelto.",
        });
        loadData();
    } catch (error) {
        console.error("Error canceling purchase:", error);
        toast({ variant: "destructive", title: "Error", description: "No se pudo cancelar la compra." });
    }
  };


  const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const change = customerPayment - subtotal;

  const handlePaymentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/[^0-9]/g, '');
    const numericValue = parseInt(rawValue, 10) || 0;
    setCustomerPayment(numericValue);
  };

  const formattedPayment = new Intl.NumberFormat('es-CO').format(customerPayment);

  return (
    <div className="w-full min-w-0 overflow-x-hidden">
      <PageHeader
        title="Punto de Venta"
        description="Seleccione productos y registre una nueva venta."
      />
      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)] lg:gap-8">
        
        {/* Product and Ticket List */}
        <div className="min-w-0 space-y-5 sm:space-y-6">
            <Card>
                <CardHeader className="p-4 sm:p-6">
                    <CardTitle>Productos Disponibles</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                    <ScrollArea className="h-[52dvh] min-h-80 sm:h-[60vh]">
                         {isLoading ? (
                            <p className="text-muted-foreground p-3">Cargando productos...</p>
                         ) : (
                            <div className="flex flex-col gap-2">
                                {products.length === 0 ? (
                                    <p className="text-muted-foreground p-3">No hay productos disponibles para la venta.</p>
                                ) : (
                                    products.map((product) => {
                                      const selfServiceReserved = selfServiceReservedQuantities[product.id] || 0;
                                      const selfServicePending = selfServicePendingQuantities[product.id] || 0;
                                      const availableStock = Math.max(product.stock - selfServiceReserved, 0);
                                      const isSoldOut = availableStock <= 0;
                                      return (
                                        <div key={product.id} className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-lg bg-muted/50 p-3 sm:flex sm:items-center sm:justify-between", isSoldOut && "opacity-50")}>
                                            <div className="flex min-w-0 items-center gap-3">
                                                <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-md bg-secondary sm:h-10 sm:w-10">
                                                   <Image 
                                                        src={product.imageUrl}
                                                        alt={product.name}
                                                        width={200}
                                                        height={200}
                                                        className="h-full w-full rounded-md object-cover"
                                                    />
                                                </div>
                                                <div className="w-full min-w-0 overflow-x-hidden">
                                                    <p className="break-words font-semibold leading-tight">{product.name}</p>
                                                    <p className="text-sm text-muted-foreground">{formatCurrency(product.price)}</p>
                                                </div>
                                            </div>
                                            <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1 sm:justify-end">
                                                {isSoldOut ? (
                                                    <Badge variant="destructive">Agotado</Badge>
                                                ) : (
                                                    <div className='flex flex-wrap items-center gap-1.5'>
                                                        <Badge variant="outline">Stock: {product.stock}</Badge>
                                                        {selfServicePending > 0 && (
                                                            <Badge variant="secondary" className="bg-purple-500/20 text-purple-700">Autogestión: {selfServicePending}</Badge>
                                                        )}
                                                        <Badge variant={availableStock > 0 ? "secondary" : "destructive"}>Disp.: {availableStock}</Badge>
                                                    </div>
                                                )}
                                                <Button className="ml-auto min-h-11 flex-1 active:scale-[0.98] sm:min-h-9 sm:flex-none" onClick={() => addToCart(product)} disabled={isSoldOut}>
                                                    Agregar
                                                </Button>
                                            </div>
                                        </div>
                                      )
                                    })
                                )}
                            </div>
                         )}
                    </ScrollArea>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="flex items-center gap-2">
                        <Hourglass />
                        Compras de Autogestión Pendientes
                    </CardTitle>
                    <CardDescription>
                        Estas compras fueron iniciadas en el portal y están pendientes de pago en caja.
                    </CardDescription>
                </CardHeader>
                <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6">
                    <ScrollArea className="h-48">
                         {isLoading ? (
                            <p className="text-muted-foreground p-3">Cargando...</p>
                         ) : pendingSelfServicePurchases.length === 0 ? (
                            <p className="text-muted-foreground p-3 text-center">No hay compras pendientes de autogestión.</p>
                         ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Código</TableHead>
                                        <TableHead>Cliente (Cédula)</TableHead>
                                        <TableHead className="text-right">Monto</TableHead>
                                        <TableHead className="text-right">Acción</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pendingSelfServicePurchases.map((purchase) => (
                                        <TableRow key={purchase.id}>
                                            <TableCell>
                                                <div className="font-mono">{purchase.id}</div>
                                                <PurchaseModifiedIndicator
                                                  purchase={purchase}
                                                  className="mt-2 w-fit font-sans"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                {purchase.cedula}
                                            </TableCell>
                                            <TableCell className="text-right font-medium">
                                                {formatCurrency(purchase.total)}
                                            </TableCell>
                                            <TableCell className="text-right space-x-2">
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="destructive" size="sm">
                                                            <XCircle className="mr-2 h-4 w-4" />
                                                            Cancelar
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                        <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Esta acción cancelará la compra con código <span className="font-mono font-bold">{purchase.id}</span>. La disponibilidad reservada quedará liberada. Esta acción no se puede deshacer.
                                                        </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                        <AlertDialogCancel>Cerrar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleCancelPurchase(purchase)}>
                                                            Confirmar Cancelación
                                                        </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>

                                                <Button asChild variant="outline" size="sm">
                                                    <Link href={`/dashboard/redeem?code=${purchase.id}`}>
                                                        <Search className="mr-2 h-4 w-4" />
                                                        Verificar
                                                    </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                         )}
                    </ScrollArea>
                </CardContent>
            </Card>

            {currentUser?.role === 'admin' && (
              <Card className="border-destructive/30">
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="flex items-center gap-2 text-destructive">
                    <Trash2 className="h-5 w-5" />
                    Eliminar historial de autogestión
                  </CardTitle>
                  <CardDescription>
                    Borra todas las compras de autogestión asociadas a la cédula indicada. No elimina ventas POS registradas por caja.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    value={historyCedulaToDelete}
                    onChange={(event) => setHistoryCedulaToDelete(event.target.value)}
                    placeholder="Cédula del padre de familia"
                    inputMode="numeric"
                    autoComplete="off"
                  />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        className="w-full"
                        disabled={isDeletingHistory || historyCedulaToDelete.trim().length < 4}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {isDeletingHistory ? 'Eliminando...' : 'Eliminar historial'}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Eliminar historial de autogestión</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta acción borrará todas las compras de autogestión de la cédula <span className="font-mono font-bold">{historyCedulaToDelete.trim() || 'sin cédula'}</span>. También se liberarán reservas asociadas. Esta acción no se puede deshacer.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteSelfServiceHistory}>
                          Confirmar eliminación
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            )}
        </div>

        {/* Cart and Checkout */}
        <div className="w-full min-w-0 overflow-x-hidden">
          <Card className="overflow-hidden bg-blue-950 text-white lg:sticky lg:top-20">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle>Carrito de Compras</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6">
                <ScrollArea className="h-64 mb-4">
                    {cart.length === 0 ? (
                        <p className="text-center text-blue-300">El carrito está vacío</p>
                    ) : (
                        <>
                          <div className="space-y-2 sm:hidden">
                            {cart.map((item) => (
                              <div key={item.id} className="rounded-lg border border-blue-800 bg-blue-900/50 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="break-words font-semibold leading-tight text-white">{item.name}</p>
                                    <p className="mt-1 font-semibold text-green-400">{formatCurrency(item.price * item.quantity)}</p>
                                  </div>
                                  <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0 text-red-400 hover:bg-red-500/20 hover:text-red-300" aria-label={`Eliminar ${item.name} del carrito`} onClick={() => removeFromCart(item.id)}>
                                    <Trash2 className="h-5 w-5" />
                                  </Button>
                                </div>
                                <div className="mt-3 grid grid-cols-[2.75rem_minmax(3.5rem,1fr)_2.75rem] items-center gap-2">
                                  <Button size="icon" variant="outline" className="h-11 w-11 border-blue-700 bg-blue-800 hover:bg-blue-700" aria-label={`Restar una unidad de ${item.name}`} onClick={() => updateQuantity(item.id, item.quantity - 1)}>
                                    <Minus className="h-5 w-5" />
                                  </Button>
                                  <Input type="text" inputMode="numeric" aria-label={`Cantidad de ${item.name}`} value={item.quantity} onChange={(event) => {
                                    const numericValue = event.target.value.replace(/[^0-9]/g, "");
                                    updateQuantity(item.id, numericValue === "" ? 0 : parseInt(numericValue, 10));
                                  }} className="h-11 w-full border-blue-700 bg-blue-900 text-center text-lg font-semibold" />
                                  <Button size="icon" variant="outline" className="h-11 w-11 border-blue-700 bg-blue-800 hover:bg-blue-700" aria-label={`Agregar una unidad de ${item.name}`} onClick={() => updateQuantity(item.id, item.quantity + 1)}>
                                    <Plus className="h-5 w-5" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="hidden sm:block">
                            <Table>
                            <TableBody>
                                {cart.map(item => (
                                    <TableRow key={item.id} className="border-blue-800 hover:bg-blue-900">
                                        <TableCell className="text-white font-medium">{item.name}</TableCell>
                                        <TableCell>
                                            <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1 sm:justify-end">
                                                <Button size="icon" variant="outline" className="h-9 w-9 border-blue-700 bg-blue-800 hover:bg-blue-700" onClick={() => updateQuantity(item.id, item.quantity - 1)}>
                                                    <Minus className="h-4 w-4" />
                                                </Button>
                                                <Input
                                                    type="text"
                                                    value={item.quantity}
                                                    onChange={(e) => {
                                                        const value = e.target.value;
                                                        // Allow only numbers
                                                        const numericValue = value.replace(/[^0-9]/g, '');
                                                        // If empty, treat as 0, otherwise parse as integer
                                                        const newQuantity = numericValue === '' ? 0 : parseInt(numericValue, 10);
                                                        updateQuantity(item.id, newQuantity);
                                                    }}
                                                    className="h-9 w-14 border-blue-700 bg-blue-900 text-center"
                                                />
                                                <Button size="icon" variant="outline" className="h-9 w-9 border-blue-700 bg-blue-800 hover:bg-blue-700" onClick={() => updateQuantity(item.id, item.quantity + 1)}>
                                                    <Plus className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right text-green-400 font-semibold">{formatCurrency(item.price * item.quantity)}</TableCell>
                                        <TableCell className="text-right">
                                            <Button size="icon" variant="ghost" className="text-red-500 hover:bg-red-500/20 hover:text-red-400" onClick={() => removeFromCart(item.id)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                          </div>
                        </>
                    )}
                </ScrollArea>

                    <div className="space-y-2 rounded-lg border border-blue-800 bg-blue-900/40 p-3">
                        <label htmlFor="customer-cedula" className="text-sm font-semibold text-blue-100">CÉDULA DEL COMPRADOR (OPCIONAL)</label>
                        <Input
                            id="customer-cedula"
                            type="text"
                            inputMode="numeric"
                            className="bg-blue-900 border-blue-700 font-mono"
                            placeholder="Ej. 123456789"
                            value={customerCedula}
                            onChange={(event) => setCustomerCedula(event.target.value.replace(/[^0-9A-Za-z.-]/g, ''))}
                        />
                        <p className="text-xs text-blue-200">Si se registra, la compra quedará cargada al perfil de autogestión del padre de familia.</p>
                    </div>
                <div className="space-y-4 text-lg">
                    <div className="flex justify-between font-bold">
                        <span>SUBTOTAL</span>
                        <span>{formatCurrency(subtotal)}</span>
                    </div>
                     <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <label htmlFor="customer-payment" className="font-semibold">CLIENTE</label>
                        <Input 
                            id="customer-payment"
                            type="text"
                            className="h-12 w-full border-blue-700 bg-blue-900 text-right text-xl font-bold sm:w-36"
                            placeholder="0"
                            value={customerPayment === 0 ? '' : formattedPayment}
                            onChange={handlePaymentChange}
                        />
                    </div>
                    <div className="flex justify-between font-bold text-red-500">
                        <span>DEVOLUCIÓN</span>
                        <span>{formatCurrency(change > 0 && customerPayment > subtotal ? change : 0)}</span>
                    </div>
                </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2 px-3 pb-4 sm:flex-row sm:px-6 sm:pb-6">
                 <Button 
                    className="w-full text-lg h-12 bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
                    onClick={handlePurchase}
                    disabled={isProcessing}
                  >
                    {isProcessing ? 'Procesando...' : 'Comprar'}
                </Button>
                <Button variant="destructive" className="w-full text-lg h-12" onClick={clearCart}>
                    Borrar Todo
                </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
