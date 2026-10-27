import multer from 'multer';
import path from 'node:path';
import { ApiError } from '../utils/ApiError.js';

export const MAX_UPLOAD_BYTES = 512 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 },
  fileFilter(_req, file, cb) {
    const okExt = path.extname(file.originalname || '').toLowerCase() === '.csv';
    const okType = ['text/csv', 'application/vnd.ms-excel', 'application/csv', 'text/plain', 'application/octet-stream'].includes(file.mimetype);
    if (okExt && okType) return cb(null, true);
    return cb(ApiError.badRequest('Only .csv files are accepted'));
  },
});

/** Single CSV in form field "file" (max 512 KB, kept in memory, never written to disk). */
export const uploadCsv = upload.single('file');
