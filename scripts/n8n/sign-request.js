const crypto = require("node:crypto");

function sign(body, timestamp, secret) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

module.exports = { sign };
