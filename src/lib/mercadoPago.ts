import { randomUUID } from "crypto";
import { MercadoPagoConfig, Order } from "mercadopago";
import { OrderResponse } from "mercadopago/dist/clients/order/commonTypes";
import {
  APP_WEB_URL,
  MP_WEBHOOK_SECRET,
  PAYMENT_PROVIDER_MODE,
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

export function isMockPaymentProvider() {
  return PAYMENT_PROVIDER_MODE === "mock";
}

export function createMockPixOrder(params: {
  externalReference: string;
  totalAmount: string;
  expiresAt: Date;
}): OrderResponse {
  const mockId = `mock_order_${randomUUID()}`;

  return {
    id: mockId,
    status: "pending",
    status_detail: "waiting_transfer",
    external_reference: params.externalReference,
    transactions: {
      payments: [
        {
          id: `mock_payment_${randomUUID()}`,
          status: "pending",
          status_detail: "waiting_transfer",
          date_of_expiration: params.expiresAt.toISOString(),
          payment_method: {
            ticket_url: `${APP_WEB_URL}/checkout/mock/${mockId}`,
            qr_code: `000201mock-${params.externalReference}-${params.totalAmount}`,
            qr_code_base64: undefined,
          },
        },
      ],
    },
    api_response: {
      status: 201,
      headers: [],
    },
  } as unknown as OrderResponse;
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
