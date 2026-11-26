import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  CLASS_OPTIONS_BY_LEVEL,
  EDUCATION_LEVELS,
  InstitutionTrack,
  detectInstitutionTrack,
  getOfficialJpStandard,
  pickAutoSubjectForContext,
} from '../lib/curriculumData';
import { createRecord } from '../lib/firestoreHelpers';
import { EducationLevel } from '../types/education';
import { OfficialSubjectField } from './OfficialSubjectField';

export const GlobalModals: React.FC = () => {
  const {
    user,
    activeSchool,
    curricula,
    textbooks,
    notify,
    setActiveWorkspaceId,
    setActivePage,
    isCreateWorkspaceOpen,
    closeCreateWorkspaceModal,
    isResetModalOpen,
    closeResetModal,
    resetting,
    resetAllDataExceptProfileAndSchool,
  } = useApp();

  const activeCurr = curricula.find((c) => c.isActive)?.name || 'Kurikulum Merdeka';

  const initialLvl = (activeSchool?.level || 'SMP/MTs') as EducationLevel;
  const initialGrade = CLASS_OPTIONS_BY_LEVEL[initialLvl]?.[0]?.grade || 'Kelas VII';
  const initialTrack: InstitutionTrack = detectInstitutionTrack({
    schoolName: activeSchool?.name,
    level: initialLvl,
    grade: initialGrade,
    subject: activeSchool?.subject,
  });
  const initialSubj = pickAutoSubjectForContext({
    currentSubject: activeSchool?.subject,
    level: initialLvl,
    grade: initialGrade,
    curriculum: activeCurr,
    track: initialTrack,
    schoolName: activeSchool?.name,
  });

  const [track, setTrack] = useState<InstitutionTrack>(initialTrack);
  const [wsForm, setWsForm] = useState({
    level: initialLvl,
    grade: initialGrade,
    customGrade: '',
    phase: CLASS_OPTIONS_BY_LEVEL[initialLvl]?.[0]?.phase || 'Fase D',
    subject: initialSubj,
    curriculum: activeCurr,
    academicYear: activeSchool?.academicYear || '2026/2027',
    semester: activeSchool?.semester || 'Semester 1',
    jpPerWeek: getOfficialJpStandard({
      level: initialLvl,
      grade: initialGrade,
      subject: initialSubj,
      curriculum: activeCurr,
      schoolName: activeSchool?.name,
      institutionTrack: initialTrack,
    }).jpPerWeek,
    primaryBookId: textbooks[0]?.id || '',
  });
  const [creatingWs, setCreatingWs] = useState(false);

  const officialJp = getOfficialJpStandard({
    level: wsForm.level,
    grade: wsForm.customGrade.trim() || wsForm.grade,
    subject: wsForm.subject,
    curriculum: wsForm.curriculum,
    schoolName: activeSchool?.name,
    institutionTrack: track,
  });

  useEffect(() => {
    if (isCreateWorkspaceOpen) {
      const lvl = (activeSchool?.level || 'SMP/MTs') as EducationLevel;
      const firstGrade = CLASS_OPTIONS_BY_LEVEL[lvl]?.[0];
      const gradeVal = firstGrade?.grade || 'Kelas VII';
      const detectedTrack = detectInstitutionTrack({
        schoolName: activeSchool?.name,
        level: lvl,
        grade: gradeVal,
        subject: activeSchool?.subject,
      });
      const subjVal = pickAutoSubjectForContext({
        currentSubject: activeSchool?.subject,
        level: lvl,
        grade: gradeVal,
        curriculum: activeCurr,
        track: detectedTrack,
        schoolName: activeSchool?.name,
      });
      const std = getOfficialJpStandard({
        level: lvl,
        grade: gradeVal,
        subject: subjVal,
        curriculum: activeCurr,
        schoolName: activeSchool?.name,
        institutionTrack: detectedTrack,
      });
      setTrack(detectedTrack);
      setWsForm({
        level: lvl,
        grade: gradeVal,
        customGrade: '',
        phase: firstGrade?.phase || 'Fase D',
        subject: subjVal,
        curriculum: activeCurr,
        academicYear: activeSchool?.academicYear || '2026/2027',
        semester: activeSchool?.semester || 'Semester 1',
        jpPerWeek: std.jpPerWeek,
        primaryBookId: textbooks[0]?.id || '',
      });
    }
  }, [isCreateWorkspaceOpen, activeSchool, activeCurr, textbooks]);

  const classOptions = CLASS_OPTIONS_BY_LEVEL[wsForm.level] || [];

  const handleCreateWorkspace = async (goToPage?: 'ai-auto-curriculum' | 'generate-all') => {
    if (!user) return;
    const finalGrade = (wsForm.customGrade.trim() || wsForm.grade).slice(0, 30);
    const finalSubject = wsForm.subject.trim().slice(0, 120);
    if (!finalSubject) {
      notify('Nama mata pelajaran wajib diisi.', 'error');
      return;
    }
    if (!finalGrade) {
      notify('Kelas wajib diisi.', 'error');
      return;
    }

    setCreatingWs(true);
    try {
      const wsId = await createRecord('workspaces', {
        ownerId: user.uid,
        academicYear: wsForm.academicYear.trim().slice(0, 30) || '2026/2027',
        semester: wsForm.semester.slice(0, 20) || 'Semester 1',
        level: wsForm.level,
        grade: finalGrade,
        phase: wsForm.phase.trim().slice(0, 30),
        subject: finalSubject,
        curriculum: wsForm.curriculum.slice(0, 100) || 'Kurikulum Merdeka',
        jpPerWeek: Number(wsForm.jpPerWeek || 4),
        primaryBookId: wsForm.primaryBookId || '',
      });
      setActiveWorkspaceId(wsId);
      closeCreateWorkspaceModal();
      notify(`Administrasi baru "${finalSubject} · ${finalGrade}" berhasil dibuat dan diaktifkan.`, 'success');
      if (goToPage) {
        setActivePage(goToPage);
      }
    } catch (err: any) {
      notify(err?.message || 'Gagal membuat administrasi baru.', 'error');
    } finally {
      setCreatingWs(false);
    }
  };

  return (
    <>
      {/* Modal Tambah Administrasi Baru */}
      {isCreateWorkspaceOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 no-print"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-ws-title"
        >
          <div className="w-full max-w-2xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <div>
                <h2 id="create-ws-title" className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  Buat Administrasi Baru (Kelas & Mata Pelajaran)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Mata pelajaran & jam tatap muka terisi otomatis sesuai Permendikbudristek 12/2024 atau KMA 450/2024 & 183/2019.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreateWorkspaceModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Jenjang Pendidikan
                  </label>
                  <select
                    value={wsForm.level}
                    onChange={(e) => {
                      const lvl = e.target.value as EducationLevel;
                      const first = CLASS_OPTIONS_BY_LEVEL[lvl]?.[0];
                      const nextGrade = first?.grade || '';
                      const nextSubject = pickAutoSubjectForContext({
                        currentSubject: wsForm.subject,
                        level: lvl,
                        grade: nextGrade,
                        curriculum: wsForm.curriculum,
                        track,
                        schoolName: activeSchool?.name,
                      });
                      const std = getOfficialJpStandard({
                        level: lvl,
                        grade: nextGrade,
                        subject: nextSubject,
                        curriculum: wsForm.curriculum,
                        schoolName: activeSchool?.name,
                        institutionTrack: track,
                      });
                      setWsForm({
                        ...wsForm,
                        level: lvl,
                        grade: nextGrade,
                        phase: first?.phase || '',
                        subject: nextSubject,
                        jpPerWeek: std.jpPerWeek,
                      });
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  >
                    {EDUCATION_LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Tingkat Kelas
                  </label>
                  <select
                    value={wsForm.grade}
                    onChange={(e) => {
                      const nextGrade = e.target.value;
                      const found = classOptions.find((c) => c.grade === nextGrade);
                      const nextSubject = pickAutoSubjectForContext({
                        currentSubject: wsForm.subject,
                        level: wsForm.level,
                        grade: nextGrade,
                        curriculum: wsForm.curriculum,
                        track,
                        schoolName: activeSchool?.name,
                      });
                      const std = getOfficialJpStandard({
                        level: wsForm.level,
                        grade: nextGrade,
                        subject: nextSubject,
                        curriculum: wsForm.curriculum,
                        schoolName: activeSchool?.name,
                        institutionTrack: track,
                      });
                      setWsForm({
                        ...wsForm,
                        grade: nextGrade,
                        phase: found?.phase || wsForm.phase,
                        subject: nextSubject,
                        jpPerWeek: std.jpPerWeek,
                      });
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  >
                    {classOptions.map((c) => (
                      <option key={c.grade} value={c.grade}>
                        {c.grade} ({c.phase})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <OfficialSubjectField
                    label="Mata Pelajaran (Otomatis Sesuai Peraturan)"
                    subject={wsForm.subject}
                    level={wsForm.level}
                    grade={wsForm.customGrade.trim() || wsForm.grade}
                    curriculum={wsForm.curriculum}
                    schoolName={activeSchool?.name}
                    track={track}
                    onTrackChange={(nextTrack) => {
                      setTrack(nextTrack);
                      const nextSubject = pickAutoSubjectForContext({
                        currentSubject: wsForm.subject,
                        level: wsForm.level,
                        grade: wsForm.customGrade.trim() || wsForm.grade,
                        curriculum: wsForm.curriculum,
                        track: nextTrack,
                        schoolName: activeSchool?.name,
                      });
                      const std = getOfficialJpStandard({
                        level: wsForm.level,
                        grade: wsForm.customGrade.trim() || wsForm.grade,
                        subject: nextSubject,
                        curriculum: wsForm.curriculum,
                        schoolName: activeSchool?.name,
                        institutionTrack: nextTrack,
                      });
                      setWsForm({ ...wsForm, subject: nextSubject, jpPerWeek: std.jpPerWeek });
                    }}
                    onSubjectChange={(nextSubj) => {
                      const std = getOfficialJpStandard({
                        level: wsForm.level,
                        grade: wsForm.customGrade.trim() || wsForm.grade,
                        subject: nextSubj,
                        curriculum: wsForm.curriculum,
                        schoolName: activeSchool?.name,
                        institutionTrack: track,
                      });
                      setWsForm({ ...wsForm, subject: nextSubj, jpPerWeek: std.jpPerWeek });
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Nama Rombel / Kelas Spesifik (Opsional)
                  </label>
                  <input
                    type="text"
                    maxLength={30}
                    value={wsForm.customGrade}
                    onChange={(e) => setWsForm({ ...wsForm, customGrade: e.target.value })}
                    placeholder={`Kosongkan untuk pakai "${wsForm.grade}" (mis. VII-A)`}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Fase
                  </label>
                  <input
                    type="text"
                    maxLength={30}
                    value={wsForm.phase}
                    onChange={(e) => setWsForm({ ...wsForm, phase: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Kurikulum
                  </label>
                  <select
                    value={wsForm.curriculum}
                    onChange={(e) => {
                      const nextCurr = e.target.value;
                      const nextSubject = pickAutoSubjectForContext({
                        currentSubject: wsForm.subject,
                        level: wsForm.level,
                        grade: wsForm.customGrade.trim() || wsForm.grade,
                        curriculum: nextCurr,
                        track,
                        schoolName: activeSchool?.name,
                      });
                      const std = getOfficialJpStandard({
                        level: wsForm.level,
                        grade: wsForm.customGrade.trim() || wsForm.grade,
                        subject: nextSubject,
                        curriculum: nextCurr,
                        schoolName: activeSchool?.name,
                        institutionTrack: track,
                      });
                      setWsForm({
                        ...wsForm,
                        curriculum: nextCurr,
                        subject: nextSubject,
                        jpPerWeek: std.jpPerWeek,
                      });
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  >
                    {curricula.length > 0 ? (
                      curricula.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))
                    ) : (
                      <option value="Kurikulum Merdeka">Kurikulum Merdeka</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Tahun Ajaran
                  </label>
                  <input
                    type="text"
                    maxLength={30}
                    value={wsForm.academicYear}
                    onChange={(e) => setWsForm({ ...wsForm, academicYear: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Semester Fokus
                  </label>
                  <select
                    value={wsForm.semester}
                    onChange={(e) => setWsForm({ ...wsForm, semester: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  >
                    <option value="Semester 1">Semester 1 (Ganjil)</option>
                    <option value="Semester 2">Semester 2 (Genap)</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Alokasi JP Tatap Muka / Minggu
                    </label>
                    {wsForm.jpPerWeek !== officialJp.jpPerWeek && (
                      <button
                        type="button"
                        onClick={() => setWsForm({ ...wsForm, jpPerWeek: officialJp.jpPerWeek })}
                        className="text-[11px] font-semibold text-blue-700 dark:text-sky-400 hover:underline"
                      >
                        Sesuaikan ({officialJp.jpPerWeek} JP)
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={40}
                    value={wsForm.jpPerWeek}
                    onChange={(e) => setWsForm({ ...wsForm, jpPerWeek: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono tabular-nums"
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                    {officialJp.regulationRef}: <strong className="font-semibold text-slate-700 dark:text-slate-200">{officialJp.jpPerWeek} JP</strong> tatap muka/mg (@{officialJp.minutesPerJp} mnt)
                    {officialJp.p5JpPerWeek > 0 ? ` + ${officialJp.p5JpPerWeek} JP P5/mg` : ''} · {officialJp.effectiveWeeksPerYear} pekan efektif ({wsForm.jpPerWeek * officialJp.effectiveWeeksPerYear} JP/thn)
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Buku Referensi Utama
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        closeCreateWorkspaceModal();
                        setActivePage('database-buku');
                      }}
                      className="text-[11px] font-semibold text-blue-700 dark:text-sky-400 hover:underline"
                    >
                      + Kelola Link / Data Buku
                    </button>
                  </div>
                  <select
                    value={wsForm.primaryBookId}
                    onChange={(e) => setWsForm({ ...wsForm, primaryBookId: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  >
                    <option value="">Otomatis (Rekomendasi Kurikulum)</option>
                    {textbooks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title}{b.sourceUrl ? ' (Link Tersimpan)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex flex-wrap items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={creatingWs}
                onClick={closeCreateWorkspaceModal}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={creatingWs}
                onClick={() => handleCreateWorkspace()}
                className="px-4 py-2 rounded-lg border border-blue-700 text-blue-700 dark:text-sky-400 dark:border-sky-500 hover:bg-blue-50 dark:hover:bg-sky-950/30 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {creatingWs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>Simpan Administrasi</span>
              </button>
              <button
                type="button"
                disabled={creatingWs}
                onClick={() => handleCreateWorkspace('generate-all')}
                className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {creatingWs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>Simpan & Generate Perangkat</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Reset Semua Data */}
      {isResetModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 no-print"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-modal-title"
        >
          <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900 shadow-xl overflow-hidden">
            <div className="px-6 py-4 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div>
                  <h2 id="reset-modal-title" className="font-display text-base font-bold text-red-900 dark:text-red-100">
                    Reset Semua Data Administrasi?
                  </h2>
                  <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">
                    Tindakan ini menghapus data operasional secara permanen.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={resetting}
                onClick={closeResetModal}
                className="p-1 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-3 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              <div className="p-3 rounded-lg bg-red-50/70 dark:bg-red-950/20 border border-red-100 dark:border-red-900/60 space-y-1">
                <p className="font-semibold text-red-800 dark:text-red-200">Data yang akan dihapus:</p>
                <p>
                  Seluruh administrasi/ruang kerja mapel, dokumen CP/TP/ATP, PROTA, PROSEM, Modul Ajar, Bahan Ajar, LKPD, PowerPoint, Bank Soal, Kuis & Jawaban, Kelas & Siswa, Nilai, Jurnal Mengajar, Buku Referensi, Kalender, dan Pengaturan Kurikulum.
                </p>
              </div>
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 space-y-1">
                <p className="font-semibold text-emerald-800 dark:text-emerald-200">Data yang TETAP AMAN & dipertahankan:</p>
                <p>
                  Profil Guru (nama, NIP, jabatan, tanda tangan digital) serta Identitas Sekolah (nama sekolah, alamat, kepala sekolah, kop surat, logo, dan titi mangsa).
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={resetting}
                onClick={closeResetModal}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={resetting}
                onClick={resetAllDataExceptProfileAndSchool}
                className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-2"
              >
                {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{resetting ? 'Sedang Mereset Data...' : 'Ya, Reset Semua Data'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
