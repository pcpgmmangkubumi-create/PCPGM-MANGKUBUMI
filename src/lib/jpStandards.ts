export type InstitutionTrack = 'umum' | 'madrasah';

export interface OfficialJpStandard {
  jpPerWeek: number;
  p5JpPerWeek: number;
  totalWeeklyJp: number;
  recommendedJpPerMeeting: number;
  minutesPerJp: number;
  effectiveWeeksPerYear: number;
  semester1Weeks: number;
  semester2Weeks: number;
  annualIntrakurikulerJp: number;
  annualP5Jp: number;
  annualTotalJp: number;
  semester1Jp: number;
  semester2Jp: number;
  regulationRef: string;
  institutionTrack: InstitutionTrack;
  matchedSubjectLabel: string;
  notes: string;
}

const KMA_SUBJECT_KEYWORDS = [
  'quran',
  "qur'an",
  'al-qur',
  'hadis',
  'hadits',
  'akidah',
  'aqidah',
  'akhlak',
  'fikih',
  'fiqih',
  'kebudayaan islam',
  'ski',
  'bahasa arab',
  'b. arab',
  'ilmu tafsir',
  'ilmu hadis',
  'ushul fikih',
  'ushul fiqih',
  'ilmu kalam',
  'tasawuf',
  'nahwu',
  'sharaf',
  'raudhatul athfal',
];

export function isKmaReligiousSubject(subject?: string): boolean {
  const s = (subject || '').toLowerCase().trim();
  if (!s) return false;
  return KMA_SUBJECT_KEYWORDS.some((kw) => s.includes(kw));
}

export function detectInstitutionTrack(params: {
  schoolName?: string;
  level?: string;
  grade?: string;
  subject?: string;
  preferredTrack?: InstitutionTrack;
}): InstitutionTrack {
  if (params.preferredTrack === 'madrasah' || params.preferredTrack === 'umum') {
    return params.preferredTrack;
  }
  if (isKmaReligiousSubject(params.subject)) {
    return 'madrasah';
  }
  const school = (params.schoolName || '').toLowerCase();
  const grade = (params.grade || '').toLowerCase();
  if (
    /\b(madrasah|raudhatul athfal|min\s+\d|mtsn?|man\s+\d|mas\s|mak\s|mi\s+[a-z0-9]|ma\s+[a-z0-9]|ra\s+[a-z0-9])\b/i.test(
      `${school} ${grade}`
    ) ||
    school.includes('madrasah')
  ) {
    return 'madrasah';
  }
  return 'umum';
}

export function normalizeCurriculumKind(curriculum?: string): 'K13' | 'KM' {
  const raw = (curriculum || '').toLowerCase();
  if (
    raw.includes('k-13') ||
    raw.includes('k13') ||
    raw.includes('2013') ||
    raw.includes('ktsp')
  ) {
    return 'K13';
  }
  return 'KM';
}

export function detectNormalizedLevel(
  level?: string,
  grade?: string
): 'PAUD' | 'SD' | 'SMP' | 'SMA' | 'SMK' | 'SLB' {
  const lvl = (level || '').toUpperCase();
  const gr = (grade || '').toUpperCase();
  if (lvl.includes('PAUD') || lvl.includes('TK') || lvl.includes('RA') || /\b(KB|TK|PAUD|RA)\b/.test(gr)) {
    return 'PAUD';
  }
  if (lvl.includes('SMK') || lvl.includes('MAK')) return 'SMK';
  if (lvl.includes('SMA') || lvl.includes('MA') || lvl.includes('SMALB')) return 'SMA';
  if (lvl.includes('SMP') || lvl.includes('MTS') || lvl.includes('SMPLB')) return 'SMP';
  if (lvl.includes('SD') || lvl.includes('MI') || lvl.includes('SDLB')) return 'SD';
  if (lvl.includes('SLB')) return 'SLB';
  if (/\b(XII|XI|X)\b/.test(gr) || /\b(10|11|12|13)\b/.test(gr)) return 'SMA';
  if (/\b(IX|VIII|VII)\b/.test(gr) || /\b(7|8|9)\b/.test(gr)) return 'SMP';
  if (/\b(VI|V|IV|III|II|I)\b/.test(gr) || /\b[1-6]\b/.test(gr)) return 'SD';
  return 'SMP';
}

export function getMinutesPerJp(level?: string, grade?: string): number {
  const lvl = (level || '').toUpperCase();
  const gr = (grade || '').toUpperCase();

  if (lvl.includes('SLB')) {
    if (gr.includes('SDLB') || /\b(I|II|III|IV|V|VI|[1-6])\b/.test(gr)) return 35;
    if (gr.includes('SMALB') || /\b(X|XI|XII|10|11|12)\b/.test(gr)) return 45;
    return 40;
  }

  const detected = detectNormalizedLevel(level, grade);
  switch (detected) {
    case 'PAUD':
      return 30;
    case 'SD':
      return 35;
    case 'SMP':
      return 40;
    case 'SMA':
    case 'SMK':
      return 45;
    default:
      return 40;
  }
}

export function detectGradeNumber(grade?: string): number {
  const raw = (grade || '').toUpperCase();
  if (/\bXIII\b|\b13\b/.test(raw)) return 13;
  if (/\bXII\b|\b12\b/.test(raw)) return 12;
  if (/\bXI\b|\b11\b/.test(raw)) return 11;
  if (/\bX\b|\b10\b/.test(raw)) return 10;
  if (/\bIX\b|\b9\b/.test(raw)) return 9;
  if (/\bVIII\b|\b8\b/.test(raw)) return 8;
  if (/\bVII\b|\b7\b/.test(raw)) return 7;
  if (/\bVI\b|\b6\b/.test(raw)) return 6;
  if (/\bIV\b|\b4\b/.test(raw)) return 4;
  if (/\bV\b|\b5\b/.test(raw)) return 5;
  if (/\bIII\b|\b3\b/.test(raw)) return 3;
  if (/\bII\b|\b2\b/.test(raw)) return 2;
  if (/\bI\b|\b1\b/.test(raw)) return 1;
  return 0;
}

export function getEffectiveWeeks(
  level?: string,
  grade?: string
): { annualWeeks: number; semester1Weeks: number; semester2Weeks: number; isFinalGrade: boolean } {
  const detected = detectNormalizedLevel(level, grade);
  const gNum = detectGradeNumber(grade);
  const isFinalGrade =
    (detected === 'SD' && gNum === 6) ||
    (detected === 'SMP' && gNum === 9) ||
    (detected === 'SMA' && gNum === 12) ||
    (detected === 'SMK' && (gNum === 12 || gNum === 13)) ||
    (detected === 'SLB' && (gNum === 6 || gNum === 9 || gNum === 12));

  if (isFinalGrade) {
    return { annualWeeks: 32, semester1Weeks: 18, semester2Weeks: 14, isFinalGrade: true };
  }
  return { annualWeeks: 36, semester1Weeks: 18, semester2Weeks: 18, isFinalGrade: false };
}

function recommendedMeetingJp(jpPerWeek: number, levelKind: 'PAUD' | 'SD' | 'SMP' | 'SMA' | 'SMK' | 'SLB'): number {
  if (levelKind === 'PAUD') return 5;
  if (jpPerWeek <= 1) return 1;
  if (jpPerWeek === 2) return 2;
  if (jpPerWeek === 3) return 3;
  if (jpPerWeek === 4) return 2;
  if (jpPerWeek === 5) return levelKind === 'SMA' || levelKind === 'SMK' ? 3 : 2;
  if (jpPerWeek === 6) return 2;
  if (jpPerWeek >= 12) return 4;
  return 2;
}

interface SubjectSpec {
  jpPerWeek: number;
  p5JpPerWeek: number;
  matchedSubjectLabel: string;
  notes: string;
  regulationOverride?: string;
}

function matchKmaSubjectStandard(
  levelKind: 'PAUD' | 'SD' | 'SMP' | 'SMA' | 'SMK' | 'SLB',
  gradeNum: number,
  subjectRaw: string,
  currKind: 'KM' | 'K13'
): SubjectSpec | null {
  const s = (subjectRaw || '').toLowerCase().trim();
  const has = (...terms: string[]) => terms.some((t) => s.includes(t));
  const kmaRef = currKind === 'K13' ? 'KMA No. 183 Tahun 2019 (K-13 Madrasah)' : 'KMA No. 450 Tahun 2024 (KM Madrasah)';

  if (!isKmaReligiousSubject(s)) {
    return null;
  }

  if (levelKind === 'PAUD') {
    return {
      jpPerWeek: 30,
      p5JpPerWeek: 0,
      matchedSubjectLabel: subjectRaw || 'PAI & Bahasa Arab Dasar RA',
      notes: 'Struktur Kurikulum Raudhatul Athfal (RA) minimal 900 menit/minggu (30 JP @ 30 menit).',
      regulationOverride: currKind === 'K13' ? 'KMA No. 792 Tahun 2018 (RA)' : 'KMA No. 450 Tahun 2024 (RA)',
    };
  }

  if (levelKind === 'SD') {
    const g = gradeNum || 4;
    if (has('quran', "qur'an", 'hadis', 'hadits')) {
      return {
        jpPerWeek: 2,
        p5JpPerWeek: 0,
        matchedSubjectLabel: "Al-Qur'an Hadis (MI)",
        notes: `2 JP Intrakurikuler/minggu @ 35 menit untuk MI Kelas ${g} (${kmaRef}).`,
        regulationOverride: kmaRef,
      };
    }
    if (has('akidah', 'aqidah', 'akhlak')) {
      return {
        jpPerWeek: 2,
        p5JpPerWeek: 0,
        matchedSubjectLabel: 'Akidah Akhlak (MI)',
        notes: `2 JP Intrakurikuler/minggu @ 35 menit untuk MI Kelas ${g} (${kmaRef}).`,
        regulationOverride: kmaRef,
      };
    }
    if (has('fikih', 'fiqih')) {
      return {
        jpPerWeek: 2,
        p5JpPerWeek: 0,
        matchedSubjectLabel: 'Fikih (MI)',
        notes: `2 JP Intrakurikuler/minggu @ 35 menit untuk MI Kelas ${g} (${kmaRef}).`,
        regulationOverride: kmaRef,
      };
    }
    if (has('kebudayaan islam', 'ski')) {
      return {
        jpPerWeek: 2,
        p5JpPerWeek: 0,
        matchedSubjectLabel: 'Sejarah Kebudayaan Islam (MI)',
        notes:
          g < 3
            ? `Pada MI, SKI mulai diajarkan secara resmi di Kelas III–VI (2 JP/minggu @ 35 menit sesuai ${kmaRef}).`
            : `2 JP Intrakurikuler/minggu @ 35 menit untuk MI Kelas III–VI (${kmaRef}).`,
        regulationOverride: kmaRef,
      };
    }
    if (has('arab')) {
      return {
        jpPerWeek: 2,
        p5JpPerWeek: 0,
        matchedSubjectLabel: 'Bahasa Arab (MI)',
        notes: `2 JP Intrakurikuler/minggu @ 35 menit untuk MI (${kmaRef}).`,
        regulationOverride: kmaRef,
      };
    }
  }

  if (levelKind === 'SMP') {
    if (has('quran', "qur'an", 'hadis', 'hadits')) {
      return {
        jpPerWeek: 2,
        p5JpPerWeek: 0,
        matchedSubjectLabel: "Al-Qur'an Hadis (MTs)",
        notes: `2 JP Intrakurikuler/minggu @ 40 menit untuk MTs (${kmaRef}).`,
        regulationOverride: kmaRef,
      };
    }
    if (has('akidah', 'aqidah', 'akhlak')) {
      return {
        jpPerWeek: 2,
        p5JpPerWeek: 0,
        matchedSubjectLabel: 'Akidah Akhlak (MTs)',
        notes: `2 JP Intrakurikuler/minggu @ 40 menit untuk MTs (${kmaRef}).`,
        regulationOverride: kmaRef,
      };
    }
    if (has('fikih', 'fiqih')) {
      return {
        jpPerWeek: 2,
        p5JpPerWeek: 0,
        matchedSubjectLabel: 'Fikih (MTs)',
        notes: `2 JP Intrakurikuler/minggu @ 40 menit untuk MTs (${kmaRef}).`,
        regulationOverride: kmaRef,
      };
    }
    if (has('kebudayaan islam', 'ski')) {
      return {
        jpPerWeek: 2,
        p5JpPerWeek: 0,
        matchedSubjectLabel: 'Sejarah Kebudayaan Islam (MTs)',
        notes: `2 JP Intrakurikuler/minggu @ 40 menit untuk MTs (${kmaRef}).`,
        regulationOverride: kmaRef,
      };
    }
    if (has('arab')) {
      return {
        jpPerWeek: 3,
        p5JpPerWeek: 0,
        matchedSubjectLabel: 'Bahasa Arab (MTs)',
        notes: `3 JP Intrakurikuler/minggu @ 40 menit untuk MTs (${kmaRef}).`,
        regulationOverride: kmaRef,
      };
    }
  }

  // SMA / MA / SMK / MAK
  const g = gradeNum || 10;
  if (has('ilmu tafsir', 'ilmu hadis', 'ushul fikih', 'ushul fiqih', 'ilmu kalam', 'tasawuf', 'nahwu', 'sharaf')) {
    const jp = currKind === 'K13' ? (g === 10 ? 3 : 4) : 5;
    return {
      jpPerWeek: jp,
      p5JpPerWeek: 0,
      matchedSubjectLabel: `${subjectRaw} (Peminatan Keagamaan MA)`,
      notes: `${jp} JP/minggu @ 45 menit untuk Mata Pelajaran Pilihan / Peminatan Keagamaan MA (${kmaRef}).`,
      regulationOverride: kmaRef,
    };
  }
  if (has('quran', "qur'an", 'hadis', 'hadits')) {
    return {
      jpPerWeek: 2,
      p5JpPerWeek: 0,
      matchedSubjectLabel: "Al-Qur'an Hadis (MA/MAK)",
      notes: `2 JP Intrakurikuler/minggu @ 45 menit untuk MA/MAK (${kmaRef}).`,
      regulationOverride: kmaRef,
    };
  }
  if (has('akidah', 'aqidah', 'akhlak')) {
    return {
      jpPerWeek: 2,
      p5JpPerWeek: 0,
      matchedSubjectLabel: 'Akidah Akhlak (MA/MAK)',
      notes: `2 JP Intrakurikuler/minggu @ 45 menit untuk MA/MAK (${kmaRef}).`,
      regulationOverride: kmaRef,
    };
  }
  if (has('fikih', 'fiqih')) {
    return {
      jpPerWeek: 2,
      p5JpPerWeek: 0,
      matchedSubjectLabel: 'Fikih (MA/MAK)',
      notes: `2 JP Intrakurikuler/minggu @ 45 menit untuk MA/MAK (${kmaRef}).`,
      regulationOverride: kmaRef,
    };
  }
  if (has('kebudayaan islam', 'ski')) {
    return {
      jpPerWeek: 2,
      p5JpPerWeek: 0,
      matchedSubjectLabel: 'Sejarah Kebudayaan Islam (MA/MAK)',
      notes: `2 JP Intrakurikuler/minggu @ 45 menit untuk MA/MAK (${kmaRef}).`,
      regulationOverride: kmaRef,
    };
  }
  if (has('arab')) {
    if (has('lanjut', 'peminatan')) {
      return {
        jpPerWeek: 5,
        p5JpPerWeek: 0,
        matchedSubjectLabel: 'Bahasa Arab Tingkat Lanjut (MA Fase F)',
        notes: `5 JP/minggu @ 45 menit untuk Mapel Pilihan Fase F (${kmaRef}).`,
        regulationOverride: kmaRef,
      };
    }
    const arabJp = g === 10 ? 4 : 2;
    return {
      jpPerWeek: arabJp,
      p5JpPerWeek: 0,
      matchedSubjectLabel: 'Bahasa Arab (MA/MAK)',
      notes:
        g === 10
          ? `4 JP Intrakurikuler/minggu @ 45 menit untuk Kelas X MA (${kmaRef}).`
          : `2 JP Intrakurikuler/minggu @ 45 menit untuk Kelas XI–XII MA Wajib (${kmaRef}).`,
      regulationOverride: kmaRef,
    };
  }

  return null;
}

function matchSubjectStandard(
  levelKind: 'PAUD' | 'SD' | 'SMP' | 'SMA' | 'SMK' | 'SLB',
  gradeNum: number,
  subjectRaw: string,
  currKind: 'KM' | 'K13',
  track: InstitutionTrack
): SubjectSpec {
  const kmaMatched = matchKmaSubjectStandard(levelKind, gradeNum, subjectRaw, currKind);
  if (kmaMatched) return kmaMatched;

  const s = (subjectRaw || '').toLowerCase().trim();
  const has = (...terms: string[]) => terms.some((t) => s.includes(t));

  if (levelKind === 'PAUD') {
    return {
      jpPerWeek: 30,
      p5JpPerWeek: 0,
      matchedSubjectLabel: subjectRaw || (track === 'madrasah' ? 'Raudhatul Athfal (RA)' : 'PAUD / TK'),
      notes:
        track === 'madrasah'
          ? 'Struktur RA minimal 900 menit/minggu (30 JP @ 30 menit sesuai KMA No. 450 Tahun 2024).'
          : 'Struktur PAUD minimal 900 menit/minggu (30 JP @ 30 menit sesuai Permendikbudristek No. 12 Tahun 2024).',
    };
  }

  if (levelKind === 'SLB') {
    if (has('program kebutuhan khusus', 'progsus', 'bina diri', 'orientasi', 'komunikasi')) {
      return {
        jpPerWeek: 4,
        p5JpPerWeek: 0,
        matchedSubjectLabel: 'Program Kebutuhan Khusus',
        notes: 'Standar SLB Program Kebutuhan Khusus sesuai jenjang satuan pendidikan.',
      };
    }
    if (has('keterampilan', 'vokasi', 'tata boga', 'tata busana', 'kriyak', 'komputer')) {
      return {
        jpPerWeek: gradeNum >= 10 ? 10 : 4,
        p5JpPerWeek: 2,
        matchedSubjectLabel: 'Keterampilan SLB',
        notes: 'Standar keterampilan pilihan SLB sesuai Permendikbudristek No. 12 Tahun 2024.',
      };
    }
    return {
      jpPerWeek: gradeNum > 0 && gradeNum <= 6 ? 3 : 2,
      p5JpPerWeek: currKind === 'KM' ? 1 : 0,
      matchedSubjectLabel: subjectRaw || 'Mata Pelajaran SLB',
      notes: 'Alokasi SLB adaptif sesuai jenjang SDLB/SMPLB/SMALB.',
    };
  }

  // SD / MI
  if (levelKind === 'SD') {
    const g = gradeNum || 4;
    if (currKind === 'K13') {
      if (has('agama', 'pai', 'pak', 'budi pekerti')) {
        return { jpPerWeek: 4, p5JpPerWeek: 0, matchedSubjectLabel: 'Pendidikan Agama & Budi Pekerti', notes: 'Standar K-13 SD: 4 JP/minggu @ 35 menit.' };
      }
      if (has('ppkn', 'pancasila', 'pkn')) {
        return { jpPerWeek: g <= 2 ? 5 : g === 3 ? 6 : 4, p5JpPerWeek: 0, matchedSubjectLabel: 'PPKn', notes: 'Standar K-13 SD/MI.' };
      }
      if (has('indonesia', 'b. indo', 'bindo')) {
        const jp = g === 1 ? 8 : g === 2 ? 9 : g === 3 ? 10 : 7;
        return { jpPerWeek: jp, p5JpPerWeek: 0, matchedSubjectLabel: 'Bahasa Indonesia', notes: 'Standar K-13 SD/MI.' };
      }
      if (has('matematika', 'mtk', 'math')) {
        return { jpPerWeek: g === 1 ? 5 : 6, p5JpPerWeek: 0, matchedSubjectLabel: 'Matematika', notes: 'Standar K-13 SD/MI.' };
      }
      if (has('ipas', 'ipa', 'ilmu pengetahuan alam')) {
        return { jpPerWeek: g >= 4 ? 3 : 2, p5JpPerWeek: 0, matchedSubjectLabel: 'IPA', notes: 'Standar K-13 SD/MI Kelas IV–VI.' };
      }
      if (has('ips', 'ilmu pengetahuan sosial')) {
        return { jpPerWeek: g >= 4 ? 3 : 2, p5JpPerWeek: 0, matchedSubjectLabel: 'IPS', notes: 'Standar K-13 SD/MI Kelas IV–VI.' };
      }
      if (has('pjok', 'penjas', 'olahraga')) {
        return { jpPerWeek: 4, p5JpPerWeek: 0, matchedSubjectLabel: 'PJOK', notes: 'Standar K-13 SD/MI: 4 JP/minggu.' };
      }
      if (has('seni', 'sbdp', 'prakarya', 'musik', 'rupa', 'tari')) {
        return { jpPerWeek: 4, p5JpPerWeek: 0, matchedSubjectLabel: 'SBdP', notes: 'Standar K-13 SD/MI: 4 JP/minggu.' };
      }
      return { jpPerWeek: 2, p5JpPerWeek: 0, matchedSubjectLabel: subjectRaw || 'Mulok / Bahasa Inggris', notes: 'Standar muatan lokal / pilihan SD/MI K-13.' };
    }

    if (has('agama', 'pai', 'pak', 'kristen', 'katolik', 'hindu', 'buddha', 'khonghucu')) {
      return { jpPerWeek: 3, p5JpPerWeek: 1, matchedSubjectLabel: 'Pendidikan Agama & Budi Pekerti', notes: '3 JP Intrakurikuler + 1 JP P5/minggu (Permendikbudristek 12/2024).' };
    }
    if (has('pancasila', 'ppkn', 'pkn')) {
      return { jpPerWeek: 4, p5JpPerWeek: 1, matchedSubjectLabel: 'Pendidikan Pancasila', notes: '4 JP Intrakurikuler + 1 JP P5/minggu.' };
    }
    if (has('indonesia', 'b. indo', 'bindo')) {
      const intra = g === 2 ? 7 : 6;
      const p5 = g <= 2 ? 2 : 1;
      return { jpPerWeek: intra, p5JpPerWeek: p5, matchedSubjectLabel: 'Bahasa Indonesia', notes: `${intra} JP Intrakurikuler + ${p5} JP P5/minggu.` };
    }
    if (has('matematika', 'mtk', 'math')) {
      const intra = g === 1 ? 4 : 5;
      return { jpPerWeek: intra, p5JpPerWeek: 1, matchedSubjectLabel: 'Matematika', notes: `${intra} JP Intrakurikuler + 1 JP P5/minggu.` };
    }
    if (has('ipas', 'ipa', 'ips', 'ilmu pengetahuan')) {
      const intra = g <= 2 ? 2 : 5;
      const p5 = g <= 2 ? 0 : 1;
      return {
        jpPerWeek: intra,
        p5JpPerWeek: p5,
        matchedSubjectLabel: 'IPAS',
        notes: g <= 2 ? 'Di Kelas I–II SD/MI, IPAS terintegrasi atau fleksibel 2 JP; mulai wajib penuh 5 JP di Kelas III–VI.' : '5 JP Intrakurikuler + 1 JP P5/minggu untuk Kelas III–VI.',
      };
    }
    if (has('pjok', 'penjas', 'olahraga')) {
      return { jpPerWeek: 3, p5JpPerWeek: 1, matchedSubjectLabel: 'PJOK', notes: '3 JP Intrakurikuler + 1 JP P5/minggu.' };
    }
    if (has('seni', 'sbdp', 'musik', 'rupa', 'tari', 'teater', 'prakarya')) {
      return { jpPerWeek: 3, p5JpPerWeek: 1, matchedSubjectLabel: 'Seni & Budaya', notes: '3 JP Intrakurikuler + 1 JP P5/minggu.' };
    }
    if (has('inggris', 'english')) {
      return { jpPerWeek: 2, p5JpPerWeek: 0, matchedSubjectLabel: 'Bahasa Inggris', notes: '2 JP Intrakurikuler/minggu @ 35 menit.' };
    }
    if (has('koding', 'coding', 'kecerdasan artifisial', 'informatika', 'tik')) {
      return { jpPerWeek: 2, p5JpPerWeek: 0, matchedSubjectLabel: 'Koding & Kecerdasan Artifisial', notes: '2 JP mata pelajaran pilihan SD/MI (Kelas V–VI).' };
    }
    return { jpPerWeek: 2, p5JpPerWeek: 0, matchedSubjectLabel: subjectRaw || 'Muatan Lokal', notes: 'Maksimal 2 JP/minggu @ 35 menit untuk Muatan Lokal / Pilihan.' };
  }

  // SMP / MTs
  if (levelKind === 'SMP') {
    if (currKind === 'K13') {
      if (has('agama', 'pai', 'pak', 'budi pekerti')) {
        return { jpPerWeek: 3, p5JpPerWeek: 0, matchedSubjectLabel: 'Pendidikan Agama & Budi Pekerti', notes: 'Standar K-13 SMP: 3 JP/minggu @ 40 menit.' };
      }
      if (has('ppkn', 'pancasila', 'pkn')) {
        return { jpPerWeek: 3, p5JpPerWeek: 0, matchedSubjectLabel: 'PPKn', notes: 'Standar K-13 SMP/MTs: 3 JP/minggu.' };
      }
      if (has('indonesia', 'b. indo', 'bindo')) {
        return { jpPerWeek: 6, p5JpPerWeek: 0, matchedSubjectLabel: 'Bahasa Indonesia', notes: 'Standar K-13 SMP/MTs: 6 JP/minggu.' };
      }
      if (has('matematika', 'mtk', 'math')) {
        return { jpPerWeek: 5, p5JpPerWeek: 0, matchedSubjectLabel: 'Matematika', notes: 'Standar K-13 SMP/MTs: 5 JP/minggu.' };
      }
      if (has('ipa', 'ilmu pengetahuan alam')) {
        return { jpPerWeek: 5, p5JpPerWeek: 0, matchedSubjectLabel: 'IPA', notes: 'Standar K-13 SMP/MTs: 5 JP/minggu.' };
      }
      if (has('ips', 'ilmu pengetahuan sosial')) {
        return { jpPerWeek: 4, p5JpPerWeek: 0, matchedSubjectLabel: 'IPS', notes: 'Standar K-13 SMP/MTs: 4 JP/minggu.' };
      }
      if (has('inggris', 'english')) {
        return { jpPerWeek: 4, p5JpPerWeek: 0, matchedSubjectLabel: 'Bahasa Inggris', notes: 'Standar K-13 SMP/MTs: 4 JP/minggu.' };
      }
      if (has('seni', 'musik', 'rupa', 'tari', 'teater')) {
        return { jpPerWeek: 3, p5JpPerWeek: 0, matchedSubjectLabel: 'Seni Budaya', notes: 'Standar K-13 SMP/MTs: 3 JP/minggu.' };
      }
      if (has('pjok', 'penjas', 'olahraga')) {
        return { jpPerWeek: 3, p5JpPerWeek: 0, matchedSubjectLabel: 'PJOK', notes: 'Standar K-13 SMP/MTs: 3 JP/minggu.' };
      }
      return { jpPerWeek: 2, p5JpPerWeek: 0, matchedSubjectLabel: subjectRaw || 'Prakarya / Informatika / Mulok', notes: 'Standar K-13 SMP/MTs: 2 JP/minggu.' };
    }

    if (has('agama', 'pai', 'pak', 'kristen', 'katolik', 'hindu', 'buddha', 'khonghucu')) {
      return { jpPerWeek: 2, p5JpPerWeek: 1, matchedSubjectLabel: 'Pendidikan Agama & Budi Pekerti', notes: '2 JP Intrakurikuler + 1 JP P5/minggu @ 40 menit.' };
    }
    if (has('pancasila', 'ppkn', 'pkn')) {
      return { jpPerWeek: 2, p5JpPerWeek: 1, matchedSubjectLabel: 'Pendidikan Pancasila', notes: '2 JP Intrakurikuler + 1 JP P5/minggu @ 40 menit.' };
    }
    if (has('indonesia', 'b. indo', 'bindo')) {
      return { jpPerWeek: 5, p5JpPerWeek: 1, matchedSubjectLabel: 'Bahasa Indonesia', notes: '5 JP Intrakurikuler + 1 JP P5/minggu @ 40 menit.' };
    }
    if (has('matematika', 'mtk', 'math')) {
      return { jpPerWeek: 4, p5JpPerWeek: 1, matchedSubjectLabel: 'Matematika', notes: '4 JP Intrakurikuler + 1 JP P5/minggu @ 40 menit.' };
    }
    if (has('ipa', 'ilmu pengetahuan alam')) {
      return { jpPerWeek: 4, p5JpPerWeek: 1, matchedSubjectLabel: 'IPA', notes: '4 JP Intrakurikuler + 1 JP P5/minggu @ 40 menit.' };
    }
    if (has('ips', 'ilmu pengetahuan sosial')) {
      return { jpPerWeek: 3, p5JpPerWeek: 1, matchedSubjectLabel: 'IPS', notes: '3 JP Intrakurikuler + 1 JP P5/minggu @ 40 menit.' };
    }
    if (has('inggris', 'english')) {
      return { jpPerWeek: 3, p5JpPerWeek: 1, matchedSubjectLabel: 'Bahasa Inggris', notes: '3 JP Intrakurikuler + 1 JP P5/minggu @ 40 menit.' };
    }
    if (has('pjok', 'penjas', 'olahraga')) {
      return { jpPerWeek: 2, p5JpPerWeek: 1, matchedSubjectLabel: 'PJOK', notes: '2 JP Intrakurikuler + 1 JP P5/minggu @ 40 menit.' };
    }
    if (has('informatika', 'tik')) {
      return { jpPerWeek: 2, p5JpPerWeek: 1, matchedSubjectLabel: 'Informatika', notes: '2 JP Intrakurikuler + 1 JP P5/minggu @ 40 menit.' };
    }
    if (has('seni', 'prakarya', 'musik', 'rupa', 'tari', 'teater', 'sbdp')) {
      return { jpPerWeek: 2, p5JpPerWeek: 1, matchedSubjectLabel: 'Seni, Budaya, dan Prakarya', notes: '2 JP Intrakurikuler + 1 JP P5/minggu @ 40 menit.' };
    }
    return { jpPerWeek: 2, p5JpPerWeek: 0, matchedSubjectLabel: subjectRaw || 'Muatan Lokal / Pilihan', notes: '2 JP Intrakurikuler/minggu @ 40 menit.' };
  }

  // SMK / MAK
  if (levelKind === 'SMK') {
    const g = gradeNum || 10;
    if (currKind === 'K13') {
      if (has('agama', 'pai', 'pak')) return { jpPerWeek: 3, p5JpPerWeek: 0, matchedSubjectLabel: 'Pendidikan Agama', notes: 'Standar K-13 SMK/MAK: 3 JP/minggu @ 45 menit.' };
      if (has('ppkn', 'pancasila')) return { jpPerWeek: 2, p5JpPerWeek: 0, matchedSubjectLabel: 'PPKn', notes: 'Standar K-13 SMK/MAK: 2 JP/minggu.' };
      if (has('indonesia')) return { jpPerWeek: g === 10 ? 4 : g === 11 ? 3 : 2, p5JpPerWeek: 0, matchedSubjectLabel: 'Bahasa Indonesia', notes: 'Standar K-13 SMK/MAK.' };
      if (has('matematika')) return { jpPerWeek: 4, p5JpPerWeek: 0, matchedSubjectLabel: 'Matematika', notes: 'Standar K-13 SMK/MAK: 4 JP/minggu.' };
      if (has('inggris')) return { jpPerWeek: g >= 12 ? 4 : 3, p5JpPerWeek: 0, matchedSubjectLabel: 'Bahasa Inggris', notes: 'Standar K-13 SMK/MAK.' };
      if (has('kejuruan', 'produktif', 'konsentrasi', 'dasar')) return { jpPerWeek: 12, p5JpPerWeek: 0, matchedSubjectLabel: 'Produktif Kejuruan', notes: 'Standar kelompok kejuruan SMK.' };
      return { jpPerWeek: 2, p5JpPerWeek: 0, matchedSubjectLabel: subjectRaw || 'Mata Pelajaran SMK', notes: 'Standar K-13 SMK/MAK @ 45 menit.' };
    }

    if (has('agama', 'pai', 'pak', 'budi pekerti')) {
      return { jpPerWeek: 2, p5JpPerWeek: 1, matchedSubjectLabel: 'Pendidikan Agama & Budi Pekerti', notes: '2 JP Intrakurikuler + 1 JP P5/minggu @ 45 menit.' };
    }
    if (has('pancasila', 'ppkn')) {
      return { jpPerWeek: 2, p5JpPerWeek: 0, matchedSubjectLabel: 'Pendidikan Pancasila', notes: '2 JP Intrakurikuler/minggu @ 45 menit.' };
    }
    if (has('indonesia')) {
      const intra = g >= 12 ? 2 : 3;
      return { jpPerWeek: intra, p5JpPerWeek: 1, matchedSubjectLabel: 'Bahasa Indonesia', notes: `${intra} JP Intrakurikuler + 1 JP P5/minggu @ 45 menit.` };
    }
    if (has('matematika', 'mtk')) {
      const intra = g >= 12 ? 2 : 3;
      return { jpPerWeek: intra, p5JpPerWeek: g === 10 ? 1 : 0, matchedSubjectLabel: 'Matematika', notes: `${intra} JP Intrakurikuler/minggu @ 45 menit.` };
    }
    if (has('inggris', 'english')) {
      const intra = g >= 12 ? 4 : 3;
      return { jpPerWeek: intra, p5JpPerWeek: g === 10 ? 1 : 0, matchedSubjectLabel: 'Bahasa Inggris', notes: `${intra} JP Intrakurikuler/minggu @ 45 menit.` };
    }
    if (has('pjok', 'penjas', 'olahraga')) {
      return { jpPerWeek: 2, p5JpPerWeek: g <= 11 ? 1 : 0, matchedSubjectLabel: 'PJOK', notes: '2 JP Intrakurikuler/minggu @ 45 menit.' };
    }
    if (has('sejarah')) {
      return { jpPerWeek: 2, p5JpPerWeek: 0, matchedSubjectLabel: 'Sejarah', notes: '2 JP Intrakurikuler/minggu (Kelas X–XI) @ 45 menit.' };
    }
    if (has('informatika')) {
      return { jpPerWeek: 3, p5JpPerWeek: 1, matchedSubjectLabel: 'Informatika', notes: '3 JP Intrakurikuler + 1 JP P5/minggu Kelas X @ 45 menit.' };
    }
    if (has('ipas', 'ilmu pengetahuan alam dan sosial')) {
      return { jpPerWeek: 5, p5JpPerWeek: 1, matchedSubjectLabel: 'Projek IPAS', notes: '5 JP Intrakurikuler + 1 JP P5/minggu Kelas X @ 45 menit.' };
    }
    if (has('konsentrasi keahlian')) {
      const intra = g >= 12 ? 22 : 18;
      return { jpPerWeek: intra, p5JpPerWeek: 0, matchedSubjectLabel: 'Konsentrasi Keahlian', notes: `${intra} JP/minggu untuk Kelas ${g >= 12 ? 'XII' : 'XI'} SMK/MAK.` };
    }
    if (has('dasar', 'keahlian', 'kejuruan', 'produktif')) {
      return { jpPerWeek: g === 10 ? 12 : 18, p5JpPerWeek: 0, matchedSubjectLabel: 'Dasar-Dasar Program Keahlian', notes: '12 JP/minggu Kelas X atau 18 JP/minggu Kelas XI.' };
    }
    if (has('kewirausahaan', 'pkk', 'projek kreatif')) {
      return { jpPerWeek: 5, p5JpPerWeek: 0, matchedSubjectLabel: 'Projek Kreatif & Kewirausahaan', notes: '5 JP/minggu untuk Kelas XI–XII SMK/MAK.' };
    }
    if (has('pilihan')) {
      return { jpPerWeek: 4, p5JpPerWeek: 0, matchedSubjectLabel: 'Mata Pelajaran Pilihan SMK/MAK', notes: '4 JP/minggu untuk Kelas XI–XII SMK/MAK.' };
    }
    return { jpPerWeek: 2, p5JpPerWeek: 0, matchedSubjectLabel: subjectRaw || 'Seni / Muatan Lokal', notes: '2 JP Intrakurikuler/minggu @ 45 menit.' };
  }

  // SMA / MA
  const g = gradeNum || 10;
  if (currKind === 'K13') {
    if (has('agama', 'pai', 'pak')) return { jpPerWeek: 3, p5JpPerWeek: 0, matchedSubjectLabel: 'Pendidikan Agama & Budi Pekerti', notes: 'Standar K-13 SMA: 3 JP/minggu @ 45 menit.' };
    if (has('ppkn', 'pancasila')) return { jpPerWeek: 2, p5JpPerWeek: 0, matchedSubjectLabel: 'PPKn', notes: 'Standar K-13 SMA/MA: 2 JP/minggu.' };
    if (has('indonesia') && !has('sejarah indonesia') && !has('sastra')) {
      return { jpPerWeek: 4, p5JpPerWeek: 0, matchedSubjectLabel: 'Bahasa Indonesia (Wajib)', notes: 'Standar K-13 SMA/MA: 4 JP/minggu.' };
    }
    if (has('matematika wajib') || (has('matematika') && !has('peminatan') && !has('lanjut'))) {
      return { jpPerWeek: 4, p5JpPerWeek: 0, matchedSubjectLabel: 'Matematika (Wajib)', notes: 'Standar K-13 SMA/MA: 4 JP/minggu.' };
    }
    if (has('sejarah indonesia')) return { jpPerWeek: 2, p5JpPerWeek: 0, matchedSubjectLabel: 'Sejarah Indonesia', notes: 'Standar K-13 SMA/MA Wajib: 2 JP/minggu.' };
    if (has('inggris') && !has('sastra') && !has('peminatan')) return { jpPerWeek: 2, p5JpPerWeek: 0, matchedSubjectLabel: 'Bahasa Inggris (Wajib)', notes: 'Standar K-13 SMA/MA Wajib: 2 JP/minggu.' };
    if (has('pjok', 'penjas', 'olahraga')) return { jpPerWeek: 3, p5JpPerWeek: 0, matchedSubjectLabel: 'PJOK', notes: 'Standar K-13 SMA/MA: 3 JP/minggu.' };
    if (has('seni', 'prakarya', 'pkwu', 'kewirausahaan')) return { jpPerWeek: 2, p5JpPerWeek: 0, matchedSubjectLabel: 'Seni Budaya / PKWU', notes: 'Standar K-13 SMA/MA: 2 JP/minggu.' };
    if (has('fisika', 'kimia', 'biologi', 'ekonomi', 'sosiologi', 'geografi', 'sejarah', 'peminatan', 'sastra', 'antropologi', 'matematika')) {
      const jp = g === 10 ? 3 : 4;
      return { jpPerWeek: jp, p5JpPerWeek: 0, matchedSubjectLabel: `${subjectRaw} (Peminatan)`, notes: `Standar K-13 SMA/MA Peminatan Kelas ${g === 10 ? 'X' : 'XI–XII'}: ${jp} JP/minggu.` };
    }
    return { jpPerWeek: 2, p5JpPerWeek: 0, matchedSubjectLabel: subjectRaw || 'Mulok / Lintas Minat', notes: 'Standar K-13 SMA/MA @ 45 menit.' };
  }

  if (has('agama', 'pai', 'pak', 'kristen', 'katolik', 'hindu', 'buddha', 'khonghucu')) {
    return { jpPerWeek: 2, p5JpPerWeek: 1, matchedSubjectLabel: 'Pendidikan Agama & Budi Pekerti', notes: '2 JP Intrakurikuler + 1 JP P5/minggu @ 45 menit.' };
  }
  if (has('pancasila', 'ppkn', 'pkn')) {
    return { jpPerWeek: 2, p5JpPerWeek: 0, matchedSubjectLabel: 'Pendidikan Pancasila', notes: '2 JP Intrakurikuler/minggu @ 45 menit.' };
  }
  if (has('indonesia') && !has('lanjut') && !has('sastra')) {
    return { jpPerWeek: 3, p5JpPerWeek: 1, matchedSubjectLabel: 'Bahasa Indonesia', notes: '3 JP Intrakurikuler + 1 JP P5/minggu @ 45 menit.' };
  }
  if (has('matematika') && !has('lanjut') && !has('peminatan')) {
    return { jpPerWeek: 3, p5JpPerWeek: 1, matchedSubjectLabel: 'Matematika (Umum)', notes: '3 JP Intrakurikuler + 1 JP P5/minggu @ 45 menit.' };
  }
  if (has('inggris') && !has('lanjut') && !has('sastra')) {
    return { jpPerWeek: 2, p5JpPerWeek: 1, matchedSubjectLabel: 'Bahasa Inggris (Umum)', notes: '2 JP Intrakurikuler + 1 JP P5/minggu @ 45 menit.' };
  }
  if (has('pjok', 'penjas', 'olahraga')) {
    return { jpPerWeek: 2, p5JpPerWeek: 1, matchedSubjectLabel: 'PJOK', notes: '2 JP Intrakurikuler + 1 JP P5/minggu @ 45 menit.' };
  }
  if (has('sejarah') && !has('lanjut')) {
    return { jpPerWeek: 2, p5JpPerWeek: g === 10 ? 1 : 0, matchedSubjectLabel: 'Sejarah', notes: g === 10 ? '2 JP Intrakurikuler + 1 JP P5/minggu (Kelas X).' : '2 JP Intrakurikuler/minggu (Kelas XI–XII).' };
  }
  if (has('seni', 'musik', 'rupa', 'tari', 'teater')) {
    return { jpPerWeek: 2, p5JpPerWeek: 0, matchedSubjectLabel: 'Seni & Budaya', notes: '2 JP Intrakurikuler/minggu @ 45 menit.' };
  }
  if (has('prakarya', 'pkwu', 'kewirausahaan')) {
    return { jpPerWeek: 2, p5JpPerWeek: 0, matchedSubjectLabel: 'Prakarya & Kewirausahaan', notes: '2 JP Intrakurikuler/minggu @ 45 menit.' };
  }
  if (has('ipa terpadu') || s === 'ipa' || s === 'ilmu pengetahuan alam (ipa)') {
    return { jpPerWeek: g === 10 ? 6 : 5, p5JpPerWeek: g === 10 ? 3 : 0, matchedSubjectLabel: 'IPA Terpadu (Kelas X)', notes: 'IPA Kelas X: 6 JP Intrakurikuler + 3 JP P5/minggu (Fisika, Kimia, Biologi @ 2 JP).' };
  }
  if (has('ips terpadu') || s === 'ips' || s === 'ilmu pengetahuan sosial (ips)') {
    return { jpPerWeek: g === 10 ? 6 : 5, p5JpPerWeek: g === 10 ? 2 : 0, matchedSubjectLabel: 'IPS Terpadu (Kelas X)', notes: 'IPS Kelas X: 6 JP Intrakurikuler + 2 JP P5/minggu (Sosiologi, Ekonomi, Geografi @ 2 JP).' };
  }
  if (has('informatika', 'tik')) {
    return g === 10
      ? { jpPerWeek: 2, p5JpPerWeek: 1, matchedSubjectLabel: 'Informatika (Wajib Kelas X)', notes: 'Kelas X: 2 JP Intrakurikuler + 1 JP P5/minggu.' }
      : { jpPerWeek: 5, p5JpPerWeek: 0, matchedSubjectLabel: 'Informatika (Pilihan Fase F)', notes: 'Kelas XI–XII Mapel Pilihan: 5 JP/minggu @ 45 menit.' };
  }
  if (has('fisika', 'kimia', 'biologi', 'ekonomi', 'sosiologi', 'geografi')) {
    if (g === 10) {
      return {
        jpPerWeek: 2,
        p5JpPerWeek: 1,
        matchedSubjectLabel: `${subjectRaw} (Komponen Kelas X)`,
        notes: 'Kelas X IPA/IPS dipecah per rumpun: 2 JP Intrakurikuler + 1 JP P5/minggu.',
      };
    }
    return {
      jpPerWeek: 5,
      p5JpPerWeek: 0,
      matchedSubjectLabel: `${subjectRaw} (Mapel Pilihan Fase F)`,
      notes: 'Mapel Pilihan Kelas XI–XII: 5 JP Intrakurikuler/minggu @ 45 menit.',
    };
  }
  if (has('lanjut', 'antropologi', 'jepang', 'jerman', 'mandarin', 'prancis', 'korea', 'koding', 'kecerdasan artifisial')) {
    return {
      jpPerWeek: 5,
      p5JpPerWeek: 0,
      matchedSubjectLabel: `${subjectRaw} (Mapel Pilihan Fase F)`,
      notes: 'Mata Pelajaran Pilihan Fase F: 5 JP/minggu @ 45 menit.',
    };
  }
  if (has('muatan lokal', 'mulok', 'bahasa daerah', 'sunda', 'jawa', 'bali')) {
    return { jpPerWeek: 2, p5JpPerWeek: 0, matchedSubjectLabel: 'Muatan Lokal', notes: 'Maksimal 2 JP/minggu @ 45 menit.' };
  }

  return {
    jpPerWeek: g >= 11 ? 5 : 2,
    p5JpPerWeek: 0,
    matchedSubjectLabel: subjectRaw || 'Mata Pelajaran Pilihan SMA/MA',
    notes: g >= 11 ? 'Standar mapel pilihan Fase F: 5 JP/minggu @ 45 menit.' : 'Standar mata pelajaran SMA/MA Kelas X @ 45 menit.',
  };
}

export function getOfficialJpStandard(params: {
  level?: string;
  grade?: string;
  subject?: string;
  curriculum?: string;
  schoolName?: string;
  institutionTrack?: InstitutionTrack;
}): OfficialJpStandard {
  const levelKind = detectNormalizedLevel(params.level, params.grade);
  const gradeNum = detectGradeNumber(params.grade);
  const currKind = normalizeCurriculumKind(params.curriculum);
  const track = detectInstitutionTrack({
    schoolName: params.schoolName,
    level: params.level,
    grade: params.grade,
    subject: params.subject,
    preferredTrack: params.institutionTrack,
  });
  const minutesPerJp = getMinutesPerJp(params.level, params.grade);
  const weeks = getEffectiveWeeks(params.level, params.grade);
  const matched = matchSubjectStandard(levelKind, gradeNum, params.subject || '', currKind, track);

  const regulationRef =
    matched.regulationOverride ||
    (track === 'madrasah'
      ? currKind === 'K13'
        ? 'KMA No. 183/184 Tahun 2019 (K-13 Madrasah)'
        : 'KMA No. 450 Tahun 2024 (KM Madrasah)'
      : currKind === 'K13'
      ? 'Permendikbud No. 35/36/37 Tahun 2018 (K-13)'
      : 'Permendikbudristek No. 12 Tahun 2024');

  return {
    jpPerWeek: matched.jpPerWeek,
    p5JpPerWeek: matched.p5JpPerWeek,
    totalWeeklyJp: matched.jpPerWeek + matched.p5JpPerWeek,
    recommendedJpPerMeeting: recommendedMeetingJp(matched.jpPerWeek, levelKind),
    minutesPerJp,
    effectiveWeeksPerYear: weeks.annualWeeks,
    semester1Weeks: weeks.semester1Weeks,
    semester2Weeks: weeks.semester2Weeks,
    annualIntrakurikulerJp: matched.jpPerWeek * weeks.annualWeeks,
    annualP5Jp: matched.p5JpPerWeek * weeks.annualWeeks,
    annualTotalJp: (matched.jpPerWeek + matched.p5JpPerWeek) * weeks.annualWeeks,
    semester1Jp: matched.jpPerWeek * weeks.semester1Weeks,
    semester2Jp: matched.jpPerWeek * weeks.semester2Weeks,
    regulationRef,
    institutionTrack: track,
    matchedSubjectLabel: matched.matchedSubjectLabel,
    notes: matched.notes,
  };
}

export function formatJpDuration(jpCount: number, level?: string, grade?: string): string {
  const jp = Math.max(1, Math.round(Number(jpCount || 2)));
  const minutesPerJp = getMinutesPerJp(level, grade);
  const totalMinutes = jp * minutesPerJp;
  return `${jp} x ${minutesPerJp} Menit (${totalMinutes} Menit)`;
}

export function getDefaultPhaseSplits(
  jpCount: number,
  minutesPerJp: number
): { totalMenit: number; pendahuluan: number; inti: number; penutup: number } {
  const jp = Math.max(1, Math.round(Number(jpCount || 2)));
  const mPerJp = Math.max(25, Math.round(Number(minutesPerJp || 40)));
  const totalMenit = jp * mPerJp;
  const pendahuluan = Math.max(5, Math.round((totalMenit * 0.13) / 5) * 5);
  const penutup = Math.max(5, Math.round((totalMenit * 0.13) / 5) * 5);
  const inti = Math.max(10, totalMenit - pendahuluan - penutup);
  return { totalMenit, pendahuluan, inti, penutup };
}
