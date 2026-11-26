import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Upload,
  Download,
  FileSpreadsheet,
  Sparkles,
  Loader2,
  CheckCircle2,
  Copy,
  Archive,
  FileText,
  Printer,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { createRecord, updateRecord, deleteRecord } from '../lib/firestoreHelpers';
import { postAuthedJson } from '../lib/apiClient';
import {
  exportDocumentDocx,
  exportDocumentPdf,
  exportTableXlsx,
  parseStudentsExcel,
  PrintableDocPayload,
} from '../lib/exporters';
import { EDUCATION_LEVELS } from '../lib/curriculumData';
import { OfficialDocumentSheet } from './OfficialDocumentSheet';

export const ClassGradeJournalView: React.FC<{
  mode: 'kelas-siswa' | 'penilaian' | 'analisis-hasil' | 'remedial' | 'pengayaan' | 'jurnal-mengajar' | 'laporan' | 'arsip-dokumen';
}> = ({ mode }) => {
  const {
    user,
    profile,
    aiSettings,
    activeSchool,
    workspaces,
    activeWorkspace,
    classes,
    students,
    grades,
    journals,
    prosemItems,
    documents,
    notify,
  } = useApp();

  // Class & Student state
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [confirmDeleteClassId, setConfirmDeleteClassId] = useState<string | null>(null);
  const [confirmDeleteDocId, setConfirmDeleteDocId] = useState<string | null>(null);
  const activeClassId = selectedClassId || classes[0]?.id || '';
  const classStudents = students.filter((s) => s.classId === activeClassId);
  const [newClass, setNewClass] = useState({ name: '', level: activeSchool?.level || 'SMP/MTs', grade: 'Kelas VII', academicYear: activeSchool?.academicYear || '2026/2027' });
  const [newStudent, setNewStudent] = useState({ fullName: '', nis: '', nisn: '', gender: 'L' as 'L' | 'P' | '-' });

  // Gradebook state
  const [kkm, setKkm] = useState<number>(75);
  const [gradeForm, setGradeForm] = useState({
    studentId: '',
    category: 'formatif',
    title: 'Tugas Pertemuan 1',
    score: 85,
    maxScore: 100,
    weight: 25,
  });

  // Remedial / Pengayaan state
  const [aiLoading, setAiLoading] = useState(false);

  // Journal state
  const [journalForm, setJournalForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    classId: '',
    meetingNumber: 1,
    prosemItemId: '',
    topic: '',
    activities: '',
    presentCount: 30,
    absentCount: 0,
    absentStudents: '',
    teacherNotes: '',
    executionStatus: 'selesai' as 'selesai' | 'berlangsung' | 'ditunda' | 'penyesuaian',
  });
  const [pendingProsemPrompt, setPendingProsemPrompt] = useState<{ prosemId: string; title: string } | null>(null);

  // Archive filters
  const [searchQuery, setSearchQuery] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('all');

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newClass.name.trim()) return;
    const id = await createRecord('classes', {
      ownerId: user.uid,
      name: newClass.name.trim(),
      level: newClass.level,
      grade: newClass.grade,
      academicYear: newClass.academicYear,
      homeroomTeacher: profile?.displayName || '',
    });
    setSelectedClassId(id);
    setNewClass((p) => ({ ...p, name: '' }));
    notify('Kelas baru berhasil ditambahkan.', 'success');
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeClassId || !newStudent.fullName.trim()) return;
    await createRecord('students', {
      ownerId: user.uid,
      classId: activeClassId,
      fullName: newStudent.fullName.trim(),
      nis: newStudent.nis.trim(),
      nisn: newStudent.nisn.trim(),
      gender: newStudent.gender,
      status: 'active',
    });
    setNewStudent({ fullName: '', nis: '', nisn: '', gender: 'L' });
    notify('Peserta didik ditambahkan.', 'success');
  };

  const handleImportExcel = async (file: File | undefined) => {
    if (!file || !user || !activeClassId) {
      notify('Pilih kelas terlebih dahulu sebelum impor data siswa.', 'error');
      return;
    }
    try {
      const parsed = await parseStudentsExcel(file);
      for (const s of parsed) {
        await createRecord('students', {
          ownerId: user.uid,
          classId: activeClassId,
          fullName: s.fullName,
          nis: s.nis,
          nisn: s.nisn,
          gender: s.gender,
          status: 'active',
        });
      }
      notify(`${parsed.length} data siswa berhasil diimpor dari Excel.`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Gagal membaca file Excel siswa.', 'error');
    }
  };

  const handleAddGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeClassId) return;
    const stu = students.find((s) => s.id === (gradeForm.studentId || classStudents[0]?.id));
    if (!stu?.id) {
      notify('Tambahkan atau pilih siswa terlebih dahulu.', 'error');
      return;
    }
    await createRecord('grades', {
      ownerId: user.uid,
      workspaceId: activeWorkspace?.id || '',
      classId: activeClassId,
      studentId: stu.id,
      studentName: stu.fullName,
      category: gradeForm.category,
      title: gradeForm.title,
      score: Number(gradeForm.score),
      maxScore: Number(gradeForm.maxScore),
      weight: Number(gradeForm.weight),
      kkm,
    });
    notify('Nilai berhasil dicatat.', 'success');
  };

  // Learning analytics computation
  const normalizedGrades = grades.map((g) => ({
    ...g,
    pct: g.maxScore > 0 ? Math.round((g.score / g.maxScore) * 100) : 0,
  }));
  const avgScore =
    normalizedGrades.length > 0
      ? Math.round(normalizedGrades.reduce((a, b) => a + b.pct, 0) / normalizedGrades.length)
      : 0;
  const maxScoreVal = normalizedGrades.length > 0 ? Math.max(...normalizedGrades.map((g) => g.pct)) : 0;
  const minScoreVal = normalizedGrades.length > 0 ? Math.min(...normalizedGrades.map((g) => g.pct)) : 0;
  const passedCount = normalizedGrades.filter((g) => g.pct >= kkm).length;
  const failedCount = normalizedGrades.length - passedCount;
  const masteryRate = normalizedGrades.length > 0 ? Math.round((passedCount / normalizedGrades.length) * 100) : 0;

  const remedialStudents = Array.from(
    new Set(normalizedGrades.filter((g) => g.pct < kkm).map((g) => g.studentName))
  );
  const enrichmentStudents = Array.from(
    new Set(normalizedGrades.filter((g) => g.pct >= kkm).map((g) => g.studentName))
  );

  const handleGenerateRemedialOrEnrichment = async (targetMode: 'remedial' | 'pengayaan' | 'analisis') => {
    if (!user || !activeWorkspace?.id) {
      notify('Pilih ruang kerja mata pelajaran terlebih dahulu.', 'error');
      return;
    }
    setAiLoading(true);
    try {
      const targetList = targetMode === 'remedial' ? remedialStudents : enrichmentStudents;
      const res = await postAuthedJson<any>('/api/ai/remedial-enrichment', {
        mode: targetMode,
        workspace: activeWorkspace,
        statsSummary: `Rata-rata ${avgScore}, Tertinggi ${maxScoreVal}, Terendah ${minScoreVal}, Ketuntasan ${masteryRate}% (KKM ${kkm})`,
        targetStudents: targetList,
        weakTopics: (activeWorkspace.curriculumData?.elements?.[0]?.topics || []).map((t) => t.topicTitle),
        aiPreferences: aiSettings || undefined,
      });

      await createRecord('documents', {
        ownerId: user.uid,
        workspaceId: activeWorkspace.id,
        academicYear: activeWorkspace.academicYear,
        semester: activeWorkspace.semester,
        grade: activeWorkspace.grade,
        subject: activeWorkspace.subject,
        docType: targetMode,
        title: `${targetMode === 'remedial' ? 'Program Remedial' : targetMode === 'pengayaan' ? 'Program Pengayaan' : 'Analisis Hasil Belajar'} — ${activeWorkspace.subject}`,
        status: 'draft',
        isAiDraft: true,
        content: res,
        version: 1,
        archived: false,
      });

      notify(`Program ${targetMode} berhasil disusun AI dan siap ditinjau.`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Gagal menyusun program.', 'error');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const cls = classes.find((c) => c.id === (journalForm.classId || activeClassId));
    const matchedProsem = prosemItems.find(
      (p) =>
        p.id === journalForm.prosemItemId ||
        (activeWorkspace && p.workspaceId === activeWorkspace.id && p.meetingNumber === Number(journalForm.meetingNumber))
    );

    await createRecord('journals', {
      ownerId: user.uid,
      workspaceId: activeWorkspace?.id || '',
      classId: cls?.id || '',
      className: cls?.name || activeWorkspace?.grade || 'Kelas',
      subject: activeWorkspace?.subject || profile?.subject || 'Mata Pelajaran',
      date: journalForm.date,
      meetingNumber: Number(journalForm.meetingNumber),
      prosemItemId: matchedProsem?.id || '',
      topic: journalForm.topic.trim() || matchedProsem?.topic || 'Pembelajaran Tatap Muka',
      tpCode: matchedProsem?.tpCode || '',
      activities: journalForm.activities,
      presentCount: Number(journalForm.presentCount),
      absentCount: Number(journalForm.absentCount),
      absentStudents: journalForm.absentStudents,
      teacherNotes: journalForm.teacherNotes,
      executionStatus: journalForm.executionStatus,
    });

    if (matchedProsem?.id && journalForm.executionStatus === 'selesai' && matchedProsem.executionStatus !== 'selesai') {
      setPendingProsemPrompt({ prosemId: matchedProsem.id, title: matchedProsem.topic });
    }

    setJournalForm((p) => ({ ...p, topic: '', activities: '', absentStudents: '', teacherNotes: '' }));
    notify('Jurnal mengajar berhasil disimpan.', 'success');
  };

  if (mode === 'kelas-siswa') {
    const activeCls = classes.find((c) => c.id === activeClassId);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Manajemen Kelas & Peserta Didik
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Kelola daftar kelas, tambah atau pindahkan siswa, serta impor/ekspor data Excel.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-4">
            <form onSubmit={handleAddClass} className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">Tambah Kelas Baru</h2>
              <input
                type="text"
                required
                placeholder="Nama Kelas (mis. VII-A)"
                value={newClass.name}
                onChange={(e) => setNewClass({ ...newClass, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newClass.level}
                  onChange={(e) => setNewClass({ ...newClass, level: e.target.value })}
                  className="px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                >
                  {EDUCATION_LEVELS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newClass.grade}
                  onChange={(e) => setNewClass({ ...newClass, grade: e.target.value })}
                  placeholder="Kelas VII"
                  className="px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>
              <button type="submit" className="w-full py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Tambah Kelas
              </button>
            </form>

            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
              <p className="text-xs font-semibold text-slate-500">Daftar Kelas ({classes.length})</p>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {classes.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => setSelectedClassId(c.id || '')}
                    className={`py-2.5 px-2 rounded-lg cursor-pointer flex items-center justify-between ${
                      activeClassId === c.id ? 'bg-blue-50 dark:bg-sky-950/40' : ''
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold">{c.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {c.level} · {students.filter((s) => s.classId === c.id).length} siswa
                      </p>
                    </div>
                    {c.id && (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {confirmDeleteClassId === c.id ? (
                          <>
                            <button
                              type="button"
                              onClick={async () => {
                                await deleteRecord('classes', c.id!);
                                setConfirmDeleteClassId(null);
                              }}
                              className="px-2 py-0.5 rounded bg-red-600 text-white text-[11px] font-semibold"
                            >
                              Hapus
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteClassId(null)}
                              className="px-2 py-0.5 rounded border border-slate-300 text-[11px]"
                            >
                              Batal
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteClassId(c.id!)}
                            className="text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-4">
            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Peserta Didik {activeCls ? `— ${activeCls.name}` : ''} ({classStudents.length})
                </h2>
                <div className="flex flex-wrap gap-2">
                  <label className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Impor Excel</span>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={(e) => handleImportExcel(e.target.files?.[0])}
                    />
                  </label>
                  <button
                    onClick={() =>
                      exportTableXlsx({
                        fileName: `Siswa_${activeCls?.name || 'Kelas'}`,
                        sheetName: 'Daftar Siswa',
                        headers: ['No', 'Nama Lengkap', 'NIS', 'NISN', 'L/P', 'Status'],
                        rows: classStudents.map((s, i) => [i + 1, s.fullName, s.nis || '', s.nisn || '', s.gender || '-', s.status]),
                      })
                    }
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Ekspor Excel</span>
                  </button>
                </div>
              </div>

              <form onSubmit={handleAddStudent} className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Nama Lengkap Siswa"
                  value={newStudent.fullName}
                  onChange={(e) => setNewStudent({ ...newStudent, fullName: e.target.value })}
                  className="sm:col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
                <input
                  type="text"
                  placeholder="NIS"
                  value={newStudent.nis}
                  onChange={(e) => setNewStudent({ ...newStudent, nis: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                />
                <select
                  value={newStudent.gender}
                  onChange={(e) => setNewStudent({ ...newStudent, gender: e.target.value as any })}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                >
                  <option value="L">Laki-laki</option>
                  <option value="P">Perempuan</option>
                </select>
                <button type="submit" className="px-3 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold">
                  Tambah Siswa
                </button>
              </form>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500">
                      <th className="py-2 pr-3">No</th>
                      <th className="py-2 px-3">Nama Lengkap</th>
                      <th className="py-2 px-3">NIS / NISN</th>
                      <th className="py-2 px-3">Pindah Kelas</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 pl-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {classStudents.map((s, idx) => (
                      <tr key={s.id}>
                        <td className="py-2.5 pr-3 font-mono tabular-nums">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">{s.fullName}</td>
                        <td className="py-2.5 px-3 font-mono">{s.nis || '-'} / {s.nisn || '-'}</td>
                        <td className="py-2.5 px-3">
                          <select
                            value={s.classId}
                            onChange={(e) => s.id && updateRecord('students', s.id, { classId: e.target.value })}
                            className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                          >
                            {classes.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5 px-3">
                          <button
                            onClick={() =>
                              s.id && updateRecord('students', s.id, { status: s.status === 'active' ? 'inactive' : 'active' })
                            }
                            className={`font-semibold ${s.status === 'active' ? 'text-emerald-600' : 'text-slate-400'}`}
                          >
                            {s.status === 'active' ? 'Aktif' : 'Nonaktif'}
                          </button>
                        </td>
                        <td className="py-2.5 pl-2">
                          {s.id && (
                            <button onClick={() => deleteRecord('students', s.id!)} className="text-slate-400 hover:text-red-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'penilaian') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Pusat Penilaian Terintegrasi</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Kelola nilai kuis, tugas, praktik, proyek, formatif, sumatif, remedial, dan pengayaan dengan bobot & KKM fleksibel.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">KKM Sekolah:</label>
            <input
              type="number"
              min={0}
              max={100}
              value={kkm}
              onChange={(e) => setKkm(Number(e.target.value))}
              className="w-16 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-sm"
            />
          </div>
        </div>

        <form onSubmit={handleAddGrade} className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <select
            value={activeClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={gradeForm.studentId || classStudents[0]?.id || ''}
            onChange={(e) => setGradeForm({ ...gradeForm, studentId: e.target.value })}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
          >
            {classStudents.map((s) => (
              <option key={s.id} value={s.id}>{s.fullName}</option>
            ))}
          </select>
          <select
            value={gradeForm.category}
            onChange={(e) => setGradeForm({ ...gradeForm, category: e.target.value })}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
          >
            <option value="kuis">Nilai Kuis</option>
            <option value="tugas">Nilai Tugas</option>
            <option value="praktik">Nilai Praktik</option>
            <option value="proyek">Nilai Proyek</option>
            <option value="formatif">Asesmen Formatif</option>
            <option value="sumatif">Asesmen Sumatif</option>
            <option value="ujian">Nilai Ujian</option>
            <option value="remedial">Nilai Remedial</option>
            <option value="pengayaan">Nilai Pengayaan</option>
          </select>
          <input
            type="text"
            value={gradeForm.title}
            onChange={(e) => setGradeForm({ ...gradeForm, title: e.target.value })}
            placeholder="Judul Penilaian"
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
          />
          <input
            type="number"
            min={0}
            max={100}
            value={gradeForm.score}
            onChange={(e) => setGradeForm({ ...gradeForm, score: Number(e.target.value) })}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
          />
          <button type="submit" className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold">
            Simpan Nilai
          </button>
        </form>

        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500">
                <th className="py-2 pr-3">Nama Siswa</th>
                <th className="py-2 px-3">Kategori</th>
                <th className="py-2 px-3">Judul</th>
                <th className="py-2 px-3">Nilai</th>
                <th className="py-2 px-3">Status KKM</th>
                <th className="py-2 pl-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {normalizedGrades.map((g) => (
                <tr key={g.id}>
                  <td className="py-2.5 pr-3 font-semibold">{g.studentName}</td>
                  <td className="py-2.5 px-3">{g.category}</td>
                  <td className="py-2.5 px-3">{g.title || '-'}</td>
                  <td className="py-2.5 px-3 font-mono tabular-nums font-bold">{g.pct}</td>
                  <td className="py-2.5 px-3">
                    <span className={g.pct >= kkm ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>
                      {g.pct >= kkm ? 'Tuntas' : 'Belum Tuntas'}
                    </span>
                  </td>
                  <td className="py-2.5 pl-2">
                    {g.id && (
                      <button onClick={() => deleteRecord('grades', g.id!)} className="text-slate-400 hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (mode === 'analisis-hasil' || mode === 'remedial' || mode === 'pengayaan') {
    const targetDocs = documents.filter((d) => d.docType === (mode === 'analisis-hasil' ? 'analisis' : mode));
    const schoolDisplay = activeSchool?.name || '-';
    const teacherName = activeSchool?.teacherName || profile?.displayName || '-';

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 no-print">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              {mode === 'analisis-hasil'
                ? 'Analisis Hasil Belajar Otomatis'
                : mode === 'remedial'
                ? 'Program Remedial Otomatis'
                : 'Program Pengayaan Otomatis'}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Analisis ketuntasan peserta didik berdasarkan KKM {kkm} beserta rekomendasi tindak lanjut AI.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleGenerateRemedialOrEnrichment(mode === 'analisis-hasil' ? 'analisis' : mode)}
              disabled={aiLoading}
              className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>Susun Rekomendasi AI</span>
            </button>
            <button
              onClick={() =>
                exportTableXlsx({
                  fileName: `Rekap_Nilai_${activeWorkspace?.subject || 'Kelas'}`,
                  sheetName: 'Analisis Nilai',
                  headers: ['Nama Siswa', 'Kategori', 'Judul', 'Skor', 'Status'],
                  rows: normalizedGrades.map((g) => [g.studentName, g.category, g.title || '-', g.pct, g.pct >= kkm ? 'Tuntas' : 'Belum Tuntas']),
                })
              }
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> XLSX
            </button>
            {targetDocs.length > 0 && (
              <button
                onClick={() => window.print()}
                className="px-3 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" /> Cetak A4
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 no-print">
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500">Rata-Rata Kelas</p>
            <p className="font-mono tabular-nums text-2xl font-bold mt-1">{avgScore}</p>
          </div>
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500">Tertinggi / Terendah</p>
            <p className="font-mono tabular-nums text-2xl font-bold mt-1">{maxScoreVal} / {minScoreVal}</p>
          </div>
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500">Tuntas</p>
            <p className="font-mono tabular-nums text-2xl font-bold text-emerald-600 mt-1">{passedCount}</p>
          </div>
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500">Belum Tuntas</p>
            <p className="font-mono tabular-nums text-2xl font-bold text-amber-600 mt-1">{failedCount}</p>
          </div>
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500">Ketuntasan</p>
            <p className="font-mono tabular-nums text-2xl font-bold text-blue-700 dark:text-sky-400 mt-1">{masteryRate}%</p>
          </div>
        </div>

        <div className="space-y-6">
          {targetDocs.map((doc) => {
            const c = doc.content || {};
            const docTitle = c.judulProgram || doc.title;
            const docMetadata = [
              { label: 'Satuan Pendidikan', value: schoolDisplay },
              { label: 'Mata Pelajaran', value: doc.subject || activeWorkspace?.subject || '-' },
              { label: 'Kelas / Semester', value: `${doc.grade || activeWorkspace?.grade || '-'} / ${doc.semester || activeWorkspace?.semester || '-'}` },
              { label: 'KKM / Ketuntasan', value: `KKM ${kkm} · Ketuntasan Kelas ${masteryRate}% (${passedCount} tuntas, ${failedCount} belum tuntas)` },
              { label: 'Guru Mata Pelajaran', value: teacherName },
            ];
            const docPayload: PrintableDocPayload = {
              title: docTitle,
              subtitle: `${doc.subject || activeWorkspace?.subject || '-'} · ${doc.grade || activeWorkspace?.grade || '-'} · Tahun Pelajaran ${doc.academicYear || activeWorkspace?.academicYear || '2026/2027'}`,
              fileName: doc.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_'),
              school: activeSchool,
              teacher: profile,
              metadataPairs: docMetadata,
              sections: [
                {
                  heading: 'A. Analisis Hasil & Ketuntasan Belajar',
                  paragraphs: [c.analisisSingkat || '-'],
                },
                {
                  heading: 'B. Materi Penguatan / Pendalaman & Aktivitas Terstruktur',
                  paragraphs: [c.materiPenguatanAtauPendalaman || '-'],
                  bullets: c.aktivitasTerstruktur || [],
                },
                {
                  heading: 'C. Rekomendasi Tindak Lanjut Guru',
                  paragraphs: [c.rekomendasiGuru || '-'],
                },
              ],
            };

            return (
              <div key={doc.id} className="space-y-2">
                <div className="flex flex-wrap items-center justify-end gap-2 no-print">
                  <button
                    onClick={() => exportDocumentPdf(docPayload)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> PDF
                  </button>
                  <button
                    onClick={() => exportDocumentDocx(docPayload)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" /> DOCX
                  </button>
                </div>

                <OfficialDocumentSheet
                  school={activeSchool}
                  teacher={profile}
                  title={docTitle}
                  subtitle={`${doc.subject || activeWorkspace?.subject || '-'} · ${doc.grade || activeWorkspace?.grade || '-'} · Tahun Pelajaran ${doc.academicYear || activeWorkspace?.academicYear || '2026/2027'}`}
                  subjectLabel={doc.subject || activeWorkspace?.subject}
                  metadataPairs={docMetadata}
                >
                  <section className="space-y-2">
                    <div className="bg-[#EEF4FB] border-l-4 border-[#1E3A8A] px-3 py-1.5 font-bold text-sm text-[#003380]">
                      A. Analisis Hasil & Ketuntasan Belajar
                    </div>
                    <p className="text-xs md:text-[13px] text-slate-800 leading-relaxed text-justify">
                      {c.analisisSingkat || '-'}
                    </p>
                  </section>

                  <section className="space-y-2">
                    <div className="bg-[#EEF4FB] border-l-4 border-[#1E3A8A] px-3 py-1.5 font-bold text-sm text-[#003380]">
                      B. Materi Penguatan / Pendalaman & Aktivitas Terstruktur
                    </div>
                    <p className="text-xs md:text-[13px] text-slate-800 leading-relaxed text-justify">
                      {c.materiPenguatanAtauPendalaman || '-'}
                    </p>
                    {Array.isArray(c.aktivitasTerstruktur) && c.aktivitasTerstruktur.length > 0 && (
                      <ol className="list-decimal pl-5 text-xs md:text-[13px] text-slate-800 space-y-1 text-justify">
                        {c.aktivitasTerstruktur.map((a: string, i: number) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ol>
                    )}
                  </section>

                  {c.rekomendasiGuru && (
                    <section className="space-y-2">
                      <div className="bg-[#EEF4FB] border-l-4 border-[#1E3A8A] px-3 py-1.5 font-bold text-sm text-[#003380]">
                        C. Rekomendasi Tindak Lanjut Guru
                      </div>
                      <p className="text-xs md:text-[13px] text-slate-800 leading-relaxed text-justify">{c.rekomendasiGuru}</p>
                    </section>
                  )}
                </OfficialDocumentSheet>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (mode === 'jurnal-mengajar') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Jurnal Mengajar & Kehadiran</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Catat pelaksanaan harian pertemuan beserta kehadiran siswa yang terhubung dengan checklist PROSEM.
          </p>
        </div>

        {pendingProsemPrompt && (
          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-medium text-emerald-900 dark:text-emerald-100">
              Pertemuan "{pendingProsemPrompt.title}" telah dicatat selesai pada jurnal. Tandai status PROSEM menjadi Selesai juga?
            </p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  await updateRecord('prosem_items', pendingProsemPrompt.prosemId, {
                    executionStatus: 'selesai',
                    executionDate: new Date().toISOString().slice(0, 10),
                  });
                  setPendingProsemPrompt(null);
                  notify('Status PROSEM berhasil diperbarui menjadi Selesai.', 'success');
                }}
                className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold"
              >
                Ya, Tandai Selesai
              </button>
              <button
                onClick={() => setPendingProsemPrompt(null)}
                className="px-3 py-1.5 rounded-lg border border-emerald-300 text-xs font-semibold"
              >
                Nanti Saja
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSaveJournal} className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input
              type="date"
              value={journalForm.date}
              onChange={(e) => setJournalForm({ ...journalForm, date: e.target.value })}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
            <select
              value={journalForm.classId || activeClassId}
              onChange={(e) => setJournalForm({ ...journalForm, classId: e.target.value })}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            >
              <option value="">Pilih Kelas</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={journalForm.meetingNumber}
              onChange={(e) => setJournalForm({ ...journalForm, meetingNumber: Number(e.target.value) })}
              placeholder="Pertemuan ke-"
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
            />
            <select
              value={journalForm.executionStatus}
              onChange={(e) => setJournalForm({ ...journalForm, executionStatus: e.target.value as any })}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            >
              <option value="selesai">Selesai Dilaksanakan</option>
              <option value="berlangsung">Sedang Berlangsung</option>
              <option value="ditunda">Ditunda</option>
              <option value="penyesuaian">Perlu Penyesuaian</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              placeholder="Materi / Topik Pertemuan"
              value={journalForm.topic}
              onChange={(e) => setJournalForm({ ...journalForm, topic: e.target.value })}
              className="sm:col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                value={journalForm.presentCount}
                onChange={(e) => setJournalForm({ ...journalForm, presentCount: Number(e.target.value) })}
                placeholder="Hadir"
                className="w-1/2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
              />
              <input
                type="number"
                min={0}
                value={journalForm.absentCount}
                onChange={(e) => setJournalForm({ ...journalForm, absentCount: Number(e.target.value) })}
                placeholder="Tidak Hadir"
                className="w-1/2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
              />
            </div>
          </div>

          <textarea
            rows={2}
            placeholder="Ringkasan kegiatan & catatan siswa tidak hadir / kendala pembelajaran..."
            value={journalForm.activities}
            onChange={(e) => setJournalForm({ ...journalForm, activities: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
          />

          <button type="submit" className="px-5 py-2.5 rounded-lg bg-blue-700 text-white text-xs font-semibold">
            Simpan Jurnal Mengajar
          </button>
        </form>

        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500">
                <th className="py-2 pr-3">Tanggal</th>
                <th className="py-2 px-3">Kelas & Mapel</th>
                <th className="py-2 px-3">Pertemuan & Materi</th>
                <th className="py-2 px-3">Kehadiran</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 pl-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {journals.map((j) => (
                <tr key={j.id}>
                  <td className="py-2.5 pr-3 font-mono">{j.date}</td>
                  <td className="py-2.5 px-3 font-semibold">{j.className} · {j.subject}</td>
                  <td className="py-2.5 px-3">Pertemuan {j.meetingNumber}: {j.topic}</td>
                  <td className="py-2.5 px-3 font-mono tabular-nums">{j.presentCount} hadir · {j.absentCount} absen</td>
                  <td className="py-2.5 px-3 font-semibold">{j.executionStatus}</td>
                  <td className="py-2.5 pl-2">
                    {j.id && (
                      <button onClick={() => deleteRecord('journals', j.id!)} className="text-slate-400 hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Laporan & Arsip Dokumen
  const filteredArchive = documents.filter((d) => {
    if (docTypeFilter !== 'all' && d.docType !== docTypeFilter) return false;
    if (searchQuery && !d.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const exportArchiveSummary = (fmt: 'pdf' | 'docx') => {
    const schoolDisplay = activeSchool?.name || '-';
    const teacherName = activeSchool?.teacherName || profile?.displayName || '-';
    const payload: PrintableDocPayload = {
      title: 'Laporan Rekapitulasi Perangkat Pembelajaran',
      subtitle: `${activeSchool?.name || 'Satuan Pendidikan'} · Tahun Pelajaran ${activeSchool?.academicYear || '2026/2027'}`,
      fileName: 'Laporan_Perangkat_Pembelajaran',
      school: activeSchool,
      teacher: profile,
      metadataPairs: [
        { label: 'Satuan Pendidikan', value: schoolDisplay },
        { label: 'Tahun Pelajaran', value: activeSchool?.academicYear || '2026/2027' },
        { label: 'Total Perangkat', value: `${filteredArchive.length} dokumen` },
        { label: 'Guru Mata Pelajaran', value: teacherName },
      ],
      sections: [
        {
          heading: 'Daftar Perangkat Pembelajaran & Status Persetujuan',
          table: {
            headers: ['No', 'Judul Dokumen', 'Jenis', 'Mapel', 'Kelas', 'Versi', 'Status'],
            rows: filteredArchive.map((d, i) => [
              i + 1,
              d.title,
              d.docType,
              d.subject || '-',
              d.grade || '-',
              `v${d.version}`,
              d.status === 'approved' ? 'Disetujui' : 'Draf',
            ]),
          },
        },
      ],
    };
    if (fmt === 'pdf') exportDocumentPdf(payload);
    else exportDocumentDocx(payload);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {mode === 'laporan' ? 'Laporan Administrasi Guru' : 'Arsip Dokumen Terstruktur'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Kelola seluruh perangkat pembelajaran berdasarkan Tahun Ajaran, Semester, Mata Pelajaran, riwayat revisi, dan duplikasi.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportArchiveSummary('pdf')} className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> Laporan PDF
          </button>
          <button onClick={() => exportArchiveSummary('docx')} className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> Laporan DOCX
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Cari judul dokumen..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 min-w-[220px] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
        />
        <select
          value={docTypeFilter}
          onChange={(e) => setDocTypeFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
        >
          <option value="all">Semua Jenis Dokumen</option>
          <option value="cp">CP / TP / ATP</option>
          <option value="prota">PROTA</option>
          <option value="modul_ajar">Modul Ajar</option>
          <option value="bahan_ajar">Bahan Ajar</option>
          <option value="lkpd">LKPD</option>
          <option value="powerpoint">PowerPoint</option>
          <option value="remedial">Remedial</option>
          <option value="pengayaan">Pengayaan</option>
        </select>
      </div>

      <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500">
              <th className="py-2 pr-3">Judul Dokumen</th>
              <th className="py-2 px-3">Kategori</th>
              <th className="py-2 px-3">Tahun / Semester</th>
              <th className="py-2 px-3">Versi</th>
              <th className="py-2 px-3">Status</th>
              <th className="py-2 pl-3">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredArchive.map((d) => (
              <tr key={d.id}>
                <td className="py-3 pr-3 font-semibold text-slate-900 dark:text-white">{d.title}</td>
                <td className="py-3 px-3 font-mono">{d.docType}</td>
                <td className="py-3 px-3">{d.academicYear || '-'} · {d.semester || '-'}</td>
                <td className="py-3 px-3 font-mono">v{d.version}</td>
                <td className="py-3 px-3">
                  <span className={d.status === 'approved' ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>
                    {d.status === 'approved' ? 'Disetujui' : 'Draf'}
                  </span>
                </td>
                <td className="py-3 pl-3 flex items-center gap-2">
                  {d.id && d.status !== 'approved' && (
                    <button
                      title="Setujui"
                      onClick={() => updateRecord('documents', d.id!, { status: 'approved' })}
                      className="text-emerald-600 hover:opacity-80"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    title="Duplikasi"
                    onClick={async () => {
                      if (!user) return;
                      const targetWsId = workspaces.some((w) => w.id === d.workspaceId)
                        ? d.workspaceId
                        : activeWorkspace?.id || workspaces[0]?.id || '';
                      if (!targetWsId) {
                        notify('Buat atau pilih administrasi mata pelajaran terlebih dahulu sebelum menduplikasi dokumen.', 'error');
                        return;
                      }
                      await createRecord('documents', {
                        ownerId: user.uid,
                        workspaceId: targetWsId,
                        academicYear: d.academicYear,
                        semester: d.semester,
                        grade: d.grade,
                        subject: d.subject,
                        docType: d.docType,
                        title: `${d.title} (Salinan)`.slice(0, 245),
                        status: 'draft',
                        content: d.content || {},
                        version: (d.version || 1) + 1,
                        archived: false,
                      });
                      notify('Dokumen berhasil diduplikasi.', 'success');
                    }}
                    className="text-blue-700 dark:text-sky-400"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  {d.id && (
                    <button
                      title="Arsipkan / Pulihkan"
                      onClick={() => updateRecord('documents', d.id!, { archived: !d.archived })}
                      className="text-slate-500"
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                  )}
                  {d.id && (
                    confirmDeleteDocId === d.id ? (
                      <span className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteRecord('documents', d.id!);
                            setConfirmDeleteDocId(null);
                          }}
                          className="px-2 py-0.5 rounded bg-red-600 text-white text-[11px] font-semibold"
                        >
                          Yakin
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteDocId(null)}
                          className="px-2 py-0.5 rounded border border-slate-300 text-[11px]"
                        >
                          Batal
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        title="Hapus"
                        onClick={() => setConfirmDeleteDocId(d.id!)}
                        className="text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
