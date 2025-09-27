// apps/web/src/components/Lobby.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { getSocket, type Role } from "../realtime/socket";
import {
  setupWebRTC,
  setOnMediaChanged,
  getLocalStream,
  getRemoteMedia,
  handlePeersList,
  handlePeerJoined,
  getLastMediaError
} from "../webrtc/rtc";

type RoomState = { hasPlayerA: boolean; hasPlayerB: boolean; spectators: number };

function VideoBox({ id, role, stream }: { id: string; role: Role; stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
      ref.current.play().catch(() => {});
    }
  }, [stream]);
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 4 }}>
      <div style={{ fontSize: 12, marginBottom: 4 }}>
        {role} · {id.slice(0, 6)}
      </div>
      <video ref={ref} playsInline autoPlay style={{ width: "100%", background: "#000", borderRadius: 6 }} />
    </div>
  );
}

export default function Lobby() {
  const socket = useMemo(() => getSocket(), []);
  const [connected, setConnected] = useState(false);
  const [roomId, setRoomId] = useState("demo");
  const [role, setRole] = useState<Role>("spectator");
  const [name, setName] = useState("guest");
  const [state, setState] = useState<RoomState>({ hasPlayerA: false, hasPlayerB: false, spectators: 0 });
  const [msg, setMsg] = useState<string>("");

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const [, setTick] = useState(0); // force re-render when media changes
  useEffect(() => {
    setOnMediaChanged(() => setTick((t) => t + 1));
  }, []);

  // Socket subscriptions
  useEffect(() => {
    const s = socket;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onState = (st: RoomState) => setState(st);
    const onDenied = (e: any) => setMsg(`Join denied: ${e?.reason || "unknown"}`);
    const onJoined = () => setMsg("Joined room");
    const onPeerJoin = (p: any) => setMsg(`Peer joined: ${p?.role || p?.id}`);
    const onPeerLeft = (p: any) => setMsg(`Peer left: ${p?.role || p?.id}`);

    const onPeers = (peers: Array<{ id: string; role: Role }>) => {
      handlePeersList(peers);
    };
    const onPeerJoinForRtc = (p: any) => {
      handlePeerJoined(p as { id: string; role: Role });
    };

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("room-state", onState);
    s.on("join-denied", onDenied);
    s.on("joined", onJoined);
    s.on("peer-joined", onPeerJoin);
    s.on("peer-left", onPeerLeft);
    s.on("peers", onPeers);
    s.on("peer-joined", onPeerJoinForRtc);

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("room-state", onState);
      s.off("join-denied", onDenied);
      s.off("joined", onJoined);
      s.off("peer-joined", onPeerJoin);
      s.off("peer-left", onPeerLeft);
      s.off("peers", onPeers);
      s.off("peer-joined", onPeerJoinForRtc);
    };
  }, [socket]);

  // Join must be async only inside the ack callback
  const join = () => {
    setMsg("");
    socket.emit("join", { roomId, role, name }, async (ack: any) => {
      if (!ack?.ok) { setMsg(`Join failed: ${ack?.error || "unknown"}`); return; }
      setMsg("Joined (ack)");
      if (ack.state) setState(ack.state as RoomState);

      await setupWebRTC(socket, role);

      const ls = getLocalStream();
      if (ls && localVideoRef.current) {
        localVideoRef.current.srcObject = ls;
        localVideoRef.current.muted = true;
        try { await localVideoRef.current.play(); } catch {}
      }

      const mediaErr = getLastMediaError();
      if ((role === "playerA" || role === "playerB") && mediaErr) {
        setMsg(
          `Camera unavailable (${mediaErr}). You joined the room but your video is not publishing. ` +
          `Check browser permission (lock icon), Windows privacy settings, and close other apps using the camera.`
        );
      }
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
          <input value={roomId} onChange={(e) => setRoomId(e.target.value)} />
        </div>
        <div>
          <label>Name&nbsp;</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label>Role&nbsp;</label>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="playerA">playerA</option>
            <option value="playerB">playerB</option>
            <option value="spectator">spectator</option>
          </select>
        </div>
        <div>
          <button onClick={join} disabled={!connected} style={{ marginRight: 8 }}>
            Join
          </button>
          <button onClick={leave} disabled={!connected}>
            Leave
          </button>
        </div>

        <div style={{ background: "#f6f8ff", padding: 12, borderRadius: 8 }}>
          <div>
            <strong>Socket:</strong> {connected ? "connected" : "disconnected"}
          </div>
          <div>
            <strong>Room:</strong> {roomId}
          </div>
          <div>
            <strong>State:</strong> A={String(state.hasPlayerA)} · B={String(state.hasPlayerB)} · spectators={state.spectators}
          </div>
          {msg && <div style={{ marginTop: 8 }}>{msg}</div>}
        </div>
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        {/* Local (only shown when a local stream exists) */}
        {getLocalStream() ? (
          <div style={{ background: "#f8f8f8", padding: 8, borderRadius: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Local</div>
            <video ref={localVideoRef} playsInline autoPlay style={{ width: "100%", background: "#000", borderRadius: 8 }} />
          </div>
        ) : (
          <div style={{ background: "#f8f8f8", padding: 8, borderRadius: 8, color: "#666" }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Local</div>
            <div>No local camera stream.</div>
          </div>
        )}

        <div style={{ background: "#f8f8f8", padding: 8, borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Remote</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {getRemoteMedia().map((r) => (
              <VideoBox key={r.id} id={r.id} role={r.role} stream={r.stream} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
