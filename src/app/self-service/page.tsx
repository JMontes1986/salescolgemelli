
"use client";

import { useState, useEffect, useCallback, useMemo, type MouseEvent } from 'react';
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
import { Trash2, Plus, Minus, ShoppingCart, Pencil, QrCode, Smartphone, PlayCircle } from "lucide-react";
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



const DEFAULT_DAVIPLATA_BREB_KEY = '3206766574';
const DAVIPLATA_BREB_KEY = process.env.NEXT_PUBLIC_DAVIPLATA_BREB_KEY?.trim() || DEFAULT_DAVIPLATA_BREB_KEY;
const DEFAULT_DAVIPLATA_BREB_LINK_TEMPLATE = 'daviplata://pagar?llave={key}&referencia={code}';
const DAVIPLATA_BREB_LINK_TEMPLATE = process.env.NEXT_PUBLIC_DAVIPLATA_BREB_PAYMENT_URL?.trim() || DEFAULT_DAVIPLATA_BREB_LINK_TEMPLATE;
const DAVIPLATA_DEEP_LINK_PREFIX = 'daviplata:';
const SELF_SERVICE_REFRESH_INTERVAL_MS = 60_000;
const SELF_SERVICE_REFRESH_JITTER_MS = 15_000;

const buildDaviplataPaymentHref = (paymentCode: string | null, _total: number) => {
  if (!DAVIPLATA_BREB_KEY || !DAVIPLATA_BREB_LINK_TEMPLATE) return '';

  return DAVIPLATA_BREB_LINK_TEMPLATE
    .replaceAll('{code}', encodeURIComponent(paymentCode || ''))
    .replaceAll('{amount}', '')
    .replaceAll('{amount_cents}', '')
    .replaceAll('{key}', encodeURIComponent(DAVIPLATA_BREB_KEY));
};

const buildDaviplataQrPayload = (paymentCode: string | null, total: number) => {
  const paymentHref = buildDaviplataPaymentHref(paymentCode, total);

  if (paymentHref) return paymentHref;

  return [
    'Pago por DaviPlata / Bre-B',
    DAVIPLATA_BREB_KEY ? `Llave: ${DAVIPLATA_BREB_KEY}` : 'Llave Bre-B no configurada',
    paymentCode ? `Referencia: ${paymentCode}` : '',
  ].filter(Boolean).join('\n');
};

const buildQrImageUrl = (payload: string) => (
  `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=12&data=${encodeURIComponent(payload)}`
);

const buildDeliveryQrPayload = (purchase: Purchase) => (
  purchase.qrPayload || `/dashboard/redeem?code=${encodeURIComponent(purchase.id)}&delivery=${encodeURIComponent(purchase.deliveryCode || '')}`
);

const buildDeliveryQrImageUrl = (purchase: Purchase) => buildQrImageUrl(buildDeliveryQrPayload(purchase));

const getReservationExpiryLabel = (purchase?: Purchase | null) => {
  if (!purchase?.reservationExpiresAt || purchase.status !== 'pending') return null;
  const expiresAt = new Date(purchase.reservationExpiresAt);
  if (Number.isNaN(expiresAt.getTime())) return null;

  return new Intl.DateTimeFormat('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(expiresAt);
};

const isDaviplataDeepLink = (href: string) => href.toLowerCase().startsWith(DAVIPLATA_DEEP_LINK_PREFIX);

const isMobileDevice = () => (
  typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
);

const getPaymentLinkTarget = (href: string) => (
  href && !isDaviplataDeepLink(href) ? '_blank' : undefined
);

const getPaymentLinkRel = (href: string) => (
  getPaymentLinkTarget(href) ? 'noopener noreferrer' : undefined
);
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
  const realtimeTables = useMemo(() => ['products', 'purchases', 'self_service_reservations'] as const, []);

  const handleDaviplataPaymentClick = useCallback((event: MouseEvent<HTMLAnchorElement>, paymentHref: string) => {
    if (!paymentHref) {
      event.preventDefault();
      return;
    }

    if (isDaviplataDeepLink(paymentHref) && !isMobileDevice()) {
      event.preventDefault();
      toast({
        title: "Escanee el QR desde el celular",
        description: `Este pago se abre en la app DaviPlata del telefono. Desde computador use la llave Bre-B ${DAVIPLATA_BREB_KEY}.`,
      });
    }
  }, [toast]);

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
          customerCedula: editingPurchase.cedula,
          customerCelular: editingPurchase.celular,
          selfServiceOnly: true,
        });
        
        setPaymentCode(editingPurchase.id);
        setLastPurchase(updatedPurchase);
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
  const daviplataPaymentHref = buildDaviplataPaymentHref(paymentCode, paymentTotal);
  const daviplataQrPayload = buildDaviplataQrPayload(paymentCode, paymentTotal);
  const daviplataQrImageUrl = buildQrImageUrl(daviplataQrPayload);
  const reservationExpiryLabel = getReservationExpiryLabel(lastPurchase);
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
    <div className="self-service-theme min-h-[100dvh] overflow-hidden bg-[#f5f4ef] pb-32 pt-14 text-[#202522] transition-colors duration-300 sm:pt-4 lg:pb-10">
      <div className="self-service-bg pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_88%_8%,rgba(23,107,87,0.10),transparent_28%),linear-gradient(180deg,#fbfbf8_0%,#f5f4ef_60%,#edf0eb_100%)]" />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-3 py-4 sm:px-6 lg:px-8">
        <header className="relative overflow-hidden rounded-[1.75rem] bg-[#174f43] px-5 py-6 text-white shadow-[0_26px_70px_-44px_rgba(23,79,67,0.75)] sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full border border-white/10" />
          <div className="pointer-events-none absolute right-8 top-8 h-28 w-28 rounded-full border border-white/10" />

          <div className="relative flex items-center justify-between gap-4 border-b border-white/[0.15] pb-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-14 items-center justify-center rounded-xl bg-white p-1.5">
                <Image src={MOLLY_LOGO_URL} alt="Molly Ventas" width={96} height={96} className="h-full w-full object-contain" priority />
              </div>
              <div>
                <p className="text-sm font-semibold">Ventas ColGemelli</p>
                <p className="text-xs text-white/[0.65]">Colegio Franciscano Agustín Gemelli</p>
              </div>
            </div>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold">Autogestión</span>
          </div>

          <div className="relative mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-end">
            <div>
              <p className="text-sm font-semibold text-[#b8d7cc]">Compra sin iniciar sesión</p>
              <h1 className="mt-2 max-w-3xl text-[clamp(2.5rem,6vw,5.1rem)] font-bold leading-[0.96] tracking-[-0.05em]">
                Arme su pedido de forma sencilla.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/[0.74] sm:text-lg">
                Elija los productos, revise el resumen y genere su código. Solo necesita un número de celular para continuar.
              </p>
            </div>

            <ol className="overflow-hidden rounded-2xl border border-white/[0.15] bg-white/[0.07]">
              <li className="grid grid-cols-[36px_1fr] gap-3 border-b border-white/[0.12] p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white font-bold text-[#174f43]">1</span>
                <div><p className="font-semibold">Elija</p><p className="text-sm leading-5 text-white/[0.65]">Agregue los productos que necesita.</p></div>
              </li>
              <li className="grid grid-cols-[36px_1fr] gap-3 border-b border-white/[0.12] p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white font-bold text-[#174f43]">2</span>
                <div><p className="font-semibold">Confirme</p><p className="text-sm leading-5 text-white/[0.65]">Revise cantidades y registre su celular.</p></div>
              </li>
              <li className="grid grid-cols-[36px_1fr] gap-3 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white font-bold text-[#174f43]">3</span>
                <div><p className="font-semibold">Pague y reciba</p><p className="text-sm leading-5 text-white/[0.65]">Use el código en caja o pague por DaviPlata.</p></div>
              </li>
            </ol>
          </div>

          <div className="relative mt-7 flex flex-col gap-3 border-t border-white/[0.15] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-white/[0.68]">¿Es su primera compra? Consulte la guía completa antes de empezar.</p>
            <Button asChild variant="ghost" className="h-11 justify-start rounded-xl border border-white/20 px-4 font-semibold text-white hover:bg-white/10 hover:text-white sm:justify-center">
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
              <Badge variant="secondary" className="shrink-0 border border-[#cbd7d1] bg-white px-3 py-1 text-sm font-semibold text-[#176b57] hover:bg-white">
                {products.length} opciones
              </Badge>
            </div>

          {isLoading ? (
              <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-40 animate-pulse rounded-2xl border border-[#dde1db] bg-white/70 sm:h-48" />
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
                        "group overflow-hidden rounded-2xl border border-[#dde1db] bg-white text-[#202522] shadow-[0_16px_36px_-30px_rgba(32,37,34,0.55)] transition duration-200 hover:-translate-y-0.5 hover:border-[#9db9ae] hover:shadow-[0_24px_44px_-30px_rgba(23,79,67,0.42)] active:translate-y-px",
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
                        <div className="relative aspect-[16/10] overflow-hidden bg-[#eef1ed]">
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
                              <Badge className="bg-[#176b57] px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-[#176b57] sm:px-3 sm:py-1 sm:text-sm">
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
                            <span className="text-lg font-bold text-[#176b57] sm:text-2xl">{formatCurrency(product.price)}</span>
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
                              className="h-10 w-10 rounded-xl border-[#b9c8c1] bg-white text-[#176b57] hover:bg-[#e5f0eb] sm:h-12 sm:w-12"
                              onClick={() => updateQuantity(product.id, quantityInCart - 1)}
                              aria-label={`Quitar una unidad de ${product.name}`}
                            >
                              <Minus className="h-4 w-4 sm:h-5 sm:w-5" />
                            </Button>
                            <div className="flex h-10 items-center justify-center rounded-xl border border-[#cbd7d1] bg-[#f4f7f5] text-base font-bold text-[#202522] sm:h-12 sm:text-lg">
                              {quantityInCart}
                            </div>
                            <Button
                              size="icon"
                              className="h-10 w-10 rounded-xl bg-[#176b57] text-white hover:bg-[#125746] sm:h-12 sm:w-12"
                              onClick={() => updateQuantity(product.id, quantityInCart + 1)}
                              disabled={hasReachedLimit}
                              aria-label={`Agregar una unidad de ${product.name}`}
                            >
                              <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            className="h-10 w-full rounded-xl bg-[#176b57] text-xs font-semibold text-white shadow-none hover:bg-[#125746] active:translate-y-px sm:h-12 sm:text-sm"
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
              <div className="rounded-2xl border border-dashed border-[#b9c8c1] bg-white/70 p-8 text-center text-[#68706a]">
                No hay productos disponibles en Autogestión por el momento.
              </div>
          )}
          </section>

          <aside className="space-y-4 lg:sticky lg:top-5">
          <Card className="border border-[#cfd6d1] bg-white text-[#202522] shadow-[0_24px_56px_-36px_rgba(32,37,34,0.52)]">
            <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl font-bold tracking-[-0.02em] text-[#202522]">{editingPurchase ? 'Modificar pedido' : 'Su pedido'}</CardTitle>
                    <CardDescription className="text-[#68706a]">
                      {cartItemCount > 0 ? `${cartItemCount} producto${cartItemCount === 1 ? '' : 's'} seleccionado${cartItemCount === 1 ? '' : 's'}` : 'El carrito está vacío'}
                    </CardDescription>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e5f0eb] text-lg font-bold text-[#176b57]">
                    {cartItemCount}
                  </div>
                </div>
                {editingPurchase && <CardDescription className="font-mono text-[#68706a]">Código: {editingPurchase.id}</CardDescription>}
            </CardHeader>
              <CardContent className="space-y-4">
                {cart.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#b9c8c1] bg-[#f7f8f5] p-6 text-center text-sm text-[#68706a]">
                    Su pedido está vacío. Agregue un producto para comenzar.
                  </div>
                ) : (
                  <div className="space-y-3">
                      {cart.map(item => (
                      <div key={item.id} className="rounded-2xl border border-[#dde1db] bg-[#f7f8f5] p-3">
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
                                className="h-11 w-11 rounded-xl border-[#cbd7d1] bg-white text-[#176b57] hover:bg-[#e5f0eb]"
                                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                aria-label={`Quitar una unidad de ${item.name}`}
                              >
                                <Minus className="h-5 w-5" />
                              </Button>
                            <span className="text-center text-lg font-bold">{item.quantity}</span>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-11 w-11 rounded-xl border-[#cbd7d1] bg-white text-[#176b57] hover:bg-[#e5f0eb]"
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
                <div className="rounded-2xl border border-[#cbd7d1] bg-[#e5f0eb] p-4">
                  <div className="flex justify-between text-sm font-medium text-[#4f6e63]">
                    <span>Total a pagar</span>
                    <span>{cartItemCount} producto{cartItemCount === 1 ? '' : 's'}</span>
                  </div>
                  <div className="mt-1 flex items-end justify-between gap-3">
                    <span className="text-xl font-bold text-[#202522]">Total</span>
                    <span className="text-3xl font-bold text-[#176b57]">{formatCurrency(subtotal)}</span>
                  </div>
                </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button 
                  className="h-14 w-full rounded-xl bg-[#176b57] text-base font-semibold text-white shadow-none hover:bg-[#125746] active:translate-y-px"
                onClick={handleInitiatePayment}
                disabled={cart.length === 0 || isProcessing}
              >
                {isProcessing ? 'Procesando...' : (editingPurchase ? 'Guardar Cambios' : 'Generar Código de Pago')}
              </Button>
                <Button variant="outline" className="h-12 w-full rounded-xl border-[#cbd7d1] bg-white text-base font-semibold text-[#4f5751] hover:bg-[#f1f3ef] hover:text-[#202522]" onClick={clearCart} disabled={cart.length === 0 && !editingPurchase}>
                {editingPurchase ? 'Cancelar Edición' : 'Vaciar'}
              </Button>
            </CardFooter>
          </Card>
          </aside>
        </div>

        <section className="mt-2">
        <Card className="border border-[#dde1db] bg-white text-[#202522] shadow-[0_22px_52px_-38px_rgba(32,37,34,0.48)]">
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
                      <div key={purchase.id} className="rounded-2xl border border-[#dde1db] bg-[#f7f8f5] p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 space-y-3">
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-[#176b57]">Código de compra</p>
                            <p className="font-mono text-base font-bold">{purchase.id}</p>
                            <p className="text-sm text-[#68706a]">{purchase.date}</p>
                            <Badge variant="outline" className="mt-1 w-fit border-[#cbd7d1] bg-white text-[#176b57]">
                              {getPurchaseSourceLabel(purchase)}
                            </Badge>
                          </div>
                          <PurchaseModifiedIndicator purchase={purchase} audience="parent" showDetails />
                          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {purchase.items.map((item) => (
                              <div key={`${purchase.id}-${item.id}`} className="rounded-2xl border border-[#dde1db] bg-white p-3">
                                <p className="font-bold leading-tight text-[#202522]">{item.name}</p>
                                <p className="text-sm text-[#68706a]">Cantidad: {item.quantity}</p>
                                {purchaseSource === 'pos' ? (
                                  <p className="text-xs font-semibold text-emerald-700">Comprado y pagado en caja</p>
                                ) : (
                                  <p className="text-xs font-semibold text-[#176b57]">Entregado: {item.deliveredQuantity || 0} · Pendiente: {Math.max(item.quantity - (item.deliveredQuantity || 0), 0)}</p>
                                )}
                                <p className="text-sm font-bold text-[#176b57]">{formatCurrency(item.price * item.quantity)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
                          {hasSessionActions ? (
                            <div className="rounded-2xl border border-[#cbd7d1] bg-white p-3 text-center shadow-sm">
                              <img
                                src={buildDeliveryQrImageUrl(purchase)}
                                alt={`QR de entrega ${purchase.id}`}
                                width={116}
                                height={116}
                                className="mx-auto h-28 w-28"
                              />
                              <p className="mt-2 text-xs font-semibold text-[#176b57]">Código adicional</p>
                              <p className="font-mono text-lg font-bold text-[#176b57]">{purchase.deliveryCode || 'Pendiente'}</p>
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-[#cbd7d1] bg-white p-3 text-center shadow-sm">
                              <p className="text-xs font-semibold text-[#176b57]">
                                {purchaseSource === 'pos' ? 'Compra en punto de venta' : 'Compra anterior'}
                              </p>
                              <p className="mt-1 text-sm text-[#68706a]">
                                {purchaseSource === 'pos' ? 'Registrada en caja.' : 'Compra registrada anteriormente.'}
                              </p>
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                            <Badge variant="secondary" className={getPurchaseStatusClassName(purchase.status)}>
                              {getPurchaseStatusLabel(purchase.status)}
                            </Badge>
                            <span className="text-lg font-black">{formatCurrency(purchase.total)}</span>
                            {hasSessionActions && (purchase.status === 'pending' || purchase.status === 'pre-sale') && (
                              <Button variant="outline" className="h-11 rounded-xl border-[#cbd7d1] bg-white text-[#176b57] hover:bg-[#e5f0eb] hover:text-[#174f43]" onClick={() => handleEditPurchase(purchase)}>
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
                <p className="rounded-2xl border border-dashed border-[#b9c8c1] bg-[#f7f8f5] p-6 text-center text-[#68706a]">Cuando genere un pedido, podrá consultar aquí su código y estado.</p>
            )}
          </CardContent>
        </Card>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#cbd7d1] bg-white/95 p-3 shadow-[0_-12px_32px_rgba(32,37,34,0.12)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-[1fr_auto] items-center gap-3">
          <div>
            <p className="text-xs font-medium text-[#68706a]">{cartItemCount} producto{cartItemCount === 1 ? '' : 's'} en el pedido</p>
            <p className="text-xl font-bold text-[#176b57]">{formatCurrency(subtotal)}</p>
          </div>
          <Button
            className="h-14 rounded-xl bg-[#176b57] px-5 text-sm font-semibold text-white hover:bg-[#125746]"
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
              Ingrese su celular para generar el código de pago. No necesita cédula.
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
                    Su compra está pendiente. Puede pagar en caja o por DaviPlata/Bre-B; después presente este código para confirmar y recibir sus productos.
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
                <img
                  src={buildDeliveryQrImageUrl(lastPurchase)}
                  alt={`QR de entrega ${lastPurchase.id}`}
                  width={180}
                  height={180}
                  className="mx-auto h-44 w-44 rounded-md border bg-white p-2"
                />
                <p className="mt-3 text-sm font-semibold">Código adicional para validar: <span className="font-mono text-lg text-primary">{lastPurchase.deliveryCode}</span></p>
              </div>
            )}

            <div className="rounded-md border bg-background p-4 text-center">
              <div className="mb-3 flex items-center justify-center gap-2 font-black text-primary">
                <Smartphone className="h-5 w-5" />
                Pago por DaviPlata / Bre-B
              </div>
              <a
                href={daviplataPaymentHref || undefined}
                target={getPaymentLinkTarget(daviplataPaymentHref)}
                rel={getPaymentLinkRel(daviplataPaymentHref)}
                onClick={(event) => handleDaviplataPaymentClick(event, daviplataPaymentHref)}
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
                En computador, escanee el QR desde el celular. En el telefono, toque el QR para intentar abrir DaviPlata.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Use el código {paymentCode} como referencia y pague exactamente {formatCurrency(paymentTotal)}.
              </p>
              {reservationExpiryLabel && (
                <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                  La reserva de inventario vence a las {reservationExpiryLabel}.
                </p>
              )}
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
