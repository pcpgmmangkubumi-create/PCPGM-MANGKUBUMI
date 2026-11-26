import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { SealedAnswerItem } from './quizSeal.ts';
import {
  InstitutionTrack,
  formatJpDuration,
  getDefaultPhaseSplits,
  getMinutesPerJp,
  getOfficialJpStandard,
} from '../lib/jpStandards.ts';
import { resolveSubjectRegulationContext } from '../lib/subjectCatalog.ts';
import { reconcileProtaAndProsem } from '../lib/protaProsemSync.ts';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY belum dikonfigurasi pada server. Silakan periksa panel Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const DEFAULT_MODEL = 'gemini-4-hydrogen';
const ALLOWED_MODELS = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;

export class AiServiceError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'AiServiceError';
    this.statusCode = statusCode;
  }
}

function resolveAllowedModel(requested?: string): string {
  if (requested && (ALLOWED_MODELS as readonly string[]).includes(requested)) {
    return requested;
  }
  return DEFAULT_MODEL;
}

function parseUpstreamError(err: any): {
  status: number;
  apiStatus: string;
  rawMessage: string;
  isDailyQuota: boolean;
} {
  let status = Number(err?.status || err?.statusCode || err?.code || 0);
  let apiStatus = '';
  let rawMessage = String(err?.message || '');

  try {
    if (rawMessage.trim().startsWith('{')) {
      const parsed = JSON.parse(rawMessage);
      const inner = parsed?.error || parsed;
      if (!status && inner?.code) status = Number(inner.code);
      if (inner?.status) apiStatus = String(inner.status);
      if (inner?.message) rawMessage = String(inner.message);
    }
  } catch {
    // keep rawMessage as-is
  }

  const lower = `${rawMessage} ${apiStatus}`.toLowerCase();
  if (!status) {
    if (lower.includes('resource_exhausted') || lower.includes('quota') || lower.includes('429')) status = 429;
    else if (lower.includes('permission_denied') || lower.includes('403')) status = 403;
    else if (lower.includes('api_key_invalid') || lower.includes('invalid argument') || lower.includes('400')) status = 400;
    else if (lower.includes('not_found') || lower.includes('404')) status = 404;
    else status = 500;
  }

  const isDailyQuota =
    lower.includes('perday') ||
    lower.includes('free_tier_requests') ||
    lower.includes('requests per day');

  return { status, apiStatus, rawMessage, isDailyQuota };
}

function toFriendlyAiError(err: any): AiServiceError {
  if (err instanceof AiServiceError) return err;
  const info = parseUpstreamError(err);
  const lower = `${info.rawMessage} ${info.apiStatus}`.toLowerCase();

  if (info.status === 429 || lower.includes('resource_exhausted')) {
    return new AiServiceError(
      429,
      'Kuota permintaan API Gemini gratis telah mencapai batas sementara/harian. Silakan coba beberapa saat lagi, ganti model di Pengaturan AI, atau aktifkan API key berbayar melalui panel Settings > Secrets.'
    );
  }
  if (info.status === 403 || lower.includes('permission_denied') || lower.includes('api_key_invalid')) {
    return new AiServiceError(
      info.status === 403 ? 403 : 400,
      'API key Gemini tidak valid atau belum memiliki izin akses. Silakan periksa API key pada panel Settings > Secrets.'
    );
  }
  if (info.status === 404 || lower.includes('not_found')) {
    return new AiServiceError(
      404,
      'Model AI yang dipilih tidak tersedia. Silakan periksa pilihan model pada menu Pengaturan AI.'
    );
  }
  return new AiServiceError(
    info.status >= 400 && info.status < 600 ? info.status : 500,
    info.rawMessage || 'Terjadi kendala saat menghubungi layanan AI Gemini.'
  );
}

async function generateWithFallback<T>(
  requestedModel: string | undefined,
  runForModel: (model: string) => Promise<T>
): Promise<T> {
  const primary = resolveAllowedModel(requestedModel);
  const candidates = [primary, ...ALLOWED_MODELS.filter((m) => m !== primary)];
  let lastError: unknown;

  for (const model of candidates) {
    for (let attempt = 0; attempt <= 1; attempt++) {
      try {
        return await runForModel(model);
      } catch (err: any) {
        lastError = err;
        const info = parseUpstreamError(err);
        console.warn(
          `[Gemini] model=${model} attempt=${attempt} status=${info.status} daily=${info.isDailyQuota} apiStatus=${info.apiStatus} msg=${info.rawMessage.slice(0, 180)}`
        );

        // Auth / invalid key errors will not succeed on another model
        if (info.status === 400 || info.status === 403) {
          throw toFriendlyAiError(err);
        }

        // Daily/free-tier quota exhaustion on one model: move directly to fallback model
        if (info.status === 429) {
          if (!info.isDailyQuota && attempt === 0) {
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          break;
        }

        // Model not found: try fallback model
        if (info.status === 404) {
          break;
        }

        // Transient 500/503: brief retry once before falling back
        if ((info.status === 500 || info.status === 503) && attempt === 0) {
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }
        break;
      }
    }
  }

  throw toFriendlyAiError(lastError);
}

function getCurriculumDetectionGuideline(curriculum?: string, subject?: string, level?: string, grade?: string): string {
  const c = (curriculum || '').toLowerCase();
  const regCtx = resolveSubjectRegulationContext({ level, grade, curriculum, subject });
  const kmaNote =
    regCtx.track === 'madrasah'
      ? ` Untuk satuan pendidikan Madrasah, perhatikan acuan Kemenag: ${regCtx.regulationTitle} (${regCtx.subjectName}: ${regCtx.scopeSummary}).`
      : ` Acuan resmi: ${regCtx.regulationTitle} (${regCtx.subjectName}: ${regCtx.scopeSummary}).`;

  if (c.includes('2013') || c.includes('k-13') || c.includes('k13')) {
    return `Kurikulum acuan adalah Kurikulum 2013 (K-13): fokus pada Kompetensi Inti (KI-1 s.d. KI-4), Kompetensi Dasar (KD), IPK, serta struktur Tema/Subtema (untuk SD/MI) atau Bab materi K-13 (Edisi Revisi 2016/2017/2018 / KMA 183 Tahun 2019 untuk PAI & Bahasa Arab Madrasah).${kmaNote}`;
  }
  if (c.includes('revisi')) {
    return `Kurikulum acuan adalah Kurikulum Merdeka (Revisi CP Terbaru / Pembelajaran Mendalam): fokus pada Elemen, Capaian Pembelajaran (CP BSKAP/Kemenag terbaru), Tujuan Pembelajaran (TP), ATP per Fase, serta 8 Dimensi Profil Lulusan.${kmaNote}`;
  }
  if (c.includes('ksp') || c.includes('satuan')) {
    return `Kurikulum acuan adalah Kurikulum Satuan Pendidikan (KSP): fokus pada Elemen/CP/TP yang kontekstual dengan karakteristik satuan pendidikan dan kebutuhan peserta didik.${kmaNote}`;
  }
  return `Kurikulum acuan adalah Kurikulum Merdeka: fokus pada Elemen, Capaian Pembelajaran (CP), Tujuan Pembelajaran (TP), Alur Tujuan Pembelajaran (ATP) sesuai Fase, serta dimensi Profil Pelajar Pancasila (dan P2RA/Rahmatan lil 'Alamin untuk Madrasah).${kmaNote}`;
}

function buildRegulationDirective(params: {
  level?: string;
  grade?: string;
  curriculum?: string;
  subject?: string;
  schoolName?: string;
  institutionTrack?: InstitutionTrack;
  subjectScopeSummary?: string;
}): string {
  const ctx = resolveSubjectRegulationContext({
    level: params.level,
    grade: params.grade,
    curriculum: params.curriculum,
    subject: params.subject,
    schoolName: params.schoolName,
    institutionTrack: params.institutionTrack,
  });
  const scope = params.subjectScopeSummary || ctx.scopeSummary;
  const trackLabel =
    ctx.track === 'madrasah'
      ? 'Madrasah (Kementerian Agama — KMA No. 450 Tahun 2024 / KMA No. 183 Tahun 2019; sertakan nilai Rahmatan lil Alamin / P2RA jika Kurikulum Merdeka Madrasah)'
      : 'Sekolah Umum (Kemendikdasmen/Kemendikbudristek — Permendikbudristek No. 12 Tahun 2024 & Keputusan Kepala BSKAP terbaru / Permendikbud 35-37 Tahun 2018 jika K-13)';

  return `ACUAN REGULASI & RUANG LINGKUP MAPEL RESMI:
- Satuan Pendidikan / Jalur: ${trackLabel}
- Dasar Peraturan: ${ctx.regulationTitle}
- Mata Pelajaran Baku: ${ctx.subjectName} (${ctx.category})
- Ruang Lingkup Materi Wajib Kelas/Fase Ini: ${scope}
- Kepatuhan Materi: Pastikan seluruh topik, subtopik, istilah keilmuan, CP/TP atau KI/KD, dan contoh pembelajaran 100% relevan dengan jenjang ${params.grade || '-'} dan regulasi di atas (jangan mencampur materi kelas lain atau jenjang lain).`;
}

async function researchBookFromUrl(
  ai: GoogleGenAI,
  params: {
    bookUrl: string;
    title?: string;
    subject?: string;
    grade?: string;
    level?: string;
    phase?: string;
    semester?: string;
    curriculum?: string;
    curriculumContext?: string;
    pageHintText?: string;
    preferredModel?: string;
  }
): Promise<{ text: string; sources: string[]; hitQuota: boolean }> {
  const curriculumRule = getCurriculumDetectionGuideline(params.curriculum, params.subject, params.level, params.grade);
  const prompt = `Anda adalah spesialis kurikulum dan pustakawan pendidikan Indonesia.
Tugas Anda: baca tautan buku berikut, verifikasi kesesuaiannya dengan kurikulum target guru, lalu ekstrak identitas buku beserta SELURUH DAFTAR BAB dan MATERI/SUBBAB yang relevan.

Tautan Buku: ${params.bookUrl}
${params.title ? `Judul Referensi Guru: ${params.title}` : ''}
Kurikulum Target: ${params.curriculum || 'Kurikulum Merdeka'}
Mata Pelajaran Target: ${params.subject || '-'}
Jenjang / Kelas / Fase Target: ${params.level || '-'} / ${params.grade || '-'} / ${params.phase || '-'}
Semester Target: ${params.semester || '-'}
Panduan Kurikulum Target: ${curriculumRule}
${params.curriculumContext ? `\nAcuan CP / TP / Topik Aktif Guru:\n${params.curriculumContext.slice(0, 2500)}` : ''}
${params.pageHintText ? `\nCuplikan Teks Halaman:\n${params.pageHintText.slice(0, 4000)}` : ''}

Instruksi Wajib:
1. Baca isi halaman dari tautan buku di atas menggunakan alat yang tersedia.
2. Jika halaman tautan hanya berisi katalog/deskripsi singkat atau viewer (Google Drive/SIBI Kemendikbud/flipbook), identifikasi edisi buku yang sesuai (perhatikan apakah buku tersebut Kurikulum Merdeka atau K-13) beserta Daftar Isi resmi (Bab, Subbab, Materi Pokok, dan ringkasan isi tiap bab).
3. Evaluasi relevansi buku dan tiap bab terhadap Kurikulum Target, Jenjang/Kelas/Fase, Mata Pelajaran, serta Acuan CP/TP/Topik di atas. Jika buku berasal dari kurikulum atau kelas yang berbeda, catat perbedaan tersebut secara jujur.
4. Tuliskan hasil temuan secara terstruktur:
   - Judul Lengkap Buku, Penulis & Penerbit, Kurikulum Asli Buku, Mata Pelajaran, Kelas, Jumlah Halaman (jika ada)
   - Penilaian Relevansi terhadap Kurikulum Target
   - Daftar Bab Lengkap (Bab 1 sampai bab terakhir): Nomor Bab, Judul Bab, Subbab/Materi Pokok, Kesesuaian dengan CP/TP/KD & Semester, dan Rentang Halaman (jika teridentifikasi; jika tidak, tulis "Tidak teridentifikasi").
5. JANGAN mengarang nomor halaman palsu.`;

  // Try urlContext first (single lightweight tool), then googleSearch only if needed
  const toolConfigs: Array<any[]> = [
    [{ urlContext: {} }],
    [{ googleSearch: {} }],
  ];
  let hitQuota = false;

  for (const tools of toolConfigs) {
    try {
      const response = await generateWithFallback(params.preferredModel, async (model) =>
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            tools,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        })
      );
      const text = (response.text ?? '').trim();
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources = chunks
        .map((c: any) => c?.web?.uri)
        .filter((u: unknown): u is string => typeof u === 'string' && u.length > 0);
      if (text.length > 120) {
        return { text, sources, hitQuota: false };
      }
    } catch (err: any) {
      const info = parseUpstreamError(err);
      if (info.status === 403) {
        throw toFriendlyAiError(err);
      }
      if (info.status === 429) {
        hitQuota = true;
        break;
      }
      // Otherwise try next tool
    }
  }
  return { text: '', sources: [], hitQuota };
}

export async function extractTextbookContent(params: {
  fileName: string;
  mimeType: string;
  base64Data?: string;
  plainText?: string;
  meta: {
    title?: string;
    subject?: string;
    grade?: string;
    level?: string;
    phase?: string;
    semester?: string;
    curriculum?: string;
    curriculumContext?: string;
    bookUrl?: string;
    preferredModel?: string;
  };
}) {
  const ai = getAiClient();

  const rawPlain = (params.plainText || '').trim();
  const hasRealPageText =
    rawPlain.length >= 250 && !rawPlain.startsWith('Catatan pengambilan tautan (');
  const alreadyHasChaptersOrRichText =
    hasRealPageText &&
    (rawPlain.length >= 2500 || /\b(bab|unit|tema|daftar isi|materi|chapter)\b/i.test(rawPlain));

  let urlResearchText = '';
  let groundingSources: string[] = [];
  if (params.meta.bookUrl && !params.base64Data && !alreadyHasChaptersOrRichText) {
    const researched = await researchBookFromUrl(ai, {
      bookUrl: params.meta.bookUrl,
      title: params.meta.title,
      subject: params.meta.subject,
      grade: params.meta.grade,
      level: params.meta.level,
      phase: params.meta.phase,
      semester: params.meta.semester,
      curriculum: params.meta.curriculum,
      curriculumContext: params.meta.curriculumContext,
      pageHintText: hasRealPageText ? rawPlain : undefined,
      preferredModel: params.meta.preferredModel,
    });
    urlResearchText = researched.text;
    groundingSources = researched.sources;

    if (researched.hitQuota && !hasRealPageText) {
      throw new AiServiceError(
        429,
        'Kuota permintaan API Gemini gratis telah mencapai batas sementara/harian. Silakan coba beberapa saat lagi, ganti model di Pengaturan AI, atau gunakan "Simpan Data & Link Saja".'
      );
    }
  }

  const combinedText = [
    rawPlain ? `Teks Sumber / Halaman:\n${rawPlain.slice(0, 24000)}` : '',
    urlResearchText ? `Hasil Penelusuran Link & Daftar Isi Buku (AI URL Context & Search):\n${urlResearchText.slice(0, 15000)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const curriculumRule = getCurriculumDetectionGuideline(
    params.meta.curriculum,
    params.meta.subject,
    params.meta.level,
    params.meta.grade
  );

  const prompt = `Anda adalah spesialis kurikulum dan ekstraksi buku ajar Indonesia.
Analisis berkas/teks/hasil penelusuran tautan buku berikut, nilai RELEVANSINYA terhadap kurikulum target guru, lalu ekstrak struktur bab beserta pemetaan kesesuaiannya terhadap kurikulum tersebut.

PANDUAN KURIKULUM TARGET:
${curriculumRule}

TARGET ADMINISTRASI GURU:
- Judul Masukan: ${params.meta.title || params.fileName}
- Kurikulum Target: ${params.meta.curriculum || 'Kurikulum Merdeka'}
- Mata Pelajaran Target: ${params.meta.subject || '-'}
- Jenjang / Kelas / Fase Target: ${params.meta.level || '-'} / ${params.meta.grade || '-'} / ${params.meta.phase || '-'}
- Semester Target: ${params.meta.semester || '-'}
${params.meta.bookUrl ? `- Link Buku: ${params.meta.bookUrl}` : ''}
${params.meta.curriculumContext ? `\nACUAN ELEMEN / CP / TP / TOPIK AKTIF GURU:\n${params.meta.curriculumContext.slice(0, 4000)}` : ''}

ATURAN KETAT:
1. Deteksi kurikulum asli buku (detectedCurriculum) dan bandingkan dengan Kurikulum Target, Jenjang, Kelas/Fase, Mata Pelajaran, serta Acuan CP/TP/Topik di atas.
2. Tetapkan curriculumRelevance strictly salah satu dari: "sangat_relevan", "relevan", "perlu_penyesuaian", "tidak_relevan", serta curriculumRelevanceScore (0-100) dan curriculumRelevanceReason yang menjelaskan kecocokan maupun ketidaksesuaiannya (misalnya jika buku K-13 dipakai untuk Kurikulum Merdeka, atau kelas/mapel berbeda).
3. Isi matchedCurriculumElements dengan daftar Elemen/CP/TP/KD/Topik dari kurikulum target yang didukung oleh isi buku ini.
4. Ekstrak SEMUA bab buku secara urut (Bab 1 hingga bab terakhir) lengkap dengan subchapters, summary, practiceTopics, serta untuk SETIAP bab tentukan:
   - relevanceLevel: strictly "sangat_relevan" | "relevan" | "pendukung" | "kurang_relevan" terhadap kurikulum, kelas, dan mapel target.
   - curriculumAlignment: uraian singkat kesesuaian bab ini dengan Elemen/CP/TP/KD pada kurikulum target.
   - recommendedSemester: salah satu dari "Semester 1", "Semester 2", "Semester 1 & 2", atau "Pengayaan".
5. JANGAN mengarang nomor halaman, nama penulis, atau isi bab yang tidak ada pada sumber. Jika nomor halaman tidak teridentifikasi, isi pageRange dengan "Tidak teridentifikasi".
6. Gunakan Bahasa Indonesia yang baku dan jelas.

${combinedText || 'Dokumen dilampirkan sebagai berkas multimodal/OCR.'}`;

  const parts: any[] = [];
  if (params.base64Data && params.mimeType) {
    parts.push({
      inlineData: {
        mimeType: params.mimeType,
        data: params.base64Data,
      },
    });
  }
  parts.push({ text: prompt });

  const parsed = await generateWithFallback(params.meta.preferredModel, async (model) => {
    const response = await ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            extractedTitle: { type: Type.STRING },
            detectedAuthor: { type: Type.STRING },
            detectedPublisher: { type: Type.STRING },
            detectedSubject: { type: Type.STRING },
            detectedGrade: { type: Type.STRING },
            detectedCurriculum: { type: Type.STRING },
            detectedPageCount: { type: Type.INTEGER },
            curriculumRelevance: {
              type: Type.STRING,
              enum: ['sangat_relevan', 'relevan', 'perlu_penyesuaian', 'tidak_relevan'],
            },
            curriculumRelevanceScore: { type: Type.INTEGER },
            curriculumRelevanceReason: { type: Type.STRING },
            matchedCurriculumElements: { type: Type.ARRAY, items: { type: Type.STRING } },
            detectionNote: { type: Type.STRING },
            summary: { type: Type.STRING },
            chapters: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  chapterNumber: { type: Type.STRING },
                  title: { type: Type.STRING },
                  subchapters: { type: Type.ARRAY, items: { type: Type.STRING } },
                  pageRange: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  practiceTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
                  relevanceLevel: {
                    type: Type.STRING,
                    enum: ['sangat_relevan', 'relevan', 'pendukung', 'kurang_relevan'],
                  },
                  curriculumAlignment: { type: Type.STRING },
                  recommendedSemester: { type: Type.STRING },
                },
                required: [
                  'chapterNumber',
                  'title',
                  'subchapters',
                  'pageRange',
                  'summary',
                  'relevanceLevel',
                  'curriculumAlignment',
                  'recommendedSemester',
                ],
              },
            },
          },
          required: [
            'extractedTitle',
            'detectedCurriculum',
            'curriculumRelevance',
            'curriculumRelevanceScore',
            'curriculumRelevanceReason',
            'matchedCurriculumElements',
            'detectionNote',
            'summary',
            'chapters',
          ],
        },
      },
    });
    return JSON.parse((response.text ?? '{}').trim());
  });

  return {
    ...parsed,
    groundingSources,
  };
}

export async function generateAutoCurriculum(params: {
  level: string;
  grade: string;
  phase: string;
  curriculum: string;
  subject: string;
  academicYear: string;
  semester: string;
  jpPerWeek: number;
  minutesPerJp?: number;
  effectiveWeeks?: number;
  targetAnnualJp?: number;
  p5JpPerWeek?: number;
  regulationRef?: string;
  institutionTrack?: InstitutionTrack;
  schoolName?: string;
  subjectScopeSummary?: string;
  textbookContext?: string;
  aiPreferences?: Record<string, string>;
}) {
  const ai = getAiClient();
  const regCtx = resolveSubjectRegulationContext({
    level: params.level,
    grade: params.grade,
    subject: params.subject,
    curriculum: params.curriculum,
    schoolName: params.schoolName,
    institutionTrack: params.institutionTrack,
  });
  const std = regCtx.jpStandard;
  const jpPerWeek = Number(params.jpPerWeek || std.jpPerWeek);
  const minutesPerJp = Number(params.minutesPerJp || std.minutesPerJp);
  const effectiveWeeks = Number(params.effectiveWeeks || std.effectiveWeeksPerYear);
  const targetAnnualJp = Number(params.targetAnnualJp || jpPerWeek * effectiveWeeks);
  const regulationRef = params.regulationRef || regCtx.regulationTitle;
  const regulationDirective = buildRegulationDirective({
    level: params.level,
    grade: params.grade,
    curriculum: params.curriculum,
    subject: params.subject,
    schoolName: params.schoolName,
    institutionTrack: params.institutionTrack,
    subjectScopeSummary: params.subjectScopeSummary,
  });

  const systemInstruction = `Anda adalah Curriculum Specialist & Instructional Designer profesional untuk sistem pendidikan Indonesia (Kemendikdasmen & Kementerian Agama).
Tugas Anda menyusun pemetaan kurikulum lengkap untuk satu tahun ajaran sesuai jenjang, kelas, fase, satuan pendidikan (${regCtx.track === 'madrasah' ? 'Madrasah / KMA' : 'Sekolah Umum / Permendikbudristek'}), dan kurikulum yang dipilih.
ATURAN WAJIB:
1. Sesuaikan istilah dan struktur dengan kurikulum dan regulasi yang dipilih (${params.curriculum}; ${regulationRef}). Jangan mencampur istilah K-13 (KI/KD) ke Kurikulum Merdeka (Elemen/CP/TP/ATP) atau sebaliknya.
2. JANGAN mengarang kutipan CP resmi pemerintah atau nomor halaman palsu. Selalu cantumkan pada verificationNote bahwa CP/TP merupakan draf rekomendasi AI yang perlu diverifikasi dengan dokumen resmi (${regCtx.track === 'madrasah' ? 'KMA 450/2024 / KMA 183/2019 Kemenag' : 'BSKAP Permendikbudristek 12/2024'}).
3. Prioritaskan materi dari buku referensi yang diberikan guru apabila tersedia. Apabila belum ada buku, pastikan topik dan elemen 100% sesuai dengan ruang lingkup resmi mata pelajaran untuk kelas/fase target.
4. PATUHI STANDAR JAM TATAP MUKA (${regulationRef}): Alokasi ${jpPerWeek} JP Intrakurikuler/minggu (${minutesPerJp} menit/JP) dengan ${effectiveWeeks} minggu efektif/tahun sehingga TOTAL AKUMULASI estimatedJp seluruh topik dalam 1 tahun ajaran HARUS mendekati ${targetAnnualJp} JP, dan tiap pertemuan umumnya ${std.recommendedJpPerMeeting} JP.
5. Gunakan Bahasa Indonesia baku, terukur (Kata Kerja Operasional), dan sesuai usia peserta didik.`;

  const contents = `Susun pemetaan kurikulum AI Auto Curriculum lengkap untuk:
- Jenjang: ${params.level}
- Kelas / Fase: ${params.grade} / ${params.phase}
- Kurikulum: ${params.curriculum}
- Mata Pelajaran: ${params.subject}
- Tahun Ajaran / Semester: ${params.academicYear} / ${params.semester}
- Alokasi Jam Tatap Muka: ${jpPerWeek} JP/minggu (@ ${minutesPerJp} menit/JP${std.p5JpPerWeek > 0 ? `, terpisah dari ${std.p5JpPerWeek} JP P5/minggu` : ''})
- Target Total JP 1 Tahun: ± ${targetAnnualJp} JP (${effectiveWeeks} minggu efektif; tiap pertemuan ± ${std.recommendedJpPerMeeting} JP)

${regulationDirective}

Referensi Buku Tersedia:
${params.textbookContext || 'Belum ada buku diunggah. Gunakan struktur materi standar resmi sesuai peraturan di atas dan tandai sebagai draf rekomendasi AI.'}

Preferensi Guru:
- Gaya Bahasa: ${params.aiPreferences?.tone || 'Akademik formal dan komunikatif'}
- Tingkat Detail: ${params.aiPreferences?.detailLevel || 'Lengkap dan terstruktur'}`;

  return generateWithFallback(params.aiPreferences?.model, async (activeModel) => {
    const response = await ai.models.generateContent({
      model: activeModel,
      contents,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isAiDraft: { type: Type.BOOLEAN },
            verificationDisclaimer: { type: Type.STRING },
            elements: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  elementName: { type: Type.STRING },
                  cpSummary: { type: Type.STRING },
                  competencies: { type: Type.ARRAY, items: { type: Type.STRING } },
                  scopeOfMaterial: { type: Type.ARRAY, items: { type: Type.STRING } },
                  graduateProfileDimensions: { type: Type.ARRAY, items: { type: Type.STRING } },
                  verificationNote: { type: Type.STRING },
                  topics: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        topicTitle: { type: Type.STRING },
                        subtopics: { type: Type.ARRAY, items: { type: Type.STRING } },
                        tpCode: { type: Type.STRING },
                        tpDescription: { type: Type.STRING },
                        atpOrder: { type: Type.INTEGER },
                        indicators: { type: Type.ARRAY, items: { type: Type.STRING } },
                        estimatedMeetings: { type: Type.INTEGER },
                        estimatedJp: { type: Type.INTEGER },
                        bookReference: { type: Type.STRING },
                      },
                      required: ['topicTitle', 'subtopics', 'tpCode', 'tpDescription', 'atpOrder', 'indicators', 'estimatedMeetings', 'estimatedJp', 'bookReference'],
                    },
                  },
                },
                required: ['elementName', 'cpSummary', 'competencies', 'scopeOfMaterial', 'graduateProfileDimensions', 'verificationNote', 'topics'],
              },
            },
          },
          required: ['isAiDraft', 'verificationDisclaimer', 'elements'],
        },
      },
    });
    return JSON.parse((response.text ?? '{}').trim());
  });
}

export async function generateProtaProsem(params: {
  workspace: any;
  calendarSummary: string;
  textbookContext?: string;
  aiPreferences?: Record<string, string>;
}) {
  const ai = getAiClient();
  const regDirective = buildRegulationDirective({
    level: params.workspace?.level,
    grade: params.workspace?.grade,
    subject: params.workspace?.subject,
    curriculum: params.workspace?.curriculum,
  });
  const std = getOfficialJpStandard({
    level: params.workspace?.level,
    grade: params.workspace?.grade,
    subject: params.workspace?.subject,
    curriculum: params.workspace?.curriculum,
  });
  const jpPerWeek = Number(params.workspace?.jpPerWeek || std.jpPerWeek);
  const targetAnnualJp = jpPerWeek * std.effectiveWeeksPerYear;
  const sem1TargetJp = jpPerWeek * std.semester1Weeks;
  const sem2TargetJp = jpPerWeek * std.semester2Weeks;

  const contents = `Susun Program Tahunan (PROTA) dan Program Semester (PROSEM) sesuai standar resmi (${std.regulationRef}) untuk:
Mata Pelajaran: ${params.workspace.subject}
Jenjang/Kelas/Fase: ${params.workspace.level} / ${params.workspace.grade} / ${params.workspace.phase}
Kurikulum: ${params.workspace.curriculum}
Tahun Ajaran: ${params.workspace.academicYear}
Alokasi Jam Tatap Muka: ${jpPerWeek} JP/minggu (1 JP = ${std.minutesPerJp} menit)
Target Total JP Resmi: ${targetAnnualJp} JP/tahun (${std.semester1Weeks} minggu efektif Semester 1 ≈ ${sem1TargetJp} JP; ${std.semester2Weeks} minggu efektif Semester 2 ≈ ${sem2TargetJp} JP)

${regDirective}

Ringkasan Kalender Pendidikan & Minggu Efektif:
${params.calendarSummary}

${params.textbookContext ? `Data & Struktur Buku Referensi:\n${params.textbookContext.slice(0, 12000)}\n` : ''}
Data Kurikulum & TP/ATP:
${JSON.stringify(params.workspace.curriculumData?.elements || []).slice(0, 25000)}

Instruksi Wajib:
1. Distribusikan semua materi pokok dan TP ke "Semester 1" (bulan Juli, Agustus, September, Oktober, November, Desember; total ≈ ${sem1TargetJp} JP) dan "Semester 2" (bulan Januari, Februari, Maret, April, Mei, Juni; total ≈ ${sem2TargetJp} JP) sehingga total jpAllocation pada protaRows dan totalJpYear mendekati ${targetAnnualJp} JP.
2. Pada prosemItems, gunakan nama bulan lengkap baku bahasa Indonesia ("Juli", "Agustus", "September", "Oktober", "November", "Desember", "Januari", "Februari", "Maret", "April", "Mei", "Juni"), weekNumber strictly antara 1 sampai 4, semester strictly "Semester 1" atau "Semester 2", dan jpAllocation per pertemuan konsisten dengan beban mingguan (${std.recommendedJpPerMeeting} JP per pertemuan atau sesuai ${jpPerWeek} JP/minggu).
3. KESESUAIAN JAM WAJIB 100%: Untuk SETIAP baris pada protaRows (kecuali jika JP=0), kelompokkan prosemItems dengan string "topic", "tpCode", dan "semester" yang SAMA PERSIS dengan protaRows tersebut. Jumlah seluruh jpAllocation prosemItems untuk setiap topic & tpCode WAJIB SAMA PERSIS dengan jpAllocation baris PROTA terkait, sehingga total JP PROMES Semester 1 === total JP PROTA Semester 1, total JP PROMES Semester 2 === total JP PROTA Semester 2, dan total JP PROMES 1 Tahun === total JP PROTA 1 Tahun (total 24-36 prosemItems untuk 1 tahun).
4. Sertakan evaluationCalendar berisi jadwal evaluasi semester (misalnya September: Sumatif Tengah Semester, Desember: Sumatif Akhir Semester, Maret: Sumatif Tengah Semester, Juni: Sumatif Akhir Tahun) dengan status default "DRAF".`;

  return generateWithFallback(params.aiPreferences?.model, async (activeModel) => {
    const response = await ai.models.generateContent({
      model: activeModel,
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            protaRows: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  semester: { type: Type.STRING },
                  element: { type: Type.STRING },
                  tpCode: { type: Type.STRING },
                  tpDescription: { type: Type.STRING },
                  topic: { type: Type.STRING },
                  jpAllocation: { type: Type.INTEGER },
                  timeDistribution: { type: Type.STRING },
                },
                required: ['semester', 'element', 'tpCode', 'tpDescription', 'topic', 'jpAllocation', 'timeDistribution'],
              },
            },
            prosemItems: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  semester: { type: Type.STRING },
                  month: { type: Type.STRING },
                  weekNumber: { type: Type.INTEGER },
                  meetingNumber: { type: Type.INTEGER },
                  tpCode: { type: Type.STRING },
                  topic: { type: Type.STRING },
                  subtopic: { type: Type.STRING },
                  jpAllocation: { type: Type.INTEGER },
                  plannedDate: { type: Type.STRING },
                },
                required: ['semester', 'month', 'weekNumber', 'meetingNumber', 'tpCode', 'topic', 'subtopic', 'jpAllocation', 'plannedDate'],
              },
            },
            evaluationCalendar: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  period: { type: Type.STRING },
                  evaluationType: { type: Type.STRING },
                  status: { type: Type.STRING },
                  essentialMaterial: { type: Type.STRING },
                },
                required: ['period', 'evaluationType', 'status', 'essentialMaterial'],
              },
            },
            totalJpYear: { type: Type.INTEGER },
            summaryNote: { type: Type.STRING },
          },
          required: ['protaRows', 'prosemItems', 'evaluationCalendar', 'totalJpYear', 'summaryNote'],
        },
      },
    });
    const parsed = JSON.parse((response.text ?? '{}').trim());
    const reconciled = reconcileProtaAndProsem({
      protaRows: parsed.protaRows || [],
      prosemItems: parsed.prosemItems || [],
      jpPerWeek,
      recommendedJpPerMeeting: std.recommendedJpPerMeeting,
      defaultSubject: params.workspace?.subject,
    });
    return {
      ...parsed,
      protaRows: reconciled.protaRows,
      prosemItems: reconciled.prosemItems,
      totalJpYear: reconciled.totalJpYear,
    };
  });
}

const MODUL_AJAR_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    informasiUmum: {
      type: Type.OBJECT,
      properties: {
        kompetensiAwal: { type: Type.STRING },
        karakteristikPesertaDidik: { type: Type.STRING },
        saranaPrasarana: { type: Type.ARRAY, items: { type: Type.STRING } },
        targetPesertaDidik: { type: Type.STRING },
        modelPembelajaran: { type: Type.STRING },
        metodePembelajaran: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['kompetensiAwal', 'karakteristikPesertaDidik', 'saranaPrasarana', 'targetPesertaDidik', 'modelPembelajaran', 'metodePembelajaran'],
    },
    komponenInti: {
      type: Type.OBJECT,
      properties: {
        capaianPembelajaran: { type: Type.STRING },
        tujuanPembelajaran: { type: Type.ARRAY, items: { type: Type.STRING } },
        pemahamanBermakna: { type: Type.STRING },
        pertanyaanPemantik: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['capaianPembelajaran', 'tujuanPembelajaran', 'pemahamanBermakna', 'pertanyaanPemantik'],
    },
    langkahPembelajaran: {
      type: Type.OBJECT,
      properties: {
        pendahuluan: {
          type: Type.OBJECT,
          properties: {
            estimasiMenit: { type: Type.INTEGER },
            aktivitas: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['estimasiMenit', 'aktivitas'],
        },
        inti: {
          type: Type.OBJECT,
          properties: {
            estimasiMenit: { type: Type.INTEGER },
            aktivitas: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['estimasiMenit', 'aktivitas'],
        },
        penutup: {
          type: Type.OBJECT,
          properties: {
            estimasiMenit: { type: Type.INTEGER },
            aktivitas: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['estimasiMenit', 'aktivitas'],
        },
      },
      required: ['pendahuluan', 'inti', 'penutup'],
    },
    diferensiasi: {
      type: Type.OBJECT,
      properties: {
        konten: { type: Type.STRING },
        proses: { type: Type.STRING },
        produk: { type: Type.STRING },
        kesiapanMinat: { type: Type.STRING },
      },
      required: ['konten', 'proses', 'produk', 'kesiapanMinat'],
    },
    asesmen: {
      type: Type.OBJECT,
      properties: {
        diagnostik: { type: Type.STRING },
        formatif: { type: Type.STRING },
        sumatif: { type: Type.STRING },
      },
      required: ['diagnostik', 'formatif', 'sumatif'],
    },
    pengayaan: { type: Type.STRING },
    remedial: { type: Type.STRING },
    refleksiGuru: { type: Type.ARRAY, items: { type: Type.STRING } },
    refleksiSiswa: { type: Type.ARRAY, items: { type: Type.STRING } },
    referensi: { type: Type.STRING },
  },
  required: ['informasiUmum', 'komponenInti', 'langkahPembelajaran', 'diferensiasi', 'asesmen', 'pengayaan', 'remedial', 'refleksiGuru', 'refleksiSiswa', 'referensi'],
};

const BAHAN_AJAR_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    pertemuanKe: { type: Type.INTEGER },
    alokasiWaktu: { type: Type.STRING },
    materiPokok: { type: Type.STRING },
    submateri: { type: Type.STRING },
    tujuanPembelajaran: { type: Type.STRING },
    pemahamanBermakna: { type: Type.STRING },
    pertanyaanPemantik: { type: Type.ARRAY, items: { type: Type.STRING } },
    penjelasanMateri: { type: Type.ARRAY, items: { type: Type.STRING } },
    konsepPenting: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          istilah: { type: Type.STRING },
          definisi: { type: Type.STRING },
        },
        required: ['istilah', 'definisi'],
      },
    },
    contohPenerapan: { type: Type.ARRAY, items: { type: Type.STRING } },
    deskripsiIlustrasi: { type: Type.STRING },
    aktivitasPembelajaran: { type: Type.ARRAY, items: { type: Type.STRING } },
    rangkuman: { type: Type.STRING },
    latihanSoal: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          soal: { type: Type.STRING },
          jawabanSingkat: { type: Type.STRING },
        },
        required: ['soal', 'jawabanSingkat'],
      },
    },
    refleksiSiswa: { type: Type.ARRAY, items: { type: Type.STRING } },
    referensiBuku: { type: Type.STRING },
  },
  required: [
    'pertemuanKe', 'alokasiWaktu', 'materiPokok', 'submateri', 'tujuanPembelajaran',
    'pemahamanBermakna', 'pertanyaanPemantik', 'penjelasanMateri', 'konsepPenting',
    'contohPenerapan', 'deskripsiIlustrasi', 'aktivitasPembelajaran', 'rangkuman',
    'latihanSoal', 'refleksiSiswa', 'referensiBuku',
  ],
};

const LKPD_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    jenisLkpd: { type: Type.STRING },
    judulKegiatan: { type: Type.STRING },
    identitasLkpd: {
      type: Type.OBJECT,
      properties: {
        topik: { type: Type.STRING },
        subtema: { type: Type.STRING },
        kelas: { type: Type.STRING },
        semester: { type: Type.STRING },
        alokasiWaktu: { type: Type.STRING },
      },
      required: ['topik', 'subtema', 'kelas', 'semester', 'alokasiWaktu'],
    },
    petaKebutuhan: { type: Type.STRING },
    capaianKompetensi: { type: Type.STRING },
    tujuan: { type: Type.STRING },
    petunjukPengerjaan: { type: Type.ARRAY, items: { type: Type.STRING } },
    alatDanBahan: { type: Type.ARRAY, items: { type: Type.STRING } },
    materiSingkat: { type: Type.STRING },
    langkahKegiatan: { type: Type.ARRAY, items: { type: Type.STRING } },
    aktivitasUtama: { type: Type.STRING },
    pertanyaanPemahaman: { type: Type.ARRAY, items: { type: Type.STRING } },
    tugasPraktik: { type: Type.STRING },
    kolomTabelPengamatan: { type: Type.ARRAY, items: { type: Type.STRING } },
    panduanKesimpulan: { type: Type.STRING },
    soalSingkatPenilaian: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          soal: { type: Type.STRING },
          skorMaksimal: { type: Type.INTEGER },
        },
        required: ['soal', 'skorMaksimal'],
      },
    },
    refleksi: { type: Type.ARRAY, items: { type: Type.STRING } },
    rubrikPenilaian: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          aspek: { type: Type.STRING },
          skorMaksimal: { type: Type.INTEGER },
          kriteria: { type: Type.STRING },
        },
        required: ['aspek', 'skorMaksimal', 'kriteria'],
      },
    },
  },
  required: [
    'jenisLkpd', 'judulKegiatan', 'identitasLkpd', 'petaKebutuhan', 'capaianKompetensi',
    'tujuan', 'petunjukPengerjaan', 'alatDanBahan', 'materiSingkat', 'langkahKegiatan',
    'aktivitasUtama', 'pertanyaanPemahaman', 'tugasPraktik', 'kolomTabelPengamatan',
    'panduanKesimpulan', 'soalSingkatPenilaian', 'refleksi', 'rubrikPenilaian',
  ],
};

export async function generateModulAjar(params: {
  workspace: any;
  topic: string;
  subtopic?: string;
  meetingNumber?: number;
  semester?: string;
  tpDescription: string;
  learningModel: string;
  durationJp: number;
  textbookContext?: string;
  aiPreferences?: Record<string, string>;
}) {
  const ai = getAiClient();
  const std = getOfficialJpStandard({
    level: params.workspace?.level,
    grade: params.workspace?.grade,
    subject: params.workspace?.subject,
    curriculum: params.workspace?.curriculum,
  });
  const jp = Number(params.durationJp || std.recommendedJpPerMeeting);
  const minutesPerJp = getMinutesPerJp(params.workspace?.level, params.workspace?.grade);
  const splits = getDefaultPhaseSplits(jp, minutesPerJp);
  const durationStr = formatJpDuration(jp, params.workspace?.level, params.workspace?.grade);

  const regDirective = buildRegulationDirective({
    level: params.workspace?.level,
    grade: params.workspace?.grade,
    subject: params.workspace?.subject,
    curriculum: params.workspace?.curriculum,
  });
  const meetingLine = params.meetingNumber ? `\nPertemuan Ke: Pertemuan ke-${params.meetingNumber}` : '';
  const subtopicLine = params.subtopic ? `\nSubmateri Pertemuan: ${params.subtopic}` : '';
  const contents = `Susun Modul Ajar / RPP lengkap sesuai ${params.workspace.curriculum} dan regulasi ${std.regulationRef} untuk:
Mata Pelajaran: ${params.workspace.subject}
Jenjang/Kelas/Fase: ${params.workspace.level} / ${params.workspace.grade} / ${params.workspace.phase}
Semester: ${params.semester || params.workspace.semester} | Tahun Ajaran: ${params.workspace.academicYear}${meetingLine}
Materi Pokok: ${params.topic}${subtopicLine}
Tujuan Pembelajaran: ${params.tpDescription}
Model Pembelajaran: ${params.learningModel}
Alokasi Waktu Resmi (${std.regulationRef}): ${durationStr} (1 JP = ${minutesPerJp} Menit; Total = ${splits.totalMenit} Menit)

${regDirective}

Sumber Referensi: ${params.textbookContext || 'Sesuaikan dengan materi resmi mata pelajaran dan tandai sumber yang perlu diverifikasi.'}

Wajib memuat Informasi Umum, Komponen Inti, Langkah Pembelajaran (Pendahuluan, Inti, Penutup dengan jumlah estimasiMenit WAJIB TEPAT ${splits.totalMenit} menit — contoh: Pendahuluan ${splits.pendahuluan} menit, Inti ${splits.inti} menit, Penutup ${splits.penutup} menit), Diferensiasi (Konten, Proses, Produk), serta Asesmen (Diagnostik, Formatif, Sumatif).`;

  return generateWithFallback(params.aiPreferences?.model, async (model) => {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: MODUL_AJAR_SCHEMA,
      },
    });
    return JSON.parse((response.text ?? '{}').trim());
  });
}

export async function generateBahanAjarMeeting(params: {
  workspace: any;
  meetingNumber: number;
  semester?: string;
  topic: string;
  subtopic: string;
  tpDescription: string;
  jpAllocation: number;
  textbookContext?: string;
  aiPreferences?: Record<string, string>;
}) {
  const ai = getAiClient();
  const std = getOfficialJpStandard({
    level: params.workspace?.level,
    grade: params.workspace?.grade,
    subject: params.workspace?.subject,
    curriculum: params.workspace?.curriculum,
  });
  const jp = Number(params.jpAllocation || std.recommendedJpPerMeeting);
  const durationStr = formatJpDuration(jp, params.workspace?.level, params.workspace?.grade);

  const regDirective = buildRegulationDirective({
    level: params.workspace?.level,
    grade: params.workspace?.grade,
    subject: params.workspace?.subject,
    curriculum: params.workspace?.curriculum,
  });
  const contents = `Buat Bahan Ajar LENGKAP dan SIAP AJAR khusus untuk Pertemuan ke-${params.meetingNumber}.
Mata Pelajaran: ${params.workspace.subject}
Jenjang/Kelas/Fase: ${params.workspace.level} / ${params.workspace.grade} / ${params.workspace.phase}
Semester: ${params.semester || params.workspace.semester}
Materi Pokok: ${params.topic}
Submateri Pertemuan ${params.meetingNumber}: ${params.subtopic}
Alokasi Waktu Resmi (${std.regulationRef}): ${durationStr} (WAJIB isi field "alokasiWaktu" tepat "${durationStr}")
Tujuan Pembelajaran: ${params.tpDescription}

${regDirective}

Referensi Buku: ${params.textbookContext || 'Gunakan acuan resmi kurikulum & standar ruang lingkup mata pelajaran; jangan mengarang nomor halaman palsu.'}

Susun uraian materi yang mendalam, akurat secara keilmuan, mudah dipahami siswa sesuai usianya, dengan contoh penerapan nyata, deskripsi ilustrasi/diagram pendukung, aktivitas pembelajaran, rangkuman, latihan soal beserta kunci singkat, dan pertanyaan refleksi.`;

  return generateWithFallback(params.aiPreferences?.model, async (model) => {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: BAHAN_AJAR_SCHEMA,
      },
    });
    return JSON.parse((response.text ?? '{}').trim());
  });
}

export async function generateLkpd(params: {
  workspace: any;
  meetingNumber: number;
  semester?: string;
  topic: string;
  subtopic?: string;
  tpDescription: string;
  lkpdType: string;
  jpAllocation?: number;
  textbookContext?: string;
  aiPreferences?: Record<string, string>;
}) {
  const ai = getAiClient();
  const std = getOfficialJpStandard({
    level: params.workspace?.level,
    grade: params.workspace?.grade,
    subject: params.workspace?.subject,
    curriculum: params.workspace?.curriculum,
  });
  const jp = Number(params.jpAllocation || std.recommendedJpPerMeeting);
  const durationStr = formatJpDuration(jp, params.workspace?.level, params.workspace?.grade);
  const regDirective = buildRegulationDirective({
    level: params.workspace?.level,
    grade: params.workspace?.grade,
    subject: params.workspace?.subject,
    curriculum: params.workspace?.curriculum,
  });
  const subtopicLine = params.subtopic ? `\nSubmateri Pertemuan: ${params.subtopic}` : '';
  const contents = `Buat Lembar Kerja Peserta Didik (LKPD) tipe "${params.lkpdType}" yang siap pakai di kelas untuk:
Mata Pelajaran: ${params.workspace.subject}
Jenjang/Kelas/Fase: ${params.workspace.level} / ${params.workspace.grade} / ${params.workspace.phase || '-'}
Semester / Tahun Ajaran: ${params.semester || params.workspace.semester} / ${params.workspace.academicYear}
Pertemuan ke-${params.meetingNumber}
Alokasi Waktu Resmi (${std.regulationRef}): ${durationStr} (WAJIB isi field identitasLkpd.alokasiWaktu dengan "${durationStr}")
Materi / Topik: ${params.topic}${subtopicLine}
Tujuan Pembelajaran / CP / TP: ${params.tpDescription}

${regDirective}

Referensi Buku/Sumber: ${params.textbookContext || 'Sesuaikan dengan kurikulum dan ruang lingkup resmi mata pelajaran.'}

WAJIB memuat lengkap 6 Komponen Utama LKPD:
1. Judul (memuat topik, tema/subtema, kelas, semester, dan alokasi waktu "${durationStr}").
2. Petunjuk Belajar (arahan singkat dan runtut cara mengerjakan LKPD bagi peserta didik).
3. Kompetensi / Tujuan Pembelajaran (mengacu pada CP/TP Kurikulum Merdeka atau KD).
4. Informasi Pendukung (ringkasan materi/gambaran umum konteks tugas serta alat dan bahan).
5. Tugas & Langkah Kerja (instruksi kegiatan terurut, aktivitas utama, kolom tabel pengamatan/kerja, pertanyaan pemahaman, tugas praktik, dan panduan kesimpulan).
6. Penilaian (pendekatan Penilaian Acuan Patokan / PAP: soal singkat evaluasi, refleksi siswa, serta rubrik penilaian aspek, kriteria, dan skor maksimal).`;

  return generateWithFallback(params.aiPreferences?.model, async (model) => {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: LKPD_SCHEMA,
      },
    });
    return JSON.parse((response.text ?? '{}').trim());
  });
}

export interface BatchMeetingSpec {
  meetingNumber: number;
  topic: string;
  subtopic: string;
  tpDescription: string;
  jpAllocation: number;
}

export async function generateDeviceBatch(params: {
  docType: 'modul_ajar' | 'bahan_ajar' | 'lkpd';
  workspace: any;
  semester: string;
  meetings: BatchMeetingSpec[];
  learningModel?: string;
  lkpdType?: string;
  textbookContext?: string;
  aiPreferences?: Record<string, string>;
}): Promise<Array<{ meetingNumber: number; data: any }>> {
  const meetings = Array.isArray(params.meetings) ? params.meetings.slice(0, 5) : [];
  if (meetings.length === 0) return [];

  const std = getOfficialJpStandard({
    level: params.workspace?.level,
    grade: params.workspace?.grade,
    subject: params.workspace?.subject,
    curriculum: params.workspace?.curriculum,
  });
  const minutesPerJp = getMinutesPerJp(params.workspace?.level, params.workspace?.grade);

  const runSingle = async (m: BatchMeetingSpec) => {
    const jp = Number(m.jpAllocation || std.recommendedJpPerMeeting);
    if (params.docType === 'modul_ajar') {
      return generateModulAjar({
        workspace: params.workspace,
        topic: m.topic,
        subtopic: m.subtopic,
        meetingNumber: m.meetingNumber,
        semester: params.semester,
        tpDescription: m.tpDescription,
        learningModel: params.learningModel || 'Problem Based Learning (PBL)',
        durationJp: jp,
        textbookContext: params.textbookContext,
        aiPreferences: params.aiPreferences,
      });
    }
    if (params.docType === 'bahan_ajar') {
      return generateBahanAjarMeeting({
        workspace: params.workspace,
        meetingNumber: m.meetingNumber,
        semester: params.semester,
        topic: m.topic,
        subtopic: m.subtopic || m.topic,
        tpDescription: m.tpDescription,
        jpAllocation: jp,
        textbookContext: params.textbookContext,
        aiPreferences: params.aiPreferences,
      });
    }
    return generateLkpd({
      workspace: params.workspace,
      meetingNumber: m.meetingNumber,
      semester: params.semester,
      topic: m.topic,
      subtopic: m.subtopic || m.topic,
      tpDescription: m.tpDescription,
      lkpdType: params.lkpdType || 'LKPD Kelompok',
      jpAllocation: jp,
      textbookContext: params.textbookContext,
      aiPreferences: params.aiPreferences,
    });
  };

  if (meetings.length === 1) {
    const data = await runSingle(meetings[0]);
    return [{ meetingNumber: meetings[0].meetingNumber, data }];
  }

  const ai = getAiClient();
  const itemSchema =
    params.docType === 'modul_ajar'
      ? MODUL_AJAR_SCHEMA
      : params.docType === 'bahan_ajar'
      ? BAHAN_AJAR_SCHEMA
      : LKPD_SCHEMA;

  const docLabel =
    params.docType === 'modul_ajar'
      ? `Modul Ajar / RPP (Model: ${params.learningModel || 'Problem Based Learning (PBL)'})`
      : params.docType === 'bahan_ajar'
      ? 'Bahan Ajar Siap Ajar Per Pertemuan'
      : `LKPD (${params.lkpdType || 'LKPD Kelompok'}) lengkap 6 komponen utama`;

  const meetingListText = meetings
    .map((m) => {
      const jp = Number(m.jpAllocation || std.recommendedJpPerMeeting);
      const dur = formatJpDuration(jp, params.workspace?.level, params.workspace?.grade);
      const splits = getDefaultPhaseSplits(jp, minutesPerJp);
      return `- Pertemuan ke-${m.meetingNumber} | Materi Pokok: ${m.topic} | Submateri: ${m.subtopic} | Alokasi Resmi: ${dur} (Pendahuluan ${splits.pendahuluan}m + Inti ${splits.inti}m + Penutup ${splits.penutup}m = ${splits.totalMenit}m) | TP: ${m.tpDescription}`;
    })
    .join('\n');

  const regDirective = buildRegulationDirective({
    level: params.workspace?.level,
    grade: params.workspace?.grade,
    subject: params.workspace?.subject,
    curriculum: params.workspace?.curriculum,
  });
  const contents = `Susun ${docLabel} secara terpisah untuk MASING-MASING dari ${meetings.length} pertemuan berikut secara lengkap dan siap pakai:
Mata Pelajaran: ${params.workspace.subject}
Jenjang/Kelas/Fase: ${params.workspace.level} / ${params.workspace.grade} / ${params.workspace.phase || '-'} (Standar ${std.regulationRef}: 1 JP = ${minutesPerJp} Menit)
Kurikulum: ${params.workspace.curriculum}
Semester / Tahun Ajaran: ${params.semester} / ${params.workspace.academicYear}

${regDirective}

Referensi Buku: ${params.textbookContext || 'Sesuaikan dengan kurikulum dan buku teks mata pelajaran; jangan mengarang nomor halaman palsu.'}

Daftar Pertemuan Target:
${meetingListText}

Instruksi Penting:
1. Hasilkan array "items" berisi tepat ${meetings.length} objek, satu untuk setiap pertemuan dengan "meetingNumber" yang sama persis.
2. Setiap objek "data" harus fokus khusus pada submateri dan pertemuan ke-N tersebut (tidak menyalin mentah pertemuan lain).
3. WAJIB patuhi durasi alokasi waktu resmi per pertemuan (1 JP = ${minutesPerJp} menit) pada estimasiMenit langkah pembelajaran maupun field alokasiWaktu.`;

  const resultMap = new Map<number, any>();
  try {
    const parsed = await generateWithFallback(params.aiPreferences?.model, async (model) => {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    meetingNumber: { type: Type.INTEGER },
                    data: itemSchema,
                  },
                  required: ['meetingNumber', 'data'],
                },
              },
            },
            required: ['items'],
          },
        },
      });
      return JSON.parse((response.text ?? '{}').trim());
    });

    if (Array.isArray(parsed?.items)) {
      for (const entry of parsed.items) {
        if (entry && entry.data && typeof entry.meetingNumber === 'number') {
          resultMap.set(entry.meetingNumber, entry.data);
        }
      }
    }
  } catch (err) {
    // If batch JSON fails with non-quota error, fall back per meeting below; rethrow quota/auth errors immediately
    const info = parseUpstreamError(err);
    if (info.status === 429 || info.status === 403 || info.status === 401) {
      throw toFriendlyAiError(err);
    }
  }

  const finalItems: Array<{ meetingNumber: number; data: any }> = [];
  for (const m of meetings) {
    let data = resultMap.get(m.meetingNumber);
    if (!data) {
      data = await runSingle(m);
    }
    finalItems.push({ meetingNumber: m.meetingNumber, data });
  }
  return finalItems;
}

export async function generatePowerPoint(params: {
  workspace: any;
  meetingNumber: number;
  topic: string;
  tpDescription: string;
  slideCount: number;
  theme: string;
  languageLevel: string;
  includeAnimation: boolean;
  textbookContext?: string;
  aiPreferences?: Record<string, string>;
}) {
  const ai = getAiClient();
  const regDirective = buildRegulationDirective({
    level: params.workspace?.level,
    grade: params.workspace?.grade,
    subject: params.workspace?.subject,
    curriculum: params.workspace?.curriculum,
  });
  const contents = `Rancang presentasi PowerPoint pembelajaran yang visual, modern, ringkas (hindari slide penuh teks!), dan edukatif untuk:
Mata Pelajaran: ${params.workspace.subject}
Jenjang/Kelas: ${params.workspace.level} / ${params.workspace.grade}
Pertemuan ke-${params.meetingNumber}
Materi: ${params.topic}
Tujuan Pembelajaran: ${params.tpDescription}
Jumlah Slide Target: ${params.slideCount} slide
Tema Desain: ${params.theme}
Tingkat Bahasa: ${params.languageLevel}
Sertakan Animasi & Transisi: ${params.includeAnimation ? 'Ya, proporsional untuk menjelaskan konsep bertahap' : 'Minimal'}

${regDirective}

Referensi Buku: ${params.textbookContext || 'Sesuaikan dengan materi dan kurikulum aktif.'}

Susun setiap slide dengan maksimal 3-5 poin ringkas (maks 12 kata per poin), saran visual/diagram terstruktur (diagramType & diagramNodes), catatan animasi muncul bertahap, dan catatan presenter untuk guru.`;

  return generateWithFallback(params.aiPreferences?.model, async (model) => {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            deckTitle: { type: Type.STRING },
            theme: { type: Type.STRING },
            slides: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  slideNumber: { type: Type.INTEGER },
                  slideType: { type: Type.STRING },
                  title: { type: Type.STRING },
                  subtitle: { type: Type.STRING },
                  bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
                  visualPrompt: { type: Type.STRING },
                  diagramType: { type: Type.STRING },
                  diagramNodes: { type: Type.ARRAY, items: { type: Type.STRING } },
                  animationNote: { type: Type.STRING },
                  transition: { type: Type.STRING },
                  presenterNotes: { type: Type.STRING },
                },
                required: ['slideNumber', 'slideType', 'title', 'bullets', 'diagramType', 'presenterNotes'],
              },
            },
          },
          required: ['deckTitle', 'theme', 'slides'],
        },
      },
    });
    return JSON.parse((response.text ?? '{}').trim());
  });
}

export async function generateQuestionsAndKisiKisi(params: {
  workspace: any;
  topic: string;
  tpCode: string;
  tpDescription: string;
  questionCount: number;
  questionTypes: string[];
  category: string;
  difficultyMix: { mudah: number; sedang: number; sulit: number };
  hotsMix: { lots: number; mots: number; hots: number };
  textbookContext?: string;
  aiPreferences?: Record<string, string>;
}) {
  const ai = getAiClient();
  const count = Math.max(1, Math.min(50, params.questionCount));
  const regDirective = buildRegulationDirective({
    level: params.workspace?.level,
    grade: params.workspace?.grade,
    subject: params.workspace?.subject,
    curriculum: params.workspace?.curriculum,
  });
  const contents = `Buat TEPAT ${count} butir soal berkualitas tinggi beserta kisi-kisinya untuk:
Mata Pelajaran: ${params.workspace.subject}
Jenjang/Kelas: ${params.workspace.level} / ${params.workspace.grade}
TP (${params.tpCode}): ${params.tpDescription}
Materi: ${params.topic}
Kategori Asesmen: ${params.category}
Jenis Soal yang Diminta: ${params.questionTypes.join(', ')}
Proporsi Kesulitan: Mudah ${params.difficultyMix.mudah}%, Sedang ${params.difficultyMix.sedang}%, Sulit ${params.difficultyMix.sulit}%
Proporsi Kognitif: LOTS ${params.hotsMix.lots}%, MOTS ${params.hotsMix.mots}%, HOTS ${params.hotsMix.hots}%

${regDirective}

Referensi: ${params.textbookContext || 'Materi pembelajaran kelas terkait sesuai regulasi resmi'}

ATURAN WAJIB:
1. Hasilkan TEPAT ${count} item soal.
2. Untuk pilihan_ganda / literasi / numerasi / hots berbentuk pilihan, berikan 4-5 opsi jelas di array options (mis. ["A. ...", "B. ...", "C. ...", "D. ..."]) dan pastikan correctAnswer cocok persis dengan huruf atau jawaban benar (mis. "A" atau teks kunci untuk isian/benar_salah).
3. Untuk benar_salah, options = ["Benar", "Salah"] dan correctAnswer = "Benar" atau "Salah".
4. Untuk uraian / studi_kasus / praktik, berikan rubrik penilaian yang terukur pada field rubric.
5. Pastikan kunci jawaban 100% konsisten dan benar secara keilmuan serta disertai pembahasan lengkap.`;

  return generateWithFallback(params.aiPreferences?.model, async (model) => {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  questionType: { type: Type.STRING },
                  cognitiveLevel: { type: Type.STRING },
                  hotsTier: { type: Type.STRING },
                  difficulty: { type: Type.STRING },
                  stem: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctAnswer: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                  indicator: { type: Type.STRING },
                  rubric: { type: Type.STRING },
                  points: { type: Type.INTEGER },
                  sourceRef: { type: Type.STRING },
                },
                required: [
                  'questionType', 'cognitiveLevel', 'hotsTier', 'difficulty',
                  'stem', 'options', 'correctAnswer', 'explanation', 'indicator', 'rubric', 'points',
                ],
              },
            },
          },
          required: ['questions'],
        },
      },
    });
    return JSON.parse((response.text ?? '{}').trim());
  });
}

export async function gradeEssayWithAi(params: {
  questionStem: string;
  studentAnswer: string;
  correctAnswer: string;
  rubric: string;
  maxPoints: number;
}) {
  const ai = getAiClient();
  const contents = `Nilai jawaban uraian siswa secara objektif berdasarkan rubrik berikut:
Pertanyaan: ${params.questionStem}
Kunci/Acuan Jawaban: ${params.correctAnswer}
Rubrik: ${params.rubric}
Skor Maksimal: ${params.maxPoints}
Jawaban Siswa: ${params.studentAnswer || '(Tidak dijawab)'}`;

  return generateWithFallback(undefined, async (model) => {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            earnedPoints: { type: Type.NUMBER },
            feedback: { type: Type.STRING },
          },
          required: ['earnedPoints', 'feedback'],
        },
      },
    });
    const parsed = JSON.parse((response.text ?? '{}').trim());
    return {
      earnedPoints: Math.max(0, Math.min(params.maxPoints, Number(parsed.earnedPoints || 0))),
      feedback: parsed.feedback || 'Penilaian awal AI berdasarkan rubrik.',
    };
  });
}

export async function gradeQuizSubmission(params: {
  sealedItems: SealedAnswerItem[];
  questionStems: Record<string, string>;
  answers: Record<string, string>;
  passingScore: number;
}) {
  let totalEarned = 0;
  let totalMax = 0;
  const feedbackList: {
    questionId: string;
    earnedPoints: number;
    maxPoints: number;
    isCorrect: boolean;
    feedback: string;
    correctAnswer: string;
  }[] = [];

  for (const item of params.sealedItems) {
    const maxPts = item.points || 10;
    totalMax += maxPts;
    const rawAns = (params.answers[item.id] || '').trim();
    const qType = (item.questionType || '').toLowerCase();

    if (qType === 'uraian' || qType === 'studi_kasus' || qType === 'praktik') {
      if (!rawAns) {
        feedbackList.push({
          questionId: item.id,
          earnedPoints: 0,
          maxPoints: maxPts,
          isCorrect: false,
          feedback: 'Tidak dijawab oleh peserta didik.',
          correctAnswer: item.correctAnswer,
        });
      } else {
        try {
          const aiScore = await gradeEssayWithAi({
            questionStem: params.questionStems[item.id] || '',
            studentAnswer: rawAns,
            correctAnswer: item.correctAnswer,
            rubric: item.rubric,
            maxPoints: maxPts,
          });
          totalEarned += aiScore.earnedPoints;
          feedbackList.push({
            questionId: item.id,
            earnedPoints: aiScore.earnedPoints,
            maxPoints: maxPts,
            isCorrect: aiScore.earnedPoints >= maxPts * 0.7,
            feedback: `${aiScore.feedback} (Penilaian awal AI — dapat ditinjau guru)`,
            correctAnswer: item.correctAnswer,
          });
        } catch {
          feedbackList.push({
            questionId: item.id,
            earnedPoints: 0,
            maxPoints: maxPts,
            isCorrect: false,
            feedback: 'Menunggu pemeriksaan manual oleh guru.',
            correctAnswer: item.correctAnswer,
          });
        }
      }
      continue;
    }

    const expected = (item.correctAnswer || '').trim().toLowerCase();
    const normalizedAns = rawAns.toLowerCase();
    // Handle option prefix like "A. Teks" matching "A" or full text
    const ansLetter = normalizedAns.match(/^([a-e])\b/)?.[1] || normalizedAns;
    const expLetter = expected.match(/^([a-e])\b/)?.[1] || expected;

    let isCorrect = false;
    if (qType === 'pg_kompleks') {
      const expSet = new Set(expected.split(',').map((s) => s.trim()).filter(Boolean));
      const ansSet = new Set(normalizedAns.split(',').map((s) => s.trim()).filter(Boolean));
      isCorrect = expSet.size > 0 && expSet.size === ansSet.size && [...expSet].every((x) => ansSet.has(x));
    } else {
      isCorrect = normalizedAns === expected || (ansLetter.length === 1 && ansLetter === expLetter);
    }

    const earned = isCorrect ? maxPts : 0;
    totalEarned += earned;
    feedbackList.push({
      questionId: item.id,
      earnedPoints: earned,
      maxPoints: maxPts,
      isCorrect,
      feedback: item.explanation || (isCorrect ? 'Jawaban tepat.' : 'Jawaban belum tepat.'),
      correctAnswer: item.correctAnswer,
    });
  }

  const percentage = totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 0;
  return {
    autoScore: totalEarned,
    finalScore: totalEarned,
    maxScore: totalMax,
    percentage,
    passed: percentage >= params.passingScore,
    itemFeedback: feedbackList,
  };
}

export async function generateRemedialEnrichmentOrAnalysis(params: {
  mode: 'remedial' | 'pengayaan' | 'analisis';
  workspace: any;
  statsSummary: string;
  targetStudents: string[];
  weakTopics: string[];
  aiPreferences?: Record<string, string>;
}) {
  const ai = getAiClient();
  const contents = `Susun program "${params.mode.toUpperCase()}" untuk:
Mata Pelajaran: ${params.workspace.subject}
Jenjang/Kelas: ${params.workspace.level} / ${params.workspace.grade}
Statistik Nilai Kelas: ${params.statsSummary}
Daftar Peserta Didik Sasaran: ${params.targetStudents.join(', ') || 'Berdasarkan hasil asesmen'}
Materi/TP yang Perlu Perhatian: ${params.weakTopics.join(', ') || 'Seluruh kompetensi semester aktif'}

Berikan analisis yang konkret, langkah pembelajaran/aktivitas, latihan soal atau proyek lanjutan, serta rekomendasi tindak lanjut untuk guru.`;

  return generateWithFallback(params.aiPreferences?.model, async (model) => {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            judulProgram: { type: Type.STRING },
            analisisSingkat: { type: Type.STRING },
            daftarKendalaAtauPotensi: { type: Type.ARRAY, items: { type: Type.STRING } },
            materiPenguatanAtauPendalaman: { type: Type.STRING },
            aktivitasTerstruktur: { type: Type.ARRAY, items: { type: Type.STRING } },
            soalAtauProyek: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  judul: { type: Type.STRING },
                  instruksi: { type: Type.STRING },
                  kriteriaKeberhasilan: { type: Type.STRING },
                },
                required: ['judul', 'instruksi', 'kriteriaKeberhasilan'],
              },
            },
            rekomendasiGuru: { type: Type.STRING },
          },
          required: [
            'judulProgram', 'analisisSingkat', 'daftarKendalaAtauPotensi',
            'materiPenguatanAtauPendalaman', 'aktivitasTerstruktur', 'soalAtauProyek', 'rekomendasiGuru',
          ],
        },
      },
    });
    return JSON.parse((response.text ?? '{}').trim());
  });
}
