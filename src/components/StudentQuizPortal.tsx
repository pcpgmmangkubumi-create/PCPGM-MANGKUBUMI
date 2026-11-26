import React, { useEffect, useState } from 'react';
import { Clock, CheckCircle2, ArrowLeft, ArrowRight, Send, AlertTriangle } from 'lucide-react';
import { where, serverTimestamp } from 'firebase/firestore';
import { listByWhere, createRecord } from '../lib/firestoreHelpers';
import { postPublicJson } from '../lib/apiClient';
import { QuizRecord } from '../types/education';
import { auth } from '../lib/firebase';

interface GradedResult {
  autoScore: number;
  finalScore: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  studentViewFeedback: {
    questionId: string;
    earnedPoints: number;
    maxPoints: number;
    isCorrect: boolean;
    feedback: string;
    correctAnswer?: string;
  }[];
  itemFeedback: any[];
}

export const StudentQuizPortal: React.FC = () => {
  const [codeInput, setCodeInput] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('quiz') || '').toUpperCase();
  });
  const [quiz, setQuiz] = useState<QuizRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [studentName, setStudentName] = useState('');
  const [studentNis, setStudentNis] = useState('');
  const [className, setClassName] = useState('');
  const [started, setStarted] = useState(false);

  const [questionsOrder, setQuestionsOrder] = useState<QuizRecord['publicQuestions']>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GradedResult | null>(null);

  const loadQuizByCode = async (rawCode: string) => {
    const clean = rawCode.trim().toUpperCase();
    if (!clean) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const found = await listByWhere<QuizRecord>('quizzes', [
        where('accessCode', '==', clean),
        where('status', '==', 'published'),
      ]);
      if (found.length === 0) {
        setErrorMsg('Kode kuis tidak ditemukan atau kuis belum dipublikasikan oleh guru.');
        setQuiz(null);
      } else {
        const q = found[0];
        setQuiz(q);
        // Restore autosaved answers if connection dropped
        const saved = sessionStorage.getItem(`quiz_progress_${q.id}`);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed.answers) setAnswers(parsed.answers);
            if (parsed.studentName) setStudentName(parsed.studentName);
          } catch {
            // Ignore corrupt draft
          }
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal memuat kuis.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (codeInput) {
      loadQuizByCode(codeInput);
    }
  }, []);

  // Periodic auto-save in sessionStorage
  useEffect(() => {
    if (quiz?.id && started && !result) {
      sessionStorage.setItem(
        `quiz_progress_${quiz.id}`,
        JSON.stringify({ answers, studentName, studentNis, className })
      );
    }
  }, [answers, quiz, started, result, studentName, studentNis, className]);

  // Countdown timer
  useEffect(() => {
    if (!started || result || secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timer);
          handleSubmitQuiz();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [started, result, secondsLeft]);

  const startAttempt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quiz) return;
    if (quiz.requireStudentIdentity !== false && !studentName.trim()) {
      setErrorMsg('Silakan isi nama lengkap terlebih dahulu.');
      return;
    }

    let ordered = [...(quiz.publicQuestions || [])];
    if (quiz.shuffleQuestions) {
      ordered = ordered.sort(() => Math.random() - 0.5);
    }
    if (quiz.shuffleOptions) {
      ordered = ordered.map((item) => ({
        ...item,
        options: item.options ? [...item.options].sort(() => Math.random() - 0.5) : undefined,
      }));
    }

    setQuestionsOrder(ordered);
    setSecondsLeft((quiz.durationMinutes || 30) * 60);
    setStarted(true);
    setErrorMsg('');
  };

  const handleSubmitQuiz = async () => {
    if (!quiz || !quiz.id || submitting || result) return;
    setSubmitting(true);
    try {
      const stems: Record<string, string> = {};
      (quiz.publicQuestions || []).forEach((q) => {
        stems[q.id] = q.stem;
      });

      const graded = await postPublicJson<GradedResult>('/api/quizzes/grade', {
        sealedKey: quiz.sealedKey,
        questionStems: stems,
        answers,
        passingScore: quiz.passingScore ?? 75,
        showResultsToStudent: quiz.showResultsToStudent ?? true,
      });

      await createRecord('quiz_submissions', {
        quizId: quiz.id,
        quizOwnerId: quiz.ownerId,
        studentUid: auth.currentUser?.uid || '',
        studentName: studentName.trim() || 'Peserta Didik',
        studentNis: studentNis.trim(),
        className: className.trim(),
        answers,
        autoScore: graded.autoScore,
        finalScore: graded.finalScore,
        maxScore: graded.maxScore,
        percentage: graded.percentage,
        passed: graded.passed,
        gradingStatus: 'auto_graded',
        itemFeedback: graded.itemFeedback,
        submittedAt: serverTimestamp(),
      });

      sessionStorage.removeItem(`quiz_progress_${quiz.id}`);
      setResult(graded);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal mengirim jawaban. Periksa koneksi Anda dan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (!quiz) {
    return (
      <div className="max-w-lg mx-auto p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
          Portal Kuis & Ujian Siswa
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Masukkan kode kuis yang dibagikan oleh guru Anda untuk memulai pengerjaan.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            loadQuizByCode(codeInput);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            placeholder="KODE KUIS (mis. BIO7A)"
            className="flex-1 px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-sm uppercase tracking-wider"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-3 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold"
          >
            {loading ? 'Mencari...' : 'Buka'}
          </button>
        </form>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>
    );
  }

  if (result) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Jawaban Berhasil Dikirim
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {studentName} · {className || quiz.grade} · {quiz.title}
          </p>
          {quiz.showResultsToStudent !== false ? (
            <div className="pt-2">
              <p className="font-mono tabular-nums text-4xl font-bold text-blue-700 dark:text-sky-400">
                {result.percentage} / 100
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Skor: {result.finalScore} dari {result.maxScore} · Status:{' '}
                <span className={result.passed ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>
                  {result.passed ? 'Tuntas' : 'Perlu Penguatan'}
                </span>
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Nilai akan diumumkan setelah seluruh sesi ujian selesai dan ditinjau oleh guru.
            </p>
          )}
        </div>

        {quiz.showResultsToStudent !== false && (
          <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Umpan Balik Per Soal
            </h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {result.studentViewFeedback.map((item, idx) => (
                <div key={item.questionId} className="py-3 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">Soal {idx + 1}</span>
                    <span className={`font-mono tabular-nums font-semibold ${item.isCorrect ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {item.earnedPoints}/{item.maxPoints} poin
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{item.feedback}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!started) {
    return (
      <form
        onSubmit={startAttempt}
        className="max-w-lg mx-auto p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
      >
        <div>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
            Kode {quiz.accessCode} · {quiz.mode === 'ujian' ? 'Mode Ujian' : 'Mode Latihan'} · {quiz.durationMinutes} Menit
          </p>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white mt-1">{quiz.title}</h1>
          {quiz.description && (
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{quiz.description}</p>
          )}
        </div>

        <div className="space-y-3 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Nama Lengkap Siswa</label>
            <input
              type="text"
              required={quiz.requireStudentIdentity !== false}
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="Masukkan nama lengkap"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">NIS (Opsional)</label>
              <input
                type="text"
                value={studentNis}
                onChange={(e) => setStudentNis(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Kelas</label>
              <input
                type="text"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder={quiz.grade || 'VII A'}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 text-xs text-slate-600 dark:text-slate-300 space-y-1">
          <p>Jumlah Soal: {(quiz.publicQuestions || []).length} butir</p>
          <p>Jawaban tersimpan otomatis di perangkat selama pengerjaan.</p>
        </div>

        {errorMsg && <p className="text-xs text-red-600">{errorMsg}</p>}

        <button
          type="submit"
          className="w-full py-3 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold"
        >
          Mulai Mengerjakan Kuis
        </button>
      </form>
    );
  }

  const currentQ = questionsOrder[currentIdx];

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Header & Timer */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {studentName} · Soal {currentIdx + 1} dari {questionsOrder.length}
          </p>
          <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white truncate">{quiz.title}</h2>
        </div>
        <div className="flex items-center gap-1.5 font-mono tabular-nums text-sm font-bold text-blue-700 dark:text-sky-400 shrink-0">
          <Clock className="w-4 h-4" />
          <span>{formatTimer(secondsLeft)}</span>
        </div>
      </div>

      {/* Question Card */}
      {currentQ && (
        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Soal No. {currentIdx + 1} · {currentQ.questionType}</span>
            <span className="font-mono tabular-nums">{currentQ.points} poin</span>
          </div>

          <p className="text-base font-medium text-slate-900 dark:text-white leading-relaxed whitespace-pre-line">
            {currentQ.stem}
          </p>

          {currentQ.options && currentQ.options.length > 0 ? (
            <div className="space-y-2.5">
              {currentQ.options.map((opt, idx) => {
                const selected = answers[currentQ.id] === opt;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setAnswers({ ...answers, [currentQ.id]: opt })}
                    className={`w-full min-h-[44px] px-4 py-3 rounded-lg border text-left text-sm transition-colors ${
                      selected
                        ? 'border-blue-700 bg-blue-50 dark:bg-sky-950/50 text-blue-900 dark:text-sky-100 font-semibold'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          ) : (
            <textarea
              rows={4}
              value={answers[currentQ.id] || ''}
              onChange={(e) => setAnswers({ ...answers, [currentQ.id]: e.target.value })}
              placeholder="Tuliskan jawaban Anda di sini..."
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          )}

          {/* Prev / Next / Submit */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              disabled={currentIdx === 0}
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 text-sm font-medium inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Sebelumnya</span>
            </button>

            {currentIdx < questionsOrder.length - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentIdx((i) => Math.min(questionsOrder.length - 1, i + 1))}
                className="min-h-[44px] px-5 py-2 rounded-lg bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-1.5"
              >
                <span>Berikutnya</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmitQuiz}
                className="min-h-[44px] px-5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold inline-flex items-center gap-1.5"
              >
                <Send className="w-4 h-4" />
                <span>{submitting ? 'Mengirim...' : 'Kirim Jawaban'}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Question Navigator */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Navigasi Nomor Soal</p>
        <div className="flex flex-wrap gap-2">
          {questionsOrder.map((q, idx) => {
            const answered = Boolean((answers[q.id] || '').trim());
            const current = idx === currentIdx;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setCurrentIdx(idx)}
                className={`w-10 h-10 rounded-lg font-mono tabular-nums text-xs font-bold border transition-colors ${
                  current
                    ? 'border-blue-700 bg-blue-700 text-white'
                    : answered
                    ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
      </div>

      {errorMsg && <p className="text-xs text-red-600 text-center">{errorMsg}</p>}
    </div>
  );
};
