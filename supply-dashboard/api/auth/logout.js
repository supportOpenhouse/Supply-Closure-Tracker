const { clearSessionCookie } = require("../_auth");

module.exports = async function handler(req, res) {
  clearSessionCookie(res);
  return res.status(200).json({ success: true });
};
