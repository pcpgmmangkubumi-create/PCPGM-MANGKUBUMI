import React, { useState } from 'react';
import { BookOpen, FileCheck2, Layers, Presentation, ArrowRight, Sun, Moon } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { StudentQuizPortal } from './StudentQuizPortal';

export const LandingAuthView: React.FC = () => {
  const { signInWithGoogle, theme, toggleTheme } = useApp();
  const [mode, setMode] = useState<'teacher' | 'student'>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('quiz') ? 'student' : 'teacher';
  });

  if (mode === 'student') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        <header className="h-16 px-4 md:px-8 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-4">
          <span className="font-display font-bold text-base text-slate-900 dark:text-white whitespace-nowrap">
            AI SMART TEACHER
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              aria-label="Ubah Tema"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setMode('teacher')}
              className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              Masuk sebagai Guru
            </button>
          </div>
        </header>
        <main className="max-w-4xl mx-auto p-4 md:p-8">
          <StudentQuizPortal />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* 3-Zone Top Bar */}
      <header className="h-16 px-4 md:px-8 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-8">
        <a
          href="/"
          className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
        >
          AI SMART TEACHER
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
          <a href="#alur" className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0">
            Alur Kerja
          </a>
          <a href="#perangkat" className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0">
            Perangkat Ajar
          </a>
          <a href="#asesmen" className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0">
            Asesmen Digital
          </a>
          <button
            onClick={() => setMode('student')}
            className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0"
          >
            Portal Kuis Siswa
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={toggleTheme}
            aria-label="Ubah Tema"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
          <button
            onClick={signInWithGoogle}
            className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
          >
            Masuk dengan Google
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 md:px-8 py-10 md:py-16 space-y-16">
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Platform Administrasi & Pembelajaran Guru Indonesia · Kurikulum Merdeka & K-13
            </p>
            <h1 className="font-display text-3xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight [text-wrap:balance]">
              Susun perangkat ajar satu tahun secara terstruktur dan otomatis.
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              Cukup pilih jenjang, kurikulum, kelas, mata pelajaran, dan unggah buku referensi. AI SMART TEACHER membantu memetakan CP, TP, ATP, PROTA, PROSEM dengan checklist bulanan, Modul Ajar, Bahan Ajar per pertemuan, LKPD, PowerPoint, hingga kuis online siswa.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={signInWithGoogle}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold transition-colors whitespace-nowrap"
              >
                <span>Mulai sebagai Guru</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setMode('student')}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100 transition-colors whitespace-nowrap"
              >
                Masuk Kuis Siswa
              </button>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-full min-h-[280px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
              <img
                src="/src/assets/images/hero_smart_teacher_1795670402550.jpg"
                alt="Ruang kerja digital guru dengan tablet analitik kurikulum dan buku referensi"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </section>

        {/* 4 Core Capability Summary Strip */}
        <section id="perangkat" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 border-t border-slate-200 dark:border-slate-800 pt-10">
          {[
            {
              icon: BookOpen,
              title: 'Ekstraksi Buku Referensi',
              desc: 'Unggah PDF, DOCX, atau pindaian halaman untuk pemetaan bab, subbab, dan keterlacakan sumber.',
            },
            {
              icon: Layers,
              title: 'PROTA, PROSEM & Modul Ajar',
              desc: 'Terhubung dengan kalender pendidikan, minggu efektif, dan checklist pelaksanaan bulanan.',
            },
            {
              icon: Presentation,
              title: 'Bahan Ajar & PowerPoint',
              desc: 'Materi khusus tiap pertemuan lengkap dengan unduhan PPTX, DOCX, dan PDF siap cetak A4.',
            },
            {
              icon: FileCheck2,
              title: 'Bank Soal & Kuis Mobile',
              desc: '13 tipe soal, Paket A–D, kisi-kisi otomatis, serta kuis online dengan koreksi dan analisis nilai.',
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5"
              >
                <Icon className="w-5 h-5 text-blue-700 dark:text-sky-400" />
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  {item.title}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            );
          })}
        </section>

        {/* Workflow Summary */}
        <section id="alur" className="p-6 md:p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              Alur Kerja Terpadu Satu Tahun Ajaran
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              Seluruh dokumen saling terhubung sehingga perubahan pada TP atau materi dapat diselaraskan ke dokumen turunan.
            </p>
          </div>
          <div id="asesmen" className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1.5">
              <p className="font-mono text-xs font-semibold text-blue-700 dark:text-sky-400">01. Persiapan</p>
              <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
                Identitas Sekolah & Referensi Buku
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Lengkapi profil guru, kop sekolah, kalender akademik, dan tentukan buku utama mata pelajaran.
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="font-mono text-xs font-semibold text-blue-700 dark:text-sky-400">02. Otomatisasi</p>
              <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
                Generate CP, ATP, PROTA, PROSEM & Bahan Ajar
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Susun seluruh perangkat satu tahun bertahap sambil meninjau dan menyetujui setiap dokumen.
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="font-mono text-xs font-semibold text-blue-700 dark:text-sky-400">03. Pelaksanaan & Evaluasi</p>
              <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
                Jurnal Mengajar, Kuis Online & Analisis Nilai
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Pantau checklist PROSEM bulanan, bagikan kuis siswa lewat HP, dan cetak laporan pengesahan resmi.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-6 py-5 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
        AI SMART TEACHER · Platform Administrasi Pendidikan & Asesmen Digital
      </footer>
    </div>
  );
};
