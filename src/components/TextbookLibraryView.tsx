import React, { useEffect, useState } from 'react';
import {
  Upload,
  BookOpen,
  Trash2,
  CheckCircle2,
  FileText,
  Loader2,
  Link2,
  ExternalLink,
  Save,
  Plus,
  Pencil,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  ListOrdered,
  ClipboardPaste,
  Download,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { uploadTextbookFile } from '../lib/apiClient';
import { createRecord, deleteRecord, updateRecord } from '../lib/firestoreHelpers';
import {
  CLASS_OPTIONS_BY_LEVEL,
  DEFAULT_CURRICULA,
  EDUCATION_LEVELS,
  InstitutionTrack,
  detectInstitutionTrack,
  pickAutoSubjectForContext,
} from '../lib/curriculumData';
import { EducationLevel, TextbookChapter } from '../types/education';
import { OfficialSubjectField } from './OfficialSubjectField';
import { exportTextbookPdf } from '../lib/exporters';

interface TocRowDraft {
  chapterNumber: string;
  title: string;
  subchaptersText: string;
  pageRange: string;
  recommendedSemester: string;
  summary: string;
}

function parseTocTextToRows(rawText: string, defaultSemester = 'Semester 1'): TocRowDraft[] {
  const lines = rawText
    .split('\n')
    .map((l) => l.replace(/\t/g, '  ').trimEnd())
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return [];

  const rows: TocRowDraft[] = [];
  let current: TocRowDraft | null = null;

  const chapterHeaderRegex =
    /^(?:(bab|unit|tema|modul|pertemuan|bagian)\s+([0-9ivxlcdm]+)|(\d{1,2})\.)\s*[:.\-–—]?\s*(.+)$/i;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const isSubBullet = /^[-*•▪◦]\s+/.test(trimmed) || /^\d+\.\d+\s+/.test(trimmed) || /^[a-z]\)\s+/i.test(trimmed);
    const headerMatch = !isSubBullet ? trimmed.match(chapterHeaderRegex) : null;

    if (headerMatch) {
      if (current) rows.push(current);

      const labelPrefix = headerMatch[1]
        ? `${headerMatch[1].charAt(0).toUpperCase()}${headerMatch[1].slice(1).toLowerCase()} ${headerMatch[2]}`
        : `Bab ${headerMatch[3]}`;
      let rest = (headerMatch[4] || '').trim();

      let pageRange = '';
      const pageMatch = rest.match(/\((?:hal\.?|hlm\.?|p\.?)?\s*([0-9]+\s*[-–]\s*[0-9]+|[0-9]+)\)/i) ||
        rest.match(/(?:hal\.?|hlm\.?)\s*([0-9]+\s*[-–]\s*[0-9]+|[0-9]+)$/i);
      if (pageMatch) {
        pageRange = pageMatch[1].replace(/\s+/g, '');
        rest = rest.replace(pageMatch[0], '').trim();
      }

      let recommendedSemester = defaultSemester;
      if (/semester\s*2|genap/i.test(rest)) recommendedSemester = 'Semester 2';
      else if (/semester\s*1|ganjil/i.test(rest)) recommendedSemester = 'Semester 1';

      let title = rest;
      let subchaptersText = '';
      const colonIdx = rest.indexOf(':');
      if (colonIdx > 0 && colonIdx < rest.length - 1) {
        title = rest.slice(0, colonIdx).trim();
        subchaptersText = rest.slice(colonIdx + 1).trim();
      }

      current = {
        chapterNumber: labelPrefix,
        title: title.replace(/[|\-–—]+$/, '').trim() || labelPrefix,
        subchaptersText,
        pageRange,
        recommendedSemester,
        summary: '',
      };
    } else if (current) {
      const cleanSub = trimmed.replace(/^[-*•▪◦]\s+/, '').trim();
      if (cleanSub) {
        current.subchaptersText = current.subchaptersText
          ? `${current.subchaptersText}, ${cleanSub}`
          : cleanSub;
      }
    } else {
      rows.push({
        chapterNumber: `Bab ${rows.length + 1}`,
        title: trimmed.replace(/^[-*•▪◦]\s+/, ''),
        subchaptersText: '',
        pageRange: '',
        recommendedSemester: defaultSemester,
        summary: '',
      });
    }
  }

  if (current) rows.push(current);
  return rows.slice(0, 50);
}

function tocRowsToTextbookChapters(rows: TocRowDraft[], curriculum: string): TextbookChapter[] {
  return rows
    .filter((r) => r.title.trim().length > 0)
    .slice(0, 50)
    .map((r, idx) => {
      const subchapters = r.subchaptersText
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const chapterNumber = r.chapterNumber.trim() || `Bab ${idx + 1}`;
      const title = r.title.trim();
      const summary =
        r.summary.trim() ||
        (subchapters.length > 0
          ? `Membahas materi: ${subchapters.join(', ')}.`
          : `Materi pokok ${title}.`);
      return {
        chapterNumber,
        title,
        subchapters,
        pageRange: r.pageRange.trim() || '-',
        summary,
        recommendedSemester: r.recommendedSemester || 'Semester 1',
        relevanceLevel: 'relevan',
        curriculumAlignment: `Referensi Daftar Isi (${curriculum || 'Kurikulum Aktif'} · ${r.recommendedSemester || 'Semester 1'})`,
      };
    });
}

interface DetectedBookDraft {
  sourceUrl: string;
  fileName: string;
  title: string;
  author: string;
  publisher: string;
  subject: string;
  detectedCurriculum: string;
  curriculumRelevance: 'sangat_relevan' | 'relevan' | 'perlu_penyesuaian' | 'tidak_relevan' | string;
  curriculumRelevanceScore: number;
  curriculumRelevanceReason: string;
  matchedCurriculumElements: string[];
  pageCount: number;
  summary: string;
  detectionNote: string;
  chapters: TextbookChapter[];
}

const RELEVANCE_META: Record<string, { label: string; badgeClass: string }> = {
  sangat_relevan: {
    label: 'Sangat Relevan',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
  },
  relevan: {
    label: 'Relevan',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
  },
  pendukung: {
    label: 'Materi Pendukung',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
  },
  perlu_penyesuaian: {
    label: 'Perlu Penyesuaian',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
  },
  kurang_relevan: {
    label: 'Kurang Relevan',
    badgeClass: 'bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  },
  tidak_relevan: {
    label: 'Tidak Sesuai Kurikulum',
    badgeClass: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800',
  },
};

export const TextbookLibraryView: React.FC = () => {
  const { user, textbooks, activeSchool, activeWorkspace, curricula, aiSettings, setActivePage, notify } = useApp();
  const [uploading, setUploading] = useState(false);
  const [detectingLink, setDetectingLink] = useState(false);
  const [redetectingId, setRedetectingId] = useState<string | null>(null);
  const [savingDirect, setSavingDirect] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedBookId, setSelectedBookId] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [detectedDraft, setDetectedDraft] = useState<DetectedBookDraft | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);

  const defaultCurriculum =
    activeWorkspace?.curriculum ||
    curricula.find((c) => c.isActive)?.name ||
    'Kurikulum Merdeka';

  const availableCurricula = Array.from(
    new Set([
      ...curricula.map((c) => c.name),
      ...DEFAULT_CURRICULA.map((c) => c.name),
    ].filter(Boolean))
  );

  const inferPhaseFromLevelGrade = (lvl: string, grd: string) => {
    const opts = CLASS_OPTIONS_BY_LEVEL[lvl as EducationLevel] || [];
    const matched = opts.find((o) => o.grade.toLowerCase() === (grd || '').trim().toLowerCase());
    return matched?.phase || activeWorkspace?.phase || 'Fase D';
  };

  const [track, setTrack] = useState<InstitutionTrack>(() =>
    detectInstitutionTrack({
      schoolName: activeSchool?.name,
      level: activeWorkspace?.level || activeSchool?.level || 'SMP/MTs',
      grade: activeWorkspace?.grade || 'Kelas VII',
      subject: activeWorkspace?.subject || activeSchool?.subject,
    })
  );

  const [form, setForm] = useState({
    title: '',
    author: '',
    publisher: '',
    publishYear: '2025',
    curriculum: defaultCurriculum,
    level: activeWorkspace?.level || activeSchool?.level || 'SMP/MTs',
    grade: activeWorkspace?.grade || 'Kelas VII',
    phase: activeWorkspace?.phase || inferPhaseFromLevelGrade(activeWorkspace?.level || activeSchool?.level || 'SMP/MTs', activeWorkspace?.grade || 'Kelas VII'),
    semester: activeWorkspace?.semester || activeSchool?.semester || 'Semester 1',
    subject: activeWorkspace?.subject || activeSchool?.subject || 'Bahasa Indonesia',
    isbn: '',
    sourceUrl: '',
    referenceType: 'primary' as 'primary' | 'companion' | 'module' | 'government' | 'custom',
    manualText: '',
  });

  useEffect(() => {
    if (activeWorkspace) {
      setTrack(
        detectInstitutionTrack({
          schoolName: activeSchool?.name,
          level: activeWorkspace.level,
          grade: activeWorkspace.grade,
          subject: activeWorkspace.subject,
        })
      );
      setForm((prev) => ({
        ...prev,
        curriculum: activeWorkspace.curriculum || prev.curriculum,
        level: activeWorkspace.level || prev.level,
        grade: activeWorkspace.grade || prev.grade,
        phase: activeWorkspace.phase || inferPhaseFromLevelGrade(activeWorkspace.level || prev.level, activeWorkspace.grade || prev.grade),
        semester: activeWorkspace.semester || prev.semester,
        subject: activeWorkspace.subject || prev.subject,
      }));
    }
  }, [activeWorkspace?.id]);

  const activeBook = textbooks.find((b) => b.id === selectedBookId) || textbooks[0] || null;

  // Structured Table of Contents (Daftar Isi) builder state
  const [tocRows, setTocRows] = useState<TocRowDraft[]>([
    {
      chapterNumber: 'Bab 1',
      title: '',
      subchaptersText: '',
      pageRange: '',
      recommendedSemester: activeWorkspace?.semester || activeSchool?.semester || 'Semester 1',
      summary: '',
    },
  ]);
  const [showBulkTocPaste, setShowBulkTocPaste] = useState(false);
  const [bulkTocPasteText, setBulkTocPasteText] = useState('');

  // Edit active book link/summary & manual chapter addition
  const [editingBook, setEditingBook] = useState(false);
  const [editBookForm, setEditBookForm] = useState({
    sourceUrl: '',
    author: '',
    publisher: '',
    isbn: '',
    curriculum: '',
    level: '',
    grade: '',
    subject: '',
    extractedSummary: '',
  });
  const [newChapter, setNewChapter] = useState({
    chapterNumber: '',
    title: '',
    pageRange: '',
    recommendedSemester: activeWorkspace?.semester || 'Semester 1',
    subchaptersText: '',
    summary: '',
  });
  const [editingChapterIdx, setEditingChapterIdx] = useState<number | null>(null);
  const [editChapterForm, setEditChapterForm] = useState<TocRowDraft>({
    chapterNumber: '',
    title: '',
    subchaptersText: '',
    pageRange: '',
    recommendedSemester: 'Semester 1',
    summary: '',
  });
  const [showActiveBulkImport, setShowActiveBulkImport] = useState(false);
  const [activeBulkTocText, setActiveBulkTocText] = useState('');

  useEffect(() => {
    if (activeBook) {
      setEditBookForm({
        sourceUrl: activeBook.sourceUrl || '',
        author: activeBook.author || '',
        publisher: activeBook.publisher || '',
        isbn: activeBook.isbn || '',
        curriculum: activeBook.curriculum || defaultCurriculum,
        level: activeBook.level || activeWorkspace?.level || 'SMP/MTs',
        grade: activeBook.grade || activeWorkspace?.grade || 'Kelas VII',
        subject: activeBook.subject || activeWorkspace?.subject || '',
        extractedSummary: activeBook.extractedSummary || '',
      });
      setEditingBook(false);
      setEditingChapterIdx(null);
      setShowActiveBulkImport(false);
    }
  }, [activeBook?.id]);

  const validateUrlIfPresent = (raw: string): string | null => {
    const t = raw.trim();
    if (!t) return '';
    try {
      const u = new URL(t);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return u.toString();
    } catch {
      return null;
    }
  };

  const buildCurriculumContextForExtraction = (targetCurriculum?: string, targetSubject?: string, targetGrade?: string) => {
    const parts: string[] = [];
    const matchedCurr =
      curricula.find((c) => c.name === targetCurriculum) ||
      DEFAULT_CURRICULA.find((c) => c.name === targetCurriculum);
    if (matchedCurr) {
      parts.push(
        `Struktur ${matchedCurr.name}: ${matchedCurr.description || ''} (${(matchedCurr.structureComponents || []).join(', ')})`
      );
    }

    const wsMatches =
      activeWorkspace &&
      (!targetSubject || activeWorkspace.subject.trim().toLowerCase() === targetSubject.trim().toLowerCase()) &&
      (!targetGrade || activeWorkspace.grade.trim().toLowerCase() === targetGrade.trim().toLowerCase());

    if (wsMatches && activeWorkspace?.curriculumData?.elements?.length) {
      const elemLines = activeWorkspace.curriculumData.elements.slice(0, 6).map((el) => {
        const topics = (el.topics || [])
          .slice(0, 5)
          .map((t) => `${t.tpCode || 'TP'}: ${t.topicTitle}${t.subtopics?.length ? ` (${t.subtopics.slice(0, 3).join(', ')})` : ''}`)
          .join('; ');
        return `- Elemen ${el.elementName}: ${el.cpSummary?.slice(0, 180) || ''}${topics ? ` | Topik: ${topics}` : ''}`;
      });
      parts.push(`Pemetaan CP/TP/Topik Administrasi Aktif:\n${elemLines.join('\n')}`);
    }

    return parts.join('\n\n').slice(0, 4200);
  };

  const runLinkOrFileExtraction = async (opts: {
    bookUrl?: string;
    file?: File | null;
    title?: string;
    subject?: string;
    grade?: string;
    level?: string;
    phase?: string;
    semester?: string;
    curriculum?: string;
    manualText?: string;
  }) => {
    const fd = new FormData();
    if (opts.file) fd.append('file', opts.file);
    if (opts.title?.trim()) fd.append('title', opts.title.trim());
    else if (opts.file?.name) fd.append('title', opts.file.name);
    if (opts.subject) fd.append('subject', opts.subject);
    if (opts.grade) fd.append('grade', opts.grade);
    if (opts.level) fd.append('level', opts.level);
    if (opts.phase) fd.append('phase', opts.phase);
    if (opts.semester) fd.append('semester', opts.semester);
    if (opts.curriculum) fd.append('curriculum', opts.curriculum);
    const currCtx = buildCurriculumContextForExtraction(opts.curriculum, opts.subject, opts.grade);
    if (currCtx) fd.append('curriculumContext', currCtx);
    if (opts.bookUrl) fd.append('bookUrl', opts.bookUrl);
    if (opts.manualText?.trim()) fd.append('manualText', opts.manualText.trim());
    if (aiSettings?.model) fd.append('preferredModel', aiSettings.model);
    return uploadTextbookFile(fd);
  };

  const handleDetectChaptersFromLink = async () => {
    if (!user) return;
    if (!form.sourceUrl.trim()) {
      notify('Masukkan Link Buku terlebih dahulu.', 'error');
      return;
    }
    const validUrl = validateUrlIfPresent(form.sourceUrl);
    if (validUrl === null || !validUrl) {
      notify('Format Link Buku tidak valid. Awali dengan https:// atau http://.', 'error');
      return;
    }

    setDetectingLink(true);
    setExtractError(null);
    try {
      const extracted = await runLinkOrFileExtraction({
        bookUrl: validUrl,
        title: form.title,
        subject: form.subject,
        grade: form.grade,
        level: form.level,
        phase: form.phase,
        semester: form.semester,
        curriculum: form.curriculum,
        manualText: form.manualText,
      });
      const chapters: TextbookChapter[] = Array.isArray(extracted.chapters)
        ? extracted.chapters.slice(0, 50)
        : [];
      const detectedTitle = String(extracted.extractedTitle || form.title || 'Buku Referensi').trim();
      const detectedAuthor = String(extracted.detectedAuthor || '').trim();
      const detectedPublisher = String(extracted.detectedPublisher || '').trim();
      const detectedSubject = String(extracted.detectedSubject || '').trim();
      const detectedCurriculum = String(extracted.detectedCurriculum || form.curriculum || '').trim();
      const curriculumRelevance = String(extracted.curriculumRelevance || 'relevan');
      const curriculumRelevanceScore = Number(extracted.curriculumRelevanceScore || 0);
      const curriculumRelevanceReason = String(extracted.curriculumRelevanceReason || '').trim();
      const matchedCurriculumElements: string[] = Array.isArray(extracted.matchedCurriculumElements)
        ? extracted.matchedCurriculumElements.map(String)
        : [];

      setForm((p) => ({
        ...p,
        title: p.title.trim() || detectedTitle,
        author: p.author.trim() || detectedAuthor,
        publisher: p.publisher.trim() || detectedPublisher,
        subject: p.subject.trim() || detectedSubject || p.subject,
        manualText: p.manualText.trim() || String(extracted.summary || ''),
      }));

      setDetectedDraft({
        sourceUrl: validUrl,
        fileName: extracted.fileName || 'tautan-buku',
        title: detectedTitle,
        author: detectedAuthor,
        publisher: detectedPublisher,
        subject: detectedSubject,
        detectedCurriculum,
        curriculumRelevance,
        curriculumRelevanceScore,
        curriculumRelevanceReason,
        matchedCurriculumElements,
        pageCount: Number(extracted.detectedPageCount || 0),
        summary: String(extracted.summary || ''),
        detectionNote: String(extracted.detectionNote || ''),
        chapters,
      });

      if (curriculumRelevance === 'tidak_relevan' || curriculumRelevance === 'perlu_penyesuaian') {
        notify(
          `Terdeteksi ${chapters.length} bab (${RELEVANCE_META[curriculumRelevance]?.label || curriculumRelevance} dengan ${form.curriculum}). Periksa catatan kesesuaian.`,
          'info'
        );
      } else if (chapters.length > 0) {
        notify(`Berhasil mendeteksi ${chapters.length} bab & materi relevan untuk ${form.curriculum}.`, 'success');
      } else {
        notify('Link terbaca, silakan lengkapi/tinjau ringkasan sebelum menyimpan.', 'info');
      }
    } catch (err: any) {
      const msg = err?.message || 'Gagal mendeteksi bab & materi dari link buku.';
      setExtractError(msg);
      notify(msg, 'error');
    } finally {
      setDetectingLink(false);
    }
  };

  const addTocRow = () => {
    setTocRows((prev) => [
      ...prev,
      {
        chapterNumber: `Bab ${prev.length + 1}`,
        title: '',
        subchaptersText: '',
        pageRange: '',
        recommendedSemester: form.semester === 'Semester 1 & 2' ? 'Semester 1' : form.semester || 'Semester 1',
        summary: '',
      },
    ]);
  };

  const updateTocRow = (idx: number, patch: Partial<TocRowDraft>) => {
    setTocRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeTocRow = (idx: number) => {
    setTocRows((prev) => {
      const filtered = prev.filter((_, i) => i !== idx);
      return filtered.length > 0
        ? filtered
        : [
            {
              chapterNumber: 'Bab 1',
              title: '',
              subchaptersText: '',
              pageRange: '',
              recommendedSemester: 'Semester 1',
              summary: '',
            },
          ];
    });
  };

  const handleApplyBulkTocPaste = () => {
    if (!bulkTocPasteText.trim()) {
      notify('Tempelkan teks Daftar Isi terlebih dahulu.', 'error');
      return;
    }
    const parsed = parseTocTextToRows(
      bulkTocPasteText,
      form.semester === 'Semester 1 & 2' ? 'Semester 1' : form.semester || 'Semester 1'
    );
    if (parsed.length === 0) {
      notify('Tidak ada baris bab yang terbaca. Coba awali tiap baris dengan Bab 1, Bab 2, dst.', 'error');
      return;
    }
    setTocRows(parsed);
    setBulkTocPasteText('');
    setShowBulkTocPaste(false);
    notify(`${parsed.length} bab berhasil dimuat ke Form Daftar Isi.`, 'success');
  };

  const buildCombinedManualText = () => {
    const structuredChapters = tocRowsToTextbookChapters(tocRows, form.curriculum);
    const tocText = structuredChapters
      .map((ch) => {
        const subs = ch.subchapters.length > 0 ? `: ${ch.subchapters.join(', ')}` : '';
        const page = ch.pageRange && ch.pageRange !== '-' ? ` (Hal. ${ch.pageRange})` : '';
        const sem = ch.recommendedSemester ? ` [${ch.recommendedSemester}]` : '';
        return `${ch.chapterNumber} ${ch.title}${page}${sem}${subs}${ch.summary ? ` — ${ch.summary}` : ''}`;
      })
      .join('\n');
    return [tocText ? `Daftar Isi Buku:\n${tocText}` : '', form.manualText.trim()]
      .filter(Boolean)
      .join('\n\n');
  };

  const handleUploadAndExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const filledTocChapters = tocRowsToTextbookChapters(tocRows, form.curriculum);
    if (!selectedFile && !form.manualText.trim() && !form.sourceUrl.trim() && filledTocChapters.length === 0) {
      notify('Pilih file buku, masukkan link buku, atau isi Form Daftar Isi terlebih dahulu.', 'error');
      return;
    }
    const validUrl = validateUrlIfPresent(form.sourceUrl);
    if (validUrl === null) {
      notify('Format Link Buku tidak valid. Awali dengan https:// atau http://.', 'error');
      return;
    }

    setUploading(true);
    setExtractError(null);
    try {
      const combinedManualText = buildCombinedManualText();
      const canReuseDraft =
        !selectedFile &&
        detectedDraft &&
        validUrl &&
        detectedDraft.sourceUrl === validUrl &&
        detectedDraft.chapters.length > 0 &&
        filledTocChapters.length === 0;

      const extracted = canReuseDraft
        ? {
            fileName: detectedDraft.fileName,
            extractedTitle: detectedDraft.title,
            detectedAuthor: detectedDraft.author,
            detectedPublisher: detectedDraft.publisher,
            detectedSubject: detectedDraft.subject,
            detectedCurriculum: detectedDraft.detectedCurriculum,
            curriculumRelevance: detectedDraft.curriculumRelevance,
            curriculumRelevanceScore: detectedDraft.curriculumRelevanceScore,
            curriculumRelevanceReason: detectedDraft.curriculumRelevanceReason,
            detectedPageCount: detectedDraft.pageCount,
            summary: combinedManualText || detectedDraft.summary,
            chapters: detectedDraft.chapters,
          }
        : await runLinkOrFileExtraction({
            file: selectedFile,
            bookUrl: validUrl || undefined,
            title: form.title,
            subject: form.subject,
            grade: form.grade,
            level: form.level,
            phase: form.phase,
            semester: form.semester,
            curriculum: form.curriculum,
            manualText: combinedManualText,
          });

      const finalChapters: TextbookChapter[] =
        Array.isArray(extracted.chapters) && extracted.chapters.length > 0
          ? extracted.chapters.slice(0, 50)
          : filledTocChapters;

      const relevanceHeader = extracted.curriculumRelevanceReason
        ? `[Relevansi ${form.curriculum}: ${RELEVANCE_META[extracted.curriculumRelevance]?.label || extracted.curriculumRelevance || 'Relevan'}${extracted.curriculumRelevanceScore ? ` (${extracted.curriculumRelevanceScore}%)` : ''}] ${extracted.curriculumRelevanceReason}\n\n`
        : '';

      const newId = await createRecord('textbooks', {
        ownerId: user.uid,
        title: form.title.trim() || extracted.extractedTitle || selectedFile?.name || 'Buku Referensi',
        author: form.author.trim() || extracted.detectedAuthor || 'Penulis Terdaftar',
        publisher: form.publisher.trim() || extracted.detectedPublisher || '-',
        publishYear: form.publishYear.trim(),
        curriculum: form.curriculum,
        level: form.level,
        grade: form.grade,
        subject: form.subject.trim() || extracted.detectedSubject || 'Umum',
        isbn: form.isbn.trim(),
        pageCount: extracted.detectedPageCount || 0,
        referenceType: form.referenceType,
        sourceUrl: validUrl || undefined,
        fileName: extracted.fileName || selectedFile?.name || (validUrl ? 'tautan-buku' : 'daftar-isi-guru.txt'),
        extractedSummary: `${relevanceHeader}${String(extracted.summary || combinedManualText || '')}`.trim().slice(0, 9500),
        chapters: finalChapters,
        status: 'ready',
      });

      setSelectedBookId(newId);
      setSelectedFile(null);
      setDetectedDraft(null);
      setForm((p) => ({ ...p, title: '', sourceUrl: '', isbn: '', manualText: '' }));
      setTocRows([
        {
          chapterNumber: 'Bab 1',
          title: '',
          subchaptersText: '',
          pageRange: '',
          recommendedSemester: 'Semester 1',
          summary: '',
        },
      ]);
      const babCount = finalChapters.length;
      notify(
        babCount > 0
          ? `Buku tersimpan dengan ${babCount} bab & materi sebagai bahan referensi.`
          : 'Buku berhasil diekstrak dan disimpan ke database referensi.',
        'success'
      );
    } catch (err: any) {
      const msg = err?.message || 'Gagal mengekstrak buku.';
      setExtractError(msg);
      notify(msg, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveDirectDataAndLink = async () => {
    if (!user) return;
    const structuredChapters = tocRowsToTextbookChapters(tocRows, form.curriculum);
    if (!form.title.trim()) {
      notify('Judul buku wajib diisi saat menyimpan daftar isi / data langsung.', 'error');
      return;
    }
    if (!form.sourceUrl.trim() && !form.manualText.trim() && structuredChapters.length === 0) {
      notify('Isi minimal satu bab di Form Daftar Isi, Link Buku, atau Ringkasan Materi terlebih dahulu.', 'error');
      return;
    }
    const validUrl = validateUrlIfPresent(form.sourceUrl);
    if (validUrl === null) {
      notify('Format Link Buku tidak valid. Awali dengan https:// atau http://.', 'error');
      return;
    }

    setSavingDirect(true);
    try {
      const parsedFromManual =
        structuredChapters.length === 0 && form.manualText.trim()
          ? tocRowsToTextbookChapters(
              parseTocTextToRows(
                form.manualText,
                form.semester === 'Semester 1 & 2' ? 'Semester 1' : form.semester || 'Semester 1'
              ),
              form.curriculum
            )
          : [];
      const finalChapters = structuredChapters.length > 0 ? structuredChapters : parsedFromManual;

      const autoSummaryFromToc = finalChapters
        .map((c) => `${c.chapterNumber}: ${c.title}${c.subchapters.length ? ` (${c.subchapters.join(', ')})` : ''}`)
        .join('\n');

      const summaryText = [form.manualText.trim(), autoSummaryFromToc && !form.manualText.trim() ? `Daftar Isi Referensi (${finalChapters.length} Bab):\n${autoSummaryFromToc}` : '']
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 9500);

      const newId = await createRecord('textbooks', {
        ownerId: user.uid,
        title: form.title.trim(),
        author: form.author.trim() || '-',
        publisher: form.publisher.trim() || '-',
        publishYear: form.publishYear.trim(),
        curriculum: form.curriculum,
        level: form.level,
        grade: form.grade,
        subject: form.subject.trim() || 'Umum',
        isbn: form.isbn.trim(),
        pageCount: 0,
        referenceType: form.referenceType,
        sourceUrl: validUrl || undefined,
        fileName: validUrl ? 'tautan-buku' : 'daftar-isi-referensi.txt',
        extractedSummary: summaryText,
        chapters: finalChapters,
        status: 'ready',
      });

      setSelectedBookId(newId);
      setDetectedDraft(null);
      setForm((p) => ({ ...p, title: '', sourceUrl: '', isbn: '', manualText: '' }));
      setTocRows([
        {
          chapterNumber: 'Bab 1',
          title: '',
          subchaptersText: '',
          pageRange: '',
          recommendedSemester: 'Semester 1',
          summary: '',
        },
      ]);
      notify(
        finalChapters.length > 0
          ? `Buku dan ${finalChapters.length} bab Daftar Isi tersimpan sebagai bahan referensi.`
          : 'Data & link buku berhasil disimpan untuk acuan pembuatan perangkat.',
        'success'
      );
    } catch (err: any) {
      notify(err?.message || 'Gagal menyimpan data buku.', 'error');
    } finally {
      setSavingDirect(false);
    }
  };

  const handleUpdateActiveBook = async () => {
    if (!activeBook?.id) return;
    const validUrl = validateUrlIfPresent(editBookForm.sourceUrl);
    if (validUrl === null) {
      notify('Format Link Buku tidak valid. Awali dengan https:// atau http://.', 'error');
      return;
    }
    await updateRecord('textbooks', activeBook.id, {
      sourceUrl: validUrl || '',
      author: editBookForm.author.trim(),
      publisher: editBookForm.publisher.trim(),
      isbn: editBookForm.isbn.trim(),
      curriculum: editBookForm.curriculum.trim() || defaultCurriculum,
      level: editBookForm.level.trim() || activeBook.level || 'SMP/MTs',
      grade: editBookForm.grade.trim() || activeBook.grade || 'Kelas VII',
      subject: editBookForm.subject.trim() || activeBook.subject,
      extractedSummary: editBookForm.extractedSummary.trim().slice(0, 9500),
    });
    setEditingBook(false);
    notify('Data dan link buku berhasil diperbarui.', 'success');
  };

  const handleAddChapterToActiveBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBook?.id || !newChapter.title.trim()) return;
    const nextChapters: TextbookChapter[] = [
      ...(activeBook.chapters || []),
      {
        chapterNumber: newChapter.chapterNumber.trim() || `Bab ${(activeBook.chapters || []).length + 1}`,
        title: newChapter.title.trim(),
        pageRange: newChapter.pageRange.trim() || '-',
        recommendedSemester: newChapter.recommendedSemester || 'Semester 1',
        relevanceLevel: 'relevan',
        curriculumAlignment: `Referensi Daftar Isi (${activeBook.curriculum || defaultCurriculum} · ${newChapter.recommendedSemester || 'Semester 1'})`,
        subchapters: newChapter.subchaptersText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        summary: newChapter.summary.trim() || newChapter.title.trim(),
      },
    ];
    await updateRecord('textbooks', activeBook.id, { chapters: nextChapters });
    setNewChapter({
      chapterNumber: '',
      title: '',
      pageRange: '',
      recommendedSemester: activeWorkspace?.semester || 'Semester 1',
      subchaptersText: '',
      summary: '',
    });
    notify('Bab materi ditambahkan ke daftar isi buku.', 'success');
  };

  const handleStartEditChapter = (idx: number, ch: TextbookChapter) => {
    setEditingChapterIdx(idx);
    setEditChapterForm({
      chapterNumber: ch.chapterNumber || `Bab ${idx + 1}`,
      title: ch.title || '',
      subchaptersText: (ch.subchapters || []).join(', '),
      pageRange: ch.pageRange || '',
      recommendedSemester: ch.recommendedSemester || 'Semester 1',
      summary: ch.summary || '',
    });
  };

  const handleSaveEditedChapter = async (idx: number) => {
    if (!activeBook?.id || !editChapterForm.title.trim()) return;
    const subchapters = editChapterForm.subchaptersText
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const nextChapters = (activeBook.chapters || []).map((ch, i) =>
      i === idx
        ? {
            ...ch,
            chapterNumber: editChapterForm.chapterNumber.trim() || ch.chapterNumber,
            title: editChapterForm.title.trim(),
            subchapters,
            pageRange: editChapterForm.pageRange.trim() || '-',
            recommendedSemester: editChapterForm.recommendedSemester || ch.recommendedSemester || 'Semester 1',
            summary: editChapterForm.summary.trim() || editChapterForm.title.trim(),
          }
        : ch
    );
    await updateRecord('textbooks', activeBook.id, { chapters: nextChapters });
    setEditingChapterIdx(null);
    notify('Isi bab berhasil diperbarui.', 'success');
  };

  const handleImportBulkToActiveBook = async () => {
    if (!activeBook?.id || !activeBulkTocText.trim()) {
      notify('Tempelkan teks Daftar Isi terlebih dahulu.', 'error');
      return;
    }
    const parsedRows = parseTocTextToRows(activeBulkTocText, activeWorkspace?.semester || 'Semester 1');
    const newChapters = tocRowsToTextbookChapters(parsedRows, activeBook.curriculum || defaultCurriculum);
    if (newChapters.length === 0) {
      notify('Tidak ada bab yang dapat dibaca dari teks.', 'error');
      return;
    }
    const merged = [...(activeBook.chapters || []), ...newChapters].slice(0, 55);
    await updateRecord('textbooks', activeBook.id, { chapters: merged });
    setActiveBulkTocText('');
    setShowActiveBulkImport(false);
    notify(`${newChapters.length} bab dari Daftar Isi berhasil ditambahkan ke buku ini.`, 'success');
  };

  const handleRedetectActiveBookFromLink = async () => {
    if (!activeBook?.id || !activeBook.sourceUrl) return;
    setRedetectingId(activeBook.id);
    try {
      const targetCurr = activeBook.curriculum || activeWorkspace?.curriculum || defaultCurriculum;
      const targetLevel = activeBook.level || activeWorkspace?.level || 'SMP/MTs';
      const targetGrade = activeBook.grade || activeWorkspace?.grade || 'Kelas VII';
      const extracted = await runLinkOrFileExtraction({
        bookUrl: activeBook.sourceUrl,
        title: activeBook.title,
        subject: activeBook.subject,
        grade: targetGrade,
        level: targetLevel,
        phase: inferPhaseFromLevelGrade(targetLevel, targetGrade),
        semester: activeWorkspace?.semester || 'Semester 1',
        curriculum: targetCurr,
        manualText: activeBook.extractedSummary,
      });
      const chapters: TextbookChapter[] = Array.isArray(extracted.chapters)
        ? extracted.chapters.slice(0, 50)
        : [];
      const relevanceHeader = extracted.curriculumRelevanceReason
        ? `[Relevansi ${targetCurr}: ${RELEVANCE_META[extracted.curriculumRelevance]?.label || extracted.curriculumRelevance || 'Relevan'}${extracted.curriculumRelevanceScore ? ` (${extracted.curriculumRelevanceScore}%)` : ''}] ${extracted.curriculumRelevanceReason}\n\n`
        : '';
      const baseSummary = String(extracted.summary || activeBook.extractedSummary || '').replace(/^\[Relevansi [^\]]+\][^\n]*\n*/i, '');
      const patch: Record<string, any> = {
        chapters: chapters.length > 0 ? chapters : activeBook.chapters || [],
        extractedSummary: `${relevanceHeader}${baseSummary}`.trim().slice(0, 9500),
      };
      if ((!activeBook.author || activeBook.author === '-') && extracted.detectedAuthor) {
        patch.author = extracted.detectedAuthor;
      }
      if ((!activeBook.publisher || activeBook.publisher === '-') && extracted.detectedPublisher) {
        patch.publisher = extracted.detectedPublisher;
      }
      if (!activeBook.pageCount && extracted.detectedPageCount) {
        patch.pageCount = Number(extracted.detectedPageCount);
      }
      await updateRecord('textbooks', activeBook.id, patch);
      notify(
        chapters.length > 0
          ? `Terdeteksi ${chapters.length} bab & materi relevan untuk ${targetCurr}.`
          : 'Ringkasan link diperbarui sesuai acuan kurikulum.',
        chapters.length > 0 ? 'success' : 'info'
      );
    } catch (err: any) {
      notify(err?.message || 'Gagal mendeteksi bab dari link buku.', 'error');
    } finally {
      setRedetectingId(null);
    }
  };

  const handleRemoveChapterFromActiveBook = async (idx: number) => {
    if (!activeBook?.id) return;
    const nextChapters = (activeBook.chapters || []).filter((_, i) => i !== idx);
    await updateRecord('textbooks', activeBook.id, { chapters: nextChapters });
    notify('Bab dihapus dari daftar buku.', 'info');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Database Buku, Link Sumber & Referensi
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Masukkan Link Buku (SIBI Kemendikbud, Google Drive, PDF online), unggah berkas, atau lengkapi data bab & ringkasan materi agar AI menyusun CP, ATP, Modul Ajar, Bahan Ajar, LKPD, dan Soal secara akurat.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Upload / Link & Extract Form */}
        <form
          onSubmit={handleUploadAndExtract}
          className="lg:col-span-5 p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
        >
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Tambah Buku / Link Referensi Baru
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Judul Buku (otomatis terisi jika dari link/berkas)
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Mis. Bahasa Indonesia SMP Kelas VII"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>

            <div className="sm:col-span-2 space-y-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Link Buku / URL Sumber (PDF, Google Drive, SIBI Kemendikbud, Web)
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Link2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="url"
                    value={form.sourceUrl}
                    onChange={(e) => {
                      setForm({ ...form, sourceUrl: e.target.value });
                      if (detectedDraft && detectedDraft.sourceUrl !== e.target.value.trim()) {
                        setDetectedDraft(null);
                      }
                    }}
                    placeholder="https://buku.kemdikbud.go.id/... atau https://drive.google.com/..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>
                <button
                  type="button"
                  disabled={!form.sourceUrl.trim() || detectingLink || uploading}
                  onClick={handleDetectChaptersFromLink}
                  className="px-3.5 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shrink-0"
                >
                  {detectingLink ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>{detectingLink ? 'Mendeteksi...' : 'Deteksi Bab & Materi'}</span>
                </button>
              </div>
              {detectedDraft && (
                <div className="p-3 rounded-lg bg-indigo-50/80 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                        Hasil Deteksi Link: {detectedDraft.chapters.length} Bab Ditemukan
                      </p>
                      {detectedDraft.curriculumRelevance && (
                        <span
                          className={`px-2 py-0.5 rounded border text-[10px] font-bold ${
                            RELEVANCE_META[detectedDraft.curriculumRelevance]?.badgeClass || RELEVANCE_META.relevan.badgeClass
                          }`}
                        >
                          {RELEVANCE_META[detectedDraft.curriculumRelevance]?.label || detectedDraft.curriculumRelevance}
                          {detectedDraft.curriculumRelevanceScore ? ` (${detectedDraft.curriculumRelevanceScore}%)` : ''}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setDetectedDraft(null)}
                      className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 shrink-0"
                    >
                      Tutup
                    </button>
                  </div>
                  {(detectedDraft.detectedCurriculum || detectedDraft.curriculumRelevanceReason) && (
                    <div className="p-2 rounded bg-white/80 dark:bg-slate-900/70 border border-indigo-100 dark:border-indigo-900 text-[11px] space-y-1">
                      {detectedDraft.detectedCurriculum && (
                        <p className="text-slate-700 dark:text-slate-200">
                          <span className="font-semibold">Kurikulum Buku Terdeteksi:</span> {detectedDraft.detectedCurriculum}
                        </p>
                      )}
                      {detectedDraft.curriculumRelevanceReason && (
                        <p className="text-slate-600 dark:text-slate-300">{detectedDraft.curriculumRelevanceReason}</p>
                      )}
                      {detectedDraft.matchedCurriculumElements.length > 0 && (
                        <p className="text-indigo-800 dark:text-indigo-300">
                          <span className="font-semibold">CP/Elemen/KD Cocok:</span>{' '}
                          {detectedDraft.matchedCurriculumElements.join(' · ')}
                        </p>
                      )}
                    </div>
                  )}
                  {detectedDraft.detectionNote && (
                    <p className="text-[11px] text-indigo-800 dark:text-indigo-300">{detectedDraft.detectionNote}</p>
                  )}
                  {detectedDraft.chapters.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setTocRows(
                              detectedDraft.chapters.map((ch, i) => ({
                                chapterNumber: ch.chapterNumber || `Bab ${i + 1}`,
                                title: ch.title || '',
                                subchaptersText: (ch.subchapters || []).join(', '),
                                pageRange: ch.pageRange || '',
                                recommendedSemester: ch.recommendedSemester || 'Semester 1',
                                summary: ch.summary || '',
                              }))
                            );
                            notify('Hasil deteksi dimuat ke Form Daftar Isi untuk disunting.', 'success');
                          }}
                          className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 hover:underline whitespace-nowrap"
                        >
                          Muat ke Form Daftar Isi
                        </button>
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                        {detectedDraft.chapters.map((ch, idx) => (
                          <div
                            key={idx}
                            className="p-2 rounded bg-white/90 dark:bg-slate-900/80 border border-indigo-100 dark:border-indigo-900 text-[11px] space-y-0.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-1">
                              <p className="font-semibold text-slate-900 dark:text-white">
                                {ch.chapterNumber}: {ch.title}
                              </p>
                              <div className="flex items-center gap-1">
                                {ch.recommendedSemester && (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px]">
                                    {ch.recommendedSemester}
                                  </span>
                                )}
                                {ch.relevanceLevel && (
                                  <span
                                    className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${
                                      RELEVANCE_META[ch.relevanceLevel]?.badgeClass || RELEVANCE_META.relevan.badgeClass
                                    }`}
                                  >
                                    {RELEVANCE_META[ch.relevanceLevel]?.label || ch.relevanceLevel}
                                  </span>
                                )}
                              </div>
                            </div>
                            {ch.curriculumAlignment && (
                              <p className="text-indigo-700 dark:text-indigo-300">Selaras: {ch.curriculumAlignment}</p>
                            )}
                            {ch.subchapters?.length > 0 && (
                              <p className="text-slate-600 dark:text-slate-300">
                                Materi: {ch.subchapters.join(' · ')}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="sm:col-span-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                  Acuan Kurikulum untuk Deteksi Relevansi Buku
                </span>
                {activeWorkspace?.curriculumData?.elements?.length ? (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    CP/TP Administrasi Aktif Terhubung ({activeWorkspace.curriculumData.elements.length} Elemen)
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    Menggunakan standar {form.curriculum}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Kurikulum Target
                  </label>
                  <select
                    value={form.curriculum}
                    onChange={(e) => setForm({ ...form, curriculum: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
                  >
                    {availableCurricula.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Semester Target
                  </label>
                  <select
                    value={form.semester}
                    onChange={(e) => setForm({ ...form, semester: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
                  >
                    <option value="Semester 1">Semester 1</option>
                    <option value="Semester 2">Semester 2</option>
                    <option value="Semester 1 & 2">Semester 1 & 2</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Penulis</label>
              <input
                type="text"
                value={form.author}
                onChange={(e) => setForm({ ...form, author: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Penerbit</label>
              <input
                type="text"
                value={form.publisher}
                onChange={(e) => setForm({ ...form, publisher: e.target.value })}
                placeholder="Kemendikbudristek / Erlangga"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Tahun Terbit</label>
              <input
                type="text"
                maxLength={10}
                value={form.publishYear}
                onChange={(e) => setForm({ ...form, publishYear: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">ISBN (Opsional)</label>
              <input
                type="text"
                maxLength={40}
                value={form.isbn}
                onChange={(e) => setForm({ ...form, isbn: e.target.value })}
                placeholder="978-602-..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Jenjang</label>
              <select
                value={form.level}
                onChange={(e) => {
                  const lvl = e.target.value;
                  const first = CLASS_OPTIONS_BY_LEVEL[lvl as EducationLevel]?.[0];
                  const nextGrade = first?.grade || form.grade;
                  const nextSubject = pickAutoSubjectForContext({
                    currentSubject: form.subject,
                    level: lvl,
                    grade: nextGrade,
                    curriculum: form.curriculum,
                    track,
                    schoolName: activeSchool?.name,
                  });
                  setForm({
                    ...form,
                    level: lvl,
                    grade: nextGrade,
                    phase: first?.phase || form.phase,
                    subject: nextSubject,
                  });
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                {EDUCATION_LEVELS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Kelas ({form.phase})</label>
              <input
                type="text"
                value={form.grade}
                onChange={(e) =>
                  setForm({
                    ...form,
                    grade: e.target.value,
                    phase: inferPhaseFromLevelGrade(form.level, e.target.value),
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <OfficialSubjectField
                label="Mata Pelajaran (Otomatis Permendikbud / KMA)"
                subject={form.subject}
                level={form.level}
                grade={form.grade}
                curriculum={form.curriculum}
                schoolName={activeSchool?.name}
                track={track}
                compact
                required
                onTrackChange={(nextTrack) => {
                  setTrack(nextTrack);
                  const nextSubj = pickAutoSubjectForContext({
                    currentSubject: form.subject,
                    level: form.level,
                    grade: form.grade,
                    curriculum: form.curriculum,
                    track: nextTrack,
                    schoolName: activeSchool?.name,
                  });
                  setForm({ ...form, subject: nextSubj });
                }}
                onSubjectChange={(nextSubj) => setForm({ ...form, subject: nextSubj })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Peran Referensi</label>
              <select
                value={form.referenceType}
                onChange={(e) => setForm({ ...form, referenceType: e.target.value as any })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                <option value="primary">Buku Utama</option>
                <option value="companion">Buku Pendamping</option>
                <option value="module">Modul Tambahan</option>
                <option value="government">Sumber Resmi Pemerintah</option>
                <option value="custom">Referensi Unggahan Sendiri</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Berkas Buku (PDF, DOCX, PPTX, TXT, atau Gambar OCR — maks 15MB)
            </label>
            <label className="flex items-center justify-center gap-2 p-4 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 cursor-pointer hover:border-blue-600 transition-colors">
              <Upload className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">
                {selectedFile ? selectedFile.name : 'Pilih berkas buku atau pindaian halaman'}
              </span>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.pptx,.txt,image/*"
                className="hidden"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          {/* Form Daftar Isi Terstruktur */}
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <ListOrdered className="w-4 h-4 text-blue-700 dark:text-sky-400 shrink-0" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  Form Daftar Isi Buku ({tocRows.filter((r) => r.title.trim()).length} Bab Terisi)
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowBulkTocPaste((v) => !v)}
                  className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <ClipboardPaste className="w-3 h-3" />
                  <span>{showBulkTocPaste ? 'Tutup Tempel' : 'Tempel Teks Daftar Isi'}</span>
                </button>
                <button
                  type="button"
                  onClick={addTocRow}
                  className="px-2.5 py-1 rounded bg-blue-700 hover:bg-blue-800 text-white text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3 h-3" />
                  <span>Tambah Bab</span>
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Masukkan bab, subbab/materi pokok, halaman, dan semester sebagai acuan referensi pembuatan CP/TP, PROTA/PROSEM, Modul, Bahan Ajar, LKPD, dan Soal.
            </p>

            {showBulkTocPaste && (
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2">
                <textarea
                  rows={4}
                  value={bulkTocPasteText}
                  onChange={(e) => setBulkTocPasteText(e.target.value)}
                  placeholder="Tempelkan daftar isi dari PDF/Word, contoh:&#10;Bab 1 Jelajah Nusantara (Hal. 1-30): Teks Deskripsi, Majas, Struktur&#10;Bab 2 Berkelana di Dunia Imajinasi (Hal. 31-62)&#10;- Puisi Rakyat&#10;- Cerita Fantasi"
                  className="w-full px-2.5 py-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleApplyBulkTocPaste}
                    className="px-3 py-1.5 rounded bg-indigo-700 hover:bg-indigo-800 text-white text-[11px] font-semibold whitespace-nowrap shrink-0"
                  >
                    Ubah Jadi Baris Bab
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {tocRows.map((row, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      value={row.chapterNumber}
                      onChange={(e) => updateTocRow(idx, { chapterNumber: e.target.value })}
                      placeholder="Bab 1"
                      className="sm:col-span-3 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold tabular-nums"
                    />
                    <input
                      type="text"
                      value={row.title}
                      onChange={(e) => updateTocRow(idx, { title: e.target.value })}
                      placeholder="Judul Bab / Tema Materi"
                      className="sm:col-span-6 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    />
                    <div className="sm:col-span-3 flex items-center gap-1">
                      <input
                        type="text"
                        value={row.pageRange}
                        onChange={(e) => updateTocRow(idx, { pageRange: e.target.value })}
                        placeholder="Hal 1-30"
                        className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() => removeTocRow(idx)}
                        title="Hapus baris bab"
                        className="p-1.5 text-slate-400 hover:text-red-600 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <input
                      type="text"
                      value={row.subchaptersText}
                      onChange={(e) => updateTocRow(idx, { subchaptersText: e.target.value })}
                      placeholder="Subbab / Materi Pokok (pisahkan koma, mis. Pengertian, Struktur, Contoh)"
                      className="sm:col-span-8 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    />
                    <select
                      value={row.recommendedSemester}
                      onChange={(e) => updateTocRow(idx, { recommendedSemester: e.target.value })}
                      className="sm:col-span-4 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    >
                      <option value="Semester 1">Semester 1</option>
                      <option value="Semester 2">Semester 2</option>
                      <option value="Semester 1 & 2">Semester 1 & 2</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    value={row.summary}
                    onChange={(e) => updateTocRow(idx, { summary: e.target.value })}
                    placeholder="Ringkasan singkat materi / catatan referensi bab (opsional)"
                    className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Ringkasan Umum / Catatan Tambahan Buku (Opsional)
            </label>
            <textarea
              rows={2}
              value={form.manualText}
              onChange={(e) => setForm({ ...form, manualText: e.target.value })}
              placeholder="Catatan tambahan pendekatan buku, fokus keterampilan, atau cakupan materi..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
          </div>

          {extractError && (
            <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">{extractError}</p>
              </div>
              <div className="flex flex-wrap gap-2 pl-6">
                <button
                  type="button"
                  onClick={() => setActivePage('pengaturan-ai')}
                  className="px-2.5 py-1 rounded bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-[11px] font-semibold text-amber-900 dark:text-amber-200 hover:bg-amber-100/60 whitespace-nowrap"
                >
                  Buka Pengaturan AI
                </button>
                {(form.sourceUrl.trim() || form.manualText.trim() || tocRows.some((r) => r.title.trim())) && (
                  <button
                    type="button"
                    disabled={savingDirect}
                    onClick={handleSaveDirectDataAndLink}
                    className="px-2.5 py-1 rounded bg-amber-700 hover:bg-amber-800 text-white text-[11px] font-semibold whitespace-nowrap"
                  >
                    Simpan Daftar Isi & Link Sekarang
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              type="submit"
              disabled={uploading || savingDirect || detectingLink}
              className="flex-1 py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
              <span>
                {uploading
                  ? 'Mendeteksi & Menyimpan...'
                  : detectedDraft
                  ? `Simpan Buku (${detectedDraft.chapters.length} Bab Terdeteksi)`
                  : 'Ekstrak AI & Simpan'}
              </span>
            </button>
            <button
              type="button"
              disabled={uploading || savingDirect || detectingLink}
              onClick={handleSaveDirectDataAndLink}
              className="py-2.5 px-3.5 rounded-lg border border-blue-700 text-blue-700 dark:text-sky-400 dark:border-sky-500 hover:bg-blue-50 dark:hover:bg-sky-950/30 disabled:opacity-60 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
            >
              {savingDirect ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Simpan Daftar Isi & Referensi</span>
            </button>
          </div>
        </form>

        {/* Book List + Extracted Structure Viewer */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Koleksi Buku Referensi ({textbooks.length})
            </h2>

            {textbooks.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
                Belum ada buku ditambahkan. Masukkan link buku, unggah berkas, atau isi daftar isi buku agar AI menyusun perangkat secara akurat.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {textbooks.map((book) => {
                  const matchesActiveWs =
                    activeWorkspace &&
                    book.subject.trim().toLowerCase() === activeWorkspace.subject.trim().toLowerCase() &&
                    (!book.curriculum || book.curriculum.trim().toLowerCase() === activeWorkspace.curriculum.trim().toLowerCase());
                  return (
                  <div
                    key={book.id}
                    onClick={() => setSelectedBookId(book.id || '')}
                    className={`py-3 px-2 rounded-lg cursor-pointer flex items-center justify-between gap-3 ${
                      activeBook?.id === book.id ? 'bg-blue-50/70 dark:bg-sky-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{book.title}</p>
                        {matchesActiveWs && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 text-[10px] font-semibold shrink-0">
                            Sesuai Kurikulum Aktif
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {book.curriculum || 'Kurikulum Merdeka'} · {book.subject} · {book.grade} · {book.referenceType === 'primary' ? 'Buku Utama' : book.referenceType} · {(book.chapters || []).length} bab
                        {book.sourceUrl ? ' · Ada Link Buku' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {book.referenceType !== 'primary' && book.id && (
                        <button
                          type="button"
                          onClick={() => {
                            updateRecord('textbooks', book.id!, { referenceType: 'primary' });
                            notify(`${book.title} dijadikan Buku Utama.`, 'success');
                          }}
                          className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-[11px] font-medium hover:bg-white dark:hover:bg-slate-800"
                        >
                          Jadikan Utama
                        </button>
                      )}
                      {book.id && (
                        confirmDeleteId === book.id ? (
                          <span className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={async () => {
                                await deleteRecord('textbooks', book.id!);
                                setConfirmDeleteId(null);
                                notify('Buku dihapus dari pustaka.', 'info');
                              }}
                              className="px-2 py-1 rounded bg-red-600 text-white text-[11px] font-semibold"
                            >
                              Hapus
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 rounded border border-slate-300 text-[11px]"
                            >
                              Batal
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(book.id!)}
                            className="p-1.5 text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          {activeBook && (
            <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {activeBook.curriculum || 'Kurikulum Merdeka'} · {activeBook.level || '-'} · {activeBook.grade || '-'} · {activeBook.subject}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {activeBook.author || '-'} · {activeBook.publisher || '-'} {activeBook.publishYear ? `(${activeBook.publishYear})` : ''} {activeBook.isbn ? `· ISBN ${activeBook.isbn}` : ''}
                  </p>
                  <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                    {activeBook.title}
                  </h3>
                  {activeBook.sourceUrl && (
                    <a
                      href={activeBook.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-sky-400 hover:underline break-all"
                    >
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      <span>{activeBook.sourceUrl}</span>
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {activeBook.sourceUrl && (
                    <button
                      type="button"
                      disabled={redetectingId === activeBook.id}
                      onClick={handleRedetectActiveBookFromLink}
                      className="px-3 py-1.5 rounded-lg bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      {redetectingId === activeBook.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {redetectingId === activeBook.id ? 'Mendeteksi...' : 'Deteksi Bab & Materi dari Link'}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => exportTextbookPdf(activeBook)}
                    className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Buku (PDF)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingBook((v) => !v)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>{editingBook ? 'Tutup Edit' : 'Edit Link & Data'}</span>
                  </button>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Siap</span>
                  </span>
                </div>
              </div>

              {editingBook && (
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Link Buku (URL)</label>
                      <input
                        type="url"
                        value={editBookForm.sourceUrl}
                        onChange={(e) => setEditBookForm({ ...editBookForm, sourceUrl: e.target.value })}
                        placeholder="https://..."
                        className="w-full px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Kurikulum Buku</label>
                      <select
                        value={editBookForm.curriculum}
                        onChange={(e) => setEditBookForm({ ...editBookForm, curriculum: e.target.value })}
                        className="w-full px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                      >
                        {availableCurricula.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Mata Pelajaran</label>
                      <input
                        type="text"
                        value={editBookForm.subject}
                        onChange={(e) => setEditBookForm({ ...editBookForm, subject: e.target.value })}
                        className="w-full px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Jenjang</label>
                      <select
                        value={editBookForm.level}
                        onChange={(e) => setEditBookForm({ ...editBookForm, level: e.target.value })}
                        className="w-full px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                      >
                        {EDUCATION_LEVELS.map((l) => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Kelas</label>
                      <input
                        type="text"
                        value={editBookForm.grade}
                        onChange={(e) => setEditBookForm({ ...editBookForm, grade: e.target.value })}
                        className="w-full px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Penulis</label>
                      <input
                        type="text"
                        value={editBookForm.author}
                        onChange={(e) => setEditBookForm({ ...editBookForm, author: e.target.value })}
                        className="w-full px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Penerbit</label>
                      <input
                        type="text"
                        value={editBookForm.publisher}
                        onChange={(e) => setEditBookForm({ ...editBookForm, publisher: e.target.value })}
                        className="w-full px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Ringkasan / Catatan Isi Buku</label>
                      <textarea
                        rows={3}
                        value={editBookForm.extractedSummary}
                        onChange={(e) => setEditBookForm({ ...editBookForm, extractedSummary: e.target.value })}
                        className="w-full px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleUpdateActiveBook}
                    className="px-3.5 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Simpan Perubahan Data Buku</span>
                  </button>
                </div>
              )}

              {activeBook.extractedSummary && (
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                  {activeBook.extractedSummary}
                </p>
              )}

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                    Daftar Isi & Struktur Bab Referensi ({(activeBook.chapters || []).length} Bab)
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowActiveBulkImport((v) => !v)}
                    className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <ClipboardPaste className="w-3 h-3" />
                    <span>{showActiveBulkImport ? 'Tutup Impor Massal' : 'Tempel Daftar Isi Massal'}</span>
                  </button>
                </div>

                {showActiveBulkImport && (
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                    <textarea
                      rows={4}
                      value={activeBulkTocText}
                      onChange={(e) => setActiveBulkTocText(e.target.value)}
                      placeholder="Tempelkan daftar isi buku (Bab 1 ..., Bab 2 ..., dst) untuk ditambahkan sekaligus ke buku ini..."
                      className="w-full px-2.5 py-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleImportBulkToActiveBook}
                        className="px-3 py-1.5 rounded bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold whitespace-nowrap shrink-0"
                      >
                        Tambahkan ke Daftar Isi Buku
                      </button>
                    </div>
                  </div>
                )}

                {(activeBook.chapters || []).map((ch, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5"
                  >
                    {editingChapterIdx === idx ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                          <input
                            type="text"
                            value={editChapterForm.chapterNumber}
                            onChange={(e) => setEditChapterForm({ ...editChapterForm, chapterNumber: e.target.value })}
                            placeholder="Bab"
                            className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                          />
                          <input
                            type="text"
                            value={editChapterForm.title}
                            onChange={(e) => setEditChapterForm({ ...editChapterForm, title: e.target.value })}
                            placeholder="Judul Bab"
                            className="sm:col-span-2 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                          />
                          <input
                            type="text"
                            value={editChapterForm.pageRange}
                            onChange={(e) => setEditChapterForm({ ...editChapterForm, pageRange: e.target.value })}
                            placeholder="Hal"
                            className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs tabular-nums"
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            type="text"
                            value={editChapterForm.subchaptersText}
                            onChange={(e) => setEditChapterForm({ ...editChapterForm, subchaptersText: e.target.value })}
                            placeholder="Subbab (pisahkan koma)"
                            className="sm:col-span-2 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                          />
                          <select
                            value={editChapterForm.recommendedSemester}
                            onChange={(e) => setEditChapterForm({ ...editChapterForm, recommendedSemester: e.target.value })}
                            className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                          >
                            <option value="Semester 1">Semester 1</option>
                            <option value="Semester 2">Semester 2</option>
                            <option value="Semester 1 & 2">Semester 1 & 2</option>
                          </select>
                        </div>
                        <input
                          type="text"
                          value={editChapterForm.summary}
                          onChange={(e) => setEditChapterForm({ ...editChapterForm, summary: e.target.value })}
                          placeholder="Ringkasan materi bab"
                          className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSaveEditedChapter(idx)}
                            className="px-3 py-1 rounded bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold whitespace-nowrap shrink-0"
                          >
                            Simpan Bab
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingChapterIdx(null)}
                            className="px-3 py-1 rounded border border-slate-300 dark:border-slate-700 text-xs whitespace-nowrap shrink-0"
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-700 dark:text-sky-400 shrink-0" />
                            <span>{ch.chapterNumber}: {ch.title}</span>
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            {ch.recommendedSemester && (
                              <span className="px-2 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-medium">
                                {ch.recommendedSemester}
                              </span>
                            )}
                            {ch.relevanceLevel && (
                              <span
                                className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${
                                  RELEVANCE_META[ch.relevanceLevel]?.badgeClass || RELEVANCE_META.relevan.badgeClass
                                }`}
                              >
                                {RELEVANCE_META[ch.relevanceLevel]?.label || ch.relevanceLevel}
                              </span>
                            )}
                            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                              {ch.pageRange || 'Halaman tidak teridentifikasi'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleStartEditChapter(idx, ch)}
                              title="Edit bab ini"
                              className="p-1 text-slate-400 hover:text-blue-700 dark:hover:text-sky-400"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveChapterFromActiveBook(idx)}
                              title="Hapus bab ini"
                              className="p-1 text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {ch.curriculumAlignment && (
                          <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
                            Kesesuaian Kurikulum: {ch.curriculumAlignment}
                          </p>
                        )}
                        <p className="text-xs text-slate-600 dark:text-slate-300">{ch.summary}</p>
                        {ch.subchapters?.length > 0 && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Subbab: {ch.subchapters.join(' · ')}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                ))}

                {/* Tambah Bab Manual */}
                <form
                  onSubmit={handleAddChapterToActiveBook}
                  className="p-3.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 space-y-2.5"
                >
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Tambah Bab Daftar Isi Secara Manual
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <input
                      type="text"
                      placeholder="No (mis. Bab 1)"
                      value={newChapter.chapterNumber}
                      onChange={(e) => setNewChapter({ ...newChapter, chapterNumber: e.target.value })}
                      className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Judul Bab / Materi"
                      value={newChapter.title}
                      onChange={(e) => setNewChapter({ ...newChapter, title: e.target.value })}
                      className="sm:col-span-2 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Hal (mis. 1-24)"
                      value={newChapter.pageRange}
                      onChange={(e) => setNewChapter({ ...newChapter, pageRange: e.target.value })}
                      className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs tabular-nums"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Subbab (pisahkan koma)"
                      value={newChapter.subchaptersText}
                      onChange={(e) => setNewChapter({ ...newChapter, subchaptersText: e.target.value })}
                      className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    />
                    <select
                      value={newChapter.recommendedSemester}
                      onChange={(e) => setNewChapter({ ...newChapter, recommendedSemester: e.target.value })}
                      className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    >
                      <option value="Semester 1">Semester 1</option>
                      <option value="Semester 2">Semester 2</option>
                      <option value="Semester 1 & 2">Semester 1 & 2</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Ringkasan singkat isi bab"
                      value={newChapter.summary}
                      onChange={(e) => setNewChapter({ ...newChapter, summary: e.target.value })}
                      className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Bab</span>
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
