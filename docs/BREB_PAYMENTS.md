# Pagos Bre-B manuales

## Alcance actual

La aplicación muestra la llave Bre-B del colegio y el valor exacto calculado por el servidor. No existe conexión con DaviPlata, Davivienda, Redeban ni una API bancaria. Por esa razón, pulsar **Ya realicé el pago** solo crea o actualiza una transacción con estado `reported`; la compra continúa `pending`.

El personal autorizado abre `/dashboard/breb-payments`, comprueba el ingreso directamente en la cuenta del colegio y confirma o rechaza el reporte. La confirmación ejecuta `verify_breb_payment` dentro de PostgreSQL: bloquea pago y compra, valida monto y estados, descuenta inventario mediante la transición existente y marca el pago `verified`. La función es idempotente.

## Estados

- Pago: `created`, `reported`, `verified`, `rejected`, `cancelled`.
- Compra: `pending`, `paid`, `partially-delivered`, `delivered`, `cancelled` y estados de preventa.
- `reported` nunca habilita entrega ni equivale a `paid`.

## Configuración

```env
NEXT_PUBLIC_BREB_ENABLED=true
NEXT_PUBLIC_BREB_KEY=
NEXT_PUBLIC_BREB_ACCOUNT_NAME=Colegio Franciscano Agustín Gemelli
NEXT_PUBLIC_BREB_QR_PAYLOAD=
BREB_REPORTED_RESERVATION_MINUTES=1440
```

La llave es pública porque se muestra al pagador. El payload QR solo se configura cuando proviene oficialmente de la entidad financiera; la aplicación lo convierte en imagen localmente con `qrcode`. Si está vacío, no aparece ningún QR financiero.

`BREB_REPORTED_RESERVATION_MINUTES` extiende la reserva cuando el padre reporta el pago. El servidor limita el valor entre 60 minutos y 7 días; el valor recomendado es 1440 (24 horas). Un rechazo conserva la compra pendiente y deja una ventana de 2 horas.

## Seguridad y trazabilidad

- La tabla `payment_transactions` tiene RLS activa y ningún permiso para `anon` o `authenticated`.
- El padre solo reporta mediante un endpoint con cookie HttpOnly firmada y ligada al ID de compra.
- Monto, estado de compra y estado final del pago se toman de PostgreSQL.
- Caja requiere una sesión de dashboard con rol `admin`, `cashier` o permiso `cashbox`.
- Las compras con transacciones de pago no se pueden eliminar físicamente.
- Los eventos reportado, verificado y rechazado se registran sin celular, documento ni token.

## Limitaciones y evolución

La conciliación es manual; el sistema no puede asegurar por sí solo que el dinero llegó. Los campos `external_reference`, `provider_transaction_id`, `authorization_number` y `metadata` permiten incorporar en el futuro una integración bancaria oficial sin mezclarla con este flujo.
