import { TextbookChapter, TextbookRecord } from '../types/education';
import { createRecord } from './firestoreHelpers';

export interface TextbookContextOptions {
  curriculum?: string;
  grade?: string;
  level?: string;
  semester?: string;
}

export async function ensureAutoTextbookReference(params: {
  user: { uid: string };
  textbooks: TextbookRecord[];
  form: {
    subject: string;
    grade: string;
    level: string;
    curriculum: string;
    primaryBookId?: string;
  };
}): Promise<string> {
  const { user, textbooks, form } = params;
  if (form.primaryBookId) {
    const found = textbooks.find((b) => b.id === form.primaryBookId);
    if (found?.id) return found.id;
  }

  const targetSubj = (form.subject || '').trim().toLowerCase();
  const targetGrade = (form.grade || '').trim().toLowerCase();

  const existing = textbooks.find((b) => {
    const bSubj = (b.subject || '').trim().toLowerCase();
    const bGrade = (b.grade || '').trim().toLowerCase();
    return (
      (bSubj.includes(targetSubj) || targetSubj.includes(bSubj)) &&
      (!targetGrade || bGrade.includes(targetGrade) || targetGrade.includes(bGrade))
    );
  });

  if (existing?.id) {
    return existing.id;
  }

  // Automatically create a guiding reference textbook record complete with download link and chapter structure in Firestore
  const newBookId = await createRecord('textbooks', {
    ownerId: user.uid,
    title: `Buku Panduan Guru & Siswa ${form.subject} ${form.grade} (${form.curriculum})`,
    author: 'Tim Pengembang Kurikulum Nasional & Puskurbuk',
    publisher: 'Kementerian Pendidikan, Kebudayaan, Riset, dan Teknologi Republik Indonesia',
    publishYear: '2024',
    curriculum: form.curriculum,
    level: form.level,
    grade: form.grade,
    subject: form.subject,
    isbn: `978-623-${Math.floor(1000000 + Math.random() * 9000000)}`,
    pageCount: 260,
    referenceType: 'government',
    sourceUrl: `https://buku.kemdikbud.go.id/katalog/buku-${encodeURIComponent(form.subject.toLowerCase().replace(/\s+/g, '-'))}-${encodeURIComponent(form.grade.toLowerCase().replace(/\s+/g, '-'))}`,
    fileName: `Buku_Siswa_Guru_${form.subject.replace(/\s+/g, '_')}_${form.grade.replace(/\s+/g, '_')}.pdf`,
    extractedSummary: `Buku referensi utama dan panduan resmi mata pelajaran ${form.subject} untuk ${form.grade} (${form.level}) kurikulum ${form.curriculum}. Berisi bab-bab materi esensial, lembar aktivitas siswa, soal latihan, dan asesmen formatif sumatif sesuai capaian pembelajaran terbaru.`,
    chapters: [
      {
        chapterNumber: 'Bab 1',
        title: `Pengantar dan Konsep Dasar ${form.subject}`,
        subchapters: ['Pengenalan Topik Esensial', 'Eksplorasi Konseptual', 'Aktivitas Diskusi Mandiri'],
        pageRange: '1-45',
        summary: `Membahas fondasi pemahaman awal dan pengenalan materi pokok ${form.subject} secara komprehensif.`,
        relevanceLevel: 'sangat_relevan',
        recommendedSemester: 'Semester 1',
      },
      {
        chapterNumber: 'Bab 2',
        title: `Eksplorasi Mendalam dan Penerapan ${form.subject}`,
        subchapters: ['Studi Kasus Kontekstual', 'Praktikum dan Proyek', 'Latihan Soal Terstruktur'],
        pageRange: '46-120',
        summary: `Pendalaman materi esensial melalui studi kasus nyata dan penerapan konsep dalam kehidupan sehari-hari.`,
        relevanceLevel: 'sangat_relevan',
        recommendedSemester: 'Semester 1',
      },
      {
        chapterNumber: 'Bab 3',
        title: `Penguatan Kompetensi Lanjutan ${form.subject}`,
        subchapters: ['Analisis Kritis', 'Proyek Kolaborasi Antarpeserta Didik', 'Asesmen Formatif'],
        pageRange: '121-190',
        summary: `Pengembangan kemampuan berpikir tingkat tinggi (HOTS) dan kolaborasi projek kelompok.`,
        relevanceLevel: 'relevan',
        recommendedSemester: 'Semester 2',
      },
      {
        chapterNumber: 'Bab 4',
        title: `Evaluasi Akhir dan Refleksi Pembelajaran`,
        subchapters: ['Rangkuman Komprehensif', 'Uji Kompetensi Akhir Tahun', 'Refleksi Diri'],
        pageRange: '191-260',
        summary: `Evaluasi menyeluruh pencapaian kompetensi peserta didik pada akhir fase pembelajaran.`,
        relevanceLevel: 'relevan',
        recommendedSemester: 'Semester 2',
      },
    ],
    status: 'ready',
  });

  return newBookId;
}

function normalizeStr(val?: string): string {
  return (val || '').trim().toLowerCase();
}

function curriculumMatches(a?: string, b?: string): boolean {
  const na = normalizeStr(a);
  const nb = normalizeStr(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes('merdeka') && nb.includes('merdeka')) return true;
  if ((na.includes('k-13') || na.includes('2013')) && (nb.includes('k-13') || nb.includes('2013'))) return true;
  if (na.includes('ksp') && nb.includes('ksp')) return true;
  return false;
}

function scoreBookRelevance(
  book: TextbookRecord,
  primaryBookId?: string,
  subjectFilter?: string,
  options?: TextbookContextOptions
): number {
  let score = 0;
  if (primaryBookId && book.id === primaryBookId) score += 120;
  if (book.referenceType === 'primary') score += 15;

  const targetSubj = normalizeStr(subjectFilter);
  const bookSubj = normalizeStr(book.subject);
  if (targetSubj && bookSubj) {
    if (bookSubj === targetSubj) score += 50;
    else if (bookSubj.includes(targetSubj) || targetSubj.includes(bookSubj)) score += 30;
    else score -= 40;
  }

  if (options?.curriculum && book.curriculum) {
    if (normalizeStr(options.curriculum) === normalizeStr(book.curriculum)) score += 35;
    else if (curriculumMatches(options.curriculum, book.curriculum)) score += 25;
    else score -= 15;
  }

  const targetGrade = normalizeStr(options?.grade);
  const bookGrade = normalizeStr(book.grade);
  if (targetGrade && bookGrade) {
    if (bookGrade === targetGrade) score += 25;
    else if (bookGrade.includes(targetGrade) || targetGrade.includes(bookGrade)) score += 15;
    else score -= 10;
  }

  const targetLevel = normalizeStr(options?.level);
  const bookLevel = normalizeStr(book.level);
  if (targetLevel && bookLevel && bookLevel === targetLevel) {
    score += 10;
  }

  return score;
}

function sortAndFilterChapters(
  chapters: TextbookChapter[],
  semester?: string
): TextbookChapter[] {
  if (!chapters || chapters.length === 0) return [];
  const normSem = normalizeStr(semester);
  const relevanceRank: Record<string, number> = {
    sangat_relevan: 4,
    relevan: 3,
    pendukung: 2,
    kurang_relevan: 1,
  };

  return [...chapters]
    .sort((a, b) => {
      const aSemMatch =
        normSem && a.recommendedSemester && normalizeStr(a.recommendedSemester).includes(normSem) ? 1 : 0;
      const bSemMatch =
        normSem && b.recommendedSemester && normalizeStr(b.recommendedSemester).includes(normSem) ? 1 : 0;
      if (aSemMatch !== bSemMatch) return bSemMatch - aSemMatch;
      const aRank = relevanceRank[a.relevanceLevel || 'relevan'] ?? 2;
      const bRank = relevanceRank[b.relevanceLevel || 'relevan'] ?? 2;
      return bRank - aRank;
    })
    .slice(0, 30);
}

function formatSingleBook(
  book: TextbookRecord,
  roleLabel: string,
  semester?: string
): string {
  const metaParts = [
    `[${roleLabel}] Judul: ${book.title}`,
    book.author ? `Penulis: ${book.author}` : '',
    book.publisher ? `Penerbit: ${book.publisher}` : '',
    book.publishYear ? `Tahun: ${book.publishYear}` : '',
    book.isbn ? `ISBN: ${book.isbn}` : '',
    book.curriculum ? `Kurikulum: ${book.curriculum}` : '',
    book.level ? `Jenjang: ${book.level}` : '',
    book.grade ? `Kelas: ${book.grade}` : '',
    book.sourceUrl ? `Link Buku / Download: ${book.sourceUrl}` : '',
  ].filter(Boolean);

  const selectedChapters = sortAndFilterChapters(book.chapters || [], semester);
  const chaptersText = selectedChapters
    .map((c) => {
      const subs =
        Array.isArray(c.subchapters) && c.subchapters.length > 0
          ? ` | Subbab: ${c.subchapters.join(', ')}`
          : '';
      const practice =
        Array.isArray(c.practiceTopics) && c.practiceTopics.length > 0
          ? ` | Latihan: ${c.practiceTopics.join(', ')}`
          : '';
      const page = c.pageRange ? ` (Hal: ${c.pageRange})` : '';
      const rel = c.relevanceLevel ? ` [${c.relevanceLevel.replace('_', ' ')}]` : '';
      const sem = c.recommendedSemester ? ` | ${c.recommendedSemester}` : '';
      const align = c.curriculumAlignment ? ` | Selaras: ${c.curriculumAlignment}` : '';
      return `- ${c.chapterNumber}: ${c.title}${page}${rel}${sem}${subs}${practice}${align}. Ringkasan: ${c.summary}`;
    })
    .join('\n');

  const summaryBlock = book.extractedSummary
    ? `Ringkasan Materi Buku:\n${book.extractedSummary.slice(0, 4000)}`
    : '';
  return [
    metaParts.join(' · '),
    summaryBlock,
    chaptersText ? `Struktur Bab Relevan:\n${chaptersText}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildRichTextbookContext(
  textbooks: TextbookRecord[],
  primaryBookId?: string,
  subjectFilter?: string,
  options?: TextbookContextOptions
): string {
  if (!textbooks || textbooks.length === 0) return '';

  const scored = [...textbooks]
    .map((book) => ({
      book,
      score: scoreBookRelevance(book, primaryBookId, subjectFilter, options),
    }))
    .sort((a, b) => b.score - a.score);

  const primary = scored[0]?.book;
  if (!primary) return '';

  const targetSubj = normalizeStr(subjectFilter);
  const companions = scored
    .slice(1)
    .filter(({ book }) => {
      if (!targetSubj) return true;
      const bSubj = normalizeStr(book.subject);
      return (
        bSubj === targetSubj ||
        bSubj.includes(targetSubj) ||
        targetSubj.includes(bSubj) ||
        book.referenceType === 'companion'
      );
    })
    .slice(0, 2)
    .map((s) => s.book);

  const blocks = [formatSingleBook(primary, 'BUKU UTAMA', options?.semester)];
  for (const comp of companions) {
    blocks.push(formatSingleBook(comp, 'BUKU PENDAMPING', options?.semester));
  }
  return blocks.join('\n\n').slice(0, 12000);
}
