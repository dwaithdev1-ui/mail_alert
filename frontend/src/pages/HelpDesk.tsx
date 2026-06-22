import React, { useState } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const HelpDesk: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = { role: 'user' as const, content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    setInput('');
    try {
        const token = localStorage.getItem('auth_token');
        const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5001';
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        const resp = await fetch(`${apiBase}/api/agent/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            message: userMsg.content,
            history: messages.map(m => ({ role: m.role, content: m.content })),
          }),
        });
      const data = await resp.json();
      if (data.success !== false && data.reply) {
        const assistantMsg = { role: 'assistant' as const, content: data.reply };
        setMessages(prev => [...prev, assistantMsg]);
      } else {
        const errMsg = { role: 'assistant' as const, content: data.error || 'Error from assistant' };
        setMessages(prev => [...prev, errMsg]);
      }
    } catch (e) {
      const errMsg = { role: 'assistant' as const, content: 'Network error' };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <section className="help-panel glass-panel" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ color: 'var(--accent-primary)', marginBottom: '1rem' }}>AI Help Desk Assistant</h2>
      <div className="chat-window" style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '1rem', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', padding: '1rem' }}>
        {messages.map((msg, idx) => (
          <div key={idx} style={{ textAlign: msg.role === 'user' ? 'right' : 'left', margin: '0.5rem 0' }}>
            <span style={{ display: 'inline-block', background: msg.role === 'user' ? 'var(--accent-primary)' : 'var(--bg-secondary)', color: '#fff', borderRadius: '4px', padding: '0.5rem 0.75rem' }}>
              {msg.content}
            </span>
          </div>
        ))}
        {loading && <div style={{ textAlign: 'left', margin: '0.5rem 0' }}><em>Assistant is typing...</em></div>}
      </div>
      <input
        type="text"
        placeholder="Ask a question…"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={loading}
        style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}
      />
    </section>
  );
};

export default HelpDesk;
