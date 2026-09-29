
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
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
import { Trash2, Plus, Minus, ShoppingCart, Pencil, QrCode, Smartphone, PlayCircle, Copy, CheckCircle2, Landmark } from "lucide-react";
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
import { addPreSalePurchase, getSelfServiceReservedQuantityMap, sanitizeCustomerPhone, type NewPurchase, updatePendingPurchase } from '@/lib/services/purchase-service';
import { useToast } from '@/hooks/use-toast';
import { useSupabaseRealtime } from '@/hooks/use-supabase-realtime';
import { Badge } from '@/components/ui/badge';
import { MOLLY_LOGO_URL } from '@/components/icons';
import { PurchaseModifiedIndicator } from '@/components/purchase-modified-indicator';
import { LocalQrCode } from '@/components/local-qr-code';
import { reportBrebPayment } from '@/lib/services/payment-service';



const BREB_ENABLED = process.env.NEXT_PUBLIC_BREB_ENABLED !== 'false';
const BREB_KEY = process.env.NEXT_PUBLIC_BREB_KEY?.trim() || '';
const BREB_ACCOUNT_NAME = process.env.NEXT_PUBLIC_BREB_ACCOUNT_NAME?.trim() || 'Colegio Franciscano Agustín Gemelli';
const BREB_QR_PAYLOAD = process.env.NEXT_PUBLIC_BREB_QR_PAYLOAD?.trim() || '';
const SELF_SERVICE_REFRESH_INTERVAL_MS = 60_000;
const SELF_SERVICE_REFRESH_JITTER_MS = 15_000;

const buildDeliveryQrPayload = (purchase: Purchase) => (
  purchase.qrPayload || `/dashboard/redeem?code=${encodeURIComponent(purchase.id)}&delivery=${encodeURIComponent(purchase.deliveryCode || '')}`
);

const getReservationExpiryLabel = (purchase?: Purchase | null) => {
  if (!purchase?.reservationExpiresAt || purchase.status !== 'pending') return null;
  const expiresAt = new Date(purchase.reservationExpiresAt);
  if (Number.isNaN(expiresAt.getTime())) return null;

  return new Intl.DateTimeFormat('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(expiresAt);
};

const getPurchaseSource = (purchase: Purchase) => (
  purchase.purchaseSource
    ?? (purchase.id.startsWith('CG') ? 'pos' : purchase.sellerId ? 'presale' : 'self-service')
);

const getPurchaseSourceLabel = (purchase: Purchase) => {
  const source = getPurchaseSource(purchase);
  if (source === 'pos') return 'Compra realizada en caja';
  if (source === 'presale') return 'Preventa';
  return 'Compra de autogestión';
};

const toServerCartItems = (items: CartItem[]) => (
  items.map(({ id, quantity }) => ({
    id,
    quantity,
    name: '',
    price: 0,
  }))
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
  const [reservedQuantities, setReservedQuantities] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isUserInfoModalOpen, setIsUserInfoModalOpen] = useState(false);
  const [paymentCode, setPaymentCode] = useState<string | null>(null);
  const [purchaseHistory, setPurchaseHistory] = useState<Purchase[]>([]);
  const [editablePurchaseIds, setEditablePurchaseIds] = useState<Set<string>>(() => new Set());
  const [celular, setCelular] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [lastPurchase, setLastPurchase] = useState<Purchase | null>(null);
  const [paymentStep, setPaymentStep] = useState<'choice' | 'breb' | 'reported'>('choice');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [reportedPaymentIds, setReportedPaymentIds] = useState<Set<string>>(() => new Set());
  const realtimeTables = useMemo(() => ['products', 'purchases', 'self_service_reservations'] as const, []);

  const loadProducts = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setIsLoading(true);
    }
    try {
        const [fetchedProducts, fetchedReservedQuantities] = await Promise.all([
          getProductsByAvailability('self-service'),
          getSelfServiceReservedQuantityMap(undefined, 0),
        ]);
        setProducts(fetchedProducts);
        setReservedQuantities(fetchedReservedQuantities);
    } catch {
        console.warn("No se pudieron cargar productos de autogestión.");
    } finally {
        if (showLoading) {
          setIsLoading(false);
        }
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);
  const refreshSelfServiceData = useCallback(async () => {
    await loadProducts(false);
  }, [loadProducts]);

  useSupabaseRealtime({
    tables: realtimeTables,
    onChange: refreshSelfServiceData,
    fallbackIntervalMs: SELF_SERVICE_REFRESH_INTERVAL_MS,
  });

  useEffect(() => {
    const initialJitter = Math.floor(Math.random() * SELF_SERVICE_REFRESH_JITTER_MS);
    let intervalId: number | null = null;

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshSelfServiceData();
      }
    };

    const timeoutId = window.setTimeout(() => {
      refreshIfVisible();
      intervalId = window.setInterval(refreshIfVisible, SELF_SERVICE_REFRESH_INTERVAL_MS);
    }, initialJitter);

    window.addEventListener('focus', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId) {
        window.clearInterval(intervalId);
      }
      window.removeEventListener('focus', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [refreshSelfServiceData]);
  const getSelfServiceReserved = useCallback((productId: string) => {
    const reserved = reservedQuantities[productId] || 0;
    if (!editingPurchase || (editingPurchase.status !== 'pending' && editingPurchase.status !== 'pre-sale')) {
      return reserved;
    }

    const editingQuantity = editingPurchase.items.find(item => item.id === productId)?.quantity || 0;
    return Math.max(reserved - editingQuantity, 0);
  }, [editingPurchase, reservedQuantities]);

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
        const updatedItems = toServerCartItems(cart);
        const updatedPurchase = await updatePendingPurchase(editingPurchase.id, updatedItems, {
          selfServiceOnly: true,
        });
        
        setPaymentCode(editingPurchase.id);
        setLastPurchase(updatedPurchase);
        setPaymentStep('choice');
        setEditablePurchaseIds(prev => new Set(prev).add(updatedPurchase.id));
        setPurchaseHistory(prev => [updatedPurchase, ...prev.filter(purchase => purchase.id !== updatedPurchase.id)]);
        setIsPaymentModalOpen(true);
        toast({ title: "Éxito", description: "Su compra ha sido actualizada correctamente." });

    } catch (error) {
        console.warn("No se pudo actualizar la compra de autogestión.");
        toast({ variant: "destructive", title: "Error al Actualizar", description: (error as Error).message || "No se pudo actualizar la compra." });
    } finally {
        setIsProcessing(false);
    }
  };


  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0 || !celular) return;
    setIsProcessing(true);

    let normalizedCelular: string;
    try {
        normalizedCelular = sanitizeCustomerPhone(celular);
    } catch (error) {
        toast({
          variant: "destructive",
          title: "Revise el celular",
          description: error instanceof Error ? error.message : "Ingrese un celular válido.",
        });
        setIsProcessing(false);
        return;
    }

    const newPurchaseData: NewPurchase = {
        date: new Date().toLocaleString('es-CO'),
        total: 0,
        items: toServerCartItems(cart),
        cedula: '',
        celular: normalizedCelular,
        status: 'pending', // Autogestión reserva disponibilidad y descuenta stock cuando el vendedor registra la entrega.
    };
    
    try {
        const addedPurchase = await addPreSalePurchase(newPurchaseData);
        setPaymentCode(addedPurchase.id);
        setLastPurchase(addedPurchase);
        setPaymentStep('choice');
        setCelular(addedPurchase.celular);
        setEditablePurchaseIds(prev => new Set(prev).add(addedPurchase.id));
        setPurchaseHistory(prev => [addedPurchase, ...prev.filter(purchase => purchase.id !== addedPurchase.id)]);
        setIsUserInfoModalOpen(false);
        setIsPaymentModalOpen(true);
        toast({ title: "Éxito", description: "Código de pago generado. La disponibilidad quedó reservada y la compra está pendiente de pago." });
        
    } catch (error) {
        console.warn("No se pudo crear la compra de autogestión.");
        toast({ variant: "destructive", title: "Error en la Compra", description: (error as Error).message || "No se pudo generar el código de pago." });
    } finally {
        setIsProcessing(false);
    }
  };

  const closeModal = () => {
      setIsPaymentModalOpen(false);
      setPaymentCode(null);
      setCelular('');
      setPaymentStep('choice');
      setCopiedField(null);
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
    setCelular(purchase.celular);
    toast({ title: "Modo Edición", description: "Los artículos de su compra han sido cargados en el carrito." });
  }


  const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const cartItemCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const paymentTotal = lastPurchase?.id === paymentCode ? lastPurchase.total : subtotal;
  const paymentItems = lastPurchase?.id === paymentCode ? lastPurchase.items : cart;
  const reservationExpiryLabel = getReservationExpiryLabel(lastPurchase);
  const copyValue = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedField(label);
    window.setTimeout(() => setCopiedField(current => current === label ? null : current), 1800);
  };
  const handleReportPayment = async () => {
    if (!paymentCode) return;
    setIsProcessing(true);
    try {
      await reportBrebPayment(paymentCode);
      setReportedPaymentIds(current => new Set(current).add(paymentCode));
      setPaymentStep('reported');
      toast({ title: 'Pago reportado', description: 'El colegio verificará el ingreso. La compra aún no está marcada como pagada.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo reportar', description: error instanceof Error ? error.message : 'Intente nuevamente.' });
    } finally {
      setIsProcessing(false);
    }
  };
  const canShowSessionActions = (purchase: Purchase) => editablePurchaseIds.has(purchase.id);
  const getPurchaseStatusLabel = (status: Purchase['status']) => {
    switch (status) {
      case 'pending':
        return 'Pendiente de pago';
      case 'paid':
        return 'Pagado';
      case 'delivered':
        return 'Entregado';
      case 'partially-delivered':
        return 'Entrega parcial';
      case 'pre-sale':
        return 'Preventa pendiente';
      case 'pre-sale-confirmed':
        return 'Preventa confirmada';
      case 'cancelled':
        return 'Cancelado';
      default:
        return status;
    }
  };

  const getPurchaseStatusClassName = (status: Purchase['status']) => (
    status === 'paid' || status === 'delivered' || status === 'partially-delivered' || status === 'pre-sale-confirmed'
      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
      : status === 'cancelled'
        ? 'bg-red-100 text-red-700 hover:bg-red-100'
        : 'bg-[#fff7cf] text-[#8a6f12] hover:bg-[#fff7cf]'
  );

  return (
    <div className="self-service-theme min-h-[100dvh] overflow-hidden bg-background pb-32 pt-14 text-foreground transition-colors duration-300 sm:pt-4 lg:pb-10">
      <div className="self-service-bg pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_88%_8%,rgba(13,77,139,0.12),transparent_28%),linear-gradient(180deg,#fbfdff_0%,#f4f7fb_60%,#edf4fb_100%)]" />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-3 py-4 sm:px-6 lg:px-8">
        <header className="relative overflow-hidden rounded-[1.5rem] bg-[#073b72] px-5 py-5 text-white shadow-[0_24px_60px_-42px_rgba(7,59,114,0.8)] sm:px-7">
          <div className="flex items-center justify-between gap-4 border-b border-[#f2c84b]/35 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-11 items-center justify-center rounded-[0.7rem] bg-white p-1.5">
                <Image src={MOLLY_LOGO_URL} alt="Molly Ventas" width={96} height={96} className="h-full w-full object-contain" priority />
              </div>
              <div>
                <p className="text-sm font-semibold">Ventas ColGemelli</p>
                <p className="text-xs text-white/70">Colegio Franciscano Agustín Gemelli</p>
              </div>
            </div>
            <span className="rounded-full border border-[#f2c84b]/80 bg-[#f2c84b]/10 px-3 py-1.5 text-xs font-semibold text-[#ffe07a]">Autogestión</span>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-center">
            <div>
              <p className="text-sm font-semibold text-[#f2c84b]">Compra sin iniciar sesión</p>
              <h1 className="mt-1.5 max-w-3xl text-[clamp(2.25rem,4.5vw,3.5rem)] font-bold leading-[0.98] tracking-[-0.045em]">
                Arme su pedido de forma sencilla.
              </h1>
              <p className="mt-2.5 max-w-2xl text-sm leading-6 text-white/75 sm:text-base">
                Elija los productos, revise el resumen y genere su código. Solo necesita un número de celular para continuar.
              </p>
            </div>

            <ol className="overflow-hidden rounded-[1rem] border border-[#f2c84b]/55 bg-[#0d4d8b] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <li className="grid grid-cols-[32px_1fr] gap-3 border-b border-white/15 px-4 py-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f2c84b] font-bold text-[#073b72]">1</span>
                <div><p className="font-semibold">Elija</p><p className="text-sm leading-5 text-white/70">Agregue los productos que necesita.</p></div>
              </li>
              <li className="grid grid-cols-[32px_1fr] gap-3 border-b border-white/15 px-4 py-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f2c84b] font-bold text-[#073b72]">2</span>
                <div><p className="font-semibold">Confirme</p><p className="text-sm leading-5 text-white/70">Revise cantidades y registre su celular.</p></div>
              </li>
              <li className="grid grid-cols-[32px_1fr] gap-3 px-4 py-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f2c84b] font-bold text-[#073b72]">3</span>
                <div><p className="font-semibold">Pague y reciba</p><p className="text-sm leading-5 text-white/70">Use el código en caja o pague con Bre-B.</p></div>
              </li>
            </ol>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-[#f2c84b]/35 pt-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-white/70">¿Es su primera compra? Consulte la guía completa antes de empezar.</p>
            <Button asChild variant="ghost" className="h-11 justify-start rounded-xl border border-[#f2c84b]/70 px-4 font-semibold text-[#ffe07a] hover:bg-[#f2c84b] hover:text-[#073b72] sm:justify-center">
              <Link href="/self-service/tutorial">
                <PlayCircle className="h-5 w-5" />
                Ver guía de compra
              </Link>
            </Button>
          </div>
        </header>

        {editingPurchase && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 shadow-sm dark:border-amber-700 dark:bg-amber-950/35 dark:text-amber-100">
            Está modificando la compra {editingPurchase.id}. Revise el pedido y guarde los cambios.
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold tracking-[-0.025em] text-[#202522]">Productos disponibles</h2>
                <p className="text-sm text-[#68706a]">Seleccione un producto para agregarlo al pedido.</p>
              </div>
              <Badge variant="secondary" className="shrink-0 border border-[#d7e1ec] bg-white px-3 py-1 text-sm font-semibold text-[#0d4d8b] hover:bg-white">
                {products.length} opciones
              </Badge>
            </div>

          {isLoading ? (
              <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-40 animate-pulse rounded-2xl border border-[#d7e1ec] bg-white/70 sm:h-48" />
                ))}
              </div>
          ) : products.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3">
              {products.map((product) => {
                const selfServiceReserved = getSelfServiceReserved(product.id);
                const availableStock = Math.max(product.stock - selfServiceReserved, 0);
                const isSoldOut = availableStock <= 0;
                const cartItem = cart.find(item => item.id === product.id);
                const quantityInCart = cartItem ? cartItem.quantity : 0;
                const hasReachedLimit = quantityInCart >= availableStock;
                const productImageUrl = product.imageUrl?.trim()
                  || `https://placehold.co/600x400/e5f0eb/174f43?text=${encodeURIComponent(product.name)}`;

                return (
                    <Card
                      key={product.id}
                      className={cn(
                        "group overflow-hidden rounded-2xl border border-[#d7e1ec] bg-white text-[#172434] shadow-[0_16px_36px_-30px_rgba(7,59,114,0.34)] transition duration-200 hover:-translate-y-0.5 hover:border-[#6c9bc3] hover:shadow-[0_24px_44px_-30px_rgba(7,59,114,0.38)] active:translate-y-px",
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
                        <div className="relative aspect-[16/10] overflow-hidden bg-[#edf4fb]">
                          <Image
                            src={productImageUrl}
                            alt={product.name}
                            fill
                            sizes="(min-width: 1280px) 280px, (min-width: 640px) 50vw, 50vw"
                            className="object-cover saturate-100 transition-transform group-hover:scale-105"
                            data-ai-hint={product.imageHint}
                          />
                        </div>
                        <div className="absolute left-2 top-2 z-10 flex flex-wrap gap-1 sm:left-3 sm:top-3 sm:gap-2">
                          {quantityInCart > 0 && (
                              <Badge className="bg-[#0d4d8b] px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-[#0d4d8b] sm:px-3 sm:py-1 sm:text-sm">
                                {quantityInCart} en pedido
                              </Badge>
                          )}
                          {hasReachedLimit && !isSoldOut && (
                              <Badge variant="destructive" className="px-2 py-0.5 text-[10px] sm:px-3 sm:py-1 sm:text-sm">Límite</Badge>
                          )}
                        </div>
                        {isSoldOut && (
                          <div className="absolute inset-0 flex items-center justify-center bg-[#202522]/60">
                            <Badge variant="destructive" className="px-3 py-1 text-xs sm:px-4 sm:py-2 sm:text-base">Agotado</Badge>
                          </div>
                        )}
                      </button>

                      <CardContent className="space-y-2 p-2.5 sm:space-y-3 sm:p-4">
                        <div className="min-h-[58px] space-y-1 sm:min-h-[72px]">
                          <h3 className="text-sm font-bold leading-snug text-[#202522] sm:text-lg">{product.name}</h3>
                          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                            <span className="text-lg font-bold text-[#0d4d8b] sm:text-2xl">{formatCurrency(product.price)}</span>
                            <span className="text-[10px] font-medium leading-tight text-[#68706a] sm:text-right sm:text-xs">
                              {availableStock} disponible{availableStock === 1 ? '' : 's'}
                              {selfServiceReserved > 0 && ` · ${selfServiceReserved} reservado${selfServiceReserved === 1 ? '' : 's'}`}
                            </span>
                          </div>
                        </div>

                        {quantityInCart > 0 ? (
                          <div className="grid grid-cols-[40px_1fr_40px] items-center gap-1.5 sm:grid-cols-[52px_1fr_52px] sm:gap-2">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-10 w-10 rounded-xl border-[#cbd9e8] bg-white text-[#0d4d8b] hover:bg-[#fff3c4] sm:h-12 sm:w-12"
                              onClick={() => updateQuantity(product.id, quantityInCart - 1)}
                              aria-label={`Quitar una unidad de ${product.name}`}
                            >
                              <Minus className="h-4 w-4 sm:h-5 sm:w-5" />
                            </Button>
                            <div className="flex h-10 items-center justify-center rounded-xl border border-[#cbd9e8] bg-[#f0f5fa] text-base font-bold text-[#172434] sm:h-12 sm:text-lg">
                              {quantityInCart}
                            </div>
                            <Button
                              size="icon"
                              className="h-10 w-10 rounded-xl bg-[#0d4d8b] text-white hover:bg-[#073b72] sm:h-12 sm:w-12"
                              onClick={() => updateQuantity(product.id, quantityInCart + 1)}
                              disabled={hasReachedLimit}
                              aria-label={`Agregar una unidad de ${product.name}`}
                            >
                              <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            className="h-10 w-full rounded-xl bg-[#0d4d8b] text-xs font-semibold text-white shadow-none hover:bg-[#073b72] active:translate-y-px sm:h-12 sm:text-sm"
                            onClick={() => addToCart(product)}
                            disabled={isSoldOut || hasReachedLimit}
                          >
                            <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5" />
                            Agregar
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                )
              })}
            </div>
          ) : (
              <div className="rounded-2xl border border-dashed border-[#cbd9e8] bg-white/70 p-8 text-center text-[#5f6f82]">
                No hay productos disponibles en Autogestión por el momento.
              </div>
          )}
          </section>

          <aside className="space-y-4 lg:sticky lg:top-5">
          <Card className="border border-[#d7e1ec] bg-white text-[#172434] shadow-[0_24px_56px_-36px_rgba(7,59,114,0.34)]">
            <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl font-bold tracking-[-0.02em] text-[#202522]">{editingPurchase ? 'Modificar pedido' : 'Su pedido'}</CardTitle>
                    <CardDescription className="text-[#68706a]">
                      {cartItemCount > 0 ? `${cartItemCount} producto${cartItemCount === 1 ? '' : 's'} seleccionado${cartItemCount === 1 ? '' : 's'}` : 'El carrito está vacío'}
                    </CardDescription>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff3c4] text-lg font-bold text-[#073b72]">
                    {cartItemCount}
                  </div>
                </div>
                {editingPurchase && <CardDescription className="font-mono text-[#68706a]">Código: {editingPurchase.id}</CardDescription>}
            </CardHeader>
              <CardContent className="space-y-4">
                {cart.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#cbd9e8] bg-[#f6f9fc] p-6 text-center text-sm text-[#5f6f82]">
                    Su pedido está vacío. Agregue un producto para comenzar.
                  </div>
                ) : (
                  <div className="space-y-3">
                      {cart.map(item => (
                      <div key={item.id} className="rounded-2xl border border-[#d7e1ec] bg-[#f6f9fc] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold leading-tight">{item.name}</p>
                            <p className="text-sm text-[#68706a]">{formatCurrency(item.price)} por unidad</p>
                          </div>
                          <p className="shrink-0 text-right font-black">{formatCurrency(item.price * item.quantity)}</p>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="grid grid-cols-[44px_48px_44px] items-center gap-2">
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-11 w-11 rounded-xl border-[#cbd9e8] bg-white text-[#0d4d8b] hover:bg-[#fff3c4]"
                                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                aria-label={`Quitar una unidad de ${item.name}`}
                              >
                                <Minus className="h-5 w-5" />
                              </Button>
                            <span className="text-center text-lg font-bold">{item.quantity}</span>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-11 w-11 rounded-xl border-[#cbd9e8] bg-white text-[#0d4d8b] hover:bg-[#fff3c4]"
                                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                aria-label={`Agregar una unidad de ${item.name}`}
                              >
                                <Plus className="h-5 w-5" />
                              </Button>
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-11 w-11 rounded-xl text-[#b42318] hover:bg-red-50 hover:text-[#912018]"
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
                <div className="rounded-2xl border border-[#f2c84b] bg-[#fff3c4] p-4">
                  <div className="flex justify-between text-sm font-medium text-[#42566d]">
                    <span>Total a pagar</span>
                    <span>{cartItemCount} producto{cartItemCount === 1 ? '' : 's'}</span>
                  </div>
                  <div className="mt-1 flex items-end justify-between gap-3">
                    <span className="text-xl font-bold text-[#202522]">Total</span>
                    <span className="text-3xl font-bold text-[#073b72]">{formatCurrency(subtotal)}</span>
                  </div>
                </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button 
                  className="h-14 w-full rounded-xl bg-[#0d4d8b] text-base font-semibold text-white shadow-none hover:bg-[#073b72] active:translate-y-px"
                onClick={handleInitiatePayment}
                disabled={cart.length === 0 || isProcessing}
              >
                {isProcessing ? 'Procesando...' : (editingPurchase ? 'Guardar Cambios' : 'Generar Código de Pago')}
              </Button>
                <Button variant="outline" className="h-12 w-full rounded-xl border-[#cbd9e8] bg-white text-base font-semibold text-[#42566d] hover:bg-[#edf4fb] hover:text-[#172434]" onClick={clearCart} disabled={cart.length === 0 && !editingPurchase}>
                {editingPurchase ? 'Cancelar Edición' : 'Vaciar'}
              </Button>
            </CardFooter>
          </Card>
          </aside>
        </div>

        <section className="mt-2">
        <Card className="border border-[#d7e1ec] bg-white text-[#172434] shadow-[0_22px_52px_-38px_rgba(7,59,114,0.32)]">
          <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl font-bold tracking-[-0.02em] text-[#202522]">
                <QrCode className="h-5 w-5" />
                Compras de esta sesión
              </CardTitle>
              <CardDescription className="text-[#68706a]">
                Aquí aparecen los pedidos generados en este dispositivo mientras la página permanezca abierta.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {purchaseHistory.length > 0 ? (
                <div className="space-y-3">
                  {purchaseHistory.map((purchase) => {
                    const hasSessionActions = canShowSessionActions(purchase);
                    const purchaseSource = getPurchaseSource(purchase);

                    return (
                      <div key={purchase.id} className="rounded-2xl border border-[#d7e1ec] bg-[#f6f9fc] p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 space-y-3">
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-[#0d4d8b]">Código de compra</p>
                            <p className="font-mono text-base font-bold">{purchase.id}</p>
                            <p className="text-sm text-[#68706a]">{purchase.date}</p>
                            <Badge variant="outline" className="mt-1 w-fit border-[#cbd9e8] bg-white text-[#0d4d8b]">
                              {getPurchaseSourceLabel(purchase)}
                            </Badge>
                          </div>
                          <PurchaseModifiedIndicator purchase={purchase} audience="parent" showDetails />
                          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {purchase.items.map((item) => (
                              <div key={`${purchase.id}-${item.id}`} className="rounded-2xl border border-[#d7e1ec] bg-white p-3">
                                <p className="font-bold leading-tight text-[#202522]">{item.name}</p>
                                <p className="text-sm text-[#68706a]">Cantidad: {item.quantity}</p>
                                {purchaseSource === 'pos' ? (
                                  <p className="text-xs font-semibold text-emerald-700">Comprado y pagado en caja</p>
                                ) : (
                                  <p className="text-xs font-semibold text-[#0d4d8b]">Entregado: {item.deliveredQuantity || 0} · Pendiente: {Math.max(item.quantity - (item.deliveredQuantity || 0), 0)}</p>
                                )}
                                <p className="text-sm font-bold text-[#0d4d8b]">{formatCurrency(item.price * item.quantity)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
                          {hasSessionActions ? (
                            <div className="rounded-2xl border border-[#cbd9e8] bg-white p-3 text-center shadow-sm">
                              <LocalQrCode
                                value={buildDeliveryQrPayload(purchase)}
                                label={`QR de entrega ${purchase.id}`}
                                className="mx-auto h-28 w-28"
                              />
                              <p className="mt-2 text-xs font-semibold text-[#0d4d8b]">Código adicional</p>
                              <p className="font-mono text-lg font-bold text-[#0d4d8b]">{purchase.deliveryCode || 'Pendiente'}</p>
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-[#cbd9e8] bg-white p-3 text-center shadow-sm">
                              <p className="text-xs font-semibold text-[#0d4d8b]">
                                {purchaseSource === 'pos' ? 'Compra en punto de venta' : 'Compra anterior'}
                              </p>
                              <p className="mt-1 text-sm text-[#68706a]">
                                {purchaseSource === 'pos' ? 'Registrada en caja.' : 'Compra registrada anteriormente.'}
                              </p>
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                            <Badge variant="secondary" className={getPurchaseStatusClassName(purchase.status)}>
                              {purchase.status === 'pending' && reportedPaymentIds.has(purchase.id)
                                ? 'Pago Bre-B reportado'
                                : getPurchaseStatusLabel(purchase.status)}
                            </Badge>
                            <span className="text-lg font-black">{formatCurrency(purchase.total)}</span>
                            {hasSessionActions && (purchase.status === 'pending' || purchase.status === 'pre-sale') && (
                              <Button variant="outline" className="h-11 rounded-xl border-[#cbd9e8] bg-white text-[#0d4d8b] hover:bg-[#fff3c4] hover:text-[#073b72]" onClick={() => handleEditPurchase(purchase)}>
                                <Pencil className="h-4 w-4" />
                                Modificar
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
                <p className="rounded-2xl border border-dashed border-[#cbd9e8] bg-[#f6f9fc] p-6 text-center text-[#5f6f82]">Cuando genere un pedido, podrá consultar aquí su código y estado.</p>
            )}
          </CardContent>
        </Card>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#cbd9e8] bg-white/95 p-3 shadow-[0_-12px_32px_rgba(7,59,114,0.14)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-[1fr_auto] items-center gap-3">
          <div>
            <p className="text-xs font-medium text-[#68706a]">{cartItemCount} producto{cartItemCount === 1 ? '' : 's'} en el pedido</p>
            <p className="text-xl font-bold text-[#0d4d8b]">{formatCurrency(subtotal)}</p>
          </div>
          <Button
            className="h-14 rounded-xl bg-[#0d4d8b] px-5 text-sm font-semibold text-white hover:bg-[#073b72]"
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
              Ingrese su celular para generar el código de pago y proteger esta sesión.
            </DialogDesc>
          </DialogHeader>
          <form id="user-info-form" onSubmit={handleConfirmPayment}>
            <div className="grid gap-4 py-4">
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
            {editingPurchase && lastPurchase && (
              <PurchaseModifiedIndicator purchase={lastPurchase} audience="parent" showDetails />
            )}
            <div className="text-center p-4 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 rounded-md border border-yellow-200 dark:border-yellow-800">
                <p className="text-base font-semibold">
                    Su compra está pendiente. Puede pagar en el colegio o con Bre-B; el personal debe verificar el ingreso antes de marcarla como pagada.
                </p>
            </div>
            <div className="text-center">
                <p className="text-sm text-muted-foreground">Su código de pago único es:</p>
                <div className="my-2 p-4 bg-muted rounded-md">
                <p className="text-2xl sm:text-3xl font-bold font-mono tracking-widest text-primary">{paymentCode}</p>
                </div>
            </div>

            {lastPurchase && (
              <div className="rounded-md border bg-background p-4 text-center">
                <div className="mb-3 flex items-center justify-center gap-2 font-black text-primary">
                  <QrCode className="h-5 w-5" />
                  QR único de entrega
                </div>
                <LocalQrCode
                  value={buildDeliveryQrPayload(lastPurchase)}
                  label={`QR de entrega ${lastPurchase.id}`}
                  className="mx-auto"
                />
                <p className="mt-3 text-sm font-semibold">Código adicional para validar: <span className="font-mono text-lg text-primary">{lastPurchase.deliveryCode}</span></p>
              </div>
            )}

            <div className="rounded-2xl border border-[#cbd9e8] bg-[#f6f9fc] p-4">
              {paymentStep === 'choice' && (
                <div className="space-y-3 text-left">
                  <p className="text-sm font-bold text-[#073b72]">¿Cómo desea pagar?</p>
                  {BREB_ENABLED && (
                    <Button type="button" className="h-14 w-full bg-[#0d4d8b] text-white active:scale-[0.98]" onClick={() => setPaymentStep('breb')}>
                      <Landmark className="mr-2 h-5 w-5" /> Pagar con Bre-B
                    </Button>
                  )}
                  <Button type="button" variant="outline" className="h-14 w-full active:scale-[0.98]" onClick={closeModal}>
                    Pagar en el colegio
                  </Button>
                </div>
              )}
              {paymentStep === 'breb' && (
                <div className="space-y-4 text-left">
                  <div className="flex items-center gap-2 font-black text-[#073b72]"><Smartphone className="h-5 w-5" /> Paga con Bre-B</div>
                  <div className="rounded-xl bg-[#073b72] p-4 text-white">
                    <p className="text-xs font-semibold uppercase text-white/70">Total exacto</p>
                    <p className="text-3xl font-black">{formatCurrency(paymentTotal)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Llave del colegio</p>
                    <p className="break-all font-mono text-xl font-bold">{BREB_KEY || 'Llave no configurada'}</p>
                    <p className="text-sm text-muted-foreground">Destinatario: {BREB_ACCOUNT_NAME}</p>
                  </div>
                  {BREB_KEY && <Button type="button" variant="outline" className="w-full" onClick={() => copyValue('key', BREB_KEY)}><Copy className="mr-2 h-4 w-4" />{copiedField === 'key' ? 'Copiado' : 'Copiar llave'}</Button>}
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant="outline" onClick={() => copyValue('amount', String(paymentTotal))}><Copy className="mr-2 h-4 w-4" />{copiedField === 'amount' ? 'Copiado' : 'Copiar valor'}</Button>
                    <Button type="button" variant="outline" onClick={() => copyValue('code', paymentCode || '')}><Copy className="mr-2 h-4 w-4" />{copiedField === 'code' ? 'Copiado' : 'Copiar código'}</Button>
                  </div>
                  {BREB_QR_PAYLOAD && <div className="flex justify-center"><LocalQrCode value={BREB_QR_PAYLOAD} label="QR oficial Bre-B" /></div>}
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Importante: pague exactamente {formatCurrency(paymentTotal)}. Una diferencia puede impedir identificar su pago.</div>
                  <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                    <li>Abra la aplicación de su banco o billetera.</li><li>Ingrese a Bre-B y seleccione pagar con llave.</li><li>Digite la llave y el valor exacto.</li><li>Verifique que el destinatario sea el colegio.</li><li>Confirme en su entidad y regrese aquí.</li>
                  </ol>
                  <Button type="button" className="h-14 w-full bg-emerald-700 text-white active:scale-[0.98]" disabled={isProcessing || !BREB_KEY} onClick={handleReportPayment}>
                    {isProcessing ? 'Reportando...' : 'Ya realicé el pago'}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">Este botón no confirma el dinero ni marca la compra como pagada.</p>
                </div>
              )}
              {paymentStep === 'reported' && (
                <div className="space-y-3 py-3 text-center">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-700" />
                  <p className="text-xl font-black text-[#073b72]">Pago reportado</p>
                  <p className="text-sm text-muted-foreground">Estamos verificando el ingreso en Bre-B. Su compra sigue pendiente y reservada. No realice un segundo pago.</p>
                </div>
              )}
              {reservationExpiryLabel && paymentStep !== 'reported' && <p className="mt-3 text-center text-xs font-semibold text-amber-800">Reserva válida hasta las {reservationExpiryLabel}.</p>}
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
                    <span>Subtotal confirmado:</span>
                    <span>{formatCurrency(paymentTotal)}</span>
                </div>
                 <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Impuestos/cargos:</span>
                    <span>{formatCurrency(0)}</span>
                </div>
                 <div className="flex justify-between font-bold text-lg mt-2 pt-2 border-t">
                    <span>Total a pagar:</span>
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
