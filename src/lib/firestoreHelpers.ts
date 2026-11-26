import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  QueryConstraint,
  Unsubscribe,
} from 'firebase/firestore';
import { db, auth } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function subscribeOwnedCollection<T>(
  collectionName: string,
  ownerId: string,
  onData: (items: T[]) => void,
  extraConstraints: QueryConstraint[] = [],
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, collectionName),
    where('ownerId', '==', ownerId),
    ...extraConstraints
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) })) as T[];
      onData(rows);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, collectionName);
      } catch (wrapped: any) {
        if (onError) onError(wrapped);
      }
    }
  );
}

export function subscribeCollectionByQuery<T>(
  collectionName: string,
  constraints: QueryConstraint[],
  onData: (items: T[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, collectionName), ...constraints);
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) })) as T[];
      onData(rows);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, collectionName);
      } catch (wrapped: any) {
        if (onError) onError(wrapped);
      }
    }
  );
}

export async function createRecord(collectionName: string, data: Record<string, any>): Promise<string> {
  try {
    const clean = sanitizeForCollection(collectionName, stripUndefinedDeep(data));
    const ref = await addDoc(collection(db, collectionName), {
      ...clean,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, collectionName);
  }
}

export async function setRecord(
  collectionName: string,
  id: string,
  data: Record<string, any>,
  isNew = false
): Promise<void> {
  const path = `${collectionName}/${id}`;
  try {
    const clean = sanitizeForCollection(collectionName, stripUndefinedDeep(data));
    const payload: Record<string, any> = {
      ...clean,
      updatedAt: serverTimestamp(),
    };
    if (isNew) {
      payload.createdAt = serverTimestamp();
    }
    await setDoc(doc(db, collectionName, id), payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateRecord(
  collectionName: string,
  id: string,
  data: Record<string, any>
): Promise<void> {
  const path = `${collectionName}/${id}`;
  try {
    const clean = sanitizeForCollection(collectionName, stripUndefinedDeep(data), true);
    await updateDoc(doc(db, collectionName, id), {
      ...clean,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteRecord(collectionName: string, id: string): Promise<void> {
  const path = `${collectionName}/${id}`;
  try {
    await deleteDoc(doc(db, collectionName, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function getRecord<T>(collectionName: string, id: string): Promise<T | null> {
  const path = `${collectionName}/${id}`;
  try {
    const snap = await getDoc(doc(db, collectionName, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Record<string, any>) } as T;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function listByWhere<T>(
  collectionName: string,
  constraints: QueryConstraint[]
): Promise<T[]> {
  try {
    const q = query(collection(db, collectionName), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) })) as T[];
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionName);
  }
}

function isPlainObject(val: unknown): val is Record<string, any> {
  return typeof val === 'object' && val !== null && !Array.isArray(val) && !(val instanceof Date);
}

function clampString(val: unknown, maxLen: number): string | undefined {
  if (val === undefined || val === null) return undefined;
  const s = typeof val === 'string' ? val.trim() : String(val).trim();
  return s.slice(0, maxLen);
}

function toFiniteNumber(val: unknown): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

function sanitizeForCollection(
  collectionName: string,
  data: Record<string, any>,
  isPartialUpdate = false
): Record<string, any> {
  const out: Record<string, any> = { ...data };

  if (collectionName === 'documents') {
    const allowedKeys = new Set([
      'ownerId', 'workspaceId', 'academicYear', 'semester', 'grade', 'subject',
      'docType', 'title', 'meetingNumber', 'chapterTitle', 'status',
      'isAiDraft', 'sourceRef', 'content', 'version', 'archived',
    ]);
    for (const k of Object.keys(out)) {
      if (!allowedKeys.has(k)) delete out[k];
    }
    if ('docType' in out || !isPartialUpdate) {
      out.docType = clampString(out.docType, 40) || 'dokumen';
    }
    if ('title' in out || !isPartialUpdate) {
      out.title = clampString(out.title, 250) || 'Dokumen Pembelajaran';
    }
    if ('status' in out || !isPartialUpdate) {
      out.status = ['draft', 'approved', 'needs_revision'].includes(out.status) ? out.status : 'draft';
    }
    if ('version' in out || !isPartialUpdate) {
      const v = toFiniteNumber(out.version);
      out.version = v !== undefined && v >= 1 ? v : 1;
    }
    if ('academicYear' in out) {
      const s = clampString(out.academicYear, 30);
      if (s !== undefined) out.academicYear = s;
      else delete out.academicYear;
    }
    if ('semester' in out) {
      const s = clampString(out.semester, 20);
      if (s !== undefined) out.semester = s;
      else delete out.semester;
    }
    if ('grade' in out) {
      const s = clampString(out.grade, 30);
      if (s !== undefined) out.grade = s;
      else delete out.grade;
    }
    if ('subject' in out) {
      const s = clampString(out.subject, 120);
      if (s !== undefined) out.subject = s;
      else delete out.subject;
    }
    if ('meetingNumber' in out) {
      const n = toFiniteNumber(out.meetingNumber);
      if (n !== undefined) out.meetingNumber = n;
      else delete out.meetingNumber;
    }
    if ('chapterTitle' in out) {
      const s = clampString(out.chapterTitle, 200);
      if (s !== undefined) out.chapterTitle = s;
      else delete out.chapterTitle;
    }
    if ('sourceRef' in out) {
      const s = clampString(out.sourceRef, 500);
      if (s !== undefined) out.sourceRef = s;
      else delete out.sourceRef;
    }
    if ('isAiDraft' in out) {
      out.isAiDraft = Boolean(out.isAiDraft);
    }
    if ('archived' in out) {
      out.archived = Boolean(out.archived);
    }
    if ('content' in out) {
      if (!isPlainObject(out.content)) {
        out.content = out.content === undefined || out.content === null ? {} : { value: out.content };
      }
    }
  } else if (collectionName === 'workspaces') {
    if ('academicYear' in out || !isPartialUpdate) out.academicYear = clampString(out.academicYear, 30) || '2026/2027';
    if ('semester' in out || !isPartialUpdate) out.semester = clampString(out.semester, 20) || 'Semester 1';
    if ('level' in out || !isPartialUpdate) out.level = clampString(out.level, 40) || 'SMP/MTs';
    if ('grade' in out || !isPartialUpdate) out.grade = clampString(out.grade, 30) || 'Kelas VII';
    if ('phase' in out) {
      const s = clampString(out.phase, 30);
      if (s !== undefined) out.phase = s;
      else delete out.phase;
    }
    if ('subject' in out || !isPartialUpdate) out.subject = clampString(out.subject, 120) || 'Mata Pelajaran';
    if ('curriculum' in out || !isPartialUpdate) out.curriculum = clampString(out.curriculum, 100) || 'Kurikulum Merdeka';
    if ('primaryBookId' in out) {
      const s = clampString(out.primaryBookId, 128);
      if (s !== undefined) out.primaryBookId = s;
      else delete out.primaryBookId;
    }
    if ('jpPerWeek' in out) {
      const n = toFiniteNumber(out.jpPerWeek);
      if (n !== undefined) out.jpPerWeek = n;
      else delete out.jpPerWeek;
    }
  } else if (collectionName === 'prosem_items') {
    if ('semester' in out || !isPartialUpdate) out.semester = clampString(out.semester, 20) || 'Semester 1';
    if ('month' in out || !isPartialUpdate) out.month = clampString(out.month, 30) || 'Juli';
    if ('tpCode' in out) {
      const s = clampString(out.tpCode, 50);
      if (s !== undefined) out.tpCode = s;
      else delete out.tpCode;
    }
    if ('topic' in out || !isPartialUpdate) out.topic = clampString(out.topic, 250) || 'Materi Pokok';
    if ('subtopic' in out) {
      const s = clampString(out.subtopic, 250);
      if (s !== undefined) out.subtopic = s;
      else delete out.subtopic;
    }
    if ('plannedDate' in out) {
      const s = clampString(out.plannedDate, 40);
      if (s !== undefined) out.plannedDate = s;
      else delete out.plannedDate;
    }
    if ('executionDate' in out) {
      const s = clampString(out.executionDate, 40);
      if (s !== undefined) out.executionDate = s;
      else delete out.executionDate;
    }
    if ('teacherNotes' in out) {
      const s = clampString(out.teacherNotes, 1000);
      if (s !== undefined) out.teacherNotes = s;
      else delete out.teacherNotes;
    }
    if ('meetingNumber' in out || !isPartialUpdate) {
      const n = toFiniteNumber(out.meetingNumber);
      out.meetingNumber = n !== undefined && n >= 1 ? n : 1;
    }
    if ('jpAllocation' in out || !isPartialUpdate) {
      const n = toFiniteNumber(out.jpAllocation);
      out.jpAllocation = n !== undefined && n >= 0 ? Math.min(100, n) : 2;
    }
  } else if (collectionName === 'textbooks') {
    const allowedKeys = new Set([
      'ownerId', 'title', 'author', 'publisher', 'publishYear', 'curriculum',
      'level', 'grade', 'subject', 'isbn', 'pageCount', 'referenceType',
      'sourceUrl', 'fileName', 'extractedSummary', 'chapters', 'status',
    ]);
    for (const k of Object.keys(out)) {
      if (!allowedKeys.has(k)) delete out[k];
    }
    if ('title' in out || !isPartialUpdate) out.title = clampString(out.title, 200) || 'Buku Referensi';
    if ('subject' in out || !isPartialUpdate) out.subject = clampString(out.subject, 120) || 'Umum';
    if ('referenceType' in out || !isPartialUpdate) {
      out.referenceType = ['primary', 'companion', 'module', 'government', 'custom'].includes(out.referenceType)
        ? out.referenceType
        : 'primary';
    }
    if ('status' in out || !isPartialUpdate) {
      out.status = ['ready', 'processing', 'needs_review'].includes(out.status) ? out.status : 'ready';
    }
    const optStrFields: Array<[string, number]> = [
      ['author', 150],
      ['publisher', 150],
      ['publishYear', 10],
      ['curriculum', 100],
      ['level', 40],
      ['grade', 30],
      ['isbn', 40],
      ['sourceUrl', 1000],
      ['fileName', 200],
      ['extractedSummary', 10000],
    ];
    for (const [field, maxLen] of optStrFields) {
      if (field in out) {
        const s = clampString(out[field], maxLen);
        if (s !== undefined) out[field] = s;
        else delete out[field];
      }
    }
    if ('pageCount' in out) {
      const n = toFiniteNumber(out.pageCount);
      if (n !== undefined) out.pageCount = n;
      else delete out.pageCount;
    }
    if ('chapters' in out) {
      out.chapters = Array.isArray(out.chapters) ? out.chapters.slice(0, 60) : [];
    }
  }

  return out;
}

function stripUndefinedValue(val: any): any {
  if (Array.isArray(val)) {
    return val.filter((v) => v !== undefined).map(stripUndefinedValue);
  }
  if (isPlainObject(val)) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        out[k] = stripUndefinedValue(v);
      }
    }
    return out;
  }
  return val;
}

export function stripUndefinedDeep(obj: Record<string, any>): Record<string, any> {
  return stripUndefinedValue(obj);
}

export function stripUndefined(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      out[key] = val;
    }
  }
  return out;
}
