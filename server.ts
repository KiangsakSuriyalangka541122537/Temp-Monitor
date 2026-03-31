import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { startBackgroundWorker } from "./src/lib/backgroundWorker.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Start the background worker for LINE notifications
  startBackgroundWorker();

  // Health check route
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", environment: process.env.NODE_ENV || "development" });
  });

  // Cron-job endpoint to keep the server alive and trigger background monitoring
  app.get("/api/cron/monitor", (req, res) => {
    console.log("Cron job heartbeat received at:", new Date().toISOString());
    res.json({ 
      status: "ok", 
      message: "Server is awake and background worker is monitoring sensors.",
      timestamp: new Date().toISOString()
    });
  });

  // Proxy route for LINE Messaging API / LINE Notify to avoid CORS issues
  app.post("/api/line/push", async (req, res) => {
    console.log("Received POST request to /api/line/push");
    const { to, messages, accessToken, message } = req.body;

    if (!accessToken) {
      return res.status(400).json({ error: "Missing Access Token" });
    }

    try {
      if (to && to.trim()) {
        // Use LINE Messaging API (Push Message)
        console.log(`Attempting to send LINE push message to: ${to.substring(0, 10)}...`);
        const response = await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken.trim()}`,
          },
          body: JSON.stringify({ to: to.trim(), messages }),
        });

        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          data = { message: text || `HTTP Error ${response.status}` };
        }

        if (response.ok) {
          console.log("LINE Messaging message sent successfully");
          res.json(data);
        } else {
          console.error("LINE Messaging API Error Status:", response.status);
          console.error("LINE Messaging API Error Body:", text);
          res.status(response.status).json(data);
        }
      } else {
        // Use LINE Notify
        console.log("Attempting to send LINE Notify message...");
        const notifyMessage = message || (messages && messages[0]?.text) || "Test Message";
        const response = await fetch("https://notify-api.line.me/api/notify", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Bearer ${accessToken.trim()}`,
          },
          body: new URLSearchParams({ message: notifyMessage }),
        });

        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          data = { message: text || `HTTP Error ${response.status}` };
        }

        if (response.ok) {
          console.log("LINE Notify message sent successfully");
          res.json(data);
        } else {
          console.error("LINE Notify API Error Status:", response.status);
          console.error("LINE Notify API Error Body:", text);
          res.status(response.status).json(data);
        }
      }
    } catch (error) {
      console.error("Error proxying to LINE API:", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Internal Server Error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
