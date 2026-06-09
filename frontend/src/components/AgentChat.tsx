import React, { useState, useRef, useEffect } from 'react';
import { useAgent } from '../hooks/useAgent';
import { useCalendarContext } from '../context/CalendarContext';
import { cleanAgentResponse } from '../utils/cleanResponse';

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
  send_email:         'Sent email',
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

const SpeechRecognitionAPI =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

interface AgentChatProps {
  isOpen: boolean;
  setIsOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
}

const AgentChat: React.FC<AgentChatProps> = ({ isOpen, setIsOpen }) => {
  const [input, setInput] = useState('');
  const { history, isLoading, error, lastToolsUsed, sendMessage, clearHistory } = useAgent();
  const { refresh } = useCalendarContext();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, isLoading]);

  // Speech Recognition States
  const [isListening, setIsListening] = useState(false);
  const [speechSupported] = useState(!!SpeechRecognitionAPI);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const silenceTimerRef = useRef<any>(null);

  // Keep sendMessage reference stable to prevent recreating recognition instance on re-renders
  const sendMessageRef = useRef(sendMessage);
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  useEffect(() => {
    if (!SpeechRecognitionAPI) return;

    const rec = new SpeechRecognitionAPI();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onstart = () => {
      setIsListening(true);
      isListeningRef.current = true;
      setSpeechError(null);
      setInput('');
    };

    rec.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = 0; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const currentText = (finalTranscript + interimTranscript).trim();
      setInput(currentText);

      // Reset silence timer on every new transcription chunk
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }

      if (currentText) {
        silenceTimerRef.current = setTimeout(() => {
          rec.stop();
          sendMessageRef.current(currentText);
          setInput('');
        }, 1500); // Wait 1.5 seconds of silence before auto-submitting
      }
    };

    rec.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setSpeechError('Microphone permission denied.');
      } else if (event.error === 'no-speech') {
        // quiet timeout
      } else if (event.error === 'aborted') {
        // Ignore deliberate aborts during cleanup/stops
      } else {
        setSpeechError(`Speech error: ${event.error}`);
      }
      setIsListening(false);
      isListeningRef.current = false;
    };

    rec.onend = () => {
      setIsListening(false);
      isListeningRef.current = false;
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    };

    recognitionRef.current = rec;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, []);

  const toggleListening = () => {
    if (isLoading) return;
    if (!recognitionRef.current) return;
    if (isListeningRef.current) {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      recognitionRef.current.stop();
      isListeningRef.current = false;
      setIsListening(false);
    } else {
      try {
        setSpeechError(null);
        isListeningRef.current = true;
        setIsListening(true);
        recognitionRef.current.start();
      } catch (err) {
        console.error('Failed to start speech recognition:', err);
        isListeningRef.current = false;
        setIsListening(false);
      }
    }
  };

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 150);
  }, [isOpen]);

  // Auto-refresh calendar events when agent schedules, cancels, or updates a meeting
  useEffect(() => {
    const writeTools = ['create_meeting', 'cancel_meeting', 'update_meeting'];
    if (lastToolsUsed.some(tool => writeTools.includes(tool))) {
      refresh();
    }
  }, [lastToolsUsed, refresh]);

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
        @keyframes micPulse {
          0%   { transform: scale(1);   opacity: 1; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        .agent-msg-user p, .agent-msg-assistant p { margin: 0 0 6px 0; }
        .agent-msg-user p:last-child,
        .agent-msg-assistant p:last-child { margin-bottom: 0; }
      `}</style>

      {/* ── Chat panel ── */}
      {isOpen && (
        <div
          id="agent-chat-panel"
          style={{
            position: 'absolute',
            bottom: '24px',
            left: 'calc(var(--sidebar-width, 260px) + 24px)',
            width: '360px',
            height: 'min(520px, calc(100vh - 88px))',
            background: 'var(--bg-color, #0b0f19)',
            border: '1px solid var(--glass-border)',
            borderRadius: '18px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
            display: 'flex',
            flexDirection: 'column',
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
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {history.length > 0 && (
                <button
                  onClick={clearHistory}
                  disabled={isLoading}
                  title="Clear conversation"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: isLoading ? 'rgba(255,255,255,0.25)' : 'var(--text-secondary)',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    fontSize: '0.75rem',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={e => {
                    if (!isLoading) e.currentTarget.style.color = 'var(--danger)';
                  }}
                  onMouseLeave={e => {
                    if (!isLoading) e.currentTarget.style.color = 'var(--text-secondary)';
                  }}
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                title="Hide Assistant"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
              >
                ✕
              </button>
            </div>
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
                    {isUser ? msg.content : cleanAgentResponse(msg.content)}
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

            {/* Speech error banner */}
            {speechError && (
              <div style={{
                padding: '8px 12px', borderRadius: '8px',
                background: 'rgba(239,68,68,0.1)', color: 'var(--danger)',
                fontSize: '0.8rem', border: '1px solid rgba(239,68,68,0.2)',
              }}>
                🎙️ {speechError}
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
            {speechSupported && (
              <button
                type="button"
                onClick={toggleListening}
                title={isListening ? 'Stop listening' : 'Speak command'}
                aria-label={isListening ? 'Stop listening' : 'Speak command'}
                disabled={isLoading}
                style={{
                  width: 38, height: 38, borderRadius: '10px', flexShrink: 0,
                  background: isListening
                    ? 'rgba(239, 68, 68, 0.2)'
                    : 'rgba(255, 255, 255, 0.06)',
                  border: isListening
                    ? '1px solid rgba(239, 68, 68, 0.4)'
                    : '1px solid var(--glass-border)',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  color: isListening ? 'var(--danger)' : 'var(--text-secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                }}
                onMouseEnter={e => {
                  if (!isListening && !isLoading) {
                    e.currentTarget.style.borderColor = 'var(--accent-primary)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isListening && !isLoading) {
                    e.currentTarget.style.borderColor = 'var(--glass-border)';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }
                }}
              >
                {isListening && (
                  <span style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    borderRadius: '10px',
                    border: '2px solid var(--danger)',
                    animation: 'micPulse 1.5s infinite',
                  }} />
                )}
                🎙️
              </button>
            )}
            <input
              ref={inputRef}
              id="agent-chat-input"
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={isListening ? 'Listening... Speak now' : 'Ask me anything…'}
              disabled={isLoading || isListening}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--glass-border)',
                borderRadius: '10px', padding: '9px 14px',
                color: 'var(--text-primary)', fontSize: '0.875rem',
                outline: 'none', fontFamily: 'inherit',
                transition: 'all 0.2s ease',
                cursor: (isLoading || isListening) ? 'not-allowed' : 'text',
                opacity: (isLoading || isListening) ? 0.6 : 1,
              }}
              onFocus={e => {
                if (!isLoading && !isListening) {
                  e.target.style.borderColor = 'var(--accent-primary)';
                }
              }}
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
