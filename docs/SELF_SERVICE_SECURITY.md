# Seguridad de autogestión

## Cambios aplicados

El flujo público dejó de usar cédula. Una compra nueva solo recibe `{ items: [{ id, quantity }], celular }`; precios, nombres, total, estado y stock se resuelven en PostgreSQL. El campo legado `purchases.cedula` se conserva por compatibilidad con POS y preventa, pero queda vacío en nuevas compras de autogestión.

Al crear una compra, el servidor emite una cookie `sg_self_service_session` HttpOnly, `SameSite=Strict`, segura en producción y con duración de 6 horas. El token usa HMAC-SHA-256, contiene versión, hash del celular, IDs de compras, emisión y expiración, y se verifica con comparación resistente a ataques de tiempo. No se persiste en Supabase ni expone PII.

Las RPC antiguas que aceptaban cédula/celular pierden `EXECUTE` para `anon` y `authenticated`. Creación, edición e historial pasan por endpoints server-side y las ediciones se autorizan por posesión de la sesión, no por `purchaseId`, celular o cédula. No se ofrece búsqueda pública global por teléfono.

## Inventario y concurrencia

La creación y edición reutilizan las funciones transaccionales existentes: bloquean productos con `FOR UPDATE`, calculan stock menos reservas activas y sincronizan `self_service_reservations`. Confirmar Bre-B usa la transición atómica de compra y no descuenta inventario dos veces.

## API y privacidad

- Validación estricta con Zod, propiedades adicionales rechazadas y body de creación limitado.
- Mutaciones solo por POST/PATCH JSON, validación de mismo origen y `Cache-Control: no-store`.
- Rate limiting distribuido mediante la tabla/RPC ya usada por login; las claves incluyen namespace e IP hasheada.
- Historial de sesión devuelve solo campos necesarios; no devuelve celular, QR, código de entrega ni datos de pago.
- Los QR se generan en el navegador con `qrcode`; se eliminó `api.qrserver.com` de código y CSP.
- Los errores SQL no incluyen stack trace ni claves de servicio.

## RLS y permisos

`payment_transactions` está cerrada para roles públicos. Las RPC nuevas son `SECURITY DEFINER`, fijan `search_path`, revocan permisos públicos y se conceden exclusivamente a `service_role`. Los endpoints administrativos validan primero la sesión local y los permisos de caja.

## Riesgos residuales

- El celular no se verifica por SMS porque esta fase no incorpora proveedor OTP. La sesión demuestra que el navegador creó la compra, no que controla realmente el número indicado.
- La confirmación Bre-B depende de revisión humana y puede sufrir error operativo; la interfaz exige confirmación explícita y conserva auditoría.
- El rate limiter cae temporalmente a memoria local si Supabase no responde; en ese caso la protección no se comparte entre instancias.
- El campo legado `cedula` continúa en el modelo general para POS/preventa. Retirarlo físicamente requiere una migración separada de esos módulos.
