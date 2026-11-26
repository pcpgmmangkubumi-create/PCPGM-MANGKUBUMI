export const SEMESTER_1_MONTH_NAMES = [
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

export const SEMESTER_2_MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
] as const;

export interface ReconciledProtaRow {
  semester: 'Semester 1' | 'Semester 2';
  element: string;
  tpCode: string;
  tpDescription: string;
  topic: string;
  jpAllocation: number;
  timeDistribution: string;
}

export interface ReconciledProsemItem {
  id?: string;
  semester: 'Semester 1' | 'Semester 2';
  month: string;
  weekNumber: number;
  meetingNumber: number;
  tpCode: string;
  topic: string;
  subtopic: string;
  jpAllocation: number;
  plannedDate: string;
  executionStatus: 'belum' | 'berlangsung' | 'selesai' | 'ditunda' | 'penyesuaian';
  executionDate: string;
  teacherNotes: string;
}

export interface ProtaProsemParitySummary {
  protaSem1Jp: number;
  protaSem2Jp: number;
  protaTotalJp: number;
  prosemSem1Jp: number;
  prosemSem2Jp: number;
  prosemTotalJp: number;
  diffSem1: number;
  diffSem2: number;
  diffTotal: number;
  isSem1Matched: boolean;
  isSem2Matched: boolean;
  isTotalMatched: boolean;
  mismatchedTopics: string[];
  isFullyMatched: boolean;
}

export function normalizeProsemMonthName(raw?: string, fallbackSemester: 'Semester 1' | 'Semester 2' = 'Semester 1'): string {
  const val = (raw || '').trim().toLowerCase();
  if (val.includes('jul')) return 'Juli';
  if (val.includes('agu') || val.includes('aug')) return 'Agustus';
  if (val.includes('sep')) return 'September';
  if (val.includes('okt') || val.includes('oct')) return 'Oktober';
  if (val.includes('nov')) return 'November';
  if (val.includes('des') || val.includes('dec')) return 'Desember';
  if (val.includes('jan')) return 'Januari';
  if (val.includes('feb')) return 'Februari';
  if (val.includes('mar')) return 'Maret';
  if (val.includes('apr')) return 'April';
  if (val.includes('mei') || val.includes('may')) return 'Mei';
  if (val.includes('jun')) return 'Juni';
  return fallbackSemester === 'Semester 2' ? 'Januari' : 'Juli';
}

export function normalizeAcademicSemester(raw?: string, monthOrRange?: string): 'Semester 1' | 'Semester 2' {
  const s = (raw || '').trim().toLowerCase();
  if (s.includes('2') || s.includes('genap')) return 'Semester 2';
  if (s.includes('1') || s.includes('ganjil')) return 'Semester 1';

  const hint = (monthOrRange || '').trim().toLowerCase();
  if (
    hint.includes('jan') ||
    hint.includes('feb') ||
    hint.includes('mar') ||
    hint.includes('apr') ||
    hint.includes('mei') ||
    hint.includes('may') ||
    hint.includes('jun')
  ) {
    return 'Semester 2';
  }
  return 'Semester 1';
}

export function clampProsemWeek(week?: number): number {
  const n = Math.round(Number(week || 1));
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 4) return 4;
  return n;
}

function monthForSemester(rawMonth: string | undefined, semester: 'Semester 1' | 'Semester 2'): string {
  const normalized = normalizeProsemMonthName(rawMonth, semester);
  if (semester === 'Semester 1') {
    if ((SEMESTER_1_MONTH_NAMES as readonly string[]).includes(normalized)) return normalized;
    const idx = (SEMESTER_2_MONTH_NAMES as readonly string[]).indexOf(normalized);
    return SEMESTER_1_MONTH_NAMES[idx >= 0 ? idx : 0];
  }
  if ((SEMESTER_2_MONTH_NAMES as readonly string[]).includes(normalized)) return normalized;
  const idx = (SEMESTER_1_MONTH_NAMES as readonly string[]).indexOf(normalized);
  return SEMESTER_2_MONTH_NAMES[idx >= 0 ? idx : 0];
}

function getMonthSortOrder(month: string, semester: 'Semester 1' | 'Semester 2'): number {
  const list = semester === 'Semester 1' ? SEMESTER_1_MONTH_NAMES : SEMESTER_2_MONTH_NAMES;
  const idx = (list as readonly string[]).indexOf(monthForSemester(month, semester));
  return idx >= 0 ? idx : 0;
}

function extractMonthsFromRange(rangeText: string | undefined, semester: 'Semester 1' | 'Semester 2'): string[] {
  const list = semester === 'Semester 1' ? SEMESTER_1_MONTH_NAMES : SEMESTER_2_MONTH_NAMES;
  const text = (rangeText || '').toLowerCase();
  const matchedIndices: number[] = [];

  const tokens: Array<[string[], number]> =
    semester === 'Semester 1'
      ? [
          [['jul'], 0],
          [['agu', 'aug'], 1],
          [['sep'], 2],
          [['okt', 'oct'], 3],
          [['nov'], 4],
          [['des', 'dec'], 5],
        ]
      : [
          [['jan'], 0],
          [['feb'], 1],
          [['mar'], 2],
          [['apr'], 3],
          [['mei', 'may'], 4],
          [['jun'], 5],
        ];

  for (const [patterns, idx] of tokens) {
    if (patterns.some((p) => text.includes(p))) {
      matchedIndices.push(idx);
    }
  }

  if (matchedIndices.length === 0) return [...list];
  const minIdx = Math.min(...matchedIndices);
  const maxIdx = Math.max(...matchedIndices);
  return list.slice(minIdx, maxIdx + 1);
}

export function normTopicKey(raw?: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/^(bab|unit|tema|materi|modul)\s*\d*\s*[:.-]?\s*/i, '')
    .replace(/[^a-z0-9\u00c0-\u024f]+/g, ' ')
    .trim();
}

function normTpKey(raw?: string): string {
  return (raw || '').toLowerCase().replace(/\s+/g, '').trim();
}

function distributeIntegerTotal(total: number, count: number): number[] {
  if (count <= 0) return [];
  const safeTotal = Math.max(0, Math.round(total));
  const base = Math.floor(safeTotal / count);
  const rem = safeTotal % count;
  return Array.from({ length: count }, (_, idx) => base + (idx < rem ? 1 : 0));
}

export function reconcileProtaAndProsem(params: {
  protaRows: any[];
  prosemItems: any[];
  jpPerWeek?: number;
  recommendedJpPerMeeting?: number;
  defaultSubject?: string;
}): {
  protaRows: ReconciledProtaRow[];
  prosemItems: ReconciledProsemItem[];
  totalJpYear: number;
  sem1Jp: number;
  sem2Jp: number;
} {
  const rawProta = Array.isArray(params.protaRows) ? params.protaRows : [];
  const rawProsem = Array.isArray(params.prosemItems) ? params.prosemItems : [];
  const defaultSlotJp = Math.max(
    1,
    Math.min(10, Math.round(Number(params.recommendedJpPerMeeting || params.jpPerWeek || 2)))
  );

  const normalizedProta: ReconciledProtaRow[] = rawProta.map((row, idx) => {
    const semester = normalizeAcademicSemester(row?.semester, row?.timeDistribution);
    const topic = String(row?.topic || params.defaultSubject || `Materi Pokok ${idx + 1}`)
      .trim()
      .slice(0, 250) || `Materi Pokok ${idx + 1}`;
    const tpCode = String(row?.tpCode || `TP-${idx + 1}`).trim().slice(0, 50) || `TP-${idx + 1}`;
    const jpAllocation = Math.max(0, Math.round(Number(row?.jpAllocation || 0)));
    const defaultRange = semester === 'Semester 1' ? 'Juli - Desember' : 'Januari - Juni';
    return {
      semester,
      element: String(row?.element || 'Capaian Pembelajaran').trim() || 'Capaian Pembelajaran',
      tpCode,
      tpDescription: String(row?.tpDescription || topic).trim() || topic,
      topic,
      jpAllocation,
      timeDistribution: String(row?.timeDistribution || defaultRange).trim() || defaultRange,
    };
  });

  // Track which existing PROSEM items have already been claimed by a PROTA row
  const claimedIndices = new Set<number>();

  const normalizedPool = rawProsem.map((item, index) => {
    const sem = normalizeAcademicSemester(item?.semester, item?.month);
    const month = monthForSemester(item?.month, sem);
    const weekNumber = clampProsemWeek(item?.weekNumber);
    const statusRaw = String(item?.executionStatus || 'belum');
    const validStatus: ReconciledProsemItem['executionStatus'] =
      statusRaw === 'berlangsung' ||
      statusRaw === 'selesai' ||
      statusRaw === 'ditunda' ||
      statusRaw === 'penyesuaian'
        ? statusRaw
        : 'belum';
    return {
      index,
      id: typeof item?.id === 'string' && item.id ? item.id : undefined,
      semester: sem,
      month,
      weekNumber,
      meetingNumber: Math.max(1, Math.round(Number(item?.meetingNumber || index + 1))),
      tpCode: String(item?.tpCode || '').trim().slice(0, 50),
      topic: String(item?.topic || '').trim().slice(0, 250),
      subtopic: String(item?.subtopic || '').trim().slice(0, 250),
      jpAllocation: Math.max(0, Math.round(Number(item?.jpAllocation || 0))),
      plannedDate: String(item?.plannedDate || `${month} Minggu ${weekNumber}`).trim().slice(0, 40) || '-',
      executionStatus: validStatus,
      executionDate: String(item?.executionDate || '').trim().slice(0, 40),
      teacherNotes: String(item?.teacherNotes || '').trim().slice(0, 1000),
    };
  });

  // Pre-compute topic frequency per semester so duplicate topics match by tpCode first
  const duplicateTopicSet = new Set<string>();
  const topicCounts = new Map<string, number>();
  for (const r of normalizedProta) {
    const k = `${r.semester}::${normTopicKey(r.topic)}`;
    topicCounts.set(k, (topicCounts.get(k) || 0) + 1);
  }
  for (const [k, cnt] of topicCounts.entries()) {
    if (cnt > 1) duplicateTopicSet.add(k);
  }

  const matchedPoolsByRow: Array<typeof normalizedPool> = normalizedProta.map(() => []);

  // Pass 1: Strict match (semester + exact topic AND/OR exact tpCode)
  normalizedProta.forEach((row, rIdx) => {
    const rowTopicNorm = normTopicKey(row.topic);
    const rowTopicExact = row.topic.trim().toLowerCase();
    const rowTpNorm = normTpKey(row.tpCode);
    const hasDupTopic = duplicateTopicSet.has(`${row.semester}::${rowTopicNorm}`);

    for (const item of normalizedPool) {
      if (claimedIndices.has(item.index) || item.semester !== row.semester) continue;
      const itemTopicExact = item.topic.trim().toLowerCase();
      const itemTopicNorm = normTopicKey(item.topic);
      const itemTpNorm = normTpKey(item.tpCode);

      const topicMatches =
        itemTopicExact === rowTopicExact || (rowTopicNorm.length > 0 && itemTopicNorm === rowTopicNorm);
      const tpMatches = rowTpNorm.length > 0 && itemTpNorm === rowTpNorm;

      if (hasDupTopic ? topicMatches && tpMatches : topicMatches || tpMatches) {
        claimedIndices.add(item.index);
        matchedPoolsByRow[rIdx].push(item);
      }
    }
  });

  // Pass 2: Fuzzy substring fallback for any unclaimed items whose topic overlaps a PROTA row without items
  normalizedProta.forEach((row, rIdx) => {
    if (matchedPoolsByRow[rIdx].length > 0) return;
    const rowTopicNorm = normTopicKey(row.topic);
    if (!rowTopicNorm) return;

    for (const item of normalizedPool) {
      if (claimedIndices.has(item.index) || item.semester !== row.semester) continue;
      const itemTopicNorm = normTopicKey(item.topic);
      if (
        itemTopicNorm &&
        (itemTopicNorm.includes(rowTopicNorm) || rowTopicNorm.includes(itemTopicNorm))
      ) {
        claimedIndices.add(item.index);
        matchedPoolsByRow[rIdx].push(item);
      }
    }
  });

  // Pass 3: Reconcile each row's matched items so sum(jpAllocation) === row.jpAllocation
  const reconciledItems: ReconciledProsemItem[] = [];
  const semRowCursor: Record<'Semester 1' | 'Semester 2', number> = {
    'Semester 1': 0,
    'Semester 2': 0,
  };

  normalizedProta.forEach((row, rIdx) => {
    const rowSemesterIdx = semRowCursor[row.semester]++;
    const targetJp = row.jpAllocation;
    let pool = matchedPoolsByRow[rIdx].sort((a, b) => {
      const mDiff = getMonthSortOrder(a.month, row.semester) - getMonthSortOrder(b.month, row.semester);
      if (mDiff !== 0) return mDiff;
      if (a.weekNumber !== b.weekNumber) return a.weekNumber - b.weekNumber;
      return a.meetingNumber - b.meetingNumber;
    });

    if (targetJp === 0) {
      // Keep zero allocation cleanly: no positive JP items
      return;
    }

    const rowMonths = extractMonthsFromRange(row.timeDistribution, row.semester);
    const minSlotsNeeded = Math.max(1, Math.ceil(targetJp / 100));

    if (pool.length === 0) {
      const desiredSlots = Math.max(minSlotsNeeded, Math.ceil(targetJp / defaultSlotJp));
      for (let i = 0; i < desiredSlots; i++) {
        const month = rowMonths[Math.min(rowMonths.length - 1, Math.floor((i * rowMonths.length) / desiredSlots))];
        const weekNumber = clampProsemWeek(((i + rowSemesterIdx) % 4) + 1);
        pool.push({
          index: -1,
          id: undefined,
          semester: row.semester,
          month,
          weekNumber,
          meetingNumber: i + 1,
          tpCode: row.tpCode,
          topic: row.topic,
          subtopic: `${row.topic} — Pertemuan ${i + 1}`.slice(0, 250),
          jpAllocation: defaultSlotJp,
          plannedDate: `${month} Minggu ${weekNumber}`.slice(0, 40),
          executionStatus: 'belum',
          executionDate: '',
          teacherNotes: '',
        });
      }
    } else if (pool.length < minSlotsNeeded) {
      while (pool.length < minSlotsNeeded) {
        const last = pool[pool.length - 1];
        const nextWeek = clampProsemWeek((last.weekNumber % 4) + 1);
        const nextMonth =
          last.weekNumber >= 4
            ? rowMonths[Math.min(rowMonths.length - 1, rowMonths.indexOf(last.month) + 1)] || last.month
            : last.month;
        pool.push({
          ...last,
          index: -1,
          id: undefined,
          month: nextMonth,
          weekNumber: nextWeek,
          executionStatus: 'belum',
          executionDate: '',
          teacherNotes: '',
          plannedDate: `${nextMonth} Minggu ${nextWeek}`.slice(0, 40),
        });
      }
    } else if (pool.length > targetJp) {
      // Trim down to targetJp slots so every meeting stays >= 1 JP; preserve completed items first
      const sortedKeepPriority = [...pool].sort((a, b) => {
        const score = (s: ReconciledProsemItem['executionStatus']) =>
          s === 'selesai' ? 2 : s === 'berlangsung' ? 1 : 0;
        return score(b.executionStatus) - score(a.executionStatus);
      });
      const keptSet = new Set(sortedKeepPriority.slice(0, targetJp));
      pool = pool.filter((item) => keptSet.has(item));
    }

    const currentSum = pool.reduce((sum, it) => sum + it.jpAllocation, 0);
    const allWithinValidBounds = pool.every((it) => it.jpAllocation >= 1 && it.jpAllocation <= 100);
    const allocations =
      currentSum === targetJp && allWithinValidBounds
        ? pool.map((it) => it.jpAllocation)
        : distributeIntegerTotal(targetJp, pool.length);

    pool.forEach((it, idx) => {
      reconciledItems.push({
        ...(it.id ? { id: it.id } : {}),
        semester: row.semester,
        month: monthForSemester(it.month, row.semester),
        weekNumber: clampProsemWeek(it.weekNumber),
        meetingNumber: it.meetingNumber,
        tpCode: row.tpCode,
        topic: row.topic,
        subtopic: it.subtopic,
        jpAllocation: allocations[idx],
        plannedDate: (it.plannedDate || `${it.month} Minggu ${it.weekNumber}`).slice(0, 40),
        executionStatus: it.executionStatus,
        executionDate: it.executionDate,
        teacherNotes: it.teacherNotes,
      });
    });
  });

  // Sort chronologically across Semester 1 -> Semester 2 and re-number meetings sequentially
  reconciledItems.sort((a, b) => {
    if (a.semester !== b.semester) return a.semester === 'Semester 1' ? -1 : 1;
    const mDiff = getMonthSortOrder(a.month, a.semester) - getMonthSortOrder(b.month, b.semester);
    if (mDiff !== 0) return mDiff;
    if (a.weekNumber !== b.weekNumber) return a.weekNumber - b.weekNumber;
    return a.meetingNumber - b.meetingNumber;
  });

  reconciledItems.forEach((item, idx) => {
    item.meetingNumber = idx + 1;
  });

  const sem1Jp = normalizedProta
    .filter((r) => r.semester === 'Semester 1')
    .reduce((sum, r) => sum + r.jpAllocation, 0);
  const sem2Jp = normalizedProta
    .filter((r) => r.semester === 'Semester 2')
    .reduce((sum, r) => sum + r.jpAllocation, 0);

  return {
    protaRows: normalizedProta,
    prosemItems: reconciledItems,
    totalJpYear: sem1Jp + sem2Jp,
    sem1Jp,
    sem2Jp,
  };
}

export function computeProtaProsemParity(params: {
  protaRows: any[];
  prosemItems: any[];
}): ProtaProsemParitySummary {
  const protaRows = Array.isArray(params.protaRows) ? params.protaRows : [];
  const prosemItems = Array.isArray(params.prosemItems) ? params.prosemItems : [];

  let protaSem1Jp = 0;
  let protaSem2Jp = 0;
  const protaTopicMap = new Map<string, { label: string; jp: number }>();

  for (const r of protaRows) {
    const sem = normalizeAcademicSemester(r?.semester, r?.timeDistribution);
    const jp = Math.max(0, Math.round(Number(r?.jpAllocation || 0)));
    if (sem === 'Semester 1') protaSem1Jp += jp;
    else protaSem2Jp += jp;

    const label = String(r?.topic || '').trim();
    const key = `${sem}::${label.toLowerCase()}`;
    const prev = protaTopicMap.get(key);
    protaTopicMap.set(key, { label: prev?.label || label, jp: (prev?.jp || 0) + jp });
  }

  let prosemSem1Jp = 0;
  let prosemSem2Jp = 0;
  const prosemTopicMap = new Map<string, { label: string; jp: number }>();

  for (const it of prosemItems) {
    const sem = normalizeAcademicSemester(it?.semester, it?.month);
    const jp = Math.max(0, Math.round(Number(it?.jpAllocation || 0)));
    if (sem === 'Semester 1') prosemSem1Jp += jp;
    else prosemSem2Jp += jp;

    const label = String(it?.topic || '').trim();
    const key = `${sem}::${label.toLowerCase()}`;
    const prev = prosemTopicMap.get(key);
    prosemTopicMap.set(key, { label: prev?.label || label, jp: (prev?.jp || 0) + jp });
  }

  const mismatchedTopics: string[] = [];
  const allTopicKeys = new Set([...protaTopicMap.keys(), ...prosemTopicMap.keys()]);
  for (const key of allTopicKeys) {
    const a = protaTopicMap.get(key);
    const b = prosemTopicMap.get(key);
    if ((a?.jp || 0) !== (b?.jp || 0)) {
      const semPrefix = key.startsWith('Semester 1') ? 'Smt 1' : 'Smt 2';
      mismatchedTopics.push(`${semPrefix}: ${a?.label || b?.label || '-'}`);
    }
  }

  const protaTotalJp = protaSem1Jp + protaSem2Jp;
  const prosemTotalJp = prosemSem1Jp + prosemSem2Jp;
  const diffSem1 = prosemSem1Jp - protaSem1Jp;
  const diffSem2 = prosemSem2Jp - protaSem2Jp;
  const diffTotal = prosemTotalJp - protaTotalJp;

  const isSem1Matched = diffSem1 === 0;
  const isSem2Matched = diffSem2 === 0;
  const isTotalMatched = diffTotal === 0;

  return {
    protaSem1Jp,
    protaSem2Jp,
    protaTotalJp,
    prosemSem1Jp,
    prosemSem2Jp,
    prosemTotalJp,
    diffSem1,
    diffSem2,
    diffTotal,
    isSem1Matched,
    isSem2Matched,
    isTotalMatched,
    mismatchedTopics,
    isFullyMatched: isSem1Matched && isSem2Matched && isTotalMatched && mismatchedTopics.length === 0,
  };
}
