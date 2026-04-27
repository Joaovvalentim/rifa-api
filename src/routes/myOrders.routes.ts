import { Router } from "express";
import { prisma } from "../lib/prisma";
import { syncMercadoPagoOrder } from "../lib/syncMercadoPagoOrder";
import { auth } from "../middlewares/auth";

export const myOrdersRoutes = Router();

const orderSelect = {
  id: true,
  status: true,
  paymentStatus: true,
  paymentStatusDetail: true,
  totalAmount: true,
  quantity: true,
  createdAt: true,
  expiresAt: true,
  paidAt: true,
  paymentTicketUrl: true,
  paymentQrCode: true,
  paymentQrCodeBase64: true,
  raffle: {
    select: {
      id: true,
      title: true,
    },
  },
  numbers: {
    select: {
      number: true,
      status: true,
    },
    orderBy: { number: "asc" as const },
  },
} as const;

async function syncPendingOrders(userId: string) {
  const pendingOrders = await prisma.order.findMany({
    where: {
      userId,
      status: "pending",
      paymentProvider: "mercado_pago",
      paymentProviderOrderId: { not: null },
    },
    select: { paymentProviderOrderId: true },
    take: 10,
  });

  await Promise.allSettled(
    pendingOrders
      .map((order) => order.paymentProviderOrderId)
      .filter((value): value is string => Boolean(value))
      .map((providerOrderId) => syncMercadoPagoOrder(providerOrderId))
  );
}

myOrdersRoutes.get("/", auth, async (req, res) => {
  const userId = (req as any).userId as string;

  await syncPendingOrders(userId);

  const orders = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: orderSelect,
  });

  res.json(orders);
});

myOrdersRoutes.get("/:id", auth, async (req, res) => {
  const userId = (req as any).userId as string;

  const order = await prisma.order.findFirst({
    where: {
      id: req.params.id,
      userId,
    },
    select: {
      paymentProviderOrderId: true,
    },
  });

  if (!order) {
    return res.status(404).json({ error: "Pedido nao encontrado" });
  }

  if (order.paymentProviderOrderId) {
    await Promise.allSettled([syncMercadoPagoOrder(order.paymentProviderOrderId)]);
  }

  const freshOrder = await prisma.order.findFirst({
    where: {
      id: req.params.id,
      userId,
    },
    select: orderSelect,
  });

  if (!freshOrder) {
    return res.status(404).json({ error: "Pedido nao encontrado" });
  }

  res.json(freshOrder);
});
