import { randomUUID } from "crypto";
import { MercadoPagoConfig, Order } from "mercadopago";
import {
  APP_WEB_URL,
  MP_WEBHOOK_SECRET,
  PIX_EXPIRATION_MINUTES,
  PUBLIC_API_URL,
  requireEnv,
} from "./env";

function getClient() {
  const accessToken = requireEnv("MP_ACCESS_TOKEN");

  return new MercadoPagoConfig({
    accessToken,
    options: { timeout: 10_000 },
  });
}

export function getMercadoPagoOrderClient() {
  return new Order(getClient());
}

export function isMercadoPagoTestToken() {
  return requireEnv("MP_ACCESS_TOKEN").startsWith("TEST-");
}

export function getMercadoPagoPayer(user: { email: string; name?: string | null }) {
  const testPayerEmail = process.env.MP_TEST_PAYER_EMAIL?.trim();
  const testPayerFirstName = process.env.MP_TEST_PAYER_FIRST_NAME?.trim();

  if (testPayerEmail) {
    return {
      email: testPayerEmail,
      first_name: testPayerFirstName || "APRO",
    };
  }

  if (isMercadoPagoTestToken()) {
    return {
      email: "test@testuser.com",
      first_name: "APRO",
    };
  }

  return {
    email: user.email,
  };
}

export function buildPixExpiration() {
  const expiresAt = new Date(Date.now() + PIX_EXPIRATION_MINUTES * 60 * 1000);

  return {
    expiresAt,
    isoDuration: `PT${PIX_EXPIRATION_MINUTES}M`,
  };
}

export function buildMercadoPagoWebhookUrl() {
  return `${PUBLIC_API_URL}/payments/mercado-pago/webhook`;
}

export function buildMercadoPagoReturnUrl(orderId: string) {
  return `${APP_WEB_URL}/checkout/${encodeURIComponent(orderId)}`;
}

export function createIdempotencyKey() {
  return randomUUID();
}

export function hasMercadoPagoWebhookSecret() {
  return Boolean(MP_WEBHOOK_SECRET);
}
