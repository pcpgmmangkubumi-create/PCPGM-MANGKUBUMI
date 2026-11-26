import React, { useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  Loader2,
  Plus,
  Trash2,
  Download,
  FileText,
  FileSpreadsheet,
  Printer,
  CheckSquare,
  Square,
  Check,
  CalendarDays,
  ListChecks,
  Pencil,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { postAuthedJson } from '../lib/apiClient';
import { createRecord, updateRecord, deleteRecord } from '../lib/firestoreHelpers';
import { ProsemEvaluationEntry, ProsemExecutionStatus, ProsemItemRecord } from '../types/education';
import { OfficialDocumentSheet } from './OfficialDocumentSheet';
import {
  exportDocumentDocx,
  exportDocumentPdf,
  exportTableXlsx,
  exportProsemMatrixDocx,
  exportProsemMatrixPdf,
  exportProsemMatrixXlsx,
  PrintableDocPayload,
  ProsemMatrixExportPayload,
  ProsemMatrixMonthSpec,
  resolveTitiMangsa,
} from '../lib/exporters';
import { buildRichTextbookContext } from '../lib/bookContext';
import { getOfficialJpStandard } from '../lib/curriculumData';
import {
  reconcileProtaAndProsem,
  computeProtaProsemParity,
  normalizeProsemMonthName,
  normalizeAcademicSemester,
  clampProsemWeek,
  normTopicKey,
  ReconciledProsemItem,
} from '../lib/protaProsemSync';

const SEMESTER_1_MONTHS: ProsemMatrixMonthSpec[] = [
  { full: 'Juli', short: 'Jul' },
  { full: 'Agustus', short: 'Agu' },
  { full: 'September', short: 'Sep' },
  { full: 'Oktober', short: 'Okt' },
  { full: 'November', short: 'Nov' },
  { full: 'Desember', short: 'Des' },
];

const SEMESTER_2_MONTHS: ProsemMatrixMonthSpec[] = [
  { full: 'Januari', short: 'Jan' },
  { full: 'Februari', short: 'Feb' },
  { full: 'Maret', short: 'Mar' },
  { full: 'April', short: 'Apr' },
  { full: 'Mei', short: 'Mei' },
  { full: 'Juni', short: 'Jun' },
];

const DEFAULT_EVALUATION_CALENDAR: ProsemEvaluationEntry[] = [
  { period: 'September', evaluationType: 'Sumatif Tengah Semester', status: 'DRAF', essentialMaterial: 'Materi Tengah Semester 1' },
  { period: 'Desember', evaluationType: 'Sumatif Akhir Semester', status: 'DRAF', essentialMaterial: 'Semester 1' },
  { period: 'Maret', evaluationType: 'Sumatif Tengah Semester', status: 'DRAF', essentialMaterial: 'Materi Tengah Semester 2' },
  { period: 'Juni', evaluationType: 'Sumatif Akhir Tahun', status: 'DRAF', essentialMaterial: 'Semester 2' },
];

function normalizeMonthName(raw?: string): string {
  const val = (raw || '').trim().toLowerCase();
  if (val.startsWith('jul')) return 'Juli';
  if (val.startsWith('agu') || val.startsWith('aug')) return 'Agustus';
  if (val.startsWith('sep')) return 'September';
  if (val.startsWith('okt') || val.startsWith('oct')) return 'Oktober';
  if (val.startsWith('nov')) return 'November';
  if (val.startsWith('des') || val.startsWith('dec')) return 'Desember';
  if (val.startsWith('jan')) return 'Januari';
  if (val.startsWith('feb')) return 'Februari';
  if (val.startsWith('mar')) return 'Maret';
  if (val.startsWith('apr')) return 'April';
  if (val.startsWith('mei') || val.startsWith('may')) return 'Mei';
  if (val.startsWith('jun')) return 'Juni';
  return 'Juli';
}

function normalizeSemester(raw?: string, month?: string): 'Semester 1' | 'Semester 2' {
  const s = (raw || '').trim().toLowerCase();
  if (s.includes('2') || s.includes('genap')) return 'Semester 2';
  if (s.includes('1') || s.includes('ganjil')) return 'Semester 1';
  const normMonth = normalizeMonthName(month);
  if (SEMESTER_2_MONTHS.some((m) => m.full === normMonth)) return 'Semester 2';
  return 'Semester 1';
}

function clampWeek(week?: number): number {
  const n = Math.round(Number(week || 1));
  if (n < 1) return 1;
  if (n > 4) return 4;
  return n;
}

interface MatrixTopicGroup {
  no: number;
  topic: string;
  tpCode: string;
  jp: number;
  items: ProsemItemRecord[];
  activeWeeks: boolean[];
}

export const ProtaProsemView: React.FC<{ mode: 'prota' | 'prosem' }> = ({ mode }) => {
  const {
    user,
    profile,
    activeSchool,
    activeWorkspace,
    calendars,
    textbooks,
    documents,
    prosemItems,
    aiSettings,
    notify,
  } = useApp();

  const [generating, setGenerating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeSemester, setActiveSemester] = useState<'Semester 1' | 'Semester 2'>(() =>
    normalizeSemester(activeWorkspace?.semester)
  );
  const [prosemTab, setProsemTab] = useState<'matrix' | 'checklist'>('matrix');
  const [monthFilter, setMonthFilter] = useState<string>('Semua');
  const [editingTitiMangsa, setEditingTitiMangsa] = useState(false);
  const [titiMangsaDraft, setTitiMangsaDraft] = useState('');

  const resolvedProsemTitiMangsa = resolveTitiMangsa(activeSchool);
  useEffect(() => {
    if (!editingTitiMangsa) {
      setTitiMangsaDraft(resolvedProsemTitiMangsa);
    }
  }, [resolvedProsemTitiMangsa, editingTitiMangsa]);

  const commitProsemTitiMangsa = async () => {
    setEditingTitiMangsa(false);
    const cleaned = titiMangsaDraft.trim().slice(0, 120);
    if (activeSchool?.id && cleaned !== (activeSchool.titiMangsa || '').trim()) {
      await updateRecord('schools', activeSchool.id, { titiMangsa: cleaned });
      notify('Titi mangsa dokumen diperbarui.', 'success');
    }
  };

  const wsProtaDoc = useMemo(() => {
    const candidates = documents.filter(
      (d) => d.docType === 'prota' && (!activeWorkspace || d.workspaceId === activeWorkspace.id)
    );
    if (candidates.length <= 1) return candidates[0];
    return [...candidates].sort((a, b) => (b.version || 0) - (a.version || 0))[0];
  }, [documents, activeWorkspace]);
  const protaRows: any[] = wsProtaDoc?.content?.protaRows || [];

  const evaluationCalendar: ProsemEvaluationEntry[] = useMemo(() => {
    const stored = wsProtaDoc?.content?.evaluationCalendar;
    if (Array.isArray(stored) && stored.length > 0) return stored;
    return DEFAULT_EVALUATION_CALENDAR;
  }, [wsProtaDoc]);

  const wsProsemItems = useMemo(
    () =>
      prosemItems
        .filter((p) => !activeWorkspace || p.workspaceId === activeWorkspace.id)
        .sort((a, b) => a.meetingNumber - b.meetingNumber),
    [prosemItems, activeWorkspace]
  );

  const parity = useMemo(
    () => computeProtaProsemParity({ protaRows, prosemItems: wsProsemItems }),
    [protaRows, wsProsemItems]
  );

  const semesterMonths = activeSemester === 'Semester 1' ? SEMESTER_1_MONTHS : SEMESTER_2_MONTHS;
  const semesterLabel: 'Ganjil' | 'Genap' = activeSemester === 'Semester 1' ? 'Ganjil' : 'Genap';

  const jpStandard = useMemo(
    () =>
      getOfficialJpStandard({
        level: activeWorkspace?.level || activeSchool?.level,
        grade: activeWorkspace?.grade,
        subject: activeWorkspace?.subject || activeSchool?.subject,
        curriculum: activeWorkspace?.curriculum,
      }),
    [activeWorkspace, activeSchool]
  );
  const effectiveJpPerWeek = Number(activeWorkspace?.jpPerWeek || jpStandard.jpPerWeek);
  const targetAnnualJp = effectiveJpPerWeek * jpStandard.effectiveWeeksPerYear;
  const targetSemesterJp =
    effectiveJpPerWeek * (activeSemester === 'Semester 1' ? jpStandard.semester1Weeks : jpStandard.semester2Weeks);

  const semesterProsemItems = useMemo(
    () => wsProsemItems.filter((item) => normalizeSemester(item.semester, item.month) === activeSemester),
    [wsProsemItems, activeSemester]
  );

  const matrixGroups: MatrixTopicGroup[] = useMemo(() => {
    const map = new Map<string, ProsemItemRecord[]>();
    for (const item of semesterProsemItems) {
      const key = (item.topic || 'Materi Pembelajaran').trim();
      const arr = map.get(key) || [];
      arr.push(item);
      map.set(key, arr);
    }

    const groups: MatrixTopicGroup[] = [];
    let no = 1;
    for (const [topic, items] of map.entries()) {
      const activeWeeks = Array(24).fill(false);
      let jp = 0;
      for (const it of items) {
        jp += Number(it.jpAllocation || 0);
        const normMonth = normalizeMonthName(it.month);
        const mIdx = semesterMonths.findIndex((m) => m.full === normMonth);
        if (mIdx >= 0) {
          const wIdx = clampWeek(it.weekNumber) - 1;
          activeWeeks[mIdx * 4 + wIdx] = true;
        }
      }
      groups.push({
        no: no++,
        topic,
        tpCode: items.find((i) => i.tpCode)?.tpCode || '',
        jp,
        items,
        activeWeeks,
      });
    }
    return groups;
  }, [semesterProsemItems, semesterMonths]);

  const totalSemesterJp = useMemo(
    () => matrixGroups.reduce((sum, g) => sum + g.jp, 0),
    [matrixGroups]
  );

  const activeWeekCount = useMemo(
    () => matrixGroups.reduce((sum, g) => sum + g.activeWeeks.filter(Boolean).length, 0),
    [matrixGroups]
  );

  const filteredChecklistItems = useMemo(
    () =>
      semesterProsemItems.filter((item) => {
        if (monthFilter !== 'Semua' && normalizeMonthName(item.month) !== monthFilter) return false;
        return true;
      }),
    [semesterProsemItems, monthFilter]
  );

  const uniqueMonths = useMemo(
    () => Array.from(new Set(semesterProsemItems.map((i) => normalizeMonthName(i.month)))),
    [semesterProsemItems]
  );

  const saveProtaDocumentContent = async (nextContent: Record<string, any>) => {
    if (!user || !activeWorkspace?.id) return;
    if (wsProtaDoc?.id) {
      await updateRecord('documents', wsProtaDoc.id, { content: nextContent });
    } else {
      await createRecord('documents', {
        ownerId: user.uid,
        workspaceId: activeWorkspace.id,
        academicYear: activeWorkspace.academicYear,
        semester: activeWorkspace.semester,
        grade: activeWorkspace.grade,
        subject: activeWorkspace.subject,
        docType: 'prota',
        title: `Program Tahunan (PROTA) ${activeWorkspace.subject} ${activeWorkspace.grade}`,
        status: 'draft',
        content: nextContent,
        version: 1,
        archived: false,
      });
    }
  };

  const syncProsemCollection = async (targetItems: ReconciledProsemItem[]) => {
    if (!user || !activeWorkspace?.id) return;
    const keepIds = new Set(targetItems.map((t) => t.id).filter((id): id is string => Boolean(id)));
    const existingById = new Map<string, ProsemItemRecord>();
    for (const existing of wsProsemItems) {
      if (existing.id) existingById.set(existing.id, existing);
    }

    for (const oldItem of wsProsemItems) {
      if (oldItem.id && !keepIds.has(oldItem.id)) {
        await deleteRecord('prosem_items', oldItem.id);
      }
    }

    for (const item of targetItems) {
      const cleanPayload = {
        semester: item.semester,
        month: item.month,
        weekNumber: clampProsemWeek(item.weekNumber),
        meetingNumber: Math.max(1, Number(item.meetingNumber || 1)),
        tpCode: String(item.tpCode || 'TP-1').slice(0, 50),
        topic: String(item.topic || activeWorkspace.subject || 'Materi').slice(0, 250),
        subtopic: String(item.subtopic || '').slice(0, 250),
        jpAllocation: Math.max(0, Math.min(100, Math.round(Number(item.jpAllocation || 0)))),
        plannedDate: String(item.plannedDate || `${item.month} Minggu ${clampProsemWeek(item.weekNumber)}`).slice(0, 40),
      };

      if (item.id && existingById.has(item.id)) {
        const prev = existingById.get(item.id)!;
        const changed =
          prev.semester !== cleanPayload.semester ||
          prev.month !== cleanPayload.month ||
          clampProsemWeek(prev.weekNumber) !== cleanPayload.weekNumber ||
          prev.meetingNumber !== cleanPayload.meetingNumber ||
          (prev.tpCode || '') !== cleanPayload.tpCode ||
          prev.topic !== cleanPayload.topic ||
          prev.jpAllocation !== cleanPayload.jpAllocation;
        if (changed) {
          await updateRecord('prosem_items', item.id, cleanPayload);
        }
      } else {
        await createRecord('prosem_items', {
          ownerId: user.uid,
          workspaceId: activeWorkspace.id,
          ...cleanPayload,
          executionStatus: item.executionStatus || 'belum',
          executionDate: item.executionDate || '',
          teacherNotes: item.teacherNotes || '',
        });
      }
    }
  };

  const persistProtaAndSyncProsem = async (nextRows: any[], sourceProsemItems: ProsemItemRecord[] = wsProsemItems) => {
    if (!user || !activeWorkspace?.id) return;
    const reconciled = reconcileProtaAndProsem({
      protaRows: nextRows,
      prosemItems: sourceProsemItems,
      jpPerWeek: effectiveJpPerWeek,
      recommendedJpPerMeeting: jpStandard.recommendedJpPerMeeting,
      defaultSubject: activeWorkspace.subject,
    });
    await saveProtaDocumentContent({
      ...(wsProtaDoc?.content || {}),
      protaRows: reconciled.protaRows,
      evaluationCalendar,
      totalJpYear: reconciled.totalJpYear,
    });
    await syncProsemCollection(reconciled.prosemItems);
  };

  const handleSyncProsemToProta = async () => {
    if (!user || !activeWorkspace?.id) return;
    setSyncing(true);
    try {
      await persistProtaAndSyncProsem(protaRows, wsProsemItems);
      notify('Total jam PROMES berhasil diselaraskan 100% dengan PROTA.', 'success');
    } catch (err: any) {
      notify(err?.message || 'Gagal menyelaraskan PROTA dan PROMES.', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const syncProtaRowFromMatrixTopic = async (params: {
    semester: 'Semester 1' | 'Semester 2';
    oldTopic: string;
    newTopic: string;
    tpCode: string;
    newJp: number;
    operation: 'upsert' | 'delete';
  }) => {
    if (!user || !activeWorkspace?.id) return;
    const oldNorm = normTopicKey(params.oldTopic);
    const oldExact = params.oldTopic.trim().toLowerCase();
    const tpNorm = (params.tpCode || '').trim().toLowerCase();

    const matchedIndices: number[] = [];
    protaRows.forEach((row, idx) => {
      const rowSem = normalizeAcademicSemester(row?.semester, row?.timeDistribution);
      if (rowSem !== params.semester) return;
      const rExact = String(row?.topic || '').trim().toLowerCase();
      const rNorm = normTopicKey(row?.topic);
      if (rExact === oldExact || (oldNorm && rNorm === oldNorm)) {
        matchedIndices.push(idx);
      }
    });

    // Fallback match by tpCode if topic string wasn't matched directly
    if (matchedIndices.length === 0 && tpNorm) {
      protaRows.forEach((row, idx) => {
        const rowSem = normalizeAcademicSemester(row?.semester, row?.timeDistribution);
        if (rowSem !== params.semester) return;
        if (String(row?.tpCode || '').trim().toLowerCase() === tpNorm) {
          matchedIndices.push(idx);
        }
      });
    }

    let nextRows = protaRows.map((r) => ({ ...r }));

    if (params.operation === 'delete') {
      if (matchedIndices.length === 0) return;
      const removeSet = new Set(matchedIndices);
      nextRows = nextRows.filter((_, idx) => !removeSet.has(idx));
    } else if (matchedIndices.length === 0) {
      const defaultRange = params.semester === 'Semester 1' ? 'Juli - Desember' : 'Januari - Juni';
      nextRows.push({
        semester: params.semester,
        element: 'Capaian Pembelajaran',
        tpCode: params.tpCode || `TP-${nextRows.length + 1}`,
        tpDescription: params.newTopic,
        topic: params.newTopic,
        jpAllocation: Math.max(0, Math.round(params.newJp)),
        timeDistribution: defaultRange,
      });
    } else if (matchedIndices.length === 1) {
      const idx = matchedIndices[0];
      nextRows[idx] = {
        ...nextRows[idx],
        topic: params.newTopic,
        jpAllocation: Math.max(0, Math.round(params.newJp)),
      };
    } else {
      // Multiple PROTA rows share the exact same topic in this semester: keep total sum === newJp
      const currentSum = matchedIndices.reduce(
        (sum, idx) => sum + Math.max(0, Math.round(Number(nextRows[idx].jpAllocation || 0))),
        0
      );
      let remaining = Math.max(0, Math.round(params.newJp));
      matchedIndices.forEach((idx, pos) => {
        nextRows[idx].topic = params.newTopic;
        if (pos === matchedIndices.length - 1) {
          nextRows[idx].jpAllocation = remaining;
        } else if (currentSum > 0) {
          const share = Math.min(
            remaining,
            Math.round((Math.max(0, Number(nextRows[idx].jpAllocation || 0)) / currentSum) * params.newJp)
          );
          nextRows[idx].jpAllocation = share;
          remaining -= share;
        } else {
          const share = Math.floor(params.newJp / matchedIndices.length);
          nextRows[idx].jpAllocation = share;
          remaining -= share;
        }
      });
    }

    const totalJpYear = nextRows.reduce((sum, r) => sum + Math.max(0, Math.round(Number(r?.jpAllocation || 0))), 0);
    await saveProtaDocumentContent({
      ...(wsProtaDoc?.content || {}),
      protaRows: nextRows,
      evaluationCalendar,
      totalJpYear,
    });
  };

  const handleGenerateProtaProsem = async () => {
    if (!user || !activeWorkspace?.id) {
      notify('Buat atau pilih ruang kerja mata pelajaran di AI Auto Curriculum terlebih dahulu.', 'error');
      return;
    }
    setGenerating(true);
    try {
      const cal = calendars[0];
      const calSummary = cal
        ? `Total ${cal.totalWeeks} minggu, Efektif ${cal.effectiveWeeks} minggu (Target ${jpStandard.regulationRef}: ${jpStandard.effectiveWeeksPerYear} minggu efektif = ${jpStandard.semester1Weeks} Smt 1 + ${jpStandard.semester2Weeks} Smt 2)`
        : `${jpStandard.effectiveWeeksPerYear} minggu efektif per tahun (${jpStandard.semester1Weeks} Smt 1, ${jpStandard.semester2Weeks} Smt 2) sesuai ${jpStandard.regulationRef}`;
      const rawRes = await postAuthedJson<any>('/api/ai/prota-prosem', {
        workspace: activeWorkspace,
        calendarSummary: calSummary,
        textbookContext: buildRichTextbookContext(
          textbooks,
          activeWorkspace.primaryBookId,
          activeWorkspace.subject,
          {
            curriculum: activeWorkspace.curriculum,
            grade: activeWorkspace.grade,
            level: activeWorkspace.level,
            semester: activeWorkspace.semester,
          }
        ),
        aiPreferences: aiSettings || undefined,
      });

      const reconciled = reconcileProtaAndProsem({
        protaRows: rawRes.protaRows || [],
        prosemItems: rawRes.prosemItems || [],
        jpPerWeek: effectiveJpPerWeek,
        recommendedJpPerMeeting: jpStandard.recommendedJpPerMeeting,
        defaultSubject: activeWorkspace.subject,
      });

      const res = {
        ...rawRes,
        protaRows: reconciled.protaRows,
        prosemItems: reconciled.prosemItems,
        totalJpYear: reconciled.totalJpYear,
      };

      if (wsProtaDoc?.id) {
        await updateRecord('documents', wsProtaDoc.id, { content: res, version: (wsProtaDoc.version || 1) + 1 });
      } else {
        await createRecord('documents', {
          ownerId: user.uid,
          workspaceId: activeWorkspace.id!,
          academicYear: activeWorkspace.academicYear,
          semester: activeWorkspace.semester,
          grade: activeWorkspace.grade,
          subject: activeWorkspace.subject,
          docType: 'prota',
          title: `Program Tahunan (PROTA) ${activeWorkspace.subject} ${activeWorkspace.grade}`,
          status: 'draft',
          isAiDraft: true,
          content: res,
          version: 1,
          archived: false,
        });
      }

      // Clear previous PROSEM rows for this workspace before saving reconciled rows so totals never duplicate
      for (const oldItem of wsProsemItems) {
        if (oldItem.id) {
          await deleteRecord('prosem_items', oldItem.id);
        }
      }

      for (const item of res.prosemItems || []) {
        const sem = normalizeAcademicSemester(item.semester, item.month);
        const month = normalizeProsemMonthName(item.month, sem);
        await createRecord('prosem_items', {
          ownerId: user.uid,
          workspaceId: activeWorkspace.id!,
          semester: sem,
          month,
          weekNumber: clampProsemWeek(item.weekNumber),
          meetingNumber: Math.max(1, Number(item.meetingNumber || 1)),
          tpCode: String(item.tpCode || 'TP-1').slice(0, 50),
          topic: String(item.topic || activeWorkspace.subject).slice(0, 250),
          subtopic: String(item.subtopic || '').slice(0, 250),
          jpAllocation: Math.max(0, Math.min(100, Math.round(Number(item.jpAllocation || jpStandard.recommendedJpPerMeeting)))),
          plannedDate: String(item.plannedDate || `${month} Minggu ${clampProsemWeek(item.weekNumber)}`).slice(0, 40),
          executionStatus: 'belum',
          executionDate: '',
          teacherNotes: '',
        });
      }
      notify(
        `PROTA dan PROSEM disusun selaras (${reconciled.totalJpYear} JP: Smt 1 = ${reconciled.sem1Jp} JP, Smt 2 = ${reconciled.sem2Jp} JP).`,
        'success'
      );
    } catch (err: any) {
      notify(err?.message || 'Gagal menyusun PROTA/PROSEM.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleAddProtaRow = async () => {
    if (!user || !activeWorkspace?.id) return;
    const nextIdx = protaRows.length + 1;
    const nextRows = [
      ...protaRows,
      {
        semester: 'Semester 1',
        element: 'Elemen Baru',
        tpCode: `TP-${nextIdx}`,
        tpDescription: 'Tujuan pembelajaran baru',
        topic: `Materi Pokok ${nextIdx}`,
        jpAllocation: effectiveJpPerWeek,
        timeDistribution: 'Juli - Agustus',
      },
    ];
    await persistProtaAndSyncProsem(nextRows);
  };

  const updateProtaCell = async (idx: number, key: string, val: any) => {
    if (!wsProtaDoc?.id) return;
    const currentVal = protaRows[idx]?.[key];
    if (currentVal === val) return;

    const normalizedVal =
      key === 'jpAllocation' ? Math.max(0, Math.round(Number(val || 0))) : val;
    const nextRows = protaRows.map((r, i) => (i === idx ? { ...r, [key]: normalizedVal } : r));

    if (key === 'tpDescription' || key === 'element') {
      await saveProtaDocumentContent({ ...(wsProtaDoc.content || {}), protaRows: nextRows });
      return;
    }

    await persistProtaAndSyncProsem(nextRows);
  };

  const removeProtaRow = async (idx: number) => {
    if (!wsProtaDoc?.id) return;
    const nextRows = protaRows.filter((_, i) => i !== idx);
    await persistProtaAndSyncProsem(nextRows);
  };

  // Interactive Matrix handlers
  const handleToggleWeekSlot = async (group: MatrixTopicGroup, monthFull: string, weekNumber: number) => {
    if (!user || !activeWorkspace?.id) return;
    const matching = group.items.filter(
      (it) => normalizeMonthName(it.month) === monthFull && clampWeek(it.weekNumber) === weekNumber
    );

    if (matching.length > 0) {
      if (group.items.length <= matching.length) {
        notify('Aktifkan minimal 1 minggu lain sebelum menghapus minggu terakhir, atau hapus baris materi.', 'info');
        return;
      }
      let removedJp = 0;
      for (const m of matching) {
        removedJp += Number(m.jpAllocation || 0);
        if (m.id) await deleteRecord('prosem_items', m.id);
      }
      await syncProtaRowFromMatrixTopic({
        semester: activeSemester,
        oldTopic: group.topic,
        newTopic: group.topic,
        tpCode: group.tpCode,
        newJp: Math.max(0, group.jp - removedJp),
        operation: 'upsert',
      });
    } else {
      const nextMeeting =
        wsProsemItems.reduce((max, it) => Math.max(max, Number(it.meetingNumber || 0)), 0) + 1;
      const defaultJp = jpStandard.recommendedJpPerMeeting;
      await createRecord('prosem_items', {
        ownerId: user.uid,
        workspaceId: activeWorkspace.id,
        semester: activeSemester,
        month: monthFull,
        weekNumber,
        meetingNumber: nextMeeting,
        tpCode: group.tpCode || `TP-${group.no}`,
        topic: group.topic,
        subtopic: '',
        jpAllocation: defaultJp,
        plannedDate: `${monthFull} Minggu ${weekNumber}`.slice(0, 40),
        executionStatus: 'belum',
        executionDate: '',
        teacherNotes: '',
      });
      await syncProtaRowFromMatrixTopic({
        semester: activeSemester,
        oldTopic: group.topic,
        newTopic: group.topic,
        tpCode: group.tpCode,
        newJp: group.jp + defaultJp,
        operation: 'upsert',
      });
    }
  };

  const handleRenameMatrixTopic = async (group: MatrixTopicGroup, newTopic: string) => {
    const trimmed = newTopic.trim().slice(0, 250);
    if (!trimmed || trimmed === group.topic) return;
    for (const it of group.items) {
      if (it.id) {
        await updateRecord('prosem_items', it.id, { topic: trimmed });
      }
    }
    await syncProtaRowFromMatrixTopic({
      semester: activeSemester,
      oldTopic: group.topic,
      newTopic: trimmed,
      tpCode: group.tpCode,
      newJp: group.jp,
      operation: 'upsert',
    });
  };

  const handleUpdateMatrixJp = async (group: MatrixTopicGroup, targetTotalJp: number) => {
    if (group.items.length === 0 || Number.isNaN(targetTotalJp)) return;
    const safeTotal = Math.max(0, Math.min(100 * group.items.length, Math.round(targetTotalJp)));
    if (safeTotal === group.jp) return;
    const count = group.items.length;
    const base = Math.floor(safeTotal / count);
    const rem = safeTotal % count;
    for (let i = 0; i < count; i++) {
      const item = group.items[i];
      const nextJp = Math.min(100, base + (i < rem ? 1 : 0));
      if (item.id && item.jpAllocation !== nextJp) {
        await updateRecord('prosem_items', item.id, { jpAllocation: nextJp });
      }
    }
    await syncProtaRowFromMatrixTopic({
      semester: activeSemester,
      oldTopic: group.topic,
      newTopic: group.topic,
      tpCode: group.tpCode,
      newJp: safeTotal,
      operation: 'upsert',
    });
  };

  const handleAddMatrixRow = async () => {
    if (!user || !activeWorkspace?.id) {
      notify('Pilih mata pelajaran aktif terlebih dahulu.', 'error');
      return;
    }
    const nextMeeting =
      wsProsemItems.reduce((max, it) => Math.max(max, Number(it.meetingNumber || 0)), 0) + 1;
    const firstMonth = semesterMonths[0].full;
    let candidateIdx = matrixGroups.length + 1;
    const existingTopics = new Set(matrixGroups.map((g) => g.topic.trim().toLowerCase()));
    while (existingTopics.has(`materi pokok ${candidateIdx}`)) {
      candidateIdx += 1;
    }
    const newTopic = `Materi Pokok ${candidateIdx}`;
    const newTpCode = `TP-${candidateIdx}`;
    const newJp = jpStandard.recommendedJpPerMeeting;

    await createRecord('prosem_items', {
      ownerId: user.uid,
      workspaceId: activeWorkspace.id,
      semester: activeSemester,
      month: firstMonth,
      weekNumber: 1,
      meetingNumber: nextMeeting,
      tpCode: newTpCode,
      topic: newTopic,
      subtopic: '',
      jpAllocation: newJp,
      plannedDate: `${firstMonth} Minggu 1`,
      executionStatus: 'belum',
      executionDate: '',
      teacherNotes: '',
    });

    await syncProtaRowFromMatrixTopic({
      semester: activeSemester,
      oldTopic: newTopic,
      newTopic,
      tpCode: newTpCode,
      newJp,
      operation: 'upsert',
    });
  };

  const handleDeleteMatrixRow = async (group: MatrixTopicGroup) => {
    for (const it of group.items) {
      if (it.id) await deleteRecord('prosem_items', it.id);
    }
    await syncProtaRowFromMatrixTopic({
      semester: activeSemester,
      oldTopic: group.topic,
      newTopic: group.topic,
      tpCode: group.tpCode,
      newJp: 0,
      operation: 'delete',
    });
  };

  const handleDeleteChecklistItem = async (item: ProsemItemRecord) => {
    if (!item.id) return;
    await deleteRecord('prosem_items', item.id);
    const sem = normalizeAcademicSemester(item.semester, item.month);
    const remainingSameTopic = wsProsemItems.filter(
      (p) =>
        p.id !== item.id &&
        normalizeAcademicSemester(p.semester, p.month) === sem &&
        normTopicKey(p.topic) === normTopicKey(item.topic)
    );
    const nextTopicJp = remainingSameTopic.reduce((sum, p) => sum + Number(p.jpAllocation || 0), 0);
    await syncProtaRowFromMatrixTopic({
      semester: sem,
      oldTopic: item.topic,
      newTopic: item.topic,
      tpCode: item.tpCode || '',
      newJp: nextTopicJp,
      operation: remainingSameTopic.length === 0 ? 'delete' : 'upsert',
    });
  };

  const persistEvaluationCalendar = async (nextCalendar: ProsemEvaluationEntry[]) => {
    await saveProtaDocumentContent({
      ...(wsProtaDoc?.content || { protaRows: [] }),
      evaluationCalendar: nextCalendar,
    });
  };

  const handleEvalChange = async (idx: number, key: keyof ProsemEvaluationEntry, value: string) => {
    const next = evaluationCalendar.map((ev, i) => (i === idx ? { ...ev, [key]: value } : ev));
    await persistEvaluationCalendar(next);
  };

  const handleAddEvalRow = async () => {
    const next = [
      ...evaluationCalendar,
      {
        period: semesterMonths[2]?.full || 'September',
        evaluationType: 'Asesmen Sumatif Lingkup Materi',
        status: 'DRAF',
        essentialMaterial: activeWorkspace?.subject || '-',
      },
    ];
    await persistEvaluationCalendar(next);
  };

  const handleDeleteEvalRow = async (idx: number) => {
    const next = evaluationCalendar.filter((_, i) => i !== idx);
    await persistEvaluationCalendar(next);
  };

  const toggleChecklistStatus = async (itemId: string, nextStatus: ProsemExecutionStatus) => {
    await updateRecord('prosem_items', itemId, {
      executionStatus: nextStatus,
      executionDate: nextStatus === 'selesai' ? new Date().toISOString().slice(0, 10) : '',
    });
  };

  const buildProtaExport = (): PrintableDocPayload => {
    const totalProtaJp = protaRows.reduce((a, b) => a + Number(b.jpAllocation || 0), 0);
    const schoolVal = activeSchool?.name || '-';
    const teacherName = activeSchool?.teacherName || profile?.displayName || '-';

    return {
      title: `Program Tahunan (PROTA) ${activeWorkspace?.subject || ''} Kelas ${activeWorkspace?.grade || ''}`.trim(),
      subtitle: `Tahun Pelajaran ${activeWorkspace?.academicYear || activeSchool?.academicYear || '-'}`,
      fileName: `PROTA_${(activeWorkspace?.subject || 'Mapel').replace(/\s+/g, '_')}`,
      school: activeSchool,
      teacher: profile,
      metadataPairs: [
        { label: 'Sekolah', value: schoolVal },
        { label: 'Mata Pelajaran', value: activeWorkspace?.subject || '-' },
        { label: 'Fase / Kelas', value: `${activeWorkspace?.phase || '-'} / ${activeWorkspace?.grade || '-'}` },
        {
          label: 'Alokasi Tatap Muka',
          value: `${effectiveJpPerWeek} JP/minggu (@${jpStandard.minutesPerJp} Menit/JP) · Target ${targetAnnualJp} JP/tahun`,
        },
        { label: 'Tahun Pelajaran', value: activeWorkspace?.academicYear || activeSchool?.academicYear || '-' },
        { label: 'Guru Mata Pelajaran', value: teacherName },
      ],
      sections: [
        {
          heading: 'Distribusi Alokasi Waktu Satu Tahun',
          table: {
            headers: ['No', 'Semester', 'Elemen', 'Kode TP', 'Materi Pokok', 'Tujuan Pembelajaran', 'JP', 'Distribusi'],
            rows: [
              ...protaRows.map((r, i) => [
                i + 1,
                r.semester,
                r.element,
                r.tpCode,
                r.topic,
                r.tpDescription,
                r.jpAllocation,
                r.timeDistribution,
              ]),
              ['', '', '', '', 'Subtotal Semester 1 (Ganjil)', '', `${parity.protaSem1Jp} JP`, 'Semester 1'],
              ['', '', '', '', 'Subtotal Semester 2 (Genap)', '', `${parity.protaSem2Jp} JP`, 'Semester 2'],
              ['', '', '', '', 'Total Alokasi Waktu Satu Tahun', '', `${totalProtaJp} JP`, 'Semester 1 & 2'],
            ],
          },
        },
      ],
    };
  };

  const buildProsemMatrixExport = (): ProsemMatrixExportPayload => {
    const cleanSubj = (activeWorkspace?.subject || 'Mapel').replace(/\s+/g, '_');
    const cleanGrade = (activeWorkspace?.grade || 'Kelas').replace(/\s+/g, '_');
    return {
      semesterLabel,
      subject: activeWorkspace?.subject || '-',
      grade: activeWorkspace?.grade || '-',
      phase: activeWorkspace?.phase || '-',
      academicYear: activeWorkspace?.academicYear || activeSchool?.academicYear || '-',
      fileName: `PROSEM_${semesterLabel}_${cleanSubj}_Kelas_${cleanGrade}`,
      school: activeSchool,
      teacher: profile,
      months: semesterMonths,
      rows: matrixGroups.map((g) => ({
        no: g.no,
        topic: g.topic,
        jp: g.jp,
        activeWeeks: g.activeWeeks,
      })),
      totalJp: totalSemesterJp,
      evaluationCalendar,
    };
  };

  // Rekap PROSEM stats (for current semester)
  const totalCount = semesterProsemItems.length;
  const doneCount = semesterProsemItems.filter((i) => i.executionStatus === 'selesai').length;
  const delayedCount = semesterProsemItems.filter(
    (i) => i.executionStatus === 'ditunda' || i.executionStatus === 'penyesuaian'
  ).length;
  const completionPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const activeProtaSemesterJp =
    activeSemester === 'Semester 1' ? parity.protaSem1Jp : parity.protaSem2Jp;

  const renderParityStrip = () => {
    if (protaRows.length === 0 && wsProsemItems.length === 0) return null;
    if (parity.isFullyMatched) {
      return (
        <div className="no-print flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/30 text-xs">
          <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-medium">
            <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
            <span>
              Total jam PROTA &amp; PROMES selaras 100% (per materi, per semester, dan tahunan).
            </span>
          </div>
          <div className="font-mono tabular-nums text-[11px] text-emerald-800 dark:text-emerald-300">
            Smt 1: {parity.protaSem1Jp} JP · Smt 2: {parity.protaSem2Jp} JP · Total: {parity.protaTotalJp} JP
          </div>
        </div>
      );
    }

    return (
      <div className="no-print flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl border border-amber-300 dark:border-amber-800/70 bg-amber-50/90 dark:bg-amber-950/35 text-xs">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-300 font-semibold">
            <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0" />
            <span>
              Total jam PROTA dan PROMES belum sama
              {parity.mismatchedTopics.length > 0
                ? ` (${parity.mismatchedTopics.slice(0, 3).join(', ')}${parity.mismatchedTopics.length > 3 ? `, +${parity.mismatchedTopics.length - 3} lainnya` : ''})`
                : ''}
            </span>
          </div>
          <p className="font-mono tabular-nums text-[11px] text-amber-800 dark:text-amber-300/90 pl-6">
            PROTA: Smt 1 = {parity.protaSem1Jp} JP, Smt 2 = {parity.protaSem2Jp} JP, Total = {parity.protaTotalJp} JP
            {' · '}
            PROMES: Smt 1 = {parity.prosemSem1Jp} JP, Smt 2 = {parity.prosemSem2Jp} JP, Total = {parity.prosemTotalJp} JP
          </p>
        </div>
        <button
          type="button"
          onClick={handleSyncProsemToProta}
          disabled={syncing || protaRows.length === 0}
          className="px-3.5 py-2 rounded-lg bg-[#D97706] hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          <span>Sinkronkan PROMES = PROTA</span>
        </button>
      </div>
    );
  };

  if (mode === 'prota') {
    const totalJp = parity.protaTotalJp;
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 no-print">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              Program Tahunan (PROTA)
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {activeWorkspace
                ? `${activeWorkspace.subject} · ${activeWorkspace.grade} · Tersusun ${totalJp} JP (Target ${jpStandard.regulationRef}: ${targetAnnualJp} JP = ${effectiveJpPerWeek} JP/mg × ${jpStandard.effectiveWeeksPerYear} pekan · @${jpStandard.minutesPerJp} Menit)`
                : 'Pilih mata pelajaran aktif.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleGenerateProtaProsem}
              disabled={generating}
              className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>Generate Otomatis</span>
            </button>
            <button
              onClick={handleAddProtaRow}
              className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Baris</span>
            </button>
            <button
              onClick={() => exportDocumentPdf(buildProtaExport())}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>
            <button
              onClick={() => exportDocumentDocx(buildProtaExport())}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>DOCX</span>
            </button>
            <button
              onClick={() =>
                exportTableXlsx({
                  fileName: `PROTA_${activeWorkspace?.subject || 'Mapel'}`,
                  sheetName: 'PROTA',
                  headers: ['No', 'Semester', 'Elemen', 'Kode TP', 'Materi Pokok', 'Tujuan Pembelajaran', 'JP', 'Distribusi'],
                  rows: protaRows.map((r, i) => [
                    i + 1,
                    r.semester,
                    r.element,
                    r.tpCode,
                    r.topic,
                    r.tpDescription,
                    r.jpAllocation,
                    r.timeDistribution,
                  ]),
                })
              }
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>XLSX</span>
            </button>
            <button
              onClick={() => window.print()}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak</span>
            </button>
          </div>
        </div>

        {renderParityStrip()}

        <OfficialDocumentSheet
          school={activeSchool}
          teacher={profile}
          runningHeaderRight={`${activeSchool?.name || 'Satuan Pendidikan'} | ${activeWorkspace?.subject || '-'} ${activeWorkspace?.grade || '-'}`}
          title={`PROGRAM TAHUNAN (PROTA) ${activeWorkspace?.subject || ''} KELAS ${activeWorkspace?.grade || ''}`.trim()}
          subtitle={`Tahun Pelajaran ${activeWorkspace?.academicYear || activeSchool?.academicYear || '-'}`}
          subjectLabel={activeWorkspace?.subject}
          metadataPairs={[
            {
              label: 'Sekolah',
              value: activeSchool?.name || '-',
            },
            { label: 'Mata Pelajaran', value: activeWorkspace?.subject || '-' },
            { label: 'Fase / Kelas', value: `${activeWorkspace?.phase || '-'} / ${activeWorkspace?.grade || '-'}` },
            {
              label: 'Alokasi Jam Tatap Muka',
              value: `${effectiveJpPerWeek} JP/minggu (@${jpStandard.minutesPerJp} Menit/JP) · Target ${targetAnnualJp} JP/tahun`,
            },
            { label: 'Tahun Pelajaran', value: activeWorkspace?.academicYear || activeSchool?.academicYear || '-' },
            {
              label: 'Guru Mata Pelajaran',
              value: activeSchool?.teacherName || profile?.displayName || '-',
            },
          ]}
        >
          <div className="space-y-2.5">
            <h3 className="text-sm md:text-[15px] font-bold text-slate-900">
              Distribusi Alokasi Waktu Pembelajaran Satu Tahun
            </h3>
            {protaRows.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8 border border-slate-300 rounded-lg">
                Belum ada baris PROTA. Klik Generate Otomatis untuk menyusun distribusi JP satu tahun.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-slate-400 text-xs">
                  <thead>
                    <tr className="bg-[#DCE6F2] text-slate-900 font-bold text-left">
                      <th className="border border-slate-400 px-2 py-2 text-center w-9">No</th>
                      <th className="border border-slate-400 px-2.5 py-2 w-28">Semester</th>
                      <th className="border border-slate-400 px-2.5 py-2 w-24">Kode TP</th>
                      <th className="border border-slate-400 px-3 py-2 min-w-[160px]">Materi Pokok</th>
                      <th className="border border-slate-400 px-3 py-2 min-w-[220px]">Tujuan Pembelajaran</th>
                      <th className="border border-slate-400 px-2 py-2 text-center w-16">JP</th>
                      <th className="border border-slate-400 px-2.5 py-2 w-36">Distribusi Waktu</th>
                      <th className="border border-slate-400 px-2 py-2 text-center w-10 no-print">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {protaRows.map((row, idx) => (
                      <tr key={`${idx}-${row.tpCode || ''}-${row.semester || ''}`} className="hover:bg-slate-50/70">
                        <td className="border border-slate-400 px-2 py-1.5 text-center font-mono tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="border border-slate-400 px-1.5 py-1.5">
                          <select
                            value={normalizeAcademicSemester(row.semester, row.timeDistribution)}
                            onChange={(e) => updateProtaCell(idx, 'semester', e.target.value)}
                            className="w-full bg-transparent text-xs font-medium text-slate-900 focus:outline-none"
                          >
                            <option value="Semester 1">Semester 1</option>
                            <option value="Semester 2">Semester 2</option>
                          </select>
                        </td>
                        <td className="border border-slate-400 px-2 py-1.5 font-mono text-xs text-slate-700">
                          {row.tpCode}
                        </td>
                        <td className="border border-slate-400 px-2 py-1">
                          <input
                            type="text"
                            defaultValue={row.topic}
                            key={`topic-${idx}-${row.topic}`}
                            onBlur={(e) => updateProtaCell(idx, 'topic', e.target.value.trim() || row.topic)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur();
                            }}
                            className="w-full px-1 py-0.5 bg-transparent text-xs font-semibold text-slate-900 focus:outline-none focus:bg-blue-50/60 rounded"
                          />
                        </td>
                        <td className="border border-slate-400 px-2 py-1">
                          <input
                            type="text"
                            defaultValue={row.tpDescription}
                            key={`tpdesc-${idx}-${row.tpDescription}`}
                            onBlur={(e) => updateProtaCell(idx, 'tpDescription', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur();
                            }}
                            className="w-full px-1 py-0.5 bg-transparent text-xs text-slate-800 focus:outline-none focus:bg-blue-50/60 rounded"
                          />
                        </td>
                        <td className="border border-slate-400 px-1 py-1 text-center">
                          <input
                            type="number"
                            min={0}
                            max={400}
                            defaultValue={row.jpAllocation}
                            key={`jp-${idx}-${row.jpAllocation}`}
                            onBlur={(e) => updateProtaCell(idx, 'jpAllocation', Number(e.target.value))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur();
                            }}
                            className="w-12 text-center bg-transparent text-xs font-bold font-mono tabular-nums text-slate-900 focus:outline-none focus:bg-blue-50/60 rounded"
                          />
                        </td>
                        <td className="border border-slate-400 px-2 py-1">
                          <input
                            type="text"
                            defaultValue={row.timeDistribution}
                            key={`dist-${idx}-${row.timeDistribution}`}
                            onBlur={(e) => updateProtaCell(idx, 'timeDistribution', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur();
                            }}
                            className="w-full px-1 py-0.5 bg-transparent text-xs text-slate-800 focus:outline-none focus:bg-blue-50/60 rounded"
                          />
                        </td>
                        <td className="border border-slate-400 text-center no-print">
                          <button onClick={() => removeProtaRow(idx)} className="text-slate-400 hover:text-red-600 p-1">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50/70 font-semibold text-slate-700">
                      <td colSpan={5} className="border border-slate-400 px-3 py-1.5 text-right">
                        Subtotal Semester 1 (Ganjil)
                      </td>
                      <td className="border border-slate-400 px-2 py-1.5 text-center font-mono tabular-nums text-slate-900">
                        {parity.protaSem1Jp} JP
                      </td>
                      <td className="border border-slate-400 px-2.5 py-1.5 text-[11px] font-mono tabular-nums text-slate-600 font-normal">
                        PROMES Smt 1: {parity.prosemSem1Jp} JP
                      </td>
                      <td className="border border-slate-400 no-print" />
                    </tr>
                    <tr className="bg-slate-50/70 font-semibold text-slate-700">
                      <td colSpan={5} className="border border-slate-400 px-3 py-1.5 text-right">
                        Subtotal Semester 2 (Genap)
                      </td>
                      <td className="border border-slate-400 px-2 py-1.5 text-center font-mono tabular-nums text-slate-900">
                        {parity.protaSem2Jp} JP
                      </td>
                      <td className="border border-slate-400 px-2.5 py-1.5 text-[11px] font-mono tabular-nums text-slate-600 font-normal">
                        PROMES Smt 2: {parity.prosemSem2Jp} JP
                      </td>
                      <td className="border border-slate-400 no-print" />
                    </tr>
                    <tr className="bg-slate-100 font-bold">
                      <td colSpan={5} className="border border-slate-400 px-3 py-2 text-right text-slate-900">
                        Total Alokasi Jam Pelajaran (1 Tahun)
                      </td>
                      <td className="border border-slate-400 px-2 py-2 text-center font-mono tabular-nums text-slate-900">
                        {totalJp} JP
                      </td>
                      <td className="border border-slate-400 px-2.5 py-2 text-[11px] text-slate-600 font-normal">
                        Target {targetAnnualJp} JP ({effectiveJpPerWeek} JP/mg @ {jpStandard.minutesPerJp} mnt)
                      </td>
                      <td className="border border-slate-400 no-print" />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </OfficialDocumentSheet>
      </div>
    );
  }

  // PROSEM (Matriks PROSEM Resmi + Checklist Pelaksanaan Bulanan)
  const schoolName = activeSchool?.name || 'Satuan Pendidikan';
  const subjectName = activeWorkspace?.subject || activeSchool?.subject || '-';
  const gradeLabel = activeWorkspace?.grade || '-';
  const phaseLabel = activeWorkspace?.phase || '-';
  const academicYearLabel = activeWorkspace?.academicYear || activeSchool?.academicYear || '-';
  const teacherName = activeSchool?.teacherName || profile?.displayName || '-';
  const teacherNip = activeSchool?.teacherNip || profile?.nip || '-';
  const principalName = activeSchool?.principalName || '........................................';

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Program Semester (PROSEM)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Matriks distribusi minggu efektif semester & checklist keterlaksanaan pembelajaran bulanan.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleGenerateProtaProsem}
            disabled={generating}
            className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>Susun PROSEM Otomatis</span>
          </button>
          <button
            onClick={() => exportProsemMatrixPdf(buildProsemMatrixExport())}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Download className="w-3.5 h-3.5" />
            <span>PDF</span>
          </button>
          <button
            onClick={() => exportProsemMatrixDocx(buildProsemMatrixExport())}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>DOCX</span>
          </button>
          <button
            onClick={() => exportProsemMatrixXlsx(buildProsemMatrixExport())}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>XLSX</span>
          </button>
          <button
            onClick={() => {
              setProsemTab('matrix');
              setTimeout(() => window.print(), 80);
            }}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak A4</span>
          </button>
        </div>
      </div>

      {/* Status Keselarasan PROTA & PROMES */}
      {renderParityStrip()}

      {/* Ringkasan KPI Semester */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 no-print">
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total Alokasi ({semesterLabel})</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {totalSemesterJp} JP
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
            PROTA {semesterLabel}: {activeProtaSemesterJp} JP · Target: {targetSemesterJp} JP
          </p>
        </div>
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">Pekan Efektif Tercentang</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-blue-700 dark:text-sky-400 mt-1">
            {activeWeekCount} Pekan
          </p>
        </div>
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">Keterlaksanaan Semester</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">
            {completionPct}% ({doneCount}/{totalCount})
          </p>
        </div>
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">Ditunda / Penyesuaian</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-amber-700 dark:text-amber-400 mt-1">
            {delayedCount}
          </p>
        </div>
      </div>

      {/* Switcher Semester & Tampilan */}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            {[
              { id: 'Semester 1' as const, label: 'Semester Ganjil (Jul–Des)' },
              { id: 'Semester 2' as const, label: 'Semester Genap (Jan–Jun)' },
            ].map((sem) => (
              <button
                key={sem.id}
                onClick={() => {
                  setActiveSemester(sem.id);
                  setMonthFilter('Semua');
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  activeSemester === sem.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {sem.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setProsemTab('matrix')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                prosemTab === 'matrix'
                  ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-sky-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Matriks PROSEM</span>
            </button>
            <button
              onClick={() => setProsemTab('checklist')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                prosemTab === 'checklist'
                  ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-sky-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <ListChecks className="w-3.5 h-3.5" />
              <span>Checklist Bulanan</span>
            </button>
          </div>
        </div>

        {prosemTab === 'matrix' ? (
          <button
            onClick={handleAddMatrixRow}
            className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Baris Materi</span>
          </button>
        ) : (
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
          >
            <option value="Semua">Semua Bulan ({semesterLabel})</option>
            {uniqueMonths.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* View 1: Formal Document Sheet Matriks PROSEM */}
      {prosemTab === 'matrix' && (
        <div className="bg-white text-slate-900 border border-slate-200 rounded-xl shadow-sm p-6 md:p-10 overflow-x-auto print-sheet">
          <div className="max-w-[920px] mx-auto space-y-6">
            {/* Running Header Kanan Atas */}
            <div className="text-right text-[11px] text-slate-400 font-medium">
              {schoolName} | {subjectName} {gradeLabel}
            </div>

            {/* Kop & Judul PROSEM */}
            <div className="text-center pb-3 border-b-2 border-[#1E3A8A] relative">
              <div className="border-b border-[#1E3A8A] pb-2.5 space-y-1.5">
                {activeSchool?.letterheadDataUrl ? (
                  <img
                    src={activeSchool.letterheadDataUrl}
                    alt={`Kop Surat ${schoolName}`}
                    className="w-full max-h-36 object-contain mx-auto"
                  />
                ) : (
                  <div className="flex items-center justify-center gap-4">
                    {activeSchool?.agencyLogoDataUrl && (
                      <img
                        src={activeSchool.agencyLogoDataUrl}
                        alt="Logo Instansi"
                        className="h-14 w-14 object-contain shrink-0"
                      />
                    )}
                    <h2 className="text-base md:text-lg font-bold tracking-wide text-[#003380] uppercase flex-1">
                      {schoolName}
                    </h2>
                    {activeSchool?.logoDataUrl && (
                      <img
                        src={activeSchool.logoDataUrl}
                        alt="Logo Sekolah"
                        className="h-14 w-14 object-contain shrink-0"
                      />
                    )}
                  </div>
                )}
                <p className="text-xs md:text-sm font-bold text-slate-900 uppercase pt-1">
                  PROSEM {semesterLabel} {subjectName} KELAS {gradeLabel} — TAHUN PELAJARAN {academicYearLabel}
                </p>
              </div>
            </div>

            {/* Grid Identitas */}
            <div className="grid grid-cols-[150px_14px_1fr] gap-y-1 text-xs md:text-[13px] text-slate-800">
              <span className="font-bold">Sekolah</span>
              <span>:</span>
              <span>{schoolName}</span>

              <span className="font-bold">Mata Pelajaran</span>
              <span>:</span>
              <span>{subjectName}</span>

              <span className="font-bold">Fase / Kelas</span>
              <span>:</span>
              <span>
                {phaseLabel} / {gradeLabel}
              </span>

              <span className="font-bold">Alokasi Jam Tatap Muka</span>
              <span>:</span>
              <span>
                {effectiveJpPerWeek} JP / Minggu (@{jpStandard.minutesPerJp} Menit/JP) · Target {targetSemesterJp} JP / Semester
              </span>

              <span className="font-bold">Tahun Pelajaran</span>
              <span>:</span>
              <span>
                {academicYearLabel} · Semester {semesterLabel}
              </span>

              <span className="font-bold">Guru Mata Pelajaran</span>
              <span>:</span>
              <span>{teacherName}</span>
            </div>

            {/* Tabel Utama Matriks PROSEM */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm md:text-[15px] font-bold text-slate-900">
                  Distribusi Program Semester {semesterLabel}
                </h3>
                <span className="text-[11px] text-slate-400 no-print">
                  Klik sel minggu (1–4) untuk mencentang atau melepas jadwal pekan efektif
                </span>
              </div>

              {matrixGroups.length === 0 ? (
                <div className="border border-slate-300 rounded-lg p-8 text-center text-sm text-slate-500">
                  Belum ada data PROSEM untuk Semester {semesterLabel}. Klik{' '}
                  <span className="font-semibold text-blue-700">Susun PROSEM Otomatis</span> atau{' '}
                  <span className="font-semibold text-slate-700">Tambah Baris Materi</span>.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-slate-400 text-xs">
                    <thead>
                      <tr className="bg-[#DCE6F2] text-slate-900 font-bold">
                        <th rowSpan={2} className="border border-slate-400 px-2 py-2 text-center w-9">
                          No
                        </th>
                        <th rowSpan={2} className="border border-slate-400 px-3 py-2 text-left min-w-[200px]">
                          Materi / Tujuan Pembelajaran
                        </th>
                        <th rowSpan={2} className="border border-slate-400 px-2 py-2 text-center w-12">
                          JP
                        </th>
                        {semesterMonths.map((m) => (
                          <th
                            key={m.full}
                            colSpan={4}
                            className="border border-slate-400 px-1 py-1 text-center text-[11px]"
                          >
                            {m.short}
                          </th>
                        ))}
                        <th rowSpan={2} className="border border-slate-400 px-1.5 py-1 text-center w-8 no-print">
                          Aksi
                        </th>
                      </tr>
                      <tr className="bg-[#DCE6F2] text-slate-800 font-bold">
                        {semesterMonths.map((m) =>
                          [1, 2, 3, 4].map((w) => (
                            <th
                              key={`${m.full}-${w}`}
                              className="border border-slate-400 w-6 py-1 text-center text-[10px] font-mono tabular-nums"
                            >
                              {w}
                            </th>
                          ))
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {matrixGroups.map((group) => (
                        <tr key={`${activeSemester}-${group.topic}-${group.no}`} className="hover:bg-slate-50/70">
                          <td className="border border-slate-400 px-2 py-1.5 text-center font-mono tabular-nums">
                            {group.no}
                          </td>
                          <td className="border border-slate-400 px-2 py-1">
                            <input
                              type="text"
                              defaultValue={group.topic}
                              onBlur={(e) => handleRenameMatrixTopic(group, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur();
                              }}
                              className="w-full bg-transparent text-xs text-slate-900 focus:outline-none focus:bg-blue-50/60 px-1 py-0.5 rounded"
                            />
                          </td>
                          <td className="border border-slate-400 px-1 py-1 text-center">
                            <input
                              type="number"
                              min={0}
                              max={200}
                              defaultValue={group.jp}
                              key={`${group.topic}-${group.jp}`}
                              onBlur={(e) => handleUpdateMatrixJp(group, Number(e.target.value))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur();
                              }}
                              className="w-10 text-center bg-transparent font-bold font-mono tabular-nums text-xs text-slate-900 focus:outline-none focus:bg-blue-50/60 rounded"
                            />
                          </td>
                          {semesterMonths.map((m, mIdx) =>
                            [1, 2, 3, 4].map((w) => {
                              const flatIdx = mIdx * 4 + (w - 1);
                              const isActive = group.activeWeeks[flatIdx];
                              return (
                                <td
                                  key={`${m.full}-${w}`}
                                  onClick={() => handleToggleWeekSlot(group, m.full, w)}
                                  title={`${group.topic} · ${m.full} Minggu ${w}`}
                                  className="border border-slate-400 text-center cursor-pointer select-none hover:bg-blue-50 transition-colors p-0 h-8 w-6"
                                >
                                  {isActive ? (
                                    <span className="inline-flex items-center justify-center text-[#1D4ED8] font-bold">
                                      <Check className="w-3.5 h-3.5 stroke-[2.75]" />
                                    </span>
                                  ) : null}
                                </td>
                              );
                            })
                          )}
                          <td className="border border-slate-400 text-center no-print">
                            <button
                              type="button"
                              onClick={() => handleDeleteMatrixRow(group)}
                              title="Hapus baris materi"
                              className="p-1 text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}

                      {/* Baris Total Alokasi JP */}
                      <tr className="bg-slate-50/70">
                        <td
                          colSpan={2}
                          className="border border-slate-400 px-3 py-2 text-right font-bold text-slate-900"
                        >
                          Total Alokasi JP Semester {semesterLabel}
                        </td>
                        <td className="border border-slate-400 px-2 py-2 text-center font-bold font-mono tabular-nums text-slate-900 whitespace-nowrap">
                          {totalSemesterJp} JP
                        </td>
                        <td colSpan={24} className="border border-slate-400 px-3 py-2 text-[11px] text-slate-600">
                          Distribusi pekan efektif: {semesterMonths.map((m) => m.short).join(' — ')}
                        </td>
                        <td className="border border-slate-400 no-print" />
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Section A. Kalender Evaluasi Semester */}
            <div className="space-y-2.5 pt-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm md:text-[15px] font-bold text-slate-900">
                  A. Kalender Evaluasi Semester
                </h3>
                <button
                  type="button"
                  onClick={handleAddEvalRow}
                  className="px-2.5 py-1 rounded border border-slate-300 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1 no-print"
                >
                  <Plus className="w-3 h-3" />
                  <span>Tambah Evaluasi</span>
                </button>
              </div>

              <table className="w-full border-collapse border border-slate-400 text-xs">
                <thead>
                  <tr className="bg-[#DCE6F2] text-slate-900 font-bold text-left">
                    <th className="border border-slate-400 px-3 py-2 w-32">Periode</th>
                    <th className="border border-slate-400 px-3 py-2 w-56">Jenis Evaluasi</th>
                    <th className="border border-slate-400 px-3 py-2 w-28">Status</th>
                    <th className="border border-slate-400 px-3 py-2">Materi Esensial</th>
                    <th className="border border-slate-400 px-2 py-2 w-10 text-center no-print">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluationCalendar.map((ev, idx) => (
                    <tr key={idx}>
                      <td className="border border-slate-400 px-2 py-1.5">
                        <input
                          type="text"
                          defaultValue={ev.period}
                          onBlur={(e) => handleEvalChange(idx, 'period', e.target.value)}
                          className="w-full bg-transparent text-xs text-slate-900 focus:outline-none focus:bg-blue-50/60 px-1 py-0.5 rounded"
                        />
                      </td>
                      <td className="border border-slate-400 px-2 py-1.5">
                        <input
                          type="text"
                          defaultValue={ev.evaluationType}
                          onBlur={(e) => handleEvalChange(idx, 'evaluationType', e.target.value)}
                          className="w-full bg-transparent text-xs text-slate-900 focus:outline-none focus:bg-blue-50/60 px-1 py-0.5 rounded"
                        />
                      </td>
                      <td className="border border-slate-400 px-2 py-1.5">
                        <select
                          value={ev.status}
                          onChange={(e) => handleEvalChange(idx, 'status', e.target.value)}
                          className="w-full bg-transparent text-xs font-semibold text-slate-800 focus:outline-none"
                        >
                          <option value="DRAF">DRAF</option>
                          <option value="FINAL">FINAL</option>
                          <option value="TERLAKSANA">TERLAKSANA</option>
                        </select>
                      </td>
                      <td className="border border-slate-400 px-2 py-1.5">
                        <input
                          type="text"
                          defaultValue={ev.essentialMaterial}
                          onBlur={(e) => handleEvalChange(idx, 'essentialMaterial', e.target.value)}
                          className="w-full bg-transparent text-xs text-slate-900 focus:outline-none focus:bg-blue-50/60 px-1 py-0.5 rounded"
                        />
                      </td>
                      <td className="border border-slate-400 text-center no-print">
                        <button
                          type="button"
                          onClick={() => handleDeleteEvalRow(idx)}
                          className="p-1 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Blok Pengesahan / Tanda Tangan */}
            <div className="grid grid-cols-2 gap-8 pt-8 text-xs md:text-[13px] text-slate-900">
              <div>
                <p>Mengetahui,</p>
                <p className="font-bold">Kepala {schoolName},</p>
                <div className="h-16" />
                <p className="font-bold underline">{principalName}</p>
                <p className="text-[11px] text-slate-600">NIP. {activeSchool?.principalNip || '-'}</p>
              </div>
              <div>
                {editingTitiMangsa ? (
                  <input
                    type="text"
                    autoFocus
                    maxLength={120}
                    value={titiMangsaDraft}
                    onChange={(e) => setTitiMangsaDraft(e.target.value)}
                    onBlur={commitProsemTitiMangsa}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitProsemTitiMangsa();
                      } else if (e.key === 'Escape') {
                        setTitiMangsaDraft(resolvedProsemTitiMangsa);
                        setEditingTitiMangsa(false);
                      }
                    }}
                    placeholder="Contoh: Tasikmalaya, .......................... 20...."
                    className="w-full max-w-[300px] px-2 py-0.5 border border-blue-400 rounded text-xs bg-blue-50/40 text-slate-900 focus:outline-none no-print"
                  />
                ) : (
                  <p
                    onClick={() => {
                      if (activeSchool?.id) {
                        setTitiMangsaDraft(activeSchool.titiMangsa || resolvedProsemTitiMangsa);
                        setEditingTitiMangsa(true);
                      }
                    }}
                    title={activeSchool?.id ? 'Klik untuk edit titi mangsa (kota & tanggal)' : undefined}
                    className={
                      activeSchool?.id
                        ? 'group inline-flex items-center gap-1.5 cursor-pointer hover:text-blue-800 rounded px-1 -mx-1 hover:bg-blue-50/70 transition-colors'
                        : undefined
                    }
                  >
                    <span>{resolvedProsemTitiMangsa}</span>
                    {activeSchool?.id && (
                      <Pencil className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 no-print shrink-0" />
                    )}
                  </p>
                )}
                <p className="font-bold">Guru Mata Pelajaran {subjectName},</p>
                <div className="h-16 flex items-center">
                  {profile?.signatureDataUrl && (
                    <img
                      src={profile.signatureDataUrl}
                      alt="Tanda tangan guru"
                      className="h-14 object-contain"
                    />
                  )}
                </div>
                <p className="font-bold underline">{teacherName}</p>
                <p className="text-[11px] text-slate-600">NIP. {teacherNip}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View 2: Checklist Pelaksanaan Bulanan */}
      {prosemTab === 'checklist' && (
        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
          {filteredChecklistItems.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">
              Belum ada jadwal pertemuan PROSEM pada Semester {semesterLabel}. Klik Susun PROSEM Otomatis atau tambah baris di Matriks PROSEM.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                  <th className="py-2 pr-3">Checklist</th>
                  <th className="py-2 px-3">Bulan / Minggu</th>
                  <th className="py-2 px-3">Pertemuan</th>
                  <th className="py-2 px-3">Materi & Submateri</th>
                  <th className="py-2 px-3">JP</th>
                  <th className="py-2 px-3">Status Realisasi</th>
                  <th className="py-2 px-3">Tgl Pelaksanaan</th>
                  <th className="py-2 pl-3">Catatan Guru</th>
                  <th className="py-2 pl-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredChecklistItems.map((item) => {
                  const isDone = item.executionStatus === 'selesai';
                  return (
                    <tr key={item.id}>
                      <td className="py-3 pr-3">
                        <button
                          type="button"
                          onClick={() => item.id && toggleChecklistStatus(item.id, isDone ? 'belum' : 'selesai')}
                          aria-label="Tandai selesai"
                          className="p-1 text-blue-700 dark:text-sky-400"
                        >
                          {isDone ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-slate-400" />}
                        </button>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <p className="font-semibold text-slate-900 dark:text-white text-xs">
                          {normalizeMonthName(item.month)}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono">
                          Minggu {clampWeek(item.weekNumber)} · {semesterLabel}
                        </p>
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-xs">
                        Ke-{item.meetingNumber}
                      </td>
                      <td className="py-3 px-3 min-w-[200px]">
                        <p
                          className={`font-semibold text-xs ${
                            isDone ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {item.topic}
                        </p>
                        {item.subtopic && <p className="text-[11px] text-slate-500">{item.subtopic}</p>}
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-xs">{item.jpAllocation} JP</td>
                      <td className="py-3 px-3">
                        <select
                          value={item.executionStatus}
                          onChange={(e) =>
                            item.id && toggleChecklistStatus(item.id, e.target.value as ProsemExecutionStatus)
                          }
                          className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                        >
                          <option value="belum">Belum dilaksanakan</option>
                          <option value="berlangsung">Sedang berlangsung</option>
                          <option value="selesai">Selesai</option>
                          <option value="ditunda">Ditunda</option>
                          <option value="penyesuaian">Perlu penyesuaian</option>
                        </select>
                      </td>
                      <td className="py-3 px-3">
                        <input
                          type="date"
                          value={item.executionDate || ''}
                          onChange={(e) =>
                            item.id && updateRecord('prosem_items', item.id, { executionDate: e.target.value })
                          }
                          className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                        />
                      </td>
                      <td className="py-3 pl-3 min-w-[160px]">
                        <input
                          type="text"
                          defaultValue={item.teacherNotes || ''}
                          placeholder="Catatan realisasi..."
                          onBlur={(e) =>
                            item.id && updateRecord('prosem_items', item.id, { teacherNotes: e.target.value })
                          }
                          className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                        />
                      </td>
                      <td className="py-3 pl-2">
                        <button
                          onClick={() => handleDeleteChecklistItem(item)}
                          className="text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};
