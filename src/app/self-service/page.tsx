
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Trash2, Plus, Minus, ShoppingCart, History, Pencil, QrCode, Smartphone } from "lucide-react";
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
import { addPreSalePurchase, getPurchases, getSelfServicePurchasesByCedula, type NewPurchase, updatePendingPurchase, getSelfServiceReservedQuantities } from '@/lib/services/purchase-service';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { addAuditLog } from '@/lib/services/audit-service';
import { useSupabaseRealtime } from '@/hooks/use-supabase-realtime';
import { MOLLY_LOGO_URL } from '@/components/icons';



const DAVIPLATA_BREB_KEY = process.env.NEXT_PUBLIC_DAVIPLATA_BREB_KEY?.trim() || '';
const DAVIPLATA_BREB_LINK_TEMPLATE = process.env.NEXT_PUBLIC_DAVIPLATA_BREB_PAYMENT_URL?.trim() || '';

const buildDaviplataPaymentHref = (paymentCode: string | null, total: number) => {
  if (!DAVIPLATA_BREB_LINK_TEMPLATE) return '';

  return DAVIPLATA_BREB_LINK_TEMPLATE
    .replaceAll('{code}', encodeURIComponent(paymentCode || ''))
    .replaceAll('{amount}', encodeURIComponent(String(total)))
    .replaceAll('{amount_cents}', encodeURIComponent(String(Math.round(total * 100))))
    .replaceAll('{key}', encodeURIComponent(DAVIPLATA_BREB_KEY));
};

const buildDaviplataQrPayload = (paymentCode: string | null, total: number) => {
  const paymentHref = buildDaviplataPaymentHref(paymentCode, total);

  if (paymentHref) return paymentHref;

  return [
    'Pago por DaviPlata / Bre-B',
    DAVIPLATA_BREB_KEY ? `Llave: ${DAVIPLATA_BREB_KEY}` : 'Llave Bre-B no configurada',
    paymentCode ? `Referencia: ${paymentCode}` : '',
    `Valor: ${formatCurrency(total)}`,
  ].filter(Boolean).join('\n');
};

const buildQrImageUrl = (payload: string) => (
  `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=12&data=${encodeURIComponent(payload)}`
);

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
  const [purchases, setPurchases] = useState<Purchase[]>([]);
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
  const [lastPurchase, setLastPurchase] = useState<Purchase | null>(null);
  const realtimeTables = useMemo(() => ['products', 'purchases'] as const, []);

  const loadProducts = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setIsLoading(true);
    }
    try {
        const [fetchedProducts, fetchedPurchases] = await Promise.all([
          getProductsByAvailability('self-service'),
          getPurchases(),
        ]);
        setProducts(fetchedProducts);
        setPurchases(fetchedPurchases);
    } catch (error)
        {
        console.error("Error fetching products:", error);
    } finally {
        if (showLoading) {
          setIsLoading(false);
        }
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useSupabaseRealtime({
    tables: realtimeTables,
    onChange: () => loadProducts(false),
  });

  const selfServiceReservedQuantities = useMemo(() => getSelfServiceReservedQuantities(purchases), [purchases]);

  const getSelfServiceReserved = useCallback((productId: string) => {
    const reserved = selfServiceReservedQuantities[productId] || 0;
    if (!editingPurchase || (editingPurchase.status !== 'pending' && editingPurchase.status !== 'pre-sale')) {
      return reserved;
    }

    const editingQuantity = editingPurchase.items.find(item => item.id === productId)?.quantity || 0;
    return Math.max(reserved - editingQuantity, 0);
  }, [editingPurchase, selfServiceReservedQuantities]);

  const getAvailableStock = useCallback((product: Product) => {
    return Math.max(product.stock - getSelfServiceReserved(product.id), 0);
  }, [getSelfServiceReserved]);

  useEffect(() => {
    setCart((prevCart) => prevCart.reduce<CartItem[]>((nextCart, item) => {
      const product = products.find((currentProduct) => currentProduct.id === item.id);
      if (!product) return nextCart;

      const availableStock = getAvailableStock(product);
      if (availableStock <= 0) return nextCart;

      nextCart.push({
        ...item,
        stock: availableStock,
        quantity: Math.min(item.quantity, availableStock),
      });
      return nextCart;
    }, []));
  }, [getAvailableStock, products]);

  const addToCart = (item: Product) => {
    const availableStock = getAvailableStock(item);
    setCart((prevCart) => {
      const existingItem = prevCart.find((cartItem) => cartItem.id === item.id);
      
      if (availableStock <= 0) {
          toast({ variant: "destructive", title: "Sin Stock", description: `${item.name} está agotado.` });
          return prevCart;
      }
       if (existingItem && existingItem.quantity >= availableStock) {
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
      return [...prevCart, { id: item.id, name: item.name, price: item.price, quantity: 1, type: 'product', stock: availableStock }];
    });
  };

  const updateQuantity = (id: string, newQuantity: number) => {
    setCart((prevCart) => {
      if (newQuantity <= 0) {
        return prevCart.filter((item) => item.id !== id);
      }

      const itemToUpdate = prevCart.find(item => item.id === id);
      const product = products.find(product => product.id === id);
      const availableStock = product ? getAvailableStock(product) : itemToUpdate?.stock || 0;
      if (itemToUpdate && availableStock < newQuantity) {
        toast({ variant: "destructive", title: "Límite de Stock", description: `Solo quedan ${availableStock} unidades disponibles de ${itemToUpdate.name}.` });
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
        const updatedItems = cart.map(({ stock, ...item }) => item);
        const updatedPurchase = await updatePendingPurchase(editingPurchase.id, updatedItems, {
          customerCedula: searchCedula || editingPurchase.cedula,
          customerCelular: editingPurchase.celular,
          selfServiceOnly: true,
        });
        
        setPaymentCode(editingPurchase.id);
        setLastPurchase(updatedPurchase);
        setSearchCedula(updatedPurchase.cedula);
        setPurchaseHistory(prev => [updatedPurchase, ...prev.filter(purchase => purchase.id !== updatedPurchase.id)]);
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
        status: 'pending', // Autogestión reserva disponibilidad y descuenta stock al confirmar el pago.
    };
    
    try {
        const addedPurchase = await addPreSalePurchase(newPurchaseData);
        setPaymentCode(addedPurchase.id);
        setLastPurchase(addedPurchase);
        setSearchCedula(addedPurchase.cedula);
        setPurchaseHistory(prev => [addedPurchase, ...prev.filter(purchase => purchase.id !== addedPurchase.id)]);
        setIsUserInfoModalOpen(false);
        setIsPaymentModalOpen(true);
        toast({ title: "Éxito", description: "Código de pago generado. La disponibilidad quedó reservada y la compra está pendiente de pago." });
        
        addAuditLog({
          userId: addedPurchase.cedula,
          userName: 'Cliente (Autogestión)',
          action: 'SELF_SERVICE_PURCHASE',
          details: `Nueva compra en sitio #${addedPurchase.id} por ${formatCurrency(addedPurchase.total)} iniciada por C.C. ${addedPurchase.cedula}.`,
        }).catch((auditError) => {
          console.warn("No se pudo registrar auditoría de autogestión.", auditError);
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
        toast({ variant: "destructive", title: "Error", description: "Por favor, ingrese la cédula para buscar." });
        return;
    }
    setIsHistoryLoading(true);
    try {
        const history = await getSelfServicePurchasesByCedula(searchCedula);
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
  }

  const handleEditPurchase = (purchase: Purchase) => {
    const cartItems: CartItem[] = purchase.items.map(item => {
        const product = products.find(p => p.id === item.id);
        return {
            ...item,
            type: 'product',
            stock: product ? getAvailableStock(product) + item.quantity : item.quantity,
        }
    });
    setCart(cartItems);
    setEditingPurchase(purchase);
    setSearchCedula(purchase.cedula);
    toast({ title: "Modo Edición", description: "Los artículos de su compra han sido cargados en el carrito." });
  }


  const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const cartItemCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const paymentTotal = lastPurchase?.id === paymentCode ? lastPurchase.total : subtotal;
  const paymentItems = lastPurchase?.id === paymentCode ? lastPurchase.items : cart;
  const daviplataPaymentHref = buildDaviplataPaymentHref(paymentCode, paymentTotal);
  const daviplataQrPayload = buildDaviplataQrPayload(paymentCode, paymentTotal);
  const daviplataQrImageUrl = buildQrImageUrl(daviplataQrPayload);

  return (
    <div className="min-h-screen overflow-hidden bg-[#120029] pb-32 text-white lg:pb-10">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_18%_18%,rgba(255,0,153,0.34),transparent_28%),radial-gradient(circle_at_86%_12%,rgba(0,229,255,0.28),transparent_24%),linear-gradient(180deg,#230044_0%,#120029_46%,#070012_100%)]" />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 -z-10 h-1/2 bg-[linear-gradient(rgba(0,229,255,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(0,229,255,0.2)_1px,transparent_1px)] bg-[size:54px_54px] [transform:perspective(480px)_rotateX(58deg)] [transform-origin:bottom]" />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-3 py-4 sm:px-6 lg:px-8">
        <header className="relative overflow-hidden rounded-[2rem] border-2 border-cyan-300/70 bg-slate-950/75 px-4 py-5 shadow-[0_0_40px_rgba(0,229,255,0.25)] backdrop-blur sm:px-6">
          <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-fuchsia-500/30 blur-3xl" />
          <div className="absolute -bottom-24 left-8 h-48 w-48 rounded-full bg-cyan-300/25 blur-3xl" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-cyan-300/70 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase tracking-[0.35em] text-cyan-100 shadow-[0_0_18px_rgba(0,229,255,0.35)]">Autogestión</span>
                <span className="rounded-full border border-fuchsia-300/70 bg-fuchsia-400/10 px-3 py-1 text-xs font-black uppercase tracking-[0.25em] text-fuchsia-100">Bingo Gemellista</span>
              </div>
              <h1 className="max-w-3xl text-4xl font-black uppercase leading-none tracking-tight text-white drop-shadow-[0_0_18px_rgba(255,0,153,0.75)] sm:text-6xl">
                Compra rápida 80&apos;s / 90&apos;s
              </h1>
              <p className="max-w-2xl text-sm font-semibold text-cyan-50/90 sm:text-base">
                Elija sus productos en modo arcade, genere el código y pague en caja o por DaviPlata usando la llave Bre-B del colegio.
              </p>
              <div className="flex flex-wrap gap-2 text-xs font-black uppercase tracking-widest text-white/90">
                <span className="rounded-full bg-amber-300 px-3 py-1 text-slate-950">Neón</span>
                <span className="rounded-full bg-fuchsia-500 px-3 py-1">Arcade</span>
                <span className="rounded-full bg-cyan-300 px-3 py-1 text-slate-950">Retro vibes</span>
              </div>
            </div>
            <div className="relative flex min-h-24 min-w-24 shrink-0 rotate-2 items-center justify-center rounded-2xl border-2 border-fuchsia-300 bg-white p-3 shadow-[8px_8px_0_rgba(0,229,255,0.8)] sm:min-h-28 sm:min-w-32 lg:min-h-32 lg:min-w-36">
              <div className="absolute -left-3 -top-3 rounded-full bg-amber-300 px-2 py-1 text-xs font-black uppercase text-slate-950 shadow-[0_0_16px_rgba(252,211,77,0.8)]">VIP</div>
              <Image
                src={MOLLY_LOGO_URL}
                alt="Logo de Molly Ventas"
                width={180}
                height={180}
                className="h-20 w-auto object-contain sm:h-24 lg:h-28"
                priority
              />
            </div>
          </div>
          <div className="relative mt-5 grid grid-cols-3 gap-2 text-center text-xs font-black uppercase tracking-wide text-white sm:max-w-2xl sm:text-sm">
            <div className="rounded-2xl border border-cyan-300/70 bg-cyan-300/15 px-2 py-3 shadow-[0_0_18px_rgba(0,229,255,0.2)]">1. Escoge</div>
            <div className="rounded-2xl border border-fuchsia-300/70 bg-fuchsia-400/15 px-2 py-3 shadow-[0_0_18px_rgba(255,0,153,0.2)]">2. Genera código</div>
            <div className="rounded-2xl border border-amber-300/70 bg-amber-300/15 px-2 py-3 shadow-[0_0_18px_rgba(252,211,77,0.2)]">3. Paga en caja o DaviPlata</div>
          </div>
        </header>

        {editingPurchase && (
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-300/20 px-4 py-3 text-sm font-bold text-amber-50 shadow-[0_0_18px_rgba(252,211,77,0.25)] backdrop-blur">
            Está modificando la compra {editingPurchase.id}. Revise el pedido y guarde los cambios.
          </div>
        )}

        {lastPurchase && !editingPurchase && (
          <Card className="border-2 border-emerald-300/80 bg-emerald-950/70 text-emerald-50 shadow-[0_0_26px_rgba(16,185,129,0.24)] backdrop-blur">
            <CardHeader className="gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl font-black uppercase tracking-wide text-emerald-50">Última compra generada</CardTitle>
                <CardDescription className="text-emerald-100/80">
                  Presente este código en caja o úselo como referencia al pagar por DaviPlata.
                </CardDescription>
              </div>
              <div className="rounded-2xl border border-emerald-300/60 bg-slate-950/60 px-4 py-3 text-center shadow-[0_0_18px_rgba(16,185,129,0.2)]">
                <p className="text-xs font-black uppercase tracking-wide text-emerald-100/70">Código</p>
                <p className="font-mono text-2xl font-black tracking-widest text-amber-300 drop-shadow-[0_0_10px_rgba(252,211,77,0.55)]">{lastPurchase.id}</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {lastPurchase.items.map(item => (
                  <div key={`${lastPurchase.id}-${item.id}`} className="rounded-2xl border border-emerald-300/40 bg-white/10 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold leading-tight">{item.name}</p>
                        <p className="text-sm font-semibold text-emerald-100/70">Cantidad: {item.quantity}</p>
                      </div>
                      <p className="shrink-0 font-black">{formatCurrency(item.price * item.quantity)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-1 border-t border-emerald-300/40 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-semibold text-emerald-100/80">{lastPurchase.date}</span>
                <span className="text-xl font-black text-amber-300">Total: {formatCurrency(lastPurchase.total)}</span>
              </div>
              <div className="rounded-2xl border border-emerald-300/40 bg-white/10 p-3">
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
                  <a
                    href={buildDaviplataPaymentHref(lastPurchase.id, lastPurchase.total) || undefined}
                    target={buildDaviplataPaymentHref(lastPurchase.id, lastPurchase.total) ? "_blank" : undefined}
                    rel={buildDaviplataPaymentHref(lastPurchase.id, lastPurchase.total) ? "noopener noreferrer" : undefined}
                    aria-label="Abrir pago por DaviPlata Bre-B"
                    className={cn(
                      "flex shrink-0 rounded-md border bg-white p-2 shadow-sm",
                      buildDaviplataPaymentHref(lastPurchase.id, lastPurchase.total) ? "cursor-pointer hover:ring-2 hover:ring-primary" : "cursor-default"
                    )}
                  >
                    <img
                      src={buildQrImageUrl(buildDaviplataQrPayload(lastPurchase.id, lastPurchase.total))}
                      alt="QR de pago DaviPlata Bre-B"
                      width={116}
                      height={116}
                      className="h-28 w-28"
                    />
                  </a>
                  <div className="space-y-1 text-center sm:text-left">
                    <p className="flex items-center justify-center gap-2 text-sm font-black uppercase text-emerald-50 sm:justify-start">
                      <QrCode className="h-4 w-4" />
                      Pago por DaviPlata / Bre-B
                    </p>
                    <p className="text-sm text-emerald-100/80">
                      Toque el QR desde el celular para abrir el pago y use el código {lastPurchase.id} como referencia.
                    </p>
                    {DAVIPLATA_BREB_KEY && (
                      <p className="text-xs font-semibold text-emerald-100/70">Llave Bre-B: {DAVIPLATA_BREB_KEY}</p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black uppercase tracking-tight text-white drop-shadow-[0_0_12px_rgba(0,229,255,0.65)]">Productos disponibles</h2>
                <p className="text-sm font-semibold text-cyan-50/80">Toque un producto para agregarlo al pedido.</p>
              </div>
              <Badge variant="secondary" className="shrink-0 border border-cyan-300/70 bg-cyan-300/15 px-3 py-1 text-sm font-black uppercase text-cyan-50 hover:bg-cyan-300/20">
                {products.length} opciones
              </Badge>
            </div>

          {isLoading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-48 animate-pulse rounded-3xl border-2 border-cyan-300/40 bg-white/10" />
                ))}
              </div>
          ) : products.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => {
                const selfServiceReserved = getSelfServiceReserved(product.id);
                const availableStock = Math.max(product.stock - selfServiceReserved, 0);
                const isSoldOut = availableStock <= 0;
                const cartItem = cart.find(item => item.id === product.id);
                const quantityInCart = cartItem ? cartItem.quantity : 0;
                const hasReachedLimit = quantityInCart >= availableStock;
                const productImageUrl = product.imageUrl?.trim()
                  || `https://placehold.co/600x400/e0f2fe/1e3a8a?text=${encodeURIComponent(product.name)}`;

                return (
                    <Card
                      key={product.id}
                      className={cn(
                        "group overflow-hidden rounded-3xl border-2 border-cyan-300/40 bg-slate-950/80 text-white shadow-[0_0_22px_rgba(0,229,255,0.14)] transition hover:-translate-y-1 hover:border-fuchsia-300/80 hover:shadow-[0_0_30px_rgba(255,0,153,0.28)] active:scale-[0.99]",
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
                        <div className="relative aspect-[16/10] overflow-hidden bg-slate-900">
                          <Image
                            src={productImageUrl}
                            alt={product.name}
                            fill
                            sizes="(min-width: 1280px) 280px, (min-width: 640px) 50vw, 100vw"
                            className="object-cover saturate-125 transition-transform group-hover:scale-105"
                            data-ai-hint={product.imageHint}
                          />
                        </div>
                        <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2">
                          {quantityInCart > 0 && (
                              <Badge className="bg-emerald-400 px-3 py-1 text-sm font-black text-slate-950 shadow-[0_0_14px_rgba(52,211,153,0.55)] hover:bg-emerald-400">
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
                          <h3 className="text-lg font-black uppercase leading-snug tracking-wide text-cyan-50">{product.name}</h3>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-2xl font-black text-amber-300 drop-shadow-[0_0_10px_rgba(252,211,77,0.55)]">{formatCurrency(product.price)}</span>
                            <span className="text-right text-xs font-bold text-cyan-50/70">
                              Stock {product.stock}
                              {selfServiceReserved > 0 && ` | Autogestión ${selfServiceReserved}`}
                              {` | Disp. ${availableStock}`}
                            </span>
                          </div>
                        </div>

                        {quantityInCart > 0 ? (
                          <div className="grid grid-cols-[52px_1fr_52px] items-center gap-2">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-12 w-12 rounded-2xl bg-fuchsia-500 text-white shadow-[0_0_16px_rgba(255,0,153,0.35)] hover:bg-fuchsia-400"
                              onClick={() => updateQuantity(product.id, quantityInCart - 1)}
                              aria-label={`Quitar una unidad de ${product.name}`}
                            >
                              <Minus className="h-5 w-5" />
                            </Button>
                            <div className="flex h-12 items-center justify-center rounded-2xl border border-fuchsia-300/60 bg-fuchsia-400/15 text-lg font-black text-white">
                              {quantityInCart}
                            </div>
                            <Button
                              size="icon"
                              className="h-12 w-12 rounded-2xl bg-fuchsia-500 text-white shadow-[0_0_16px_rgba(255,0,153,0.35)] hover:bg-fuchsia-400"
                              onClick={() => updateQuantity(product.id, quantityInCart + 1)}
                              disabled={hasReachedLimit}
                              aria-label={`Agregar una unidad de ${product.name}`}
                            >
                              <Plus className="h-5 w-5" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            className="h-12 w-full rounded-2xl bg-gradient-to-r from-cyan-300 via-fuchsia-500 to-amber-300 text-base font-black uppercase text-slate-950 shadow-[0_0_18px_rgba(0,229,255,0.25)] hover:opacity-95"
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
              <div className="rounded-3xl border-2 border-dashed border-cyan-300/50 bg-slate-950/70 p-8 text-center font-semibold text-cyan-50/75">
                No hay productos disponibles para autoservicio en este momento.
              </div>
          )}
          </section>

          <aside className="space-y-4 lg:sticky lg:top-5">
          <Card className="border-2 border-fuchsia-300/50 bg-slate-950/85 text-white shadow-[0_0_28px_rgba(255,0,153,0.18)] backdrop-blur">
            <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl font-black uppercase tracking-wide text-white">{editingPurchase ? 'Modificar pedido' : 'Tu pedido'}</CardTitle>
                    <CardDescription className="text-cyan-50/70">
                      {cartItemCount > 0 ? `${cartItemCount} producto${cartItemCount === 1 ? '' : 's'} seleccionado${cartItemCount === 1 ? '' : 's'}` : 'El carrito está vacío'}
                    </CardDescription>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-300 text-lg font-black text-slate-950 shadow-[0_0_18px_rgba(0,229,255,0.45)]">
                    {cartItemCount}
                  </div>
                </div>
                {editingPurchase && <CardDescription className="text-cyan-50/70">Código: {editingPurchase.id}</CardDescription>}
            </CardHeader>
              <CardContent className="space-y-4">
                {cart.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-cyan-300/40 bg-white/10 p-6 text-center text-sm font-semibold text-cyan-50/75">
                    Agregue productos para generar su código de pago.
                  </div>
                ) : (
                  <div className="space-y-3">
                      {cart.map(item => (
                      <div key={item.id} className="rounded-2xl border border-cyan-300/30 bg-white/10 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold leading-tight">{item.name}</p>
                            <p className="text-sm font-semibold text-cyan-50/70">{formatCurrency(item.price)} c/u</p>
                          </div>
                          <p className="shrink-0 text-right font-black">{formatCurrency(item.price * item.quantity)}</p>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="grid grid-cols-[44px_48px_44px] items-center gap-2">
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-11 w-11 rounded-2xl border-cyan-300/60 bg-white/10 text-white hover:bg-cyan-300/20"
                                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                aria-label={`Quitar una unidad de ${item.name}`}
                              >
                                <Minus className="h-5 w-5" />
                              </Button>
                            <span className="text-center text-lg font-black">{item.quantity}</span>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-11 w-11 rounded-2xl border-cyan-300/60 bg-white/10 text-white hover:bg-cyan-300/20"
                                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                aria-label={`Agregar una unidad de ${item.name}`}
                              >
                                <Plus className="h-5 w-5" />
                              </Button>
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-11 w-11 rounded-2xl text-fuchsia-200 hover:bg-fuchsia-400/20 hover:text-white"
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
                <div className="rounded-2xl border border-amber-300/50 bg-amber-300/15 p-4">
                  <div className="flex justify-between text-sm font-bold uppercase tracking-wide text-amber-50/80">
                    <span>Total a pagar</span>
                    <span>{cartItemCount} producto{cartItemCount === 1 ? '' : 's'}</span>
                  </div>
                  <div className="mt-1 flex items-end justify-between gap-3">
                    <span className="text-2xl font-black text-white">TOTAL</span>
                    <span className="text-3xl font-black text-amber-300 drop-shadow-[0_0_12px_rgba(252,211,77,0.55)]">{formatCurrency(subtotal)}</span>
                  </div>
                </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button 
                  className="h-14 w-full rounded-2xl bg-gradient-to-r from-cyan-300 via-fuchsia-500 to-amber-300 text-base font-black uppercase text-slate-950 shadow-[0_0_20px_rgba(255,0,153,0.28)] hover:opacity-95 sm:text-lg"
                onClick={handleInitiatePayment}
                disabled={cart.length === 0 || isProcessing}
              >
                {isProcessing ? 'Procesando...' : (editingPurchase ? 'Guardar Cambios' : 'Generar Código de Pago')}
              </Button>
                <Button variant="outline" className="h-12 w-full rounded-2xl border-fuchsia-300/60 bg-white/10 text-base font-bold text-fuchsia-100 hover:bg-fuchsia-400/20 hover:text-white" onClick={clearCart} disabled={cart.length === 0 && !editingPurchase}>
                {editingPurchase ? 'Cancelar Edición' : 'Vaciar'}
              </Button>
            </CardFooter>
          </Card>
          </aside>
        </div>

        <section className="mt-2">
        <Card className="border-2 border-cyan-300/40 bg-slate-950/80 text-white shadow-[0_0_24px_rgba(0,229,255,0.16)] backdrop-blur">
          <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl font-black uppercase tracking-wide text-white">
                <History className="h-5 w-5" />
              Mi Historial de Compras
            </CardTitle>
            <CardDescription className="text-cyan-50/70">
              Ingrese su cédula para ver su historial y modificar compras pendientes.
            </CardDescription>
              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-end">
              <div className="flex-grow">
                <Label htmlFor="search-cedula">Buscar por Cédula</Label>
                <Input 
                  id="search-cedula"
                    name="searchCedula"
                    inputMode="numeric"
                    autoComplete="off"
                    className="mt-1 h-12 rounded-2xl border-cyan-300/50 bg-white/95 text-base text-slate-950 placeholder:text-slate-500"
                  placeholder="Ingrese su número de cédula"
                  value={searchCedula}
                  onChange={(e) => setSearchCedula(e.target.value)}
                />
              </div>
                <Button className="h-12 w-full rounded-2xl bg-cyan-300 px-6 font-black uppercase text-slate-950 hover:bg-cyan-200 sm:w-auto" onClick={handleSearchHistory}>Buscar</Button>
            </div>
          </CardHeader>
          <CardContent>
            {isHistoryLoading ? (
              <p className="text-center text-cyan-50/70">Buscando...</p>
            ) : purchaseHistory.length > 0 ? (
                <div className="space-y-3">
                  {purchaseHistory.map((purchase) => (
                    <div key={purchase.id} className="rounded-2xl border border-cyan-300/30 bg-white/10 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                          <p className="text-xs font-black uppercase tracking-wide text-cyan-50/65">Código de pago</p>
                          <p className="font-mono text-base font-bold">{purchase.id}</p>
                          <p className="text-sm font-semibold text-cyan-50/70">{purchase.date}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                          <Badge variant={purchase.status === 'paid' || purchase.status === 'delivered' ? 'default' : 'secondary'} className={purchase.status === 'paid' || purchase.status === 'delivered' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : ''}>
                            {purchase.status === 'pre-sale' ? 'Preventa' : purchase.status === 'pending' ? 'Pendiente' : purchase.status === 'paid' ? 'Pagado' : purchase.status === 'delivered' ? 'Entregado' : 'Cancelado'}
                         </Badge>
                          <span className="text-lg font-black">{formatCurrency(purchase.total)}</span>
                        {(purchase.status === 'pending' || purchase.status === 'pre-sale') && (
                            <Button variant="outline" className="h-11 rounded-2xl border-fuchsia-300/60 bg-white/10 text-fuchsia-50 hover:bg-fuchsia-400/20 hover:text-white" onClick={() => handleEditPurchase(purchase)}>
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
                <p className="rounded-2xl border-2 border-dashed border-cyan-300/40 bg-white/10 p-6 text-center font-semibold text-cyan-50/70">Ingrese la cédula para ver el historial.</p>
            )}
          </CardContent>
        </Card>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-cyan-300/60 bg-slate-950/95 p-3 shadow-[0_-8px_30px_rgba(0,229,255,0.18)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-[1fr_auto] items-center gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-50/75">{cartItemCount} producto{cartItemCount === 1 ? '' : 's'} en el pedido</p>
            <p className="text-xl font-black text-amber-300">{formatCurrency(subtotal)}</p>
          </div>
          <Button
            className="h-14 rounded-2xl bg-gradient-to-r from-cyan-300 via-fuchsia-500 to-amber-300 px-5 text-sm font-black uppercase text-slate-950"
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
                    Su compra está pendiente. Puede pagar en caja o por DaviPlata/Bre-B; después presente este código para confirmar y recibir sus productos.
                </p>
            </div>
            <div className="text-center">
                <p className="text-sm text-muted-foreground">Su código de pago único es:</p>
                <div className="my-2 p-4 bg-muted rounded-md">
                <p className="text-2xl sm:text-3xl font-bold font-mono tracking-widest text-primary">{paymentCode}</p>
                </div>
            </div>

            <div className="rounded-md border bg-background p-4 text-center">
              <div className="mb-3 flex items-center justify-center gap-2 font-black text-primary">
                <Smartphone className="h-5 w-5" />
                Pago por DaviPlata / Bre-B
              </div>
              <a
                href={daviplataPaymentHref || undefined}
                target={daviplataPaymentHref ? "_blank" : undefined}
                rel={daviplataPaymentHref ? "noopener noreferrer" : undefined}
                aria-label="Abrir pago por DaviPlata Bre-B"
                className={cn(
                  "mx-auto flex w-fit rounded-md border bg-white p-3 shadow-sm",
                  daviplataPaymentHref ? "cursor-pointer hover:ring-2 hover:ring-primary" : "cursor-default"
                )}
              >
                <img
                  src={daviplataQrImageUrl}
                  alt="QR de pago DaviPlata Bre-B"
                  width={220}
                  height={220}
                  className="h-52 w-52"
                />
              </a>
              <p className="mt-3 text-sm font-semibold">
                Toque el QR desde este celular para abrir el pago por DaviPlata.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Use el código {paymentCode} como referencia y pague exactamente {formatCurrency(paymentTotal)}.
              </p>
              {DAVIPLATA_BREB_KEY ? (
                <p className="mt-2 rounded-md bg-muted px-3 py-2 text-xs font-semibold">
                  Llave Bre-B DaviPlata del colegio: {DAVIPLATA_BREB_KEY}
                </p>
              ) : (
                <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                  Configure NEXT_PUBLIC_DAVIPLATA_BREB_KEY para mostrar la llave Bre-B real del colegio.
                </p>
              )}
            </div>

            <div>
                <h4 className="font-semibold mb-2 text-center">Resumen de la Compra</h4>
                <div className="max-h-32 overflow-y-auto border rounded-md p-2">
                    <ul className="text-sm space-y-1">
                        {paymentItems.map(item => (
                            <li key={item.id} className="flex justify-between">
                                <span>{item.name} (x{item.quantity})</span>
                                <span>{formatCurrency(item.price * item.quantity)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                 <div className="flex justify-between font-bold text-lg mt-2 pt-2 border-t">
                    <span>Total a Pagar:</span>
                    <span>{formatCurrency(paymentTotal)}</span>
                </div>
            </div>

          </div>
          <Button onClick={closeModal} className="w-full">Entendido</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
