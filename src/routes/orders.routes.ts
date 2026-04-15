import { randomInt } from "crypto";
import { Request, Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { auth } from "../middlewares/auth";
import { createRateLimit } from "../middlewares/rateLimit";

export const ordersRoutes = Router();

ordersRoutes.use(
  createRateLimit({
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: "Muitas tentativas de pedido. Aguarde antes de tentar novamente.",
  })
);

ordersRoutes.post("/", auth, async (req, res) => {
  const schema = z.object({
    raffleId: z.string().min(1),
    quantity: z.number().int().min(1).max(200),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { raffleId, quantity } = parsed.data;
  const userId = (req as Request & { userId?: string }).userId as string;

  try {
    const raffle = await prisma.raffle.findUnique({ where: { id: raffleId } });
    if (!raffle || raffle.status !== "active") {
      return res.status(404).json({ error: "Rifa nao encontrada" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const totalAmount = quantity * raffle.pricePerNumber;

      const order = await tx.order.create({
        data: {
          userId,
          raffleId,
          quantity,
          totalAmount,
          status: "pending",
        },
        select: { id: true },
      });

      const maxRounds = 30;
      const batchSize = Math.max(quantity * 3, 200);

      let allocated: number[] = [];

      for (
        let round = 0;
        round < maxRounds && allocated.length < quantity;
        round++
      ) {
        const candidates = new Set<number>();

        while (candidates.size < batchSize) {
          candidates.add(randomInt(raffle.minNumber, raffle.maxNumber + 1));
        }

        await tx.orderNumber.createMany({
          data: Array.from(candidates).map((number) => ({
            orderId: order.id,
            raffleId,
            number,
            status: "reserved",
          })),
          skipDuplicates: true,
        });

        const rows = await tx.orderNumber.findMany({
          where: { orderId: order.id },
          select: { number: true },
        });

        allocated = rows.map((row) => row.number);

        if (allocated.length > quantity) {
          allocated.sort((a, b) => a - b);
          const extras = allocated.slice(quantity);

          await tx.orderNumber.deleteMany({
            where: {
              orderId: order.id,
              number: { in: extras },
            },
          });

          allocated = allocated.slice(0, quantity);
        }
      }

      if (allocated.length < quantity) {
        throw new Error(
          "Rifa muito cheia: nao foi possivel reservar numeros suficientes."
        );
      }

      allocated.sort((a, b) => a - b);

      return {
        orderId: order.id,
        numbers: allocated,
        totalAmount,
      };
    });

    return res.status(201).json(result);
  } catch (err: any) {
    console.error("ORDER ERROR:", err);
    return res
      .status(409)
      .json({ error: err?.message ?? "Erro ao criar pedido" });
  }
});
