import React, { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import {
  InstitutionTrack,
  OfficialSubjectEntry,
  findMatchingOfficialSubject,
  getOfficialSubjectsForContext,
  pickAutoSubjectForContext,
  resolveSubjectRegulationContext,
} from '../lib/curriculumData';

interface OfficialSubjectFieldProps {
  label?: string;
  subject: string;
  level: string;
  grade?: string;
  curriculum?: string;
  schoolName?: string;
  track: InstitutionTrack;
  onTrackChange?: (nextTrack: InstitutionTrack) => void;
  onSubjectChange: (nextSubject: string) => void;
  showTrackToggle?: boolean;
  showScopeNote?: boolean;
  compact?: boolean;
  required?: boolean;
}

export const OfficialSubjectField: React.FC<OfficialSubjectFieldProps> = ({
  label = 'Mata Pelajaran',
  subject,
  level,
  grade,
  curriculum,
  schoolName,
  track,
  onTrackChange,
  onSubjectChange,
  showTrackToggle = true,
  showScopeNote = true,
  compact = false,
  required = false,
}) => {
  const candidates = useMemo(
    () =>
      getOfficialSubjectsForContext({
        level,
        grade,
        curriculum,
        track,
        schoolName,
      }),
    [level, grade, curriculum, track, schoolName]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, OfficialSubjectEntry[]>();
    for (const item of candidates) {
      const list = map.get(item.category) || [];
      list.push(item);
      map.set(item.category, list);
    }
    return Array.from(map.entries());
  }, [candidates]);

  const matchedEntry = useMemo(
    () => findMatchingOfficialSubject(subject, candidates),
    [subject, candidates]
  );

  const regCtx = useMemo(
    () =>
      resolveSubjectRegulationContext({
        level,
        grade,
        curriculum,
        subject,
        schoolName,
        institutionTrack: track,
      }),
    [level, grade, curriculum, subject, schoolName, track]
  );

  const selectValue = matchedEntry ? matchedEntry.name : '__custom__';

  const handleAutoPick = () => {
    const best = pickAutoSubjectForContext({
      currentSubject: subject,
      level,
      grade,
      curriculum,
      track,
      schoolName,
    });
    onSubjectChange(best);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
          {label}
        </label>
        <div className="flex items-center gap-2">
          {!matchedEntry && candidates.length > 0 && (
            <button
              type="button"
              onClick={handleAutoPick}
              className="text-[11px] font-semibold text-blue-700 dark:text-sky-400 hover:underline inline-flex items-center gap-1 whitespace-nowrap"
            >
              <Sparkles className="w-3 h-3" />
              <span>Isi Otomatis Resmi</span>
            </button>
          )}
        </div>
      </div>

      {showTrackToggle && onTrackChange && (
        <div
          className="inline-flex w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/80 p-0.5"
          role="group"
          aria-label="Jenis Satuan Pendidikan"
        >
          <button
            type="button"
            onClick={() => onTrackChange('umum')}
            className={`flex-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
              track === 'umum'
                ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-sky-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Sekolah Umum (Permendikbud)
          </button>
          <button
            type="button"
            onClick={() => onTrackChange('madrasah')}
            className={`flex-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
              track === 'madrasah'
                ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Madrasah (KMA)
          </button>
        </div>
      )}

      <div className="space-y-1.5">
        <select
          value={selectValue}
          onChange={(e) => {
            if (e.target.value !== '__custom__') {
              onSubjectChange(e.target.value);
            }
          }}
          aria-label={`Pilih ${label} Resmi`}
          className={`w-full px-3 ${compact ? 'py-1.5 text-xs' : 'py-2 text-sm'} rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100`}
        >
          {grouped.map(([category, items]) => (
            <optgroup key={category} label={category}>
              {items.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </optgroup>
          ))}
          <option value="__custom__">Lainnya / Ketik Manual di Bawah...</option>
        </select>

        <input
          type="text"
          required={required}
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          placeholder="Atau ketik nama mata pelajaran / muatan lokal..."
          className={`w-full px-3 ${compact ? 'py-1.5 text-xs' : 'py-2 text-sm'} rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100`}
        />
      </div>

      {showScopeNote && (
        <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-700 dark:text-slate-200">{regCtx.regulationTitle}</span>
          {' · '}
          {regCtx.scopeSummary}
        </p>
      )}
    </div>
  );
};
