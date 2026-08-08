"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import {
  Room,
  RoomEvent,
  Track,
  ParticipantEvent,
  ConnectionQuality,
} from "livekit-client";
import {
  MicOff,
  AlertTriangle,
  ArrowLeft,
  Video,
  Copy,
  Users,
  PartyPopper,
  Mic,
  Camera,
  CameraOff,
  MonitorUp,
  Monitor,
  PhoneOff,
  CheckCircle
} from "lucide-react";

const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || "ws://localhost:7880";
const TOKEN_API = process.env.NEXT_PUBLIC_TOKEN_API || "http://localhost:3001";

async function fetchToken(roomId, identity) {
  const res = await fetch(
    `${TOKEN_API}/api/token?room=${encodeURIComponent(roomId)}&identity=${encodeURIComponent(identity)}`
  );
  if (!res.ok) throw new Error("Failed to get token from backend");
  const data = await res.json();
  return data.token;
}

function getInitials(name) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function qualityLabel(q) {
  switch (q) {
    case ConnectionQuality.Excellent: return { text: "Excellent", cls: "excellent" };
    case ConnectionQuality.Good: return { text: "Good", cls: "good" };
    case ConnectionQuality.Poor: return { text: "Poor", cls: "poor" };
    default: return { text: "Connecting…", cls: "" };
  }
}

function VideoTile({ participant, isLocal, type = "camera" }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [isMuted, setIsMuted] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    function refresh() {
      if (type === "screen") {
        const screenPub = participant.getTrackPublication(Track.Source.ScreenShare);
        setHasVideo(!!(screenPub && !screenPub.isMuted && screenPub.isEnabled && screenPub.track));
        setIsMuted(true);
      } else {
        const micPub = participant.getTrackPublication(Track.Source.Microphone);
        const camPub = participant.getTrackPublication(Track.Source.Camera);
        setIsMuted(!micPub || micPub.isMuted || !micPub.isEnabled);
        setHasVideo(!!(camPub && !camPub.isMuted && camPub.isEnabled && camPub.track));
      }
    }

    refresh();

    participant.on(ParticipantEvent.TrackMuted, refresh);
    participant.on(ParticipantEvent.TrackUnmuted, refresh);
    participant.on(ParticipantEvent.TrackSubscribed, refresh);
    participant.on(ParticipantEvent.TrackUnsubscribed, refresh);
    if (type !== "screen") {
      participant.on(ParticipantEvent.IsSpeakingChanged, (speaking) =>
        setIsSpeaking(speaking)
      );
    }

    return () => {
      participant.off(ParticipantEvent.TrackMuted, refresh);
      participant.off(ParticipantEvent.TrackUnmuted, refresh);
      participant.off(ParticipantEvent.TrackSubscribed, refresh);
      participant.off(ParticipantEvent.TrackUnsubscribed, refresh);
      if (type !== "screen") {
        participant.off(ParticipantEvent.IsSpeakingChanged, setIsSpeaking);
      }
    };
  }, [participant, type]);

  useEffect(() => {
    const source = type === "screen" ? Track.Source.ScreenShare : Track.Source.Camera;
    const pub = participant.getTrackPublication(source);
    if (pub && pub.track && videoRef.current) {
      pub.track.attach(videoRef.current);
    }
    return () => {
      if (pub && pub.track) pub.track.detach();
    };
  }, [participant, hasVideo, type]);

  useEffect(() => {
    if (isLocal || type === "screen") return;
    const pub = participant.getTrackPublication(Track.Source.Microphone);
    if (pub && pub.track && audioRef.current) {
      pub.track.attach(audioRef.current);
    }
    return () => {
      if (pub && pub.track) pub.track.detach();
    };
  }, [participant, isLocal, type, isMuted]);

  const displayName = participant.name || participant.identity || "Guest";

  return (
    <div className={`video-tile${isSpeaking ? " speaking" : ""}${type === "screen" ? " screen-tile" : ""}`}>
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal || type === "screen"}
          style={{ objectFit: type === "screen" ? "contain" : "cover" }}
        />
      ) : (
        <div className="video-tile-avatar">{getInitials(displayName)}</div>
      )}
      {!isLocal && type !== "screen" && (
        <audio ref={audioRef} autoPlay />
      )}
      <div className="video-tile-name">
        {displayName}
        {type === "screen" ? "'s Screen" : isLocal ? " (You)" : ""}
      </div>
      {isMuted && type !== "screen" && (
        <div className="video-tile-muted" title="Muted"><MicOff size={14} color="white" /></div>
      )}
    </div>
  );
}

export default function RoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const roomId = params.roomId;
  const displayName = searchParams.get("name") || "Guest";

  const roomRef = useRef(null);
  const [status, setStatus] = useState("connecting");
  const [errorMsg, setErrorMsg] = useState("");

  const [participants, setParticipants] = useState([]);
  const [localParticipant, setLocalParticipant] = useState(null);

  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);

  const [quality, setQuality] = useState(null);
  const [toastVisible, setToastVisible] = useState(false);

  const syncParticipants = useCallback((room) => {
    setParticipants(Array.from(room.remoteParticipants.values()));
  }, []);

  useEffect(() => {
    let mounted = true;
    let room;

    async function connect() {
      try {
        const token = await fetchToken(roomId, displayName);
        if (!mounted) return;

        room = new Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true },
        });

        roomRef.current = room;

        room.on(RoomEvent.ParticipantConnected, () => syncParticipants(room));
        room.on(RoomEvent.ParticipantDisconnected, () => syncParticipants(room));
        room.on(RoomEvent.TrackSubscribed, () => syncParticipants(room));
        room.on(RoomEvent.TrackUnsubscribed, () => syncParticipants(room));
        room.on(RoomEvent.LocalTrackPublished, () => syncParticipants(room));
        room.on(RoomEvent.LocalTrackUnpublished, () => syncParticipants(room));
        room.on(RoomEvent.Disconnected, () => {
          if (mounted) router.replace("/");
        });
        room.on(RoomEvent.ConnectionQualityChanged, (q, participant) => {
          if (participant === room.localParticipant) setQuality(q);
        });

        await room.connect(LIVEKIT_URL, token);
        if (!mounted) { room.disconnect(); return; }

        await room.localParticipant.enableCameraAndMicrophone();
        if (!mounted) { room.disconnect(); return; }

        setLocalParticipant(room.localParticipant);
        syncParticipants(room);
        setStatus("connected");
      } catch (err) {
        if (!mounted) return;
        console.error(err);
        setErrorMsg(err.message || "Something went wrong connecting to the room.");
        setStatus("error");
      }
    }

    connect();

    return () => {
      mounted = false;
      if (room) room.disconnect();
      roomRef.current = null;
    };
  }, [roomId, displayName, router, syncParticipants]);

  async function toggleMic() {
    const room = roomRef.current;
    if (!room) return;
    const next = !micEnabled;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicEnabled(next);
  }

  async function toggleCam() {
    const room = roomRef.current;
    if (!room) return;
    const next = !camEnabled;
    await room.localParticipant.setCameraEnabled(next);
    setCamEnabled(next);
  }

  async function toggleScreen() {
    const room = roomRef.current;
    if (!room) return;
    const next = !screenSharing;
    try {
      await room.localParticipant.setScreenShareEnabled(next);
      setScreenSharing(next);
    } catch (err) {
      console.error("Screen share error:", err);
      alert("Screen sharing is not supported on this device/browser (e.g., mobile devices).");
    }
  }

  function leaveCall() {
    if (roomRef.current) roomRef.current.disconnect();
    router.replace("/");
  }

  function copyRoomLink() {
    const url = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  }

  const tiles = [];
  if (localParticipant) {
    tiles.push({
      id: `${localParticipant.identity}-camera`,
      participant: localParticipant,
      type: "camera",
      isLocal: true,
    });
    if (localParticipant.isScreenShareEnabled) {
      tiles.push({
        id: `${localParticipant.identity}-screen`,
        participant: localParticipant,
        type: "screen",
        isLocal: true,
      });
    }
  }

  participants.forEach((p) => {
    tiles.push({
      id: `${p.identity}-camera`,
      participant: p,
      type: "camera",
      isLocal: false,
    });
    if (p.isScreenShareEnabled) {
      tiles.push({
        id: `${p.identity}-screen`,
        participant: p,
        type: "screen",
        isLocal: false,
      });
    }
  });

  const count = tiles.length;
  const gridAttr = count <= 6 ? String(count) : "large";

  const q = qualityLabel(quality);

  if (status === "connecting") {
    return (
      <div className="room-loading">
        <div className="spinner" />
        <span>Joining room…</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="room-loading">
        <div className="error-card">
          <div className="error-icon"><AlertTriangle size={40} color="var(--danger)" /></div>
          <div className="error-title">Could not connect</div>
          <div className="error-message">{errorMsg}</div>
          <button className="btn-primary" onClick={() => router.replace("/")}>
            <ArrowLeft size={18} /> Back to home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="room-container">
      <header className="room-header">
        <div className="room-header-left">
          <div className="room-header-logo"><Video size={16} color="white" /></div>
          <span className="room-name">HQ</span>
          <button
            id="copy-room-id-btn"
            className="room-id-badge"
            onClick={copyRoomLink}
            title="Click to copy room link"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>{roomId} <Copy size={12} /></span>
          </button>
        </div>

        <div className="room-header-right">
          {quality !== null && (
            <div className="quality-badge">
              <span className={`quality-dot ${q.cls}`} />
              {q.text}
            </div>
          )}
          <span className="participant-count" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Users size={14} /> {count} participant{count !== 1 ? "s" : ""}
          </span>
        </div>
      </header>

      <main className="video-stage">
        {tiles.length === 0 ? (
          <div style={{ color: "var(--muted)", textAlign: "center" }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: "0.75rem" }}><PartyPopper size={48} color="var(--accent)" /></div>
            <div>You're the first one here!</div>
            <div style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
              Share the room ID at the top to invite others.
            </div>
          </div>
        ) : (
          <div className="video-grid" data-count={gridAttr}>
            {tiles.map(({ id, participant, isLocal, type }) => (
              <VideoTile
                key={id}
                participant={participant}
                isLocal={isLocal}
                type={type}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="controls-bar">
        <button
          id="toggle-mic-btn"
          className={`ctrl-btn${!micEnabled ? " muted" : ""}`}
          onClick={toggleMic}
          title={micEnabled ? "Mute microphone" : "Unmute microphone"}
        >
          <span>{micEnabled ? <Mic size={22} /> : <MicOff size={22} />}</span>
          <span className="ctrl-btn-label">{micEnabled ? "Mute" : "Unmute"}</span>
        </button>

        <button
          id="toggle-cam-btn"
          className={`ctrl-btn${!camEnabled ? " muted" : ""}`}
          onClick={toggleCam}
          title={camEnabled ? "Turn off camera" : "Turn on camera"}
        >
          <span>{camEnabled ? <Camera size={22} /> : <CameraOff size={22} />}</span>
          <span className="ctrl-btn-label">{camEnabled ? "Camera" : "No Cam"}</span>
        </button>

        <button
          id="toggle-screen-btn"
          className={`ctrl-btn${screenSharing ? " screen-on" : ""}`}
          onClick={toggleScreen}
          title={screenSharing ? "Stop sharing screen" : "Share your screen"}
        >
          <span>{screenSharing ? <MonitorUp size={22} /> : <Monitor size={22} />}</span>
          <span className="ctrl-btn-label">{screenSharing ? "Stop" : "Screen"}</span>
        </button>

        <button
          id="leave-call-btn"
          className="ctrl-btn-leave"
          onClick={leaveCall}
          title="Leave call"
        >
          <span><PhoneOff size={22} /></span>
          <span className="ctrl-btn-label">Leave</span>
        </button>
      </footer>

      <div className={`toast${toastVisible ? " show" : ""}`} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <CheckCircle size={16} color="var(--success)" /> Room link copied!
      </div>
    </div>
  );
}
