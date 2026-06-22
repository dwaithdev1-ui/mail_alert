import React, { useState, useEffect, useRef } from 'react';
import { useAgent } from '../hooks/useAgent';
import { useCalendarContext } from '../context/CalendarContext';
import { cleanAgentResponse } from '../utils/cleanResponse';

const SpeechRecognitionAPI =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

const VoiceAssistant: React.FC = () => {
  const { history, isLoading, error, lastToolsUsed, sendMessage } = useAgent();
  const { refresh } = useCalendarContext();

  const [isListening, setIsListening] = useState(false);
  const [speechSupported] = useState(!!SpeechRecognitionAPI);
  const [showWindow, setShowWindow] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechTranscript, setSpeechTranscript] = useState('');
  
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const silenceTimerRef = useRef<any>(null);
  const prevHistoryLength = useRef(0);

  // Auto-refresh calendar if voice commands perform scheduling actions
  useEffect(() => {
    const writeTools = ['create_meeting', 'cancel_meeting', 'update_meeting'];
    if (lastToolsUsed.some(tool => writeTools.includes(tool))) {
      refresh();
    }
  }, [lastToolsUsed, refresh]);

  // Keep track of stable ref to send message inside speech recognition callbacks
  const sendMessageRef = useRef(sendMessage);
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  // Handle Text-To-Speech SpeechSynthesis
  const speakText = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel(); // cancel any active speech

    // Clean up response for clean reading (remove function tags, markdown headers, symbols, etc.)
    const cleanText = cleanAgentResponse(text)
      .replace(/<[^>]*>/g, '') // strip HTML
      .replace(/\[([^\]]+)\]\(file:\/\/\/[^\)]+\)/g, '$1') // strip local file markdown links
      .replace(/\*\*([^*]+)\*\*/g, '$1') // strip bold markdown
      .replace(/\*([^*]+)\*/g, '$1') // strip italics
      .replace(/_/g, ' ') // replace underscores
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-US';
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  // Trigger audio response whenever the agent reply arrives
  useEffect(() => {
    if (history.length > prevHistoryLength.current) {
      const lastMessage = history[history.length - 1];
      if (lastMessage && lastMessage.role === 'assistant') {
        speakText(lastMessage.content);
        setShowWindow(true);
      }
    }
    prevHistoryLength.current = history.length;
  }, [history]);

  // Speech Recognition setup
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
      setShowWindow(false);
      setSpeechTranscript('');
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
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
      setSpeechTranscript(currentText);

      // Reset silence timer on every new transcription chunk
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }

      if (currentText) {
        silenceTimerRef.current = setTimeout(() => {
          rec.stop();
          sendMessageRef.current(currentText);
          setSpeechTranscript('');
        }, 1500); // Wait 1.5 seconds of silence before auto-submitting
      }
    };

    rec.onerror = (event: any) => {
      console.error('Voice Assistant speech error:', event.error);
      if (event.error === 'not-allowed') {
        setSpeechError('Microphone access denied.');
      } else if (event.error === 'no-speech') {
        // quiet timeout, no warning needed
      } else if (event.error === 'aborted') {
        // deliberate abort
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
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, []);

  const toggleAssistant = () => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    if (isLoading) return;

    if (!recognitionRef.current) {
      setSpeechError('Speech recognition is not supported in this browser.');
      return;
    }

    if (isListeningRef.current) {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      recognitionRef.current.stop();
      isListeningRef.current = false;
      setIsListening(false);
      setSpeechTranscript('');
    } else {
      try {
        setSpeechError(null);
        setShowWindow(false);
        isListeningRef.current = true;
        setIsListening(true);
        recognitionRef.current.start();
      } catch (err) {
        console.error('Failed to start voice assistant recognition:', err);
        isListeningRef.current = false;
        setIsListening(false);
        setSpeechTranscript('');
      }
    }
  };

  if (!speechSupported) return null;

  const lastResponse = history[history.length - 1];

  return (
    <>
      <style>{`
        @keyframes voicePulse {
          0% { transform: scale(1); opacity: 0.85; box-shadow: 0 0 0 0 rgba(168, 85, 247, 0.6); }
          70% { transform: scale(1.5); opacity: 0; box-shadow: 0 0 0 14px rgba(168, 85, 247, 0); }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes voiceOrbWave {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }
        @keyframes voiceSlideUp {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <div
        id="voice-assistant-container"
        style={{
          position: 'absolute',
          bottom: '24px',
          right: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          zIndex: 9995,
        }}
      >
        {/* Status Bubble */}
        {isListening && (
          <div
            style={{
              position: 'absolute',
              bottom: '72px',
              right: 0,
              padding: '8px 16px',
              borderRadius: '99px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: 'var(--danger)',
              fontSize: '0.8rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              animation: 'voiceSlideUp 0.2s ease-out',
              maxWidth: '320px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            🔴 {speechTranscript ? `Listening: "${speechTranscript}"` : 'Listening... speak now'}
          </div>
        )}

        {isLoading && (
          <div
            style={{
              position: 'absolute',
              bottom: '72px',
              right: 0,
              padding: '8px 16px',
              borderRadius: '99px',
              background: 'rgba(168, 85, 247, 0.15)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              color: '#c084fc',
              fontSize: '0.8rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              animation: 'voiceSlideUp 0.2s ease-out',
            }}
          >
            🔮 Processing...
          </div>
        )}

        {/* Speech / API Error Bubble */}
        {(speechError || error) && !isListening && !isLoading && (
          <div
            className="glass-panel"
            style={{
              position: 'absolute',
              bottom: '72px',
              right: 0,
              padding: '8px 16px',
              borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: 'var(--danger)',
              fontSize: '0.8rem',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              animation: 'voiceSlideUp 0.2s ease-out',
            }}
          >
            <span>⚠ {speechError || error}</span>
            <button
              onClick={() => setSpeechError(null)}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.9rem' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Response Card */}
        {showWindow && lastResponse && lastResponse.role === 'assistant' && !isListening && !isLoading && (
          <div
            className="glass-panel"
            style={{
              position: 'absolute',
              bottom: '72px',
              right: 0,
              width: '320px',
              maxHeight: '380px',
              borderRadius: '16px',
              padding: '16px',
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              animation: 'voiceSlideUp 0.25s ease-out forwards',
              zIndex: 9999,
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Voice Response 🎙️
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                {isSpeaking && (
                  <button
                    onClick={() => { window.speechSynthesis.cancel(); setIsSpeaking(false); }}
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)',
                      color: 'var(--danger)', fontSize: '0.7rem', padding: '2px 8px',
                      borderRadius: '4px', cursor: 'pointer',
                    }}
                  >
                    Mute 🔇
                  </button>
                )}
                <button
                  onClick={() => setShowWindow(false)}
                  style={{
                    background: 'none', border: 'none', color: 'var(--text-secondary)',
                    cursor: 'pointer', fontSize: '1rem',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.5, maxHeight: '240px', whiteSpace: 'pre-wrap' }}>
              {cleanAgentResponse(lastResponse.content)}
            </div>

            {lastToolsUsed.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px', borderTop: '1px solid var(--glass-border)', paddingTop: '8px' }}>
                {lastToolsUsed.map((tool, idx) => (
                  <span
                    key={idx}
                    style={{
                      background: 'rgba(168,85,247,0.12)', color: '#c084fc',
                      border: '1px solid rgba(168,85,247,0.25)',
                      borderRadius: '999px', fontSize: '0.65rem', fontWeight: 600,
                      padding: '2px 8px',
                    }}
                  >
                    ⚡ {tool}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Floating Orb Button */}
        <button
          onClick={toggleAssistant}
          title={isSpeaking ? 'Mute response' : 'Voice Assistant'}
          aria-label={isSpeaking ? 'Mute voice response' : 'Activate Voice Assistant'}
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: isSpeaking
              ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' // Green if speaking
              : isListening
                ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' // Red if listening
                : 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)', // Pulsing purple gradient
            border: 'none',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(168,85,247,0.4)',
            transition: 'all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            position: 'relative',
            animation: isListening ? 'voiceOrbWave 1s ease-in-out infinite' : 'none',
          }}
          onMouseEnter={e => {
            if (!isLoading) e.currentTarget.style.transform = 'scale(1.08)';
          }}
          onMouseLeave={e => {
            if (!isLoading) e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          {/* Active Listening Ripple Effects */}
          {isListening && (
            <>
              <span style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', border: '2px solid #ef4444', animation: 'voicePulse 1.8s infinite' }} />
              <span style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', border: '2px solid #ec4899', animation: 'voicePulse 1.8s 0.6s infinite' }} />
            </>
          )}

          {/* Icon */}
          <span style={{ fontSize: '1.5rem', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isSpeaking ? '🔊' : isListening ? '🎙️' : '🔮'}
          </span>
        </button>
      </div>
    </>
  );
};

export default VoiceAssistant;
