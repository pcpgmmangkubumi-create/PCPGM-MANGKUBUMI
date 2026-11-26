import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import multer from 'multer';
import mammoth from 'mammoth';
import path from 'path';
import fs from 'fs';
import dns from 'node:dns/promises';
import net from 'node:net';
import { createServer as createViteServer } from 'vite';
import { requireAuth, AuthRequest } from './src/server/authMiddleware.ts';
import { sealAnswerKey, unsealAnswerKey, SealedAnswerItem } from './src/server/quizSeal.ts';
import {
  AiServiceError,
  extractTextbookContent,
  generateAutoCurriculum,
  generateProtaProsem,
  generateModulAjar,
  generateBahanAjarMeeting,
  generateLkpd,
  generateDeviceBatch,
  generatePowerPoint,
  generateQuestionsAndKisiKisi,
  gradeQuizSubmission,
  generateRemedialEnrichmentOrAnalysis,
} from './src/server/aiService.ts';

function handleAiError(res: Response, context: string, error: any, fallbackMessage: string) {
  const statusCode = error instanceof AiServiceError ? error.statusCode : (Number(error?.status) || 500);
  const message = error?.message || fallbackMessage;
  if (statusCode >= 500) {
    console.error(`${context}:`, message);
  } else {
    console.warn(`${context} (${statusCode}):`, message);
  }
  res.status(statusCode).json({ error: message });
}

dotenv.config();

const app = express();
const PORT = 3000;

app.set('trust proxy', true);
app.use(express.json({ limit: '5mb' }));

// Simple sliding-window rate limiter for API routes
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxRequests = 60, windowMs = 60_000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (bucket.count >= maxRequests) {
      res.status(429).json({ error: 'Terlalu banyak permintaan. Mohon tunggu sejenak sebelum mencoba kembali.' });
      return;
    }
    bucket.count += 1;
    next();
  };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
});

// Health endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean(process.env.GEMINI_API_KEY),
  });
});

function isPrivateIpAddress(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/i, '');
  if (net.isIPv4(clean)) {
    const parts = clean.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (net.isIPv6(clean)) {
    const lower = clean.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) return true;
    return false;
  }
  return true;
}

async function assertSafePublicUrl(rawUrl: string): Promise<URL> {
  const parsed = new URL(rawUrl.trim());
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Link buku harus menggunakan protokol http:// atau https://.');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new Error('Alamat link buku tidak diizinkan (jaringan lokal/privat).');
  }
  if (net.isIP(host)) {
    if (isPrivateIpAddress(host)) {
      throw new Error('Alamat IP privat/lokal tidak diizinkan untuk link buku.');
    }
    return parsed;
  }
  try {
    const resolved = await dns.lookup(host, { all: true });
    if (!resolved.length || resolved.some((r) => isPrivateIpAddress(r.address))) {
      throw new Error('Tujuan link buku mengarah ke jaringan privat dan tidak diizinkan.');
    }
  } catch (err: any) {
    if (err?.message?.includes('tidak diizinkan')) throw err;
    // Allow DNS failures to fall through gracefully so AI URL/Search fallback can still inspect public metadata
  }
  return parsed;
}

function normalizePublicBookUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  const parsed = new URL(trimmed);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Link buku harus menggunakan protokol http:// atau https://.');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    isPrivateIpAddress(host) && net.isIP(host) !== 0
  ) {
    throw new Error('Alamat link buku tidak diizinkan (jaringan lokal/privat).');
  }
  const gdriveFileMatch = parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (host.includes('drive.google.com') && gdriveFileMatch?.[1]) {
    return `https://drive.usercontent.google.com/download?id=${gdriveFileMatch[1]}&export=download&confirm=t`;
  }
  if (host.includes('drive.google.com') && parsed.searchParams.get('id')) {
    return `https://drive.usercontent.google.com/download?id=${parsed.searchParams.get('id')}&export=download&confirm=t`;
  }
  const gdocMatch = parsed.pathname.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (host.includes('docs.google.com') && gdocMatch?.[1]) {
    return `https://docs.google.com/document/d/${gdocMatch[1]}/export?format=txt`;
  }
  const gslidesMatch = parsed.pathname.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  if (host.includes('docs.google.com') && gslidesMatch?.[1]) {
    return `https://docs.google.com/presentation/d/${gslidesMatch[1]}/export/txt`;
  }
  return parsed.toString();
}

async function safeFetchPublicUrl(startUrl: string, timeoutMs = 15000): Promise<{ response: globalThis.Response; finalUrl: string }> {
  let currentUrl = startUrl;
  for (let hop = 0; hop < 5; hop++) {
    await assertSafePublicUrl(currentUrl);
    const response = await fetch(currentUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AISmartTeacher/1.0)',
        Accept: 'application/pdf,text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) break;
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    return { response, finalUrl: currentUrl };
  }
  throw new Error('Terlalu banyak pengalihan (redirect) pada link buku.');
}

function htmlToPlainText(html: string): string {
  const metaParts: string[] = [];
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) metaParts.push(`Judul Halaman: ${titleMatch[1].replace(/\s+/g, ' ').trim()}`);
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  if (descMatch?.[1]) metaParts.push(`Deskripsi: ${descMatch[1].trim()}`);
  const nextDataMatch = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  let nextDataText = '';
  if (nextDataMatch?.[1]) {
    nextDataText = nextDataMatch[1].replace(/<[^>]+>/g, ' ').slice(0, 6000);
  }

  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return [...metaParts, bodyText, nextDataText ? `Data Halaman Terstruktur:\n${nextDataText}` : '']
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 24000)
    .trim();
}

function findEmbeddedPdfUrls(html: string, baseUrl: string): string[] {
  const candidates = new Set<string>();
  const patterns = [
    /(?:href|src|data-src|content)=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi,
    /(https?:\/\/[^\s"'<>\\]+\.pdf(?:\?[^\s"'<>\\]*)?)/gi,
  ];
  for (const regex of patterns) {
    let m: RegExpExecArray | null;
    while ((m = regex.exec(html)) !== null) {
      try {
        const resolved = new URL(m[1], baseUrl).toString();
        if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
          candidates.add(resolved);
        }
      } catch {
        // ignore invalid relative URL
      }
      if (candidates.size >= 4) break;
    }
  }
  return Array.from(candidates);
}

// Upload & extract textbook (PDF, DOCX, TXT, Image, or Book Link)
app.post(
  '/api/books/extract',
  rateLimit(20, 60_000),
  requireAuth,
  upload.single('file'),
  async (req: AuthRequest, res: Response) => {
    try {
      const file = req.file;
      const rawBookUrl = String(req.body?.bookUrl || '').trim();
      const manualTextInput = String(req.body?.manualText || '').trim();
      const meta = {
        title: String(req.body?.title || ''),
        subject: String(req.body?.subject || ''),
        grade: String(req.body?.grade || ''),
        level: String(req.body?.level || ''),
        phase: String(req.body?.phase || ''),
        semester: String(req.body?.semester || ''),
        curriculum: String(req.body?.curriculum || ''),
        curriculumContext: String(req.body?.curriculumContext || '').slice(0, 4500),
        bookUrl: rawBookUrl,
        preferredModel: String(req.body?.preferredModel || ''),
      };

      if (!file && !manualTextInput && !rawBookUrl) {
        res.status(400).json({ error: 'Berkas buku, link buku, atau teks ringkasan wajib disediakan.' });
        return;
      }

      let plainText: string | undefined = manualTextInput || undefined;
      let base64Data: string | undefined;
      let mimeType = file?.mimetype || 'text/plain';
      let fileName = file?.originalname || (rawBookUrl ? 'sumber-link-buku' : 'referensi-manual.txt');

      if (file) {
        const lower = fileName.toLowerCase();
        if (lower.endsWith('.docx')) {
          const result = await mammoth.extractRawText({ buffer: file.buffer });
          plainText = [manualTextInput, result.value].filter(Boolean).join('\n\n');
        } else if (lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.csv')) {
          plainText = [manualTextInput, file.buffer.toString('utf8')].filter(Boolean).join('\n\n');
        } else if (lower.endsWith('.pdf') || mimeType.startsWith('image/')) {
          base64Data = file.buffer.toString('base64');
          if (lower.endsWith('.pdf')) mimeType = 'application/pdf';
        } else {
          const rawStr = file.buffer.toString('utf8').replace(/[^\x20-\x7E\n\r\t\u00C0-\u024F]/g, ' ').slice(0, 60000);
          plainText = [manualTextInput, rawStr].filter(Boolean).join('\n\n');
        }
      } else if (rawBookUrl) {
        // Validate URL safety upfront (throws on private/local/invalid scheme)
        const fetchUrl = normalizePublicBookUrl(rawBookUrl);
        await assertSafePublicUrl(fetchUrl);

        try {
          const { response, finalUrl } = await safeFetchPublicUrl(fetchUrl, 16000);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const maxBytes = 6 * 1024 * 1024;
          const contentLength = Number(response.headers.get('content-length') || 0);
          if (contentLength > maxBytes) {
            throw new Error(`Ukuran berkas PDF (${Math.round(contentLength / (1024 * 1024))} MB) melebihi batas kirim langsung; menggunakan penelusuran URL AI.`);
          }
          const ct = (response.headers.get('content-type') || '').toLowerCase();
          const arrBuf = await response.arrayBuffer();
          if (arrBuf.byteLength > maxBytes) {
            throw new Error('Ukuran berkas dari link melebihi batas kirim langsung; menggunakan penelusuran URL AI.');
          }
          const buf = Buffer.from(arrBuf);
          const urlPathLower = finalUrl.toLowerCase();

          if (ct.includes('application/pdf') || urlPathLower.endsWith('.pdf') || buf.subarray(0, 4).toString('utf8') === '%PDF') {
            base64Data = buf.toString('base64');
            mimeType = 'application/pdf';
            fileName = decodeURIComponent(new URL(finalUrl).pathname.split('/').pop() || 'buku-referensi.pdf');
          } else if (ct.includes('wordprocessingml') || urlPathLower.endsWith('.docx')) {
            const result = await mammoth.extractRawText({ buffer: buf });
            plainText = [manualTextInput, result.value].filter(Boolean).join('\n\n').slice(0, 24000);
            fileName = 'buku-referensi.docx';
          } else if (ct.startsWith('image/')) {
            base64Data = buf.toString('base64');
            mimeType = ct.split(';')[0];
            fileName = 'halaman-buku';
          } else {
            const rawText = buf.toString('utf8');
            const isHtml = ct.includes('html') || rawText.trim().startsWith('<');
            const extractedHtmlText = isHtml ? htmlToPlainText(rawText) : rawText;
            plainText = [manualTextInput, extractedHtmlText.slice(0, 24000)].filter(Boolean).join('\n\n');
            fileName = new URL(rawBookUrl).hostname;

            // If HTML catalog/landing page contains a direct small PDF link, attempt to fetch that PDF too
            if (isHtml) {
              const pdfCandidates = findEmbeddedPdfUrls(rawText, finalUrl);
              for (const pdfUrl of pdfCandidates) {
                try {
                  const { response: pdfRes, finalUrl: pdfFinalUrl } = await safeFetchPublicUrl(pdfUrl, 12000);
                  if (!pdfRes.ok) continue;
                  const pdfLen = Number(pdfRes.headers.get('content-length') || 0);
                  if (pdfLen > maxBytes) continue;
                  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
                  if (pdfBuf.byteLength <= maxBytes && pdfBuf.subarray(0, 4).toString('utf8') === '%PDF') {
                    base64Data = pdfBuf.toString('base64');
                    mimeType = 'application/pdf';
                    fileName = decodeURIComponent(new URL(pdfFinalUrl).pathname.split('/').pop() || 'buku-referensi.pdf');
                    break;
                  }
                } catch {
                  // try next candidate or rely on HTML + AI URL/Search lookup
                }
              }
            }
          }
        } catch (fetchErr: any) {
          // Do not fail immediately: let Gemini urlContext + googleSearch inspect the URL & metadata
          const note = `Catatan pengambilan tautan (${rawBookUrl}): ${fetchErr?.message || 'halaman dinamis/akses terbatas'}. Gunakan alat URL Context & Google Search untuk mengenali buku beserta daftar bab dan materinya.`;
          plainText = [manualTextInput, note].filter(Boolean).join('\n\n');
        }
      }

      const extracted = await extractTextbookContent({
        fileName,
        mimeType,
        base64Data,
        plainText,
        meta,
      });

      res.json({
        fileName,
        sourceUrl: rawBookUrl || undefined,
        ...extracted,
      });
    } catch (error: any) {
      handleAiError(res, 'Textbook extraction error', error, 'Gagal mengekstrak isi buku referensi.');
    }
  }
);

// AI Curriculum & Document Generators
app.post('/api/ai/curriculum', rateLimit(30, 60_000), requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const result = await generateAutoCurriculum(req.body);
    res.json(result);
  } catch (error: any) {
    handleAiError(res, 'AI curriculum error', error, 'Gagal menyusun kurikulum otomatis.');
  }
});

app.post('/api/ai/prota-prosem', rateLimit(30, 60_000), requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const result = await generateProtaProsem(req.body);
    res.json(result);
  } catch (error: any) {
    handleAiError(res, 'AI PROTA/PROSEM error', error, 'Gagal menyusun PROTA dan PROSEM.');
  }
});

app.post('/api/ai/modul-ajar', rateLimit(80, 60_000), requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const result = await generateModulAjar(req.body);
    res.json(result);
  } catch (error: any) {
    handleAiError(res, 'AI Modul Ajar error', error, 'Gagal menyusun Modul Ajar.');
  }
});

app.post('/api/ai/bahan-ajar', rateLimit(80, 60_000), requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const result = await generateBahanAjarMeeting(req.body);
    res.json(result);
  } catch (error: any) {
    handleAiError(res, 'AI Bahan Ajar error', error, 'Gagal menyusun Bahan Ajar pertemuan.');
  }
});

app.post('/api/ai/lkpd', rateLimit(80, 60_000), requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const result = await generateLkpd(req.body);
    res.json(result);
  } catch (error: any) {
    handleAiError(res, 'AI LKPD error', error, 'Gagal menyusun LKPD.');
  }
});

app.post('/api/ai/batch-devices', rateLimit(80, 60_000), requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { docType, workspace, semester, meetings, learningModel, lkpdType, textbookContext, aiPreferences } = req.body || {};
    if (!['modul_ajar', 'bahan_ajar', 'lkpd'].includes(docType)) {
      res.status(400).json({ error: 'Jenis perangkat pembelajaran batch tidak valid.' });
      return;
    }
    if (!workspace || !Array.isArray(meetings) || meetings.length === 0) {
      res.status(400).json({ error: 'Daftar pertemuan target wajib disediakan.' });
      return;
    }
    const items = await generateDeviceBatch({
      docType,
      workspace,
      semester: String(semester || workspace.semester || 'Semester 1'),
      meetings,
      learningModel,
      lkpdType,
      textbookContext,
      aiPreferences,
    });
    res.json({ items });
  } catch (error: any) {
    handleAiError(res, 'AI Batch Devices error', error, 'Gagal menyusun perangkat pembelajaran per pertemuan.');
  }
});

app.post('/api/ai/powerpoint', rateLimit(30, 60_000), requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const result = await generatePowerPoint(req.body);
    res.json(result);
  } catch (error: any) {
    handleAiError(res, 'AI PowerPoint error', error, 'Gagal menyusun slide PowerPoint.');
  }
});

app.post('/api/ai/questions', rateLimit(30, 60_000), requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const result = await generateQuestionsAndKisiKisi(req.body);
    res.json(result);
  } catch (error: any) {
    handleAiError(res, 'AI Questions error', error, 'Gagal membuat bank soal.');
  }
});

app.post('/api/ai/remedial-enrichment', rateLimit(30, 60_000), requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const result = await generateRemedialEnrichmentOrAnalysis(req.body);
    res.json(result);
  } catch (error: any) {
    handleAiError(res, 'AI Remedial/Enrichment error', error, 'Gagal menyusun program remedial/pengayaan.');
  }
});

// Seal answer keys when publishing a quiz so students cannot inspect correct answers
app.post('/api/quizzes/seal-key', rateLimit(40, 60_000), requireAuth, (req: AuthRequest, res: Response) => {
  try {
    const items = (req.body?.items || []) as SealedAnswerItem[];
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Daftar soal kuis tidak boleh kosong.' });
      return;
    }
    const sealedKey = sealAnswerKey(items);
    res.json({ sealedKey });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Gagal mengamankan kunci kuis.' });
  }
});

// Grade submitted student quiz using sealedKey (accessible to student browser taking quiz)
app.post('/api/quizzes/grade', rateLimit(60, 60_000), async (req: Request, res: Response) => {
  try {
    const { sealedKey, questionStems, answers, passingScore, showResultsToStudent } = req.body || {};
    if (!sealedKey || typeof sealedKey !== 'string') {
      res.status(400).json({ error: 'Token kunci kuis tidak valid.' });
      return;
    }
    const sealedItems = unsealAnswerKey(sealedKey);
    const graded = await gradeQuizSubmission({
      sealedItems,
      questionStems: questionStems || {},
      answers: answers || {},
      passingScore: Number(passingScore ?? 75),
    });

    // Always return scores for submission persistence; strip explanations/correctAnswers from UI summary if hidden
    const studentViewFeedback = showResultsToStudent
      ? graded.itemFeedback
      : graded.itemFeedback.map((item) => ({
          questionId: item.questionId,
          earnedPoints: item.earnedPoints,
          maxPoints: item.maxPoints,
          isCorrect: item.isCorrect,
          feedback: 'Jawaban telah direkam. Hasil rincian menunggu persetujuan guru.',
        }));

    res.json({
      ...graded,
      studentViewFeedback,
    });
  } catch (error: any) {
    console.error('Quiz grading error:', error);
    res.status(500).json({ error: error?.message || 'Gagal mengoreksi jawaban kuis.' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AI SMART TEACHER server listening on port ${PORT}`);
  });
}

startServer();
