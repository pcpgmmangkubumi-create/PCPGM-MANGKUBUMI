import React, { useState } from 'react';
import {
  Layers,
  BookMarked,
  Presentation,
  Database,
  Smartphone,
  CheckSquare,
  NotebookPen,
  ArrowRight,
  AlertCircle,
  Plus,
  Trash2,
  RotateCcw,
  FolderKanban,
  CheckCircle2,
} from 'lucide-react';
import { useApp, NavPageId } from '../context/AppContext';
import { getMinutesPerJp, getOfficialJpStandard } from '../lib/curriculumData';

export const DashboardView: React.FC = () => {
  const {
    profile,
    activeSchool,
    workspaces,
    activeWorkspace,
    setActiveWorkspaceId,
    openCreateWorkspaceModal,
    openResetModal,
    deleteWorkspaceAndRelatedData,
    documents,
    prosemItems,
    questions,
    quizzes,
    grades,
    journals,
    classes,
    students,
    setActivePage,
  } = useApp();

  const [confirmDeleteWsId, setConfirmDeleteWsId] = useState<string | null>(null);

  const wsDocs = activeWorkspace
    ? documents.filter((d) => d.workspaceId === activeWorkspace.id)
    : documents;
  const wsProsem = activeWorkspace
    ? prosemItems.filter((p) => p.workspaceId === activeWorkspace.id)
    : prosemItems;
  const wsQuestions = activeWorkspace
    ? questions.filter((q) => q.workspaceId === activeWorkspace.id)
    : questions;
  const wsQuizzes = activeWorkspace
    ? quizzes.filter((q) => !q.workspaceId || q.workspaceId === activeWorkspace.id)
    : quizzes;
  const wsGrades = activeWorkspace
    ? grades.filter((g) => !g.workspaceId || g.workspaceId === activeWorkspace.id)
    : grades;
  const wsJournals = activeWorkspace
    ? journals.filter((j) => !j.workspaceId || j.workspaceId === activeWorkspace.id)
    : journals;

  const modulCount = wsDocs.filter((d) => d.docType === 'modul_ajar').length;
  const bahanCount = wsDocs.filter((d) => d.docType === 'bahan_ajar').length;
  const lkpdCount = wsDocs.filter((d) => d.docType === 'lkpd').length;
  const pptCount = wsDocs.filter((d) => d.docType === 'powerpoint').length;
  const activeQuizCount = wsQuizzes.filter((q) => q.status === 'published').length;

  const prosemDone = wsProsem.filter((p) => p.executionStatus === 'selesai').length;
  const prosemPct = wsProsem.length > 0 ? Math.round((prosemDone / wsProsem.length) * 100) : 0;

  const avgGrade =
    wsGrades.length > 0
      ? Math.round(
          wsGrades.reduce((acc, g) => acc + (g.maxScore > 0 ? (g.score / g.maxScore) * 100 : 0), 0) / wsGrades.length
        )
      : 0;

  const pendingItems = wsProsem.filter((p) => p.executionStatus !== 'selesai').slice(0, 5);

  const quickActions: { label: string; sub: string; page: NavPageId; icon: React.ComponentType<{ className?: string }> }[] = [
    { label: 'Generate Semua Perangkat', sub: 'Kurikulum hingga Bank Soal', page: 'generate-all', icon: Layers },
    { label: 'Buat Bahan Ajar', sub: 'Materi khusus per pertemuan', page: 'bahan-ajar', icon: BookMarked },
    { label: 'Buat PowerPoint', sub: 'Slide visual siap mengajar', page: 'powerpoint', icon: Presentation },
    { label: 'Buat Bank Soal', sub: '13 jenis soal & kisi-kisi', page: 'bank-soal', icon: Database },
    { label: 'Buat Kuis Online', sub: 'Bagikan kode ke HP siswa', page: 'kuis-online', icon: Smartphone },
    { label: 'Buka Checklist PROSEM', sub: 'Pantau keterlaksanaan bulanan', page: 'prosem', icon: CheckSquare },
    { label: 'Isi Jurnal Mengajar', sub: 'Catat pertemuan & kehadiran', page: 'jurnal-mengajar', icon: NotebookPen },
  ];

  // Monthly PROSEM breakdown for chart
  const monthStats = Array.from(
    wsProsem.reduce((map, item) => {
      const m = item.month || 'Lainnya';
      const curr = map.get(m) || { month: m, total: 0, done: 0 };
      curr.total += 1;
      if (item.executionStatus === 'selesai') curr.done += 1;
      map.set(m, curr);
      return map;
    }, new Map<string, { month: string; total: number; done: number }>())
  ).map(([, v]) => v);

  return (
    <div className="space-y-8">
      {/* Greeting & Active Context Header */}
      <section className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {activeSchool?.name || 'Satuan Pendidikan Belum Diatur'} · Tahun Ajaran {activeWorkspace?.academicYear || activeSchool?.academicYear || '2026/2027'} · {activeWorkspace?.semester || activeSchool?.semester || 'Semester 1'}
          </p>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
            Selamat bertugas, {profile?.displayName || 'Bapak/Ibu Guru'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {activeWorkspace
              ? `${activeWorkspace.subject} · ${activeWorkspace.level} ${activeWorkspace.grade} (${activeWorkspace.phase || '-'}) · ${activeWorkspace.curriculum} · ${activeWorkspace.jpPerWeek || getOfficialJpStandard({ level: activeWorkspace.level, grade: activeWorkspace.grade, subject: activeWorkspace.subject, curriculum: activeWorkspace.curriculum }).jpPerWeek} JP/mg (@${getMinutesPerJp(activeWorkspace.level, activeWorkspace.grade)}m)`
              : 'Lengkapi identitas sekolah dan buat ruang kerja mata pelajaran dengan tombol + Administrasi Baru.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {!activeSchool && (
            <button
              onClick={() => setActivePage('identitas-sekolah')}
              className="px-4 py-2.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 text-xs font-semibold flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4" />
              <span>Atur Identitas Sekolah</span>
            </button>
          )}
          <button
            type="button"
            onClick={openResetModal}
            className="px-3.5 py-2.5 rounded-lg border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Data</span>
          </button>
          <button
            onClick={() => setActivePage('generate-all')}
            className="px-5 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
          >
            <span>Generate Semua Perangkat</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Daftar Administrasi Mengajar (Multi-Kelas & Mapel) */}
      <section className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-blue-700 dark:text-sky-400" />
              <span>Daftar Administrasi Mengajar ({workspaces.length} Kelas / Mapel)</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Buat beberapa administrasi berbeda untuk kelas atau mata pelajaran lain. Klik kartu untuk berpindah ruang kerja aktif.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateWorkspaceModal}
            className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Administrasi Baru</span>
          </button>
        </div>

        {workspaces.length === 0 ? (
          <div className="p-6 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-center space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Belum ada administrasi mata pelajaran atau kelas yang dibuat.
            </p>
            <button
              type="button"
              onClick={openCreateWorkspaceModal}
              className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Buat Administrasi Pertama</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {workspaces.map((w) => {
              const isActive = activeWorkspace?.id === w.id;
              const countDocs = documents.filter((d) => d.workspaceId === w.id).length;
              const countProsem = prosemItems.filter((p) => p.workspaceId === w.id).length;
              const isConfirming = confirmDeleteWsId === w.id;

              return (
                <div
                  key={w.id}
                  onClick={() => w.id && setActiveWorkspaceId(w.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-colors flex flex-col justify-between gap-3 ${
                    isActive
                      ? 'border-blue-600 dark:border-sky-500 bg-blue-50/60 dark:bg-sky-950/30'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white leading-snug">
                        {w.subject}
                      </h3>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 dark:text-sky-400 shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Aktif</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {w.grade} {w.phase ? `(${w.phase})` : ''} · {w.level} ·{' '}
                      <span className="font-mono tabular-nums">
                        {w.jpPerWeek || getOfficialJpStandard({ level: w.level, grade: w.grade, subject: w.subject, curriculum: w.curriculum }).jpPerWeek} JP/mg (@{getMinutesPerJp(w.level, w.grade)}m)
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {w.semester} · {w.academicYear} · {w.curriculum}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/70 flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      {countDocs} dokumen · {countProsem} PROSEM
                    </span>

                    {w.id && (
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {isConfirming ? (
                          <>
                            <button
                              type="button"
                              onClick={async () => {
                                await deleteWorkspaceAndRelatedData(w.id!);
                                setConfirmDeleteWsId(null);
                              }}
                              className="px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white font-semibold"
                            >
                              Yakin Hapus
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteWsId(null)}
                              className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300"
                            >
                              Batal
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            title="Hapus Administrasi Ini"
                            onClick={() => setConfirmDeleteWsId(w.id!)}
                            className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4-Column Tabular KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Perangkat Tersimpan</p>
          <p className="font-mono tabular-nums text-3xl font-bold text-slate-900 dark:text-white">
            {wsDocs.length}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Modul {modulCount} · Bahan Ajar {bahanCount} · LKPD {lkpdCount} · PPT {pptCount}
          </p>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Keterlaksanaan PROSEM</p>
          <p className="font-mono tabular-nums text-3xl font-bold text-slate-900 dark:text-white">
            {prosemPct}%
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {prosemDone} dari {wsProsem.length} pertemuan selesai · {wsJournals.length} jurnal
          </p>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Bank Soal & Kuis Aktif</p>
          <p className="font-mono tabular-nums text-3xl font-bold text-slate-900 dark:text-white">
            {wsQuestions.length}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {activeQuizCount} kuis dipublikasikan · {wsQuizzes.length} total kuis
          </p>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Kelas & Rata-Rata Nilai</p>
          <p className="font-mono tabular-nums text-3xl font-bold text-slate-900 dark:text-white">
            {wsGrades.length > 0 ? `${avgGrade}` : '-'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {classes.length} kelas · {students.length} peserta didik
          </p>
        </div>
      </section>

      {/* Quick Actions Grid */}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
          Akses Cepat Penyusunan & Mengajar
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map((qa) => {
            const Icon = qa.icon;
            return (
              <button
                key={qa.page}
                onClick={() => setActivePage(qa.page)}
                className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-600 dark:hover:border-sky-500 text-left transition-colors flex items-start gap-3"
              >
                <Icon className="w-5 h-5 text-blue-700 dark:text-sky-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {qa.label}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {qa.sub}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Two-Column Progress & Agenda */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Progres Pelaksanaan PROSEM per Bulan
            </h2>
            <button
              onClick={() => setActivePage('prosem')}
              className="text-xs font-semibold text-blue-700 dark:text-sky-400 hover:underline"
            >
              Kelola PROSEM
            </button>
          </div>

          {monthStats.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Belum ada jadwal PROSEM untuk mata pelajaran aktif.
              </p>
              <button
                onClick={() => setActivePage('prota')}
                className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold"
              >
                Susun PROTA & PROSEM
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {monthStats.map((m) => {
                const pct = m.total > 0 ? Math.round((m.done / m.total) * 100) : 0;
                return (
                  <div key={m.month} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-200">{m.month}</span>
                      <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {m.done}/{m.total} pertemuan ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-700 dark:bg-sky-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Agenda Pembelajaran Terdekat
            </h2>
            <button
              onClick={() => setActivePage('jurnal-mengajar')}
              className="text-xs font-semibold text-blue-700 dark:text-sky-400 hover:underline"
            >
              Buka Jurnal
            </button>
          </div>

          {pendingItems.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
              Semua agenda terjadwal telah selesai atau belum ada pertemuan PROSEM.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {pendingItems.map((item) => (
                <div key={item.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      Pertemuan {item.meetingNumber} · {item.month} · {item.jpAllocation} JP
                    </p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {item.topic}
                    </p>
                    {item.subtopic && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {item.subtopic}
                      </p>
                    )}
                  </div>
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-300 shrink-0">
                    {item.executionStatus === 'belum' ? 'Terjadwal' : item.executionStatus}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
