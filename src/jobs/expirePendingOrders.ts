import cron from "node-cron";
import { prisma } from "../lib/prisma";

export function startExpirePendingOrdersJob() {
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();

      const oldOrders = await prisma.order.findMany({
        where: {
          status: "pending",
          expiresAt: { lte: now },
        },
        select: { id: true },
      });

      if (oldOrders.length === 0) return;

      const ids = oldOrders.map((order) => order.id);

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
