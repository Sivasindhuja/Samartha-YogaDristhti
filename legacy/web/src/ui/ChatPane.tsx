import React, { useState } from 'react';
import axios from 'axios';
import "../ui/App.css";

export const ChatPane: React.FC<{ analysis: any | null }> = ({ analysis }) => {
  const [message, setMessage] = useState('How can I improve this pose?');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);

  async function send() {
    setLoading(true);
    try {
      // The server grounds the answer in the stored analysis + asana catalog,
      // so we only need to point at the analysis and ask the question.
      const payload: Record<string, unknown> = { user_prompt: message };
      if (analysis?.analysis_id) payload.analysis_id = analysis.analysis_id;
      if (analysis?.asana_name) payload.asana_name = analysis.asana_name;

      const resp = await axios.post('/api/chat', payload);
      setReply(resp.data.message);
    } catch (e: any) {
      setReply(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-container"> 
      <h3>Chat</h3>
      
      {/* Apply input class */}
      <textarea 
        className="chat-input" 
        value={message} 
        onChange={e => setMessage(e.target.value)} 
        rows={3} 
      />
      
      {/* Apply button container class */}
      <div className="chat-send-button"> 
        <button 
          onClick={send} 
          disabled={loading}
        >
          {loading ? 'Thinking…' : 'Send'}
        </button>
      </div>
      
      {/* Apply reply box class */}
      {reply && (
        <div className="chat-reply-box"> 
          {reply}
        </div>
      )}
    </div>
  );
};
