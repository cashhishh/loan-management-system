/**
 * Validates req.body / req.query / req.params against Zod schemas and replaces
 * them with the parsed (coerced, stripped) values. ZodErrors are turned into
 * 400 responses by the central error handler.
 */
export const validate = (schemas) => (req, _res, next) => {
  try {
    if (schemas.params) req.params = schemas.params.parse(req.params);
    if (schemas.query) req.validatedQuery = schemas.query.parse(req.query);
    if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
    next();
  } catch (err) {
    next(err);
  }
};
