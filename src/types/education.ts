export type UserRole = 'admin' | 'teacher' | 'student';

export type EducationLevel =
  | 'PAUD/TK/RA'
  | 'SD/MI'
  | 'SMP/MTs'
  | 'SMA/MA'
  | 'SMK/MAK'
  | 'SLB';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  nip?: string;
  nuptk?: string;
  jabatan?: string;
  subject?: string;
  classesTaught?: string;
  phase?: string;
  level?: string;
  schoolName?: string;
  signatureDataUrl?: string;
  avatarUrl?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SchoolIdentity {
  id?: string;
  ownerId: string;
  name: string;
  npsn?: string;
  level: EducationLevel | string;
  status?: string;
  address?: string;
  village?: string;
  district?: string;
  regency?: string;
  province?: string;
  principalName?: string;
  principalNip?: string;
  teacherName?: string;
  teacherNip?: string;
  subject?: string;
  academicYear: string;
  semester: string;
  logoDataUrl?: string;
  agencyLogoDataUrl?: string;
  letterheadDataUrl?: string;
  titiMangsa?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CurriculumConfig {
  id?: string;
  ownerId: string;
  name: string;
  code: string;
  description?: string;
  structureComponents?: string[];
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface HolidayItem {
  date: string;
  title: string;
  type: 'nasional' | 'semester' | 'sekolah';
}

export interface MonthlyWeekBreakdown {
  month: string;
  totalWeeks: number;
  nonEffectiveWeeks: number;
  effectiveWeeks: number;
  notes?: string;
}

export interface AcademicCalendar {
  id?: string;
  ownerId: string;
  academicYear: string;
  semester: string;
  totalWeeks: number;
  effectiveWeeks: number;
  nonEffectiveWeeks?: number;
  holidays?: HolidayItem[];
  monthlySchedule?: MonthlyWeekBreakdown[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TextbookChapter {
  chapterNumber: string;
  title: string;
  subchapters: string[];
  pageRange?: string;
  summary: string;
  practiceTopics?: string[];
  relevanceLevel?: 'sangat_relevan' | 'relevan' | 'pendukung' | 'kurang_relevan';
  curriculumAlignment?: string;
  recommendedSemester?: string;
}

export interface TextbookRecord {
  id?: string;
  ownerId: string;
  title: string;
  author?: string;
  publisher?: string;
  publishYear?: string;
  curriculum?: string;
  level?: string;
  grade?: string;
  subject: string;
  isbn?: string;
  pageCount?: number;
  referenceType: 'primary' | 'companion' | 'module' | 'government' | 'custom';
  sourceUrl?: string;
  fileName?: string;
  extractedSummary?: string;
  chapters?: TextbookChapter[];
  status: 'ready' | 'processing' | 'needs_review';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CurriculumElementMapping {
  elementName: string;
  cpSummary: string;
  competencies: string[];
  scopeOfMaterial: string[];
  topics: {
    topicTitle: string;
    subtopics: string[];
    tpCode: string;
    tpDescription: string;
    atpOrder: number;
    indicators: string[];
    estimatedMeetings: number;
    estimatedJp: number;
    bookReference: string;
  }[];
  graduateProfileDimensions: string[];
  verificationNote: string;
}

export interface WorkspaceRecord {
  id?: string;
  ownerId: string;
  academicYear: string;
  semester: string;
  level: string;
  grade: string;
  phase?: string;
  subject: string;
  curriculum: string;
  jpPerWeek?: number;
  primaryBookId?: string;
  curriculumData?: {
    elements?: CurriculumElementMapping[];
    generatedAt?: string;
    isAiDraft?: boolean;
  };
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type DocType =
  | 'cp'
  | 'tp'
  | 'atp'
  | 'prota'
  | 'prosem'
  | 'modul_ajar'
  | 'bahan_ajar'
  | 'lkpd'
  | 'powerpoint'
  | 'kisi_kisi'
  | 'bank_soal'
  | 'asesmen'
  | 'remedial'
  | 'pengayaan'
  | 'analisis'
  | 'laporan';

export interface LearningDocumentRecord {
  id?: string;
  ownerId: string;
  workspaceId: string;
  academicYear?: string;
  semester?: string;
  grade?: string;
  subject?: string;
  docType: DocType | string;
  title: string;
  meetingNumber?: number;
  chapterTitle?: string;
  status: 'draft' | 'approved' | 'needs_revision';
  isAiDraft?: boolean;
  sourceRef?: string;
  content?: Record<string, any>;
  version: number;
  archived?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type ProsemExecutionStatus =
  | 'belum'
  | 'berlangsung'
  | 'selesai'
  | 'ditunda'
  | 'penyesuaian';

export interface ProsemItemRecord {
  id?: string;
  ownerId: string;
  workspaceId: string;
  semester: string;
  month: string;
  weekNumber?: number;
  meetingNumber: number;
  tpCode?: string;
  topic: string;
  subtopic?: string;
  jpAllocation: number;
  plannedDate?: string;
  executionStatus: ProsemExecutionStatus;
  executionDate?: string;
  teacherNotes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProsemEvaluationEntry {
  period: string;
  evaluationType: string;
  status: string;
  essentialMaterial: string;
}

export interface ClassroomRecord {
  id?: string;
  ownerId: string;
  name: string;
  level: string;
  grade: string;
  phase?: string;
  academicYear: string;
  homeroomTeacher?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StudentRecord {
  id?: string;
  ownerId: string;
  classId: string;
  fullName: string;
  nis?: string;
  nisn?: string;
  gender?: 'L' | 'P' | '-';
  status: 'active' | 'inactive';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type QuestionType =
  | 'pilihan_ganda'
  | 'pg_kompleks'
  | 'benar_salah'
  | 'menjodohkan'
  | 'isian_singkat'
  | 'jawaban_singkat'
  | 'uraian'
  | 'studi_kasus'
  | 'berbasis_gambar'
  | 'literasi'
  | 'numerasi'
  | 'hots'
  | 'praktik';

export interface QuestionRecord {
  id?: string;
  ownerId: string;
  workspaceId: string;
  subject?: string;
  grade?: string;
  tpCode?: string;
  topic?: string;
  questionType: QuestionType | string;
  cognitiveLevel: 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | string;
  hotsTier?: 'LOTS' | 'MOTS' | 'HOTS';
  difficulty: 'mudah' | 'sedang' | 'sulit';
  category?: string;
  stem: string;
  options?: string[];
  correctAnswer?: string;
  explanation?: string;
  indicator?: string;
  rubric?: string;
  points: number;
  sourceRef?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PublicQuizQuestion {
  id: string;
  questionType: string;
  cognitiveLevel: string;
  stem: string;
  options?: string[];
  points: number;
}

export interface QuizRecord {
  id?: string;
  ownerId: string;
  workspaceId?: string;
  classId?: string;
  title: string;
  description?: string;
  subject?: string;
  grade?: string;
  accessCode: string;
  mode: 'latihan' | 'ujian';
  durationMinutes: number;
  startDate?: string;
  endDate?: string;
  maxAttempts?: number;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  passingScore?: number;
  showResultsToStudent?: boolean;
  requireStudentIdentity?: boolean;
  status: 'draft' | 'published' | 'closed';
  publicQuestions: PublicQuizQuestion[];
  sealedKey?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface QuizSubmissionRecord {
  id?: string;
  quizId: string;
  quizOwnerId: string;
  studentUid?: string;
  studentName: string;
  studentNis?: string;
  className?: string;
  answers?: Record<string, string>;
  autoScore?: number;
  finalScore: number;
  maxScore: number;
  percentage: number;
  passed?: boolean;
  gradingStatus: 'auto_graded' | 'teacher_reviewed';
  itemFeedback?: {
    questionId: string;
    earnedPoints: number;
    maxPoints: number;
    isCorrect: boolean;
    feedback: string;
    correctAnswer?: string;
  }[];
  startedAt?: unknown;
  submittedAt?: unknown;
}

export interface GradeEntryRecord {
  id?: string;
  ownerId: string;
  workspaceId?: string;
  classId: string;
  studentId: string;
  studentName: string;
  category: string;
  title?: string;
  score: number;
  maxScore: number;
  weight?: number;
  kkm?: number;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TeachingJournalRecord {
  id?: string;
  ownerId: string;
  workspaceId?: string;
  classId?: string;
  className: string;
  subject: string;
  date: string;
  meetingNumber: number;
  prosemItemId?: string;
  topic: string;
  tpCode?: string;
  activities?: string;
  presentCount: number;
  absentCount: number;
  absentStudents?: string;
  teacherNotes?: string;
  executionStatus: 'selesai' | 'berlangsung' | 'ditunda' | 'penyesuaian';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AiSettingRecord {
  ownerId: string;
  model: string;
  language: string;
  tone?: string;
  materialLength?: string;
  detailLevel?: string;
  explanationStyle?: string;
  sourcePreference?: string;
  imageStyle?: string;
  pptTheme?: string;
  updatedAt?: unknown;
}

export interface PptSlideSpec {
  slideNumber: number;
  slideType: string;
  title: string;
  subtitle?: string;
  bullets: string[];
  visualPrompt?: string;
  diagramType?: 'none' | 'process' | 'comparison' | 'hierarchy' | 'chart';
  diagramNodes?: string[];
  animationNote?: string;
  transition?: string;
  presenterNotes: string;
}
