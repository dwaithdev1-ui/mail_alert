import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSettings } from '../context/SettingsContext';
import { useCalendarContext } from '../context/CalendarContext';

interface Meeting {
  title: string;
  time: string;
}

interface ActiveAlert extends Meeting {
  minsUntil: number;
}

interface ToastNotif {
  id: string;
  title: string;
  minsUntil: number;
}

/* ── Web Audio chime ────────────────────────────────────────────────────── */
function playChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.28, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
      osc.start(t);
      osc.stop(t + 1.6);
    });
  } catch {
    // AudioContext blocked — silent fail
  }
}

/* ── Browser notification ───────────────────────────────────────────────── */
async function sendBrowserNotification(title: string, minsUntil: number) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
  if (Notification.permission === 'granted') {
    new Notification(`⏰ Meeting in ${minsUntil} min`, {
      body: title,
      icon: '/favicon.ico',
      tag: `meeting-alert-${title}-${minsUntil}`,
    });
  }
}

/* ── Top-bar marquee (one-shot, then disappears) ────────────────────────── */
const MarqueeBar: React.FC<{ alerts: ActiveAlert[]; onDone: () => void }> = ({ alerts, onDone }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleEnd = () => onDone();
    el.addEventListener('animationend', handleEnd);
    return () => el.removeEventListener('animationend', handleEnd);
  }, [onDone]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '40px',
        // Match the app dark background; accent stripe at the bottom
        background: 'var(--bg-color, #0b0f19)',
        borderBottom: '1px solid var(--accent-primary, #0ea5e9)',
        color: 'var(--text-primary, #f8fafc)',
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        zIndex: 9999,
        boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
        // Soft fade at edges so text dissolves into the background
        WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
        maskImage:        'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
      }}
    >
      <style>{`
        @keyframes marquee-once {
          0%   { transform: translateX(100vw); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
      <div
        ref={ref}
        style={{
          display: 'flex',
          gap: '4rem',
          whiteSpace: 'nowrap',
          animation: 'marquee-once 45s linear 1 forwards',
        }}
      >
        {alerts.map((m, idx) => (
          <span key={idx} style={{ fontWeight: 500, fontSize: '1.05rem', letterSpacing: '0.025em', color: 'var(--text-secondary, #94a3b8)' }}>
            Upcoming Meeting:&nbsp;<strong style={{ color: 'var(--text-primary, #f8fafc)' }}>{m.title}</strong>&nbsp;in&nbsp;<strong style={{ color: 'var(--accent-primary, #0ea5e9)' }}>{m.minsUntil} min{m.minsUntil !== 1 ? 's' : ''}</strong>
          </span>
        ))}
      </div>
    </div>
  );
};

/* ── Bottom-right toast popup ───────────────────────────────────────────── */
const MeetingToast: React.FC<{ notif: ToastNotif; onClose: (id: string) => void }> = ({ notif, onClose }) => {
  useEffect(() => {
    const t = setTimeout(() => onClose(notif.id), 8000);
    return () => clearTimeout(t);
  }, [notif.id, onClose]);

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.95) 0%, rgba(139,92,246,0.95) 100%)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: '14px',
        padding: '14px 18px',
        color: 'white',
        boxShadow: '0 8px 32px rgba(99,102,241,0.45)',
        minWidth: '260px',
        maxWidth: '320px',
        animation: 'toast-in 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards',
        position: 'relative',
      }}
    >
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(20px) scale(0.94); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
      `}</style>
      <button
        onClick={() => onClose(notif.id)}
        style={{
          position: 'absolute', top: '8px', right: '10px',
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)',
          cursor: 'pointer', fontSize: '1rem', lineHeight: 1,
        }}
        aria-label="Dismiss alert"
      >✕</button>
      <div style={{ fontWeight: 700, fontSize: '0.78rem', opacity: 0.8, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Meeting Alert
      </div>
      <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '2px' }}>
        ⏰ {notif.title}
      </div>
      <div style={{ fontSize: '0.85rem', opacity: 0.85 }}>
        Starts in <strong>{notif.minsUntil} min{notif.minsUntil !== 1 ? 's' : ''}</strong>
      </div>
    </div>
  );
};

/* ── Main AlertPort ─────────────────────────────────────────────────────── */
const AlertPort: React.FC = () => {
  const { settings } = useSettings();
  const { events: meetings } = useCalendarContext();

  // Top marquee bar state: null = hidden, array = showing
  const [marqueeAlerts, setMarqueeAlerts] = useState<ActiveAlert[] | null>(null);

  // Bottom-right toasts
  const [toasts, setToasts] = useState<ToastNotif[]>([]);

  // Track which (meeting+threshold) combos have already fired
  // Key format: "<title>@<thresholdMinute>"  e.g. "Standup@10"
  const firedRef = useRef<Set<string>>(new Set());

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const hideMarquee = useCallback(() => {
    setMarqueeAlerts(null);
  }, []);

  useEffect(() => {
    const timings: number[] = (settings.alertTimings?.length ? settings.alertTimings : [5]).slice().sort((a, b) => a - b);

    const checkAlerts = () => {
      const now = Date.now();
      const newAlerts: ActiveAlert[] = [];

      meetings.forEach(m => {
        const meetingTime = new Date(m.start).getTime();
        const diffMins = (meetingTime - now) / 60000; // fractional minutes remaining

        timings.forEach(threshold => {
          // Wide match window: fire if diffMins is within [threshold-1, threshold+0.25].
          // This gives a 75-second lead and 15-second trailing window, far wider than
          // our 5 s poll interval — so we NEVER miss a threshold.
          if (diffMins < threshold - 1 || diffMins > threshold + 0.25) return;

          const key = `${m.title}@${threshold}`;
          if (firedRef.current.has(key)) return;
          firedRef.current.add(key);

          newAlerts.push({ title: m.title, time: m.start, minsUntil: threshold });

          // 1. Chime
          if (settings.alertSound && (settings.alertType === 'banner' || settings.alertType === 'both')) {
            playChime();
          }

          // 2. Browser notification
          if (settings.alertType === 'notification' || settings.alertType === 'both') {
            sendBrowserNotification(m.title, threshold);
          }

          // 3. Bottom-right toast
          if (settings.alertType === 'banner' || settings.alertType === 'both') {
            const toastId = `${m.title}-${threshold}-${Date.now()}`;
            setToasts(prev => [...prev, { id: toastId, title: m.title, minsUntil: threshold }]);
          }
        });
      });

      // 4. Top marquee bar — show for any new alerts this tick
      if (newAlerts.length > 0) {
        setMarqueeAlerts(newAlerts);
      }
    };

    checkAlerts();
    // Poll every 5 s — well within the 75-second match window
    const id = setInterval(checkAlerts, 5_000);
    return () => clearInterval(id);
  }, [meetings, settings.alertTimings, settings.alertSound, settings.alertType]);

  return (
    <>
      {/* Top marquee bar */}
      {marqueeAlerts && (
        <MarqueeBar alerts={marqueeAlerts} onDone={hideMarquee} />
      )}

      {/* Bottom-right toast stack */}
      {toasts.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            zIndex: 9998,
            alignItems: 'flex-end',
          }}
        >
          {toasts.map(notif => (
            <MeetingToast key={notif.id} notif={notif} onClose={dismissToast} />
          ))}
        </div>
      )}
    </>
  );
};

export default AlertPort;
