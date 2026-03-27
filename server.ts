import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Proxy route for LINE Messaging API to avoid CORS issues
  app.post("/api/line/push", async (req, res) => {
    const { to, messages, accessToken } = req.body;

    if (!to || !messages || !accessToken) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      const response = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken.trim()}`,
        },
        body: JSON.stringify({ to: to.trim(), messages }),
      });

      let data;
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = { message: text || `HTTP Error ${response.status}` };
      }

      if (response.ok) {
        res.json(data);
      } else {
        console.error("LINE API Error:", JSON.stringify(data));
        res.status(response.status).json(data);
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
