// ============================================================
//  LemonPing Backend — server.js
//  Stack: Node.js + Express
//  Install: npm install express axios crypto
//  Run: node server.js
// ============================================================

const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
app.use(express.json());

// -----------------------------------------------
//  CONFIG — Replace these with real values
//  (Store in .env file, never share publicly!)
// -----------------------------------------------
const CONFIG = {
  PORT: process.env.PORT || 3000,

  // Your Lemon Squeezy webhook secret (from LS dashboard)
  LEMON_WEBHOOK_SECRET: process.env.LEMON_WEBHOOK_SECRET || "your_lemon_secret_here",

  // Paste your Slack Incoming Webhook URL here
  SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL || "",

  // Paste your Discord Webhook URL here
  DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL || "",
};

// -----------------------------------------------
//  SECURITY: Verify the webhook is from Lemon Squeezy
// -----------------------------------------------
function verifyLemonSqueezySignature(req) {
  const signature = req.headers["x-signature"];
  if (!signature) return false;

  const hash = crypto
    .createHmac("sha256", CONFIG.LEMON_WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest("hex");

  return hash === signature;
}

// -----------------------------------------------
//  FORMAT: Turn payment data into a nice message
// -----------------------------------------------
function formatMessage(data) {
  const attrs = data?.data?.attributes || {};
  const customerName = attrs.user_name || "Someone";
  const email = attrs.user_email || "";
  const total = (attrs.total / 100).toFixed(2); // Lemon Squeezy stores in cents
  const currency = attrs.currency?.toUpperCase() || "USD";
  const productName = attrs.first_order_item?.product_name || "your product";
  const country = attrs.customer_address?.country || "Unknown";

  return {
    text: `💰 New Sale! ${customerName} just bought **${productName}** — ${currency} $${total} (${country})`,
    plain: `💰 New Sale! ${customerName} just bought ${productName} — ${currency} $${total} from ${country}`,
    details: { customerName, email, total, currency, productName, country },
  };
}

// -----------------------------------------------
//  SEND TO SLACK
// -----------------------------------------------
async function sendToSlack(message, details) {
  if (!CONFIG.SLACK_WEBHOOK_URL) return;

  const payload = {
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `🍋 *New Sale on LemonSqueezy!*`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Product*\n${details.productName}` },
          { type: "mrkdwn", text: `*Amount*\n${details.currency} $${details.total}` },
          { type: "mrkdwn", text: `*Customer*\n${details.customerName}` },
          { type: "mrkdwn", text: `*Country*\n${details.country}` },
        ],
      },
    ],
  };

  await axios.post(CONFIG.SLACK_WEBHOOK_URL, payload);
  console.log("✅ Sent to Slack");
}

// -----------------------------------------------
//  SEND TO DISCORD
// -----------------------------------------------
async function sendToDiscord(message, details) {
  if (!CONFIG.DISCORD_WEBHOOK_URL) return;

  const payload = {
    embeds: [
      {
        title: "🍋 New Sale!",
        color: 0xf5e642, // yellow
        fields: [
          { name: "Product", value: details.productName, inline: true },
          { name: "Amount", value: `${details.currency} $${details.total}`, inline: true },
          { name: "Customer", value: details.customerName, inline: true },
          { name: "Country", value: details.country, inline: true },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: "LemonPing" },
      },
    ],
  };

  await axios.post(CONFIG.DISCORD_WEBHOOK_URL, payload);
  console.log("✅ Sent to Discord");
}

// -----------------------------------------------
//  MAIN WEBHOOK ENDPOINT
//  Lemon Squeezy will call this URL on every sale
// -----------------------------------------------
app.post("/webhook/lemonsqueezy", async (req, res) => {
  // 1. Verify it's really from Lemon Squeezy
  if (!verifyLemonSqueezySignature(req)) {
    console.log("❌ Invalid signature — request rejected");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const eventName = req.headers["x-event-name"];
  console.log(`📨 Received event: ${eventName}`);

  // 2. Only handle "order_created" events (new sales)
  if (eventName !== "order_created") {
    return res.status(200).json({ message: "Event ignored" });
  }

  try {
    // 3. Format the message
    const { text, details } = formatMessage(req.body);
    console.log("💰 New sale:", details);

    // 4. Send to Slack and Discord simultaneously
    await Promise.all([
      sendToSlack(text, details),
      sendToDiscord(text, details),
    ]);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("❌ Error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// -----------------------------------------------
//  HEALTH CHECK — to confirm server is running
// -----------------------------------------------
app.get("/", (req, res) => {
  res.json({ status: "LemonPing is running 🍋", version: "1.0.0" });
});

// -----------------------------------------------
//  START SERVER
// -----------------------------------------------
app.listen(CONFIG.PORT, () => {
  console.log(`🚀 LemonPing running on port ${CONFIG.PORT}`);
  console.log(`📡 Webhook URL: http://your-domain.com/webhook/lemonsqueezy`);
});
