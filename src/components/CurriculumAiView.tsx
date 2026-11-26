import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  Layers,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Download,
  FileText,
  Printer,
  Save,
  RefreshCw,
  Plus,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { postAuthedJson } from '../lib/apiClient';
import { createRecord, updateRecord, deleteRecord } from '../lib/firestoreHelpers';
import {
  reconcileProtaAndProsem,
  clampProsemWeek,
  normalizeProsemMonthName,
  normalizeAcademicSemester,
} from '../lib/protaProsemSync';
import {
  EDUCATION_LEVELS,
  CLASS_OPTIONS_BY_LEVEL,
  InstitutionTrack,
  detectInstitutionTrack,
  getMinutesPerJp,
  getOfficialJpStandard,
  pickAutoSubjectForContext,
  resolveSubjectRegulationContext,
} from '../lib/curriculumData';
import { CurriculumElementMapping, EducationLevel } from '../types/education';
import { exportDocumentDocx, exportDocumentPdf, PrintableDocPayload } from '../lib/exporters';
import { OfficialDocumentSheet } from './OfficialDocumentSheet';
import { OfficialSubjectField } from './OfficialSubjectField';
import { buildRichTextbookContext } from '../lib/bookContext';

interface BatchStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
}

export const CurriculumAiView: React.FC<{ mode: 'auto' | 'generate-all' | 'cp' | 'tp' | 'atp' }> = ({
  mode,
}) => {
  const {
    user,
    profile,
    activeSchool,
    curricula,
    calendars,
    textbooks,
    workspaces,
    activeWorkspace,
    documents,
    prosemItems: existingProsemItems,
    setActiveWorkspaceId,
    setActivePage,
    openCreateWorkspaceModal,
    aiSettings,
    notify,
  } = useApp();

  const activeCurr = curricula.find((c) => c.isActive)?.name || 'Kurikulum Merdeka';

  const defaultLevel = (activeWorkspace?.level || activeSchool?.level || 'SMP/MTs') as EducationLevel;
  const defaultGrade = activeWorkspace?.grade || CLASS_OPTIONS_BY_LEVEL[defaultLevel]?.[0]?.grade || 'Kelas VII';
  const defaultCurr = activeWorkspace?.curriculum || activeCurr;
  const initialTrack = detectInstitutionTrack({
    schoolName: activeSchool?.name,
    level: defaultLevel,
    grade: defaultGrade,
    subject: activeWorkspace?.subject || activeSchool?.subject,
  });
  const defaultSubject =
    activeWorkspace?.subject ||
    pickAutoSubjectForContext({
      currentSubject: activeSchool?.subject,
      level: defaultLevel,
      grade: defaultGrade,
      curriculum: defaultCurr,
      track: initialTrack,
      schoolName: activeSchool?.name,
    });

  const [track, setTrack] = useState<InstitutionTrack>(initialTrack);
  const [form, setForm] = useState({
    level: defaultLevel,
    grade: defaultGrade,
    phase: activeWorkspace?.phase || CLASS_OPTIONS_BY_LEVEL[defaultLevel]?.[0]?.phase || 'Fase D',
    curriculum: defaultCurr,
    subject: defaultSubject,
    academicYear: activeWorkspace?.academicYear || activeSchool?.academicYear || '2026/2027',
    semester: 'Semester 1 & 2',
    jpPerWeek:
      activeWorkspace?.jpPerWeek ||
      getOfficialJpStandard({
        level: defaultLevel,
        grade: defaultGrade,
        subject: defaultSubject,
        curriculum: defaultCurr,
        schoolName: activeSchool?.name,
        institutionTrack: initialTrack,
      }).jpPerWeek,
    primaryBookId: activeWorkspace?.primaryBookId || textbooks[0]?.id || '',
  });

  const regContext = resolveSubjectRegulationContext({
    level: form.level,
    grade: form.grade,
    subject: form.subject,
    curriculum: form.curriculum,
    schoolName: activeSchool?.name,
    institutionTrack: track,
  });
  const officialJp = regContext.jpStandard;

  const [loading, setLoading] = useState(false);
  const [draftElements, setDraftElements] = useState<CurriculumElementMapping[]>(
    activeWorkspace?.curriculumData?.elements || []
  );
  const [disclaimer, setDisclaimer] = useState(
    'Draf rekomendasi AI — harap verifikasi dengan dokumen CP resmi dan buku referensi.'
  );

  useEffect(() => {
    if (activeWorkspace) {
      setDraftElements(activeWorkspace.curriculumData?.elements || []);
      const nextLvl = (activeWorkspace.level as EducationLevel) || defaultLevel;
      const nextGrade = activeWorkspace.grade || defaultGrade;
      const nextCurr = activeWorkspace.curriculum || defaultCurr;
      const nextSubj = activeWorkspace.subject || defaultSubject;
      const nextTrack = detectInstitutionTrack({
        schoolName: activeSchool?.name,
        level: nextLvl,
        grade: nextGrade,
        subject: nextSubj,
      });
      setTrack(nextTrack);
      const std = getOfficialJpStandard({
        level: nextLvl,
        grade: nextGrade,
        subject: nextSubj,
        curriculum: nextCurr,
        schoolName: activeSchool?.name,
        institutionTrack: nextTrack,
      });
      setForm((prev) => ({
        ...prev,
        level: nextLvl,
        grade: nextGrade,
        phase: activeWorkspace.phase || prev.phase,
        curriculum: nextCurr,
        subject: nextSubj,
        academicYear: activeWorkspace.academicYear || prev.academicYear,
        semester: activeWorkspace.semester || prev.semester,
        jpPerWeek: activeWorkspace.jpPerWeek || std.jpPerWeek,
        primaryBookId: activeWorkspace.primaryBookId || prev.primaryBookId,
      }));
    }
  }, [activeWorkspace?.id]);

  // Batch Generate All state
  const [batchRunning, setBatchRunning] = useState(false);
  const [steps, setSteps] = useState<BatchStep[]>([
    { id: 'curr', label: '1. Membaca Identitas, Referensi Buku & Menyusun CP/TP/ATP', status: 'pending' },
    { id: 'prota', label: '2. Analisis Kalender & Penyusunan PROTA + PROSEM', status: 'pending' },
    { id: 'modul', label: '3. Penyusunan Modul Ajar / RPP Utama', status: 'pending' },
    { id: 'bahan', label: '4. Penyusunan Bahan Ajar Pertemuan 1–3', status: 'pending' },
    { id: 'lkpd', label: '5. Penyusunan LKPD Terintegrasi', status: 'pending' },
    { id: 'ppt', label: '6. Penyusunan Slide PowerPoint Pembelajaran', status: 'pending' },
    { id: 'soal', label: '7. Penyusunan Bank Soal, Kisi-Kisi & Draft Kuis Online', status: 'pending' },
  ]);

  const classOptions = CLASS_OPTIONS_BY_LEVEL[form.level] || [];

  const getBookContext = () =>
    buildRichTextbookContext(textbooks, form.primaryBookId, form.subject, {
      curriculum: form.curriculum,
      grade: form.grade,
      level: form.level,
      semester: form.semester,
    });

  const handleGenerateCurriculum = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await postAuthedJson<{
        isAiDraft: boolean;
        verificationDisclaimer: string;
        elements: CurriculumElementMapping[];
      }>('/api/ai/curriculum', {
        ...form,
        minutesPerJp: officialJp.minutesPerJp,
        effectiveWeeks: officialJp.effectiveWeeksPerYear,
        targetAnnualJp: form.jpPerWeek * officialJp.effectiveWeeksPerYear,
        p5JpPerWeek: officialJp.p5JpPerWeek,
        regulationRef: regContext.regulationTitle,
        institutionTrack: track,
        schoolName: activeSchool?.name,
        subjectScopeSummary: regContext.scopeSummary,
        textbookContext: getBookContext(),
        aiPreferences: aiSettings || undefined,
      });

      setDraftElements(res.elements || []);
      if (res.verificationDisclaimer) setDisclaimer(res.verificationDisclaimer);

      // Save or update workspace (match subject, grade, semester, and academicYear so distinct classes/subjects/semesters never overwrite each other)
      const existingWs =
        activeWorkspace &&
        activeWorkspace.subject.toLowerCase() === form.subject.trim().toLowerCase() &&
        activeWorkspace.grade.toLowerCase() === form.grade.trim().toLowerCase() &&
        activeWorkspace.semester === form.semester &&
        activeWorkspace.academicYear === form.academicYear
          ? activeWorkspace
          : workspaces.find(
              (w) =>
                w.subject.toLowerCase() === form.subject.trim().toLowerCase() &&
                w.grade.toLowerCase() === form.grade.trim().toLowerCase() &&
                w.semester === form.semester &&
                w.academicYear === form.academicYear
            );

      let wsId = existingWs?.id;
      const wsPayload = {
        ownerId: user.uid,
        ...form,
        subject: form.subject.trim(),
        grade: form.grade.trim(),
        curriculumData: {
          elements: res.elements || [],
          generatedAt: new Date().toISOString(),
          isAiDraft: true,
        },
      };

      if (wsId) {
        await updateRecord('workspaces', wsId, wsPayload);
      } else {
        wsId = await createRecord('workspaces', wsPayload);
      }
      setActiveWorkspaceId(wsId);

      // Also store CP, TP, ATP documents in archive
      await createRecord('documents', {
        ownerId: user.uid,
        workspaceId: wsId,
        academicYear: form.academicYear,
        semester: form.semester,
        grade: form.grade,
        subject: form.subject,
        docType: 'cp',
        title: `Capaian Pembelajaran ${form.subject} ${form.grade}`,
        status: 'draft',
        isAiDraft: true,
        sourceRef: form.primaryBookId ? 'Buku Referensi Guru' : 'Draf Rekomendasi AI',
        content: { elements: res.elements || [], disclaimer: res.verificationDisclaimer },
        version: 1,
        archived: false,
      });

      notify('Elemen kurikulum, CP, TP, dan ATP berhasil disusun otomatis.', 'success');
    } catch (err: any) {
      notify(err?.message || 'Gagal menyusun kurikulum otomatis.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const saveEditedElements = async () => {
    if (!activeWorkspace?.id) return;
    await updateRecord('workspaces', activeWorkspace.id, {
      curriculumData: {
        elements: draftElements,
        generatedAt: new Date().toISOString(),
        isAiDraft: false,
      },
    });
    notify('Perubahan CP, TP, dan ATP disimpan.', 'success');
  };

  const updateStep = (id: string, patch: Partial<BatchStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const runBatchAll = async () => {
    if (!user) return;
    setBatchRunning(true);
    setSteps((prev) => prev.map((s) => ({ ...s, status: 'pending', detail: undefined })));

    try {
      // 1. Curriculum
      updateStep('curr', { status: 'running' });
      const bookCtx = getBookContext();
      const currRes = await postAuthedJson<{
        isAiDraft: boolean;
        verificationDisclaimer: string;
        elements: CurriculumElementMapping[];
      }>('/api/ai/curriculum', {
        ...form,
        minutesPerJp: officialJp.minutesPerJp,
        effectiveWeeks: officialJp.effectiveWeeksPerYear,
        targetAnnualJp: form.jpPerWeek * officialJp.effectiveWeeksPerYear,
        p5JpPerWeek: officialJp.p5JpPerWeek,
        regulationRef: regContext.regulationTitle,
        institutionTrack: track,
        schoolName: activeSchool?.name,
        subjectScopeSummary: regContext.scopeSummary,
        textbookContext: bookCtx,
        aiPreferences: aiSettings || undefined,
      });

      const matchingActiveWs =
        activeWorkspace?.id &&
        activeWorkspace.subject.toLowerCase() === form.subject.trim().toLowerCase() &&
        activeWorkspace.grade.toLowerCase() === form.grade.trim().toLowerCase() &&
        activeWorkspace.semester === form.semester &&
        activeWorkspace.academicYear === form.academicYear
          ? activeWorkspace
          : null;

      let wsId = matchingActiveWs?.id || '';
      const wsPayload = {
        ownerId: user.uid,
        ...form,
        subject: form.subject.trim(),
        grade: form.grade.trim(),
        curriculumData: {
          elements: currRes.elements || [],
          generatedAt: new Date().toISOString(),
          isAiDraft: true,
        },
      };
      if (wsId) {
        await updateRecord('workspaces', wsId, wsPayload);
      } else {
        wsId = await createRecord('workspaces', wsPayload);
      }
      setActiveWorkspaceId(wsId);

      const wsObj = { id: wsId, ...form, curriculumData: { elements: currRes.elements || [] } };
      const existingCpDoc = documents.find((d) => d.workspaceId === wsId && d.docType === 'cp');
      if (existingCpDoc?.id) {
        await updateRecord('documents', existingCpDoc.id, {
          academicYear: form.academicYear,
          semester: form.semester,
          grade: form.grade,
          subject: form.subject,
          title: `CP, TP & ATP — ${form.subject} ${form.grade}`,
          isAiDraft: true,
          content: { elements: currRes.elements || [] },
          version: (existingCpDoc.version || 1) + 1,
        });
      } else {
        await createRecord('documents', {
          ownerId: user.uid,
          workspaceId: wsId,
          academicYear: form.academicYear,
          semester: form.semester,
          grade: form.grade,
          subject: form.subject,
          docType: 'cp',
          title: `CP, TP & ATP — ${form.subject} ${form.grade}`,
          status: 'draft',
          isAiDraft: true,
          content: { elements: currRes.elements || [] },
          version: 1,
          archived: false,
        });
      }
      updateStep('curr', { status: 'done', detail: `${currRes.elements?.length || 0} elemen dipetakan` });

      // 2. PROTA & PROSEM
      updateStep('prota', { status: 'running' });
      const cal = calendars[0];
      const calSummary = cal
        ? `Total ${cal.totalWeeks} minggu, Efektif ${cal.effectiveWeeks} minggu (Target standar ${officialJp.regulationRef}: ${officialJp.effectiveWeeksPerYear} minggu efektif = ${officialJp.semester1Weeks} Smt 1 + ${officialJp.semester2Weeks} Smt 2)`
        : `Efektif ${officialJp.effectiveWeeksPerYear} minggu/tahun (${officialJp.semester1Weeks} minggu Smt 1, ${officialJp.semester2Weeks} minggu Smt 2) sesuai ${officialJp.regulationRef}`;
      const rawProtaRes = await postAuthedJson<any>('/api/ai/prota-prosem', {
        workspace: wsObj,
        calendarSummary: calSummary,
        textbookContext: bookCtx,
        aiPreferences: aiSettings || undefined,
      });

      const reconciledProta = reconcileProtaAndProsem({
        protaRows: rawProtaRes.protaRows || [],
        prosemItems: rawProtaRes.prosemItems || [],
        jpPerWeek: form.jpPerWeek,
        recommendedJpPerMeeting: officialJp.recommendedJpPerMeeting,
        defaultSubject: form.subject,
      });
      const protaRes = {
        ...rawProtaRes,
        protaRows: reconciledProta.protaRows,
        prosemItems: reconciledProta.prosemItems,
        totalJpYear: reconciledProta.totalJpYear,
      };

      const existingProtaDoc = documents.find((d) => d.workspaceId === wsId && d.docType === 'prota');
      if (existingProtaDoc?.id) {
        await updateRecord('documents', existingProtaDoc.id, {
          academicYear: form.academicYear,
          semester: form.semester,
          grade: form.grade,
          subject: form.subject,
          title: `Program Tahunan (PROTA) ${form.subject} ${form.grade}`,
          isAiDraft: true,
          content: protaRes,
          version: (existingProtaDoc.version || 1) + 1,
        });
      } else {
        await createRecord('documents', {
          ownerId: user.uid,
          workspaceId: wsId,
          academicYear: form.academicYear,
          semester: form.semester,
          grade: form.grade,
          subject: form.subject,
          docType: 'prota',
          title: `Program Tahunan (PROTA) ${form.subject} ${form.grade}`,
          status: 'draft',
          isAiDraft: true,
          content: protaRes,
          version: 1,
          archived: false,
        });
      }

      const oldWsProsemItems = existingProsemItems.filter((p) => p.workspaceId === wsId);
      for (const oldItem of oldWsProsemItems) {
        if (oldItem.id) await deleteRecord('prosem_items', oldItem.id);
      }

      const prosemItems: any[] = protaRes.prosemItems || [];
      for (const item of prosemItems) {
        const sem = normalizeAcademicSemester(item.semester, item.month);
        const month = normalizeProsemMonthName(item.month, sem);
        await createRecord('prosem_items', {
          ownerId: user.uid,
          workspaceId: wsId,
          semester: sem,
          month,
          weekNumber: clampProsemWeek(item.weekNumber),
          meetingNumber: Math.max(1, Number(item.meetingNumber || 1)),
          tpCode: String(item.tpCode || 'TP-1').slice(0, 50),
          topic: String(item.topic || form.subject).slice(0, 250),
          subtopic: String(item.subtopic || '').slice(0, 250),
          jpAllocation: Math.max(0, Math.min(100, Math.round(Number(item.jpAllocation || officialJp.recommendedJpPerMeeting)))),
          plannedDate: String(item.plannedDate || `${month} Minggu ${clampProsemWeek(item.weekNumber)}`).slice(0, 40),
          executionStatus: 'belum',
          executionDate: '',
          teacherNotes: '',
        });
      }
      updateStep('prota', {
        status: 'done',
        detail: `${prosemItems.length} pertemuan PROSEM (${reconciledProta.totalJpYear} JP)`,
      });

      const firstTopic = currRes.elements?.[0]?.topics?.[0] || {
        topicTitle: prosemItems[0]?.topic || `Materi Pokok ${form.subject}`,
        subtopics: ['Konsep Dasar'],
        tpCode: 'TP-1',
        tpDescription: 'Peserta didik memahami konsep inti materi.',
        estimatedJp: officialJp.recommendedJpPerMeeting,
      };

      const targetSemesterLabel =
        form.semester.toLowerCase().includes('2') || form.semester.toLowerCase().includes('genap')
          ? 'Semester 2'
          : 'Semester 1';

      const tpLookup = new Map<string, string>();
      for (const el of currRes.elements || []) {
        for (const t of el.topics || []) {
          if (t.topicTitle && t.tpDescription) {
            tpLookup.set(String(t.topicTitle).trim().toLowerCase(), String(t.tpDescription));
          }
          if (t.tpCode && t.tpDescription) {
            tpLookup.set(String(t.tpCode).trim().toLowerCase(), String(t.tpDescription));
          }
        }
      }

      const activeSemesterProsem = prosemItems
        .filter((item) => {
          const semStr = String(item.semester || '').toLowerCase();
          const itemIsSem2 =
            semStr.includes('2') ||
            semStr.includes('genap') ||
            ['januari', 'februari', 'maret', 'april', 'mei', 'juni'].includes(String(item.month || '').toLowerCase());
          return targetSemesterLabel === 'Semester 2' ? itemIsSem2 : !itemIsSem2;
        })
        .sort((a, b) => Number(a.meetingNumber || 0) - Number(b.meetingNumber || 0));

      const semesterMeetingSpecs = (
        activeSemesterProsem.length > 0
          ? activeSemesterProsem
          : [
              {
                meetingNumber: 1,
                topic: firstTopic.topicTitle,
                subtopic: firstTopic.subtopics?.[0] || firstTopic.topicTitle,
                jpAllocation: firstTopic.estimatedJp || officialJp.recommendedJpPerMeeting,
                tpCode: firstTopic.tpCode,
              },
            ]
      ).map((m, idx) => {
        const topic = String(m.topic || firstTopic.topicTitle).trim();
        const subtopic = String(m.subtopic || topic).trim();
        return {
          meetingNumber: Number(m.meetingNumber || idx + 1),
          topic,
          subtopic,
          tpDescription:
            tpLookup.get(String(m.tpCode || '').trim().toLowerCase()) ||
            tpLookup.get(topic.toLowerCase()) ||
            firstTopic.tpDescription,
          jpAllocation: Number(m.jpAllocation || officialJp.recommendedJpPerMeeting),
        };
      });

      const runBatchSave = async (
        docType: 'modul_ajar' | 'bahan_ajar' | 'lkpd',
        stepId: 'modul' | 'bahan' | 'lkpd',
        titlePrefix: (mNo: number, subOrTopic: string) => string
      ) => {
        let count = 0;
        for (let offset = 0; offset < semesterMeetingSpecs.length; offset += 4) {
          const chunk = semesterMeetingSpecs.slice(offset, offset + 4);
          updateStep(stepId, {
            status: 'running',
            detail: `Pertemuan ${chunk[0].meetingNumber}–${chunk[chunk.length - 1].meetingNumber} / ${semesterMeetingSpecs.length}`,
          });
          const res = await postAuthedJson<{ items: Array<{ meetingNumber: number; data: any }> }>(
            '/api/ai/batch-devices',
            {
              docType,
              workspace: wsObj,
              semester: targetSemesterLabel,
              meetings: chunk,
              learningModel: 'Problem Based Learning (PBL)',
              lkpdType: 'LKPD Kelompok & Literasi',
              textbookContext: bookCtx,
            }
          );
          for (const entry of res.items || []) {
            const spec = chunk.find((c) => c.meetingNumber === entry.meetingNumber) || chunk[0];
            const labelTopic =
              spec.subtopic && spec.subtopic !== spec.topic ? `${spec.topic} — ${spec.subtopic}` : spec.topic;
            await createRecord('documents', {
              ownerId: user.uid,
              workspaceId: wsId,
              academicYear: form.academicYear,
              semester: targetSemesterLabel,
              grade: form.grade,
              subject: form.subject,
              docType,
              title: titlePrefix(spec.meetingNumber, labelTopic).slice(0, 240),
              meetingNumber: spec.meetingNumber,
              chapterTitle: spec.topic.slice(0, 190),
              status: 'draft',
              isAiDraft: true,
              content: entry.data,
              version: 1,
              archived: false,
            });
            count++;
          }
        }
        return count;
      };

      // 3. Modul Ajar Per Pertemuan (1 Semester)
      updateStep('modul', { status: 'running' });
      const modulCount = await runBatchSave(
        'modul_ajar',
        'modul',
        (mNo, labelTopic) => `Modul Ajar Pertemuan ${mNo}: ${labelTopic}`
      );
      updateStep('modul', { status: 'done', detail: `${modulCount} Modul Ajar per pertemuan tersimpan` });

      // 4. Bahan Ajar Per Pertemuan (1 Semester)
      updateStep('bahan', { status: 'running' });
      const bahanCount = await runBatchSave(
        'bahan_ajar',
        'bahan',
        (mNo, labelTopic) => `Bahan Ajar Pertemuan ${mNo}: ${labelTopic}`
      );
      updateStep('bahan', { status: 'done', detail: `${bahanCount} Bahan Ajar per pertemuan dibuat` });

      // 5. LKPD Per Pertemuan (1 Semester)
      updateStep('lkpd', { status: 'running' });
      const lkpdCount = await runBatchSave(
        'lkpd',
        'lkpd',
        (mNo, labelTopic) => `LKPD Pertemuan ${mNo}: ${labelTopic}`
      );
      updateStep('lkpd', { status: 'done', detail: `${lkpdCount} LKPD per pertemuan tersimpan` });

      // 6. PowerPoint
      updateStep('ppt', { status: 'running' });
      const pptRes = await postAuthedJson<any>('/api/ai/powerpoint', {
        workspace: wsObj,
        meetingNumber: 1,
        topic: firstTopic.topicTitle,
        tpDescription: firstTopic.tpDescription,
        slideCount: 10,
        theme: aiSettings?.pptTheme || 'cobalt',
        languageLevel: `Sesuai siswa ${form.level} ${form.grade}`,
        includeAnimation: true,
        textbookContext: bookCtx,
      });
      await createRecord('documents', {
        ownerId: user.uid,
        workspaceId: wsId,
        academicYear: form.academicYear,
        semester: form.semester,
        grade: form.grade,
        subject: form.subject,
        docType: 'powerpoint',
        title: `Presentasi Pertemuan 1: ${firstTopic.topicTitle}`,
        meetingNumber: 1,
        status: 'draft',
        isAiDraft: true,
        content: pptRes,
        version: 1,
        archived: false,
      });
      updateStep('ppt', { status: 'done', detail: `${pptRes.slides?.length || 10} slide dibuat` });

      // 7. Bank Soal & Kisi-kisi
      updateStep('soal', { status: 'running' });
      const soalRes = await postAuthedJson<{ questions: any[] }>('/api/ai/questions', {
        workspace: wsObj,
        topic: firstTopic.topicTitle,
        tpCode: firstTopic.tpCode,
        tpDescription: firstTopic.tpDescription,
        questionCount: 10,
        questionTypes: ['pilihan_ganda', 'benar_salah', 'uraian'],
        category: 'Asesmen Formatif',
        difficultyMix: { mudah: 30, sedang: 50, sulit: 20 },
        hotsMix: { lots: 30, mots: 40, hots: 30 },
        textbookContext: bookCtx,
      });
      for (const q of soalRes.questions || []) {
        await createRecord('questions', {
          ownerId: user.uid,
          workspaceId: wsId,
          subject: form.subject,
          grade: form.grade,
          tpCode: firstTopic.tpCode,
          topic: firstTopic.topicTitle,
          questionType: q.questionType || 'pilihan_ganda',
          cognitiveLevel: String(q.cognitiveLevel || 'C2').slice(0, 10),
          hotsTier: (['LOTS', 'MOTS', 'HOTS'].includes(String(q.hotsTier || '').toUpperCase())
            ? String(q.hotsTier).toUpperCase()
            : 'MOTS') as 'LOTS' | 'MOTS' | 'HOTS',
          difficulty: (['mudah', 'sedang', 'sulit'].includes(String(q.difficulty || '').toLowerCase().trim())
            ? String(q.difficulty).toLowerCase().trim()
            : 'sedang') as 'mudah' | 'sedang' | 'sulit',
          category: 'Asesmen Formatif',
          stem: q.stem,
          options: q.options || [],
          correctAnswer: q.correctAnswer || '',
          explanation: q.explanation || '',
          indicator: q.indicator || '',
          rubric: q.rubric || '',
          points: Number(q.points || 10),
          sourceRef: q.sourceRef || form.subject,
        });
      }
      updateStep('soal', { status: 'done', detail: `${soalRes.questions?.length || 0} butir soal ditambahkan` });

      notify('Seluruh perangkat pembelajaran satu tahun berhasil disusun!', 'success');
    } catch (err: any) {
      setSteps((prev) =>
        prev.map((s) => (s.status === 'running' ? { ...s, status: 'error', detail: err?.message } : s))
      );
      notify(err?.message || 'Proses batch terhenti karena kendala jaringan/AI.', 'error');
    } finally {
      setBatchRunning(false);
    }
  };

  const elementsToShow =
    draftElements.length > 0 ? draftElements : activeWorkspace?.curriculumData?.elements || [];

  const buildPrintableCurriculum = (): PrintableDocPayload => ({
    title:
      mode === 'cp'
        ? 'Capaian Pembelajaran (CP)'
        : mode === 'tp'
        ? 'Tujuan Pembelajaran (TP)'
        : 'Alur Tujuan Pembelajaran (ATP)',
    subtitle: `${activeWorkspace?.subject || form.subject} · ${activeWorkspace?.grade || form.grade}`,
    fileName: `${mode}_${(activeWorkspace?.subject || form.subject).replace(/\s+/g, '_')}`,
    school: activeSchool,
    teacher: profile,
    metadataPairs: [
      {
        label: 'Sekolah',
        value: activeSchool?.name || '-',
      },
      { label: 'Mata Pelajaran', value: activeWorkspace?.subject || form.subject },
      { label: 'Fase / Kelas', value: `${activeWorkspace?.phase || form.phase} / ${activeWorkspace?.grade || form.grade}` },
      { label: 'Kurikulum', value: activeWorkspace?.curriculum || form.curriculum },
      {
        label: 'Alokasi Jam Tatap Muka',
        value: `${activeWorkspace?.jpPerWeek || form.jpPerWeek} JP/minggu (@${getMinutesPerJp(activeWorkspace?.level || form.level, activeWorkspace?.grade || form.grade)} Menit/JP)`,
      },
      { label: 'Tahun Pelajaran', value: activeWorkspace?.academicYear || form.academicYear },
      {
        label: 'Guru Mata Pelajaran',
        value: activeSchool?.teacherName || profile?.displayName || '-',
      },
    ],
    sections: elementsToShow.map((el) => ({
      heading: `Elemen: ${el.elementName}`,
      paragraphs: [el.cpSummary, `Catatan Verifikasi: ${el.verificationNote}`],
      table: {
        headers: ['Urutan', 'Kode TP', 'Tujuan Pembelajaran', 'Materi Pokok', 'JP', 'Referensi'],
        rows: (el.topics || []).map((t) => [
          t.atpOrder,
          t.tpCode,
          t.tpDescription,
          t.topicTitle,
          t.estimatedJp,
          t.bookReference,
        ]),
      },
    })),
  });

  const curriculumDocTitle =
    mode === 'cp'
      ? 'Capaian Pembelajaran (CP)'
      : mode === 'tp'
      ? 'Tujuan Pembelajaran (TP)'
      : 'Alur Tujuan Pembelajaran (ATP)';

  const totalAtpJp = elementsToShow.reduce(
    (sum, el) => sum + (el.topics || []).reduce((s, t) => s + Number(t.estimatedJp || 0), 0),
    0
  );

  if (mode === 'cp' || mode === 'tp' || mode === 'atp') {
    const activeMinutesPerJp = getMinutesPerJp(
      activeWorkspace?.level || form.level,
      activeWorkspace?.grade || form.grade
    );
    const activeWeeklyJp = activeWorkspace?.jpPerWeek || officialJp.jpPerWeek;
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 no-print">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">{curriculumDocTitle}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {activeWorkspace
                ? `${activeWorkspace.subject} · ${activeWorkspace.grade} (${activeWorkspace.phase}) · ${activeWorkspace.curriculum} · ${activeWeeklyJp} JP/mg (@${activeMinutesPerJp} Menit)`
                : 'Belum ada ruang kerja kurikulum. Buat terlebih dahulu di AI Auto Curriculum.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => exportDocumentPdf(buildPrintableCurriculum())}
              className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Ekspor PDF</span>
            </button>
            <button
              onClick={() => exportDocumentDocx(buildPrintableCurriculum())}
              className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Ekspor DOCX</span>
            </button>
            <button
              onClick={() => window.print()}
              className="px-3.5 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak A4</span>
            </button>
          </div>
        </div>

        {elementsToShow.length === 0 ? (
          <div className="p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Belum ada data {mode.toUpperCase()} untuk mata pelajaran ini.
            </p>
          </div>
        ) : (
          <OfficialDocumentSheet
            school={activeSchool}
            teacher={profile}
            runningHeaderRight={`${activeSchool?.name || 'Satuan Pendidikan'} | ${activeWorkspace?.subject || '-'} ${activeWorkspace?.grade || '-'}`}
            title={`${curriculumDocTitle.toUpperCase()} — ${(activeWorkspace?.subject || '-').toUpperCase()}`}
            subtitle={`${activeWorkspace?.curriculum || 'Kurikulum Merdeka'} · Tahun Pelajaran ${activeWorkspace?.academicYear || activeSchool?.academicYear || '-'}`}
            subjectLabel={activeWorkspace?.subject}
            metadataPairs={[
              {
                label: 'Sekolah',
                value: activeSchool?.name || '-',
              },
              { label: 'Mata Pelajaran', value: activeWorkspace?.subject || '-' },
              { label: 'Fase / Kelas', value: `${activeWorkspace?.phase || '-'} / ${activeWorkspace?.grade || '-'}` },
              { label: 'Kurikulum', value: activeWorkspace?.curriculum || '-' },
              {
                label: 'Jam Tatap Muka / Total ATP',
                value: `${activeWeeklyJp} JP/mg (@${activeMinutesPerJp} Menit) · Total ${totalAtpJp} JP`,
              },
              {
                label: 'Guru Mata Pelajaran',
                value: activeSchool?.teacherName || profile?.displayName || '-',
              },
            ]}
          >
            {elementsToShow.map((el, i) => (
              <div key={i} className="space-y-3">
                <div className="bg-[#EEF4FB] border-l-4 border-[#1E3A8A] px-3 py-2">
                  <p className="text-[11px] font-mono font-bold text-[#1E3A8A] uppercase">Elemen {i + 1}</p>
                  <h3 className="text-sm md:text-[15px] font-bold text-slate-900">{el.elementName}</h3>
                </div>

                <div className="space-y-1 text-xs md:text-[13px] text-slate-800 leading-relaxed text-justify">
                  <p>
                    <span className="font-bold">Capaian Pembelajaran (CP): </span>
                    {el.cpSummary}
                  </p>
                  {el.verificationNote && (
                    <p className="text-[11px] text-amber-700 font-medium">{el.verificationNote}</p>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-slate-400 text-xs">
                    <thead>
                      <tr className="bg-[#DCE6F2] text-slate-900 font-bold text-left">
                        <th className="border border-slate-400 px-2 py-2 text-center w-12">Urutan</th>
                        <th className="border border-slate-400 px-2.5 py-2 w-24">Kode TP</th>
                        <th className="border border-slate-400 px-3 py-2 min-w-[160px]">Materi & Submateri</th>
                        <th className="border border-slate-400 px-3 py-2 min-w-[220px]">Tujuan Pembelajaran (TP)</th>
                        <th className="border border-slate-400 px-2 py-2 text-center w-16">JP</th>
                        <th className="border border-slate-400 px-2.5 py-2 w-40">Referensi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(el.topics || []).map((t, ti) => (
                        <tr key={ti}>
                          <td className="border border-slate-400 px-2 py-2 text-center font-mono tabular-nums font-bold">
                            {t.atpOrder}
                          </td>
                          <td className="border border-slate-400 px-2.5 py-2 font-mono text-xs font-semibold text-[#1E3A8A]">
                            {t.tpCode}
                          </td>
                          <td className="border border-slate-400 px-3 py-2">
                            <p className="font-semibold text-slate-900">{t.topicTitle}</p>
                            {Array.isArray(t.subtopics) && t.subtopics.length > 0 && (
                              <p className="text-[11px] text-slate-600 mt-0.5">{t.subtopics.join(' · ')}</p>
                            )}
                          </td>
                          <td className="border border-slate-400 px-3 py-2 text-slate-800">{t.tpDescription}</td>
                          <td className="border border-slate-400 px-2 py-2 text-center font-mono tabular-nums font-bold">
                            {t.estimatedJp} JP
                          </td>
                          <td className="border border-slate-400 px-2.5 py-2 text-[11px] text-slate-600">
                            {t.bookReference || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </OfficialDocumentSheet>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {mode === 'generate-all'
              ? 'Generator Perangkat Pembelajaran Satu Tahun'
              : 'AI Auto Curriculum & Pemetaan Materi'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Cukup tentukan jenjang, kurikulum, kelas, mata pelajaran, dan sumber buku. AI menyusun struktur kurikulum serta perangkat pembelajarannya secara otomatis.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateWorkspaceModal}
          className="px-4 py-2.5 rounded-lg border border-blue-700 text-blue-700 dark:text-sky-400 hover:bg-blue-50 dark:hover:bg-sky-950/40 text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Administrasi Baru</span>
        </button>
      </div>

      {/* Configuration Card */}
      <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Jenjang Pendidikan</label>
            <select
              value={form.level}
              onChange={(e) => {
                const lvl = e.target.value as EducationLevel;
                const first = CLASS_OPTIONS_BY_LEVEL[lvl]?.[0];
                const nextGrade = first?.grade || '';
                const nextSubject = pickAutoSubjectForContext({
                  currentSubject: form.subject,
                  level: lvl,
                  grade: nextGrade,
                  curriculum: form.curriculum,
                  track,
                  schoolName: activeSchool?.name,
                });
                const std = getOfficialJpStandard({
                  level: lvl,
                  grade: nextGrade,
                  subject: nextSubject,
                  curriculum: form.curriculum,
                  schoolName: activeSchool?.name,
                  institutionTrack: track,
                });
                setForm({
                  ...form,
                  level: lvl,
                  grade: nextGrade,
                  phase: first?.phase || '',
                  subject: nextSubject,
                  jpPerWeek: std.jpPerWeek,
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
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Kelas / Rombel</label>
            <input
              list="grade-options-list"
              value={form.grade}
              onChange={(e) => {
                const nextGrade = e.target.value;
                const found = classOptions.find((c) => c.grade === nextGrade);
                const nextSubject = pickAutoSubjectForContext({
                  currentSubject: form.subject,
                  level: form.level,
                  grade: nextGrade,
                  curriculum: form.curriculum,
                  track,
                  schoolName: activeSchool?.name,
                });
                const std = getOfficialJpStandard({
                  level: form.level,
                  grade: nextGrade,
                  subject: nextSubject,
                  curriculum: form.curriculum,
                  schoolName: activeSchool?.name,
                  institutionTrack: track,
                });
                setForm({
                  ...form,
                  grade: nextGrade,
                  phase: found?.phase || form.phase,
                  subject: nextSubject,
                  jpPerWeek: std.jpPerWeek,
                });
              }}
              placeholder="Contoh: Kelas VII atau VII-A"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
            <datalist id="grade-options-list">
              {classOptions.map((c) => (
                <option key={c.grade} value={c.grade}>
                  {c.grade} ({c.phase})
                </option>
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Kurikulum</label>
            <select
              value={form.curriculum}
              onChange={(e) => {
                const nextCurr = e.target.value;
                const nextSubject = pickAutoSubjectForContext({
                  currentSubject: form.subject,
                  level: form.level,
                  grade: form.grade,
                  curriculum: nextCurr,
                  track,
                  schoolName: activeSchool?.name,
                });
                const std = getOfficialJpStandard({
                  level: form.level,
                  grade: form.grade,
                  subject: nextSubject,
                  curriculum: nextCurr,
                  schoolName: activeSchool?.name,
                  institutionTrack: track,
                });
                setForm({
                  ...form,
                  curriculum: nextCurr,
                  subject: nextSubject,
                  jpPerWeek: std.jpPerWeek,
                });
              }}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            >
              {curricula.length > 0 ? (
                curricula.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))
              ) : (
                <option value="Kurikulum Merdeka">Kurikulum Merdeka</option>
              )}
            </select>
          </div>

          <div className="sm:col-span-2 lg:col-span-2">
            <OfficialSubjectField
              label="Mata Pelajaran (Otomatis Permendikbud / KMA)"
              subject={form.subject}
              level={form.level}
              grade={form.grade}
              curriculum={form.curriculum}
              schoolName={activeSchool?.name}
              track={track}
              showScopeNote={false}
              onTrackChange={(nextTrack) => {
                setTrack(nextTrack);
                const nextSubject = pickAutoSubjectForContext({
                  currentSubject: form.subject,
                  level: form.level,
                  grade: form.grade,
                  curriculum: form.curriculum,
                  track: nextTrack,
                  schoolName: activeSchool?.name,
                });
                const std = getOfficialJpStandard({
                  level: form.level,
                  grade: form.grade,
                  subject: nextSubject,
                  curriculum: form.curriculum,
                  schoolName: activeSchool?.name,
                  institutionTrack: nextTrack,
                });
                setForm({ ...form, subject: nextSubject, jpPerWeek: std.jpPerWeek });
              }}
              onSubjectChange={(nextSubj) => {
                const std = getOfficialJpStandard({
                  level: form.level,
                  grade: form.grade,
                  subject: nextSubj,
                  curriculum: form.curriculum,
                  schoolName: activeSchool?.name,
                  institutionTrack: track,
                });
                setForm({ ...form, subject: nextSubj, jpPerWeek: std.jpPerWeek });
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Tahun Ajaran</label>
            <input
              type="text"
              value={form.academicYear}
              onChange={(e) => setForm({ ...form, academicYear: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Cakupan Waktu</label>
            <div className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between">
              <span>Satu Tahun Pelajaran (Semester 1 &amp; 2)</span>
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-sky-300 font-bold">Full Tahun</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Alokasi JP / Minggu
              </label>
              {form.jpPerWeek !== officialJp.jpPerWeek && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, jpPerWeek: officialJp.jpPerWeek })}
                  className="text-[11px] font-semibold text-blue-700 dark:text-sky-400 hover:underline"
                >
                  Standar ({officialJp.jpPerWeek} JP)
                </button>
              )}
            </div>
            <input
              type="number"
              min={1}
              max={40}
              value={form.jpPerWeek}
              onChange={(e) => setForm({ ...form, jpPerWeek: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono tabular-nums"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Buku Referensi Utama
              </label>
              <button
                type="button"
                onClick={() => setActivePage('database-buku')}
                className="text-[11px] font-semibold text-blue-700 dark:text-sky-400 hover:underline"
              >
                + Link / Data Buku
              </button>
            </div>
            <select
              value={form.primaryBookId}
              onChange={(e) => setForm({ ...form, primaryBookId: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            >
              <option value="">Otomatis (Rekomendasi Kurikulum)</option>
              {textbooks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}{b.sourceUrl ? ' (Link Tersimpan)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-700 dark:text-slate-200">
              <span className="font-semibold text-blue-700 dark:text-sky-400">{regContext.regulationTitle}</span>
              <span>
                Tatap Muka: <strong className="font-mono tabular-nums">{officialJp.jpPerWeek} JP/minggu</strong> (@{officialJp.minutesPerJp} Menit/JP)
              </span>
              {officialJp.p5JpPerWeek > 0 && (
                <span>
                  P5 / Kokurikuler: <strong className="font-mono tabular-nums">{officialJp.p5JpPerWeek} JP/minggu</strong>
                </span>
              )}
              <span>
                Target Tahunan: <strong className="font-mono tabular-nums">{form.jpPerWeek * officialJp.effectiveWeeksPerYear} JP</strong> ({officialJp.effectiveWeeksPerYear} pekan efektif)
              </span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">{officialJp.notes}</span>
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-300">
            <strong className="font-semibold">Ruang Lingkup Materi Acuan ({regContext.category}):</strong> {regContext.scopeSummary}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            disabled={loading || batchRunning}
            onClick={handleGenerateCurriculum}
            className="px-5 py-2.5 rounded-lg border border-blue-700 text-blue-700 dark:text-sky-400 dark:border-sky-500 hover:bg-blue-50 dark:hover:bg-sky-950/30 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>{loading ? 'Menyusun Kurikulum...' : 'Generate Kurikulum Otomatis'}</span>
          </button>

          <button
            type="button"
            disabled={loading || batchRunning}
            onClick={runBatchAll}
            className="px-5 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
          >
            {batchRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
            <span>{batchRunning ? 'Memproses Perangkat Satu Tahun...' : 'GENERATE SEMUA PERANGKAT SATU TAHUN'}</span>
          </button>
        </div>
      </div>

      {/* Batch Progress Tracker */}
      {(mode === 'generate-all' || batchRunning || steps.some((s) => s.status !== 'pending')) && (
        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Progres Penyusunan Otomatis Satu Tahun Ajaran
            </h2>
            <span className="font-mono tabular-nums text-xs font-semibold text-slate-500 dark:text-slate-400">
              {steps.filter((s) => s.status === 'done').length} / {steps.length} Tahap
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {steps.map((step) => (
              <div key={step.id} className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {step.status === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                  {step.status === 'running' && <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />}
                  {step.status === 'error' && <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />}
                  {step.status === 'pending' && <RefreshCw className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />}
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{step.label}</span>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
                  {step.detail || (step.status === 'running' ? 'Memproses...' : step.status === 'done' ? 'Selesai' : 'Menunggu')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Editable Curriculum Output */}
      {elementsToShow.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200">
              {disclaimer}
            </div>
            <button
              onClick={saveEditedElements}
              className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Simpan Revisi Kurikulum</span>
            </button>
          </div>

          {elementsToShow.map((el, elIdx) => (
            <div
              key={elIdx}
              className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
            >
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-500">Elemen {elIdx + 1}</label>
                <input
                  type="text"
                  value={el.elementName}
                  onChange={(e) => {
                    const next = [...elementsToShow];
                    next[elIdx] = { ...next[elIdx], elementName: e.target.value };
                    setDraftElements(next);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-display font-bold text-base"
                />
                <label className="block text-xs font-semibold text-slate-500 pt-1">Draf Capaian Pembelajaran (CP)</label>
                <textarea
                  rows={2}
                  value={el.cpSummary}
                  onChange={(e) => {
                    const next = [...elementsToShow];
                    next[elIdx] = { ...next[elIdx], cpSummary: e.target.value };
                    setDraftElements(next);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Dimensi Profil Lulusan: {(el.graduateProfileDimensions || []).join(' · ')}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500">Pemetaan Materi, TP & ATP</p>
                {(el.topics || []).map((t, tIdx) => (
                  <div
                    key={tIdx}
                    className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-12 gap-3"
                  >
                    <div className="md:col-span-2">
                      <span className="text-[11px] font-mono text-slate-500">ATP #{t.atpOrder} · {t.tpCode}</span>
                      <input
                        type="number"
                        min={1}
                        value={t.estimatedJp}
                        onChange={(e) => {
                          const next = [...elementsToShow];
                          const topics = [...next[elIdx].topics];
                          topics[tIdx] = { ...topics[tIdx], estimatedJp: Number(e.target.value) };
                          next[elIdx] = { ...next[elIdx], topics };
                          setDraftElements(next);
                        }}
                        className="mt-1 w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                      />
                    </div>
                    <div className="md:col-span-4">
                      <input
                        type="text"
                        value={t.topicTitle}
                        onChange={(e) => {
                          const next = [...elementsToShow];
                          const topics = [...next[elIdx].topics];
                          topics[tIdx] = { ...topics[tIdx], topicTitle: e.target.value };
                          next[elIdx] = { ...next[elIdx], topics };
                          setDraftElements(next);
                        }}
                        className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold"
                      />
                      <p className="text-xs text-slate-500 mt-1">Sumber: {t.bookReference}</p>
                    </div>
                    <div className="md:col-span-6">
                      <textarea
                        rows={2}
                        value={t.tpDescription}
                        onChange={(e) => {
                          const next = [...elementsToShow];
                          const topics = [...next[elIdx].topics];
                          topics[tIdx] = { ...topics[tIdx], tpDescription: e.target.value };
                          next[elIdx] = { ...next[elIdx], topics };
                          setDraftElements(next);
                        }}
                        className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
