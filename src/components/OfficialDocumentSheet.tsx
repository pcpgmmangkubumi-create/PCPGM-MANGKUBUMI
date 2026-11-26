import React, { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { SchoolIdentity, UserProfile } from '../types/education';
import { resolveTitiMangsa } from '../lib/exporters';
import { updateRecord } from '../lib/firestoreHelpers';

interface OfficialDocumentSheetProps {
  school?: SchoolIdentity | null;
  teacher?: UserProfile | null;
  runningHeaderRight?: string;
  title: string;
  subtitle?: string;
  subjectLabel?: string;
  metadataPairs?: { label: string; value: string }[];
  accentColor?: 'navy' | 'emerald';
  includeSignatures?: boolean;
  showTitiMangsa?: boolean;
  children: React.ReactNode;
}

export const OfficialDocumentSheet: React.FC<OfficialDocumentSheetProps> = ({
  school,
  teacher,
  runningHeaderRight,
  title,
  subtitle,
  subjectLabel,
  metadataPairs = [],
  accentColor = 'navy',
  includeSignatures = true,
  showTitiMangsa = true,
  children,
}) => {
  const schoolName = school?.name || 'Satuan Pendidikan';
  const schoolAddr = [school?.address, school?.district, school?.regency, school?.province]
    .filter(Boolean)
    .join(', ');
  const teacherName = school?.teacherName || teacher?.displayName || '........................................';
  const teacherNip = school?.teacherNip || teacher?.nip || '-';
  const principalName = school?.principalName || '........................................';
  const resolvedTitiMangsa = resolveTitiMangsa(school);

  const [editingTitiMangsa, setEditingTitiMangsa] = useState(false);
  const [titiMangsaDraft, setTitiMangsaDraft] = useState(resolvedTitiMangsa);

  useEffect(() => {
    if (!editingTitiMangsa) {
      setTitiMangsaDraft(resolvedTitiMangsa);
    }
  }, [resolvedTitiMangsa, editingTitiMangsa]);

  const commitTitiMangsa = async () => {
    setEditingTitiMangsa(false);
    const cleaned = titiMangsaDraft.trim().slice(0, 120);
    if (school?.id && cleaned !== (school.titiMangsa || '').trim()) {
      await updateRecord('schools', school.id, { titiMangsa: cleaned });
    }
  };

  const dividerClass = accentColor === 'emerald' ? 'border-emerald-700' : 'border-[#1E3A8A]';

  return (
    <div className="bg-white text-slate-900 border border-slate-200 rounded-xl shadow-sm p-6 md:p-10 overflow-x-auto print-sheet">
      <div className="max-w-[920px] mx-auto space-y-6">
        {/* Running Header */}
        <div className="text-right text-[11px] text-slate-400 font-medium">
          {runningHeaderRight || `${schoolName}${subtitle ? ` | ${subtitle}` : ''}`}
        </div>

        {/* Kop Resmi & Judul */}
        <div className={`pb-3 border-b-2 ${dividerClass} text-center`}>
          <div className={`border-b ${dividerClass} pb-2.5 space-y-1.5`}>
            {school?.letterheadDataUrl ? (
              <img
                src={school.letterheadDataUrl}
                alt={`Kop Surat ${schoolName}`}
                className="w-full max-h-36 object-contain mx-auto"
              />
            ) : (
              <div className="flex items-center justify-center gap-4">
                {school?.agencyLogoDataUrl && (
                  <img
                    src={school.agencyLogoDataUrl}
                    alt="Logo Instansi"
                    className="h-14 w-14 object-contain shrink-0"
                  />
                )}
                <div className="space-y-0.5 flex-1">
                  <h2 className="text-base md:text-lg font-bold tracking-wide text-[#003380] uppercase">
                    {schoolName}
                  </h2>
                  {schoolAddr && (
                    <p className="text-[11px] text-slate-500">
                      {schoolAddr}
                    </p>
                  )}
                </div>
                {school?.logoDataUrl && (
                  <img
                    src={school.logoDataUrl}
                    alt="Logo Sekolah"
                    className="h-14 w-14 object-contain shrink-0"
                  />
                )}
              </div>
            )}
            <p className="text-xs md:text-sm font-bold text-slate-900 uppercase pt-1">{title}</p>
            {subtitle && <p className="text-xs font-medium text-slate-600">{subtitle}</p>}
          </div>
        </div>

        {/* Metadata Identitas */}
        {metadataPairs.length > 0 && (
          <div className="grid grid-cols-[150px_14px_1fr] gap-y-1 text-xs md:text-[13px] text-slate-800">
            {metadataPairs.map((pair, idx) => (
              <React.Fragment key={idx}>
                <span className="font-bold">{pair.label}</span>
                <span>:</span>
                <span>{pair.value || '-'}</span>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Isi Dokumen */}
        <div className="space-y-5">{children}</div>

        {/* Blok Pengesahan */}
        {includeSignatures && (
          <div className="grid grid-cols-2 gap-8 pt-8 text-xs md:text-[13px] text-slate-900">
            <div>
              <p>Mengetahui,</p>
              <p className="font-bold">Kepala {schoolName},</p>
              <div className="h-16" />
              <p className="font-bold underline">{principalName}</p>
              <p className="text-[11px] text-slate-600">NIP. {school?.principalNip || '-'}</p>
            </div>
            <div>
              {showTitiMangsa ? (
                editingTitiMangsa ? (
                  <input
                    type="text"
                    autoFocus
                    maxLength={120}
                    value={titiMangsaDraft}
                    onChange={(e) => setTitiMangsaDraft(e.target.value)}
                    onBlur={commitTitiMangsa}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitTitiMangsa();
                      } else if (e.key === 'Escape') {
                        setTitiMangsaDraft(resolvedTitiMangsa);
                        setEditingTitiMangsa(false);
                      }
                    }}
                    placeholder="Contoh: Tasikmalaya, .......................... 20...."
                    className="w-full max-w-[300px] px-2 py-0.5 border border-blue-400 rounded text-xs bg-blue-50/40 text-slate-900 focus:outline-none no-print"
                  />
                ) : (
                  <p
                    onClick={() => {
                      if (school?.id) {
                        setTitiMangsaDraft(school.titiMangsa || resolvedTitiMangsa);
                        setEditingTitiMangsa(true);
                      }
                    }}
                    title={school?.id ? 'Klik untuk edit titi mangsa (kota & tanggal)' : undefined}
                    className={
                      school?.id
                        ? 'group inline-flex items-center gap-1.5 cursor-pointer hover:text-blue-800 rounded px-1 -mx-1 hover:bg-blue-50/70 transition-colors'
                        : undefined
                    }
                  >
                    <span>{resolvedTitiMangsa}</span>
                    {school?.id && (
                      <Pencil className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 no-print shrink-0" />
                    )}
                  </p>
                )
              ) : (
                <p aria-hidden="true">&nbsp;</p>
              )}
              <p className="font-bold">
                {subjectLabel ? `Guru Mata Pelajaran ${subjectLabel},` : 'Guru Mata Pelajaran,'}
              </p>
              <div className="h-16 flex items-center">
                {teacher?.signatureDataUrl && (
                  <img
                    src={teacher.signatureDataUrl}
                    alt="Tanda tangan guru"
                    className="h-14 object-contain"
                  />
                )}
              </div>
              <p className="font-bold underline">{teacherName}</p>
              <p className="text-[11px] text-slate-600">NIP. {teacherNip}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
