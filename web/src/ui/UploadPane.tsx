import React, { useState } from 'react';
import axios from 'axios';

interface Props { onResult: (data: any) => void }

export const UploadPane: React.FC<Props> = ({ onResult }) => {
  const [file, setFile] = useState<File | null>(null);
  const [age, setAge] = useState<number>(30);
  const [flexibility, setFlexibility] = useState<'low' | 'medium' | 'high'>('medium');
  const [goal, setGoal] = useState<string>('alignment');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('age', String(age));
      form.append('flexibility', flexibility);
      form.append('goal', goal);
      const resp = await axios.post('/api/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      onResult(resp.data);
    } catch (e: any) {
      alert(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, marginTop: 16 }}>
      <input accept="image/jpeg" type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <label>Age <input type="number" value={age} onChange={e => setAge(parseInt(e.target.value, 10))} /></label>
      <label>Flexibility
        <select value={flexibility} onChange={e => setFlexibility(e.target.value as any)}>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>
      </label>
      <label>Goal <input value={goal} onChange={e => setGoal(e.target.value)} /></label>
      <button disabled={!file || loading}>{loading ? 'Analyzing…' : 'Upload & Analyze'}</button>
    </form>
  );
};
