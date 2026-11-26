import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LayoutShell } from './components/LayoutShell';
import { LandingAuthView } from './components/LandingAuthView';
import { DashboardView } from './components/DashboardView';
import { ProfileSchoolSetupView } from './components/ProfileSchoolSetupView';
import { TextbookLibraryView } from './components/TextbookLibraryView';
import { CurriculumAiView } from './components/CurriculumAiView';
import { ProtaProsemView } from './components/ProtaProsemView';
import { TeachingDevicesView } from './components/TeachingDevicesView';
import { AssessmentSuiteView } from './components/AssessmentSuiteView';
import { StudentQuizPortal } from './components/StudentQuizPortal';
import { ClassGradeJournalView } from './components/ClassGradeJournalView';

function MainRouter() {
  const { user, authReady, activePage } = useApp();

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          Memuat ruang kerja AI SMART TEACHER...
        </p>
      </div>
    );
  }

  if (!user) {
    return <LandingAuthView />;
  }

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return <DashboardView />;
      case 'profil-guru':
        return <ProfileSchoolSetupView section="profil" />;
      case 'identitas-sekolah':
        return <ProfileSchoolSetupView section="sekolah" />;
      case 'pengaturan-kurikulum':
        return <ProfileSchoolSetupView section="kurikulum" />;
      case 'kalender-pendidikan':
        return <ProfileSchoolSetupView section="kalender" />;
      case 'pengaturan-ai':
        return <ProfileSchoolSetupView section="ai" />;
      case 'database-buku':
        return <TextbookLibraryView />;
      case 'ai-auto-curriculum':
        return <CurriculumAiView mode="auto" />;
      case 'generate-all':
        return <CurriculumAiView mode="generate-all" />;
      case 'cp':
        return <CurriculumAiView mode="cp" />;
      case 'tp':
        return <CurriculumAiView mode="tp" />;
      case 'atp':
        return <CurriculumAiView mode="atp" />;
      case 'prota':
        return <ProtaProsemView mode="prota" />;
      case 'prosem':
        return <ProtaProsemView mode="prosem" />;
      case 'modul-ajar':
        return <TeachingDevicesView mode="modul-ajar" />;
      case 'bahan-ajar':
        return <TeachingDevicesView mode="bahan-ajar" />;
      case 'lkpd':
        return <TeachingDevicesView mode="lkpd" />;
      case 'powerpoint':
        return <TeachingDevicesView mode="powerpoint" />;
      case 'bank-soal':
        return <AssessmentSuiteView mode="bank-soal" />;
      case 'kisi-kisi':
        return <AssessmentSuiteView mode="kisi-kisi" />;
      case 'asesmen-ujian':
        return <AssessmentSuiteView mode="asesmen-ujian" />;
      case 'kuis-online':
        return <AssessmentSuiteView mode="kuis-online" />;
      case 'portal-siswa':
        return <StudentQuizPortal />;
      case 'kelas-siswa':
        return <ClassGradeJournalView mode="kelas-siswa" />;
      case 'penilaian':
        return <ClassGradeJournalView mode="penilaian" />;
      case 'analisis-hasil':
        return <ClassGradeJournalView mode="analisis-hasil" />;
      case 'remedial':
        return <ClassGradeJournalView mode="remedial" />;
      case 'pengayaan':
        return <ClassGradeJournalView mode="pengayaan" />;
      case 'jurnal-mengajar':
        return <ClassGradeJournalView mode="jurnal-mengajar" />;
      case 'laporan':
        return <ClassGradeJournalView mode="laporan" />;
      case 'arsip-dokumen':
        return <ClassGradeJournalView mode="arsip-dokumen" />;
      default:
        return <DashboardView />;
    }
  };

  return <LayoutShell>{renderPage()}</LayoutShell>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <MainRouter />
      </AppProvider>
    </ErrorBoundary>
  );
}
