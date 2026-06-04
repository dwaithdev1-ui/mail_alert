import React, { useState, useRef, useEffect } from 'react';
import { useAgent } from '../hooks/useAgent';

/* ── Tool badge chip ────────────────────────────────────────────────────── */
const TOOL_LABELS: Record<string, string> = {
  search_meetings:    'Searched meetings',
  get_today_meetings: 'Fetched today',
  create_meeting:     'Created meeting',
  cancel_meeting:     'Cancelled meeting',
  update_meeting:     'Updated meeting',
  check_conflicts:    'Checked conflicts',
  list_notifications: 'Checked inbox',
  get_briefing:       'Fetched briefing',
};

const ToolBadge: React.FC<{ tool: string }> = ({ tool }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    background: 'rgba(14,165,233,0.12)', color: 'var(--accent-primary)',
    border: '1px solid rgba(14,165,233,0.25)',
    borderRadius: '999px', fontSize: '0.7rem', fontWeight: 600,
    padding: '2px 8px', whiteSpace: 'nowrap',
  }}>
    ⚡ {TOOL_LABELS[tool] ?? tool}
  </span>
);

/* ── Typing indicator ───────────────────────────────────────────────────── */
const TypingDots: React.FC = () => (
  <div style={{ display: 'flex', gap: '4px', padding: '4px 0' }}>
    {[0, 1, 2].map(i => (
      <span key={i} style={{
        width: 6, height: 6, borderRadius: '50%',
        background: 'var(--accent-primary)',
        animation: `agentDot 1.2s ${i * 0.2}s ease-in-out infinite`,
      }} />
    ))}
  </div>
);

/* ── Main AgentChat component ───────────────────────────────────────────── */
const AgentChat: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const { history, isLoading, error, lastToolsUsed, sendMessage, clearHistory } = useAgent();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, isLoading]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 150);
  }, [isOpen]);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || isLoading) return;
    setInput('');
    await sendMessage(msg);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const suggestions = [
    "What's on my schedule today?",
    'Schedule a CSE review tomorrow at 3pm',
    'Cancel my next meeting',
    "Show today's briefing",
  ];

  return (
    <>
      <style>{`
        @keyframes agentDot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40%            { transform: scale(1);   opacity: 1;   }
        }
        @keyframes agentSlideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)     scale(1);   }
        }
        @keyframes agentPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(14,165,233,0.4); }
          50%       { box-shadow: 0 0 0 8px rgba(14,165,233,0); }
        }
        .agent-msg-user p, .agent-msg-assistant p { margin: 0 0 6px 0; }
        .agent-msg-user p:last-child,
        .agent-msg-assistant p:last-child { margin-bottom: 0; }
      `}</style>

      {/* ── Floating toggle button ── */}
      <button
        id="agent-chat-toggle"
        onClick={() => setIsOpen(o => !o)}
        title="AI Scheduling Assistant"
        aria-label="Open AI Assistant"
        style={{
          position: 'fixed', bottom: '24px', left: '24px',
          width: '52px', height: '52px', borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--accent-primary) 0%, #6366f1 100%)',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.4rem', color: 'white',
          boxShadow: '0 4px 20px rgba(14,165,233,0.4)',
          animation: history.length === 0 ? 'agentPulse 2.5s ease-in-out infinite' : 'none',
          zIndex: 9990,
          transition: 'transform 0.2s ease',
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
      >
        {isOpen ? '✕' : '✦'}
      </button>

      {/* ── Chat panel ── */}
      {isOpen && (
        <div
          id="agent-chat-panel"
          style={{
            position: 'fixed', bottom: '88px', left: '24px',
            width: '360px', height: '520px',
            background: 'var(--bg-color, #0b0f19)',
            border: '1px solid var(--glass-border)',
            borderRadius: '18px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 9990,
            animation: 'agentSlideUp 0.25s ease-out forwards',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--glass-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(14,165,233,0.06)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--accent-primary), #6366f1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.9rem', color: 'white', flexShrink: 0,
              }}>✦</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                  AI Assistant
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  Scheduling · Briefings · Alerts
                </div>
              </div>
            </div>
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                title="Clear conversation"
                style={{
                  background: 'none', border: 'none', color: 'var(--text-secondary)',
                  cursor: 'pointer', fontSize: '0.75rem', padding: '4px 8px',
                  borderRadius: '6px', transition: 'color 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
              >
                Clear
              </button>
            )}
          </div>

          {/* Messages area */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '16px',
            display: 'flex', flexDirection: 'column', gap: '12px',
          }}>
            {/* Welcome state */}
            {history.length === 0 && !isLoading && (
              <div style={{ textAlign: 'center', marginTop: '16px' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>✦</div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 16px 0' }}>
                  I can schedule, cancel, or update meetings — just ask.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {suggestions.map(s => (
                    <button
                      key={s}
                      onClick={() => { setInput(s); inputRef.current?.focus(); }}
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '8px', padding: '8px 12px',
                        color: 'var(--text-secondary)', cursor: 'pointer',
                        fontSize: '0.8rem', textAlign: 'left',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(14,165,233,0.08)';
                        e.currentTarget.style.color = 'var(--text-primary)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Conversation history */}
            {history.map((msg, idx) => {
              const isUser = msg.role === 'user';
              const isLastAssistant = !isUser && idx === history.length - 1;
              return (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                  <div
                    className={isUser ? 'agent-msg-user' : 'agent-msg-assistant'}
                    style={{
                      maxWidth: '88%',
                      padding: '10px 14px',
                      borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: isUser
                        ? 'linear-gradient(135deg, var(--accent-primary), #6366f1)'
                        : 'rgba(255,255,255,0.06)',
                      border: isUser ? 'none' : '1px solid var(--glass-border)',
                      color: isUser ? 'white' : 'var(--text-primary)',
                      fontSize: '0.85rem',
                      lineHeight: '1.55',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {msg.content}
                  </div>
                  {/* Show tool badges under last assistant message */}
                  {isLastAssistant && lastToolsUsed.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                      {lastToolsUsed.map((t, i) => <ToolBadge key={i} tool={t} />)}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Typing indicator */}
            {isLoading && (
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <div style={{
                  padding: '10px 14px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '16px 16px 16px 4px',
                }}>
                  <TypingDots />
                </div>
              </div>
            )}

            {/* Error banner */}
            {error && (
              <div style={{
                padding: '8px 12px', borderRadius: '8px',
                background: 'rgba(239,68,68,0.1)', color: 'var(--danger)',
                fontSize: '0.8rem', border: '1px solid rgba(239,68,68,0.2)',
              }}>
                ⚠ {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input row */}
          <div style={{
            padding: '12px 14px',
            borderTop: '1px solid var(--glass-border)',
            display: 'flex', gap: '8px', alignItems: 'center',
            background: 'rgba(0,0,0,0.2)', flexShrink: 0,
          }}>
            <input
              ref={inputRef}
              id="agent-chat-input"
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask me anything…"
              disabled={isLoading}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--glass-border)',
                borderRadius: '10px', padding: '9px 14px',
                color: 'var(--text-primary)', fontSize: '0.875rem',
                outline: 'none', fontFamily: 'inherit',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--accent-primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--glass-border)')}
            />
            <button
              id="agent-chat-send"
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              aria-label="Send message"
              style={{
                width: 38, height: 38, borderRadius: '10px', flexShrink: 0,
                background: input.trim() && !isLoading
                  ? 'linear-gradient(135deg, var(--accent-primary), #6366f1)'
                  : 'rgba(255,255,255,0.06)',
                border: 'none', cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
                color: 'white', fontSize: '1rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s ease',
              }}
            >
              {isLoading ? '…' : '↑'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default AgentChat;
