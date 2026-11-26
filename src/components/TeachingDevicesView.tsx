import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  Loader2,
  Download,
  FileText,
  Printer,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Presentation,
  Trash2,
  Bookmark,
  Clock,
  Target,
  Info,
  ClipboardList,
  Award,
  Pencil,
  Save,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { postAuthedJson } from '../lib/apiClient';
import { createRecord, updateRecord, deleteRecord } from '../lib/firestoreHelpers';
import { LearningDocumentRecord, PptSlideSpec } from '../types/education';
import {
  exportDocumentDocx,
  exportDocumentPdf,
  exportLkpdDocx,
  exportLkpdPdf,
  exportSlidesPptx,
  LkpdExportPayload,
  PrintableDocPayload,
  resolveTitiMangsa,
} from '../lib/exporters';
import { OfficialDocumentSheet } from './OfficialDocumentSheet';
import { buildRichTextbookContext } from '../lib/bookContext';
import {
  formatJpDuration,
  getDefaultPhaseSplits,
  getMinutesPerJp,
  getOfficialJpStandard,
} from '../lib/curriculumData';

function normalizeSemesterLabel(raw?: string, month?: string): 'Semester 1' | 'Semester 2' {
  const s = (raw || '').trim().toLowerCase();
  if (s.includes('2') || s.includes('genap')) return 'Semester 2';
  if (s.includes('1') || s.includes('ganjil')) return 'Semester 1';
  const m = (month || '').trim().toLowerCase();
  if (['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'jan', 'feb', 'mar', 'apr', 'jun'].some((k) => m.startsWith(k))) {
    return 'Semester 2';
  }
  return 'Semester 1';
}

interface SemesterMeetingSpec {
  meetingNumber: number;
  topic: string;
  subtopic: string;
  tpDescription: string;
  jpAllocation: number;
  month?: string;
}

export const TeachingDevicesView: React.FC<{
  mode: 'modul-ajar' | 'bahan-ajar' | 'lkpd' | 'powerpoint';
}> = ({ mode }) => {
  const { user, profile, aiSettings, activeSchool, activeWorkspace, textbooks, documents, prosemItems, setActivePage, notify } = useApp();

  const docTypeKey =
    mode === 'modul-ajar'
      ? 'modul_ajar'
      : mode === 'bahan-ajar'
      ? 'bahan_ajar'
      : mode === 'lkpd'
      ? 'lkpd'
      : 'powerpoint';

  const workspaceDocs = documents.filter(
    (d) => d.docType === docTypeKey && (!activeWorkspace || d.workspaceId === activeWorkspace.id)
  );

  const [selectedSemester, setSelectedSemester] = useState<'Semester 1' | 'Semester 2'>(() =>
    normalizeSemesterLabel(activeWorkspace?.semester)
  );
  useEffect(() => {
    setSelectedSemester(normalizeSemesterLabel(activeWorkspace?.semester));
  }, [activeWorkspace?.id, activeWorkspace?.semester]);

  const [docSemesterFilter, setDocSemesterFilter] = useState<'all' | 'Semester 1' | 'Semester 2'>('all');

  const filteredDocs = React.useMemo(() => {
    const list = workspaceDocs.filter((d) =>
      docSemesterFilter === 'all' ? true : normalizeSemesterLabel(d.semester) === docSemesterFilter
    );
    return [...list].sort((a, b) => {
      const sa = normalizeSemesterLabel(a.semester);
      const sb = normalizeSemesterLabel(b.semester);
      if (sa !== sb) return sa.localeCompare(sb);
      return Number(a.meetingNumber ?? 999) - Number(b.meetingNumber ?? 999);
    });
  }, [workspaceDocs, docSemesterFilter]);

  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const activeDoc: LearningDocumentRecord | null =
    filteredDocs.find((d) => d.id === selectedDocId) || filteredDocs[0] || null;

  const [generating, setGenerating] = useState(false);

  // Generator options
  const wsProsem = React.useMemo(
    () =>
      prosemItems
        .filter((p) => !activeWorkspace || p.workspaceId === activeWorkspace.id)
        .sort((a, b) => a.meetingNumber - b.meetingNumber),
    [prosemItems, activeWorkspace]
  );

  const [selectedMeeting, setSelectedMeeting] = useState<number>(1);
  const [topicInput, setTopicInput] = useState<string>('');
  const [tpInput, setTpInput] = useState<string>('');
  const [learningModel, setLearningModel] = useState<string>('Problem Based Learning (PBL)');
  const [deviceScope, setDeviceScope] = useState<'semester' | 'chapter' | 'single'>('semester');
  const [titiMangsaInput, setTitiMangsaInput] = useState<string>('');
  useEffect(() => {
    setTitiMangsaInput(activeSchool?.titiMangsa || '');
  }, [activeSchool?.titiMangsa]);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [lkpdVariant, setLkpdVariant] = useState<string>('LKPD Kelompok');
  const [slideCount, setSlideCount] = useState<number>(10);
  const [pptTheme, setPptTheme] = useState<string>('cobalt');
  const [includeAnimation, setIncludeAnimation] = useState<boolean>(true);
  const [slideIndex, setSlideIndex] = useState<number>(0);
  const [editingLkpd, setEditingLkpd] = useState<boolean>(false);
  const [showLkpdFlow, setShowLkpdFlow] = useState<boolean>(false);

  const jpStandard = React.useMemo(
    () =>
      getOfficialJpStandard({
        level: activeWorkspace?.level || activeSchool?.level,
        grade: activeWorkspace?.grade,
        subject: activeWorkspace?.subject || activeSchool?.subject,
        curriculum: activeWorkspace?.curriculum,
      }),
    [activeWorkspace, activeSchool]
  );
  const minutesPerJp = getMinutesPerJp(
    activeWorkspace?.level || activeSchool?.level,
    activeWorkspace?.grade
  );
  const effectiveJpPerWeek = Number(activeWorkspace?.jpPerWeek || jpStandard.jpPerWeek);

  const semesterMeetings: SemesterMeetingSpec[] = React.useMemo(() => {
    const tpByTopic = new Map<string, { tpDescription: string; jpAllocation: number }>();
    const tpByCode = new Map<string, string>();
    const elements = activeWorkspace?.curriculumData?.elements || [];

    for (const el of elements) {
      for (const t of el.topics || []) {
        const title = (t.topicTitle || '').trim();
        const desc = (t.tpDescription || '').trim();
        if (title) {
          tpByTopic.set(title.toLowerCase(), {
            tpDescription: desc || `Peserta didik mampu memahami dan menerapkan konsep ${title}.`,
            jpAllocation: Number(t.estimatedJp || jpStandard.recommendedJpPerMeeting),
          });
        }
        if (t.tpCode && desc) {
          tpByCode.set(String(t.tpCode).trim().toLowerCase(), desc);
        }
      }
    }

    const semesterProsem = wsProsem.filter(
      (p) => normalizeSemesterLabel(p.semester, p.month) === selectedSemester
    );

    if (semesterProsem.length > 0) {
      const seenMeeting = new Set<number>();
      const out: SemesterMeetingSpec[] = [];
      for (const p of semesterProsem) {
        let mNo = Number(p.meetingNumber || out.length + 1);
        while (seenMeeting.has(mNo)) mNo += 1;
        seenMeeting.add(mNo);
        const topic = (p.topic || 'Materi Pembelajaran').trim();
        const subtopic = (p.subtopic || topic).trim();
        const matchedTp =
          (p.tpCode ? tpByCode.get(String(p.tpCode).trim().toLowerCase()) : undefined) ||
          tpByTopic.get(topic.toLowerCase())?.tpDescription ||
          `Peserta didik mampu memahami dan menerapkan konsep ${subtopic}.`;
        out.push({
          meetingNumber: mNo,
          topic,
          subtopic,
          tpDescription: matchedTp,
          jpAllocation: Number(p.jpAllocation || jpStandard.recommendedJpPerMeeting),
          month: p.month,
        });
      }
      return out.sort((a, b) => a.meetingNumber - b.meetingNumber);
    }

    // Fallback: derive meeting sequence from workspace curriculum topics/subtopics
    const derived: SemesterMeetingSpec[] = [];
    let mCounter = 1;
    for (const el of elements) {
      for (const t of el.topics || []) {
        const title = (t.topicTitle || '').trim();
        if (!title) continue;
        const tpDesc =
          (t.tpDescription || '').trim() ||
          `Peserta didik mampu memahami dan menerapkan konsep ${title}.`;
        const subtopics: string[] = Array.isArray(t.subtopics) && t.subtopics.length > 0 ? t.subtopics : [];
        const targetCount = Math.max(1, Number(t.estimatedMeetings || subtopics.length || 2));
        const jpPerMeeting = Math.max(
          1,
          Math.round(Number(t.estimatedJp || targetCount * jpStandard.recommendedJpPerMeeting) / targetCount)
        );
        for (let idx = 0; idx < targetCount; idx++) {
          const sub = subtopics[idx] || (targetCount > 1 ? `${title} (Bagian ${idx + 1})` : title);
          derived.push({
            meetingNumber: mCounter++,
            topic: title,
            subtopic: sub,
            tpDescription: tpDesc,
            jpAllocation: jpPerMeeting,
          });
        }
      }
    }

    if (derived.length > 0) return derived;

    return [
      {
        meetingNumber: 1,
        topic: activeWorkspace?.subject || 'Materi Pembelajaran',
        subtopic: activeWorkspace?.subject || 'Pertemuan 1',
        tpDescription: 'Peserta didik mampu memahami dan menerapkan konsep inti materi pembelajaran.',
        jpAllocation: jpStandard.recommendedJpPerMeeting,
      },
    ];
  }, [activeWorkspace, wsProsem, selectedSemester, jpStandard.recommendedJpPerMeeting]);

  useEffect(() => {
    if (semesterMeetings.length > 0 && !semesterMeetings.some((m) => m.meetingNumber === selectedMeeting)) {
      setSelectedMeeting(semesterMeetings[0].meetingNumber);
    }
  }, [semesterMeetings, selectedMeeting]);

  const getBookContext = () =>
    buildRichTextbookContext(textbooks, activeWorkspace?.primaryBookId, activeWorkspace?.subject, {
      curriculum: activeWorkspace?.curriculum,
      grade: activeWorkspace?.grade,
      level: activeWorkspace?.level,
      semester: selectedSemester,
    });

  const activeReferenceBook =
    textbooks.find((b) => b.id === activeWorkspace?.primaryBookId) ||
    textbooks.find(
      (b) =>
        b.subject.trim().toLowerCase() === (activeWorkspace?.subject || '').trim().toLowerCase() &&
        (!b.curriculum || b.curriculum.trim().toLowerCase() === (activeWorkspace?.curriculum || '').trim().toLowerCase())
    ) ||
    textbooks.find(
      (b) =>
        b.subject.trim().toLowerCase() === (activeWorkspace?.subject || '').trim().toLowerCase()
    ) ||
    textbooks[0] ||
    null;

  const resolveMeetingMeta = (meetingNo: number) => {
    const matched = semesterMeetings.find((m) => m.meetingNumber === meetingNo) || semesterMeetings[0];
    const fallbackTopic =
      matched?.topic ||
      activeWorkspace?.curriculumData?.elements?.[0]?.topics?.[0]?.topicTitle ||
      activeWorkspace?.subject ||
      'Materi Pembelajaran';
    return {
      meetingNumber: matched?.meetingNumber || meetingNo,
      topic: topicInput.trim() || fallbackTopic,
      subtopic: topicInput.trim() || matched?.subtopic || fallbackTopic,
      tpDescription:
        tpInput.trim() ||
        matched?.tpDescription ||
        'Peserta didik mampu memahami dan menerapkan konsep materi pembelajaran.',
      jpAllocation: matched?.jpAllocation || jpStandard.recommendedJpPerMeeting,
    };
  };

  const formatDeviceTitle = (
    targetDocType: 'modul_ajar' | 'bahan_ajar' | 'lkpd',
    m: SemesterMeetingSpec
  ) => {
    const labelTopic = (m.subtopic && m.subtopic !== m.topic ? `${m.topic} — ${m.subtopic}` : m.topic).trim();
    const prefix =
      targetDocType === 'modul_ajar'
        ? `Modul Ajar Pertemuan ${m.meetingNumber}`
        : targetDocType === 'bahan_ajar'
        ? `Bahan Ajar Pertemuan ${m.meetingNumber}`
        : `${lkpdVariant} Pertemuan ${m.meetingNumber}`;
    return `${prefix}: ${labelTopic}`.slice(0, 240);
  };

  const runBatchForDocType = async (
    targetDocType: 'modul_ajar' | 'bahan_ajar' | 'lkpd',
    meetingsToProcess: SemesterMeetingSpec[],
    bookCtx: string,
    progressPrefix?: string
  ) => {
    if (!user || !activeWorkspace?.id) return { created: 0, skipped: 0 };

    const existingMeetingNums = new Set(
      documents
        .filter(
          (d) =>
            d.docType === targetDocType &&
            d.workspaceId === activeWorkspace.id &&
            normalizeSemesterLabel(d.semester) === selectedSemester &&
            typeof d.meetingNumber === 'number'
        )
        .map((d) => Number(d.meetingNumber))
    );

    const pending = meetingsToProcess.filter((m) => !existingMeetingNums.has(m.meetingNumber));
    const skipped = meetingsToProcess.length - pending.length;
    if (pending.length === 0) return { created: 0, skipped };

    let created = 0;
    const CHUNK_SIZE = 4;
    for (let offset = 0; offset < pending.length; offset += CHUNK_SIZE) {
      const chunk = pending.slice(offset, offset + CHUNK_SIZE);
      const firstNo = chunk[0].meetingNumber;
      const lastNo = chunk[chunk.length - 1].meetingNumber;
      setBatchProgress({
        current: Math.min(offset + chunk.length, pending.length),
        total: pending.length,
        label: `${progressPrefix ? `${progressPrefix}: ` : ''}Pertemuan ${firstNo}${lastNo !== firstNo ? `–${lastNo}` : ''} (${selectedSemester})`,
      });

      const res = await postAuthedJson<{ items: Array<{ meetingNumber: number; data: any }> }>(
        '/api/ai/batch-devices',
        {
          docType: targetDocType,
          workspace: activeWorkspace,
          semester: selectedSemester,
          meetings: chunk.map((m) => ({
            meetingNumber: m.meetingNumber,
            topic: m.topic,
            subtopic: m.subtopic,
            tpDescription: m.tpDescription,
            jpAllocation: m.jpAllocation,
          })),
          learningModel,
          lkpdType: lkpdVariant,
          textbookContext: bookCtx,
          aiPreferences: aiSettings || undefined,
        }
      );

      for (const entry of res.items || []) {
        const mSpec = chunk.find((c) => c.meetingNumber === entry.meetingNumber) || chunk[0];
        const newId = await createRecord('documents', {
          ownerId: user.uid,
          workspaceId: activeWorkspace.id,
          academicYear: activeWorkspace.academicYear,
          semester: selectedSemester,
          grade: activeWorkspace.grade,
          subject: activeWorkspace.subject,
          docType: targetDocType,
          title: formatDeviceTitle(targetDocType, mSpec),
          meetingNumber: mSpec.meetingNumber,
          chapterTitle: mSpec.topic.slice(0, 190),
          status: 'draft',
          isAiDraft: true,
          sourceRef: (
            targetDocType === 'bahan_ajar' && typeof entry.data?.referensiBuku === 'string' && entry.data.referensiBuku.trim()
              ? entry.data.referensiBuku.trim()
              : bookCtx
              ? 'Buku Referensi Guru'
              : 'Draf AI'
          ).slice(0, 500),
          content: entry.data,
          version: 1,
          archived: false,
        });
        created++;
        if (targetDocType === docTypeKey && created === 1) {
          setSelectedDocId(newId);
        }
      }
    }

    return { created, skipped };
  };

  const handleGenerate = async () => {
    if (!user || !activeWorkspace?.id) {
      notify('Pilih atau buat ruang kerja mata pelajaran di AI Auto Curriculum terlebih dahulu.', 'error');
      return;
    }
    setGenerating(true);
    try {
      const bookCtx = getBookContext();

      if (mode === 'modul-ajar' || mode === 'bahan-ajar' || mode === 'lkpd') {
        const targetDocType = docTypeKey as 'modul_ajar' | 'bahan_ajar' | 'lkpd';

        if (deviceScope === 'single') {
          const mMeta = resolveMeetingMeta(selectedMeeting);
          const endpoint =
            targetDocType === 'modul_ajar'
              ? '/api/ai/modul-ajar'
              : targetDocType === 'bahan_ajar'
              ? '/api/ai/bahan-ajar'
              : '/api/ai/lkpd';
          const content = await postAuthedJson<any>(endpoint, {
            workspace: activeWorkspace,
            meetingNumber: mMeta.meetingNumber,
            semester: selectedSemester,
            topic: mMeta.topic,
            subtopic: mMeta.subtopic,
            tpDescription: mMeta.tpDescription,
            learningModel,
            durationJp: mMeta.jpAllocation,
            jpAllocation: mMeta.jpAllocation,
            lkpdType: lkpdVariant,
            textbookContext: bookCtx,
            aiPreferences: aiSettings || undefined,
          });
          const newId = await createRecord('documents', {
            ownerId: user.uid,
            workspaceId: activeWorkspace.id,
            academicYear: activeWorkspace.academicYear,
            semester: selectedSemester,
            grade: activeWorkspace.grade,
            subject: activeWorkspace.subject,
            docType: targetDocType,
            title: formatDeviceTitle(targetDocType, mMeta),
            meetingNumber: mMeta.meetingNumber,
            chapterTitle: mMeta.topic.slice(0, 190),
            status: 'draft',
            isAiDraft: true,
            sourceRef: (
              targetDocType === 'bahan_ajar' && typeof content?.referensiBuku === 'string' && content.referensiBuku.trim()
                ? content.referensiBuku.trim()
                : bookCtx
                ? 'Buku Referensi Guru'
                : 'Draf AI'
            ).slice(0, 500),
            content,
            version: 1,
            archived: false,
          });
          setSelectedDocId(newId);
          notify(`Perangkat Pertemuan ${mMeta.meetingNumber} (${selectedSemester}) berhasil dibuat.`, 'success');
          return;
        }

        const startIdx = Math.max(
          0,
          semesterMeetings.findIndex((m) => m.meetingNumber === selectedMeeting)
        );
        const targetList =
          deviceScope === 'chapter'
            ? semesterMeetings.slice(startIdx, startIdx + 3)
            : semesterMeetings;

        try {
          const { created, skipped } = await runBatchForDocType(targetDocType, targetList, bookCtx);
          if (created === 0 && skipped > 0) {
            notify(
              `Semua ${skipped} pertemuan pada ${selectedSemester} sudah tersedia. Hapus salah satu dokumen jika ingin membuat ulang, atau pilih "Satu Pertemuan Terpilih".`,
              'info'
            );
            return;
          }
          notify(
            skipped > 0
              ? `${created} dokumen pertemuan baru berhasil dibuat (${skipped} pertemuan sudah ada dilewati).`
              : `Semua ${created} dokumen per pertemuan (${selectedSemester}) berhasil dibuat sekaligus.`,
            'success'
          );
        } finally {
          setBatchProgress(null);
        }
        return;
      }

      // PowerPoint mode
      const meta = resolveMeetingMeta(selectedMeeting);
      const content = await postAuthedJson<any>('/api/ai/powerpoint', {
        workspace: activeWorkspace,
        meetingNumber: meta.meetingNumber,
        topic: meta.topic,
        tpDescription: meta.tpDescription,
        slideCount,
        theme: pptTheme,
        languageLevel: `${activeWorkspace.level} ${activeWorkspace.grade}`,
        includeAnimation,
        textbookContext: bookCtx,
        aiPreferences: aiSettings || undefined,
      });
      const newId = await createRecord('documents', {
        ownerId: user.uid,
        workspaceId: activeWorkspace.id,
        academicYear: activeWorkspace.academicYear,
        semester: selectedSemester,
        grade: activeWorkspace.grade,
        subject: activeWorkspace.subject,
        docType: 'powerpoint',
        title: `PPT Pertemuan ${meta.meetingNumber}: ${meta.topic}`.slice(0, 240),
        meetingNumber: meta.meetingNumber,
        chapterTitle: meta.topic.slice(0, 190),
        status: 'draft',
        isAiDraft: true,
        content,
        version: 1,
        archived: false,
      });
      setSelectedDocId(newId);
      setSlideIndex(0);
      notify('PowerPoint pembelajaran berhasil dibuat dan disimpan.', 'success');
    } catch (err: any) {
      notify(err?.message || 'Gagal membuat perangkat pembelajaran.', 'error');
    } finally {
      setBatchProgress(null);
      setGenerating(false);
    }
  };

  const handleGenerateAllThreeSemester = async () => {
    if (!user || !activeWorkspace?.id) {
      notify('Pilih atau buat ruang kerja mata pelajaran terlebih dahulu.', 'error');
      return;
    }
    setGenerating(true);
    let totalCreated = 0;
    try {
      const bookCtx = getBookContext();
      const specs: Array<{ type: 'modul_ajar' | 'bahan_ajar' | 'lkpd'; label: string }> = [
        { type: 'modul_ajar', label: 'Modul Ajar' },
        { type: 'bahan_ajar', label: 'Bahan Ajar' },
        { type: 'lkpd', label: 'LKPD' },
      ];
      for (const spec of specs) {
        const res = await runBatchForDocType(spec.type, semesterMeetings, bookCtx, spec.label);
        totalCreated += res.created;
      }
      if (totalCreated === 0) {
        notify(
          `Seluruh Modul Ajar, Bahan Ajar, dan LKPD untuk ${semesterMeetings.length} pertemuan di ${selectedSemester} sudah tersedia.`,
          'info'
        );
      } else {
        notify(
          `Paket lengkap ${totalCreated} dokumen (Modul Ajar, Bahan Ajar & LKPD per pertemuan ${selectedSemester}) berhasil dibuat sekaligus.`,
          'success'
        );
      }
    } catch (err: any) {
      if (totalCreated > 0) {
        notify(
          `${totalCreated} dokumen berhasil tersimpan sebelum terhenti: ${err?.message || 'kendala AI'}`,
          'error'
        );
      } else {
        notify(err?.message || 'Gagal menyusun paket perangkat satu semester.', 'error');
      }
    } finally {
      setBatchProgress(null);
      setGenerating(false);
    }
  };

  const buildPrintablePayload = (doc: LearningDocumentRecord): PrintableDocPayload => {
    const c = doc.content || {};
    const sections: PrintableDocPayload['sections'] = [];
    const subjectLabel = doc.subject || activeWorkspace?.subject || '-';
    const gradeLabel = doc.grade || activeWorkspace?.grade || '-';
    const semesterLabel = doc.semester || activeWorkspace?.semester || '-';
    const yearLabel = doc.academicYear || activeWorkspace?.academicYear || '-';
    const schoolDisplay = activeSchool?.name || '-';
    const teacherName = activeSchool?.teacherName || profile?.displayName || '-';

    const matchedMeeting = semesterMeetings.find((m) => m.meetingNumber === Number(doc.meetingNumber || 1));
    const meetingJp = Number(matchedMeeting?.jpAllocation || jpStandard.recommendedJpPerMeeting);
    const phaseSplits = getDefaultPhaseSplits(meetingJp, minutesPerJp);

    if (doc.docType === 'modul_ajar') {
      sections.push({
        heading: 'A. Informasi Umum',
        table: {
          headers: ['Komponen Identitas', 'Keterangan / Deskripsi'],
          rows: [
            ['Alokasi Waktu', formatJpDuration(meetingJp, activeWorkspace?.level || activeSchool?.level, gradeLabel)],
            ['Kompetensi Awal', c.informasiUmum?.kompetensiAwal || '-'],
            ['Karakteristik Peserta Didik', c.informasiUmum?.karakteristikPesertaDidik || '-'],
            ['Model Pembelajaran', c.informasiUmum?.modelPembelajaran || '-'],
            [
              'Sarana & Prasarana',
              Array.isArray(c.informasiUmum?.saranaPrasarana) && c.informasiUmum.saranaPrasarana.length > 0
                ? c.informasiUmum.saranaPrasarana.join('; ')
                : '-',
            ],
            ...(Array.isArray(c.informasiUmum?.profilPelajarPancasila) && c.informasiUmum.profilPelajarPancasila.length > 0
              ? [['Dimensi Profil Lulusan', c.informasiUmum.profilPelajarPancasila.join(', ')]]
              : []),
          ],
        },
      });
      sections.push({
        heading: 'B. Komponen Inti',
        paragraphs: [
          `Capaian Pembelajaran: ${c.komponenInti?.capaianPembelajaran || '-'}`,
          `Pemahaman Bermakna: ${c.komponenInti?.pemahamanBermakna || '-'}`,
          ...(Array.isArray(c.komponenInti?.pertanyaanPemantik) && c.komponenInti.pertanyaanPemantik.length > 0
            ? [`Pertanyaan Pemantik: ${c.komponenInti.pertanyaanPemantik.join(' | ')}`]
            : []),
        ],
        bullets: c.komponenInti?.tujuanPembelajaran || [],
      });
      sections.push({
        heading: 'C. Langkah-Langkah Kegiatan Pembelajaran',
        table: {
          headers: ['Tahap Kegiatan', 'Alokasi Waktu', 'Rincian Aktivitas Guru & Peserta Didik'],
          rows: [
            [
              '1. Pendahuluan',
              `${c.langkahPembelajaran?.pendahuluan?.estimasiMenit || phaseSplits.pendahuluan} Menit`,
              (c.langkahPembelajaran?.pendahuluan?.aktivitas || []).map((a: string, i: number) => `${i + 1}. ${a}`).join('\n') || '-',
            ],
            [
              '2. Kegiatan Inti',
              `${c.langkahPembelajaran?.inti?.estimasiMenit || phaseSplits.inti} Menit`,
              (c.langkahPembelajaran?.inti?.aktivitas || []).map((a: string, i: number) => `${i + 1}. ${a}`).join('\n') || '-',
            ],
            [
              '3. Penutup',
              `${c.langkahPembelajaran?.penutup?.estimasiMenit || phaseSplits.penutup} Menit`,
              (c.langkahPembelajaran?.penutup?.aktivitas || []).map((a: string, i: number) => `${i + 1}. ${a}`).join('\n') || '-',
            ],
          ],
        },
      });
      sections.push({
        heading: 'D. Pembelajaran Berdiferensiasi, Asesmen & Tindak Lanjut',
        table: {
          headers: ['Aspek Rancangan', 'Pelaksanaan & Instrumen'],
          rows: [
            ['Diferensiasi Konten', c.diferensiasi?.konten || '-'],
            ['Diferensiasi Proses', c.diferensiasi?.proses || '-'],
            ['Diferensiasi Produk', c.diferensiasi?.produk || '-'],
            ['Asesmen Diagnostik', c.asesmen?.diagnostik || '-'],
            ['Asesmen Formatif', c.asesmen?.formatif || '-'],
            ['Asesmen Sumatif', c.asesmen?.sumatif || '-'],
            ['Program Pengayaan', c.pengayaan || '-'],
            ['Program Remedial', c.remedial || '-'],
          ],
        },
      });
    } else if (doc.docType === 'bahan_ajar') {
      sections.push({
        heading: `A. Identitas Topik — Pertemuan Ke-${c.pertemuanKe || doc.meetingNumber || 1}: ${c.submateri || doc.title}`,
        paragraphs: [
          `Tujuan Pembelajaran: ${c.tujuanPembelajaran || '-'}`,
          `Pemahaman Bermakna: ${c.pemahamanBermakna || '-'}`,
        ],
        bullets: c.pertanyaanPemantik || [],
      });
      sections.push({
        heading: 'B. Uraian Materi & Glosarium Konsep Penting',
        paragraphs: c.penjelasanMateri || [],
        table:
          c.konsepPenting?.length > 0
            ? {
                headers: ['Istilah / Konsep Kunci', 'Definisi & Penjelasan'],
                rows: c.konsepPenting.map((k: any) => [k.istilah, k.definisi]),
              }
            : undefined,
      });
      sections.push({
        heading: 'C. Contoh Penerapan, Aktivitas & Rangkuman',
        paragraphs: [...(c.contohPenerapan || []), `Rangkuman Inti: ${c.rangkuman || '-'}`],
        bullets: c.aktivitasPembelajaran || [],
      });
      sections.push({
        heading: 'D. Latihan Pemahaman & Daftar Pustaka',
        bullets: (c.latihanSoal || []).map((l: any, i: number) => `${i + 1}. ${l.soal} (Kunci: ${l.jawabanSingkat})`),
        paragraphs: [`Sumber / Referensi: ${c.referensiBuku || doc.sourceRef || '-'}`],
      });
    } else if (doc.docType === 'lkpd') {
      sections.push({
        heading: `${c.jenisLkpd || 'LKPD'} — ${c.judulKegiatan || doc.title}`,
        paragraphs: [`Tujuan: ${c.tujuan || '-'}`, `Materi Singkat: ${c.materiSingkat || '-'}`],
        bullets: c.petunjukPengerjaan || [],
      });
      sections.push({
        heading: 'Langkah Kegiatan & Tugas',
        bullets: [...(c.langkahKegiatan || []), ...(c.pertanyaanPemahaman || [])],
        paragraphs: [`Tugas Praktik: ${c.tugasPraktik || '-'}`, `Kesimpulan: ${c.panduanKesimpulan || '-'}`],
      });
    } else {
      const slides: PptSlideSpec[] = c.slides || [];
      sections.push({
        heading: c.deckTitle || doc.title,
        table: {
          headers: ['Slide', 'Jenis', 'Judul', 'Poin Utama', 'Catatan Guru'],
          rows: slides.map((s) => [s.slideNumber, s.slideType, s.title, (s.bullets || []).join('; '), s.presenterNotes]),
        },
      });
    }

    return {
      title: doc.title,
      subtitle: `${subjectLabel} · ${gradeLabel} · Tahun Pelajaran ${yearLabel}`,
      fileName: doc.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_'),
      school: activeSchool,
      teacher: profile,
      metadataPairs: [
        { label: 'Satuan Pendidikan', value: schoolDisplay },
        { label: 'Mata Pelajaran', value: subjectLabel },
        { label: 'Kelas / Semester', value: `${gradeLabel} / ${semesterLabel}` },
        { label: 'Alokasi Waktu', value: c.alokasiWaktu || formatJpDuration(meetingJp, activeWorkspace?.level || activeSchool?.level, gradeLabel) },
        { label: 'Tahun Pelajaran', value: yearLabel },
        ...(doc.meetingNumber ? [{ label: 'Pertemuan Ke', value: `Pertemuan ${doc.meetingNumber}` }] : []),
        ...(doc.chapterTitle ? [{ label: 'Materi Pokok', value: doc.chapterTitle }] : []),
        { label: 'Guru Mata Pelajaran', value: teacherName },
      ],
      sections,
    };
  };

  const buildLkpdPayload = (doc: LearningDocumentRecord): LkpdExportPayload => {
    const matchedMeeting = semesterMeetings.find((m) => m.meetingNumber === Number(doc.meetingNumber || 1));
    const meetingJp = Number(matchedMeeting?.jpAllocation || jpStandard.recommendedJpPerMeeting);
    const levelVal = activeWorkspace?.level || activeSchool?.level;
    const gradeVal = doc.grade || activeWorkspace?.grade || '-';
    return {
      title: doc.title,
      fileName: doc.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_'),
      subject: doc.subject || activeWorkspace?.subject || '-',
      grade: gradeVal,
      level: levelVal,
      defaultDuration: formatJpDuration(meetingJp, levelVal, gradeVal),
      semester: doc.semester || activeWorkspace?.semester || '-',
      academicYear: doc.academicYear || activeWorkspace?.academicYear || '-',
      school: activeSchool,
      teacher: profile,
      content: doc.content || {},
    };
  };

  const updateLkpdField = async (field: string, value: any) => {
    if (!activeDoc?.id) return;
    await updateRecord('documents', activeDoc.id, {
      content: { ...(activeDoc.content || {}), [field]: value },
    });
  };

  const slides: PptSlideSpec[] = activeDoc?.docType === 'powerpoint' ? activeDoc.content?.slides || [] : [];
  const currentSlide = slides[slideIndex];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {mode === 'modul-ajar'
              ? 'Modul Ajar / RPP'
              : mode === 'bahan-ajar'
              ? 'Bahan Ajar Per Pertemuan'
              : mode === 'lkpd'
              ? 'Lembar Kerja Peserta Didik (LKPD)'
              : 'PowerPoint Pembelajaran Cerdas'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {activeWorkspace
              ? `${activeWorkspace.subject} · ${activeWorkspace.grade} · ${activeWorkspace.curriculum} · ${effectiveJpPerWeek} JP/minggu (@${minutesPerJp} Menit/JP)`
              : 'Pilih ruang kerja mata pelajaran.'}
          </p>
        </div>

        {activeDoc && (
          <div className="flex flex-wrap gap-2">
            {activeDoc.status !== 'approved' && activeDoc.id && (
              <button
                onClick={() => {
                  updateRecord('documents', activeDoc.id!, { status: 'approved' });
                  notify('Dokumen disetujui untuk digunakan.', 'success');
                }}
                className="px-3.5 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Setujui Dokumen</span>
              </button>
            )}
            {mode === 'powerpoint' && slides.length > 0 && (
              <button
                onClick={() =>
                  exportSlidesPptx({
                    deckTitle: activeDoc.content?.deckTitle || activeDoc.title,
                    theme: activeDoc.content?.theme || pptTheme,
                    subject: activeDoc.subject || activeWorkspace?.subject || 'Mapel',
                    grade: activeDoc.grade || activeWorkspace?.grade || 'Kelas',
                    schoolName: activeSchool?.name,
                    teacherName: profile?.displayName,
                    slides,
                    fileName: activeDoc.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_'),
                  })
                }
                className="px-3.5 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Presentation className="w-3.5 h-3.5" />
                <span>Unduh PPTX</span>
              </button>
            )}
            {mode === 'lkpd' && (
              <button
                onClick={() => setEditingLkpd((v) => !v)}
                className={`px-3 py-2 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 ${
                  editingLkpd
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                {editingLkpd ? <Save className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                <span>{editingLkpd ? 'Selesai Edit' : 'Edit Komponen'}</span>
              </button>
            )}
            <button
              onClick={() =>
                mode === 'lkpd'
                  ? exportLkpdPdf(buildLkpdPayload(activeDoc))
                  : exportDocumentPdf(buildPrintablePayload(activeDoc))
              }
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>
            <button
              onClick={() =>
                mode === 'lkpd'
                  ? exportLkpdDocx(buildLkpdPayload(activeDoc))
                  : exportDocumentDocx(buildPrintablePayload(activeDoc))
              }
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>DOCX</span>
            </button>
            <button
              onClick={() => window.print()}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak A4</span>
            </button>
          </div>
        )}
      </div>

      {/* Generator Controls */}
      <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 no-print">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Semester Target
            </label>
            <select
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value as 'Semester 1' | 'Semester 2')}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            >
              <option value="Semester 1">Semester 1 (Ganjil)</option>
              <option value="Semester 2">Semester 2 (Genap)</option>
            </select>
          </div>

          {mode !== 'powerpoint' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Cakupan Pembuatan
              </label>
              <select
                value={deviceScope}
                onChange={(e) => setDeviceScope(e.target.value as 'semester' | 'chapter' | 'single')}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                <option value="semester">
                  1 Semester Penuh ({semesterMeetings.length} Pertemuan)
                </option>
                <option value="chapter">Satu Bab (3 Pertemuan)</option>
                <option value="single">Satu Pertemuan Terpilih</option>
              </select>
            </div>
          )}

          {(mode === 'powerpoint' || deviceScope !== 'semester') && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Pertemuan PROSEM ({selectedSemester})
              </label>
              <select
                value={selectedMeeting}
                onChange={(e) => setSelectedMeeting(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                {semesterMeetings.map((m) => (
                  <option key={m.meetingNumber} value={m.meetingNumber}>
                    Pertemuan {m.meetingNumber} · {m.subtopic || m.topic}
                  </option>
                ))}
              </select>
            </div>
          )}

          {deviceScope === 'single' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Materi Pokok (Opsional)
              </label>
              <input
                type="text"
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                placeholder="Otomatis dari PROSEM/TP"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>
          )}

          {mode === 'modul-ajar' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Model Pembelajaran
              </label>
              <select
                value={learningModel}
                onChange={(e) => setLearningModel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                <option value="Problem Based Learning (PBL)">Problem Based Learning (PBL)</option>
                <option value="Project Based Learning (PjBL)">Project Based Learning (PjBL)</option>
                <option value="Discovery Learning">Discovery Learning</option>
                <option value="Inquiry Learning">Inquiry Learning</option>
                <option value="Cooperative Learning">Cooperative Learning</option>
              </select>
            </div>
          )}

          {mode === 'lkpd' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Jenis LKPD</label>
              <select
                value={lkpdVariant}
                onChange={(e) => setLkpdVariant(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                <option value="LKPD Individu">LKPD Individu</option>
                <option value="LKPD Kelompok">LKPD Kelompok</option>
                <option value="LKPD Proyek">LKPD Proyek</option>
                <option value="LKPD Praktik">LKPD Praktik</option>
                <option value="LKPD Berbasis Literasi">LKPD Berbasis Literasi</option>
                <option value="LKPD Berbasis Numerasi">LKPD Berbasis Numerasi</option>
                <option value="LKPD HOTS">LKPD HOTS</option>
              </select>
            </div>
          )}

          {mode === 'powerpoint' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Jumlah Slide & Tema</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={5}
                    max={25}
                    value={slideCount}
                    onChange={(e) => setSlideCount(Number(e.target.value))}
                    className="w-20 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono tabular-nums"
                  />
                  <select
                    value={pptTheme}
                    onChange={(e) => setPptTheme(e.target.value)}
                    className="flex-1 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  >
                    <option value="cobalt">Cobalt</option>
                    <option value="emerald">Emerald</option>
                    <option value="indigo">Indigo</option>
                    <option value="slate_dark">Slate Gelap</option>
                  </select>
                </div>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200 py-2">
                  <input
                    type="checkbox"
                    checked={includeAnimation}
                    onChange={(e) => setIncludeAnimation(e.target.checked)}
                  />
                  <span>Sertakan animasi konsep bertahap</span>
                </label>
              </div>
            </>
          )}

          <div className="flex items-end">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>
                {generating
                  ? batchProgress
                    ? `Menyusun ${batchProgress.current}/${batchProgress.total}...`
                    : 'Menyusun...'
                  : mode === 'powerpoint'
                  ? 'Buat Slide AI'
                  : deviceScope === 'semester'
                  ? `Buat Semua (${semesterMeetings.length} Pertemuan)`
                  : deviceScope === 'chapter'
                  ? 'Buat 3 Pertemuan'
                  : 'Buat 1 Pertemuan'}
              </span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Bookmark className="w-3.5 h-3.5 text-blue-700 dark:text-sky-400 shrink-0" />
            {activeReferenceBook ? (
              <span className="text-slate-700 dark:text-slate-200 truncate">
                Referensi aktif: <strong className="font-semibold">{activeReferenceBook.title}</strong>
                {activeReferenceBook.chapters?.length
                  ? ` (${activeReferenceBook.chapters.length} bab)`
                  : ''}
                {activeReferenceBook.sourceUrl ? ' · Link buku tersimpan' : ''}
              </span>
            ) : (
              <span className="text-slate-500 dark:text-slate-400">
                Belum ada data/link buku referensi. Tambahkan buku agar materi tiap pertemuan lebih akurat.
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setActivePage('database-buku')}
            className="text-xs font-semibold text-blue-700 dark:text-sky-400 hover:underline shrink-0"
          >
            {activeReferenceBook ? 'Kelola Link & Data Buku' : '+ Tambah Link / Data Buku'}
          </button>
        </div>

        {mode !== 'powerpoint' && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleGenerateAllThreeSemester}
                disabled={generating}
                className="px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>
                  Buat Paket Lengkap 1 Semester: Modul + Bahan Ajar + LKPD ({semesterMeetings.length} Pertemuan)
                </span>
              </button>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Otomatis per pertemuan {selectedSemester} · melewati pertemuan yang sudah ada
              </span>
            </div>

            {batchProgress && (
              <span className="text-xs font-medium text-blue-700 dark:text-sky-400">
                Menyusun ({batchProgress.current}/{batchProgress.total}): {batchProgress.label}
              </span>
            )}
          </div>
        )}

        {mode === 'modul-ajar' && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                Titi Mangsa:
              </span>
              <input
                type="text"
                maxLength={120}
                value={titiMangsaInput}
                onChange={(e) => setTitiMangsaInput(e.target.value)}
                onBlur={async () => {
                  const val = titiMangsaInput.trim().slice(0, 120);
                  if (activeSchool?.id && val !== (activeSchool.titiMangsa || '').trim()) {
                    await updateRecord('schools', activeSchool.id, { titiMangsa: val });
                    notify('Titi mangsa dokumen diperbarui.', 'success');
                  }
                }}
                placeholder={resolveTitiMangsa(activeSchool)}
                className="flex-1 min-w-[220px] max-w-md px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
              {activeSchool?.id && (
                <>
                  <button
                    type="button"
                    onClick={async () => {
                      const val = titiMangsaInput.trim().slice(0, 120);
                      await updateRecord('schools', activeSchool.id!, { titiMangsa: val });
                      notify('Titi mangsa diterapkan ke semua dokumen.', 'success');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-medium"
                  >
                    Terapkan
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setTitiMangsaInput('');
                      await updateRecord('schools', activeSchool.id!, { titiMangsa: '' });
                      notify('Titi mangsa diatur ulang ke titik-titik.', 'info');
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
                  >
                    Pakai Titik-Titik
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Document Picker + Main Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5 no-print">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Daftar Dokumen ({filteredDocs.length})
            </p>
            <div className="flex items-center gap-1">
              {(['all', 'Semester 1', 'Semester 2'] as const).map((semOpt) => (
                <button
                  key={semOpt}
                  type="button"
                  onClick={() => setDocSemesterFilter(semOpt)}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                    docSemesterFilter === semOpt
                      ? 'bg-blue-700 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {semOpt === 'all' ? 'Semua' : semOpt === 'Semester 1' ? 'Smt 1' : 'Smt 2'}
                </button>
              ))}
            </div>
          </div>
          {filteredDocs.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">Belum ada dokumen tersimpan.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[680px] overflow-y-auto">
              {filteredDocs.map((d) => (
                <div
                  key={d.id}
                  onClick={() => {
                    setSelectedDocId(d.id || '');
                    setSlideIndex(0);
                  }}
                  className={`py-2.5 px-2.5 rounded-lg cursor-pointer flex items-center justify-between gap-2 ${
                    activeDoc?.id === d.id ? 'bg-blue-50 dark:bg-sky-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{d.title}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {d.meetingNumber ? `P${d.meetingNumber} · ` : ''}
                      {normalizeSemesterLabel(d.semester)} · {d.status === 'approved' ? 'Disetujui' : 'Draf AI'}
                    </p>
                  </div>
                  {d.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteRecord('documents', d.id!);
                      }}
                      className="text-slate-400 hover:text-red-600 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Document Workspace */}
        <div className="lg:col-span-8 print-sheet">
          {!activeDoc ? (
            <div className="p-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-sm text-slate-500">
              Pilih dokumen di sebelah kiri atau buat perangkat baru menggunakan tombol di atas.
            </div>
          ) : mode === 'powerpoint' ? (
            <div className="space-y-4">
              {currentSlide && (
                <div
                  className={`p-6 md:p-8 rounded-xl border min-h-[360px] flex flex-col justify-between space-y-6 ${
                    pptTheme === 'slate_dark'
                      ? 'bg-slate-900 text-white border-slate-700'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-xs text-blue-700 dark:text-sky-400 font-semibold">
                      <span>{currentSlide.slideType} · Slide {currentSlide.slideNumber} dari {slides.length}</span>
                      <span>{currentSlide.transition || 'Transisi Halus'}</span>
                    </div>
                    <h2 className="font-display text-2xl font-bold">{currentSlide.title}</h2>
                    {currentSlide.subtitle && <p className="text-sm opacity-80">{currentSlide.subtitle}</p>}

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pt-2">
                      <ul className="md:col-span-7 space-y-2.5 text-sm list-disc pl-5">
                        {(currentSlide.bullets || []).map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                      {currentSlide.diagramNodes && currentSlide.diagramNodes.length > 0 && (
                        <div className="md:col-span-5 space-y-2">
                          {currentSlide.diagramNodes.map((n, i) => (
                            <div
                              key={i}
                              className="p-2.5 rounded-lg border border-blue-200 dark:border-sky-800 bg-blue-50/60 dark:bg-sky-950/40 text-xs font-semibold"
                            >
                              {i + 1}. {n}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-200/70 dark:border-slate-800 text-xs space-y-1">
                    <p className="font-semibold text-slate-500">Catatan Presenter Guru:</p>
                    <p className="text-slate-600 dark:text-slate-300">{currentSlide.presenterNotes}</p>
                    {currentSlide.animationNote && (
                      <p className="text-blue-700 dark:text-sky-400">Animasi: {currentSlide.animationNote}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <button
                  disabled={slideIndex === 0}
                  onClick={() => setSlideIndex((i) => Math.max(0, i - 1))}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold disabled:opacity-40 inline-flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Slide Sebelumnya</span>
                </button>
                <span className="font-mono tabular-nums text-xs text-slate-500">
                  {slideIndex + 1} / {slides.length}
                </span>
                <button
                  disabled={slideIndex >= slides.length - 1}
                  onClick={() => setSlideIndex((i) => Math.min(slides.length - 1, i + 1))}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold disabled:opacity-40 inline-flex items-center gap-1"
                >
                  <span>Slide Berikutnya</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : mode === 'lkpd' ? (
            (() => {
              const c = activeDoc.content || {};
              const checks = [
                { num: 1, label: 'Judul', ok: Boolean(c.judulKegiatan || activeDoc.title), icon: Bookmark },
                { num: 2, label: 'Petunjuk Belajar', ok: Array.isArray(c.petunjukPengerjaan) && c.petunjukPengerjaan.length > 0, icon: Clock },
                { num: 3, label: 'Kompetensi / TP', ok: Boolean(c.tujuan || c.capaianKompetensi), icon: Target },
                { num: 4, label: 'Info Pendukung', ok: Boolean(c.materiSingkat), icon: Info },
                {
                  num: 5,
                  label: 'Tugas & Langkah Kerja',
                  ok: (Array.isArray(c.langkahKegiatan) && c.langkahKegiatan.length > 0) || Boolean(c.tugasPraktik),
                  icon: ClipboardList,
                },
                {
                  num: 6,
                  label: 'Penilaian (PAP)',
                  ok: (Array.isArray(c.rubrikPenilaian) && c.rubrikPenilaian.length > 0) || (Array.isArray(c.refleksi) && c.refleksi.length > 0),
                  icon: Award,
                },
              ];
              const completedCount = checks.filter((x) => x.ok).length;
              const totalRubrikScore = (c.rubrikPenilaian || []).reduce(
                (sum: number, r: any) => sum + Number(r.skorMaksimal || 0),
                0
              );

              return (
                <div className="space-y-4">
                  {/* Checklist Kelengkapan 6 Komponen & Alur Penyusunan */}
                  <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-900/60 space-y-3 no-print">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
                          Cek Struktur Akhir: {completedCount}/6 Komponen Utama LKPD {completedCount === 6 ? '— Siap Pakai' : ''}
                        </p>
                        <p className="text-[11px] text-emerald-700/90 dark:text-emerald-400">
                          Standar struktur 6 komponen LKPD & pendekatan Penilaian Acuan Patokan (PAP).
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowLkpdFlow((v) => !v)}
                        className="px-2.5 py-1 rounded-md border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300"
                      >
                        {showLkpdFlow ? 'Tutup Alur 6 Langkah' : 'Lihat Alur Penyusunan'}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                      {checks.map((item) => {
                        const IconComp = item.icon;
                        return (
                          <div
                            key={item.num}
                            className={`px-2.5 py-2 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 ${
                              item.ok
                                ? 'bg-white dark:bg-slate-900 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                                : 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 text-amber-800 dark:text-amber-300'
                            }`}
                          >
                            <IconComp className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">
                              {item.num}. {item.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {showLkpdFlow && (
                      <div className="pt-2 border-t border-emerald-200/80 dark:border-emerald-900/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-[11px] text-slate-700 dark:text-slate-300">
                        {[
                          ['1. Analisis Kurikulum', 'Menentukan materi & kompetensi berdasarkan CP, TP, atau KD.'],
                          ['2. Peta Kebutuhan LKPD', 'Memetakan urutan penyajian LKPD dalam satu unit belajar.'],
                          ['3. Menentukan Judul', 'Merumuskan judul fokus dari materi pokok, kelas, dan semester.'],
                          ['4. Materi & Info Pendukung', 'Menyusun ringkasan konteks dari buku ajar/sumber tepercaya.'],
                          ['5. Tugas, Langkah & PAP', 'Instruksi terurut beserta rubrik Penilaian Acuan Patokan.'],
                          ['6. Cek Struktur Akhir', 'Verifikasi kelengkapan 6 komponen sebelum dipakai di kelas.'],
                        ].map(([stepTitle, desc]) => (
                          <div key={stepTitle} className="p-2 rounded-lg bg-white/80 dark:bg-slate-900/70 border border-emerald-100 dark:border-emerald-900/50">
                            <p className="font-bold text-emerald-900 dark:text-emerald-300">{stepTitle}</p>
                            <p className="text-slate-600 dark:text-slate-400">{desc}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Lembar Kerja A4 Resmi 6 Komponen */}
                  <div className="p-6 md:p-9 rounded-xl bg-white text-slate-900 border border-slate-200 shadow-sm space-y-6">
                    {/* Header Dokumen LKPD */}
                    <div className="text-right text-[11px] text-slate-400 font-medium">
                      {activeSchool?.name || 'Satuan Pendidikan'} | {activeDoc.subject || activeWorkspace?.subject || '-'} {activeDoc.grade || activeWorkspace?.grade || '-'}
                    </div>

                    <div className="text-center pb-3 border-b-2 border-emerald-700 space-y-1.5">
                      {activeSchool?.letterheadDataUrl ? (
                        <img
                          src={activeSchool.letterheadDataUrl}
                          alt={`Kop Surat ${activeSchool?.name || 'Sekolah'}`}
                          className="w-full max-h-36 object-contain mx-auto"
                        />
                      ) : (
                        <div className="flex items-center justify-center gap-4">
                          {activeSchool?.agencyLogoDataUrl && (
                            <img
                              src={activeSchool.agencyLogoDataUrl}
                              alt="Logo Instansi"
                              className="h-12 w-12 object-contain shrink-0"
                            />
                          )}
                          <p className="text-xs font-bold tracking-wide text-[#003380] uppercase flex-1">
                            {activeSchool?.name || 'Satuan Pendidikan'}
                          </p>
                          {activeSchool?.logoDataUrl && (
                            <img
                              src={activeSchool.logoDataUrl}
                              alt="Logo Sekolah"
                              className="h-12 w-12 object-contain shrink-0"
                            />
                          )}
                        </div>
                      )}
                      <h2 className="font-display text-lg font-bold text-slate-900 uppercase pt-1">
                        LEMBAR KERJA PESERTA DIDIK (LKPD)
                      </h2>
                      <p className="text-xs font-bold text-emerald-700 uppercase mt-0.5">
                        {c.jenisLkpd || 'LKPD'}
                      </p>
                    </div>

                    {/* Kotak Identitas Peserta Didik */}
                    <div className="grid grid-cols-1 md:grid-cols-2 border border-slate-400 text-xs">
                      <div className="grid grid-cols-[130px_1fr] border-b md:border-r border-slate-400">
                        <span className="bg-slate-100 font-bold px-3 py-2 border-r border-slate-400">Nama / Kelompok</span>
                        <span className="px-3 py-2 text-slate-400">.......................................................</span>
                      </div>
                      <div className="grid grid-cols-[130px_1fr] border-b border-slate-400">
                        <span className="bg-slate-100 font-bold px-3 py-2 border-r border-slate-400">Mata Pelajaran</span>
                        <span className="px-3 py-2 font-medium">{activeDoc.subject || activeWorkspace?.subject || '-'}</span>
                      </div>
                      <div className="grid grid-cols-[130px_1fr] border-b md:border-b-0 md:border-r border-slate-400">
                        <span className="bg-slate-100 font-bold px-3 py-2 border-r border-slate-400">Kelas / Semester</span>
                        <span className="px-3 py-2">
                          {c.identitasLkpd?.kelas || activeDoc.grade || activeWorkspace?.grade || '-'} /{' '}
                          {c.identitasLkpd?.semester || activeDoc.semester || activeWorkspace?.semester || '-'}
                        </span>
                      </div>
                      <div className="grid grid-cols-[130px_1fr]">
                        <span className="bg-slate-100 font-bold px-3 py-2 border-r border-slate-400">Alokasi Waktu</span>
                        <span className="px-3 py-2">
                          {c.identitasLkpd?.alokasiWaktu ||
                            formatJpDuration(
                              (semesterMeetings.find((m) => m.meetingNumber === Number(activeDoc.meetingNumber || 1))?.jpAllocation) ||
                                jpStandard.recommendedJpPerMeeting,
                              activeWorkspace?.level || activeSchool?.level,
                              activeDoc.grade || activeWorkspace?.grade
                            )}
                        </span>
                      </div>
                    </div>

                    {/* Komponen 1: Judul */}
                    <section className="space-y-2">
                      <div className="bg-emerald-50 border-l-4 border-emerald-700 px-3 py-1.5 font-bold text-sm text-emerald-950">
                        1. Judul Kegiatan
                      </div>
                      {editingLkpd ? (
                        <input
                          type="text"
                          defaultValue={c.judulKegiatan || activeDoc.title}
                          onBlur={(e) => updateLkpdField('judulKegiatan', e.target.value)}
                          className="w-full px-3 py-2 rounded border border-slate-300 text-sm font-bold"
                        />
                      ) : (
                        <p className="text-sm font-bold text-slate-900">{c.judulKegiatan || activeDoc.title}</p>
                      )}
                      <p className="text-xs text-slate-600">
                        Topik / Subtema:{' '}
                        <span className="font-semibold text-slate-800">
                          {c.identitasLkpd?.topik || activeDoc.title}
                          {c.identitasLkpd?.subtema ? ` — ${c.identitasLkpd.subtema}` : ''}
                        </span>
                      </p>
                    </section>

                    {/* Komponen 2: Petunjuk Belajar */}
                    <section className="space-y-2">
                      <div className="bg-emerald-50 border-l-4 border-emerald-700 px-3 py-1.5 font-bold text-sm text-emerald-950">
                        2. Petunjuk Belajar
                      </div>
                      {editingLkpd ? (
                        <textarea
                          rows={4}
                          defaultValue={(c.petunjukPengerjaan || []).join('\n')}
                          onBlur={(e) =>
                            updateLkpdField(
                              'petunjukPengerjaan',
                              e.target.value.split('\n').map((s) => s.trim()).filter(Boolean)
                            )
                          }
                          className="w-full px-3 py-2 rounded border border-slate-300 text-xs"
                        />
                      ) : (
                        <ol className="list-decimal pl-5 space-y-1 text-xs md:text-sm text-slate-800 text-justify">
                          {(c.petunjukPengerjaan || []).map((step: string, i: number) => (
                            <li key={i}>{step}</li>
                          ))}
                        </ol>
                      )}
                    </section>

                    {/* Komponen 3: Kompetensi / Tujuan Pembelajaran */}
                    <section className="space-y-2">
                      <div className="bg-emerald-50 border-l-4 border-emerald-700 px-3 py-1.5 font-bold text-sm text-emerald-950">
                        3. Kompetensi / Tujuan Pembelajaran
                      </div>
                      {editingLkpd ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            placeholder="Capaian Pembelajaran / Kompetensi (CP/TP/KD)"
                            defaultValue={c.capaianKompetensi || ''}
                            onBlur={(e) => updateLkpdField('capaianKompetensi', e.target.value)}
                            className="w-full px-3 py-2 rounded border border-slate-300 text-xs"
                          />
                          <textarea
                            rows={2}
                            defaultValue={c.tujuan || ''}
                            onBlur={(e) => updateLkpdField('tujuan', e.target.value)}
                            className="w-full px-3 py-2 rounded border border-slate-300 text-xs"
                          />
                        </div>
                      ) : (
                        <div className="space-y-1 text-xs md:text-sm text-slate-800 text-justify">
                          {c.capaianKompetensi && (
                            <p>
                              <span className="font-semibold">Capaian / Kompetensi:</span> {c.capaianKompetensi}
                            </p>
                          )}
                          <p>
                            <span className="font-semibold">Tujuan Pembelajaran:</span> {c.tujuan || '-'}
                          </p>
                          {c.petaKebutuhan && (
                            <p className="text-xs text-slate-600">
                              <span className="font-semibold">Posisi Unit Belajar:</span> {c.petaKebutuhan}
                            </p>
                          )}
                        </div>
                      )}
                    </section>

                    {/* Komponen 4: Informasi Pendukung */}
                    <section className="space-y-2">
                      <div className="bg-emerald-50 border-l-4 border-emerald-700 px-3 py-1.5 font-bold text-sm text-emerald-950">
                        4. Informasi Pendukung
                      </div>
                      {editingLkpd ? (
                        <textarea
                          rows={4}
                          defaultValue={c.materiSingkat || ''}
                          onBlur={(e) => updateLkpdField('materiSingkat', e.target.value)}
                          className="w-full px-3 py-2 rounded border border-slate-300 text-xs"
                        />
                      ) : (
                        <p className="text-xs md:text-sm text-slate-800 leading-relaxed text-justify">{c.materiSingkat || '-'}</p>
                      )}
                      {Array.isArray(c.alatDanBahan) && c.alatDanBahan.length > 0 && (
                        <p className="text-xs text-slate-700 text-justify">
                          <span className="font-semibold">Alat & Bahan:</span> {c.alatDanBahan.join(', ')}
                        </p>
                      )}
                    </section>

                    {/* Komponen 5: Tugas & Langkah Kerja */}
                    <section className="space-y-3">
                      <div className="bg-emerald-50 border-l-4 border-emerald-700 px-3 py-1.5 font-bold text-sm text-emerald-950">
                        5. Tugas & Langkah Kerja
                      </div>
                      {c.aktivitasUtama && (
                        <p className="text-xs md:text-sm text-slate-800 text-justify">
                          <span className="font-semibold">Aktivitas Utama:</span> {c.aktivitasUtama}
                        </p>
                      )}

                      {editingLkpd ? (
                        <textarea
                          rows={4}
                          defaultValue={(c.langkahKegiatan || []).join('\n')}
                          onBlur={(e) =>
                            updateLkpdField(
                              'langkahKegiatan',
                              e.target.value.split('\n').map((s) => s.trim()).filter(Boolean)
                            )
                          }
                          className="w-full px-3 py-2 rounded border border-slate-300 text-xs"
                        />
                      ) : (
                        Array.isArray(c.langkahKegiatan) &&
                        c.langkahKegiatan.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-slate-800 mb-1">Langkah Kerja Berurutan:</p>
                            <ol className="list-decimal pl-5 space-y-1 text-xs md:text-sm text-slate-800 text-justify">
                              {c.langkahKegiatan.map((step: string, i: number) => (
                                <li key={i}>{step}</li>
                              ))}
                            </ol>
                          </div>
                        )
                      )}

                      {/* Tabel Pengamatan / Kerja Siswa */}
                      {Array.isArray(c.kolomTabelPengamatan) && c.kolomTabelPengamatan.length > 0 && (
                        <div className="overflow-x-auto pt-1">
                          <p className="text-xs font-semibold text-slate-800 mb-1.5">Tabel Pengamatan / Hasil Kerja:</p>
                          <table className="w-full border-collapse border border-slate-400 text-xs">
                            <thead>
                              <tr className="bg-[#DCE6F2] text-slate-900 font-bold">
                                {c.kolomTabelPengamatan.map((col: string, ci: number) => (
                                  <th key={ci} className="border border-slate-400 px-3 py-2 text-left">
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {[0, 1, 2].map((rIdx) => (
                                <tr key={rIdx}>
                                  {c.kolomTabelPengamatan.map((_: string, ci: number) => (
                                    <td key={ci} className="border border-slate-400 px-3 py-4" />
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Pertanyaan Pemahaman + Garis Jawaban */}
                      {Array.isArray(c.pertanyaanPemahaman) && c.pertanyaanPemahaman.length > 0 && (
                        <div className="space-y-2.5 pt-1">
                          <p className="text-xs font-semibold text-slate-800">Pertanyaan Pemahaman:</p>
                          {c.pertanyaanPemahaman.map((q: string, qi: number) => (
                            <div key={qi} className="space-y-2 text-xs md:text-sm">
                              <p className="text-slate-900 text-justify">
                                {qi + 1}. {q}
                              </p>
                              <div className="border-b border-dashed border-slate-400 h-5" />
                            </div>
                          ))}
                        </div>
                      )}

                      {c.tugasPraktik && (
                        <div className="p-3 rounded-lg bg-slate-50 border border-slate-300 text-xs space-y-1">
                          <p className="font-bold text-slate-900">Tugas Praktik / Proyek:</p>
                          <p className="text-slate-700 text-justify">{c.tugasPraktik}</p>
                        </div>
                      )}

                      {c.panduanKesimpulan && (
                        <div className="p-3 rounded-lg bg-slate-50 border border-slate-300 text-xs space-y-2">
                          <p className="font-bold text-slate-900">Kesimpulan:</p>
                          <p className="text-slate-700 text-justify">{c.panduanKesimpulan}</p>
                          <div className="border-b border-dashed border-slate-400 h-6" />
                        </div>
                      )}
                    </section>

                    {/* Komponen 6: Penilaian (PAP) & Refleksi */}
                    <section className="space-y-3">
                      <div className="bg-emerald-50 border-l-4 border-emerald-700 px-3 py-1.5 font-bold text-sm text-emerald-950">
                        6. Penilaian (PAP) & Refleksi
                      </div>

                      {Array.isArray(c.soalSingkatPenilaian) && c.soalSingkatPenilaian.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-slate-800">Soal Evaluasi Singkat:</p>
                          <ol className="list-decimal pl-5 space-y-1 text-xs text-slate-800 text-justify">
                            {c.soalSingkatPenilaian.map((s: any, si: number) => (
                              <li key={si}>
                                {s.soal}{' '}
                                <span className="font-mono text-[11px] text-slate-500">
                                  (Skor Maks: {s.skorMaksimal})
                                </span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}

                      {Array.isArray(c.refleksi) && c.refleksi.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-slate-800">Refleksi Peserta Didik:</p>
                          <ul className="list-disc pl-5 space-y-1 text-xs text-slate-700 text-justify">
                            {c.refleksi.map((rf: string, ri: number) => (
                              <li key={ri}>{rf}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {Array.isArray(c.rubrikPenilaian) && c.rubrikPenilaian.length > 0 && (
                        <div className="overflow-x-auto pt-1">
                          <p className="text-xs font-semibold text-slate-800 mb-1.5">
                            Rubrik Penilaian Acuan Patokan (PAP):
                          </p>
                          <table className="w-full border-collapse border border-slate-400 text-xs">
                            <thead>
                              <tr className="bg-[#DCE6F2] text-slate-900 font-bold text-left">
                                <th className="border border-slate-400 px-3 py-2 w-44">Aspek Penilaian</th>
                                <th className="border border-slate-400 px-3 py-2">Kriteria Pencapaian</th>
                                <th className="border border-slate-400 px-3 py-2 text-center w-24">Skor Maks</th>
                                <th className="border border-slate-400 px-3 py-2 text-center w-24">Skor Siswa</th>
                              </tr>
                            </thead>
                            <tbody>
                              {c.rubrikPenilaian.map((r: any, ri: number) => (
                                <tr key={ri}>
                                  <td className="border border-slate-400 px-3 py-2 font-semibold">{r.aspek}</td>
                                  <td className="border border-slate-400 px-3 py-2">{r.kriteria}</td>
                                  <td className="border border-slate-400 px-3 py-2 text-center font-mono tabular-nums">
                                    {r.skorMaksimal}
                                  </td>
                                  <td className="border border-slate-400 px-3 py-2 text-center" />
                                </tr>
                              ))}
                              <tr className="bg-slate-50 font-bold">
                                <td colSpan={2} className="border border-slate-400 px-3 py-2 text-right">
                                  Total Skor / Nilai Akhir
                                </td>
                                <td className="border border-slate-400 px-3 py-2 text-center font-mono tabular-nums">
                                  {totalRubrikScore}
                                </td>
                                <td className="border border-slate-400 px-3 py-2 text-center" />
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>
                  </div>
                </div>
              );
            })()
          ) : (
            (() => {
              const payload = buildPrintablePayload(activeDoc);
              return (
                <OfficialDocumentSheet
                  school={activeSchool}
                  teacher={profile}
                  title={payload.title}
                  subtitle={payload.subtitle}
                  subjectLabel={activeDoc.subject || activeWorkspace?.subject}
                  metadataPairs={payload.metadataPairs}
                  showTitiMangsa={payload.showTitiMangsa}
                >
                  {mode === 'bahan-ajar' && (
                    <div className="rounded-lg overflow-hidden border border-slate-300 h-40">
                      <img
                        src={
                          (activeWorkspace?.subject || '').toLowerCase().includes('ipa') ||
                          (activeWorkspace?.subject || '').toLowerCase().includes('matematika')
                            ? '/src/assets/images/edu_visual_science_1795670402496.jpg'
                            : '/src/assets/images/edu_visual_literacy_1795670402835.jpg'
                        }
                        alt="Ilustrasi bahan ajar"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  {payload.sections.map((sec, idx) => (
                    <section key={idx} className="space-y-2.5">
                      <div className="bg-[#EEF4FB] border-l-4 border-[#1E3A8A] px-3 py-1.5 font-bold text-sm text-[#003380]">
                        {sec.heading}
                      </div>

                      {sec.paragraphs && sec.paragraphs.length > 0 && (
                        <div className="space-y-1.5 text-xs md:text-[13px] text-slate-800 leading-relaxed text-justify">
                          {sec.paragraphs.map((p, pi) => (
                            <p key={pi}>{p}</p>
                          ))}
                        </div>
                      )}

                      {sec.bullets && sec.bullets.length > 0 && (
                        <ul className="list-disc pl-5 space-y-1 text-xs md:text-[13px] text-slate-800 text-justify">
                          {sec.bullets.map((b, bi) => (
                            <li key={bi}>{b}</li>
                          ))}
                        </ul>
                      )}

                      {sec.table && sec.table.rows.length > 0 && (
                        <div className="overflow-x-auto pt-1">
                          <table className="w-full border-collapse border border-slate-400 text-xs">
                            <thead>
                              <tr className="bg-[#DCE6F2] text-slate-900 font-bold text-left">
                                {sec.table.headers.map((h) => (
                                  <th key={h} className="border border-slate-400 px-3 py-2">
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {sec.table.rows.map((r, ri) => (
                                <tr key={ri}>
                                  {r.map((cell, ci) => (
                                    <td
                                      key={ci}
                                      className={`border border-slate-400 px-3 py-2 align-top whitespace-pre-line ${
                                        ci === 0 ? 'font-semibold text-slate-900 w-44 bg-slate-50/70' : 'text-slate-800'
                                      }`}
                                    >
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>
                  ))}
                </OfficialDocumentSheet>
              );
            })()
          )}
        </div>
      </div>
    </div>
  );
};
