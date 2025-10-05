
"use client";

import { useState, useEffect, useCallback } from 'react';
import type { Product, Purchase } from '@/lib/types';
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
  TableHeader,
  TableHead
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Plus, Minus, ShoppingCart, History, Pencil } from "lucide-react";
import { formatCurrency, cn } from '@/lib/utils';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogDescription as DialogDesc,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { getProductsByAvailability } from '@/lib/services/product-service';
import { addPreSalePurchase, getPurchasesByCedula, type NewPurchase, updatePendingPurchase } from '@/lib/services/purchase-service';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { addAuditLog } from '@/lib/services/audit-service';


type CartItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  type: 'product';
  stock: number;
};

export default function SelfServicePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isUserInfoModalOpen, setIsUserInfoModalOpen] = useState(false);
  const [paymentCode, setPaymentCode] = useState<string | null>(null);
  const [purchaseHistory, setPurchaseHistory] = useState<Purchase[]>([]);
  const [cedula, setCedula] = useState('');
  const [celular, setCelular] = useState('');
  const [searchCedula, setSearchCedula] = useState('');
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    try {
        const fetchedProducts = await getProductsByAvailability('self-service');
        setProducts(fetchedProducts);
    } catch (error)
        {
        console.error("Error fetching products:", error);
    } finally {
        setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const addToCart = (item: Product) => {
    setCart((prevCart) => {
      const existingItem = prevCart.find((cartItem) => cartItem.id === item.id);
      
      if (item.stock <= 0) {
          toast({ variant: "destructive", title: "Sin Stock", description: `${item.name} está agotado.` });
          return prevCart;
      }
       if (existingItem && existingItem.quantity >= item.stock) {
          toast({ variant: "destructive", title: "Límite de Stock", description: `No puedes agregar más ${item.name}.` });
          return prevCart;
      }
      
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
    setCart((prevCart) => {
      if (newQuantity <= 0) {
        return prevCart.filter((item) => item.id !== id);
      }

      const itemToUpdate = prevCart.find(item => item.id === id);
      if (itemToUpdate && itemToUpdate.stock < newQuantity) {
        toast({ variant: "destructive", title: "Límite de Stock", description: `Solo quedan ${itemToUpdate.stock} unidades de ${itemToUpdate.name}.` });
        return prevCart;
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
    setEditingPurchase(null);
  };

  const handleInitiatePayment = () => {
    if (cart.length > 0) {
        if (editingPurchase) {
            handleUpdatePurchase();
        } else {
            setIsUserInfoModalOpen(true);
        }
    }
  }

  const handleUpdatePurchase = async () => {
    if (!editingPurchase || cart.length === 0) return;
    setIsProcessing(true);
    
    try {
        await updatePendingPurchase(editingPurchase.id, cart.map(({ stock, ...item }) => item));
        
        setPaymentCode(editingPurchase.id);
        setIsPaymentModalOpen(true);
        toast({ title: "Éxito", description: "Su compra ha sido actualizada correctamente." });

    } catch (error) {
        console.error("Error updating purchase:", error);
        toast({ variant: "destructive", title: "Error al Actualizar", description: (error as Error).message || "No se pudo actualizar la compra." });
    } finally {
        setIsProcessing(false);
    }
  };


  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0 || !cedula || !celular) return;
    setIsProcessing(true);

    const newPurchaseData: NewPurchase = {
        date: new Date().toLocaleString('es-CO'),
        total: subtotal,
        items: cart.map(({ stock, ...item }) => item),
        cedula,
        celular,
        status: 'pre-sale', // Self-service purchases are treated as pre-sales
    };
    
    try {
        const addedPurchase = await addPreSalePurchase(newPurchaseData);
        setPaymentCode(addedPurchase.id);
        setIsUserInfoModalOpen(false);
        setIsPaymentModalOpen(true);
        toast({ title: "Éxito", description: "Código de pago generado. Su compra está pendiente de confirmación." });
        
        await addAuditLog({
          userId: cedula,
          userName: 'Cliente (Autogestión)',
          action: 'SELF_SERVICE_PURCHASE',
          details: `Nueva compra en sitio #${addedPurchase.id} por ${formatCurrency(addedPurchase.total)} iniciada por C.C. ${cedula}.`,
        });

    } catch (error) {
        console.error("Error creating purchase:", error);
        toast({ variant: "destructive", title: "Error en la Compra", description: (error as Error).message || "No se pudo generar el código de pago." });
    } finally {
        setIsProcessing(false);
    }
  };

  const handleSearchHistory = async () => {
    if (!searchCedula) {
        toast({ variant: "destructive", title: "Error", description: "Por favor, ingrese una cédula para buscar." });
        return;
    }
    setIsHistoryLoading(true);
    try {
        const history = await getPurchasesByCedula(searchCedula);
        setPurchaseHistory(history);
    } catch (error) {
        console.error("Error fetching purchase history:", error);
        toast({ variant: "destructive", title: "Error", description: "No se pudo cargar el historial de compras." });
    } finally {
        setIsHistoryLoading(false);
    }
  }

  const closeModal = () => {
      setIsPaymentModalOpen(false);
      setPaymentCode(null);
      setCedula('');
      setCelular('');
      clearCart();
      loadProducts(); // Refresh products after a successful purchase
      setPurchaseHistory([]);
      setSearchCedula('');
  }

  const handleEditPurchase = (purchase: Purchase) => {
    const cartItems: CartItem[] = purchase.items.map(item => {
        const product = products.find(p => p.id === item.id);
        return {
            ...item,
            type: 'product',
            stock: product ? product.stock + item.quantity : item.quantity, // Temporarily add back stock for validation
        }
    });
    setCart(cartItems);
    setEditingPurchase(purchase);
    toast({ title: "Modo Edición", description: "Los artículos de su compra han sido cargados en el carrito." });
  }


  const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

  return (
    <div className="container mx-auto p-4">
      <PageHeader
        title="Portal de Autogestión"
        description="Seleccione los productos que desea comprar y páguelos en la caja."
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          {isLoading ? (
            <p>Cargando productos...</p>
          ) : products.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((product) => {
                const isSoldOut = product.stock <= 0;
                const cartItem = cart.find(item => item.id === product.id);
                const quantityInCart = cartItem ? cartItem.quantity : 0;
                const hasReachedLimit = quantityInCart >= product.stock;

                return (
                  <Card key={product.id} className={cn("overflow-hidden group", isSoldOut && "opacity-50")}>
                    <div className={cn("relative flex justify-center pt-4", !isSoldOut && "cursor-pointer")} onClick={() => !isSoldOut && !hasReachedLimit && addToCart(product)}>
                      <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-1">
                          {quantityInCart > 0 && (
                            <div className="bg-accent text-accent-foreground h-8 w-8 rounded-full flex items-center justify-center text-lg font-bold shadow-lg">
                              {quantityInCart}
                            </div>
                          )}
                          {hasReachedLimit && !isSoldOut && (
                              <Badge variant="destructive" className="text-xs animate-pulse">Límite alcanzado</Badge>
                          )}
                      </div>
                      <Image
                        src={product.imageUrl}
                        alt={product.name}
                        width={200}
                        height={200}
                        className="object-cover rounded-md transition-transform group-hover:scale-105"
                        data-ai-hint={product.imageHint}
                      />
                       {isSoldOut && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <Badge variant="destructive" className="text-lg">Agotado</Badge>
                        </div>
                      )}
                    </div>

                    <CardContent className="p-4">
                      <h3 className="text-lg font-semibold">{product.name}</h3>
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-xl font-bold">{formatCurrency(product.price)}</span>
                        <Button size="sm" onClick={() => addToCart(product)} disabled={isSoldOut || hasReachedLimit}>
                          <ShoppingCart className="mr-2 h-4 w-4" />
                          Agregar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ) : (
            <p>No hay productos disponibles para autoservicio en este momento.</p>
          )}
        </div>

        <div>
          <Card className="bg-primary text-primary-foreground lg:sticky top-20">
            <CardHeader>
              <CardTitle>{editingPurchase ? 'Modificando Compra' : 'Carrito de Compras'}</CardTitle>
               {editingPurchase && <CardDescription className="text-primary-foreground/80">Código: {editingPurchase.id}</CardDescription>}
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-60 mb-4">
                {cart.length === 0 ? (
                  <p className="text-center text-blue-200">El carrito está vacío</p>
                ) : (
                  <Table>
                    <TableBody>
                      {cart.map(item => (
                        <TableRow key={item.id} className="border-blue-800 hover:bg-primary/90">
                          <TableCell className="text-primary-foreground font-medium">{item.name}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button size="icon" variant="outline" className="h-6 w-6 bg-primary-foreground/10 border-primary-foreground/20 hover:bg-primary-foreground/20 text-primary-foreground" onClick={() => updateQuantity(item.id, item.quantity - 1)}>
                                <Minus className="h-4 w-4" />
                              </Button>
                              <span className="w-6 text-center">{item.quantity}</span>
                              <Button size="icon" variant="outline" className="h-6 w-6 bg-primary-foreground/10 border-primary-foreground/20 hover:bg-primary-foreground/20 text-primary-foreground" onClick={() => updateQuantity(item.id, item.quantity + 1)}>
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold">{formatCurrency(item.price * item.quantity)}</TableCell>
                          <TableCell className="text-right">
                            <Button size="icon" variant="ghost" className="text-red-300 hover:bg-red-500/20 hover:text-red-300" onClick={() => removeFromCart(item.id)}>
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
                <div className="flex justify-between font-bold">
                  <span>TOTAL</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button 
                className="w-full text-lg h-12 bg-accent hover:bg-accent/90 text-accent-foreground font-bold" 
                onClick={handleInitiatePayment}
                disabled={cart.length === 0 || isProcessing}
              >
                {isProcessing ? 'Procesando...' : (editingPurchase ? 'Guardar Cambios' : 'Generar Código de Pago')}
              </Button>
              <Button variant="destructive" className="w-full text-lg h-12" onClick={clearCart}>
                {editingPurchase ? 'Cancelar Edición' : 'Vaciar'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>

      <div className="mt-12">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-6 w-6" />
              Mi Historial de Compras
            </CardTitle>
            <CardDescription>
              Ingrese su número de cédula para ver su historial y modificar compras pendientes.
            </CardDescription>
            <div className="pt-2 flex items-end gap-2">
              <div className="flex-grow">
                <Label htmlFor="search-cedula">Buscar por Cédula</Label>
                <Input 
                  id="search-cedula"
                  placeholder="Ingrese su número de cédula"
                  value={searchCedula}
                  onChange={(e) => setSearchCedula(e.target.value)}
                />
              </div>
              <Button onClick={handleSearchHistory}>Buscar</Button>
            </div>
          </CardHeader>
          <CardContent>
            {isHistoryLoading ? (
              <p className="text-center text-muted-foreground">Buscando...</p>
            ) : purchaseHistory.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código de Pago</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseHistory.map((purchase) => (
                    <TableRow key={purchase.id}>
                      <TableCell className="font-mono">{purchase.id}</TableCell>
                      <TableCell>{purchase.date}</TableCell>
                      <TableCell>
                         <Badge variant={purchase.status === 'paid' || purchase.status === 'delivered' ? 'default' : 'secondary'} className={purchase.status === 'paid' || purchase.status === 'delivered' ? 'bg-green-500/20 text-green-700' : ''}>
                            {purchase.status === 'pre-sale' ? 'Preventa' : purchase.status === 'pending' ? 'Pendiente' : purchase.status === 'paid' ? 'Pagado' : purchase.status === 'delivered' ? 'Entregado' : 'Cancelado'}
                         </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(purchase.total)}</TableCell>
                       <TableCell className="text-right">
                        {purchase.status === 'pending' && (
                            <Button variant="outline" size="sm" onClick={() => handleEditPurchase(purchase)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Modificar
                            </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground">Ingrese una cédula y haga clic en buscar para ver el historial.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isUserInfoModalOpen} onOpenChange={setIsUserInfoModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Información</DialogTitle>
            <DialogDesc>
              Por favor, ingrese su cédula y número de celular para generar el código de pago.
            </DialogDesc>
          </DialogHeader>
          <form id="user-info-form" onSubmit={handleConfirmPayment}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="cedula">Cédula</Label>
                <Input 
                  id="cedula" 
                  value={cedula} 
                  onChange={(e) => setCedula(e.target.value)} 
                  required 
                  placeholder="Número de documento"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="celular">Celular (para notificaciones)</Label>
                <Input 
                  id="celular" 
                  type="tel"
                  value={celular} 
                  onChange={(e) => setCelular(e.target.value)} 
                  required 
                  placeholder="3001234567"
                />
              </div>
            </div>
          </form>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" form="user-info-form" disabled={isProcessing}>
              {isProcessing ? 'Procesando...' : 'Confirmar y Generar Código'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPaymentModalOpen} onOpenChange={closeModal}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPurchase ? 'Compra Actualizada' : 'Código de Pago Generado'}</DialogTitle>
            <DialogDesc>
              Este es el comprobante de su compra.
            </DialogDesc>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="text-center p-4 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 rounded-md border border-yellow-200 dark:border-yellow-800">
                <p className="text-base font-semibold">
                    Su compra está pendiente. Por favor, presente este código en la caja para confirmar el pago y recibir sus productos.
                </p>
            </div>
            <div className="text-center">
                <p className="text-sm text-muted-foreground">Su código de pago único es:</p>
                <div className="my-2 p-4 bg-muted rounded-md">
                <p className="text-2xl sm:text-3xl font-bold font-mono tracking-widest text-primary">{paymentCode}</p>
                </div>
            </div>

            <div>
                <h4 className="font-semibold mb-2 text-center">Resumen de la Compra</h4>
                <div className="max-h-32 overflow-y-auto border rounded-md p-2">
                    <ul className="text-sm space-y-1">
                        {cart.map(item => (
                            <li key={item.id} className="flex justify-between">
                                <span>{item.name} (x{item.quantity})</span>
                                <span>{formatCurrency(item.price * item.quantity)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                 <div className="flex justify-between font-bold text-lg mt-2 pt-2 border-t">
                    <span>Total a Pagar:</span>
                    <span>{formatCurrency(subtotal)}</span>
                </div>
            </div>

          </div>
          <Button onClick={closeModal} className="w-full">Entendido</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
