import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { syncMercadoPagoOrder } from "../lib/syncMercadoPagoOrder";

export function startExpirePendingOrdersJob() {
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();

      const oldOrders = await prisma.order.findMany({
        where: {
          status: "pending",
          expiresAt: { lte: now },
        },
        select: { id: true, paymentProviderOrderId: true },
      });

      if (oldOrders.length === 0) return;

      for (const order of oldOrders) {
        if (!order.paymentProviderOrderId) continue;

        try {
          await syncMercadoPagoOrder(order.paymentProviderOrderId);
        } catch (err) {
          console.error("Erro ao sincronizar pedido expirado:", {
            orderId: order.id,
            err,
          });
        }
      }

      const ordersStillPending = await prisma.order.findMany({
        where: {
          id: { in: oldOrders.map((order) => order.id) },
          status: "pending",
          expiresAt: { lte: now },
        },
        select: { id: true },
      });

      if (ordersStillPending.length === 0) return;

      const ids = ordersStillPending.map((order) => order.id);

      await prisma.$transaction(async (tx) => {
        await tx.orderNumber.deleteMany({
          where: { orderId: { in: ids } },
        });

        await tx.order.updateMany({
          where: { id: { in: ids } },
          data: {
            status: "expired",
            paymentStatus: "expired",
            paymentStatusDetail: "expired_by_timeout",
          },
        });
      });

      console.log(`Expirados ${ids.length} pedidos pendentes`);
    } catch (err) {
      console.error("Erro no job de expiracao:", err);
    }
  });
}
