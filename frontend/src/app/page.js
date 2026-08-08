"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Video, Sparkles, ArrowRight } from "lucide-react";

function generateRoomId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const seg = (len) =>
    Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${seg(3)}-${seg(4)}-${seg(3)}`;
}

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [loading, setLoading] = useState(false);

  function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    const roomId = generateRoomId();
    router.push(`/room/${roomId}?name=${encodeURIComponent(name.trim())}`);
  }

  function handleJoin(e) {
    e.preventDefault();
    if (!name.trim() || !roomInput.trim()) return;
    setLoading(true);
    let rawInput = roomInput.trim();
    let roomId = rawInput;
    try {
      if (rawInput.startsWith("http://") || rawInput.startsWith("https://")) {
        const url = new URL(rawInput);
        const pathParts = url.pathname.split("/");
        const roomIdx = pathParts.indexOf("room");
        if (roomIdx !== -1 && pathParts[roomIdx + 1]) {
          roomId = pathParts[roomIdx + 1];
        }
      }
    } catch (err) {
      console.error("Error parsing room URL:", err);
    }
    roomId = roomId.toLowerCase().replace(/\s+/g, "-");
    router.push(`/room/${roomId}?name=${encodeURIComponent(name.trim())}`);
  }

  const nameOk = name.trim().length > 0;

  return (
    <div className="home-container">
      <div className="home-card">
        <div className="home-logo">
          <div className="home-logo-icon"><Video size={20} color="white" /></div>
          <span className="home-logo-text">HQ</span>
        </div>

        <h1 className="home-title">Start a call in seconds</h1>
        <p className="home-subtitle">
          No sign-up, no downloads. Just share a link and start talking.
        </p>

        <div className="form-group">
          <label htmlFor="name-input" className="form-label">
            Your name
          </label>
          <input
            id="name-input"
            className="form-input"
            type="text"
            placeholder="e.g. Aarav"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={32}
          />
        </div>

        <button
          id="create-room-btn"
          className="btn-primary"
          onClick={handleCreate}
          disabled={!nameOk || loading}
        >
          <Sparkles size={18} /> Create a new room
        </button>

        <div className="form-divider">or join an existing room</div>

        <div className="form-group">
          <label htmlFor="room-input" className="form-label">
            Room ID or link
          </label>
          <input
            id="room-input"
            className="form-input"
            type="text"
            placeholder="e.g. abc-defg-hij"
            value={roomInput}
            onChange={(e) => setRoomInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin(e)}
          />
        </div>

        <button
          id="join-room-btn"
          className="btn-secondary"
          onClick={handleJoin}
          disabled={!nameOk || !roomInput.trim() || loading}
        >
          <ArrowRight size={18} /> Join room
        </button>
      </div>
    </div>
  );
}
