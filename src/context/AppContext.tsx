import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import {
  getRecord,
  setRecord,
  subscribeOwnedCollection,
  subscribeCollectionByQuery,
  createRecord,
} from '../lib/firestoreHelpers';
import { where, doc, onSnapshot, getDocs, collection, query, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  UserProfile,
  SchoolIdentity,
  CurriculumConfig,
  AcademicCalendar,
  TextbookRecord,
  WorkspaceRecord,
  LearningDocumentRecord,
  ProsemItemRecord,
  ClassroomRecord,
  StudentRecord,
  QuestionRecord,
  QuizRecord,
  QuizSubmissionRecord,
  GradeEntryRecord,
  TeachingJournalRecord,
  AiSettingRecord,
} from '../types/education';
import { DEFAULT_CURRICULA, DEFAULT_MONTHLY_CALENDAR } from '../lib/curriculumData';

export type NavPageId =
  | 'dashboard'
  | 'profil-guru'
  | 'identitas-sekolah'
  | 'pengaturan-kurikulum'
  | 'kalender-pendidikan'
  | 'database-buku'
  | 'ai-auto-curriculum'
  | 'generate-all'
  | 'cp'
  | 'tp'
  | 'atp'
  | 'prota'
  | 'prosem'
  | 'modul-ajar'
  | 'bahan-ajar'
  | 'lkpd'
  | 'powerpoint'
  | 'bank-soal'
  | 'kisi-kisi'
  | 'asesmen-ujian'
  | 'kuis-online'
  | 'kelas-siswa'
  | 'penilaian'
  | 'analisis-hasil'
  | 'remedial'
  | 'pengayaan'
  | 'jurnal-mengajar'
  | 'laporan'
  | 'arsip-dokumen'
  | 'pengaturan-ai'
  | 'portal-siswa';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface AppContextValue {
  user: User | null;
  authReady: boolean;
  profile: UserProfile | null;
  activePage: NavPageId;
  setActivePage: (page: NavPageId) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  notify: (text: string, type?: 'success' | 'error' | 'info') => void;
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;

  // Data collections
  schools: SchoolIdentity[];
  activeSchool: SchoolIdentity | null;
  curricula: CurriculumConfig[];
  calendars: AcademicCalendar[];
  textbooks: TextbookRecord[];
  workspaces: WorkspaceRecord[];
  activeWorkspace: WorkspaceRecord | null;
  setActiveWorkspaceId: (id: string) => void;
  documents: LearningDocumentRecord[];
  prosemItems: ProsemItemRecord[];
  classes: ClassroomRecord[];
  students: StudentRecord[];
  questions: QuestionRecord[];
  quizzes: QuizRecord[];
  quizSubmissions: QuizSubmissionRecord[];
  grades: GradeEntryRecord[];
  journals: TeachingJournalRecord[];
  aiSettings: AiSettingRecord | null;
  dataError: string | null;
  resetting: boolean;
  resetAllDataExceptProfileAndSchool: () => Promise<void>;
  deleteWorkspaceAndRelatedData: (workspaceId: string) => Promise<void>;
  isCreateWorkspaceOpen: boolean;
  openCreateWorkspaceModal: () => void;
  closeCreateWorkspaceModal: () => void;
  isResetModalOpen: boolean;
  openResetModal: () => void;
  closeResetModal: () => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activePage, setActivePage] = useState<NavPageId>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('quiz')) return 'portal-siswa';
    return 'dashboard';
  });
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);

  const [schools, setSchools] = useState<SchoolIdentity[]>([]);
  const [curricula, setCurricula] = useState<CurriculumConfig[]>([]);
  const [calendars, setCalendars] = useState<AcademicCalendar[]>([]);
  const [textbooks, setTextbooks] = useState<TextbookRecord[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('');
  const [documents, setDocuments] = useState<LearningDocumentRecord[]>([]);
  const [prosemItems, setProsemItems] = useState<ProsemItemRecord[]>([]);
  const [classes, setClasses] = useState<ClassroomRecord[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [questions, setQuestions] = useState<QuestionRecord[]>([]);
  const [quizzes, setQuizzes] = useState<QuizRecord[]>([]);
  const [quizSubmissions, setQuizSubmissions] = useState<QuizSubmissionRecord[]>([]);
  const [grades, setGrades] = useState<GradeEntryRecord[]>([]);
  const [journals, setJournals] = useState<TeachingJournalRecord[]>([]);
  const [aiSettings, setAiSettings] = useState<AiSettingRecord | null>(null);
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));

  const notify = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthReady(true);
      if (u) {
        try {
          const existing = await getRecord<UserProfile>('users', u.uid);
          if (!existing) {
            const isBootAdmin = u.email === 'pcpgmmangkubumi@gmail.com';
            const newProfile: UserProfile = {
              uid: u.uid,
              email: u.email || '',
              displayName: u.displayName || 'Guru Indonesia',
              role: isBootAdmin ? 'admin' : 'teacher',
              jabatan: isBootAdmin ? 'Administrator & Guru' : 'Guru Mata Pelajaran',
              level: 'SMP/MTs',
              phase: 'Fase D',
              subject: 'Bahasa Indonesia',
              classesTaught: 'Kelas VII',
              avatarUrl: u.photoURL || '',
            };
            await setRecord('users', u.uid, newProfile, true);
            setProfile(newProfile);

            // Bootstrap default curricula and calendar for first-time teacher
            for (const c of DEFAULT_CURRICULA) {
              await createRecord('curricula', {
                ownerId: u.uid,
                name: c.name,
                code: c.code,
                description: c.description,
                structureComponents: c.structureComponents,
                isActive: c.code === 'KM',
              });
            }
            await createRecord('calendars', {
              ownerId: u.uid,
              academicYear: '2026/2027',
              semester: 'Semester 1 & 2',
              totalWeeks: 50,
              effectiveWeeks: 39,
              nonEffectiveWeeks: 11,
              holidays: [
                { date: '2026-08-17', title: 'Hari Kemerdekaan RI', type: 'nasional' },
                { date: '2026-12-21', title: 'Libur Semester 1', type: 'semester' },
              ],
              monthlySchedule: DEFAULT_MONTHLY_CALENDAR,
            });
          } else {
            setProfile(existing);
          }

          // Independently ensure default ai_settings exist for the signed-in user
          const existingAi = await getRecord<AiSettingRecord>('ai_settings', u.uid);
          if (!existingAi) {
            const defaultAi: AiSettingRecord = {
              ownerId: u.uid,
              model: 'gemini-4-hydrogen',
              language: 'Bahasa Indonesia Baku',
              tone: 'Akademik, komunikatif, dan mudah dipahami siswa',
              materialLength: 'Sedang-Lengkap',
              detailLevel: 'Mendalam & Terstruktur',
              explanationStyle: 'Konseptual dengan contoh nyata',
              sourcePreference: 'Utamakan buku utama yang diunggah guru',
              imageStyle: 'Ilustrasi edukatif bersih',
              pptTheme: 'cobalt',
            };
            await setRecord('ai_settings', u.uid, defaultAi, true);
            setAiSettings(defaultAi);
          } else {
            setAiSettings(existingAi);
          }
        } catch (err: any) {
          console.error('Profile sync error:', err);
        }
      } else {
        setProfile(null);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !user) {
      setSchools([]);
      setCurricula([]);
      setCalendars([]);
      setTextbooks([]);
      setWorkspaces([]);
      setDocuments([]);
      setProsemItems([]);
      setClasses([]);
      setStudents([]);
      setQuestions([]);
      setQuizzes([]);
      setQuizSubmissions([]);
      setGrades([]);
      setJournals([]);
      setAiSettings(null);
      return;
    }

    const handleErr = (err: Error) => {
      setDataError(err.message);
    };

    const unsubs = [
      subscribeOwnedCollection<SchoolIdentity>('schools', user.uid, setSchools, [], handleErr),
      subscribeOwnedCollection<CurriculumConfig>('curricula', user.uid, setCurricula, [], handleErr),
      subscribeOwnedCollection<AcademicCalendar>('calendars', user.uid, setCalendars, [], handleErr),
      subscribeOwnedCollection<TextbookRecord>('textbooks', user.uid, setTextbooks, [], handleErr),
      subscribeOwnedCollection<WorkspaceRecord>(
        'workspaces',
        user.uid,
        (items) => {
          setWorkspaces(items);
          setActiveWorkspaceId((prev) => (prev && items.some((w) => w.id === prev) ? prev : items[0]?.id || ''));
        },
        [],
        handleErr
      ),
      subscribeOwnedCollection<LearningDocumentRecord>('documents', user.uid, setDocuments, [], handleErr),
      subscribeOwnedCollection<ProsemItemRecord>('prosem_items', user.uid, setProsemItems, [], handleErr),
      subscribeOwnedCollection<ClassroomRecord>('classes', user.uid, setClasses, [], handleErr),
      subscribeOwnedCollection<StudentRecord>('students', user.uid, setStudents, [], handleErr),
      subscribeOwnedCollection<QuestionRecord>('questions', user.uid, setQuestions, [], handleErr),
      subscribeOwnedCollection<QuizRecord>('quizzes', user.uid, setQuizzes, [], handleErr),
      subscribeCollectionByQuery<QuizSubmissionRecord>(
        'quiz_submissions',
        [where('quizOwnerId', '==', user.uid)],
        setQuizSubmissions,
        handleErr
      ),
      subscribeOwnedCollection<GradeEntryRecord>('grades', user.uid, setGrades, [], handleErr),
      subscribeOwnedCollection<TeachingJournalRecord>('journals', user.uid, setJournals, [], handleErr),
      onSnapshot(
        doc(db, 'ai_settings', user.uid),
        (snap) => {
          if (snap.exists()) {
            setAiSettings(snap.data() as AiSettingRecord);
          }
        },
        (err) => {
          console.error('AI settings listener error:', err);
        }
      ),
    ];

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, user]);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      notify('Berhasil masuk ke AI SMART TEACHER.', 'success');
    } catch (err: any) {
      notify(err?.message || 'Gagal masuk dengan akun Google.', 'error');
    }
  };

  const logout = async () => {
    await signOut(auth);
    notify('Anda telah keluar dari akun.', 'info');
  };

  const [resetting, setResetting] = useState(false);

  const commitBatchDeletes = async (refs: Array<ReturnType<typeof doc>>) => {
    for (let i = 0; i < refs.length; i += 300) {
      const chunk = refs.slice(i, i + 300);
      const batch = writeBatch(db);
      for (const ref of chunk) {
        batch.delete(ref);
      }
      await batch.commit();
    }
  };

  const resetAllDataExceptProfileAndSchool = async () => {
    if (!user) {
      notify('Pengguna belum masuk.', 'error');
      return;
    }
    setResetting(true);
    try {
      const collectionsToClear = [
        'documents',
        'prosem_items',
        'students',
        'grades',
        'journals',
        'quizzes',
        'questions',
        'classes',
        'workspaces',
        'textbooks',
        'calendars',
        'curricula',
      ];
      let deletedCount = 0;
      for (const coll of collectionsToClear) {
        try {
          const q = query(collection(db, coll), where('ownerId', '==', user.uid));
          const snap = await getDocs(q);
          if (!snap.empty) {
            await commitBatchDeletes(snap.docs.map((d) => d.ref));
            deletedCount += snap.size;
          }
        } catch (err) {
          console.error(`Error clearing collection ${coll}:`, err);
        }
      }
      try {
        const qSub = query(collection(db, 'quiz_submissions'), where('quizOwnerId', '==', user.uid));
        const snapSub = await getDocs(qSub);
        if (!snapSub.empty) {
          await commitBatchDeletes(snapSub.docs.map((d) => d.ref));
          deletedCount += snapSub.size;
        }
      } catch (err) {
        console.error('Error clearing quiz_submissions:', err);
      }
      setActiveWorkspaceId('');
      setIsResetModalOpen(false);
      notify(
        deletedCount > 0
          ? `Reset selesai: ${deletedCount} data administrasi dihapus. Profil guru dan identitas sekolah tetap aman.`
          : 'Semua data administrasi sudah bersih. Profil guru dan identitas sekolah tetap aman.',
        'success'
      );
    } catch (err: any) {
      console.error('Reset error:', err);
      notify(err?.message || 'Gagal mereset data.', 'error');
    } finally {
      setResetting(false);
    }
  };

  const deleteWorkspaceAndRelatedData = async (workspaceId: string) => {
    if (!user || !workspaceId) return;
    try {
      const wsRelatedCollections = ['documents', 'prosem_items', 'questions'];
      for (const coll of wsRelatedCollections) {
        try {
          const q = query(
            collection(db, coll),
            where('ownerId', '==', user.uid),
            where('workspaceId', '==', workspaceId)
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            await commitBatchDeletes(snap.docs.map((d) => d.ref));
          }
        } catch (err) {
          console.error(`Error clearing ${coll} for workspace ${workspaceId}:`, err);
        }
      }
      await commitBatchDeletes([doc(db, 'workspaces', workspaceId)]);
      if (activeWorkspaceId === workspaceId) {
        const remaining = workspaces.filter((w) => w.id !== workspaceId);
        setActiveWorkspaceId(remaining[0]?.id || '');
      }
      notify('Administrasi beserta perangkatnya berhasil dihapus.', 'success');
    } catch (err: any) {
      notify(err?.message || 'Gagal menghapus administrasi.', 'error');
    }
  };

  const activeSchool = useMemo(() => schools[0] || null, [schools]);
  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0] || null,
    [workspaces, activeWorkspaceId]
  );

  return (
    <AppContext.Provider
      value={{
        user,
        authReady,
        profile,
        activePage,
        setActivePage,
        theme,
        toggleTheme,
        signInWithGoogle,
        logout,
        notify,
        toasts,
        dismissToast,
        schools,
        activeSchool,
        curricula,
        calendars,
        textbooks,
        workspaces,
        activeWorkspace,
        setActiveWorkspaceId,
        documents,
        prosemItems,
        classes,
        students,
        questions,
        quizzes,
        quizSubmissions,
        grades,
        journals,
        aiSettings,
        dataError,
        resetting,
        resetAllDataExceptProfileAndSchool,
        deleteWorkspaceAndRelatedData,
        isCreateWorkspaceOpen,
        openCreateWorkspaceModal: () => setIsCreateWorkspaceOpen(true),
        closeCreateWorkspaceModal: () => setIsCreateWorkspaceOpen(false),
        isResetModalOpen,
        openResetModal: () => setIsResetModalOpen(true),
        closeResetModal: () => setIsResetModalOpen(false),
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
