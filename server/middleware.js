module.exports = (req, res, next) => {
  if (
    req.method === "POST" ||
    req.method === "PATCH" ||
    req.method === "DELETE"
  ) {
    const idempotencyKey = req.headers["idempotency-key"];

    if (idempotencyKey) {
      // Check if we've seen this key before
      const db = req.app.db; // Access lowdb instance
      const existing = db
        .get("processedKeys")
        .find({ key: idempotencyKey })
        .value();

      if (existing) {
        return res.status(200).json(existing.response);
      }
    }
  }
  next();
};
