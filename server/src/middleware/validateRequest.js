import { ApiError } from '../utils/ApiError.js';

/**
 * validate({ body, query, params }) with zod schemas. Parsed (coerced, trimmed, normalised) values replace the raw
 * ones, so controllers only ever see validated input. Unknown keys are stripped (schemas are non-passthrough).
 */
export const validate = (schemas) => (req, _res, next) => {
  const issues = [];
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const r = schemas[part].safeParse(req[part] ?? {});
    if (r.success) {
      req[part] = r.data;
    } else {
      issues.push(...r.error.issues.map((i) => ({ in: part, path: i.path.join('.'), message: i.message })));
    }
  }
  if (issues.length) return next(ApiError.badRequest('Validation failed', issues));
  return next();
};
