import React, { useState } from 'react';
import {
  LayoutDashboard,
  UserCircle,
  Building2,
  SlidersHorizontal,
  CalendarDays,
  BookOpen,
  Sparkles,
  Layers,
  Target,
  ListChecks,
  GitBranch,
  CalendarRange,
  CheckSquare,
  FileText,
  BookMarked,
  ClipboardList,
  Presentation,
  Database,
  Grid3X3,
  FileCheck2,
  Smartphone,
  Users,
  Award,
  BarChart3,
  LifeBuoy,
  Rocket,
  NotebookPen,
  FileSpreadsheet,
  FolderArchive,
  Cpu,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { NavPageId, useApp } from '../context/AppContext';
import { GlobalModals } from './GlobalModals';

interface NavGroup {
  title: string;
  items: { id: NavPageId; label: string; icon: React.ComponentType<{ className?: string }> }[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Utama',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'generate-all', label: 'Generate Semua Perangkat', icon: Layers },
      { id: 'ai-auto-curriculum', label: 'AI Auto Curriculum', icon: Sparkles },
    ],
  },
  {
    title: 'Identitas & Pengaturan',
    items: [
      { id: 'profil-guru', label: 'Profil Guru', icon: UserCircle },
      { id: 'identitas-sekolah', label: 'Identitas Sekolah', icon: Building2 },
      { id: 'pengaturan-kurikulum', label: 'Pengaturan Kurikulum', icon: SlidersHorizontal },
      { id: 'kalender-pendidikan', label: 'Kalender Pendidikan', icon: CalendarDays },
      { id: 'pengaturan-ai', label: 'Pengaturan AI', icon: Cpu },
    ],
  },
  {
    title: 'Referensi & Kurikulum',
    items: [
      { id: 'database-buku', label: 'Database Buku', icon: BookOpen },
      { id: 'cp', label: 'Capaian Pembelajaran (CP)', icon: Target },
      { id: 'tp', label: 'Tujuan Pembelajaran (TP)', icon: ListChecks },
      { id: 'atp', label: 'Alur Tujuan (ATP)', icon: GitBranch },
      { id: 'prota', label: 'Program Tahunan (PROTA)', icon: CalendarRange },
      { id: 'prosem', label: 'PROSEM & Checklist', icon: CheckSquare },
    ],
  },
  {
    title: 'Perangkat Pembelajaran',
    items: [
      { id: 'modul-ajar', label: 'Modul Ajar / RPP', icon: FileText },
      { id: 'bahan-ajar', label: 'Bahan Ajar Pertemuan', icon: BookMarked },
      { id: 'lkpd', label: 'LKPD', icon: ClipboardList },
      { id: 'powerpoint', label: 'PowerPoint Cerdas', icon: Presentation },
    ],
  },
  {
    title: 'Asesmen & Kuis Digital',
    items: [
      { id: 'bank-soal', label: 'Bank Soal', icon: Database },
      { id: 'kisi-kisi', label: 'Kisi-Kisi Soal', icon: Grid3X3 },
      { id: 'asesmen-ujian', label: 'Asesmen & Paket Ujian', icon: FileCheck2 },
      { id: 'kuis-online', label: 'Kuis Online', icon: Smartphone },
      { id: 'portal-siswa', label: 'Mode Portal Siswa', icon: Smartphone },
    ],
  },
  {
    title: 'Kelas, Nilai & Arsip',
    items: [
      { id: 'kelas-siswa', label: 'Kelas & Siswa', icon: Users },
      { id: 'penilaian', label: 'Penilaian', icon: Award },
      { id: 'analisis-hasil', label: 'Analisis Hasil Belajar', icon: BarChart3 },
      { id: 'remedial', label: 'Program Remedial', icon: LifeBuoy },
      { id: 'pengayaan', label: 'Program Pengayaan', icon: Rocket },
      { id: 'jurnal-mengajar', label: 'Jurnal Mengajar', icon: NotebookPen },
      { id: 'laporan', label: 'Laporan', icon: FileSpreadsheet },
      { id: 'arsip-dokumen', label: 'Arsip Dokumen', icon: FolderArchive },
    ],
  },
];

export const LayoutShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    profile,
    activePage,
    setActivePage,
    theme,
    toggleTheme,
    logout,
    workspaces,
    activeWorkspace,
    setActiveWorkspaceId,
    openCreateWorkspaceModal,
    toasts,
    dismissToast,
  } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const currentItem = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === activePage);

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 lg:w-72 md:flex-col md:fixed md:inset-y-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-30 no-print">
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 shrink-0">
          <button
            onClick={() => setActivePage('dashboard')}
            className="text-left focus-visible:outline-none"
          >
            <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
              AI SMART TEACHER
            </span>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="px-3 mb-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = activePage === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActivePage(item.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                        active
                          ? 'bg-blue-700 text-white'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <button
            onClick={() => setActivePage('profil-guru')}
            className="flex items-center gap-2.5 min-w-0 text-left hover:opacity-80"
          >
            <img
              src={profile?.avatarUrl || '/src/assets/images/avatar_educator_portrait_1795670402746.jpg'}
              alt={profile?.displayName || 'Profil Guru'}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                {profile?.displayName || 'Guru'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {profile?.role === 'admin' ? 'Admin & Guru' : 'Guru Mapel'}
              </p>
            </div>
          </button>
          <button
            onClick={logout}
            title="Keluar"
            className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64 lg:pl-72 flex flex-col min-h-screen pb-20 md:pb-0">
        {/* Top Bar (3 zones) */}
        <header className="sticky top-0 z-20 h-14 md:h-16 px-4 md:px-6 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-2 min-w-0">
            <span className="md:hidden font-display font-bold text-sm text-slate-900 dark:text-white whitespace-nowrap">
              AI SMART TEACHER
            </span>
            <div className="hidden md:flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 min-w-0">
              <span className="truncate">Workspace</span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              <span className="font-semibold text-slate-900 dark:text-white truncate">
                {currentItem?.label || 'Dashboard'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {workspaces.length > 0 && (
              <select
                aria-label="Pilih Mata Pelajaran Aktif"
                value={activeWorkspace?.id || ''}
                onChange={(e) => setActiveWorkspaceId(e.target.value)}
                className="hidden sm:block max-w-[230px] truncate text-xs font-medium px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.subject} · {w.grade} ({w.semester} · {w.academicYear})
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={openCreateWorkspaceModal}
              title="Buat Administrasi / Ruang Kerja Baru untuk Kelas atau Mata Pelajaran Lain"
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Administrasi Baru</span>
            </button>

            <button
              onClick={toggleTheme}
              aria-label="Ubah Tema Terang atau Gelap"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setActivePage('generate-all')}
              className="px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
            >
              Generate Perangkat
            </button>
          </div>
        </header>

        {/* Mobile Workspace Switcher Bar */}
        <div className="sm:hidden px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 no-print">
          {workspaces.length > 0 ? (
            <select
              aria-label="Pilih Administrasi Aktif"
              value={activeWorkspace?.id || ''}
              onChange={(e) => setActiveWorkspaceId(e.target.value)}
              className="flex-1 min-w-0 truncate text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.subject} · {w.grade} ({w.semester})
                </option>
              ))}
            </select>
          ) : (
            <span className="flex-1 text-xs text-slate-500 dark:text-slate-400 truncate">
              Belum ada administrasi mapel
            </span>
          )}
          <button
            type="button"
            onClick={openCreateWorkspaceModal}
            className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Baru</span>
          </button>
        </div>

        {/* Viewport Container */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          {children}
        </main>
        <GlobalModals />
      </div>

      {/* Mobile Bottom Navigation (<= 15% viewport height) */}
      <nav
        aria-label="Navigasi Utama Mobile"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 h-16 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center no-print"
      >
        {[
          { id: 'dashboard' as NavPageId, label: 'Beranda', icon: LayoutDashboard },
          { id: 'generate-all' as NavPageId, label: 'Perangkat', icon: Layers },
          { id: 'kelas-siswa' as NavPageId, label: 'Kelas', icon: Users },
          { id: 'kuis-online' as NavPageId, label: 'Asesmen', icon: FileCheck2 },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activePage === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActivePage(tab.id);
                setMobileMenuOpen(false);
              }}
              className={`h-full flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                active
                  ? 'text-blue-700 dark:text-sky-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
        <button
          onClick={() => setMobileMenuOpen((v) => !v)}
          className={`h-full flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
            mobileMenuOpen ? 'text-blue-700 dark:text-sky-400' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          <span>Lainnya</span>
        </button>
      </nav>

      {/* Mobile Full Menu Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 bottom-16 z-40 bg-white dark:bg-slate-900 overflow-y-auto p-4 space-y-5 no-print">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <p className="font-display font-bold text-base text-slate-900 dark:text-white">
                Semua Menu Aplikasi
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {profile?.displayName} · {profile?.email}
              </p>
            </div>
            <button
              onClick={logout}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-red-600"
            >
              Keluar
            </button>
          </div>

          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mb-2">
                {group.title}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = activePage === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActivePage(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`min-h-[44px] flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium border text-left ${
                        active
                          ? 'bg-blue-700 text-white border-blue-700'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div className="fixed top-16 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none no-print">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start justify-between gap-3 px-4 py-3 rounded-lg border text-sm shadow-sm ${
                t.type === 'error'
                  ? 'bg-red-50 dark:bg-red-950/90 border-red-200 dark:border-red-800 text-red-900 dark:text-red-100'
                  : t.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/90 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100'
              }`}
            >
              <span>{t.text}</span>
              <button
                onClick={() => dismissToast(t.id)}
                className="text-xs opacity-70 hover:opacity-100 shrink-0"
              >
                Tutup
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
