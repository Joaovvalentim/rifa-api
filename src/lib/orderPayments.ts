import { createHmac, timingSafeEqual } from "crypto";
import { OrderResponse } from "mercadopago/dist/clients/order/commonTypes";
import { IS_PRODUCTION, MP_WEBHOOK_SECRET } from "./env";

type LocalOrderStatus = {
  status: "pending" | "paid" | "expired" | "cancelled" | "failed";
  paymentStatus: string;
  paymentStatusDetail: string;
  paidAt: Date | null;
};

export function amountToMercadoPagoString(value: number) {
  return value.toFixed(2);
}

export function buildPaymentExternalRef(orderId: string) {
  return `order_${orderId}`;
}

export function resolveLocalOrderStatus(
  providerStatus?: string,
  providerStatusDetail?: string
): LocalOrderStatus {
  const status = providerStatus || "pending";
  const detail = providerStatusDetail || "waiting_transfer";

  if (status === "processed" || status === "approved") {
    return {
      status: "paid",
      paymentStatus: status,
      paymentStatusDetail: detail,
      paidAt: new Date(),
    };
  }

  if (status === "expired") {
    return {
      status: "expired",
      paymentStatus: status,
      paymentStatusDetail: detail,
      paidAt: null,
    };
  }

  if (status === "canceled" || status === "cancelled") {
    return {
      status: "cancelled",
      paymentStatus: status,
      paymentStatusDetail: detail,
      paidAt: null,
    };
  }

  if (status === "failed" || status === "rejected") {
    return {
      status: "failed",
      paymentStatus: status,
      paymentStatusDetail: detail,
      paidAt: null,
    };
  }

  return {
    status: "pending",
    paymentStatus: status,
    paymentStatusDetail: detail,
    paidAt: null,
  };
}

export function extractPixPayment(order: OrderResponse) {
  const payment = order.transactions?.payments?.[0];

  return {
    providerOrderId: order.id || null,
    providerTransactionId: payment?.id || null,
    status: order.status || payment?.status || "pending",
    statusDetail:
      order.status_detail || payment?.status_detail || "waiting_transfer",
    ticketUrl: payment?.payment_method?.ticket_url || null,
    qrCode: payment?.payment_method?.qr_code || null,
    qrCodeBase64: payment?.payment_method?.qr_code_base64 || null,
    expiresAt: payment?.date_of_expiration
      ? new Date(payment.date_of_expiration)
      : null,
  };
}

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

export function verifyMercadoPagoWebhookSignature(params: {
  signatureHeader?: string | string[];
  requestIdHeader?: string | string[];
  dataId?: string;
}): boolean {
  if (!MP_WEBHOOK_SECRET) {
    return !IS_PRODUCTION;
  }

  const rawSignature = Array.isArray(params.signatureHeader)
    ? params.signatureHeader[0]
    : params.signatureHeader;
  const rawRequestId = Array.isArray(params.requestIdHeader)
    ? params.requestIdHeader[0]
    : params.requestIdHeader;

  if (!rawSignature || !rawRequestId || !params.dataId) {
    return false;
  }

  const pieces = rawSignature.split(",").reduce<Record<string, string>>(
    (acc, part) => {
      const [key, value] = part.trim().split("=");
      if (key && value) acc[key] = value;
      return acc;
    },
    {}
  );

  const ts = pieces.ts;
  const hash = pieces.v1;

  if (!ts || !hash) {
    return false;
  }

  const manifest = `id:${params.dataId};request-id:${rawRequestId};ts:${ts};`;
  const expected = createHmac("sha256", MP_WEBHOOK_SECRET)
    .update(manifest)
    .digest("hex");

  return safeEqual(expected, hash);
}
