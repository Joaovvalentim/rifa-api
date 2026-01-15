import cron from "node-cron";
import { prisma } from "../lib/prisma";

export function startExpirePendingOrdersJob() {
  // roda a cada 1 minuto
  cron.schedule("* * * * *", async () => {
    try {
      const minutes = 1;
      const cutoff = new Date(Date.now() - minutes * 60 * 1000);

      // 1) pega pedidos pendentes antigos
      const oldOrders = await prisma.order.findMany({
        where: {
          status: "pending",
          createdAt: { lt: cutoff },
        },
        select: { id: true },
      });

      if (oldOrders.length === 0) return;

      const ids = oldOrders.map((o) => o.id);

      // 2) transação: remove números + marca pedido como expirado
      await prisma.$transaction(async (tx) => {
        await tx.orderNumber.deleteMany({
          where: { orderId: { in: ids } },
        });

        await tx.order.updateMany({
          where: { id: { in: ids } },
          data: { status: "expired" },
        });
      });

      console.log(`Expirados ${ids.length} pedidos pendentes`);
    } catch (err) {
      console.error("Erro no job de expiração:", err);
    }
  });
}
