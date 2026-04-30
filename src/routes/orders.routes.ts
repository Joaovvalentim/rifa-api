import { randomInt } from "crypto";
import { Request, Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { auth } from "../middlewares/auth";
import { createRateLimit } from "../middlewares/rateLimit";
import {
  buildPixExpiration,
  createMockPixOrder,
  createIdempotencyKey,
  getMercadoPagoPayer,
  getMercadoPagoOrderClient,
  isMockPaymentProvider,
} from "../lib/mercadoPago";
import { PAYMENT_DEBUG_LOGS } from "../lib/env";
import {
  amountToMercadoPagoString,
  buildPaymentExternalRef,
  extractPixPayment,
} from "../lib/orderPayments";

export const ordersRoutes = Router();

function sanitizeMercadoPagoLogPayload(payload: unknown) {
  return JSON.stringify(
    payload,
    (key, value) => {
      if (["email", "qr_code", "qr_code_base64", "ticket_url"].includes(key)) {
        return value ? "[redacted]" : value;
      }

      return value;
    },
    2
  );
}

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
    const [raffle, user] = await Promise.all([
      prisma.raffle.findUnique({ where: { id: raffleId } }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      }),
    ]);

    if (!raffle || raffle.status !== "active") {
      return res.status(404).json({ error: "Rifa nao encontrada" });
    }

    if (!user?.email) {
      return res.status(400).json({ error: "Usuario sem email valido" });
    }

    const totalNumbersInRange = raffle.maxNumber - raffle.minNumber + 1;
    if (totalNumbersInRange <= 0) {
      return res.status(409).json({ error: "Intervalo de numeros da rifa invalido." });
    }

    const unavailableNumbers = await prisma.orderNumber.count({
      where: { raffleId },
    });
    const availableNumbers = totalNumbersInRange - unavailableNumbers;

    if (availableNumbers < quantity) {
      return res.status(409).json({
        error: `Restam apenas ${Math.max(availableNumbers, 0)} numero(s) disponiveis nesta rifa.`,
      });
    }

    const { expiresAt, isoDuration } = buildPixExpiration();
    const totalAmount = quantity * raffle.pricePerNumber;
    const draftExternalRef = `draft:${createIdempotencyKey()}`;

    const draft = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          userId,
          raffleId,
          quantity,
          totalAmount,
          status: "pending",
          paymentStatus: "pending",
          paymentStatusDetail: "waiting_transfer",
          paymentExternalRef: draftExternalRef,
          expiresAt,
        },
        select: { id: true },
      });

      const paymentExternalRef = buildPaymentExternalRef(order.id);

      await tx.order.update({
        where: { id: order.id },
        data: { paymentExternalRef },
      });

      const maxRounds = 30;
      const batchSize = Math.min(
        totalNumbersInRange,
        Math.max(quantity * 3, 200)
      );
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
        paymentExternalRef,
        numbers: allocated,
      };
    });

    let mpOrder;
    const mercadoPagoPayload = {
      type: "online",
      external_reference: draft.paymentExternalRef,
      processing_mode: "automatic",
      total_amount: amountToMercadoPagoString(totalAmount),
      payer: getMercadoPagoPayer(user),
      transactions: {
        payments: [
          {
            amount: amountToMercadoPagoString(totalAmount),
            payment_method: {
              id: "pix",
              type: "bank_transfer",
              statement_descriptor: "SOALEMAES",
            },
            expiration_time: isoDuration,
          },
        ],
      },
    };

    try {
      if (isMockPaymentProvider()) {
        mpOrder = createMockPixOrder({
          externalReference: draft.paymentExternalRef,
          totalAmount: amountToMercadoPagoString(totalAmount),
          expiresAt,
        });
      } else {
        const orderClient = getMercadoPagoOrderClient();
        if (PAYMENT_DEBUG_LOGS) {
          console.log(
            "MERCADO PAGO ORDER PAYLOAD:",
            sanitizeMercadoPagoLogPayload(mercadoPagoPayload)
          );
        }
        mpOrder = await orderClient.create({
          body: mercadoPagoPayload,
          requestOptions: {
            idempotencyKey: createIdempotencyKey(),
          },
        });
      }

      if (PAYMENT_DEBUG_LOGS) {
        console.log(
          "PAYMENT ORDER RESPONSE:",
          sanitizeMercadoPagoLogPayload(mpOrder)
        );
      }
    } catch (paymentError: any) {
      console.error(
        "MERCADO PAGO ORDER ERROR DETAILS:",
        JSON.stringify(paymentError?.errors ?? paymentError?.cause ?? null, null, 2)
      );
      await prisma.$transaction(async (tx) => {
        await tx.orderNumber.deleteMany({
          where: { orderId: draft.orderId },
        });

        await tx.order.update({
          where: { id: draft.orderId },
          data: {
            status: "failed",
            paymentStatus: "failed",
            paymentStatusDetail: "payment_provider_error",
          },
        });
      });

      throw paymentError;
    }

    const pix = extractPixPayment(mpOrder);

    const result = await prisma.order.update({
      where: { id: draft.orderId },
      data: {
        paymentProviderOrderId: pix.providerOrderId,
        paymentProviderTxnId: pix.providerTransactionId,
        paymentStatus: pix.status,
        paymentStatusDetail: pix.statusDetail,
        paymentTicketUrl: pix.ticketUrl,
        paymentQrCode: pix.qrCode,
        paymentQrCodeBase64: pix.qrCodeBase64,
        expiresAt: pix.expiresAt ?? expiresAt,
      },
      select: {
        id: true,
        quantity: true,
        totalAmount: true,
        expiresAt: true,
        paymentStatus: true,
        paymentStatusDetail: true,
        paymentTicketUrl: true,
        paymentQrCode: true,
        paymentQrCodeBase64: true,
        numbers: {
          select: { number: true },
          orderBy: { number: "asc" },
        },
      },
    });

    return res.status(201).json({
      orderId: result.id,
      quantity: result.quantity,
      totalAmount: result.totalAmount,
      paymentStatus: result.paymentStatus,
      paymentStatusDetail: result.paymentStatusDetail,
      expiresAt: result.expiresAt,
      paymentTicketUrl: result.paymentTicketUrl,
      paymentQrCode: result.paymentQrCode,
      paymentQrCodeBase64: result.paymentQrCodeBase64,
      numbers: result.numbers.map((item) => item.number),
    });
  } catch (err: any) {
    console.error("ORDER ERROR:", err);
    return res
      .status(409)
      .json({ error: err?.message ?? "Erro ao criar pedido" });
  }
});
