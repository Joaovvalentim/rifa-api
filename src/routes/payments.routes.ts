import { Router } from "express";
import { verifyMercadoPagoWebhookSignature } from "../lib/orderPayments";
import { syncMercadoPagoOrder } from "../lib/syncMercadoPagoOrder";

export const paymentsRoutes = Router();

paymentsRoutes.post("/mercado-pago/webhook", async (req, res) => {
  try {
    const dataId =
      typeof req.query["data.id"] === "string"
        ? req.query["data.id"]
        : typeof req.body?.data?.id === "string"
          ? req.body.data.id
          : typeof req.body?.resource === "string"
            ? req.body.resource.split("/").pop()
            : undefined;

    const topic =
      typeof req.query.type === "string"
        ? req.query.type
        : typeof req.query.topic === "string"
          ? req.query.topic
          : typeof req.body?.type === "string"
            ? req.body.type
            : typeof req.body?.topic === "string"
              ? req.body.topic
              : "";

    if (!dataId) {
      return res.status(200).json({ ok: true, ignored: "missing_data_id" });
    }

    const validSignature = verifyMercadoPagoWebhookSignature({
      signatureHeader: req.headers["x-signature"],
      requestIdHeader: req.headers["x-request-id"],
      dataId,
    });

    if (!validSignature) {
      return res.status(401).json({ error: "Webhook sem assinatura valida" });
    }

    if (topic && topic !== "order") {
      return res.status(200).json({ ok: true, ignored: topic });
    }

    await syncMercadoPagoOrder(dataId);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("MERCADO PAGO WEBHOOK ERROR:", err);
    return res.status(500).json({ error: "Falha ao processar webhook" });
  }
});
