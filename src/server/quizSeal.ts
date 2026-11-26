import crypto from 'crypto';

const EPHEMERAL_FALLBACK = crypto.randomBytes(32);

function getSealKey(): Buffer {
  const secret = process.env.QUIZ_SEAL_SECRET || process.env.GEMINI_API_KEY;
  if (secret) {
    return crypto.createHash('sha256').update(`ai-smart-teacher:${secret}`).digest();
  }
  return EPHEMERAL_FALLBACK;
}

export interface SealedAnswerItem {
  id: string;
  questionType: string;
  correctAnswer: string;
  explanation: string;
  rubric: string;
  points: number;
}

export function sealAnswerKey(items: SealedAnswerItem[]): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getSealKey(), iv);
  const payload = JSON.stringify(items);
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function unsealAnswerKey(sealed: string): SealedAnswerItem[] {
  const parts = sealed.split('.');
  if (parts.length !== 3) {
    throw new Error('Format kunci kuis tidak valid.');
  }
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getSealKey(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  return JSON.parse(decrypted) as SealedAnswerItem[];
}
