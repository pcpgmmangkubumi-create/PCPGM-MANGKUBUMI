import { EducationLevel } from '../types/education';

export const EDUCATION_LEVELS: EducationLevel[] = [
  'PAUD/TK/RA',
  'SD/MI',
  'SMP/MTs',
  'SMA/MA',
  'SMK/MAK',
  'SLB',
];

export const CLASS_OPTIONS_BY_LEVEL: Record<EducationLevel, { grade: string; phase: string }[]> = {
  'PAUD/TK/RA': [
    { grade: 'Kelompok Bermain (KB)', phase: 'Fondasi' },
    { grade: 'TK A', phase: 'Fondasi' },
    { grade: 'TK B / RA B', phase: 'Fondasi' },
  ],
  'SD/MI': [
    { grade: 'Kelas I', phase: 'Fase A' },
    { grade: 'Kelas II', phase: 'Fase A' },
    { grade: 'Kelas III', phase: 'Fase B' },
    { grade: 'Kelas IV', phase: 'Fase B' },
    { grade: 'Kelas V', phase: 'Fase C' },
    { grade: 'Kelas VI', phase: 'Fase C' },
  ],
  'SMP/MTs': [
    { grade: 'Kelas VII', phase: 'Fase D' },
    { grade: 'Kelas VIII', phase: 'Fase D' },
    { grade: 'Kelas IX', phase: 'Fase D' },
  ],
  'SMA/MA': [
    { grade: 'Kelas X', phase: 'Fase E' },
    { grade: 'Kelas XI', phase: 'Fase F' },
    { grade: 'Kelas XII', phase: 'Fase F' },
  ],
  'SMK/MAK': [
    { grade: 'Kelas X', phase: 'Fase E' },
    { grade: 'Kelas XI', phase: 'Fase F' },
    { grade: 'Kelas XII', phase: 'Fase F' },
    { grade: 'Kelas XIII (Program 4 Tahun)', phase: 'Fase F' },
  ],
  SLB: [
    { grade: 'SDLB Kelas I–II', phase: 'Fase A' },
    { grade: 'SDLB Kelas III–IV', phase: 'Fase B' },
    { grade: 'SDLB Kelas V–VI', phase: 'Fase C' },
    { grade: 'SMPLB Kelas VII–IX', phase: 'Fase D' },
    { grade: 'SMALB Kelas X', phase: 'Fase E' },
    { grade: 'SMALB Kelas XI–XII', phase: 'Fase F' },
  ],
};

export const DEFAULT_CURRICULA = [
  {
    code: 'KM',
    name: 'Kurikulum Merdeka',
    description: 'Struktur Elemen, Capaian Pembelajaran (CP), Tujuan Pembelajaran (TP), ATP, dan Modul Ajar.',
    structureComponents: ['Elemen', 'CP', 'TP', 'ATP', 'PROTA', 'PROSEM', 'Modul Ajar', 'Profil Pelajar Pancasila'],
  },
  {
    code: 'KM-REVISI',
    name: 'Kurikulum Merdeka (Revisi CP Terbaru)',
    description: 'Menyesuaikan pembaruan CP BSKAP terbaru dan 8 Dimensi Profil Lulusan / Pembelajaran Mendalam.',
    structureComponents: ['Elemen', 'CP Revisi', 'TP', 'ATP', 'PROTA', 'PROSEM', 'Modul Ajar', 'Profil Lulusan'],
  },
  {
    code: 'K13',
    name: 'Kurikulum 2013 (K-13)',
    description: 'Struktur Kompetensi Inti (KI-1 s.d. KI-4), Kompetensi Dasar (KD), Indikator Pencapaian Kompetensi (IPK), Silabus, dan RPP.',
    structureComponents: ['KI', 'KD', 'IPK', 'Silabus', 'PROTA', 'PROSEM', 'RPP'],
  },
  {
    code: 'KSP',
    name: 'Kurikulum Satuan Pendidikan (KSP)',
    description: 'Kurikulum operasional yang disesuaikan dengan karakteristik satuan pendidikan dan konteks lokal.',
    structureComponents: ['Konteks Satuan', 'CP/Kompetensi', 'TP', 'ATP', 'PROTA', 'PROSEM', 'Modul Ajar'],
  },
];

export const SUBJECT_SUGGESTIONS = [
  'Pendidikan Agama Islam dan Budi Pekerti',
  "Al-Qur'an Hadis",
  'Akidah Akhlak',
  'Fikih',
  'Sejarah Kebudayaan Islam (SKI)',
  'Bahasa Arab',
  'Pendidikan Pancasila',
  'Bahasa Indonesia',
  'Matematika',
  'Matematika Tingkat Lanjut',
  'Ilmu Pengetahuan Alam dan Sosial (IPAS)',
  'Ilmu Pengetahuan Alam (IPA)',
  'Ilmu Pengetahuan Sosial (IPS)',
  'Bahasa Inggris',
  'Informatika',
  'Koding dan Kecerdasan Artifisial',
  'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
  'Seni dan Budaya',
  'Seni, Budaya, dan Prakarya',
  'Prakarya dan Kewirausahaan',
  'Fisika',
  'Kimia',
  'Biologi',
  'Ekonomi',
  'Sejarah',
  'Geografi',
  'Sosiologi',
  'Antropologi',
  'Ilmu Tafsir',
  'Ilmu Hadis',
  'Ushul Fikih',
  'Ilmu Kalam',
  'Akhlak Tasawuf',
  'Projek IPAS',
  'Dasar-Dasar Program Keahlian',
  'Konsentrasi Keahlian',
  'Projek Kreatif dan Kewirausahaan',
  'Program Kebutuhan Khusus',
  'Nilai Agama dan Budi Pekerti',
  'Jati Diri',
  'Dasar-Dasar Literasi, Matematika, Sains, Teknologi, Rekayasa, dan Seni',
  'Muatan Lokal',
];

export const QUESTION_TYPES = [
  { id: 'pilihan_ganda', label: 'Pilihan Ganda' },
  { id: 'pg_kompleks', label: 'Pilihan Ganda Kompleks' },
  { id: 'benar_salah', label: 'Benar / Salah' },
  { id: 'menjodohkan', label: 'Menjodohkan' },
  { id: 'isian_singkat', label: 'Isian Singkat' },
  { id: 'jawaban_singkat', label: 'Jawaban Singkat' },
  { id: 'uraian', label: 'Uraian / Esai' },
  { id: 'studi_kasus', label: 'Studi Kasus' },
  { id: 'berbasis_gambar', label: 'Soal Berbasis Gambar' },
  { id: 'literasi', label: 'Soal Literasi' },
  { id: 'numerasi', label: 'Soal Numerasi' },
  { id: 'hots', label: 'Soal HOTS' },
  { id: 'praktik', label: 'Soal Praktik' },
];

export const MONTHS_SEMESTER_1 = ['Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const MONTHS_SEMESTER_2 = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni'];

export const DEFAULT_MONTHLY_CALENDAR = [
  { month: 'Juli', totalWeeks: 4, nonEffectiveWeeks: 2, effectiveWeeks: 2, notes: 'Libur Semester & MPLS' },
  { month: 'Agustus', totalWeeks: 4, nonEffectiveWeeks: 0, effectiveWeeks: 4, notes: 'Peringatan HUT RI' },
  { month: 'September', totalWeeks: 4, nonEffectiveWeeks: 1, effectiveWeeks: 3, notes: 'Asesmen Tengah Semester' },
  { month: 'Oktober', totalWeeks: 5, nonEffectiveWeeks: 1, effectiveWeeks: 4, notes: 'Kegiatan Kokurikuler / Jeda' },
  { month: 'November', totalWeeks: 4, nonEffectiveWeeks: 0, effectiveWeeks: 4, notes: 'Efektif penuh' },
  { month: 'Desember', totalWeeks: 4, nonEffectiveWeeks: 3, effectiveWeeks: 1, notes: 'SAS / PAS & Libur Semester 1' },
  { month: 'Januari', totalWeeks: 4, nonEffectiveWeeks: 0, effectiveWeeks: 4, notes: 'Awal Semester 2' },
  { month: 'Februari', totalWeeks: 4, nonEffectiveWeeks: 0, effectiveWeeks: 4, notes: 'Efektif penuh' },
  { month: 'Maret', totalWeeks: 4, nonEffectiveWeeks: 1, effectiveWeeks: 3, notes: 'STS / Kegiatan Tengah Semester' },
  { month: 'April', totalWeeks: 4, nonEffectiveWeeks: 1, effectiveWeeks: 3, notes: 'Libur Khusus / Hari Besar' },
  { month: 'Mei', totalWeeks: 5, nonEffectiveWeeks: 2, effectiveWeeks: 3, notes: 'Persiapan SAT / Asesmen Akhir' },
  { month: 'Juni', totalWeeks: 4, nonEffectiveWeeks: 3, effectiveWeeks: 1, notes: 'SAT / PAT, Rapor & Libur Kenaikan' },
];

export {
  detectInstitutionTrack,
  getMinutesPerJp,
  getEffectiveWeeks,
  getOfficialJpStandard,
  formatJpDuration,
  getDefaultPhaseSplits,
  type InstitutionTrack,
  type OfficialJpStandard,
} from './jpStandards';

export {
  getOfficialSubjectsForContext,
  pickAutoSubjectForContext,
  resolveSubjectRegulationContext,
  findMatchingOfficialSubject,
  type OfficialSubjectEntry,
  type SubjectRegulationContext,
} from './subjectCatalog';

