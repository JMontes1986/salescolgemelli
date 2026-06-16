
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
import { Trash2, Plus, Minus, ShoppingCart, Pencil, QrCode, Smartphone, ClipboardList, PackageCheck, PlayCircle } from "lucide-react";
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
import { addPreSalePurchase, getSelfServicePurchasesByCedula, getSelfServiceReservedQuantityMap, sanitizeCustomerIdentifier, sanitizeCustomerPhone, type NewPurchase, updatePendingPurchase } from '@/lib/services/purchase-service';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { useSupabaseRealtime } from '@/hooks/use-supabase-realtime';
import { MOLLY_LOGO_URL } from '@/components/icons';



const DEFAULT_DAVIPLATA_BREB_KEY = '3206766574';
const DAVIPLATA_BREB_KEY = process.env.NEXT_PUBLIC_DAVIPLATA_BREB_KEY?.trim() || DEFAULT_DAVIPLATA_BREB_KEY;
const DEFAULT_DAVIPLATA_BREB_LINK_TEMPLATE = 'daviplata://pagar?llave={key}&referencia={code}';
const DAVIPLATA_BREB_LINK_TEMPLATE = process.env.NEXT_PUBLIC_DAVIPLATA_BREB_PAYMENT_URL?.trim() || DEFAULT_DAVIPLATA_BREB_LINK_TEMPLATE;
const DAVIPLATA_DEEP_LINK_PREFIX = 'daviplata:';

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
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [cedula, setCedula] = useState('');
  const [celular, setCelular] = useState('');
  const [searchCedula, setSearchCedula] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [lastPurchase, setLastPurchase] = useState<Purchase | null>(null);
  const realtimeTables = useMemo(() => ['products', 'purchases'] as const, []);
  const activeCedula = cedula.trim();
  const hasActiveCedula = activeCedula.length > 0;

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
          getSelfServiceReservedQuantityMap(),
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

  useSupabaseRealtime({
    tables: realtimeTables,
    onChange: () => loadProducts(false),
  });

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
    if (!hasActiveCedula) {
      toast({
        variant: "destructive",
        title: "Ingrese la cédula primero",
        description: "Para asociar la compra al padre de familia, consulte primero el documento.",
      });
      return;
    }

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
    if (!hasActiveCedula) {
      toast({
        variant: "destructive",
        title: "Ingrese la cédula primero",
        description: "Consulte la cédula del padre de familia antes de escoger o generar una compra.",
      });
      return;
    }

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
          customerCedula: activeCedula || editingPurchase.cedula,
          customerCelular: editingPurchase.celular,
          selfServiceOnly: true,
        });
        
        setPaymentCode(editingPurchase.id);
        setLastPurchase(updatedPurchase);
        setSearchCedula(updatedPurchase.cedula);
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
    if (cart.length === 0 || !activeCedula || !celular) return;
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
        cedula: activeCedula,
        celular: normalizedCelular,
        status: 'pending', // Autogestión reserva disponibilidad y descuenta stock cuando el vendedor registra la entrega.
    };
    
    try {
        const addedPurchase = await addPreSalePurchase(newPurchaseData);
        setPaymentCode(addedPurchase.id);
        setLastPurchase(addedPurchase);
        setSearchCedula(addedPurchase.cedula);
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

  const handleActivateCedula = async () => {
    const cedulaToActivate = searchCedula.trim() || activeCedula;

    if (!cedulaToActivate) {
        toast({ variant: "destructive", title: "Error", description: "Ingrese la cédula para activar el perfil." });
        return;
    }

    try {
        const normalizedCedula = sanitizeCustomerIdentifier(cedulaToActivate, 'La cédula');
        const isSwitchingCedula = normalizedCedula !== activeCedula;
        const sessionEditableIds = isSwitchingCedula ? new Set<string>() : editablePurchaseIds;

        setSearchCedula(normalizedCedula);
        setCedula(normalizedCedula);

        if (isSwitchingCedula) {
          setPurchaseHistory([]);
          setEditablePurchaseIds(new Set());
          setLastPurchase(null);
          clearCart();
        }

        setIsHistoryLoading(true);
        const purchases = await getSelfServicePurchasesByCedula(normalizedCedula);
        setPurchaseHistory(prev => {
          const editablePurchases = new Map(
            prev
              .filter(purchase => sessionEditableIds.has(purchase.id))
              .map(purchase => [purchase.id, purchase])
          );

          return purchases.map(purchase => editablePurchases.get(purchase.id) ?? purchase);
        });

        toast({
          title: "Cédula lista",
          description: `La cédula ${normalizedCedula} quedó activa y se cargó su historial de compras.`,
        });
    } catch (error) {
        toast({
          variant: "destructive",
          title: "Revise los datos",
          description: error instanceof Error ? error.message : "Ingrese una cédula válida.",
        });
    } finally {
        setIsHistoryLoading(false);
    }
  }

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
    setSearchCedula(purchase.cedula);
    setCedula(purchase.cedula);
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
  const lastPurchaseDaviplataPaymentHref = lastPurchase ? buildDaviplataPaymentHref(lastPurchase.id, lastPurchase.total) : '';
  const lastPurchaseDaviplataQrImageUrl = lastPurchase
    ? buildQrImageUrl(buildDaviplataQrPayload(lastPurchase.id, lastPurchase.total))
    : '';
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
    <div className="self-service-theme min-h-screen overflow-hidden bg-[#f6f7f2] pb-32 pt-14 text-[#232328] transition-colors duration-300 sm:pt-4 lg:pb-10">
      <div className="self-service-bg pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_14%_12%,rgba(14,185,195,0.20),transparent_30%),radial-gradient(circle_at_86%_16%,rgba(236,198,67,0.18),transparent_28%),radial-gradient(circle_at_50%_88%,rgba(178,49,120,0.10),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f6f7f2_54%,#edf3f2_100%)]" />
      <div className="self-service-grid pointer-events-none fixed inset-x-0 bottom-0 -z-10 h-1/2 bg-[linear-gradient(rgba(14,185,195,0.13)_1px,transparent_1px),linear-gradient(90deg,rgba(178,49,120,0.09)_1px,transparent_1px)] bg-[size:58px_58px] opacity-60 [transform:perspective(480px)_rotateX(58deg)] [transform-origin:bottom]" />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-3 py-4 sm:px-6 lg:px-8">
        <header className="relative overflow-hidden rounded-[2rem] border-2 border-[#0eb9c3]/35 bg-white/88 px-4 py-5 shadow-[0_22px_48px_rgba(35,35,40,0.12)] backdrop-blur sm:px-6">
          <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-[#ecc643]/24 blur-3xl" />
          <div className="absolute -bottom-24 left-8 h-48 w-48 rounded-full bg-[#0eb9c3]/18 blur-3xl" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[#0eb9c3]/50 bg-[#0eb9c3]/12 px-3 py-1 text-xs font-black uppercase tracking-[0.35em] text-[#126d74]">Autogestión</span>
                <span className="rounded-full border border-[#d2528d]/50 bg-[#b23178]/10 px-3 py-1 text-xs font-black uppercase tracking-[0.25em] text-[#8d2460]">Bingo Gemellista</span>
              </div>
              <h1 className="max-w-3xl text-4xl font-black uppercase leading-none tracking-tight text-[#232328] sm:text-6xl">
                Compra rápida 80&apos;s / 90&apos;s
              </h1>
            </div>
            <div className="relative flex min-h-24 min-w-24 shrink-0 rotate-2 items-center justify-center rounded-2xl border-2 border-[#d2528d]/75 bg-white p-3 shadow-[8px_8px_0_rgba(14,185,195,0.32)] sm:min-h-28 sm:min-w-32 lg:min-h-32 lg:min-w-36">
              <div className="absolute -left-3 -top-3 rounded-full bg-[#ecc643] px-2 py-1 text-xs font-black uppercase text-[#232328]">VIP</div>
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
        </header>


        <Card className="border-2 border-[#0eb9c3]/35 bg-white/92 text-[#232328] shadow-[0_18px_38px_rgba(35,35,40,0.10)] backdrop-blur">
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-center gap-4">
              <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#0eb9c3]/40 bg-white p-1 shadow-sm">
                <Image
                  src={MOLLY_LOGO_URL}
                  alt="Logo de Molly Ventas"
                  width={96}
                  height={96}
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-[#126d74]">Tutorial de autogestión</p>
                <h2 className="text-xl font-black uppercase text-[#232328]">Antes de comprar, revise cómo funciona Molly Ventas</h2>
                <p className="mt-1 text-sm font-semibold text-[#5f686a]">Los papás pueden ver los pasos completos para consultar la cédula, armar el pedido, generar el código y pagar con seguridad.</p>
              </div>
            </div>
            <Button
              asChild
              variant="outline"
              className="h-12 shrink-0 rounded-2xl border-[#d2528d]/50 bg-white px-5 font-black uppercase text-[#b23178] hover:bg-[#b23178]/10 hover:text-[#8d2460]"
            >
              <Link href="/self-service/tutorial">
                <PlayCircle className="h-5 w-5" />
                Ver tutorial completo
              </Link>
            </Button>
          </CardContent>
        </Card>

        {editingPurchase && (
          <div className="rounded-2xl border-2 border-[#ecc643]/80 bg-[#fff7cf]/80 px-4 py-3 text-sm font-bold text-[#5d4b10] shadow-[0_18px_36px_rgba(35,35,40,0.10)] backdrop-blur">
            Está modificando la compra {editingPurchase.id}. Revise el pedido y guarde los cambios.
          </div>
        )}

        {lastPurchase && !editingPurchase && (
          <Card className="border-2 border-[#0eb9c3]/35 bg-white/88 text-[#232328] shadow-[0_22px_48px_rgba(35,35,40,0.12)] backdrop-blur">
            <CardHeader className="gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl font-black uppercase tracking-wide text-[#232328]">Última compra generada</CardTitle>
                <CardDescription className="text-[#4b4b52]">
                  Presente este código en caja o úselo como referencia al pagar por DaviPlata.
                </CardDescription>
              </div>
              <div className="rounded-2xl border border-[#0eb9c3]/40 bg-[#edfafa] px-4 py-3 text-center">
                <p className="text-xs font-black uppercase tracking-wide text-[#126d74]">Código</p>
                <p className="font-mono text-2xl font-black tracking-widest text-[#b23178]">{lastPurchase.id}</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {lastPurchase.items.map(item => (
                  <div key={`${lastPurchase.id}-${item.id}`} className="rounded-2xl border border-[#0eb9c3]/25 bg-[#f7fbfb] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold leading-tight">{item.name}</p>
                        <p className="text-sm font-semibold text-[#5f686a]">Cantidad: {item.quantity}</p>
                      </div>
                      <p className="shrink-0 font-black">{formatCurrency(item.price * item.quantity)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-[#0eb9c3]/25 bg-white p-3">
                <div className="flex flex-col items-center gap-3 sm:flex-row">
                  <img
                    src={buildDeliveryQrImageUrl(lastPurchase)}
                    alt={`QR de entrega ${lastPurchase.id}`}
                    width={116}
                    height={116}
                    className="h-28 w-28 rounded-md border bg-white p-2"
                  />
                  <div>
                    <p className="text-sm font-black uppercase text-[#126d74]">QR único para reclamar productos</p>
                    <p className="text-sm font-semibold text-[#5f686a]">El vendedor debe escanear este QR y validar el código adicional antes de entregar.</p>
                    <p className="mt-2 font-mono text-2xl font-black text-[#b23178]">{lastPurchase.deliveryCode}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-1 border-t border-[#0eb9c3]/25 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-semibold text-[#5f686a]">{lastPurchase.date}</span>
                <span className="text-xl font-black text-[#b23178]">Total: {formatCurrency(lastPurchase.total)}</span>
              </div>
              {getReservationExpiryLabel(lastPurchase) && (
                <div className="rounded-2xl border border-[#ecc643]/45 bg-[#fff9df] p-3 text-sm font-bold text-[#5d4b10]">
                  Reserva de inventario activa hasta las {getReservationExpiryLabel(lastPurchase)}. Después de esa hora el stock puede liberarse.
                </div>
              )}
              <div className="rounded-2xl border border-[#0eb9c3]/25 bg-[#f7fbfb] p-3">
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
                  <a
                    href={lastPurchaseDaviplataPaymentHref || undefined}
                    target={getPaymentLinkTarget(lastPurchaseDaviplataPaymentHref)}
                    rel={getPaymentLinkRel(lastPurchaseDaviplataPaymentHref)}
                    onClick={(event) => handleDaviplataPaymentClick(event, lastPurchaseDaviplataPaymentHref)}
                    aria-label="Abrir pago por DaviPlata Bre-B"
                    className={cn(
                      "flex shrink-0 rounded-md border bg-white p-2 shadow-sm",
                      lastPurchaseDaviplataPaymentHref ? "cursor-pointer hover:ring-2 hover:ring-primary" : "cursor-default"
                    )}
                  >
                    <img
                      src={lastPurchaseDaviplataQrImageUrl}
                      alt="QR de pago DaviPlata Bre-B"
                      width={116}
                      height={116}
                      className="h-28 w-28"
                    />
                  </a>
                  <div className="space-y-1 text-center sm:text-left">
                    <p className="flex items-center justify-center gap-2 text-sm font-black uppercase text-[#126d74] sm:justify-start">
                      <QrCode className="h-4 w-4" />
                      Pago por DaviPlata / Bre-B
                    </p>
                    <p className="text-sm text-[#4b4b52]">
                      Escanee el QR desde el celular o toquelo desde el telefono para abrir DaviPlata. Use el codigo {lastPurchase.id} como referencia.
                    </p>
                    {DAVIPLATA_BREB_KEY && (
                      <p className="text-xs font-semibold text-[#5f686a]">Llave Bre-B: {DAVIPLATA_BREB_KEY}</p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-2 border-[#d2528d]/30 bg-white/92 text-[#232328] shadow-[0_22px_48px_rgba(35,35,40,0.10)] backdrop-blur">
          <CardHeader className="gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-2">
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.25em] text-[#8d2460]">
                <ClipboardList className="h-5 w-5" />
                Antes de escoger productos
              </div>
              <CardTitle className="text-2xl font-black uppercase tracking-tight text-[#232328] sm:text-3xl">
                ¿Cómo comprar por autogestión?
              </CardTitle>
              <CardDescription className="text-base font-semibold text-[#4b4b52]">
                Primero ingrese su cédula para dejar listo el documento de esta compra. Después elija productos, genere el código y pague en caja o por DaviPlata/Bre-B.
              </CardDescription>
            </div>
            <div className="rounded-2xl border border-[#0eb9c3]/35 bg-[#edfafa] px-4 py-3 text-sm font-bold text-[#126d74]">
              {hasActiveCedula ? `Cédula activa: ${activeCedula}` : 'Sin cédula consultada'}
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#0eb9c3]/25 bg-[#f7fbfb] p-4">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0eb9c3] text-lg font-black text-[#0f1720]">1</div>
                <h3 className="font-black uppercase text-[#232328]">Ingrese cédula</h3>
                <p className="mt-1 text-sm font-semibold text-[#5f686a]">Use el mismo documento para generar el código de pago.</p>
              </div>
              <div className="rounded-2xl border border-[#d2528d]/25 bg-[#fff5fa] p-4">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#b23178] text-lg font-black text-white">2</div>
                <h3 className="font-black uppercase text-[#232328]">Arme el pedido</h3>
                <p className="mt-1 text-sm font-semibold text-[#5f686a]">Agregue productos y revise cantidades antes de generar el código.</p>
              </div>
              <div className="rounded-2xl border border-[#ecc643]/35 bg-[#fff9df] p-4">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#ecc643] text-lg font-black text-[#232328]">3</div>
                <h3 className="font-black uppercase text-[#232328]">Pague y reciba</h3>
                <p className="mt-1 text-sm font-semibold text-[#5f686a]">Presente el código en caja o pague por DaviPlata. Abajo verá el estado.</p>
              </div>
            </div>
            <div className="rounded-3xl border-2 border-[#0eb9c3]/30 bg-white p-4 shadow-inner">
              <Label htmlFor="access-cedula" className="text-sm font-black uppercase tracking-wide text-[#126d74]">Activar cédula</Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] lg:grid-cols-1 xl:grid-cols-[1fr_auto]">
                <Input
                  id="access-cedula"
                  name="accessCedula"
                  inputMode="numeric"
                  autoComplete="off"
                  className="h-12 rounded-2xl border-[#0eb9c3]/45 bg-white/95 text-base text-slate-950 placeholder:text-slate-500"
                  placeholder="Ej: 1020304050"
                  value={searchCedula}
                  onChange={(e) => setSearchCedula(e.target.value)}
                />
                <Button className="h-12 rounded-2xl bg-[#0eb9c3] px-6 font-black uppercase text-[#0f1720] hover:bg-[#49cbd2]" onClick={handleActivateCedula} disabled={isHistoryLoading}>
                  {isHistoryLoading ? 'Consultando...' : 'Ingresar'}
                </Button>
              </div>
              <p className="mt-2 text-xs font-semibold text-[#5f686a]">
                La cédula activa el perfil del padre de familia para esta compra.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black uppercase tracking-tight text-[#232328]">Productos disponibles</h2>
                <p className="text-sm font-semibold text-[#5f686a]">Toque un producto para agregarlo al pedido.</p>
              </div>
              <Badge variant="secondary" className="shrink-0 border border-[#0eb9c3]/45 bg-white/80 px-3 py-1 text-sm font-black uppercase text-[#126d74] hover:bg-[#edfafa]">
                {products.length} opciones
              </Badge>
            </div>

          {isLoading ? (
              <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-40 animate-pulse rounded-2xl border-2 border-[#0eb9c3]/22 bg-white/70 sm:h-48 sm:rounded-3xl" />
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
                  || `https://placehold.co/600x400/e0f2fe/1e3a8a?text=${encodeURIComponent(product.name)}`;

                return (
                    <Card
                      key={product.id}
                      className={cn(
                        "group overflow-hidden rounded-2xl border-2 border-[#0eb9c3]/22 bg-white/88 text-[#232328] shadow-[0_10px_22px_rgba(35,35,40,0.10)] transition hover:-translate-y-1 hover:border-[#d2528d]/60 hover:shadow-[0_20px_42px_rgba(35,35,40,0.14)] active:scale-[0.99] sm:rounded-3xl sm:shadow-[0_16px_34px_rgba(35,35,40,0.10)]",
                        (isSoldOut || !hasActiveCedula) && "opacity-60"
                      )}
                    >
                      <button
                        type="button"
                        className={cn("relative block w-full text-left", hasActiveCedula && !isSoldOut && !hasReachedLimit && "cursor-pointer")}
                        onClick={() => hasActiveCedula && !isSoldOut && !hasReachedLimit && addToCart(product)}
                        disabled={!hasActiveCedula || isSoldOut || hasReachedLimit}
                        aria-label={`Agregar ${product.name}`}
                      >
                        <div className="relative aspect-[16/10] overflow-hidden bg-[#e8eeee]">
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
                              <Badge className="bg-[#0eb9c3] px-2 py-0.5 text-[10px] font-black text-[#0f1720] hover:bg-[#0eb9c3] sm:px-3 sm:py-1 sm:text-sm">
                                {quantityInCart} en pedido
                              </Badge>
                          )}
                          {hasReachedLimit && !isSoldOut && (
                              <Badge variant="destructive" className="px-2 py-0.5 text-[10px] sm:px-3 sm:py-1 sm:text-sm">Límite</Badge>
                          )}
                        </div>
                        {isSoldOut && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/55">
                            <Badge variant="destructive" className="px-3 py-1 text-xs sm:px-4 sm:py-2 sm:text-base">Agotado</Badge>
                          </div>
                        )}
                      </button>

                      <CardContent className="space-y-2 p-2.5 sm:space-y-3 sm:p-4">
                        <div className="min-h-[58px] space-y-1 sm:min-h-[72px]">
                          <h3 className="text-sm font-black uppercase leading-snug tracking-wide text-[#232328] sm:text-lg">{product.name}</h3>
                          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                            <span className="text-lg font-black text-[#b23178] sm:text-2xl">{formatCurrency(product.price)}</span>
                            <span className="text-[10px] font-bold leading-tight text-[#5f686a] sm:text-right sm:text-xs">
                              Stock {product.stock}
                              {selfServiceReserved > 0 && ` | Autogestión ${selfServiceReserved}`}
                              {` | Disp. ${availableStock}`}
                            </span>
                          </div>
                        </div>

                        {quantityInCart > 0 ? (
                          <div className="grid grid-cols-[40px_1fr_40px] items-center gap-1.5 sm:grid-cols-[52px_1fr_52px] sm:gap-2">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-10 w-10 rounded-xl bg-[#b23178] text-white hover:bg-[#d2528d] sm:h-12 sm:w-12 sm:rounded-2xl"
                              onClick={() => updateQuantity(product.id, quantityInCart - 1)}
                              aria-label={`Quitar una unidad de ${product.name}`}
                            >
                              <Minus className="h-4 w-4 sm:h-5 sm:w-5" />
                            </Button>
                            <div className="flex h-10 items-center justify-center rounded-xl border border-[#d2528d]/45 bg-[#b23178]/10 text-base font-black text-[#232328] sm:h-12 sm:rounded-2xl sm:text-lg">
                              {quantityInCart}
                            </div>
                            <Button
                              size="icon"
                              className="h-10 w-10 rounded-xl bg-[#b23178] text-white hover:bg-[#d2528d] sm:h-12 sm:w-12 sm:rounded-2xl"
                              onClick={() => updateQuantity(product.id, quantityInCart + 1)}
                              disabled={hasReachedLimit}
                              aria-label={`Agregar una unidad de ${product.name}`}
                            >
                              <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            className="h-10 w-full rounded-xl bg-gradient-to-r from-[#0eb9c3] via-[#b23178] to-[#ecc643] text-xs font-black uppercase text-[#101016] shadow-[0_10px_22px_rgba(6,7,10,0.20)] hover:opacity-95 sm:h-12 sm:rounded-2xl sm:text-base sm:shadow-[0_14px_32px_rgba(6,7,10,0.24)]"
                            onClick={() => addToCart(product)}
                            disabled={!hasActiveCedula || isSoldOut || hasReachedLimit}
                          >
                            <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5" />
                            {hasActiveCedula ? 'Agregar' : 'Ingrese cédula'}
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                )
              })}
            </div>
          ) : (
              <div className="rounded-3xl border-2 border-dashed border-[#0eb9c3]/35 bg-white/72 p-8 text-center font-semibold text-[#5f686a]">
                No hay productos disponibles para autoservicio en este momento.
              </div>
          )}
          </section>

          <aside className="space-y-4 lg:sticky lg:top-5">
          <Card className="border-2 border-[#d2528d]/28 bg-white/90 text-[#232328] shadow-[0_22px_48px_rgba(35,35,40,0.12)] backdrop-blur">
            <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl font-black uppercase tracking-wide text-[#232328]">{editingPurchase ? 'Modificar pedido' : 'Tu pedido'}</CardTitle>
                    <CardDescription className="text-[#5f686a]">
                      {cartItemCount > 0 ? `${cartItemCount} producto${cartItemCount === 1 ? '' : 's'} seleccionado${cartItemCount === 1 ? '' : 's'}` : 'El carrito está vacío'}
                    </CardDescription>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0eb9c3] text-lg font-black text-[#0f1720]">
                    {cartItemCount}
                  </div>
                </div>
                {editingPurchase && <CardDescription className="text-[#5f686a]">Código: {editingPurchase.id}</CardDescription>}
            </CardHeader>
              <CardContent className="space-y-4">
                {cart.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-[#0eb9c3]/35 bg-[#f7fbfb] p-6 text-center text-sm font-semibold text-[#5f686a]">
                    Agregue productos para generar su código de pago.
                  </div>
                ) : (
                  <div className="space-y-3">
                      {cart.map(item => (
                      <div key={item.id} className="rounded-2xl border border-[#0eb9c3]/25 bg-[#f7fbfb] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold leading-tight">{item.name}</p>
                            <p className="text-sm font-semibold text-[#5f686a]">{formatCurrency(item.price)} c/u</p>
                          </div>
                          <p className="shrink-0 text-right font-black">{formatCurrency(item.price * item.quantity)}</p>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="grid grid-cols-[44px_48px_44px] items-center gap-2">
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-11 w-11 rounded-2xl border-[#0eb9c3]/45 bg-white text-[#126d74] hover:bg-[#edfafa]"
                                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                aria-label={`Quitar una unidad de ${item.name}`}
                              >
                                <Minus className="h-5 w-5" />
                              </Button>
                            <span className="text-center text-lg font-black">{item.quantity}</span>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-11 w-11 rounded-2xl border-[#0eb9c3]/45 bg-white text-[#126d74] hover:bg-[#edfafa]"
                                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                aria-label={`Agregar una unidad de ${item.name}`}
                              >
                                <Plus className="h-5 w-5" />
                              </Button>
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-11 w-11 rounded-2xl text-[#b23178] hover:bg-[#b23178]/10 hover:text-[#8d2460]"
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
                <div className="rounded-2xl border border-[#ecc643]/50 bg-[#ecc643]/14 p-4">
                  <div className="flex justify-between text-sm font-bold uppercase tracking-wide text-amber-50/80">
                    <span>Total a pagar</span>
                    <span>{cartItemCount} producto{cartItemCount === 1 ? '' : 's'}</span>
                  </div>
                  <div className="mt-1 flex items-end justify-between gap-3">
                    <span className="text-2xl font-black text-[#232328]">TOTAL</span>
                    <span className="text-3xl font-black text-[#8d2460]">{formatCurrency(subtotal)}</span>
                  </div>
                </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button 
                  className="h-14 w-full rounded-2xl bg-gradient-to-r from-[#0eb9c3] via-[#b23178] to-[#ecc643] text-base font-black uppercase text-[#101016] shadow-[0_16px_34px_rgba(6,7,10,0.28)] hover:opacity-95 sm:text-lg"
                onClick={handleInitiatePayment}
                disabled={!hasActiveCedula || cart.length === 0 || isProcessing}
              >
                {isProcessing ? 'Procesando...' : (editingPurchase ? 'Guardar Cambios' : 'Generar Código de Pago')}
              </Button>
                <Button variant="outline" className="h-12 w-full rounded-2xl border-[#d2528d]/45 bg-white text-base font-bold text-[#b23178] hover:bg-[#b23178]/10 hover:text-[#8d2460]" onClick={clearCart} disabled={cart.length === 0 && !editingPurchase}>
                {editingPurchase ? 'Cancelar Edición' : 'Vaciar'}
              </Button>
            </CardFooter>
          </Card>
          </aside>
        </div>

        <section className="mt-2">
        <Card className="border-2 border-[#0eb9c3]/25 bg-white/88 text-[#232328] shadow-[0_22px_48px_rgba(35,35,40,0.10)] backdrop-blur">
          <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl font-black uppercase tracking-wide text-[#232328]">
                <PackageCheck className="h-5 w-5" />
                Perfil del padre de familia
              </CardTitle>
              <CardDescription className="text-[#5f686a]">
                Al activar la cédula se muestran las compras registradas a ese documento. El QR y la edición quedan disponibles para compras generadas durante esta sesión.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {purchaseHistory.length > 0 ? (
                <div className="space-y-3">
                  {purchaseHistory.map((purchase) => {
                    const hasSessionActions = canShowSessionActions(purchase);

                    return (
                      <div key={purchase.id} className="rounded-2xl border border-[#0eb9c3]/22 bg-[#f7fbfb] p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 space-y-3">
                          <div className="space-y-1">
                            <p className="text-xs font-black uppercase tracking-wide text-[#126d74]">Código de pago</p>
                            <p className="font-mono text-base font-bold">{purchase.id}</p>
                            <p className="text-sm font-semibold text-[#5f686a]">{purchase.date}</p>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {purchase.items.map((item) => (
                              <div key={`${purchase.id}-${item.id}`} className="rounded-2xl border border-[#0eb9c3]/18 bg-white p-3">
                                <p className="font-bold leading-tight text-[#232328]">{item.name}</p>
                                <p className="text-sm font-semibold text-[#5f686a]">Cantidad: {item.quantity}</p>
                                <p className="text-xs font-semibold text-[#126d74]">Entregado: {item.deliveredQuantity || 0} | Pendiente: {Math.max(item.quantity - (item.deliveredQuantity || 0), 0)}</p>
                                <p className="text-sm font-black text-[#b23178]">{formatCurrency(item.price * item.quantity)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
                          {hasSessionActions ? (
                            <div className="rounded-2xl border border-[#0eb9c3]/25 bg-white p-3 text-center shadow-sm">
                              <img
                                src={buildDeliveryQrImageUrl(purchase)}
                                alt={`QR de entrega ${purchase.id}`}
                                width={116}
                                height={116}
                                className="mx-auto h-28 w-28"
                              />
                              <p className="mt-2 text-xs font-black uppercase text-[#126d74]">Código adicional</p>
                              <p className="font-mono text-lg font-black text-[#b23178]">{purchase.deliveryCode || 'Pendiente'}</p>
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-[#0eb9c3]/25 bg-white p-3 text-center shadow-sm">
                              <p className="text-xs font-black uppercase text-[#126d74]">Historial por cédula</p>
                              <p className="mt-1 text-sm font-semibold text-[#5f686a]">Compra registrada anteriormente.</p>
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                            <Badge variant="secondary" className={getPurchaseStatusClassName(purchase.status)}>
                              {getPurchaseStatusLabel(purchase.status)}
                            </Badge>
                            <span className="text-lg font-black">{formatCurrency(purchase.total)}</span>
                            {hasSessionActions && (purchase.status === 'pending' || purchase.status === 'pre-sale') && (
                              <Button variant="outline" className="h-11 rounded-2xl border-[#d2528d]/45 bg-white text-[#b23178] hover:bg-[#b23178]/10 hover:text-[#8d2460]" onClick={() => handleEditPurchase(purchase)}>
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
                <p className="rounded-2xl border-2 border-dashed border-[#0eb9c3]/35 bg-[#f7fbfb] p-6 text-center font-semibold text-[#5f686a]">{isHistoryLoading ? 'Consultando compras registradas para esta cédula...' : 'Active una cédula para ver las compras registradas a ese documento.'}</p>
            )}
          </CardContent>
        </Card>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-[#0eb9c3]/35 bg-white/94 p-3 shadow-[0_-12px_32px_rgba(35,35,40,0.14)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-[1fr_auto] items-center gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#5f686a]">{cartItemCount} producto{cartItemCount === 1 ? '' : 's'} en el pedido</p>
            <p className="text-xl font-black text-[#b23178]">{formatCurrency(subtotal)}</p>
          </div>
          <Button
            className="h-14 rounded-2xl bg-gradient-to-r from-[#0eb9c3] via-[#b23178] to-[#ecc643] px-5 text-sm font-black uppercase text-[#101016]"
            onClick={handleInitiatePayment}
            disabled={!hasActiveCedula || cart.length === 0 || isProcessing}
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
              La cédula ya está asociada al perfil. Ingrese solo el celular para generar el código de pago.
            </DialogDesc>
          </DialogHeader>
          <form id="user-info-form" onSubmit={handleConfirmPayment}>
            <div className="grid gap-4 py-4">
              <div className="rounded-2xl border bg-muted/50 p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Cédula asociada</p>
                <p className="text-lg font-black text-foreground">{activeCedula}</p>
                <p className="mt-1 text-xs text-muted-foreground">Todas las compras quedarán guardadas para este documento.</p>
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
