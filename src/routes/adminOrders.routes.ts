import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { auth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/requireAdmin";

export const adminOrdersRoutes = Router();
adminOrdersRoutes.use(auth, requireAdmin);

// GET /admin/orders?status=pending&raffleId=...
adminOrdersRoutes.get("/", async (req, res) => {
  const status =
    typeof req.query.status === "string" ? req.query.status : undefined;
  const raffleId =
    typeof req.query.raffleId === "string" ? req.query.raffleId : undefined;

  const orders = await prisma.order.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(raffleId ? { raffleId } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      paymentStatusDetail: true,
      quantity: true,
      totalAmount: true,
      createdAt: true,
      expiresAt: true,
      paidAt: true,
      user: { select: { id: true, name: true, email: true } },
      raffle: { select: { id: true, title: true } },
      numbers: {
        select: { number: true, status: true },
        orderBy: { number: "asc" },
      },
    },
    take: 200, // MVP: limita para não pesar
  });

  res.json(orders);
});

// PATCH /admin/orders/:id/status  { status: "paid" | "cancelled" }
adminOrdersRoutes.patch("/:id/status", async (req, res) => {
  const schema = z.object({
    status: z.enum(["paid", "cancelled"]),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });

  const { status } = parsed.data;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: req.params.id },
        select: { id: true, status: true },
      });

      if (!order) throw new Error("Pedido não encontrado");

      if (order.status !== "pending") {
        throw new Error("Só é possível alterar pedidos pendentes");
      }

      // se marcou como pago: confirma números
      if (status === "paid") {
        await tx.orderNumber.updateMany({
          where: { orderId: order.id },
          data: { status: "confirmed" },
        });
      }

      // se cancelou: libera números
      if (status === "cancelled") {
        await tx.orderNumber.deleteMany({
          where: { orderId: order.id },
        });
      }

      return tx.order.update({
        where: { id: order.id },
        data: {
          status,
          paymentStatus: status === "paid" ? "processed" : "cancelled",
          paymentStatusDetail:
            status === "paid" ? "approved_manually" : "cancelled_manually",
          paidAt: status === "paid" ? new Date() : null,
        },
        select: { id: true, status: true },
      });
    });

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? "Erro ao atualizar pedido" });
  }
});
