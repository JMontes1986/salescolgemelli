
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Product, Purchase } from "@/lib/types";
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
  TableRow,
  TableHeader,
  TableHead,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Plus, Minus, Search, Printer, Download, Pencil, PackagePlus, CheckCircle } from "lucide-react";
import { formatCurrency, cn } from '@/lib/utils';
import { getProductsByAvailability } from '@/lib/services/product-service';
import { addPreSalePurchase, type NewPurchase, getPreSalesByCedula, getDashboardPreSales, updatePendingPurchase, confirmPreSaleAndUpdateStock, cancelPurchaseAndUpdateStock } from '@/lib/services/purchase-service';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import { Label } from '@/components/ui/label';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Logo } from '@/components/icons';
import { useSupabaseRealtime } from '@/hooks/use-supabase-realtime';

const PRESALE_REALTIME_TABLES = ['products', 'purchases'] as const;

type CartItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  stock: number;
};

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

export default function PreSalePage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isProductsLoading, setIsProductsLoading] = useState(true);
  const [isPreSalesLoading, setIsPreSalesLoading] = useState(true);
  const [customerIdentifier, setCustomerIdentifier] = useState('');
  const [customerCelular, setCustomerCelular] = useState('');
  const { toast } = useToast();
  const { currentUser } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [confirmingPurchaseId, setConfirmingPurchaseId] = useState<string | null>(null);
  const [deletingPurchaseId, setDeletingPurchaseId] = useState<string | null>(null);

  // For confirmation dialog
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [lastPurchase, setLastPurchase] = useState<Purchase | null>(null);
  const confirmationDialogRef = useRef<HTMLDivElement>(null);

  // For history/search
  const [allPreSales, setAllPreSales] = useState<Purchase[]>([]);
  const [recentPreSales, setRecentPreSales] = useState<Purchase[]>([]);
  const [searchCedula, setSearchCedula] = useState('');
  const [searchResults, setSearchResults] = useState<Purchase[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const canManagePreSales = currentUser?.permissions.includes('presale') ?? false;

  const loadProducts = useCallback(async () => {
    setIsProductsLoading(true);
    try {
        const fetchedProducts = await getProductsByAvailability('presale');
        setProducts(fetchedProducts);
    } catch (error) {
        console.error("Error fetching products:", error);
        toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los productos de preventa." });
    } finally {
        setIsProductsLoading(false);
    }
  }, [toast]);

  const loadPreSales = useCallback(async () => {
    setIsPreSalesLoading(true);
    try {
        const all = await getDashboardPreSales();
        setRecentPreSales(all.slice(0, 5));
        setAllPreSales(all);
    } catch (error) {
        console.error("Error fetching pre-sales:", error);
        toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar las preventas." });
    } finally {
        setIsPreSalesLoading(false);
    }
  }, [toast]);

  const loadData = useCallback(() => {
    void loadProducts();
    void loadPreSales();
  }, [loadProducts, loadPreSales]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useSupabaseRealtime({
    tables: PRESALE_REALTIME_TABLES,
    onChange: loadData,
  });

  const addToCart = (item: Product) => {
    setCart((prevCart) => {
      const existingItem = prevCart.find((cartItem) => cartItem.id === item.id);
      if (existingItem) {
        return prevCart.map((cartItem) =>
          cartItem.id === item.id
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem
        );
      }
      return [...prevCart, { id: item.id, name: item.name, price: item.price, quantity: 1, stock: item.stock }];
    });
  };

  const updateQuantity = (id: string, newQuantity: number) => {
    setCart((prevCart) => {
      if (newQuantity <= 0) {
        return prevCart.filter((item) => item.id !== id);
      }
      return prevCart.map((item) =>
        item.id === id ? { ...item, quantity: newQuantity } : item
      );
    });
  };

  const removeFromCart = (id: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== id));
  };
  
  const clearCart = () => {
    setCart([]);
    setCustomerIdentifier('');
    setCustomerCelular('');
    setEditingPurchase(null);
  };

  const handlePreSale = async () => {
    if (cart.length === 0) {
        toast({ variant: "destructive", title: "Error", description: "El carrito está vacío." });
        return;
    }
    
    if (editingPurchase) {
        handleUpdatePurchase();
        return;
    }

    if (!currentUser) {
        toast({ variant: "destructive", title: "Error", description: "No se pudo identificar al usuario actual. Vuelva a iniciar sesiÃ³n." });
        return;
    }

    if (!customerIdentifier) {
        toast({ variant: "destructive", title: "Error", description: "Debe ingresar la cédula o código del estudiante." });
        return;
    }
     if (!customerCelular) {
        toast({ variant: "destructive", title: "Error", description: "Debe ingresar el número de celular del cliente." });
        return;
    }
    setIsProcessing(true);

    const newPreSaleData: NewPurchase = {
        date: new Date().toLocaleString('es-CO'),
        total: subtotal,
        items: cart.map(({ stock, ...item }) => item),
        cedula: customerIdentifier,
        celular: customerCelular,
        sellerId: currentUser?.id,
        sellerName: currentUser?.name,
        status: 'pre-sale',
    };

    try {
        const addedPurchase = await addPreSalePurchase(newPreSaleData);
        setLastPurchase(addedPurchase);
        setIsConfirmationOpen(true);
        toast({ title: "Preventa Exitosa", description: "La preventa fue registrada y el stock planificado aumentó correctamente." });
        
        clearCart();
        loadData(); // Refresh recent presales
    } catch (error) {
        console.error("Error creating pre-sale:", error);
        toast({ variant: "destructive", title: "Error en la Preventa", description: (error as Error).message || "No se pudo registrar la preventa." });
    } finally {
        setIsProcessing(false);
    }
  }

  const handleUpdatePurchase = async () => {
    if (!editingPurchase || cart.length === 0) return;
    setIsProcessing(true);
    
    try {
        await updatePendingPurchase(editingPurchase.id, cart.map(({ stock, ...item }) => item));
        
        setLastPurchase({ ...editingPurchase, items: cart, total: subtotal });
        setIsConfirmationOpen(true);
        toast({ title: "Éxito", description: "Su preventa ha sido actualizada correctamente." });

        clearCart();
        loadData();

    } catch (error) {
        console.error("Error updating purchase:", error);
        toast({ variant: "destructive", title: "Error al Actualizar", description: (error as Error).message || "No se pudo actualizar la preventa." });
    } finally {
        setIsProcessing(false);
    }
  };

  const handleEditPurchase = (purchase: Purchase) => {
    const cartItems: CartItem[] = purchase.items.map(item => {
        const product = products.find(p => p.id === item.id);
        return {
            ...item,
            stock: product ? product.stock + item.quantity : item.quantity,
        }
    });
    setCart(cartItems);
    setEditingPurchase(purchase);
    setCustomerIdentifier(purchase.cedula);
    setCustomerCelular(purchase.celular);
    toast({ title: "Modo Edición", description: "La preventa ha sido cargada en el carrito." });
  }

  const handleConfirmPreSale = async (purchase: Purchase) => {
    if (!currentUser) {
        toast({ variant: "destructive", title: "Error", description: "No se pudo identificar al usuario actual." });
        return;
    }

    if (purchase.status !== 'pre-sale') {
        toast({ variant: "destructive", title: "Preventa no disponible", description: "Esta preventa ya fue confirmada o procesada." });
        return;
    }

    setConfirmingPurchaseId(purchase.id);

    try {
        await confirmPreSaleAndUpdateStock(purchase.id, currentUser);
        const confirmedPurchase: Purchase = { ...purchase, status: 'pre-sale-confirmed' };

        setRecentPreSales(prev => prev.map(item => item.id === purchase.id ? confirmedPurchase : item));
        setAllPreSales(prev => prev.map(item => item.id === purchase.id ? confirmedPurchase : item));
        setSearchResults(prev => prev.map(item => item.id === purchase.id ? confirmedPurchase : item));

        if (editingPurchase?.id === purchase.id) {
            clearCart();
        }

        toast({
            title: "Preventa lista",
            description: "La preventa fue confirmada en este módulo y queda lista para entrega."
        });
    } catch (error) {
        console.error("Error confirming pre-sale:", error);
        toast({
            variant: "destructive",
            title: "Error al confirmar",
            description: (error as Error).message || "No se pudo confirmar la preventa."
        });
    } finally {
        setConfirmingPurchaseId(null);
    }
  }

  const handleDeletePreSale = async (purchase: Purchase) => {
    if (purchase.status !== 'pre-sale' && purchase.status !== 'pre-sale-confirmed') {
        toast({ variant: "destructive", title: "Preventa no disponible", description: "Solo se pueden eliminar preventas pendientes o confirmadas." });
        return;
    }

    setDeletingPurchaseId(purchase.id);

    try {
        await cancelPurchaseAndUpdateStock(purchase.id);

        setRecentPreSales(prev => prev.filter(item => item.id !== purchase.id));
        setAllPreSales(prev => prev.filter(item => item.id !== purchase.id));
        setSearchResults(prev => prev.filter(item => item.id !== purchase.id));

        if (editingPurchase?.id === purchase.id) {
            clearCart();
        }

        await loadData();

        toast({
            title: "Preventa eliminada",
            description: "La preventa fue cancelada y las unidades regresaron al producto de preventa."
        });
    } catch (error) {
        console.error("Error deleting pre-sale:", error);
        toast({
            variant: "destructive",
            title: "Error al eliminar",
            description: (error as Error).message || "No se pudo eliminar la preventa."
        });
    } finally {
        setDeletingPurchaseId(null);
    }
  }

  const handleSearchHistory = async () => {
    if (!searchCedula) {
        toast({ variant: "destructive", title: "Error", description: "Por favor, ingrese una cédula o código para buscar." });
        return;
    }
    setIsHistoryLoading(true);
    try {
        const history = await getPreSalesByCedula(searchCedula);
        setSearchResults(history);
    } catch (error) {
        console.error("Error fetching purchase history:", error);
        toast({ variant: "destructive", title: "Error", description: "No se pudo cargar el historial de preventas." });
    } finally {
        setIsHistoryLoading(false);
    }
  }

  const handleExportCSV = () => {
    if (allPreSales.length === 0) {
        toast({
            variant: "destructive",
            title: "No hay datos",
            description: "No hay datos de preventas para exportar."
        });
        return;
    }

    const headers = ["ID de Preventa", "Fecha", "Cedula/Codigo", "Celular", "Productos", "Total (COP)", "Estado"];
    const rows = allPreSales.map((ps) => [
        `"${ps.id}"`,
        `"${ps.date}"`,
        `"${ps.cedula}"`,
        `"${ps.celular || ''}"`,
        `"${ps.items.map(item => `${item.name} (x${item.quantity})`).join('; ')}"`,
        ps.total,
        `"${statusTranslations[ps.status] || ps.status}"`
    ]);

    let csvContent = "data:text/csv;charset=utf-8," 
        + headers.join(",") + "\n" 
        + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "historial_de_preventas.csv");
    document.body.appendChild(link);

    link.click();
    document.body.removeChild(link);
};

  const handlePrint = () => {
    window.print();
  };

  const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

  const displayHistory = searchResults.length > 0 ? searchResults : recentPreSales;
  const renderStatusBadge = (status: Purchase['status']) => (
    <Badge variant="outline" className={cn("w-fit capitalize", statusColors[status])}>
      {statusTranslations[status]}
    </Badge>
  );

  const renderPreSaleActions = (ps: Purchase, className?: string) => {
    if (!canManagePreSales) {
      return (
        <div className={cn("text-right text-sm text-muted-foreground", className)}>
          Solo consulta
        </div>
      );
    }

    return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:justify-end", className)}>
      {ps.status === 'pre-sale' && (
        <>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleEditPurchase(ps)}
            disabled={deletingPurchaseId === ps.id}
            className="w-full sm:w-auto"
          >
            <Pencil className="mr-2 h-3 w-3" />
            Modificar
          </Button>
          <Button
            size="sm"
            onClick={() => handleConfirmPreSale(ps)}
            disabled={confirmingPurchaseId === ps.id || deletingPurchaseId === ps.id}
            className="w-full bg-purple-600 hover:bg-purple-700 sm:w-auto"
          >
            <PackagePlus className="mr-2 h-3 w-3" />
            {confirmingPurchaseId === ps.id ? 'Confirmando...' : 'Confirmar y dejar lista'}
          </Button>
        </>
      )}
      {ps.status === 'pre-sale-confirmed' && (
        <div className="inline-flex w-full items-center justify-center rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700 sm:w-auto">
          <CheckCircle className="mr-2 h-3 w-3" />
          Preventa lista
        </div>
      )}
      {(ps.status === 'pre-sale' || ps.status === 'pre-sale-confirmed') && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="destructive"
              disabled={deletingPurchaseId === ps.id || confirmingPurchaseId === ps.id}
              className="w-full sm:w-auto"
            >
              <Trash2 className="mr-2 h-3 w-3" />
              {deletingPurchaseId === ps.id ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar preventa {ps.id}</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción cancelará la preventa y devolverá sus unidades al producto de preventa. La fila saldrá de los listados activos, pero quedará como cancelada para conservar el historial.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cerrar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleDeletePreSale(ps)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Eliminar preventa
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 overflow-x-hidden">
      <PageHeader
        title={canManagePreSales ? "Registro de Preventa" : "Consulta de Preventas"}
        description={canManagePreSales
          ? "Registre preventas hasta el día anterior al evento. Cada unidad vendida aumenta el stock planificado del producto."
          : "Consulte las preventas registradas en el sistema desde caja."
        }
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] xl:items-start 2xl:gap-6">
        
        {canManagePreSales && (
        <>
        <div>
            <Card className="overflow-hidden">
                <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="text-xl sm:text-2xl">Todos los Productos</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                    <ScrollArea className="h-[min(58dvh,620px)] min-h-[320px] xl:h-[calc(100dvh-16rem)]">
                        {isProductsLoading ? (
                            <p className="text-muted-foreground p-3">Cargando productos...</p>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {products.map((product) => (
                                    <div key={product.id} className="grid grid-cols-[auto,minmax(0,1fr)] gap-3 rounded-lg bg-muted/50 p-3 sm:flex sm:items-center sm:justify-between">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <div className="h-10 w-10 bg-secondary rounded-md flex-shrink-0 relative">
                                                <Image 
                                                    src={product.imageUrl}
                                                    alt={product.name}
                                                    width={200}
                                                    height={200}
                                                    className="object-cover rounded-md"
                                                />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate font-semibold">{product.name}</p>
                                                <p className="text-sm text-muted-foreground">{formatCurrency(product.price)}</p>
                                            </div>
                                        </div>
                                        <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
                                            <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">Stock planificado: {product.stock}</Badge>
                                            <Button onClick={() => addToCart(product)} className="w-full sm:w-auto">
                                                Agregar
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>

        <div>
            <div className="xl:sticky xl:top-20">
                <Card className="overflow-hidden bg-slate-950 text-white">
                    <CardHeader className="p-4 sm:p-6">
                        <CardTitle className="text-xl sm:text-2xl">{editingPurchase ? 'Modificando Preventa' : 'Carrito de Preventa'}</CardTitle>
                        {editingPurchase && <CardDescription className="text-blue-300">Código: {editingPurchase.id}</CardDescription>}
                    </CardHeader>
                    <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                        <ScrollArea className={cn("mb-4 pr-3", cart.length === 0 ? "h-auto pr-0" : "h-44 min-h-0 sm:h-56 xl:h-[38dvh] xl:max-h-64")}>
                            {cart.length === 0 ? (
                                <p className="rounded-lg border border-white/10 bg-white/5 p-4 text-center text-blue-200">El carrito está vacío</p>
                            ) : (
                                <>
                                    <div className="space-y-2 md:hidden">
                                        {cart.map(item => (
                                            <div key={item.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="truncate font-medium text-white">{item.name}</p>
                                                        <p className="text-sm font-semibold text-emerald-300">{formatCurrency(item.price * item.quantity)}</p>
                                                    </div>
                                                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-red-300 hover:bg-red-500/20 hover:text-red-200" onClick={() => removeFromCart(item.id)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                                <div className="mt-3 flex items-center gap-2">
                                                    <Button size="icon" variant="outline" className="h-9 w-9 bg-blue-900 border-blue-700 hover:bg-blue-800" onClick={() => updateQuantity(item.id, item.quantity - 1)}>
                                                        <Minus className="h-4 w-4" />
                                                    </Button>
                                                    <Input
                                                        type="number"
                                                        value={item.quantity}
                                                        onChange={(e) => {
                                                            const newQuantity = parseInt(e.target.value, 10);
                                                            if (!isNaN(newQuantity)) {
                                                            updateQuantity(item.id, newQuantity);
                                                            }
                                                        }}
                                                        className="h-9 flex-1 text-center bg-blue-900 border-blue-700 text-white"
                                                    />
                                                    <Button size="icon" variant="outline" className="h-9 w-9 bg-blue-900 border-blue-700 hover:bg-blue-800" onClick={() => updateQuantity(item.id, item.quantity + 1)}>
                                                        <Plus className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="hidden md:block">
                                        <Table>
                                            <TableBody>
                                                {cart.map(item => (
                                                    <TableRow key={item.id} className="border-blue-800 hover:bg-blue-900">
                                                        <TableCell className="text-white font-medium">{item.name}</TableCell>
                                                        <TableCell>
                                                            <div className="flex items-center gap-2">
                                                                <Button size="icon" variant="outline" className="h-6 w-6 bg-blue-800 border-blue-700 hover:bg-blue-700" onClick={() => updateQuantity(item.id, item.quantity - 1)}>
                                                                    <Minus className="h-4 w-4" />
                                                                </Button>
                                                                <Input
                                                                    type="number"
                                                                    value={item.quantity}
                                                                    onChange={(e) => {
                                                                        const newQuantity = parseInt(e.target.value, 10);
                                                                        if (!isNaN(newQuantity)) {
                                                                        updateQuantity(item.id, newQuantity);
                                                                        }
                                                                    }}
                                                                    className="w-16 h-6 text-center bg-blue-900 border-blue-700"
                                                                />
                                                                <Button size="icon" variant="outline" className="h-6 w-6 bg-blue-800 border-blue-700 hover:bg-blue-700" onClick={() => updateQuantity(item.id, item.quantity + 1)}>
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
                        <div className="space-y-4 text-base sm:text-lg">
                            <div className="space-y-2">
                                <Label htmlFor="customer-id" className="text-white">Cédula o Código de Estudiante</Label>
                                <Input 
                                    id="customer-id"
                                    value={customerIdentifier}
                                    onChange={(e) => setCustomerIdentifier(e.target.value)}
                                    className="bg-blue-900 border-blue-700 text-white"
                                    placeholder="Ingrese identificación..."
                                    required
                                    disabled={!!editingPurchase}
                                />
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="customer-celular" className="text-white">Celular (para WhatsApp)</Label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-white">
                                        +57
                                    </span>
                                    <Input 
                                        id="customer-celular"
                                        type="tel"
                                        value={customerCelular}
                                        onChange={(e) => setCustomerCelular(e.target.value.replace(/[^0-9]/g, ''))}
                                        className="bg-blue-900 border-blue-700 text-white pl-12"
                                        placeholder="3001234567"
                                        required
                                        maxLength={10}
                                        disabled={!!editingPurchase}
                                    />
                                </div>
                            </div>
                            <div className="flex justify-between font-bold border-t border-blue-800 pt-4 mt-4">
                                <span>TOTAL</span>
                                <span>{formatCurrency(subtotal)}</span>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-2 p-4 pt-0 sm:flex-row sm:p-6 sm:pt-0">
                        <Button 
                            className="w-full text-lg h-12 bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
                            onClick={handlePreSale}
                            disabled={isProcessing}
                        >
                            {isProcessing ? 'Procesando...' : (editingPurchase ? 'Guardar Cambios' : 'Registrar Preventa')}
                        </Button>
                        <Button variant="destructive" className="w-full text-lg h-12" onClick={clearCart}>
                            {editingPurchase ? 'Cancelar Edición' : 'Vaciar Carrito'}
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </div>
        </>
        )}
        
        <div className="xl:col-span-2">
            <Card className="overflow-hidden">
                <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="text-xl sm:text-2xl">Consultar Preventas</CardTitle>
                    <CardDescription>Busque por cédula o vea las preventas registradas en el sistema.</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input 
                            placeholder="Buscar por cédula..."
                            value={searchCedula}
                            onChange={e => setSearchCedula(e.target.value)}
                        />
                        <Button onClick={handleSearchHistory} disabled={isHistoryLoading}>
                            <Search className="mr-2 h-4 w-4" />
                            {isHistoryLoading ? 'Buscando...' : 'Buscar'}
                        </Button>
                    </div>
                    <ScrollArea className="max-h-[560px] min-h-[220px]">
                        {isPreSalesLoading || isHistoryLoading ? (
                            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground md:hidden">Cargando...</div>
                        ) : displayHistory.length === 0 ? (
                            <div className="flex h-24 items-center justify-center rounded-lg border border-dashed text-center text-sm text-muted-foreground md:hidden">No se encontraron preventas registradas.</div>
                        ) : (
                            <div className="space-y-3 md:hidden">
                                {displayHistory.map(ps => (
                                    <div key={ps.id} className="rounded-lg border bg-background p-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="font-mono text-sm font-semibold">{ps.id}</p>
                                                <p className="text-sm text-muted-foreground">{formatCurrency(ps.total)}</p>
                                            </div>
                                            {renderStatusBadge(ps.status)}
                                        </div>
                                        <div className="mt-3 rounded-md bg-muted/50 p-2 text-sm">
                                            <p className="font-semibold text-foreground">Se adquirió</p>
                                            <ul className="mt-1 space-y-1 text-muted-foreground">
                                                {ps.items.map(item => (
                                                    <li key={item.id} className="flex justify-between gap-3">
                                                        <span className="min-w-0 truncate">{item.name}</span>
                                                        <span className="shrink-0">x{item.quantity}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                        {renderPreSaleActions(ps, "mt-3")}
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="hidden md:block">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Código</TableHead>
                                    <TableHead>Se adquirió</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead>Total</TableHead>
                                    <TableHead className="text-right">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isPreSalesLoading || isHistoryLoading ? (
                                <TableRow><TableCell colSpan={5} className="h-24 text-center">Cargando...</TableCell></TableRow>
                                ) : displayHistory.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} className="h-24 text-center">No se encontraron preventas registradas.</TableCell></TableRow>
                                ) : (
                                    displayHistory.map(ps => (
                                        <TableRow key={ps.id}>
                                            <TableCell className="font-mono">{ps.id}</TableCell>
                                            <TableCell>
                                                <ul className="space-y-1 text-xs">
                                                    {ps.items.map(item => (
                                                        <li key={item.id} className="flex justify-between gap-3">
                                                            <span className="min-w-0 truncate">{item.name}</span>
                                                            <span className="shrink-0 font-semibold">x{item.quantity}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={cn("capitalize", statusColors[ps.status])}>{statusTranslations[ps.status]}</Badge>
                                            </TableCell>
                                            <TableCell>{formatCurrency(ps.total)}</TableCell>
                                            <TableCell>{renderPreSaleActions(ps)}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
      </div>
      
      <div>
        <Card className="overflow-hidden">
            <CardHeader className="flex flex-col gap-4 p-4 sm:p-6 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                    <CardTitle className="text-xl sm:text-2xl">Historial de Todas las Preventas</CardTitle>
                    <CardDescription>
                    Un registro completo de todas las preventas registradas en el sistema.
                    </CardDescription>
                </div>
                <Button variant="outline" onClick={handleExportCSV} disabled={isPreSalesLoading} className="w-full md:w-auto">
                    <Download className="mr-2 h-4 w-4" />
                    Exportar a CSV
                </Button>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                 <ScrollArea className="max-h-[640px] min-h-[240px]">
                    {isPreSalesLoading ? (
                        <div className="flex h-24 items-center justify-center text-sm text-muted-foreground md:hidden">Cargando historial...</div>
                    ) : allPreSales.length === 0 ? (
                        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed text-center text-sm text-muted-foreground md:hidden">No hay preventas registradas.</div>
                    ) : (
                        <div className="space-y-3 md:hidden">
                            {allPreSales.map(ps => (
                                <div key={ps.id} className="rounded-lg border bg-background p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium">{ps.date}</p>
                                            <p className="font-mono text-xs text-muted-foreground">{ps.cedula} - {ps.celular}</p>
                                        </div>
                                        <p className="shrink-0 font-semibold">{formatCurrency(ps.total)}</p>
                                    </div>
                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                        {renderStatusBadge(ps.status)}
                                    </div>
                                    {renderPreSaleActions(ps, "mt-3")}
                                    <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                                        {ps.items.map(item => (
                                            <li key={item.id} className="flex justify-between gap-3">
                                                <span className="min-w-0 truncate">{item.name}</span>
                                                <span className="shrink-0">x{item.quantity}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}
                        <div className="hidden md:block">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Cédula/Código</TableHead>
                                    <TableHead>Celular</TableHead>
                                    <TableHead>Productos</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                    <TableHead className="text-right">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isPreSalesLoading ? (
                                    <TableRow><TableCell colSpan={7} className="h-24 text-center">Cargando historial...</TableCell></TableRow>
                                ) : allPreSales.length === 0 ? (
                                    <TableRow><TableCell colSpan={7} className="h-24 text-center">No hay preventas registradas.</TableCell></TableRow>
                                ) : (
                                    allPreSales.map(ps => (
                                        <TableRow key={ps.id}>
                                            <TableCell>{ps.date}</TableCell>
                                            <TableCell>{ps.cedula}</TableCell>
                                            <TableCell>{ps.celular}</TableCell>
                                            <TableCell>
                                                <ul className="list-disc list-inside text-xs">
                                                    {ps.items.map(item => (
                                                        <li key={item.id}>{item.name} (x{item.quantity})</li>
                                                    ))}
                                                </ul>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={cn("capitalize", statusColors[ps.status])}>{statusTranslations[ps.status]}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-medium">{formatCurrency(ps.total)}</TableCell>
                                            <TableCell>{renderPreSaleActions(ps)}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                        </div>
                    </ScrollArea>
            </CardContent>
        </Card>
      </div>

      <Dialog open={isConfirmationOpen} onOpenChange={setIsConfirmationOpen}>
        <DialogContent className="printable-area">
            <div ref={confirmationDialogRef}>
                <DialogHeader>
                    <div className="flex justify-center mb-4">
                        <Logo className="h-auto w-48" />
                    </div>
                    <DialogTitle className="text-center text-2xl">{editingPurchase ? '¡Preventa Actualizada!' : '¡Preventa Registrada!'}</DialogTitle>
                    <DialogDescription className="text-center">Entregue este comprobante al padre de familia para confirmar y pagar la preventa en caja.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="text-center">
                        <p className="text-sm text-muted-foreground">Código de Preventa Único:</p>
                        <div className="my-2 p-4 bg-muted rounded-md">
                        <p className="text-2xl sm:text-3xl font-bold font-mono tracking-widest text-primary">{lastPurchase?.id}</p>
                        </div>
                    </div>
                    <div>
                        <h4 className="font-semibold mb-2 text-center">Resumen de la Compra</h4>
                        <ul className="text-sm space-y-1">
                            {lastPurchase?.items.map(item => (
                                <li key={item.id} className="flex justify-between">
                                    <span>{item.name} (x{item.quantity})</span>
                                    <span>{formatCurrency(item.price * item.quantity)}</span>
                                </li>
                            ))}
                        </ul>
                        <div className="flex justify-between font-bold text-lg mt-2 pt-2 border-t">
                            <span>Total:</span>
                            <span>{formatCurrency(lastPurchase?.total ?? 0)}</span>
                        </div>
                    </div>
                </div>
            </div>
            <DialogFooter className="print-hide">
                <Button onClick={handlePrint} variant="outline" className="w-full">
                    <Printer className="mr-2 h-4 w-4" />
                    Imprimir Comprobante
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

    
    
