
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
import { Trash2, Plus, Minus, Search, ExternalLink, Printer, Download, Pencil } from "lucide-react";
import { formatCurrency, cn } from '@/lib/utils';
import { getProductsByAvailability } from '@/lib/services/product-service';
import { addPreSalePurchase, getRecentPreSales, type NewPurchase, getPreSalesByCedula, getDashboardPreSales, updatePendingPurchase } from '@/lib/services/purchase-service';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Link from 'next/link';
import { Logo } from '@/components/icons';

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
  const [isLoading, setIsLoading] = useState(true);
  const [customerIdentifier, setCustomerIdentifier] = useState('');
  const [customerCelular, setCustomerCelular] = useState('');
  const { toast } = useToast();
  const { currentUser } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);

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

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
        const [fetchedProducts, recent, all] = await Promise.all([
          getProductsByAvailability('presale'),
          getRecentPreSales(),
          getDashboardPreSales()
        ]);
        setProducts(fetchedProducts);
        setRecentPreSales(recent);
        setAllPreSales(all);
    } catch (error) {
        console.error("Error fetching data:", error);
    } finally {
        setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
        toast({ title: "Preventa Exitosa", description: "La preventa ha sido registrada correctamente." });
        
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

  return (
    <div>
      <PageHeader
        title="Registro de Preventa"
        description="Registre ventas que no dependen del stock inicial para planificar el inventario."
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <div className="lg:col-span-1">
            <Card>
                <CardHeader>
                    <CardTitle>Todos los Productos</CardTitle>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[70vh]">
                        {isLoading ? (
                            <p className="text-muted-foreground p-3">Cargando productos...</p>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {products.map((product) => (
                                    <div key={product.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 bg-secondary rounded-md flex-shrink-0 relative">
                                                <Image 
                                                    src={product.imageUrl}
                                                    alt={product.name}
                                                    width={200}
                                                    height={200}
                                                    className="object-cover rounded-md"
                                                />
                                            </div>
                                            <div>
                                                <p className="font-semibold">{product.name}</p>
                                                <p className="text-sm text-muted-foreground">{formatCurrency(product.price)}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline">Stock Actual: {product.stock}</Badge>
                                            <Button onClick={() => addToCart(product)}>
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

        <div className="lg:col-span-1">
            <div className="lg:sticky top-20 z-10">
                <Card className="bg-blue-950 text-white">
                    <CardHeader>
                        <CardTitle>{editingPurchase ? 'Modificando Preventa' : 'Carrito de Preventa'}</CardTitle>
                        {editingPurchase && <CardDescription className="text-blue-300">Código: {editingPurchase.id}</CardDescription>}
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-64 mb-4">
                            {cart.length === 0 ? (
                                <p className="text-center text-blue-300">El carrito está vacío</p>
                            ) : (
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
                                                            className="w-12 h-6 text-center bg-blue-900 border-blue-700"
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
                            )}
                        </ScrollArea>
                        <div className="space-y-4 text-lg">
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
                    <CardFooter className="flex gap-2">
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
        
        <div className="lg:col-span-1">
            <Card>
                <CardHeader>
                    <CardTitle>Consultar Preventas</CardTitle>
                    <CardDescription>Busque por cédula o vea las preventas registradas por vendedores.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-2 mb-4">
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
                    <ScrollArea className="h-[60vh]">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Código</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead>Total</TableHead>
                                    <TableHead className="text-right">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading || isHistoryLoading ? (
                                <TableRow><TableCell colSpan={4} className="h-24 text-center">Cargando...</TableCell></TableRow>
                                ) : displayHistory.length === 0 ? (
                                    <TableRow><TableCell colSpan={4} className="h-24 text-center">No se encontraron preventas de vendedores.</TableCell></TableRow>
                                ) : (
                                    displayHistory.map(ps => (
                                        <TableRow key={ps.id}>
                                            <TableCell className="font-mono">{ps.id}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={cn("capitalize", statusColors[ps.status])}>{statusTranslations[ps.status]}</Badge>
                                            </TableCell>
                                            <TableCell>{formatCurrency(ps.total)}</TableCell>
                                            <TableCell className="text-right space-x-1">
                                                {ps.status === 'pre-sale' && (
                                                    <Button size="sm" variant="secondary" onClick={() => handleEditPurchase(ps)}>
                                                        <Pencil className="mr-2 h-3 w-3" />
                                                        Modificar
                                                    </Button>
                                                )}
                                                <Button asChild size="sm" variant="outline">
                                                    <Link href={`/dashboard/redeem?code=${ps.id}`}>
                                                        Ver / Gestionar <ExternalLink className="ml-2 h-3 w-3" />
                                                    </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
      </div>
      
      <div className="mt-8">
        <Card>
            <CardHeader className="flex items-center justify-between flex-row">
                <div>
                    <CardTitle>Historial de Todas las Preventas</CardTitle>
                    <CardDescription>
                    Un registro completo de todas las preventas registradas en el sistema.
                    </CardDescription>
                </div>
                <Button variant="outline" onClick={handleExportCSV} disabled={isLoading}>
                    <Download className="mr-2 h-4 w-4" />
                    Exportar a CSV
                </Button>
            </CardHeader>
            <CardContent>
                 <ScrollArea className="h-[60vh]">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Cédula/Código</TableHead>
                                    <TableHead>Celular</TableHead>
                                    <TableHead>Productos</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={6} className="h-24 text-center">Cargando historial...</TableCell></TableRow>
                                ) : allPreSales.length === 0 ? (
                                    <TableRow><TableCell colSpan={6} className="h-24 text-center">No hay preventas registradas.</TableCell></TableRow>
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
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
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

    
    
