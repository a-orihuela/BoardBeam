import { useEffect, useMemo, useState } from "react";
import { getSocket, type Role } from "../realtime/socket";

type RoomState = { hasPlayerA: boolean; hasPlayerB: boolean; spectators: number };

export default function Lobby() {
  const socket = useMemo(() => getSocket(), []);
  const [connected, setConnected] = useState(false);
  const [roomId, setRoomId] = useState("demo");
  const [role, setRole] = useState<Role>("spectator");
  const [name, setName] = useState("guest");
  const [state, setState] = useState<RoomState>({ hasPlayerA: false, hasPlayerB: false, spectators: 0 });
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    const s = socket;
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onState = (st: RoomState) => setState(st);
    const onDenied = (e: any) => setMsg(`Join denied: ${e?.reason || "unknown"}`);
    const onJoined = () => setMsg("Joined room");
    const onPeerJoin = (p: any) => setMsg(`Peer joined: ${p?.role || p?.id}`);
    const onPeerLeft = (p: any) => setMsg(`Peer left: ${p?.role || p?.id}`);

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("room-state", onState);
    s.on("join-denied", onDenied);
    s.on("joined", onJoined);
    s.on("peer-joined", onPeerJoin);
    s.on("peer-left", onPeerLeft);

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("room-state", onState);
      s.off("join-denied", onDenied);
      s.off("joined", onJoined);
      s.off("peer-joined", onPeerJoin);
      s.off("peer-left", onPeerLeft);
    };
  }, [socket]);

  const join = () => {
    setMsg("");
    socket.emit("join", { roomId, role, name }, (ack: any) => {
      if (!ack?.ok) {
        setMsg(`Join failed: ${ack?.error || "unknown"}`);
        return;
      }
      setMsg("Joined (ack)");
      if (ack.state) setState(ack.state as RoomState);
    });
  };

  const leave = () => {
    setMsg("");
    socket.emit("leave");
  };

  return (
    <section style={{ marginTop: "2rem" }}>
      <h2>Realtime test — Lobby</h2>
      <div style={{ display: "grid", gap: 8, maxWidth: 520 }}>
        <div>
          <label>Room ID&nbsp;</label>
          <input value={roomId} onChange={e => setRoomId(e.target.value)} />
        </div>
        <div>
          <label>Name&nbsp;</label>
          <input value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label>Role&nbsp;</label>
          <select value={role} onChange={e => setRole(e.target.value as Role)}>
            <option value="playerA">playerA</option>
            <option value="playerB">playerB</option>
            <option value="spectator">spectator</option>
          </select>
        </div>
        <div>
          <button onClick={join} disabled={!connected} style={{ marginRight: 8 }}>Join</button>
          <button onClick={leave} disabled={!connected}>Leave</button>
        </div>

        <div style={{ background: "#f6f8ff", padding: 12, borderRadius: 8 }}>
          <div><strong>Socket:</strong> {connected ? "connected" : "disconnected"}</div>
          <div><strong>Room:</strong> {roomId}</div>
          <div><strong>State:</strong> A={String(state.hasPlayerA)} · B={String(state.hasPlayerB)} · spectators={state.spectators}</div>
          {msg && <div style={{ marginTop: 8 }}>{msg}</div>}
        </div>
      </div>
    </section>
  );
}
