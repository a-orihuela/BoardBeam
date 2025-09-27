// src/index.ts
import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";

type Role = "playerA" | "playerB" | "spectator";

interface JoinPayload {
  roomId: string;
  role: Role;
  name?: string;
}

interface RoomState {
  playerA?: string;      // socket.id
  playerB?: string;      // socket.id
  spectators: Set<string>;
}

const rooms = new Map<string, RoomState>();

function getPublicState(s: RoomState) {
  return {
    hasPlayerA: !!s.playerA,
    hasPlayerB: !!s.playerB,
    spectators: s.spectators.size
  };
}

function listPeers(roomId: string, exceptId?: string) {
  const sids = io.sockets.adapter.rooms.get(roomId);
  if (!sids) return [] as Array<{ id: string; role: Role }>;
  const peers: Array<{ id: string; role: Role }> = [];
  for (const sid of sids) {
    if (sid === exceptId) continue;
    const s = io.sockets.sockets.get(sid);
    if (!s) continue;
    peers.push({ id: sid, role: s.data?.role as Role });
  }
  return peers;
}

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
  cors: {
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket", "polling"]
});

io.on("connection", socket => {
  console.log(`[io] connected ${socket.id}`);

  // WebRTC signaling relay
  socket.on("rtc-offer", ({ to, sdp }: { to: string; sdp: any }) => {
    const roomId = socket.data?.roomId;
    if (!roomId) return;
    io.to(to).emit("rtc-offer", { from: socket.id, sdp, role: socket.data?.role });
  });

  socket.on("rtc-answer", ({ to, sdp }: { to: string; sdp: any }) => {
    const roomId = socket.data?.roomId;
    if (!roomId) return;
    io.to(to).emit("rtc-answer", { from: socket.id, sdp });
  });

  socket.on("rtc-ice", ({ to, candidate }: { to: string; candidate: any }) => {
    const roomId = socket.data?.roomId;
    if (!roomId) return;
    io.to(to).emit("rtc-ice", { from: socket.id, candidate });
  });

  socket.on("join", (payload: JoinPayload, ack?: (r: any) => void) => {
    try {
      console.log(`[io] join from ${socket.id}`, payload);
      const { roomId, role, name } = payload || {};
      if (!roomId || !role) {
        ack?.({ ok: false, error: "invalid_payload" });
        socket.emit("join-denied", { reason: "invalid_payload" });
        return;
      }

      const state: RoomState = rooms.get(roomId) ?? { spectators: new Set<string>() };

      if (role === "playerA") {
        if (state.playerA && state.playerA !== socket.id) {
          ack?.({ ok: false, error: "playerA_taken" });
          socket.emit("join-denied", { reason: "playerA_taken" });
          return;
        }
        state.playerA = socket.id;
      } else if (role === "playerB") {
        if (state.playerB && state.playerB !== socket.id) {
          ack?.({ ok: false, error: "playerB_taken" });
          socket.emit("join-denied", { reason: "playerB_taken" });
          return;
        }
        state.playerB = socket.id;
      } else {
        state.spectators.add(socket.id);
      }

      rooms.set(roomId, state);
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.role = role;
      socket.data.name = name;

      const pub = getPublicState(state);
      ack?.({ ok: true, state: pub });
      socket.emit("joined", { id: socket.id, role, roomId });
      socket.emit("peers", listPeers(roomId, socket.id));
      io.to(roomId).emit("room-state", pub);
      socket.to(roomId).emit("peer-joined", { id: socket.id, role, name });
    } catch (e) {
      console.error("[io] join error", e);
      ack?.({ ok: false, error: "internal_error" });
    }
  });

  socket.on("leave", () => cleanupSocketFromRoom(socket));
  socket.on("disconnect", () => {
    console.log(`[io] disconnected ${socket.id}`);
    cleanupSocketFromRoom(socket);
  });

  function cleanupSocketFromRoom(s: any) {
    const roomId: string | undefined = s.data?.roomId;
    const role: Role | undefined = s.data?.role;
    if (!roomId || !role) return;

    const state = rooms.get(roomId);
    if (!state) return;

    if (role === "playerA" && state.playerA === s.id) state.playerA = undefined;
    else if (role === "playerB" && state.playerB === s.id) state.playerB = undefined;
    else state.spectators.delete(s.id);

    rooms.set(roomId, state);
    s.leave(roomId);
    io.to(roomId).emit("room-state", getPublicState(state));
    s.to(roomId).emit("peer-left", { id: s.id, role });

    if (!state.playerA && !state.playerB && state.spectators.size === 0) {
      rooms.delete(roomId);
      console.log(`[io] room ${roomId} purged`);
    }
  }
});

// Start
httpServer.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
});
