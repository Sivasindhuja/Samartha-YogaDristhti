import React, { useState } from 'react';
import { UploadPane } from './UploadPane';
import { ChatPane } from './ChatPane';

export const App: React.FC = () => {
  const [analysis, setAnalysis] = useState<any | null>(null);

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: 24, fontFamily: 'Inter, system-ui, Arial' }}>
      <h1>Asana Coach</h1>
      <p style={{ color: '#555' }}>Upload a JPG image to analyze your pose and chat for tips.</p>
      <UploadPane onResult={setAnalysis} />
      {analysis && (
        <div style={{ marginTop: 24 }}>
          <h3>Result</h3>
          <pre style={{ background: '#f6f8fa', padding: 12, overflow: 'auto' }}>{JSON.stringify(analysis, null, 2)}</pre>
        </div>
      )}
      <ChatPane analysis={analysis} />
    </div>
  );
};
