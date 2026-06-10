
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { PlusCircle, MoreHorizontal, Database, Trash2, Pencil, ShoppingCart, Store, Plus, PackagePlus, ClipboardCheck, GripVertical, Ticket, Ban, CheckCircle2 } from "lucide-react";
import { PermissionGate } from "@/components/permission-gate";
import Image from "next/image";
import { mockProducts } from "@/lib/placeholder-data";
import type { Product, User, ProductAvailability, Purchase } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { formatCurrency, cn } from "@/lib/utils";
import { allProductAvailability, unavailableProductAvailability, getProducts, addProduct, addProductWithId, type NewProduct, updateProduct, increaseProductStock, updateProductOrder } from "@/lib/services/product-service";
import { getPurchases, getSelfServicePendingQuantities } from "@/lib/services/purchase-service";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Checkbox } from "@/components/ui/checkbox";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";

const availabilityMap: Record<ProductAvailability, { label: string; icon: React.ElementType }> = {
    'pos': { label: 'Punto de Venta', icon: Store },
    'self-service': { label: 'Autogestión', icon: ShoppingCart },
    'presale': { label: 'Preventa', icon: Ticket },
    'unavailable': { label: 'No disponible', icon: Ban },
};

function ProductForm({ 
    mode, 
    initialData,
    onProductAdded,
    onProductUpdated,
}: { 
    mode: 'create' | 'edit';
    initialData?: Product;
    onProductAdded: (product: Product) => void;
    onProductUpdated: (product: Product) => void;
}) {
    const { toast } = useToast();
    const [name, setName] = useState(initialData?.name || '');
    const [price, setPrice] = useState(initialData?.price.toString() || '');
    const [stock, setStock] = useState(initialData?.stock.toString() || '');
    const [imageUrl, setImageUrl] = useState(initialData?.imageUrl || '');
    const [availability, setAvailability] = useState<ProductAvailability[]>(initialData?.availability.length ? initialData.availability : allProductAvailability);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (mode === 'edit' && initialData) {
            setName(initialData.name);
            setPrice(initialData.price.toString());
            setStock(initialData.stock.toString());
            setImageUrl(initialData.imageUrl);
            setAvailability(initialData.availability.length ? initialData.availability : allProductAvailability);
        }
    }, [initialData, mode]);

    const handleOpenChange = (open: boolean) => {
        setIsOpen(open);
        if (!open) {
             if (mode === 'create') {
                setName('');
                setPrice('');
                setStock('');
                setImageUrl('');
                setAvailability(allProductAvailability);
            }
        } else {
             if (mode === 'edit' && initialData) {
                setName(initialData.name);
                setPrice(initialData.price.toString());
                setStock(initialData.stock.toString());
                setImageUrl(initialData.imageUrl);
                setAvailability(initialData.availability.length ? initialData.availability : allProductAvailability);
            } else {
                setName('');
                setPrice('');
                setStock('');
                setImageUrl('');
                setAvailability(allProductAvailability);
            }
        }
    };

    const handleAvailabilityChange = (value: ProductAvailability) => {
        setAvailability(prev => {
            if (value === unavailableProductAvailability) {
                return prev.includes(unavailableProductAvailability) ? allProductAvailability : [unavailableProductAvailability];
            }

            const nextAvailability = prev.includes(value)
                ? prev.filter(item => item !== value)
                : [...prev.filter(item => item !== unavailableProductAvailability), value];

            return nextAvailability.length > 0 ? nextAvailability : [unavailableProductAvailability];
        });
    };


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (mode === 'create') {
            const newProductData: NewProduct = {
                name,
                price: parseFloat(price),
                stock: parseInt(stock, 10),
                imageUrl: imageUrl || `https://picsum.photos/seed/${name.replace(/\s/g, '')}/400/400`,
                imageHint: name.toLowerCase().split(' ').slice(0,2).join(' '),
                availability,
            };

            try {
                const addedProduct = await addProduct(newProductData);
                onProductAdded(addedProduct);
                toast({ title: "Éxito", description: "Producto añadido correctamente." });
                setIsOpen(false);
            } catch (error) {
                console.error("Error adding product:", error);
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: error instanceof Error ? error.message : "No se pudo añadir el producto.",
                });
            }
        } else if (mode === 'edit' && initialData) {
             const updatedProductData = {
                name,
                price: parseFloat(price),
                stock: parseInt(stock, 10),
                imageUrl,
                imageHint: name.toLowerCase().split(' ').slice(0,2).join(' '),
                availability,
                position: initialData.position,
            };
            try {
                const savedProduct = await updateProduct(initialData.id, updatedProductData);
                onProductUpdated(savedProduct);
                toast({ title: "Éxito", description: "Producto actualizado correctamente." });
                setIsOpen(false);
            } catch (error) {
                console.error("Error updating product:", error);
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: error instanceof Error ? error.message : "No se pudo actualizar el producto.",
                });
            }
        }
    };

    const dialogTitle = mode === 'create' ? "Añadir Nuevo Producto" : "Editar Producto";
    const dialogDescription = mode === 'create' ? "Complete los detalles del nuevo producto." : "Actualice los detalles del producto.";
    const buttonText = mode === 'create' ? "Guardar Producto" : "Guardar Cambios";
    const fieldPrefix = `product-${initialData?.id || 'create'}`;

    const trigger = mode === 'create' ? (
        <Button>
            <PlusCircle className="mr-2 h-4 w-4" />
            Añadir Producto
        </Button>
    ) : (
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
            <Pencil className="mr-2 h-4 w-4" />
            Editar
        </DropdownMenuItem>
    );

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                 {trigger}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{dialogTitle}</DialogTitle>
                    <DialogDescription>{dialogDescription}</DialogDescription>
                </DialogHeader>
                <form id={`product-form-${initialData?.id || 'create'}`} onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor={`${fieldPrefix}-name`}>Nombre del Producto</Label>
                            <Input id={`${fieldPrefix}-name`} placeholder="Ej: Carne Asada" value={name} onChange={e => setName(e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor={`${fieldPrefix}-price`}>Precio</Label>
                            <Input id={`${fieldPrefix}-price`} type="number" placeholder="0" value={price} onChange={e => setPrice(e.target.value)} required/>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor={`${fieldPrefix}-stock`}>Stock Inicial</Label>
                            <Input id={`${fieldPrefix}-stock`} type="number" placeholder="100" value={stock} onChange={e => setStock(e.target.value)} required/>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor={`${fieldPrefix}-image-url`}>URL de la Imagen</Label>
                            <Input id={`${fieldPrefix}-image-url`} placeholder="https://ejemplo.com/imagen.jpg" value={imageUrl} onChange={e => setImageUrl(e.target.value)} />
                            <p className="text-xs text-muted-foreground">
                                Si usas Supabase Storage, el bucket debe ser público o debes pegar una URL firmada vigente; las URLs públicas de buckets privados no cargan la imagen.
                            </p>
                        </div>
                         <div className="space-y-2">
                            <Label>Disponibilidad</Label>
                            <div className="space-y-2 rounded-md border p-4">
                                <div className="flex items-center space-x-2 rounded-md border border-dashed p-2">
                                    <Checkbox
                                        id={`${fieldPrefix}-availability-${unavailableProductAvailability}`}
                                        checked={availability.includes(unavailableProductAvailability)}
                                        onCheckedChange={() => handleAvailabilityChange(unavailableProductAvailability)}
                                    />
                                    <Label htmlFor={`${fieldPrefix}-availability-${unavailableProductAvailability}`} className="font-normal">No disponible para este evento</Label>
                                </div>
                                {Object.entries(availabilityMap).filter(([key]) => key !== unavailableProductAvailability).map(([key, { label }]) => (
                                    <div key={key} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`${fieldPrefix}-availability-${key}`}
                                            checked={availability.includes(key as ProductAvailability)}
                                            disabled={availability.includes(unavailableProductAvailability)}
                                            onCheckedChange={() => handleAvailabilityChange(key as ProductAvailability)}
                                        />
                                        <Label htmlFor={`${fieldPrefix}-availability-${key}`} className="font-normal">{label}</Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </form>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="secondary">
                            Cancelar
                        </Button>
                    </DialogClose>
                    <Button type="submit" form={`product-form-${initialData?.id || 'create'}`}>{buttonText}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function RestockForm({ product, onStockUpdated }: { product: Product; onStockUpdated: (product: Product) => void; }) {
    const { toast } = useToast();
    const { currentUser } = useAuth();
    const [quantity, setQuantity] = useState(1);
    const [isOpen, setIsOpen] = useState(false);

    const handleOpenChange = (open: boolean) => {
        setIsOpen(open);
        if (open) {
            setQuantity(1);
        }
    };
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!currentUser) {
            toast({ variant: "destructive", title: "Error", description: "No se pudo identificar al usuario actual." });
            return;
        }

        if (quantity <= 0) {
            toast({ variant: "destructive", title: "Cantidad Inválida", description: "La cantidad a añadir debe ser mayor que cero." });
            return;
        }

        try {
            await increaseProductStock(product.id, quantity, currentUser);
            const updatedProduct = { 
                ...product, 
                stock: product.stock + quantity,
                restockCount: (product.restockCount || 0) + 1,
            };
            onStockUpdated(updatedProduct);
            toast({ title: "Éxito", description: `Se añadieron ${quantity} unidades al stock de ${product.name}.` });
            setIsOpen(false);
        } catch (error) {
            console.error("Error restocking product:", error);
            toast({ variant: "destructive", title: "Error", description: "No se pudo actualizar el stock." });
        }
    };
    
    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Añadir Stock
                </DropdownMenuItem>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Añadir Stock para: {product.name}</DialogTitle>
                    <DialogDescription>
                        Esta acción incrementará el stock actual del producto. Quedará registrada en la auditoría como un reintegro.
                    </DialogDescription>
                </DialogHeader>
                <form id={`restock-form-${product.id}`} onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <p className="text-sm">Stock Actual: <span className="font-bold">{product.stock}</span></p>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="quantity-to-add">Cantidad a Añadir</Label>
                            <Input 
                                id="quantity-to-add" 
                                type="number" 
                                value={quantity} 
                                onChange={e => setQuantity(Number(e.target.value))} 
                                min="1"
                                required 
                            />
                        </div>
                        <div className="text-sm font-semibold">
                            <p>Nuevo Stock Total: {product.stock + quantity}</p>
                        </div>
                    </div>
                </form>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="secondary">Cancelar</Button>
                    </DialogClose>
                    <Button type="submit" form={`restock-form-${product.id}`}>Confirmar Reintegro</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function SortableProductCard({
    product,
    selfServicePending,
    onProductUpdated,
    onProductAdded
}: {
    product: Product;
    selfServicePending: number;
    onProductUpdated: (p: Product) => void;
    onProductAdded: (p: Product) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: product.id });
    const { toast } = useToast();
    const isUnavailable = product.availability.includes(unavailableProductAvailability);
    const availableStock = isUnavailable ? 0 : Math.max(product.stock - selfServicePending, 0);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const handleAvailabilityToggle = async () => {
        const nextAvailability = isUnavailable ? allProductAvailability : [unavailableProductAvailability];

        try {
            const updatedProduct = await updateProduct(product.id, {
                availability: nextAvailability,
                position: product.position,
            });
            onProductUpdated(updatedProduct);
            toast({
                title: "Éxito",
                description: isUnavailable
                    ? `${product.name} quedó disponible para todos los canales.`
                    : `${product.name} quedó marcado como no disponible.`,
            });
        } catch (error) {
            console.error("Error updating product availability:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "No se pudo actualizar la disponibilidad del producto.",
            });
        }
    };

    return (
        <div ref={setNodeRef} style={style} className="touch-none">
            <Card
                className={cn(
                    "overflow-hidden relative group",
                    isUnavailable && "bg-muted/60 border-dashed opacity-80",
                    !isUnavailable && product.stock <= 0 && "bg-yellow-100 border-yellow-300 dark:bg-yellow-900/30 dark:border-yellow-800"
                )}
            >
                <PermissionGate requiredPermission="products">
                    <div {...attributes} {...listeners} className="absolute top-2 left-2 z-10 p-2 cursor-grab active:cursor-grabbing">
                        <GripVertical className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="absolute top-2 right-2 z-10">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="secondary" size="icon" className="h-8 w-8 bg-black/50 hover:bg-black/70 text-white">
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                                <ProductForm
                                    mode="edit"
                                    initialData={product}
                                    onProductAdded={onProductAdded}
                                    onProductUpdated={onProductUpdated}
                                />
                                <RestockForm product={product} onStockUpdated={onProductUpdated} />
                                <DropdownMenuItem onSelect={handleAvailabilityToggle}>
                                    {isUnavailable ? (
                                        <CheckCircle2 className="mr-2 h-4 w-4" />
                                    ) : (
                                        <Ban className="mr-2 h-4 w-4" />
                                    )}
                                    {isUnavailable ? 'Marcar disponible' : 'Marcar no disponible'}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive">
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Eliminar
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </PermissionGate>
                <div className="relative flex justify-center pt-4">
                    <Image
                        src={product.imageUrl}
                        alt={product.name}
                        width={200}
                        height={200}
                        className="object-cover rounded-md transition-transform group-hover:scale-105"
                        data-ai-hint={product.imageHint}
                    />
                </div>
                <CardContent className="p-4">
                    <div className="flex justify-between items-start gap-2">
                        <h3 className="text-lg font-semibold">{product.name}</h3>
                         <div className="flex flex-col items-end gap-1">
                            {product.availability.map(avail => {
                                const currentAvailability = availabilityMap[avail];
                                if (!currentAvailability) return null;
                                const AvailabilityIcon = currentAvailability.icon;
                                return (
                                    <Badge key={avail} variant="secondary" className="flex items-center gap-1">
                                        <AvailabilityIcon className="h-3 w-3" />
                                        <span>{currentAvailability.label}</span>
                                    </Badge>
                                );
                            })}
                        </div>
                    </div>
                    <div className="flex justify-between items-center mt-2 gap-3">
                        <span className="text-xl font-bold">{formatCurrency(product.price)}</span>
                        <div className="flex flex-col items-end text-sm font-medium text-muted-foreground">
                            <span>Stock: {product.stock}</span>
                            {selfServicePending > 0 && !isUnavailable && <span>Autogestión: {selfServicePending}</span>}
                            <span className={cn("font-bold", (isUnavailable || availableStock <= 0) && "text-destructive")}>
                                {isUnavailable ? 'No disponible' : `Disponible: ${availableStock}`}
                            </span>
                        </div>
                    </div>
                    <div className="flex justify-start items-center mt-2 gap-2">
                        <Badge variant="outline" className="flex items-center gap-1">
                            <PackagePlus className="h-3 w-3" />
                            <span>Reintegros: {product.restockCount || 0}</span>
                        </Badge>
                        <Badge variant="outline" className="flex items-center gap-1 border-yellow-400 text-yellow-700">
                            <ClipboardCheck className="h-3 w-3" />
                            <span>Preventas: {product.preSaleSold || 0}</span>
                        </Badge>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasSeeded, setHasSeeded] = useState(false);
  const { toast } = useToast();
  const realtimeTables = useMemo(() => ['products', 'purchases'] as const, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const loadProducts = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setIsLoading(true);
    }
    try {
      const [fetchedProducts, fetchedPurchases] = await Promise.all([
        getProducts(),
        getPurchases(),
      ]);
      setProducts(fetchedProducts);
      setPurchases(fetchedPurchases);
      if (fetchedProducts.length > 0) {
          setHasSeeded(true);
      }
    } catch (error) {
      console.error("Error fetching products:", error);
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los productos." });
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }, [toast]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useSupabaseRealtime({
    tables: realtimeTables,
    onChange: () => loadProducts(false),
  });

  const selfServicePendingQuantities = useMemo(() => getSelfServicePendingQuantities(purchases), [purchases]);

  const handleProductAdded = (newProduct: Product) => {
    setProducts(prevProducts => [...prevProducts, newProduct].sort((a,b) => a.position - b.position));
  };

  const handleProductUpdated = (updatedProduct: Product) => {
    setProducts(prevProducts => prevProducts.map(p => p.id === updatedProduct.id ? updatedProduct : p));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
        const oldIndex = products.findIndex((p) => p.id === active.id);
        const newIndex = products.findIndex((p) => p.id === over.id);
        const newOrder = arrayMove(products, oldIndex, newIndex);
        setProducts(newOrder); // Optimistic UI update
        try {
            await updateProductOrder(newOrder);
            toast({ title: "Éxito", description: "El orden de los productos ha sido actualizado." });
        } catch (error) {
            console.error("Error updating product order:", error);
            toast({ variant: "destructive", title: "Error", description: "No se pudo guardar el nuevo orden." });
            setProducts(products); // Revert on error
        }
    }
  };

  const handleSeedDatabase = async () => {
    try {
        await Promise.all(mockProducts.map((p, index) => addProductWithId({ ...p, position: index })));
        const fetchedProducts = await getProducts();
        setProducts(fetchedProducts);
        setHasSeeded(true);
        toast({ title: "Éxito", description: "La base de datos ha sido inicializada con productos de ejemplo." });
    } catch (error) {
        console.error("Error seeding database:", error);
        toast({ variant: "destructive", title: "Error", description: "No se pudo inicializar la base de datos." });
    }
  };

  return (
    <div>
      <PageHeader
        title="Productos"
        description="Gestionar el inventario de productos. Arrastra las tarjetas para reordenarlas."
      >
        <PermissionGate requiredPermission="products">
           {!hasSeeded && (
            <Button variant="outline" onClick={handleSeedDatabase}>
                <Database className="mr-2 h-4 w-4" />
                Cargar Productos de Ejemplo
            </Button>
           )}
           <ProductForm mode="create" onProductAdded={handleProductAdded} onProductUpdated={handleProductUpdated} />
        </PermissionGate>
      </PageHeader>
      
      {isLoading ? (
        <p>Cargando productos...</p>
      ) : (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
        >
            <SortableContext items={products.map(p => p.id)} strategy={verticalListSortingStrategy}>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {products.map((product) => (
                        <SortableProductCard
                            key={product.id}
                            product={product}
                            selfServicePending={selfServicePendingQuantities[product.id] || 0}
                            onProductAdded={handleProductAdded}
                            onProductUpdated={handleProductUpdated}
                        />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
