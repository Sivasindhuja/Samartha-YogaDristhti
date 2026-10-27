export type CoachingStatus = 'ok' | 'skipped' | 'error';

export interface CoachingCorrection {
  area: string;
  issue: string;
  metric?: string;
  measured?: number | null;
  target?: string;
  fix: string;
}

export interface Coaching {
  status: CoachingStatus;
  model: string | null;
  summary: string;
  corrections: CoachingCorrection[];
  working_well: string[];
  safety: string[];
  caveats: string[];
  confidence: 'low' | 'medium' | 'high';
  error?: string;
  generated_at: Date;
}
