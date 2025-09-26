// src/index.ts
import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const PORT = Number(process.env.PORT || 8080);
const app = express();

// CORS for local dev; restrict in production
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Health endpoint
app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok" }));

// Admin endpoint to trigger updater AFTER responding (avoid broken client connections)
app.post("/admin/update", (req, res) => {
  const updaterUrl = process.env.UPDATER_URL || "http://updater:8080";
  const token = process.env.UPDATER_TOKEN || "";
  if (!token) {
    return res.status(500).json({ ok: false, error: "missing_updater_token" });
  }

  // Ensure the client gets a response immediately
  res.setHeader("Connection", "close");
  res.status(202).json({ ok: true, started: true });

  // Fire update ONLY after the response has been flushed to the client
  let fired = false;
  res.on("finish", () => {
    if (fired) return;
    fired = true;
    // Small delay to make sure the TCP FIN/ACK is done before restarting containers
    setTimeout(() => {
      // @ts-ignore Node 20 has global fetch at runtime; we don't need types here
      fetch(`${updaterUrl}/v1/update`, {
        method: "POST",
        headers: { "X-Update-Token": token }
      }).catch(() => { /* ignore updater errors here */ });
    }, 1500);
  });
});

// HTTP server + WebSocket (signaling placeholder)
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: true, credentials: true }
});

// Very basic room signaling (to be replaced/enhanced with SFU later)
io.on("connection", socket => {
  // Join room
  socket.on("join", (roomId: string, role: "playerA" | "playerB" | "spectator") => {
    socket.join(roomId);
    socket.data.role = role;
    socket.to(roomId).emit("peer-joined", { id: socket.id, role });
  });

  // Relay SDP/ICE messages
  socket.on("signal", (roomId: string, payload: unknown) => {
    socket.to(roomId).emit("signal", { from: socket.id, payload });
  });

  socket.on("disconnect", () => {
    // Broadcast leave to rooms
    for (const room of socket.rooms) {
      socket.to(room).emit("peer-left", { id: socket.id });
    }
  });
});

// Start
httpServer.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
});
