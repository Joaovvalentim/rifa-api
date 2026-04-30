import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { PUBLIC_API_URL } from "../lib/env";
import { auth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/requireAdmin";

export const adminUploadsRoutes = Router();

const uploadRoot = path.resolve(process.cwd(), "uploads", "raffles");
const maxImageSizeBytes = 5 * 1024 * 1024;
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const extensionByMimeType: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

fs.mkdirSync(uploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const extension = extensionByMimeType[file.mimetype] || "";
    cb(null, `${Date.now()}-${randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: maxImageSizeBytes,
    files: 12,
  },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(new Error("Formato invalido. Use JPG, PNG ou WEBP."));
    }

    return cb(null, true);
  },
});

adminUploadsRoutes.use(auth, requireAdmin);

adminUploadsRoutes.post("/raffle-image", (req, res) => {
  upload.array("image", 12)(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        error:
          err instanceof Error
            ? err.message
            : "Falha ao processar upload da imagem.",
      });
    }

    const files = Array.isArray(req.files) ? req.files : [];

    if (files.length === 0) {
      return res.status(400).json({ error: "Nenhuma imagem enviada." });
    }

    const images = files.map((file) => {
      const publicPath = `/uploads/raffles/${file.filename}`;

      return {
        url: `${PUBLIC_API_URL}${publicPath}`,
        path: publicPath,
        filename: file.filename,
        size: file.size,
        mimeType: file.mimetype,
      };
    });

    return res.status(201).json({
      url: images[0].url,
      images,
    });
  });
});
