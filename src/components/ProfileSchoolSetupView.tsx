import React, { useEffect, useRef, useState } from 'react';
import { Save, Plus, Trash2, Upload, Eraser, Loader2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { setRecord, createRecord, updateRecord, deleteRecord } from '../lib/firestoreHelpers';
import {
  EDUCATION_LEVELS,
  CLASS_OPTIONS_BY_LEVEL,
  DEFAULT_CURRICULA,
  DEFAULT_MONTHLY_CALENDAR,
  InstitutionTrack,
  detectInstitutionTrack,
  pickAutoSubjectForContext,
} from '../lib/curriculumData';
import { EducationLevel, HolidayItem, MonthlyWeekBreakdown } from '../types/education';
import { formatDocDateId } from '../lib/exporters';
import { OfficialSubjectField } from './OfficialSubjectField';

export const ProfileSchoolSetupView: React.FC<{ section: 'profil' | 'sekolah' | 'kurikulum' | 'kalender' | 'ai' }> = ({
  section,
}) => {
  const {
    user,
    profile,
    activeSchool,
    curricula,
    calendars,
    aiSettings,
    notify,
    resetting,
    openResetModal,
  } = useApp();

  // 1. Profil Guru state
  const [teacherForm, setTeacherForm] = useState({
    displayName: '',
    nip: '',
    nuptk: '',
    jabatan: 'Guru Mata Pelajaran',
    subject: '',
    classesTaught: '',
    phase: 'Fase D',
    level: 'SMP/MTs',
    schoolName: '',
    signatureDataUrl: '',
  });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [teacherTrack, setTeacherTrack] = useState<InstitutionTrack>('umum');
  const [schoolTrack, setSchoolTrack] = useState<InstitutionTrack>('umum');

  useEffect(() => {
    if (profile) {
      const lvl = profile.level || 'SMP/MTs';
      const schName = profile.schoolName || activeSchool?.name || '';
      setTeacherTrack(
        detectInstitutionTrack({
          schoolName: schName,
          level: lvl,
          subject: profile.subject,
        })
      );
      setTeacherForm({
        displayName: profile.displayName || '',
        nip: profile.nip || '',
        nuptk: profile.nuptk || '',
        jabatan: profile.jabatan || 'Guru Mata Pelajaran',
        subject: profile.subject || '',
        classesTaught: profile.classesTaught || '',
        phase: profile.phase || 'Fase D',
        level: lvl,
        schoolName: schName,
        signatureDataUrl: profile.signatureDataUrl || '',
      });
    }
    if (activeSchool) {
      setSchoolTrack(
        detectInstitutionTrack({
          schoolName: activeSchool.name,
          level: activeSchool.level,
          subject: activeSchool.subject,
        })
      );
    }
  }, [profile, activeSchool]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    await setRecord(
      'users',
      user.uid,
      {
        uid: user.uid,
        email: user.email || '',
        role: profile?.role || 'teacher',
        ...teacherForm,
      },
      !profile
    );
    notify('Profil guru berhasil disimpan.', 'success');
  };

  const optimizeImageDataUrl = (
    file: File,
    maxWidth: number,
    maxLength = 235_000
  ): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
      reader.onload = () => {
        const rawUrl = typeof reader.result === 'string' ? reader.result : '';
        if (!rawUrl) {
          reject(new Error('File gambar tidak valid.'));
          return;
        }
        const isSupportedDirect = /^data:image\/(png|jpeg|jpg);base64,/i.test(rawUrl);
        if (isSupportedDirect && rawUrl.length <= maxLength) {
          resolve(rawUrl);
          return;
        }
        const img = new Image();
        img.onerror = () => reject(new Error('Format gambar tidak dapat diproses. Gunakan PNG atau JPG.'));
        img.onload = () => {
          const origW = img.naturalWidth || img.width || maxWidth;
          const origH = img.naturalHeight || img.height || Math.round(maxWidth * 0.25);
          let targetW = Math.min(origW, maxWidth);
          let targetH = Math.max(1, Math.round((origH * targetW) / origW));

          const renderToCanvas = (w: number, h: number) => {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            return canvas;
          };

          const firstCanvas = renderToCanvas(targetW, targetH);
          if (!firstCanvas) {
            reject(new Error('Canvas tidak tersedia untuk mengoptimalkan gambar.'));
            return;
          }

          if (file.type === 'image/png') {
            const pngAttempt = firstCanvas.toDataURL('image/png');
            if (pngAttempt.length <= maxLength) {
              resolve(pngAttempt);
              return;
            }
          }

          const qualities = [0.92, 0.84, 0.76, 0.66, 0.56, 0.46];
          for (let scalePass = 0; scalePass < 4; scalePass++) {
            const c = scalePass === 0 ? firstCanvas : renderToCanvas(targetW, targetH);
            if (!c) break;
            for (const q of qualities) {
              const jpgUrl = c.toDataURL('image/jpeg', q);
              if (jpgUrl.length <= maxLength) {
                resolve(jpgUrl);
                return;
              }
            }
            targetW = Math.max(320, Math.round(targetW * 0.78));
            targetH = Math.max(1, Math.round((origH * targetW) / origW));
          }
          reject(new Error('Ukuran gambar terlalu besar setelah dikompresi. Gunakan gambar lebih ringkas.'));
        };
        img.src = rawUrl;
      };
      reader.readAsDataURL(file);
    });

  const handleUploadImage = async (
    file: File | undefined,
    cb: (dataUrl: string) => void | Promise<void>,
    maxWidth = 420
  ) => {
    if (!file) return;
    try {
      const dataUrl = await optimizeImageDataUrl(file, maxWidth);
      await cb(dataUrl);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal memproses gambar.', 'error');
    }
  };

  // Signature pad helpers
  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setDrawing(true);
  };

  const moveDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const rect = canvasRef.current.getBoundingClientRect();
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const endDraw = () => {
    if (!drawing || !canvasRef.current) return;
    setDrawing(false);
    setTeacherForm((prev) => ({
      ...prev,
      signatureDataUrl: canvasRef.current!.toDataURL('image/png'),
    }));
  };

  const clearCanvas = () => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setTeacherForm((prev) => ({ ...prev, signatureDataUrl: '' }));
  };

  // 2. Identitas Sekolah state
  const [schoolForm, setSchoolForm] = useState({
    name: '',
    npsn: '',
    level: 'SMP/MTs' as EducationLevel | string,
    status: 'Negeri',
    address: '',
    village: '',
    district: '',
    regency: '',
    province: '',
    principalName: '',
    principalNip: '',
    teacherName: '',
    teacherNip: '',
    subject: '',
    academicYear: '2026/2027',
    semester: 'Semester 1',
    logoDataUrl: '',
    agencyLogoDataUrl: '',
    letterheadDataUrl: '',
    titiMangsa: '',
  });

  useEffect(() => {
    if (activeSchool) {
      setSchoolForm({
        name: activeSchool.name || '',
        npsn: activeSchool.npsn || '',
        level: activeSchool.level || 'SMP/MTs',
        status: activeSchool.status || 'Negeri',
        address: activeSchool.address || '',
        village: activeSchool.village || '',
        district: activeSchool.district || '',
        regency: activeSchool.regency || '',
        province: activeSchool.province || '',
        principalName: activeSchool.principalName || '',
        principalNip: activeSchool.principalNip || '',
        teacherName: activeSchool.teacherName || profile?.displayName || '',
        teacherNip: activeSchool.teacherNip || profile?.nip || '',
        subject: activeSchool.subject || profile?.subject || '',
        academicYear: activeSchool.academicYear || '2026/2027',
        semester: activeSchool.semester || 'Semester 1',
        logoDataUrl: activeSchool.logoDataUrl || '',
        agencyLogoDataUrl: activeSchool.agencyLogoDataUrl || '',
        letterheadDataUrl: activeSchool.letterheadDataUrl || '',
        titiMangsa: activeSchool.titiMangsa || '',
      });
    } else if (profile) {
      setSchoolForm((prev) => ({
        ...prev,
        teacherName: profile.displayName || '',
        teacherNip: profile.nip || '',
        subject: profile.subject || '',
      }));
    }
  }, [activeSchool, profile]);

  const handleSaveSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!schoolForm.name.trim()) {
      notify('Nama sekolah wajib diisi.', 'error');
      return;
    }
    if (activeSchool?.id) {
      await updateRecord('schools', activeSchool.id, { ...schoolForm });
    } else {
      await createRecord('schools', { ownerId: user.uid, ...schoolForm });
    }
    notify('Identitas sekolah berhasil disimpan dan otomatis terhubung ke semua dokumen.', 'success');
  };

  // 3. Pengaturan Kurikulum state
  const [newCurr, setNewCurr] = useState({ name: '', code: '', description: '', components: 'Elemen, CP, TP, ATP, Modul Ajar' });
  const handleAddCurriculum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newCurr.name || !newCurr.code) return;
    await createRecord('curricula', {
      ownerId: user.uid,
      name: newCurr.name.trim(),
      code: newCurr.code.trim().toUpperCase(),
      description: newCurr.description.trim(),
      structureComponents: newCurr.components.split(',').map((s) => s.trim()).filter(Boolean),
      isActive: false,
    });
    setNewCurr({ name: '', code: '', description: '', components: 'Elemen, CP, TP, ATP, Modul Ajar' });
    notify('Kurikulum baru ditambahkan.', 'success');
  };

  // 4. Kalender Pendidikan state
  const activeCal = calendars[0];
  const [calYear, setCalYear] = useState('2026/2027');
  const [calSem, setCalSem] = useState('Semester 1 & 2');
  const [monthly, setMonthly] = useState<MonthlyWeekBreakdown[]>(DEFAULT_MONTHLY_CALENDAR);
  const [holidays, setHolidays] = useState<HolidayItem[]>([
    { date: '2026-08-17', title: 'Hari Kemerdekaan RI', type: 'nasional' },
  ]);
  const [newHoliday, setNewHoliday] = useState<HolidayItem>({ date: '', title: '', type: 'nasional' });

  useEffect(() => {
    if (activeCal) {
      setCalYear(activeCal.academicYear || '2026/2027');
      setCalSem(activeCal.semester || 'Semester 1 & 2');
      if (activeCal.monthlySchedule?.length) setMonthly(activeCal.monthlySchedule);
      if (activeCal.holidays?.length) setHolidays(activeCal.holidays);
    }
  }, [activeCal]);

  const totalWeeks = monthly.reduce((a, b) => a + Number(b.totalWeeks || 0), 0);
  const nonEffectiveWeeks = monthly.reduce((a, b) => a + Number(b.nonEffectiveWeeks || 0), 0);
  const effectiveWeeks = monthly.reduce((a, b) => a + Number(b.effectiveWeeks || 0), 0);

  const handleSaveCalendar = async () => {
    if (!user) return;
    const payload = {
      ownerId: user.uid,
      academicYear: calYear,
      semester: calSem,
      totalWeeks,
      effectiveWeeks,
      nonEffectiveWeeks,
      holidays,
      monthlySchedule: monthly,
    };
    if (activeCal?.id) {
      await updateRecord('calendars', activeCal.id, payload);
    } else {
      await createRecord('calendars', payload);
    }
    notify('Kalender pendidikan & analisis minggu efektif disimpan.', 'success');
  };

  // 5. Pengaturan AI state
  const [aiForm, setAiForm] = useState({
    model: 'gemini-4-hydrogen',
    language: 'Bahasa Indonesia Baku',
    tone: 'Akademik, komunikatif, dan sesuai usia peserta didik',
    materialLength: 'Sedang-Lengkap',
    detailLevel: 'Mendalam & Terstruktur',
    explanationStyle: 'Konseptual dengan contoh nyata',
    sourcePreference: 'Utamakan buku utama yang diunggah guru',
    imageStyle: 'Ilustrasi edukatif bersih',
    pptTheme: 'cobalt',
  });

  useEffect(() => {
    if (aiSettings) {
      setAiForm({
        model: aiSettings.model || 'gemini-4-hydrogen',
        language: aiSettings.language || 'Bahasa Indonesia Baku',
        tone: aiSettings.tone || 'Akademik, komunikatif, dan sesuai usia peserta didik',
        materialLength: aiSettings.materialLength || 'Sedang-Lengkap',
        detailLevel: aiSettings.detailLevel || 'Mendalam & Terstruktur',
        explanationStyle: aiSettings.explanationStyle || 'Konseptual dengan contoh nyata',
        sourcePreference: aiSettings.sourcePreference || 'Utamakan buku utama yang diunggah guru',
        imageStyle: aiSettings.imageStyle || 'Ilustrasi edukatif bersih',
        pptTheme: aiSettings.pptTheme || 'cobalt',
      });
    }
  }, [aiSettings]);

  const handleSaveAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    await setRecord(
      'ai_settings',
      user.uid,
      {
        ownerId: user.uid,
        ...aiForm,
        language: aiForm.language.slice(0, 80),
        tone: aiForm.tone.slice(0, 150),
      },
      !aiSettings
    );
    notify('Pengaturan gaya dan parameter AI disimpan.', 'success');
  };

  if (section === 'profil') {
    const classChoices = CLASS_OPTIONS_BY_LEVEL[(teacherForm.level as EducationLevel) || 'SMP/MTs'] || [];
    return (
      <form onSubmit={handleSaveProfile} className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Profil Guru</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Identitas pengajar dan tanda tangan digital yang tersemat pada lembar pengesahan dokumen.
            </p>
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold inline-flex items-center gap-2 shrink-0"
          >
            <Save className="w-4 h-4" />
            <span>Simpan Profil</span>
          </button>
        </div>

        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Nama Lengkap & Gelar</label>
            <input
              type="text"
              required
              value={teacherForm.displayName}
              onChange={(e) => setTeacherForm({ ...teacherForm, displayName: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">NIP / NUPTK</label>
            <input
              type="text"
              value={teacherForm.nip}
              onChange={(e) => setTeacherForm({ ...teacherForm, nip: e.target.value })}
              placeholder="Contoh: 19880412 201503 1 002"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Jabatan</label>
            <input
              type="text"
              value={teacherForm.jabatan}
              onChange={(e) => setTeacherForm({ ...teacherForm, jabatan: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Jenjang</label>
            <select
              value={teacherForm.level}
              onChange={(e) => {
                const lvl = e.target.value as EducationLevel;
                const first = CLASS_OPTIONS_BY_LEVEL[lvl]?.[0];
                setTeacherForm({
                  ...teacherForm,
                  level: lvl,
                  classesTaught: first?.grade || '',
                  phase: first?.phase || '',
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
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Kelas yang Diampu</label>
            <select
              value={teacherForm.classesTaught}
              onChange={(e) => {
                const chosen = classChoices.find((c) => c.grade === e.target.value);
                setTeacherForm({
                  ...teacherForm,
                  classesTaught: e.target.value,
                  phase: chosen?.phase || teacherForm.phase,
                });
              }}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            >
              {classChoices.map((c) => (
                <option key={c.grade} value={c.grade}>{c.grade} ({c.phase})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Fase</label>
            <input
              type="text"
              value={teacherForm.phase}
              onChange={(e) => setTeacherForm({ ...teacherForm, phase: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <OfficialSubjectField
              label="Mata Pelajaran Diampu (Permendikbud / KMA)"
              subject={teacherForm.subject}
              level={teacherForm.level}
              grade={teacherForm.classesTaught}
              schoolName={teacherForm.schoolName || activeSchool?.name}
              track={teacherTrack}
              compact
              onTrackChange={(nextTrack) => {
                setTeacherTrack(nextTrack);
                const nextSubj = pickAutoSubjectForContext({
                  currentSubject: teacherForm.subject,
                  level: teacherForm.level,
                  grade: teacherForm.classesTaught,
                  track: nextTrack,
                  schoolName: teacherForm.schoolName || activeSchool?.name,
                });
                setTeacherForm({ ...teacherForm, subject: nextSubj });
              }}
              onSubjectChange={(nextSubj) => setTeacherForm({ ...teacherForm, subject: nextSubj })}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Sekolah</label>
            <input
              type="text"
              value={teacherForm.schoolName}
              onChange={(e) => setTeacherForm({ ...teacherForm, schoolName: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
        </div>

        {/* Tanda tangan digital */}
        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">Tanda Tangan Digital Guru</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Gambar langsung pada papan di bawah atau unggah gambar PNG tanda tangan Anda sendiri.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
                <Upload className="w-3.5 h-3.5" />
                <span>Unggah PNG</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) =>
                    handleUploadImage(e.target.files?.[0], (url) =>
                      setTeacherForm((p) => ({ ...p, signatureDataUrl: url }))
                    )
                  }
                />
              </label>
              <button
                type="button"
                onClick={clearCanvas}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>Bersihkan</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <canvas
              ref={canvasRef}
              width={360}
              height={130}
              onPointerDown={startDraw}
              onPointerMove={moveDraw}
              onPointerUp={endDraw}
              onPointerLeave={endDraw}
              className="w-full max-w-[360px] h-[130px] rounded-lg border border-dashed border-slate-300 bg-white touch-none cursor-crosshair"
            />
            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Pratinjau Tanda Tangan Tersimpan</p>
              {teacherForm.signatureDataUrl ? (
                <img
                  src={teacherForm.signatureDataUrl}
                  alt="Tanda tangan guru"
                  className="max-h-20 mx-auto object-contain bg-white p-1 rounded"
                />
              ) : (
                <p className="text-xs text-slate-400 py-5">Belum ada tanda tangan diunggah</p>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 space-y-3">
          <h2 className="text-sm font-bold text-red-900 dark:text-red-200">Reset Semua Data Administrasi</h2>
          <p className="text-xs text-red-700 dark:text-red-300">
            Menghapus seluruh ruang kerja (workspaces), dokumen, perangkat pembelajaran, prosem, kelas, siswa, kuis, nilai, dan jurnal. Profil guru dan identitas sekolah Anda akan tetap dipertahankan dan aman.
          </p>
          <button
            type="button"
            disabled={resetting}
            onClick={openResetModal}
            className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-2"
          >
            {resetting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{resetting ? 'Sedang Mereset Data...' : 'Reset Semua Data (Kecuali Profil & Sekolah)'}</span>
          </button>
        </div>
      </form>
    );
  }

  if (section === 'sekolah') {
    return (
      <form onSubmit={handleSaveSchool} className="space-y-6 max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Identitas Sekolah</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Data kop surat, kepala sekolah, tahun ajaran, dan logo sekolah yang otomatis tampil pada seluruh ekspor dokumen.
            </p>
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold inline-flex items-center gap-2 shrink-0"
          >
            <Save className="w-4 h-4" />
            <span>Simpan Identitas</span>
          </button>
        </div>

        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Nama Sekolah</label>
            <input
              type="text"
              required
              value={schoolForm.name}
              onChange={(e) => setSchoolForm({ ...schoolForm, name: e.target.value })}
              placeholder="Contoh: SMP Negeri 1 Bandung"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">NPSN</label>
            <input
              type="text"
              value={schoolForm.npsn}
              onChange={(e) => setSchoolForm({ ...schoolForm, npsn: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Jenjang Pendidikan</label>
            <select
              value={schoolForm.level}
              onChange={(e) => setSchoolForm({ ...schoolForm, level: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            >
              {EDUCATION_LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Status Sekolah</label>
            <select
              value={schoolForm.status}
              onChange={(e) => setSchoolForm({ ...schoolForm, status: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            >
              <option value="Negeri">Negeri</option>
              <option value="Swasta">Swasta</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Tahun Ajaran Aktif</label>
            <input
              type="text"
              value={schoolForm.academicYear}
              onChange={(e) => setSchoolForm({ ...schoolForm, academicYear: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Semester Aktif</label>
            <select
              value={schoolForm.semester}
              onChange={(e) => setSchoolForm({ ...schoolForm, semester: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            >
              <option value="Semester 1">Semester 1 (Ganjil)</option>
              <option value="Semester 2">Semester 2 (Genap)</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Alamat Jalan</label>
            <input
              type="text"
              value={schoolForm.address}
              onChange={(e) => setSchoolForm({ ...schoolForm, address: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Desa / Kelurahan</label>
            <input
              type="text"
              value={schoolForm.village}
              onChange={(e) => setSchoolForm({ ...schoolForm, village: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Kecamatan</label>
            <input
              type="text"
              value={schoolForm.district}
              onChange={(e) => setSchoolForm({ ...schoolForm, district: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Kabupaten / Kota</label>
            <input
              type="text"
              value={schoolForm.regency}
              onChange={(e) => setSchoolForm({ ...schoolForm, regency: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Provinsi</label>
            <input
              type="text"
              value={schoolForm.province}
              onChange={(e) => setSchoolForm({ ...schoolForm, province: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Nama Kepala Sekolah</label>
            <input
              type="text"
              value={schoolForm.principalName}
              onChange={(e) => setSchoolForm({ ...schoolForm, principalName: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">NIP Kepala Sekolah</label>
            <input
              type="text"
              value={schoolForm.principalNip}
              onChange={(e) => setSchoolForm({ ...schoolForm, principalNip: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Nama Guru Mapel</label>
            <input
              type="text"
              value={schoolForm.teacherName}
              onChange={(e) => setSchoolForm({ ...schoolForm, teacherName: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">NIP Guru</label>
            <input
              type="text"
              value={schoolForm.teacherNip}
              onChange={(e) => setSchoolForm({ ...schoolForm, teacherNip: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <OfficialSubjectField
              label="Mata Pelajaran Utama"
              subject={schoolForm.subject}
              level={schoolForm.level}
              schoolName={schoolForm.name}
              track={schoolTrack}
              compact
              onTrackChange={(nextTrack) => {
                setSchoolTrack(nextTrack);
                const nextSubj = pickAutoSubjectForContext({
                  currentSubject: schoolForm.subject,
                  level: schoolForm.level,
                  track: nextTrack,
                  schoolName: schoolForm.name,
                });
                setSchoolForm({ ...schoolForm, subject: nextSubj });
              }}
              onSubjectChange={(nextSubj) => setSchoolForm({ ...schoolForm, subject: nextSubj })}
            />
          </div>
          <div className="md:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Titi Mangsa Dokumen (Kota & Tanggal Tanda Tangan)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSchoolForm({ ...schoolForm, titiMangsa: '' })}
                  className="text-[11px] font-medium text-blue-700 dark:text-sky-400 hover:underline"
                >
                  Pakai Titik-Titik
                </button>
                <span className="text-slate-300">·</span>
                <button
                  type="button"
                  onClick={() =>
                    setSchoolForm({
                      ...schoolForm,
                      titiMangsa: `${schoolForm.regency.trim() || '......................'}, ${formatDocDateId()}`.slice(0, 120),
                    })
                  }
                  className="text-[11px] font-medium text-blue-700 dark:text-sky-400 hover:underline"
                >
                  Isi Tanggal Hari Ini
                </button>
              </div>
            </div>
            <input
              type="text"
              maxLength={120}
              value={schoolForm.titiMangsa}
              onChange={(e) => setSchoolForm({ ...schoolForm, titiMangsa: e.target.value })}
              placeholder={`${schoolForm.regency.trim() || '......................'}, .......................... 20....`}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Kosongkan untuk menampilkan titik-titik otomatis di semua dokumen, atau ketik kota & tanggal sesuai kebutuhan (juga bisa diklik langsung di lembar dokumen).
            </p>
          </div>
        </div>

        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
          {/* Upload Kop Surat Resmi Sekolah */}
          <div className="pb-6 border-b border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Kop Surat Resmi Sekolah (Tampil di Setiap Dokumen)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Unggah gambar Kop Surat sekolah/madrasah (PNG/JPG, disarankan rasio lebar seperti 1200×250 px). Otomatis tampil di bagian atas pratinjau A4, cetak, PDF, dan Word (DOCX).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-900 text-white hover:bg-blue-800 text-xs font-semibold">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{schoolForm.letterheadDataUrl ? 'Ganti Kop Surat' : 'Upload Kop Surat'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      handleUploadImage(
                        file,
                        async (url) => {
                          setSchoolForm((prev) => ({ ...prev, letterheadDataUrl: url }));
                          if (activeSchool?.id) {
                            await updateRecord('schools', activeSchool.id, { letterheadDataUrl: url });
                            notify('Kop surat berhasil diunggah dan langsung diterapkan ke semua dokumen.', 'success');
                          } else {
                            notify('Kop surat siap. Klik Simpan Identitas Sekolah untuk menerapkannya.', 'info');
                          }
                        },
                        1400
                      );
                    }}
                  />
                </label>
                {schoolForm.letterheadDataUrl && (
                  <button
                    type="button"
                    onClick={async () => {
                      setSchoolForm((prev) => ({ ...prev, letterheadDataUrl: '' }));
                      if (activeSchool?.id) {
                        await updateRecord('schools', activeSchool.id, { letterheadDataUrl: '' });
                        notify('Kop surat dihapus. Dokumen kembali menggunakan kop teks standar.', 'info');
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus</span>
                  </button>
                )}
              </div>
            </div>

            {schoolForm.letterheadDataUrl ? (
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-[11px] font-medium text-slate-400 mb-2">Pratinjau Kop Surat pada Kertas A4:</p>
                <img
                  src={schoolForm.letterheadDataUrl}
                  alt="Pratinjau Kop Surat Sekolah"
                  className="w-full max-h-36 object-contain mx-auto"
                />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-5 text-center text-xs text-slate-500 dark:text-slate-400">
                Belum ada gambar kop surat yang diunggah. Jika kosong, dokumen menampilkan kop teks resmi nama dan alamat sekolah secara otomatis.
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Logo Sekolah</p>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    handleUploadImage(
                      e.target.files?.[0],
                      (url) => setSchoolForm((prev) => ({ ...prev, logoDataUrl: url })),
                      420
                    )
                  }
                  className="text-xs"
                />
                {schoolForm.logoDataUrl && (
                  <button
                    type="button"
                    onClick={() => setSchoolForm((prev) => ({ ...prev, logoDataUrl: '' }))}
                    className="text-xs text-rose-600 hover:underline font-medium"
                  >
                    Hapus Logo
                  </button>
                )}
              </div>
              {schoolForm.logoDataUrl && (
                <img src={schoolForm.logoDataUrl} alt="Logo Sekolah" className="h-16 object-contain rounded border p-1 bg-white" />
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Logo Instansi / Pemda</p>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    handleUploadImage(
                      e.target.files?.[0],
                      (url) => setSchoolForm((prev) => ({ ...prev, agencyLogoDataUrl: url })),
                      420
                    )
                  }
                  className="text-xs"
                />
                {schoolForm.agencyLogoDataUrl && (
                  <button
                    type="button"
                    onClick={() => setSchoolForm((prev) => ({ ...prev, agencyLogoDataUrl: '' }))}
                    className="text-xs text-rose-600 hover:underline font-medium"
                  >
                    Hapus Logo
                  </button>
                )}
              </div>
              {schoolForm.agencyLogoDataUrl && (
                <img src={schoolForm.agencyLogoDataUrl} alt="Logo Instansi" className="h-16 object-contain rounded border p-1 bg-white" />
              )}
            </div>
          </div>
        </div>
      </form>
    );
  }

  if (section === 'kurikulum') {
    return (
      <div className="space-y-6 max-w-5xl">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Pengaturan Kurikulum</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Kelola struktur kurikulum aktif agar generator menyesuaikan format dokumen tanpa mencampur istilah antar kurikulum.
          </p>
        </div>

        {curricula.length === 0 && (
          <div className="p-5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-amber-900 dark:text-amber-200">
              Belum ada daftar kurikulum tersimpan. Anda dapat memuat ulang kurikulum standar atau menambahkan kurikulum sendiri di bawah.
            </p>
            <button
              type="button"
              onClick={async () => {
                if (!user) return;
                for (const c of DEFAULT_CURRICULA) {
                  await createRecord('curricula', {
                    ownerId: user.uid,
                    name: c.name,
                    code: c.code,
                    description: c.description,
                    structureComponents: c.structureComponents,
                    isActive: c.code === 'KM',
                  });
                }
                notify('Kurikulum standar berhasil dimuat.', 'success');
              }}
              className="px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold shrink-0"
            >
              Muat Kurikulum Bawaan
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {curricula.map((c) => (
            <div
              key={c.id}
              className={`p-5 rounded-xl bg-white dark:bg-slate-900 border ${
                c.isActive ? 'border-blue-600 dark:border-sky-500' : 'border-slate-200 dark:border-slate-800'
              } space-y-3`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-slate-500 dark:text-slate-400">{c.code}</p>
                  <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">{c.name}</h3>
                </div>
                <button
                  onClick={async () => {
                    for (const item of curricula) {
                      if (item.id) await updateRecord('curricula', item.id, { isActive: item.id === c.id });
                    }
                    notify(`Kurikulum aktif diubah ke ${c.name}.`, 'success');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    c.isActive
                      ? 'bg-blue-700 text-white'
                      : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {c.isActive ? 'Aktif' : 'Pilih Aktif'}
                </button>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">{c.description}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Komponen: {(c.structureComponents || []).join(' · ')}
              </p>
            </div>
          ))}
        </div>

        <form
          onSubmit={handleAddCurriculum}
          className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
        >
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Tambah Kurikulum Khusus
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              required
              placeholder="Nama Kurikulum (mis. Kurikulum Pesantren)"
              value={newCurr.name}
              onChange={(e) => setNewCurr({ ...newCurr, name: e.target.value })}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
            <input
              type="text"
              required
              placeholder="Kode (mis. KP-2026)"
              value={newCurr.code}
              onChange={(e) => setNewCurr({ ...newCurr, code: e.target.value })}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
            <input
              type="text"
              placeholder="Komponen (pisahkan dengan koma)"
              value={newCurr.components}
              onChange={(e) => setNewCurr({ ...newCurr, components: e.target.value })}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
          <textarea
            rows={2}
            placeholder="Deskripsi singkat struktur dokumen kurikulum..."
            value={newCurr.description}
            onChange={(e) => setNewCurr({ ...newCurr, description: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Kurikulum</span>
          </button>
        </form>
      </div>
    );
  }

  if (section === 'kalender') {
    return (
      <div className="space-y-6 max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              Kalender Pendidikan & Minggu Efektif
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Menjadi acuan otomatis pembagian alokasi JP pada PROTA dan PROSEM.
            </p>
          </div>
          <button
            onClick={handleSaveCalendar}
            className="px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold inline-flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>Simpan Kalender</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">Total Minggu Satu Tahun</p>
            <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {totalWeeks} Minggu
            </p>
          </div>
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">Minggu Tidak Efektif</p>
            <p className="font-mono tabular-nums text-2xl font-bold text-amber-700 dark:text-amber-400 mt-1">
              {nonEffectiveWeeks} Minggu
            </p>
          </div>
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">Minggu Efektif Belajar</p>
            <p className="font-mono tabular-nums text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">
              {effectiveWeeks} Minggu
            </p>
          </div>
        </div>

        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500 dark:text-slate-400">
                <th className="py-2 pr-4">Bulan</th>
                <th className="py-2 px-3">Total Minggu</th>
                <th className="py-2 px-3">Tidak Efektif</th>
                <th className="py-2 px-3">Efektif</th>
                <th className="py-2 pl-3">Keterangan Kegiatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {monthly.map((row, idx) => (
                <tr key={row.month}>
                  <td className="py-2 pr-4 font-medium">{row.month}</td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      min={0}
                      max={6}
                      value={row.totalWeeks}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setMonthly((prev) =>
                          prev.map((m, i) =>
                            i === idx ? { ...m, totalWeeks: val, effectiveWeeks: Math.max(0, val - m.nonEffectiveWeeks) } : m
                          )
                        );
                      }}
                      className="w-16 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono tabular-nums"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      min={0}
                      max={6}
                      value={row.nonEffectiveWeeks}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setMonthly((prev) =>
                          prev.map((m, i) =>
                            i === idx ? { ...m, nonEffectiveWeeks: val, effectiveWeeks: Math.max(0, m.totalWeeks - val) } : m
                          )
                        );
                      }}
                      className="w-16 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono tabular-nums"
                    />
                  </td>
                  <td className="py-2 px-3 font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                    {row.effectiveWeeks}
                  </td>
                  <td className="py-2 pl-3">
                    <input
                      type="text"
                      value={row.notes || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMonthly((prev) => prev.map((m, i) => (i === idx ? { ...m, notes: val } : m)));
                      }}
                      className="w-full px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Daftar Hari Libur & Agenda Khusus Sekolah
          </h2>
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              value={newHoliday.date}
              onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
            <input
              type="text"
              placeholder="Nama hari libur / agenda sekolah"
              value={newHoliday.title}
              onChange={(e) => setNewHoliday({ ...newHoliday, title: e.target.value })}
              className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
            <select
              value={newHoliday.type}
              onChange={(e) => setNewHoliday({ ...newHoliday, type: e.target.value as any })}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            >
              <option value="nasional">Libur Nasional</option>
              <option value="semester">Libur Semester</option>
              <option value="sekolah">Kegiatan Sekolah</option>
            </select>
            <button
              type="button"
              onClick={() => {
                if (!newHoliday.date || !newHoliday.title) return;
                setHolidays([...holidays, newHoliday]);
                setNewHoliday({ date: '', title: '', type: 'nasional' });
              }}
              className="px-3 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold"
            >
              Tambah
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {holidays.map((h, i) => (
              <div key={`${h.date}-${i}`} className="py-2 flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono tabular-nums text-slate-500 mr-3">{h.date}</span>
                  <span className="font-medium text-slate-800 dark:text-slate-100">{h.title}</span>
                  <span className="text-slate-400 ml-2">· {h.type}</span>
                </div>
                <button
                  onClick={() => setHolidays(holidays.filter((_, idx) => idx !== i))}
                  className="text-red-600 hover:underline inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Pengaturan AI
  return (
    <form onSubmit={handleSaveAi} className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Pengaturan AI</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Sesuaikan gaya bahasa, kedalaman materi, dan preferensi penyusunan dokumen. Kunci API dikelola aman di server.
          </p>
        </div>
        <button
          type="submit"
          className="px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold inline-flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          <span>Simpan Pengaturan AI</span>
        </button>
      </div>

      <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Model AI</label>
          <select
            value={aiForm.model}
            onChange={(e) => setAiForm({ ...aiForm, model: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
          >
            <option value="gemini-4-hydrogen">Gemini 4 Hydrogen (Cepat & Akurat)</option>
            <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (Ringan)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Bahasa Keluaran</label>
          <input
            type="text"
            maxLength={80}
            value={aiForm.language}
            onChange={(e) => setAiForm({ ...aiForm, language: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Gaya Bahasa</label>
          <input
            type="text"
            maxLength={150}
            value={aiForm.tone}
            onChange={(e) => setAiForm({ ...aiForm, tone: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Panjang & Detail Materi</label>
          <select
            value={aiForm.materialLength}
            onChange={(e) => setAiForm({ ...aiForm, materialLength: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
          >
            <option value="Ringkas">Ringkas & Padat</option>
            <option value="Sedang-Lengkap">Sedang - Lengkap</option>
            <option value="Sangat Mendalam">Sangat Mendalam & Komprehensif</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Preferensi Sumber Referensi</label>
          <select
            value={aiForm.sourcePreference}
            onChange={(e) => setAiForm({ ...aiForm, sourcePreference: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
          >
            <option value="Utamakan buku utama yang diunggah guru">Utamakan Buku Utama Guru</option>
            <option value="Gabungkan buku utama dan buku pendamping">Gabungkan Utama & Pendamping</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Tema Default PowerPoint</label>
          <select
            value={aiForm.pptTheme}
            onChange={(e) => setAiForm({ ...aiForm, pptTheme: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
          >
            <option value="cobalt">Biru Akademik (Cobalt)</option>
            <option value="emerald">Hijau Sains (Emerald)</option>
            <option value="indigo">Indigo Literasi</option>
            <option value="slate_dark">Gelap Modern (Slate)</option>
          </select>
        </div>
      </div>
    </form>
  );
};
