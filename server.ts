import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { startBackgroundWorker } from "./src/lib/backgroundWorker";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Supabase for server usage
const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://tzjmorrkocoxihtsyrfy.supabase.co";
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6am1vcnJrb2NveGlodHN5cmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDk3MDUsImV4cCI6MjA4NzcyNTcwNX0.SirelOHD7cp51HyM7I5eKTchUfMrDss0asZfAJVo5k8";
const supabase = createClient(supabaseUrl, supabaseKey);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Global Request Logger
  app.use((req, res, next) => {
    console.log(`[INCOMING REQUEST] ${req.method} ${req.url}`);
    if (Object.keys(req.body).length > 0) {
      console.log("Body:", JSON.stringify(req.body));
    }
    if (Object.keys(req.query).length > 0) {
      console.log("Query:", JSON.stringify(req.query));
    }
    next();
  });

  // Unified endpoint to receive data from Arduino/Sensors
  const handleSensorData = async (req: express.Request, res: express.Response) => {
    console.log("Processing sensor data from request...");
    
    // Support t1, temp1, temp, temperature1, etc.
    const t1_raw = req.body.t1 ?? req.query.t1 ?? req.body.temperature1 ?? req.query.temperature1 ?? req.body.temp1 ?? req.query.temp1 ?? req.body.temp ?? req.query.temp;
    const h1_raw = req.body.h1 ?? req.query.h1 ?? req.body.humidity1 ?? req.query.humidity1 ?? req.body.humid1 ?? req.query.humid1 ?? req.body.humid ?? req.query.humid;
    const t2_raw = req.body.t2 ?? req.query.t2 ?? req.body.temperature2 ?? req.query.temperature2 ?? req.body.temp2 ?? req.query.temp2;
    const h2_raw = req.body.h2 ?? req.query.h2 ?? req.body.humidity2 ?? req.query.humidity2 ?? req.body.humid2 ?? req.query.humid2;

    if (t1_raw === undefined && h1_raw === undefined && t2_raw === undefined) {
      console.warn("Sensor data endpoint called without valid fields");
      return res.status(400).json({ 
        success: false, 
        error: "Missing sensor parameters. Please provide at least t1, h1, or t2." 
      });
    }

    const t1 = t1_raw !== undefined ? parseFloat(String(t1_raw)) : 0;
    const h1 = h1_raw !== undefined ? parseFloat(String(h1_raw)) : 0;
    const t2 = t2_raw !== undefined ? parseFloat(String(t2_raw)) : 0;
    const h2 = h2_raw !== undefined ? parseFloat(String(h2_raw)) : 0;

    try {
      console.log(`Inserting sensor log to Supabase: t1=${t1}, h1=${h1}, t2=${t2}, h2=${h2}`);
      const { data, error } = await supabase
        .from("Temp-sketch_mar24a")
        .insert([{ t1, h1, t2, h2 }])
        .select();

      if (error) {
        console.error("Supabase error inserting sensor log:", error);
        return res.status(500).json({ success: false, error: error.message });
      }

      console.log("Sensor log inserted successfully:", data);
      return res.status(201).json({ 
        success: true, 
        message: "Data recorded successfully", 
        data: data[0] 
      });
    } catch (err) {
      console.error("Server error inserting sensor log:", err);
      return res.status(500).json({ 
        success: false, 
        error: err instanceof Error ? err.message : "Internal Server Error" 
      });
    }
  };

  // Register the handleSensorData handler on all common sensor endpoints
  const sensorPaths = [
    "/api/data",
    "/api/sensor",
    "/api/sensor-data",
    "/api/insert",
    "/api/logs",
    "/api/temp"
  ];

  sensorPaths.forEach(path => {
    app.post(path, handleSensorData);
    app.get(path, handleSensorData);
  });

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
    
    // Start the background monitoring worker
    try {
      startBackgroundWorker();
      console.log("Background worker initialized successfully in server.ts");
    } catch (e) {
      console.error("Failed to start background worker:", e);
    }
  });
}

startServer();
