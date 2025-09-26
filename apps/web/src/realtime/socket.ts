import { io, Socket } from "socket.io-client";

const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL || "http://localhost:8080").trim();

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(SOCKET_URL, {
    transports: ["websocket"],
    withCredentials: true
  });

  // Basic debugging hooks
  socket.on("connect_error", (err) => console.error("[socket] connect_error", err));
  socket.on("error", (err) => console.error("[socket] error", err));
  return socket;
}

export type Role = "playerA" | "playerB" | "spectator";
