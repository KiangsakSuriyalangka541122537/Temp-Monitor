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

  // Support parsing JSON even if sent as text/plain or other content types by IoT devices
  app.use(express.json({ type: ["application/json", "text/plain", "application/octet-stream"] }));
  app.use(express.urlencoded({ extended: true, type: ["application/x-www-form-urlencoded", "text/plain"] }));

  // Fallback middleware to parse string/raw bodies that weren't parsed by default handlers
  app.use((req, res, next) => {
    if (typeof req.body === "string" && req.body.trim()) {
      try {
        req.body = JSON.parse(req.body);
      } catch (e) {
        try {
          const params = new URLSearchParams(req.body);
          const parsed: Record<string, string> = {};
          for (const [key, value] of params.entries()) {
            parsed[key] = value;
          }
          req.body = parsed;
        } catch (err) {
          // Log parsing attempt if it looks like queries/JSON
          if (req.body.includes("=") || req.body.includes("{")) {
            console.warn("Could not parse body string:", req.body);
          }
        }
      }
    }
    next();
  });

  // Global Request Logger
  app.use((req, res, next) => {
    console.log(`[INCOMING REQUEST] ${req.method} ${req.url}`);
    if (req.body && Object.keys(req.body).length > 0) {
      console.log("Body:", JSON.stringify(req.body));
    }
    if (req.query && Object.keys(req.query).length > 0) {
      console.log("Query:", JSON.stringify(req.query));
    }
    next();
  });

  // Unified endpoint to receive data from Arduino/Sensors
  const handleSensorData = async (req: express.Request, res: express.Response) => {
    console.log("Processing sensor data from request...");
    
    // Support all casing and naming variants for temperature 1 and humidity 1
    const t1_raw = req.body.t1 ?? req.query.t1 ?? 
                   req.body.T1 ?? req.query.T1 ?? 
                   req.body.t ?? req.query.t ?? 
                   req.body.T ?? req.query.T ?? 
                   req.body.temperature1 ?? req.query.temperature1 ?? 
                   req.body.temp1 ?? req.query.temp1 ?? 
                   req.body.Temp1 ?? req.query.Temp1 ?? 
                   req.body.temp ?? req.query.temp ?? 
                   req.body.temperature ?? req.query.temperature ??
                   req.body.T_1 ?? req.query.T_1;

    const h1_raw = req.body.h1 ?? req.query.h1 ?? 
                   req.body.H1 ?? req.query.H1 ?? 
                   req.body.h ?? req.query.h ?? 
                   req.body.H ?? req.query.H ?? 
                   req.body.humidity1 ?? req.query.humidity1 ?? 
                   req.body.humid1 ?? req.query.humid1 ?? 
                   req.body.Humid1 ?? req.query.Humid1 ?? 
                   req.body.humid ?? req.query.humid ?? 
                   req.body.humidity ?? req.query.humidity ??
                   req.body.H_1 ?? req.query.H_1;

    // Support all casing and naming variants for temperature 2 and humidity 2
    const t2_raw = req.body.t2 ?? req.query.t2 ?? 
                   req.body.T2 ?? req.query.T2 ?? 
                   req.body.temperature2 ?? req.query.temperature2 ?? 
                   req.body.temp2 ?? req.query.temp2 ?? 
                   req.body.Temp2 ?? req.query.Temp2 ??
                   req.body.T_2 ?? req.query.T_2;

    const h2_raw = req.body.h2 ?? req.query.h2 ?? 
                   req.body.H2 ?? req.query.H2 ?? 
                   req.body.humidity2 ?? req.query.humidity2 ?? 
                   req.body.humid2 ?? req.query.humid2 ?? 
                   req.body.Humid2 ?? req.query.Humid2 ??
                   req.body.H_2 ?? req.query.H_2;

    if (t1_raw === undefined && h1_raw === undefined && t2_raw === undefined) {
      console.warn("Sensor data parameters missing in request body and query.");
      return res.status(400).json({ 
        success: false, 
        error: "Missing sensor parameters. Please provide at least t1, h1, or t2." 
      });
    }

    // Fetch latest values as fallback if any parameters are missing from this specific transaction
    let last_t1 = 0;
    let last_h1 = 0;
    let last_t2 = 0;
    let last_h2 = 0;

    try {
      const { data: latestRow, error: fetchErr } = await supabase
        .from("Temp-sketch_mar24a")
        .select("t1, h1, t2, h2")
        .order("created_at", { ascending: false })
        .limit(1);
      
      if (!fetchErr && latestRow && latestRow.length > 0) {
        last_t1 = Number(latestRow[0].t1) || 0;
        last_h1 = Number(latestRow[0].h1) || 0;
        last_t2 = Number(latestRow[0].t2) || 0;
        last_h2 = Number(latestRow[0].h2) || 0;
      }
    } catch (e) {
      console.error("Error fetching latest row for fallback:", e);
    }

    // Apply values: use the new value if supplied, otherwise retain the last known database value
    const t1 = t1_raw !== undefined ? parseFloat(String(t1_raw)) : last_t1;
    const h1 = h1_raw !== undefined ? parseFloat(String(h1_raw)) : last_h1;
    const t2 = t2_raw !== undefined ? parseFloat(String(t2_raw)) : last_t2;
    const h2 = h2_raw !== undefined ? parseFloat(String(h2_raw)) : last_h2;

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

  // 1. Interceptor Middleware: Catch ANY request that contains sensor parameters in query or body
  // This guarantees that if the Arduino is posting to "/" or any custom path, it is intercepted and saved.
  app.use(async (req, res, next) => {
    // Check if it has sensor fields
    const hasT1 = req.body.t1 !== undefined || req.query.t1 !== undefined || req.body.T1 !== undefined || req.query.T1 !== undefined || req.body.t !== undefined || req.query.t !== undefined || req.body.T !== undefined || req.query.T !== undefined;
    const hasTemp = req.body.temp !== undefined || req.query.temp !== undefined || req.body.temp1 !== undefined || req.query.temp1 !== undefined || req.body.temperature !== undefined || req.query.temperature !== undefined;
    const hasTemp2 = req.body.t2 !== undefined || req.query.t2 !== undefined || req.body.T2 !== undefined || req.query.T2 !== undefined;
    
    if (hasT1 || hasTemp || hasTemp2) {
      console.log(`[SENSOR INTERCEPTOR] Intercepted request on ${req.method} ${req.url}`);
      return handleSensorData(req, res);
    }
    next();
  });

  // 2. Explicitly register handleSensorData on all common sensor endpoints as a fallback
  const sensorPaths = [
    "/api/data",
    "/api/sensor",
    "/api/sensor-data",
    "/api/sensor_data",
    "/api/insert",
    "/api/logs",
    "/api/temp",
    "/api/write",
    "/api/update",
    "/data",
    "/sensor",
    "/sensor-data",
    "/sensor_data",
    "/insert",
    "/logs",
    "/temp",
    "/write",
    "/update"
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
