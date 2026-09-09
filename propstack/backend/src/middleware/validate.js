function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');
      return res.status(400).json({ error: `Validation failed: ${details}` });
    }
    req.body = result.data;
    next();
  };
}

module.exports = validate;