import React, { useState } from 'react';
import { UploadPane } from './UploadPane';
import { ChatPane } from './ChatPane';

const sectionStyle: React.CSSProperties = { marginTop: 16 };

export const App: React.FC = () => {
  const [analysis, setAnalysis] = useState<any | null>(null);

  const coaching = analysis?.coaching;
  const corrections: any[] = coaching?.corrections ?? [];

  const renderList = (title: string, items?: string[]) =>
    items && items.length > 0 ? (
      <div style={sectionStyle}>
        <h4>{title}</h4>
        <ul>
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: 24, fontFamily: 'Inter, system-ui, Arial' }}>
      <h1>Asana Coach</h1>
      <p style={{ color: '#555' }}>Upload a JPG image to analyze your pose and chat for tips.</p>
      <UploadPane onResult={setAnalysis} />

      {analysis && (
        <div style={{ marginTop: 24 }}>
          <h3>Result</h3>
          <p style={{ marginBottom: 8 }}>
            <strong>{analysis.asana_name}</strong>
            {' — confidence '}
            {Math.round((analysis.score ?? 0) * 100)}%
          </p>

          {coaching?.status === 'ok' ? (
            <>
              {coaching.summary && <p>{coaching.summary}</p>}

              {corrections.length > 0 && (
                <div style={sectionStyle}>
                  <h4>What to adjust</h4>
                  <ul>
                    {corrections.map((correction, index) => (
                      <li key={index}>
                        <strong>{correction.area}</strong>
                        {correction.issue ? `: ${correction.issue}` : ''}
                        {correction.fix ? ` → ${correction.fix}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {renderList('Working well', coaching.working_well)}
              {renderList('Safety notes', coaching.safety)}
              {renderList('Caveats', coaching.caveats)}

              {coaching.confidence && (
                <p style={{ color: '#555', marginTop: 16 }}>
                  Coaching confidence: {coaching.confidence}
                </p>
              )}
            </>
          ) : (
            <p style={{ color: '#a15c00' }}>
              AI coaching unavailable
              {coaching?.error ? `: ${coaching.error}` : ''}. Showing rule-based feedback below.
            </p>
          )}

          {renderList('Rule-based suggestions', analysis.suggestions)}

          <details style={{ marginTop: 16 }}>
            <summary>Raw measurements</summary>
            <pre style={{ background: '#f6f8fa', padding: 12, overflow: 'auto' }}>
              {JSON.stringify(analysis, null, 2)}
            </pre>
          </details>

          {coaching?.model && (
            <p style={{ color: '#777', fontSize: 12 }}>Coaching model: {coaching.model}</p>
          )}
        </div>
      )}

      <ChatPane analysis={analysis} />
    </div>
  );
};
