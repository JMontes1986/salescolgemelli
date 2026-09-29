import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20260929120000_self_service_phone_sessions_breb.sql", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/self-service/page.tsx", import.meta.url), "utf8");
const createRoute = readFileSync(new URL("../src/app/api/self-service/purchases/route.ts", import.meta.url), "utf8");
const editRoute = readFileSync(new URL("../src/app/api/self-service/purchases/[id]/route.ts", import.meta.url), "utf8");

test("public creation accepts only server-priced item identity, quantity and phone", () => {
  assert.match(createRoute, /\.strict\(\)/);
  assert.match(createRoute, /items: z\.array/);
  assert.match(createRoute, /celular:/);
  assert.doesNotMatch(createRoute, /z\.object\([^)]*price/s);
});

test("legacy document-based RPC access is revoked", () => {
  assert.match(migration, /drop function if exists public\.get_self_service_purchases_by_cedula/);
  assert.match(migration, /revoke all[\s\S]*from anon, authenticated/i);
});

test("editing requires the signed session to own the purchase", () => {
  assert.match(editRoute, /session\.purchaseIds\.includes\(id\)/);
  assert.doesNotMatch(editRoute, /customerCedula|p_cedula/);
  assert.match(migration, /no se puede modificar después de reportar un pago/i);
});

test("payment reporting does not set purchase paid", () => {
  const reportBody = migration.slice(migration.indexOf("function public.report_breb_payment"), migration.indexOf("function public.verify_breb_payment"));
  assert.match(reportBody, /status = 'reported'/);
  assert.doesNotMatch(reportBody, /purchase[^;]*status\s*=\s*'paid'/i);
});

test("verification locks records, validates amount and uses atomic stock transition", () => {
  const verifyBody = migration.slice(migration.indexOf("function public.verify_breb_payment"), migration.indexOf("function public.reject_breb_payment"));
  assert.match(verifyBody, /for update/gi);
  assert.match(verifyBody, /payment_record\.amount <> purchase_record\.total/);
  assert.match(verifyBody, /update_purchase_status_with_stock\(purchase_record\.id, 'paid'\)/);
  assert.match(verifyBody, /status = 'verified'[\s\S]*return payment_record/);
});

test("a pending purchase cannot be delivered before payment verification", () => {
  assert.match(migration, /block_unpaid_purchase_delivery/);
  assert.match(migration, /old\.status = 'pending'[\s\S]*new\.status in \('delivered', 'partially-delivered'\)/);
});

test("QR images are local and no invented DaviPlata link remains", () => {
  assert.doesNotMatch(page, /api\.qrserver\.com|daviplata:\/\/|NEXT_PUBLIC_DAVIPLATA/i);
  assert.match(page, /LocalQrCode/);
  assert.match(page, /BREB_QR_PAYLOAD &&/);
});
