import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { env } from '../config/env.js';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const FILE_NAME = /^[0-9a-f-]{36}\.webp$/;

export type Visibility = 'public' | 'private';

const dirFor = (visibility: Visibility) => path.resolve(env.UPLOAD_DIR, visibility);

export const ensureUploadDirs = () => {
  fs.mkdirSync(dirFor('public'), { recursive: true });
  fs.mkdirSync(dirFor('private'), { recursive: true });
};

/** Folder served at /uploads (profile and job photos only) */
export const publicUploadDir = () => dirFor('public');

export const publicUrl = (fileName: string) => `/uploads/${fileName}`;

export class ImageError extends Error {}

/**
 * Accepts multipart image fields into memory (never written as-is), with friendly 400/413 errors.
 */
export const acceptImages = (fields: string[]) => {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: fields.length, fields: 5 },
  }).fields(fields.map((name) => ({ name, maxCount: 1 })));

  return (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'That photo is too large (maximum 10 MB).' });
        }
        return res.status(400).json({ error: 'Unexpected upload. Please choose the photo again.' });
      }
      return next(err);
    });
  };
};

export const uploadedFile = (req: Request, field: string): Express.Multer.File | undefined =>
  (req.files as Record<string, Express.Multer.File[]> | undefined)?.[field]?.[0];

/**
 * Decodes, auto-rotates, resizes and re-encodes an image as WebP. Output carries no metadata
 * (phone photos often embed GPS coordinates). Anything that doesn't decode as an image is rejected,
 * whatever its name or declared type.
 */
export const processImage = async (
  buffer: Buffer,
  { maxSize, square = false, quality = 82 }: { maxSize: number; square?: boolean; quality?: number }
) => {
  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer, { limitInputPixels: 50_000_000 }).metadata();
  } catch {
    throw new ImageError('Please upload a photo (JPEG, PNG or WebP).');
  }
  if (!meta.format || !['jpeg', 'png', 'webp', 'heif', 'avif', 'gif', 'tiff'].includes(meta.format)) {
    throw new ImageError('Please upload a photo (JPEG, PNG or WebP).');
  }

  try {
    const pipeline = sharp(buffer, { limitInputPixels: 50_000_000, animated: false }).rotate();
    const resized = square
      ? pipeline.resize(maxSize, maxSize, { fit: 'cover', position: 'attention' })
      : pipeline.resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true });
    const { data, info } = await resized.webp({ quality }).toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    throw new ImageError('That photo could not be read. Please try a different one.');
  }
};

/** Writes processed image bytes under a random name and returns the name */
export const saveImage = async (visibility: Visibility, data: Buffer): Promise<string> => {
  const fileName = `${crypto.randomUUID()}.webp`;
  await fs.promises.writeFile(path.join(dirFor(visibility), fileName), data, { flag: 'wx' });
  return fileName;
};

export const deleteImage = async (visibility: Visibility, fileName: string | null | undefined) => {
  if (!fileName || !FILE_NAME.test(fileName)) return;
  await fs.promises.unlink(path.join(dirFor(visibility), fileName)).catch(() => {});
};

/** Absolute path of a stored private file (validated name), for streaming to admins */
export const privateFilePath = (fileName: string): string | null =>
  FILE_NAME.test(fileName) ? path.join(dirFor('private'), fileName) : null;

/** Name of the stored file behind a /uploads/<name> URL we issued */
export const fileNameFromPublicUrl = (url: string | null | undefined): string | null => {
  const match = url?.match(/^\/uploads\/([0-9a-f-]{36}\.webp)$/);
  return match ? match[1] : null;
};
