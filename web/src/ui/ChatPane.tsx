import React, { useState } from 'react';
import axios from 'axios';

export const ChatPane: React.FC<{ analysis: any | null }> = ({ analysis }) => {
  const [message, setMessage] = useState('How can I improve this pose?');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);

  async function send() {
    setLoading(true);
    try {
      const payload = analysis ? {
        asana_name: analysis.asana_name,
        benefits: [],
        precautions: [],
        alignment: [],
        mistakes: [],
        quotes: [],
        user_prompt: message,
      } : { user_prompt: message };
      const resp = await axios.post('/api/chat', payload);
      setReply(resp.data.message);
    } catch (e: any) {
      setReply(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 32 }}>
      <h3>Chat</h3>
      <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} style={{ width: '100%' }} />
      <div>
        <button onClick={send} disabled={loading}>{loading ? 'Thinking…' : 'Send'}</button>
      </div>
      {reply && (
        <div style={{ marginTop: 12, background: '#f6f8fa', padding: 12, whiteSpace: 'pre-wrap' }}>{reply}</div>
      )}
    </div>
  );
};
