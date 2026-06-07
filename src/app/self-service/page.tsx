
"use client";

import { useState, useEffect, useCallback } from 'react';
import type { Product, Purchase } from '@/lib/types';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
  const cartItemCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <div className="min-h-screen bg-[#f7f8fb] pb-32 lg:pb-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-3 py-4 sm:px-6 lg:px-8">
        <header className="rounded-md border bg-background px-4 py-4 shadow-sm sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wide text-primary">Autogestión</p>
              <h1 className="text-2xl font-bold leading-tight text-foreground sm:text-3xl">Compra rápida</h1>
              <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
                Elija sus productos, genere el código y muéstrelo en caja para pagar.
              </p>
            </div>
            <div className="flex min-h-12 min-w-12 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
              <ShoppingCart className="h-6 w-6" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-semibold text-muted-foreground sm:max-w-xl sm:text-sm">
            <div className="rounded-md border bg-muted px-2 py-2">1. Escoge</div>
            <div className="rounded-md border bg-muted px-2 py-2">2. Genera código</div>
            <div className="rounded-md border bg-muted px-2 py-2">3. Paga en caja</div>
          </div>
        </header>

        {editingPurchase && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
            Está modificando la compra {editingPurchase.id}. Revise el pedido y guarde los cambios.
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Productos disponibles</h2>
                <p className="text-sm text-muted-foreground">Toque un producto para agregarlo al pedido.</p>
              </div>
              <Badge variant="secondary" className="shrink-0 px-3 py-1 text-sm">
                {products.length} opciones
              </Badge>
            </div>

          {isLoading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-48 animate-pulse rounded-md border bg-background" />
                ))}
              </div>
          ) : products.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => {
                const isSoldOut = product.stock <= 0;
                const cartItem = cart.find(item => item.id === product.id);
                const quantityInCart = cartItem ? cartItem.quantity : 0;
                const hasReachedLimit = quantityInCart >= product.stock;
                const productImageUrl = product.imageUrl?.trim()
                  || `https://placehold.co/600x400/e0f2fe/1e3a8a?text=${encodeURIComponent(product.name)}`;

                return (
                    <Card
                      key={product.id}
                      className={cn(
                        "group overflow-hidden border bg-background shadow-sm transition hover:border-primary/40 active:scale-[0.99]",
                        isSoldOut && "opacity-60"
                      )}
                    >
                      <button
                        type="button"
                        className={cn("relative block w-full text-left", !isSoldOut && !hasReachedLimit && "cursor-pointer")}
                        onClick={() => !isSoldOut && !hasReachedLimit && addToCart(product)}
                        disabled={isSoldOut || hasReachedLimit}
                        aria-label={`Agregar ${product.name}`}
                      >
                        <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                          <Image
                            src={productImageUrl}
                            alt={product.name}
                            fill
                            sizes="(min-width: 1280px) 280px, (min-width: 640px) 50vw, 100vw"
                            className="object-cover transition-transform group-hover:scale-105"
                            data-ai-hint={product.imageHint}
                          />
                        </div>
                        <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2">
                          {quantityInCart > 0 && (
                              <Badge className="bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-600">
                                {quantityInCart} en pedido
                              </Badge>
                          )}
                          {hasReachedLimit && !isSoldOut && (
                              <Badge variant="destructive" className="px-3 py-1 text-sm">Límite</Badge>
                          )}
                        </div>
                        {isSoldOut && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/55">
                            <Badge variant="destructive" className="px-4 py-2 text-base">Agotado</Badge>
                          </div>
                        )}
                      </button>

                      <CardContent className="space-y-3 p-4">
                        <div className="min-h-[72px] space-y-1">
                          <h3 className="text-lg font-bold leading-snug">{product.name}</h3>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-2xl font-black">{formatCurrency(product.price)}</span>
                            <span className="text-xs font-semibold text-muted-foreground">{product.stock} disp.</span>
                          </div>
                        </div>

                        {quantityInCart > 0 ? (
                          <div className="grid grid-cols-[52px_1fr_52px] items-center gap-2">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-12 w-12 rounded-md"
                              onClick={() => updateQuantity(product.id, quantityInCart - 1)}
                              aria-label={`Quitar una unidad de ${product.name}`}
                            >
                              <Minus className="h-5 w-5" />
                            </Button>
                            <div className="flex h-12 items-center justify-center rounded-md border bg-muted text-lg font-black">
                              {quantityInCart}
                            </div>
                            <Button
                              size="icon"
                              className="h-12 w-12 rounded-md"
                              onClick={() => updateQuantity(product.id, quantityInCart + 1)}
                              disabled={hasReachedLimit}
                              aria-label={`Agregar una unidad de ${product.name}`}
                            >
                              <Plus className="h-5 w-5" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            className="h-12 w-full text-base font-bold"
                            onClick={() => addToCart(product)}
                            disabled={isSoldOut || hasReachedLimit}
                          >
                            <ShoppingCart className="h-5 w-5" />
                            Agregar
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                )
              })}
            </div>
          ) : (
              <div className="rounded-md border bg-background p-8 text-center text-muted-foreground">
                No hay productos disponibles para autoservicio en este momento.
              </div>
          )}
          </section>

          <aside className="space-y-4 lg:sticky lg:top-5">
          <Card className="border bg-background shadow-sm">
            <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl">{editingPurchase ? 'Modificar pedido' : 'Tu pedido'}</CardTitle>
                    <CardDescription>
                      {cartItemCount > 0 ? `${cartItemCount} producto${cartItemCount === 1 ? '' : 's'} seleccionado${cartItemCount === 1 ? '' : 's'}` : 'El carrito está vacío'}
                    </CardDescription>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary text-lg font-black text-primary-foreground">
                    {cartItemCount}
                  </div>
                </div>
                {editingPurchase && <CardDescription>Código: {editingPurchase.id}</CardDescription>}
            </CardHeader>
              <CardContent className="space-y-4">
                {cart.length === 0 ? (
                  <div className="rounded-md border border-dashed bg-muted p-6 text-center text-sm text-muted-foreground">
                    Agregue productos para generar su código de pago.
                  </div>
                ) : (
                  <div className="space-y-3">
                      {cart.map(item => (
                      <div key={item.id} className="rounded-md border bg-card p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold leading-tight">{item.name}</p>
                            <p className="text-sm text-muted-foreground">{formatCurrency(item.price)} c/u</p>
                          </div>
                          <p className="shrink-0 text-right font-black">{formatCurrency(item.price * item.quantity)}</p>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="grid grid-cols-[44px_48px_44px] items-center gap-2">
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-11 w-11 rounded-md"
                                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                aria-label={`Quitar una unidad de ${item.name}`}
                              >
                                <Minus className="h-5 w-5" />
                              </Button>
                            <span className="text-center text-lg font-black">{item.quantity}</span>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-11 w-11 rounded-md"
                                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                aria-label={`Agregar una unidad de ${item.name}`}
                              >
                                <Plus className="h-5 w-5" />
                              </Button>
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-11 w-11 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => removeFromCart(item.id)}
                              aria-label={`Eliminar ${item.name}`}
                            >
                              <Trash2 className="h-5 w-5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
                <div className="rounded-md bg-muted p-4">
                  <div className="flex justify-between text-sm font-semibold text-muted-foreground">
                    <span>Total a pagar</span>
                    <span>{cartItemCount} producto{cartItemCount === 1 ? '' : 's'}</span>
                  </div>
                  <div className="mt-1 flex items-end justify-between gap-3">
                    <span className="text-2xl font-black">TOTAL</span>
                    <span className="text-3xl font-black text-primary">{formatCurrency(subtotal)}</span>
                  </div>
                </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button 
                  className="h-14 w-full text-base font-black sm:text-lg"
                onClick={handleInitiatePayment}
                disabled={cart.length === 0 || isProcessing}
              >
                {isProcessing ? 'Procesando...' : (editingPurchase ? 'Guardar Cambios' : 'Generar Código de Pago')}
              </Button>
                <Button variant="outline" className="h-12 w-full text-base font-bold text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={clearCart} disabled={cart.length === 0 && !editingPurchase}>
                {editingPurchase ? 'Cancelar Edición' : 'Vaciar'}
              </Button>
            </CardFooter>
          </Card>
          </aside>
        </div>

        <section className="mt-2">
        <Card className="border bg-background shadow-sm">
          <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <History className="h-5 w-5" />
              Mi Historial de Compras
            </CardTitle>
            <CardDescription>
              Ingrese su número de cédula para ver su historial y modificar compras pendientes.
            </CardDescription>
              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-end">
              <div className="flex-grow">
                <Label htmlFor="search-cedula">Buscar por Cédula</Label>
                <Input 
                  id="search-cedula"
                    name="searchCedula"
                    inputMode="numeric"
                    autoComplete="off"
                    className="mt-1 h-12 text-base"
                  placeholder="Ingrese su número de cédula"
                  value={searchCedula}
                  onChange={(e) => setSearchCedula(e.target.value)}
                />
              </div>
                <Button className="h-12 w-full sm:w-auto" onClick={handleSearchHistory}>Buscar</Button>
            </div>
          </CardHeader>
          <CardContent>
            {isHistoryLoading ? (
              <p className="text-center text-muted-foreground">Buscando...</p>
            ) : purchaseHistory.length > 0 ? (
                <div className="space-y-3">
                  {purchaseHistory.map((purchase) => (
                    <div key={purchase.id} className="rounded-md border p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                          <p className="text-xs font-semibold uppercase text-muted-foreground">Código de pago</p>
                          <p className="font-mono text-base font-bold">{purchase.id}</p>
                          <p className="text-sm text-muted-foreground">{purchase.date}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                          <Badge variant={purchase.status === 'paid' || purchase.status === 'delivered' ? 'default' : 'secondary'} className={purchase.status === 'paid' || purchase.status === 'delivered' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : ''}>
                            {purchase.status === 'pre-sale' ? 'Preventa' : purchase.status === 'pending' ? 'Pendiente' : purchase.status === 'paid' ? 'Pagado' : purchase.status === 'delivered' ? 'Entregado' : 'Cancelado'}
                         </Badge>
                          <span className="text-lg font-black">{formatCurrency(purchase.total)}</span>
                        {purchase.status === 'pending' && (
                            <Button variant="outline" className="h-11" onClick={() => handleEditPurchase(purchase)}>
                                <Pencil className="h-4 w-4" />
                                Modificar
                            </Button>
                        )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
                <p className="rounded-md border border-dashed bg-muted p-6 text-center text-muted-foreground">Ingrese una cédula y haga clic en buscar para ver el historial.</p>
            )}
          </CardContent>
        </Card>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-[1fr_auto] items-center gap-3">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">{cartItemCount} producto{cartItemCount === 1 ? '' : 's'} en el pedido</p>
            <p className="text-xl font-black text-primary">{formatCurrency(subtotal)}</p>
          </div>
          <Button
            className="h-14 px-5 text-sm font-black"
            onClick={handleInitiatePayment}
            disabled={cart.length === 0 || isProcessing}
          >
            {editingPurchase ? 'Guardar' : 'Generar código'}
          </Button>
        </div>
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
                  name="cedula"
                  inputMode="numeric"
                  autoComplete="off"
                  className="h-12 text-base"
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
                  name="celular"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  className="h-12 text-base"
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
              <Button type="button" variant="secondary" className="h-12">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" form="user-info-form" className="h-12" disabled={isProcessing}>
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
