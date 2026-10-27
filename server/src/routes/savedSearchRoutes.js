import { Router } from 'express';
import * as c from '../controllers/savedSearchController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validateRequest.js';
import { createSavedSearchSchema, idParams, listSavedSearchSchema, patchSavedSearchSchema } from '../validators/savedSearchValidator.js';

export default function savedSearchRoutes() {
  const r = Router();
  r.use(requireAuth);
  r.get('/', validate(listSavedSearchSchema), c.list);
  r.post('/', validate(createSavedSearchSchema), c.create);
  r.patch('/:id', validate(patchSavedSearchSchema), c.patch);
  r.delete('/:id', validate(idParams), c.remove);
  return r;
}
