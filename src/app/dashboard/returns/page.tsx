
"use client";

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Undo2, CheckCircle, PackageSearch } from "lucide-react";
import { getProducts } from '@/lib/services/product-service';
import type { Product, Return, ReturnSource } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getReturns, addReturnAndUpdateStock } from '@/lib/services/return-service';
import { useAuth } from '@/hooks/use-auth';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";

const RETURNS_REALTIME_TABLES = ['products', 'returns'] as const;

export default function ReturnsPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [returnsHistory, setReturnsHistory] = useState<Return[]>([]);
    const [selectedProductId, setSelectedProductId] = useState<string>('');
    const [quantity, setQuantity] = useState(1);
    const [source, setSource] = useState<ReturnSource>('Punto de Venta');
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [lastReturn, setLastReturn] = useState<{ name: string; quantity: number } | null>(null);
    const { toast } = useToast();
    const { currentUser } = useAuth();

    const loadData = useCallback(async (showLoading = true) => {
        if (showLoading) setIsLoading(true);
        try {
            const [fetchedProducts, fetchedReturns] = await Promise.all([
                getProducts(),
                getReturns(),
            ]);
            setProducts(fetchedProducts);
            setReturnsHistory(fetchedReturns);
        } catch (error) {
            console.error("Error fetching data:", error);
            toast({
                variant: 'destructive',
                title: 'Error de Carga',
                description: 'No se pudieron cargar los datos iniciales.',
            });
        } finally {
            if (showLoading) setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    useSupabaseRealtime({
        tables: RETURNS_REALTIME_TABLES,
        onChange: () => loadData(false),
    });

    const handleReturn = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!currentUser) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo identificar al usuario actual.' });
            return;
        }
        
        if (!selectedProductId || !source) {
            toast({ variant: 'destructive', title: 'Campos Requeridos', description: 'Por favor seleccione un producto y el origen de la venta.' });
            return;
        }

        if (quantity <= 0) {
            toast({ variant: 'destructive', title: 'Cantidad Inválida', description: 'La cantidad a devolver debe ser mayor que cero.' });
            return;
        }

        setIsProcessing(true);
        setLastReturn(null);

        const returnedProduct = products.find(p => p.id === selectedProductId);
        if (!returnedProduct) {
             toast({ variant: 'destructive', title: 'Error', description: 'Producto seleccionado no válido.' });
             setIsProcessing(false);
             return;
        }

        try {
            // This function now handles both stock update and return logging
            const newReturnRecord = await addReturnAndUpdateStock({
                productId: selectedProductId,
                productName: returnedProduct.name,
                quantity: quantity,
                returnedAt: new Date().toLocaleString('es-CO'),
                processedByUserId: currentUser.id,
                processedByUserName: currentUser.name,
                source: source,
            });
            
            // Update local state for products
            setProducts(prevProducts => 
                prevProducts.map(p => 
                    p.id === selectedProductId 
                    ? { ...p, stock: p.stock + quantity } 
                    : p
                )
            );
            
            // Update local state for returns history
            setReturnsHistory(prevHistory => [newReturnRecord, ...prevHistory]);

            setLastReturn({ name: returnedProduct.name, quantity });
            
            toast({
                title: 'Devolución Exitosa',
                description: `Se devolvió ${returnedProduct.name} (x${quantity}) al stock.`,
            });

            // Reset form
            setSelectedProductId('');
            setQuantity(1);
            setSource('Punto de Venta');

        } catch (error) {
            console.error("Error processing return:", error);
            toast({
                variant: 'destructive',
                title: 'Error en la Devolución',
                description: 'No se pudo procesar la devolución. Intente de nuevo.'
            });
        } finally {
            setIsProcessing(false);
        }
    };
    
    const selectedProduct = products.find(p => p.id === selectedProductId);
    const canSubmit = !isProcessing && selectedProductId && source;

    return (
        <div>
            <PageHeader
                title="Gestión de Devoluciones"
                description="Seleccione un producto para devolverlo al inventario."
            />
            <div className="grid gap-8 md:grid-cols-2">
                <Card>
                    <form onSubmit={handleReturn}>
                        <CardHeader>
                            <CardTitle>Procesar Devolución de Producto</CardTitle>
                            <CardDescription>
                                Elija el producto, la cantidad y el origen para agregarlo de nuevo al stock.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="product-select">Producto a Devolver</Label>
                                <Select 
                                    name="returned-product"
                                    value={selectedProductId}
                                    onValueChange={setSelectedProductId}
                                    disabled={isLoading || isProcessing}
                                >
                                    <SelectTrigger id="product-select">
                                        <SelectValue placeholder="Seleccione un producto..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {isLoading ? (
                                            <SelectItem value="loading" disabled>Cargando productos...</SelectItem>
                                        ) : (
                                            products.map(product => (
                                                <SelectItem key={product.id} value={product.id}>
                                                    {product.name}
                                                </SelectItem>
                                            ))
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Origen de la Venta</Label>
                                <RadioGroup 
                                    name="return-source"
                                    value={source} 
                                    onValueChange={(value) => setSource(value as ReturnSource)}
                                    className="flex space-x-4"
                                    disabled={isProcessing}
                                >
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="Punto de Venta" id="pos" />
                                        <Label htmlFor="pos">Punto de Venta</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="Autogestión" id="self-service" />
                                        <Label htmlFor="self-service">Autogestión</Label>
                                    </div>
                                </RadioGroup>
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="quantity">Cantidad a Devolver</Label>
                                <Input 
                                    id="quantity" 
                                    name="quantity"
                                    type="number"
                                    min="1"
                                    value={quantity}
                                    onChange={e => setQuantity(Number(e.target.value))}
                                    disabled={!selectedProductId || isProcessing}
                                />
                            </div>
                            {selectedProduct && (
                                <div className="text-sm text-muted-foreground">
                                    <p>Stock actual: {selectedProduct.stock}</p>
                                    <p>Stock después de la devolución: {selectedProduct.stock + (quantity || 0)}</p>
                                </div>
                            )}
                        </CardContent>
                        <CardFooter>
                            <Button className="w-full" type="submit" disabled={!canSubmit}>
                                <Undo2 className="mr-2 h-4 w-4" />
                                {isProcessing ? 'Procesando...' : 'Confirmar Devolución'}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>

                <Card className="bg-muted/30">
                     <CardHeader>
                        <CardTitle>Última Devolución</CardTitle>
                        <CardDescription>
                            Aquí se mostrará la información de la última devolución procesada.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {lastReturn ? (
                            <div className="flex flex-col items-center justify-center text-center gap-4 p-8 bg-green-500/10 rounded-lg">
                                <CheckCircle className="h-16 w-16 text-green-600" />
                                <h3 className="text-xl font-semibold">Devolución Completada</h3>
                                <p className="text-muted-foreground">
                                   Se devolvieron <span className="font-bold">{lastReturn.quantity}</span> unidades de <span className="font-bold">{lastReturn.name}</span> al inventario.
                                </p>
                            </div>
                        ) : (
                             <div className="flex flex-col items-center justify-center text-center gap-4 p-8">
                                <PackageSearch className="h-16 w-16 text-muted-foreground" />
                                <p className="text-muted-foreground">
                                   Complete el formulario para procesar una devolución.
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="mt-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Historial de Devoluciones</CardTitle>
                        <CardDescription>
                            Registro de todas las devoluciones de productos al inventario.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Producto</TableHead>
                                    <TableHead>Origen</TableHead>
                                    <TableHead>Cantidad</TableHead>
                                    <TableHead>Procesado por</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">
                                            Cargando historial...
                                        </TableCell>
                                    </TableRow>
                                ) : returnsHistory.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">
                                            No hay devoluciones registradas.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    returnsHistory.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell>{item.returnedAt}</TableCell>
                                        <TableCell className="font-medium">{item.productName}</TableCell>
                                        <TableCell>{item.source}</TableCell>
                                        <TableCell>+{item.quantity}</TableCell>
                                        <TableCell>{item.processedByUserName}</TableCell>
                                    </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
