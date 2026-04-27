import { prisma } from "./prisma";
import { getMercadoPagoOrderClient } from "./mercadoPago";
import {
  extractPixPayment,
  resolveLocalOrderStatus,
} from "./orderPayments";

export async function syncMercadoPagoOrder(providerOrderId: string) {
  const orderClient = getMercadoPagoOrderClient();
  const providerOrder = await orderClient.get({ id: providerOrderId });
  const externalRef = providerOrder.external_reference;

  if (!externalRef) {
    throw new Error("Pagamento sem external_reference");
  }

  const localOrder = await prisma.order.findFirst({
    where: {
      OR: [
        { paymentProviderOrderId: providerOrderId },
        { paymentExternalRef: externalRef },
      ],
    },
    select: { id: true, status: true },
  });

  if (!localOrder) {
    throw new Error("Pedido local nao encontrado para o pagamento");
  }

  const pix = extractPixPayment(providerOrder);
  const next = resolveLocalOrderStatus(pix.status, pix.statusDetail);

  await prisma.$transaction(async (tx) => {
    if (next.status === "paid" && localOrder.status !== "paid") {
      await tx.orderNumber.updateMany({
        where: { orderId: localOrder.id },
        data: { status: "confirmed" },
      });
    }

    if (
      ["expired", "cancelled", "failed"].includes(next.status) &&
      localOrder.status === "pending"
    ) {
      await tx.orderNumber.deleteMany({
        where: { orderId: localOrder.id },
      });
    }

    await tx.order.update({
      where: { id: localOrder.id },
      data: {
        status: next.status,
        paymentStatus: next.paymentStatus,
        paymentStatusDetail: next.paymentStatusDetail,
        paymentProviderOrderId: pix.providerOrderId,
        paymentProviderTxnId: pix.providerTransactionId,
        paymentTicketUrl: pix.ticketUrl,
        paymentQrCode: pix.qrCode,
        paymentQrCodeBase64: pix.qrCodeBase64,
        expiresAt: pix.expiresAt,
        paidAt: next.paidAt ?? undefined,
      },
    });
  });
}
