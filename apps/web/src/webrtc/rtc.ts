import type { Role } from "../realtime/socket";
import type { Socket } from "socket.io-client";

type RemoteMedia = { id: string; role: Role; stream: MediaStream };

const iceServers: RTCIceServer[] = [
  { urls: ["stun:localhost:3478"] },
  { urls: ["turn:localhost:3478"], username: "dev", credential: "devpassword" }
];

let meRole: Role = "spectator";
let socket: Socket;
let localStream: MediaStream | null = null;
let lastMediaError: string | null = null;

const pcs = new Map<string, RTCPeerConnection>();
const remotes = new Map<string, RemoteMedia>();
let onMediaChanged: (() => void) | null = null;

export function setOnMediaChanged(cb: () => void) { onMediaChanged = cb; }
export function getLocalStream() { return localStream; }
export function getRemoteMedia(): RemoteMedia[] { return Array.from(remotes.values()); }
export function getLastMediaError() { return lastMediaError; }

function createPc(peerId: string, peerRole: Role) {
  if (pcs.has(peerId)) return pcs.get(peerId)!;
  const pc = new RTCPeerConnection({ iceServers });

  pc.onicecandidate = ev => { if (ev.candidate) socket.emit("rtc-ice", { to: peerId, candidate: ev.candidate }); };

  pc.ontrack = ev => {
    const stream = ev.streams[0] ?? new MediaStream([ev.track]);
    const existing = remotes.get(peerId);
    if (existing) {
      if (!existing.stream.getTracks().some(t => t.id === ev.track.id)) existing.stream.addTrack(ev.track);
    } else {
      remotes.set(peerId, { id: peerId, role: peerRole, stream });
    }
    onMediaChanged?.();
  };

  // Players publican si hay cámara disponible
  if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream!));

  pcs.set(peerId, pc);
  return pc;
}

function shouldOfferTo(remoteRole: Role): boolean {
  if (meRole === "playerA" && (remoteRole === "playerB" || remoteRole === "spectator")) return true;
  if (meRole === "playerB" && remoteRole === "spectator") return true;
  return false;
}

async function offerTo(peerId: string, peerRole: Role) {
  const pc = createPc(peerId, peerRole);
  const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
  await pc.setLocalDescription(offer);
  socket.emit("rtc-offer", { to: peerId, sdp: offer });
}

export async function setupWebRTC(s: Socket, role: Role): Promise<{ ok: boolean; error?: string }> {
  socket = s;
  meRole = role;
  lastMediaError = null;

  // Intentar capturar cámara solo si eres jugador
  if (role === "playerA" || role === "playerB") {
    try {
      // Usa una petición genérica; si no hay cámara, lanzará NotFoundError.
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      onMediaChanged?.();
    } catch (e: any) {
      localStream = null;
      lastMediaError = e?.name || e?.message || "media_error";
      // Seguimos sin cámara: podrás ver remotos, pero no publicar.
      console.warn("[rtc] getUserMedia failed:", lastMediaError);
    }
  }

  // Handlers de señalización
  socket.on("rtc-offer", async ({ from, sdp, role: r }: { from: string; sdp: any; role: Role }) => {
    const pc = createPc(from, r);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("rtc-answer", { to: from, sdp: answer });
  });

  socket.on("rtc-answer", async ({ from, sdp }: { from: string; sdp: any }) => {
    const pc = pcs.get(from);
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  });

  socket.on("rtc-ice", async ({ from, candidate }: { from: string; candidate: any }) => {
    const pc = pcs.get(from);
    if (!pc || !candidate) return;
    try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
  });

  socket.on("peer-left", ({ id }: { id: string }) => {
    const pc = pcs.get(id);
    if (pc) { pc.getSenders().forEach(s => s.track && s.track.stop()); pc.close(); }
    pcs.delete(id);
    remotes.delete(id);
    onMediaChanged?.();
  });

  return { ok: true };
}

export async function handlePeersList(peers: Array<{ id: string; role: Role }>) {
  for (const p of peers) if (shouldOfferTo(p.role)) await offerTo(p.id, p.role);
}

export async function handlePeerJoined(p: { id: string; role: Role }) {
  if (shouldOfferTo(p.role)) await offerTo(p.id, p.role);
}
