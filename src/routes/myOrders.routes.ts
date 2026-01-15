import { Router } from "express";
import { prisma } from "../lib/prisma";
import { auth } from "../middlewares/auth";

export const myOrdersRoutes = Router();

myOrdersRoutes.get("/", auth, async (req, res) => {
  const userId = (req as any).userId;

  const orders = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      totalAmount: true,
      createdAt: true,
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
        orderBy: { number: "asc" },
      },
    },
  });

  res.json(orders);
});
