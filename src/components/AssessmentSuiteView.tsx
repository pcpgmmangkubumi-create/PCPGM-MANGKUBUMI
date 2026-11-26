import React, { useState } from 'react';
import {
  Sparkles,
  Loader2,
  Trash2,
  Download,
  FileText,
  FileSpreadsheet,
  Copy,
  Smartphone,
  CheckCircle2,
  Shuffle,
  Printer,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { postAuthedJson } from '../lib/apiClient';
import { createRecord, updateRecord, deleteRecord } from '../lib/firestoreHelpers';
import { QUESTION_TYPES } from '../lib/curriculumData';
import { QuestionRecord } from '../types/education';
import { exportDocumentDocx, exportDocumentPdf, exportTableXlsx, PrintableDocPayload } from '../lib/exporters';
import { OfficialDocumentSheet } from './OfficialDocumentSheet';
import { buildRichTextbookContext } from '../lib/bookContext';

export const AssessmentSuiteView: React.FC<{
  mode: 'bank-soal' | 'kisi-kisi' | 'asesmen-ujian' | 'kuis-online';
}> = ({ mode }) => {
  const {
    user,
    profile,
    aiSettings,
    activeSchool,
    activeWorkspace,
    questions,
    quizzes,
    quizSubmissions,
    classes,
    textbooks,
    notify,
  } = useApp();

  const wsQuestions = questions.filter((q) => !activeWorkspace || q.workspaceId === activeWorkspace.id);
  const [generating, setGenerating] = useState(false);

  // Bank Soal generator controls
  const [qForm, setQForm] = useState({
    topic: '',
    tpCode: 'TP-1',
    tpDescription: '',
    questionCount: 10,
    selectedTypes: ['pilihan_ganda', 'benar_salah', 'uraian'],
    category: 'Asesmen Formatif',
    mudah: 30,
    sedang: 50,
    sulit: 20,
    lots: 30,
    mots: 40,
    hots: 30,
  });

  // Exam package A/B/C/D state
  const [paketLabel, setPaketLabel] = useState<'Paket A' | 'Paket B' | 'Paket C' | 'Paket D'>('Paket A');
  const [paketQuestions, setPaketQuestions] = useState<QuestionRecord[]>([]);
  const [examPreviewTab, setExamPreviewTab] = useState<'soal' | 'kunci'>('soal');

  // Quiz Online creator state
  const [quizForm, setQuizForm] = useState({
    title: '',
    description: '',
    classId: classes[0]?.id || '',
    mode: 'ujian' as 'latihan' | 'ujian',
    durationMinutes: 45,
    passingScore: 75,
    shuffleQuestions: true,
    shuffleOptions: true,
    showResultsToStudent: false,
    requireStudentIdentity: true,
    questionCount: 10,
  });
  const [publishing, setPublishing] = useState(false);

  const handleGenerateQuestions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeWorkspace?.id) {
      notify('Pilih atau buat ruang kerja mata pelajaran terlebih dahulu.', 'error');
      return;
    }
    if (qForm.selectedTypes.length === 0) {
      notify('Pilih minimal satu jenis soal.', 'error');
      return;
    }
    setGenerating(true);
    try {
      const firstTopic = activeWorkspace.curriculumData?.elements?.[0]?.topics?.[0];
      const bookCtx = buildRichTextbookContext(
        textbooks,
        activeWorkspace.primaryBookId,
        activeWorkspace.subject,
        {
          curriculum: activeWorkspace.curriculum,
          grade: activeWorkspace.grade,
          level: activeWorkspace.level,
          semester: activeWorkspace.semester,
        }
      );

      const res = await postAuthedJson<{ questions: any[] }>('/api/ai/questions', {
        workspace: activeWorkspace,
        topic: qForm.topic.trim() || firstTopic?.topicTitle || activeWorkspace.subject,
        tpCode: qForm.tpCode || firstTopic?.tpCode || 'TP-1',
        tpDescription: qForm.tpDescription.trim() || firstTopic?.tpDescription || 'Memahami konsep inti materi.',
        questionCount: Number(qForm.questionCount),
        questionTypes: qForm.selectedTypes,
        category: qForm.category,
        difficultyMix: { mudah: qForm.mudah, sedang: qForm.sedang, sulit: qForm.sulit },
        hotsMix: { lots: qForm.lots, mots: qForm.mots, hots: qForm.hots },
        textbookContext: bookCtx || undefined,
        aiPreferences: aiSettings || undefined,
      });

      for (const q of res.questions || []) {
        await createRecord('questions', {
          ownerId: user.uid,
          workspaceId: activeWorkspace.id,
          subject: activeWorkspace.subject,
          grade: activeWorkspace.grade,
          tpCode: qForm.tpCode,
          topic: qForm.topic.trim() || firstTopic?.topicTitle || activeWorkspace.subject,
          questionType: q.questionType || 'pilihan_ganda',
          cognitiveLevel: String(q.cognitiveLevel || 'C2').slice(0, 10),
          hotsTier: (['LOTS', 'MOTS', 'HOTS'].includes(String(q.hotsTier || '').toUpperCase())
            ? String(q.hotsTier).toUpperCase()
            : 'MOTS') as 'LOTS' | 'MOTS' | 'HOTS',
          difficulty: (['mudah', 'sedang', 'sulit'].includes(String(q.difficulty || '').toLowerCase().trim())
            ? String(q.difficulty).toLowerCase().trim()
            : 'sedang') as 'mudah' | 'sedang' | 'sulit',
          category: qForm.category,
          stem: q.stem,
          options: q.options || [],
          correctAnswer: q.correctAnswer || '',
          explanation: q.explanation || '',
          indicator: q.indicator || '',
          rubric: q.rubric || '',
          points: Number(q.points || 10),
          sourceRef: q.sourceRef || activeWorkspace.subject,
        });
      }

      notify(`${res.questions?.length || 0} butir soal berhasil ditambahkan ke Bank Soal.`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Gagal menyusun soal.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const buildPaketQuestions = (pkg: 'Paket A' | 'Paket B' | 'Paket C' | 'Paket D') => {
    setPaketLabel(pkg);
    const seedOffset = pkg.charCodeAt(pkg.length - 1);
    const cloned = [...wsQuestions].sort((a, b) => {
      const ha = (a.stem.charCodeAt(0) + seedOffset) % 31;
      const hb = (b.stem.charCodeAt(0) + seedOffset) % 31;
      return ha - hb;
    });
    setPaketQuestions(cloned);
    notify(`${pkg} disusun dengan pengacakan urutan soal & opsi yang seimbang.`, 'info');
  };

function getQuestionTypeRank(tRaw?: string): number {
  const t = (tRaw || '').toLowerCase().trim();
  if (t.includes('pilihan') || t.includes('pg') || t.includes('ganda')) return 1;
  if (t.includes('benar') || t.includes('salah') || t.includes('true') || t.includes('false')) return 2;
  return 3;
}

const sortQuestionsByType = (list: QuestionRecord[]): QuestionRecord[] => {
  return [...list].sort((a, b) => getQuestionTypeRank(a.questionType) - getQuestionTypeRank(b.questionType));
};

  const activeExamList = sortQuestionsByType(paketQuestions.length > 0 ? paketQuestions : wsQuestions);

  const schoolDisplay = activeSchool?.name || '-';
  const teacherName = activeSchool?.teacherName || profile?.displayName || '-';

  const exportExamSheet = (withAnswerKey: boolean, format: 'pdf' | 'docx') => {
    const totalScore = activeExamList.reduce((sum, q) => sum + Number(q.points || 0), 0);
    const payload: PrintableDocPayload = {
      title: withAnswerKey
        ? `Kunci Jawaban & Pedoman Penskoran (${paketLabel})`
        : `Naskah Soal Asesmen (${paketLabel})`,
      subtitle: `${activeWorkspace?.subject || '-'} · ${activeWorkspace?.grade || '-'} · Tahun Pelajaran ${activeWorkspace?.academicYear || '2026/2027'}`,
      fileName: `${withAnswerKey ? 'Kunci_Jawaban' : 'Naskah_Soal'}_${paketLabel.replace(/\s+/g, '_')}`,
      school: activeSchool,
      teacher: profile,
      includeSignatures: withAnswerKey,
      metadataPairs: [
        { label: 'Satuan Pendidikan', value: schoolDisplay },
        { label: 'Mata Pelajaran', value: activeWorkspace?.subject || '-' },
        { label: 'Kelas / Semester', value: `${activeWorkspace?.grade || '-'} / ${activeWorkspace?.semester || '-'}` },
        { label: 'Paket / Jumlah Soal', value: `${paketLabel} (${activeExamList.length} butir · Total Skor ${totalScore})` },
        ...(withAnswerKey ? [{ label: 'Guru Penyusun', value: teacherName }] : []),
      ],
      sections: [
        {
          heading: 'A. Petunjuk Pengerjaan',
          paragraphs: [
            withAnswerKey
              ? 'Dokumen rahasia khusus guru/korektor. Gunakan rubrik dan bobot skor di bawah ini untuk melakukan penskoran objektif dan uraian.'
              : '1. Berdoalah sebelum mengerjakan.\n2. Tuliskan Nama Lengkap, Kelas, dan Nomor Peserta pada lembar jawab.\n3. Kerjakan soal yang paling mudah terlebih dahulu dengan jujur dan cermat.',
          ],
        },
        ...(withAnswerKey
          ? [
              {
                heading: 'B. Kunci Jawaban, Pembahasan & Rubrik Penskoran',
                table: {
                  headers: ['No', 'Tipe', 'Level', 'Kunci Jawaban', 'Pembahasan / Rubrik', 'Skor'],
                  rows: [
                    ...activeExamList.map((q, i) => [
                      i + 1,
                      q.questionType,
                      q.cognitiveLevel,
                      q.correctAnswer || '-',
                      q.explanation || q.rubric || '-',
                      q.points,
                    ]),
                    ['', '', '', '', 'Total Skor Maksimal', totalScore],
                  ],
                },
              },
            ]
          : (() => {
              const pgList = activeExamList.filter((q) => getQuestionTypeRank(q.questionType) === 1);
              const bsList = activeExamList.filter((q) => getQuestionTypeRank(q.questionType) === 2);
              const esaiList = activeExamList.filter((q) => getQuestionTypeRank(q.questionType) === 3);
              const outSections: PrintableDocPayload['sections'] = [];
              let globalIdx = 1;

              if (pgList.length > 0) {
                outSections.push({
                  heading: 'B. Pilihan Ganda',
                  twoColumnQuestions: pgList.map((q) => ({
                    number: globalIdx++,
                    stem: q.stem,
                    points: q.points,
                    options: q.options || [],
                  })),
                });
              }
              if (bsList.length > 0) {
                outSections.push({
                  heading: pgList.length > 0 ? 'C. Soal Benar / Salah' : 'B. Soal Benar / Salah',
                  table: {
                    headers: ['No', 'Pernyataan / Soal', 'Benar (B)', 'Salah (S)'],
                    rows: bsList.map((q) => [
                      globalIdx++,
                      `${q.stem} (${q.points} poin)`,
                      '[   ]',
                      '[   ]',
                    ]),
                  },
                });
              }
              if (esaiList.length > 0) {
                outSections.push({
                  heading:
                    pgList.length > 0 && bsList.length > 0
                      ? 'D. Soal Uraian / Esai'
                      : pgList.length > 0 || bsList.length > 0
                      ? 'C. Soal Uraian / Esai'
                      : 'B. Soal Uraian / Esai',
                  paragraphs: esaiList.flatMap((q) => [
                    `${globalIdx++}. (${q.points} poin) ${q.stem}`,
                    '   [ Lembar Jawaban Uraian ]\n\n\n',
                  ]),
                });
              }
              return outSections;
            })()),
      ],
    };
    if (format === 'pdf') exportDocumentPdf(payload);
    else exportDocumentDocx(payload);
  };

  const handlePublishQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const pool = wsQuestions.slice(0, Math.max(1, quizForm.questionCount));
    if (pool.length === 0) {
      notify('Bank Soal masih kosong. Buat soal terlebih dahulu di menu Bank Soal.', 'error');
      return;
    }

    setPublishing(true);
    try {
      const sealedItems = pool.map((q, idx) => ({
        id: q.id || `q_${idx}`,
        questionType: q.questionType,
        correctAnswer: q.correctAnswer || '',
        explanation: q.explanation || '',
        rubric: q.rubric || '',
        points: Number(q.points || 10),
      }));

      const { sealedKey } = await postAuthedJson<{ sealedKey: string }>('/api/quizzes/seal-key', {
        items: sealedItems,
      });

      const publicQuestions = pool.map((q, idx) => ({
        id: q.id || `q_${idx}`,
        questionType: q.questionType,
        cognitiveLevel: q.cognitiveLevel,
        stem: q.stem,
        options: q.options || [],
        points: Number(q.points || 10),
      }));

      const code = `${(activeWorkspace?.subject || 'KUIS').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'KUI'}${Math.floor(100 + Math.random() * 900)}`;

      await createRecord('quizzes', {
        ownerId: user.uid,
        workspaceId: activeWorkspace?.id || '',
        classId: quizForm.classId || '',
        title: quizForm.title.trim() || `Kuis ${activeWorkspace?.subject || 'Pembelajaran'}`,
        description: quizForm.description.trim(),
        subject: activeWorkspace?.subject || '',
        grade: activeWorkspace?.grade || '',
        accessCode: code,
        mode: quizForm.mode,
        durationMinutes: Number(quizForm.durationMinutes),
        maxAttempts: 1,
        shuffleQuestions: quizForm.shuffleQuestions,
        shuffleOptions: quizForm.shuffleOptions,
        passingScore: Number(quizForm.passingScore),
        showResultsToStudent: quizForm.showResultsToStudent,
        requireStudentIdentity: quizForm.requireStudentIdentity,
        status: 'published',
        publicQuestions,
        sealedKey,
      });

      setQuizForm((p) => ({ ...p, title: '', description: '' }));
      notify(`Kuis dipublikasikan dengan Kode: ${code}`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Gagal mempublikasikan kuis.', 'error');
    } finally {
      setPublishing(false);
    }
  };

  if (mode === 'kisi-kisi') {
    const totalBobot = wsQuestions.reduce((sum, q) => sum + Number(q.points || 0), 0);
    const kisiMetadata = [
      { label: 'Satuan Pendidikan', value: schoolDisplay },
      { label: 'Mata Pelajaran', value: activeWorkspace?.subject || '-' },
      { label: 'Kelas / Semester', value: `${activeWorkspace?.grade || '-'} / ${activeWorkspace?.semester || '-'}` },
      { label: 'Tahun Pelajaran', value: activeWorkspace?.academicYear || '2026/2027' },
      { label: 'Guru Penyusun', value: teacherName },
    ];
    const kisiPayload: PrintableDocPayload = {
      title: 'Kisi-Kisi Penulisan Soal',
      subtitle: `${activeWorkspace?.subject || '-'} · ${activeWorkspace?.grade || '-'} · Tahun Pelajaran ${activeWorkspace?.academicYear || '2026/2027'}`,
      fileName: `Kisi_Kisi_${(activeWorkspace?.subject || 'Mapel').replace(/\s+/g, '_')}`,
      school: activeSchool,
      teacher: profile,
      metadataPairs: kisiMetadata,
      sections: [
        {
          heading: 'Matriks Kisi-Kisi Penulisan Soal',
          table: {
            headers: ['No', 'Kode TP', 'Materi', 'Indikator Soal', 'Level', 'Bentuk Soal', 'No Soal', 'Bobot'],
            rows: [
              ...wsQuestions.map((q, i) => [
                i + 1,
                q.tpCode || '-',
                q.topic || '-',
                q.indicator || '-',
                `${q.cognitiveLevel} (${q.hotsTier || 'MOTS'})`,
                q.questionType,
                i + 1,
                q.points,
              ]),
              ['', '', '', '', '', '', 'Total Bobot', totalBobot],
            ],
          },
        },
      ],
    };

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 no-print">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Kisi-Kisi Soal Otomatis</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Terhubung langsung dengan butir soal pada Bank Soal ({wsQuestions.length} indikator).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => exportDocumentPdf(kisiPayload)} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" /> PDF
            </button>
            <button onClick={() => exportDocumentDocx(kisiPayload)} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> DOCX
            </button>
            <button
              onClick={() =>
                exportTableXlsx({
                  fileName: `Kisi_Kisi_${activeWorkspace?.subject || 'Mapel'}`,
                  sheetName: 'Kisi-Kisi',
                  headers: ['No', 'TP', 'Materi', 'Indikator Soal', 'Level Kognitif', 'Tier', 'Bentuk Soal', 'Bobot'],
                  rows: wsQuestions.map((q, i) => [
                    i + 1,
                    q.tpCode || '-',
                    q.topic || '-',
                    q.indicator || '-',
                    q.cognitiveLevel,
                    q.hotsTier || 'MOTS',
                    q.questionType,
                    q.points,
                  ]),
                })
              }
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> XLSX
            </button>
            <button
              onClick={() => window.print()}
              className="px-3 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" /> Cetak A4
            </button>
          </div>
        </div>

        <OfficialDocumentSheet
          school={activeSchool}
          teacher={profile}
          title="Kisi-Kisi Penulisan Soal"
          subtitle={`${activeWorkspace?.subject || '-'} · ${activeWorkspace?.grade || '-'} · Tahun Pelajaran ${activeWorkspace?.academicYear || '2026/2027'}`}
          subjectLabel={activeWorkspace?.subject}
          metadataPairs={kisiMetadata}
        >
          <div className="space-y-2">
            <div className="bg-[#EEF4FB] border-l-4 border-[#1E3A8A] px-3 py-1.5 font-bold text-sm text-[#003380]">
              Matriks Kisi-Kisi Penulisan Soal
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-slate-400 text-xs">
                <thead>
                  <tr className="bg-[#DCE6F2] text-slate-900 font-bold text-left">
                    <th className="border border-slate-400 px-2.5 py-2 text-center w-10">No</th>
                    <th className="border border-slate-400 px-3 py-2 w-40">TP & Materi</th>
                    <th className="border border-slate-400 px-3 py-2">Indikator Pencapaian Soal</th>
                    <th className="border border-slate-400 px-2.5 py-2 text-center w-28">Level Kognitif</th>
                    <th className="border border-slate-400 px-2.5 py-2 w-32">Bentuk Soal</th>
                    <th className="border border-slate-400 px-2.5 py-2 text-center w-16">No. Soal</th>
                    <th className="border border-slate-400 px-2.5 py-2 text-center w-16">Bobot</th>
                  </tr>
                </thead>
                <tbody>
                  {wsQuestions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="border border-slate-400 px-3 py-6 text-center text-slate-500">
                        Belum ada butir soal di Bank Soal. Buat soal terlebih dahulu untuk menyusun kisi-kisi otomatis.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {wsQuestions.map((q, i) => (
                        <tr key={q.id}>
                          <td className="border border-slate-400 px-2.5 py-2 text-center font-mono tabular-nums">{i + 1}</td>
                          <td className="border border-slate-400 px-3 py-2 align-top">
                            <p className="font-mono text-[11px] font-bold text-[#003380]">{q.tpCode || '-'}</p>
                            <p className="font-semibold text-slate-900">{q.topic}</p>
                          </td>
                          <td className="border border-slate-400 px-3 py-2 align-top text-slate-800">{q.indicator || '-'}</td>
                          <td className="border border-slate-400 px-2.5 py-2 text-center font-mono">
                            {q.cognitiveLevel} · {q.hotsTier || 'MOTS'}
                          </td>
                          <td className="border border-slate-400 px-2.5 py-2 capitalize">
                            {String(q.questionType || '').replace(/_/g, ' ')}
                          </td>
                          <td className="border border-slate-400 px-2.5 py-2 text-center font-mono tabular-nums">{i + 1}</td>
                          <td className="border border-slate-400 px-2.5 py-2 text-center font-mono tabular-nums font-semibold">
                            {q.points}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-slate-50 font-bold text-slate-900">
                        <td colSpan={6} className="border border-slate-400 px-3 py-2 text-right">
                          Total Bobot Skor Keseluruhan ({wsQuestions.length} Butir Soal)
                        </td>
                        <td className="border border-slate-400 px-2.5 py-2 text-center font-mono tabular-nums">
                          {totalBobot}
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </OfficialDocumentSheet>
      </div>
    );
  }

  if (mode === 'asesmen-ujian') {
    const totalExamScore = activeExamList.reduce((sum, q) => sum + Number(q.points || 0), 0);
    const examMetadata = [
      { label: 'Satuan Pendidikan', value: schoolDisplay },
      { label: 'Mata Pelajaran', value: activeWorkspace?.subject || '-' },
      { label: 'Kelas / Semester', value: `${activeWorkspace?.grade || '-'} / ${activeWorkspace?.semester || '-'}` },
      { label: 'Paket / Jumlah Soal', value: `${paketLabel} (${activeExamList.length} butir · Total Skor ${totalExamScore})` },
      ...(examPreviewTab === 'kunci' ? [{ label: 'Guru Penyusun', value: teacherName }] : []),
    ];

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 no-print">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              Asesmen & Variasi Paket Ujian (A/B/C/D)
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Cetak naskah soal bersih untuk peserta didik dan kunci jawaban + rubrik secara terpisah untuk guru.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['Paket A', 'Paket B', 'Paket C', 'Paket D'] as const).map((pkg) => (
              <button
                key={pkg}
                onClick={() => buildPaketQuestions(pkg)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border ${
                  paketLabel === pkg
                    ? 'bg-blue-700 text-white border-blue-700'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                }`}
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>{pkg}</span>
              </button>
            ))}
            <button
              onClick={() => window.print()}
              className="px-3 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" /> Cetak A4
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 no-print">
          <div
            className={`p-5 rounded-xl bg-white dark:bg-slate-900 border space-y-3 transition-colors ${
              examPreviewTab === 'soal' ? 'border-blue-600 ring-1 ring-blue-600/20' : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Naskah Soal Peserta ({paketLabel})
              </h2>
              <button
                type="button"
                onClick={() => setExamPreviewTab('soal')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                  examPreviewTab === 'soal'
                    ? 'bg-blue-50 text-blue-700 dark:bg-sky-950/60 dark:text-sky-300'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {examPreviewTab === 'soal' ? 'Sedang Dipratinjau' : 'Pratinjau Naskah'}
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Memuat kotak identitas peserta, petunjuk pengerjaan, dan butir soal tanpa kunci jawaban.
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => exportExamSheet(false, 'pdf')} className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5" /> Unduh Naskah PDF
              </button>
              <button onClick={() => exportExamSheet(false, 'docx')} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Unduh Naskah DOCX
              </button>
            </div>
          </div>

          <div
            className={`p-5 rounded-xl bg-white dark:bg-slate-900 border space-y-3 transition-colors ${
              examPreviewTab === 'kunci' ? 'border-emerald-600 ring-1 ring-emerald-600/20' : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Kunci Jawaban & Pedoman Penskoran ({paketLabel})
              </h2>
              <button
                type="button"
                onClick={() => setExamPreviewTab('kunci')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                  examPreviewTab === 'kunci'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {examPreviewTab === 'kunci' ? 'Sedang Dipratinjau' : 'Pratinjau Kunci'}
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Dokumen terpisah untuk guru berisi kunci jawaban, pembahasan, serta rubrik soal uraian.
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => exportExamSheet(true, 'pdf')} className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5" /> Kunci Jawaban PDF
              </button>
              <button onClick={() => exportExamSheet(true, 'docx')} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Kunci Jawaban DOCX
              </button>
            </div>
          </div>
        </div>

        {/* Pratinjau Lembar Resmi A4 */}
        <OfficialDocumentSheet
          school={activeSchool}
          teacher={profile}
          title={
            examPreviewTab === 'kunci'
              ? `Kunci Jawaban & Pedoman Penskoran (${paketLabel})`
              : `Naskah Soal Asesmen (${paketLabel})`
          }
          subtitle={`${activeWorkspace?.subject || '-'} · ${activeWorkspace?.grade || '-'} · Tahun Pelajaran ${activeWorkspace?.academicYear || '2026/2027'}`}
          subjectLabel={activeWorkspace?.subject}
          metadataPairs={examMetadata}
          accentColor={examPreviewTab === 'kunci' ? 'emerald' : 'navy'}
          includeSignatures={examPreviewTab === 'kunci'}
        >
          {examPreviewTab === 'soal' && (
            <div className="grid grid-cols-1 md:grid-cols-2 border border-slate-400 text-xs">
              <div className="grid grid-cols-[130px_1fr] border-b md:border-r border-slate-400">
                <span className="bg-slate-100 font-bold px-3 py-2 border-r border-slate-400">Nama Peserta</span>
                <span className="px-3 py-2 text-slate-400">.......................................................</span>
              </div>
              <div className="grid grid-cols-[130px_1fr] border-b border-slate-400">
                <span className="bg-slate-100 font-bold px-3 py-2 border-r border-slate-400">Kelas / No. Ujian</span>
                <span className="px-3 py-2 text-slate-400">....................... / ............................</span>
              </div>
              <div className="grid grid-cols-[130px_1fr] border-b md:border-b-0 md:border-r border-slate-400">
                <span className="bg-slate-100 font-bold px-3 py-2 border-r border-slate-400">Hari / Tanggal</span>
                <span className="px-3 py-2 text-slate-400">.......................................................</span>
              </div>
              <div className="grid grid-cols-[130px_1fr]">
                <span className="bg-slate-100 font-bold px-3 py-2 border-r border-slate-400">Nilai / Paraf Guru</span>
                <span className="px-3 py-2 text-slate-400">....................... / ............................</span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div
              className={`border-l-4 px-3 py-1.5 font-bold text-sm ${
                examPreviewTab === 'kunci'
                  ? 'bg-emerald-50 border-emerald-700 text-emerald-950'
                  : 'bg-[#EEF4FB] border-[#1E3A8A] text-[#003380]'
              }`}
            >
              A. Petunjuk Pengerjaan
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-800 space-y-1 text-justify">
              {examPreviewTab === 'kunci' ? (
                <p>
                  Dokumen rahasia khusus guru/korektor. Gunakan kunci jawaban, pembahasan, dan bobot skor di bawah ini
                  sebagai pedoman penilaian objektif dan uraian.
                </p>
              ) : (
                <>
                  <p>1. Berdoalah terlebih dahulu sebelum mulai mengerjakan asesmen.</p>
                  <p>2. Tuliskan identitas diri pada kolom di atas secara lengkap dan jelas.</p>
                  <p>3. Bacalah setiap butir soal dengan cermat dan kerjakan sesuai instruksi masing-masing tipe soal.</p>
                </>
              )}
            </div>
          </div>

          {examPreviewTab === 'kunci' ? (
            <div className="space-y-2">
              <div className="bg-emerald-50 border-l-4 border-emerald-700 px-3 py-1.5 font-bold text-sm text-emerald-950">
                B. Kunci Jawaban, Pembahasan & Rubrik Penskoran
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-slate-400 text-xs">
                  <thead>
                    <tr className="bg-[#DCE6F2] text-slate-900 font-bold text-left">
                      <th className="border border-slate-400 px-2.5 py-2 text-center w-10">No</th>
                      <th className="border border-slate-400 px-2.5 py-2 w-28">Tipe Soal</th>
                      <th className="border border-slate-400 px-2.5 py-2 text-center w-16">Level</th>
                      <th className="border border-slate-400 px-3 py-2 w-40">Kunci Jawaban</th>
                      <th className="border border-slate-400 px-3 py-2">Pembahasan / Rubrik</th>
                      <th className="border border-slate-400 px-2.5 py-2 text-center w-16">Skor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeExamList.map((q, i) => (
                      <tr key={q.id || i}>
                        <td className="border border-slate-400 px-2.5 py-2 text-center font-mono tabular-nums">{i + 1}</td>
                        <td className="border border-slate-400 px-2.5 py-2 capitalize">
                          {String(q.questionType || '').replace(/_/g, ' ')}
                        </td>
                        <td className="border border-slate-400 px-2.5 py-2 text-center font-mono">{q.cognitiveLevel}</td>
                        <td className="border border-slate-400 px-3 py-2 font-semibold text-emerald-900">
                          {q.correctAnswer || '-'}
                        </td>
                        <td className="border border-slate-400 px-3 py-2 text-slate-700">
                          {q.explanation || q.rubric || '-'}
                        </td>
                        <td className="border border-slate-400 px-2.5 py-2 text-center font-mono tabular-nums font-semibold">
                          {q.points}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold text-slate-900">
                      <td colSpan={5} className="border border-slate-400 px-3 py-2 text-right">
                        Total Skor Maksimal ({activeExamList.length} Butir Soal)
                      </td>
                      <td className="border border-slate-400 px-2.5 py-2 text-center font-mono tabular-nums">
                        {totalExamScore}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-[#EEF4FB] border-l-4 border-[#1E3A8A] px-3 py-1.5 font-bold text-sm text-[#003380]">
                B. Butir Soal Asesmen
              </div>
              {activeExamList.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  Bank soal masih kosong. Tambahkan soal di menu Bank Soal terlebih dahulu.
                </p>
              ) : (
                <div className="space-y-6">
                  {(() => {
                    const pgList = activeExamList.filter((q) => getQuestionTypeRank(q.questionType) === 1);
                    const bsList = activeExamList.filter((q) => getQuestionTypeRank(q.questionType) === 2);
                    const esaiList = activeExamList.filter((q) => getQuestionTypeRank(q.questionType) === 3);
                    let globalIdx = 1;

                    return (
                      <>
                        {pgList.length > 0 && (
                          <div className="space-y-3">
                            <h4 className="font-bold text-xs uppercase tracking-wide text-slate-800 border-b border-slate-200 pb-1">
                              I. Pilihan Ganda
                            </h4>
                            <div className="columns-1 md:columns-2 print:columns-2 gap-7 [column-rule:1px_solid_#cbd5e1]">
                              {pgList.map((q, i) => (
                                <div
                                  key={q.id || i}
                                  className="break-inside-avoid mb-3.5 text-xs text-slate-900 space-y-1 text-justify"
                                >
                                  <p className="font-medium leading-relaxed">
                                    <span className="font-bold mr-1.5">{globalIdx++}.</span>
                                    {q.stem}{' '}
                                    <span className="text-[11px] font-mono text-slate-500">({q.points} poin)</span>
                                  </p>
                                  {q.options && q.options.length > 0 && (
                                    <div className="pl-4 space-y-0.5 text-slate-800">
                                      {q.options.map((o, oi) => (
                                        <p key={oi} className="leading-snug">{o}</p>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {bsList.length > 0 && (
                          <div className="space-y-3">
                            <h4 className="font-bold text-xs uppercase tracking-wide text-slate-800 border-b border-slate-200 pb-1">
                              {pgList.length > 0 ? 'II. Soal Benar / Salah' : 'I. Soal Benar / Salah'}
                            </h4>
                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse border border-slate-400 text-xs">
                                <thead>
                                  <tr className="bg-[#DCE6F2] text-slate-900 font-bold">
                                    <th className="border border-slate-400 px-2.5 py-2 text-center w-10">No</th>
                                    <th className="border border-slate-400 px-3 py-2 text-left">Pernyataan Soal</th>
                                    <th className="border border-slate-400 px-3 py-2 text-center w-24">Benar (B)</th>
                                    <th className="border border-slate-400 px-3 py-2 text-center w-24">Salah (S)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {bsList.map((q, i) => (
                                    <tr key={q.id || i} className="hover:bg-slate-50/50">
                                      <td className="border border-slate-400 px-2.5 py-2 text-center font-mono tabular-nums">
                                        {globalIdx++}
                                      </td>
                                      <td className="border border-slate-400 px-3 py-2 text-slate-900 leading-relaxed">
                                        {q.stem}{' '}
                                        <span className="text-[11px] font-mono text-slate-500">({q.points} poin)</span>
                                      </td>
                                      <td className="border border-slate-400 px-3 py-2 text-center font-bold text-slate-700">
                                        [ &nbsp; &nbsp; ]
                                      </td>
                                      <td className="border border-slate-400 px-3 py-2 text-center font-bold text-slate-700">
                                        [ &nbsp; &nbsp; ]
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {esaiList.length > 0 && (
                          <div className="space-y-3">
                            <h4 className="font-bold text-xs uppercase tracking-wide text-slate-800 border-b border-slate-200 pb-1">
                              {pgList.length > 0 && bsList.length > 0
                                ? 'III. Soal Uraian / Esai'
                                : pgList.length > 0 || bsList.length > 0
                                ? 'II. Soal Uraian / Esai'
                                : 'I. Soal Uraian / Esai'}
                            </h4>
                            <div className="space-y-4">
                              {esaiList.map((q, i) => (
                                <div key={q.id || i} className="text-xs md:text-[13px] text-slate-900 space-y-2 pb-3 border-b border-slate-100 last:border-none text-justify">
                                  <p className="font-medium leading-relaxed">
                                    <span className="font-bold mr-1.5">{globalIdx++}.</span>
                                    {q.stem}{' '}
                                    <span className="text-[11px] font-mono text-slate-500">({q.points} poin)</span>
                                  </p>
                                  <div className="pl-5 pt-1 space-y-2">
                                    <div className="border-b border-dashed border-slate-400 h-6" />
                                    <div className="border-b border-dashed border-slate-400 h-6" />
                                    <div className="border-b border-dashed border-slate-400 h-6" />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </OfficialDocumentSheet>
      </div>
    );
  }

  if (mode === 'kuis-online') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Kuis Online & Ujian Digital Siswa
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Publikasikan kuis dengan kunci jawaban terenkripsi di server. Siswa mengerjakan langsung lewat kode atau tautan di HP.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handlePublishQuiz}
            className="lg:col-span-5 p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Buat & Publikasikan Kuis Baru
            </h2>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Judul Kuis</label>
              <input
                type="text"
                required
                value={quizForm.title}
                onChange={(e) => setQuizForm({ ...quizForm, title: e.target.value })}
                placeholder={`Kuis Harian ${activeWorkspace?.subject || ''}`}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Mode</label>
                <select
                  value={quizForm.mode}
                  onChange={(e) => setQuizForm({ ...quizForm, mode: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                >
                  <option value="latihan">Mode Latihan</option>
                  <option value="ujian">Mode Ujian</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Durasi (Menit)</label>
                <input
                  type="number"
                  min={5}
                  max={240}
                  value={quizForm.durationMinutes}
                  onChange={(e) => setQuizForm({ ...quizForm, durationMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Jumlah Soal (Tersedia {wsQuestions.length})</label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, wsQuestions.length)}
                  value={quizForm.questionCount}
                  onChange={(e) => setQuizForm({ ...quizForm, questionCount: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Nilai Minimum (KKM)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={quizForm.passingScore}
                  onChange={(e) => setQuizForm({ ...quizForm, passingScore: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={quizForm.shuffleQuestions}
                  onChange={(e) => setQuizForm({ ...quizForm, shuffleQuestions: e.target.checked })}
                />
                <span>Acak urutan soal untuk setiap siswa</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={quizForm.shuffleOptions}
                  onChange={(e) => setQuizForm({ ...quizForm, shuffleOptions: e.target.checked })}
                />
                <span>Acak pilihan jawaban</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={quizForm.showResultsToStudent}
                  onChange={(e) => setQuizForm({ ...quizForm, showResultsToStudent: e.target.checked })}
                />
                <span>Tampilkan nilai langsung setelah selesai</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={publishing}
              className="w-full py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
            >
              {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
              <span>{publishing ? 'Mengenkripsi Kunci & Publikasi...' : 'Publikasikan Kuis Online'}</span>
            </button>
          </form>

          <div className="lg:col-span-7 space-y-4">
            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Daftar Kuis Aktif ({quizzes.length})
              </h2>
              {quizzes.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">Belum ada kuis dipublikasikan.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {quizzes.map((q) => {
                    const shareUrl = `${window.location.origin}/?quiz=${q.accessCode}`;
                    const subCount = quizSubmissions.filter((s) => s.quizId === q.id).length;
                    return (
                      <div key={q.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">{q.title}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                            Kode: {q.accessCode} · {q.publicQuestions?.length || 0} soal · {q.durationMinutes} mnt · {subCount} pengumpulan
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(shareUrl);
                              notify(`Tautan kuis ${q.accessCode} disalin.`, 'success');
                            }}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>Salin Tautan</span>
                          </button>
                          {q.id && (
                            <button
                              onClick={() => deleteRecord('quizzes', q.id!)}
                              className="p-1.5 text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Hasil Pengerjaan & Koreksi ({quizSubmissions.length})
              </h2>
              {quizSubmissions.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">Belum ada siswa yang mengirimkan jawaban.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500">
                        <th className="py-2 pr-3">Nama Siswa</th>
                        <th className="py-2 px-3">Kelas</th>
                        <th className="py-2 px-3">Skor</th>
                        <th className="py-2 px-3">Nilai Akhir</th>
                        <th className="py-2 pl-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {quizSubmissions.map((sub) => (
                        <tr key={sub.id}>
                          <td className="py-2.5 pr-3 font-semibold">{sub.studentName}</td>
                          <td className="py-2.5 px-3">{sub.className || '-'}</td>
                          <td className="py-2.5 px-3 font-mono tabular-nums">
                            {sub.finalScore}/{sub.maxScore}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums font-bold">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              defaultValue={sub.percentage}
                              onBlur={(e) => {
                                const val = Number(e.target.value);
                                if (sub.id && val !== sub.percentage) {
                                  updateRecord('quiz_submissions', sub.id, {
                                    percentage: val,
                                    gradingStatus: 'teacher_reviewed',
                                  });
                                  notify('Nilai siswa diperbarui oleh guru.', 'success');
                                }
                              }}
                              className="w-16 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                            />
                          </td>
                          <td className="py-2.5 pl-3">
                            {sub.passed ? (
                              <span className="text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1 font-semibold">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Tuntas
                              </span>
                            ) : (
                              <span className="text-amber-700 dark:text-amber-400 font-semibold">Perlu Remedial</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Bank Soal view
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Bank Soal & Generator Asesmen
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Susun jumlah soal bebas (1–50+) across 13 tipe soal, level kognitif C1–C6, dan proporsi LOTS/MOTS/HOTS.
        </p>
      </div>

      <form
        onSubmit={handleGenerateQuestions}
        className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Materi / Topik</label>
            <input
              type="text"
              value={qForm.topic}
              onChange={(e) => setQForm({ ...qForm, topic: e.target.value })}
              placeholder="Otomatis dari kurikulum aktif"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Jumlah Soal (Bebas)</label>
            <input
              type="number"
              min={1}
              max={50}
              value={qForm.questionCount}
              onChange={(e) => setQForm({ ...qForm, questionCount: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Kategori Asesmen</label>
            <select
              value={qForm.category}
              onChange={(e) => setQForm({ ...qForm, category: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            >
              <option value="Asesmen Diagnostik">Asesmen Diagnostik</option>
              <option value="Asesmen Formatif">Asesmen Formatif</option>
              <option value="Asesmen Sumatif">Asesmen Sumatif</option>
              <option value="Kuis Harian">Kuis Harian</option>
              <option value="Penilaian Tengah Semester">Penilaian Tengah Semester</option>
              <option value="Penilaian Akhir Semester">Penilaian Akhir Semester</option>
              <option value="Ujian Akhir">Ujian Akhir</option>
              <option value="Remedial">Remedial</option>
              <option value="Pengayaan">Pengayaan</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Proporsi HOTS (%)</label>
            <div className="flex items-center gap-1 text-xs">
              <input
                type="number"
                value={qForm.lots}
                onChange={(e) => setQForm({ ...qForm, lots: Number(e.target.value) })}
                className="w-16 px-2 py-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                title="LOTS %"
              />
              <input
                type="number"
                value={qForm.mots}
                onChange={(e) => setQForm({ ...qForm, mots: Number(e.target.value) })}
                className="w-16 px-2 py-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                title="MOTS %"
              />
              <input
                type="number"
                value={qForm.hots}
                onChange={(e) => setQForm({ ...qForm, hots: Number(e.target.value) })}
                className="w-16 px-2 py-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                title="HOTS %"
              />
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Jenis Soal yang Diinginkan</p>
          <div className="flex flex-wrap gap-2">
            {QUESTION_TYPES.map((qt) => {
              const active = qForm.selectedTypes.includes(qt.id);
              return (
                <button
                  key={qt.id}
                  type="button"
                  onClick={() =>
                    setQForm((p) => ({
                      ...p,
                      selectedTypes: active
                        ? p.selectedTypes.filter((x) => x !== qt.id)
                        : [...p.selectedTypes, qt.id],
                    }))
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                    active
                      ? 'bg-blue-700 text-white border-blue-700'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {qt.label}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={generating}
          className="px-5 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center gap-2"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          <span>{generating ? 'Menyusun Soal...' : `Generate ${qForm.questionCount} Soal`}</span>
        </button>
      </form>

      {/* Questions List */}
      <div className="space-y-3">
        <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
          Koleksi Bank Soal ({wsQuestions.length})
        </h2>
        {wsQuestions.map((q, idx) => (
          <div
            key={q.id}
            className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>
                #{idx + 1} · {q.questionType} · {q.cognitiveLevel} ({q.hotsTier || 'MOTS'}) · {q.difficulty} · {q.points} poin
              </span>
              {q.id && (
                <button onClick={() => deleteRecord('questions', q.id!)} className="text-slate-400 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="text-sm font-medium text-slate-900 dark:text-white whitespace-pre-line">{q.stem}</p>
            {q.options && q.options.length > 0 && (
              <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1 pl-4">
                {q.options.map((opt, oi) => (
                  <li key={oi}>{opt}</li>
                ))}
              </ul>
            )}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs space-y-1">
              <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                Kunci Jawaban: {q.correctAnswer}
              </p>
              <p className="text-slate-600 dark:text-slate-300">Pembahasan: {q.explanation}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
