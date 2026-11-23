import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

export const UPLOAD_ROOT = path.resolve(env.uploadDir);
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

const ALLOWED = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const storage = multer.diskStorage({
  destination: UPLOAD_ROOT,
  // Random server-side name: never trust the client filename for paths.
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${ALLOWED[file.mimetype]}`),
});

export const uploadSingle = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED[file.mimetype]) {
      return cb(ApiError.badRequest('Only PDF, JPG, PNG or WEBP files are allowed'));
    }
    cb(null, true);
  },
}).single('file');

/** Checks the file's magic bytes so a renamed .exe can't pose as a PDF. */
export function hasValidSignature(filePath, mimeType) {
  const buf = Buffer.alloc(12);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buf, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }
  switch (mimeType) {
    case 'application/pdf':
      return buf.subarray(0, 4).toString() === '%PDF';
    case 'image/png':
      return buf[0] === 0x89 && buf.subarray(1, 4).toString() === 'PNG';
    case 'image/jpeg':
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'image/webp':
      return buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP';
    default:
      return false;
  }
}
