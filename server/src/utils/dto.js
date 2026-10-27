/** Mongo doc (lean) -> API object: `_id` becomes `id`, `__v` and internal fields are dropped. */
export function dto(doc, { drop = [] } = {}) {
  if (!doc) return doc;
  const { _id, __v, ...rest } = doc;
  for (const k of drop) delete rest[k];
  return { id: String(_id), ...rest };
}

export const pageMeta = (total, page, limit) => ({ total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
