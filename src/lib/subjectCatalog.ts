import {
  InstitutionTrack,
  OfficialJpStandard,
  detectGradeNumber,
  detectInstitutionTrack,
  detectNormalizedLevel,
  getOfficialJpStandard,
  isKmaReligiousSubject,
  normalizeCurriculumKind,
} from './jpStandards';

export interface OfficialSubjectEntry {
  name: string;
  category:
    | 'Rumpun PAI & Bahasa Arab (KMA)'
    | 'Wajib / Umum'
    | 'IPA / IPS / IPAS'
    | 'Pilihan / Tingkat Lanjut (Fase F)'
    | 'Peminatan Keagamaan (MA)'
    | 'Kejuruan (SMK/MAK)'
    | 'Program Khusus (SLB)'
    | 'Muatan Lokal';
  track: 'umum' | 'madrasah' | 'keduanya';
  regulation: string;
  scopeSummary: string;
}

export interface SubjectRegulationContext {
  track: InstitutionTrack;
  regulationTitle: string;
  curriculumKind: 'KM' | 'K13';
  subjectName: string;
  category: string;
  scopeSummary: string;
  isOfficialMatch: boolean;
  jpStandard: OfficialJpStandard;
}

const REG_PERMENDIKBUD_KM = 'Permendikbudristek No. 12 Tahun 2024 (Kurikulum Merdeka)';
const REG_PERMENDIKBUD_K13 = 'Permendikbud No. 35/36/37 Tahun 2018 (K-13)';
const REG_KMA_KM = 'KMA No. 450 Tahun 2024 (KM Madrasah)';
const REG_KMA_K13 = 'KMA No. 183/184 Tahun 2019 (K-13 Madrasah)';

export function getOfficialSubjectsForContext(params: {
  level?: string;
  grade?: string;
  curriculum?: string;
  track?: InstitutionTrack;
  schoolName?: string;
}): OfficialSubjectEntry[] {
  const levelKind = detectNormalizedLevel(params.level, params.grade);
  const g = detectGradeNumber(params.grade);
  const currKind = normalizeCurriculumKind(params.curriculum);
  const track = detectInstitutionTrack({
    schoolName: params.schoolName,
    level: params.level,
    grade: params.grade,
    preferredTrack: params.track,
  });

  const regUmum = currKind === 'K13' ? REG_PERMENDIKBUD_K13 : REG_PERMENDIKBUD_KM;
  const regKma = currKind === 'K13' ? REG_KMA_K13 : REG_KMA_KM;

  const list: OfficialSubjectEntry[] = [];

  // 1. PAUD / TK / RA
  if (levelKind === 'PAUD') {
    if (track === 'madrasah') {
      list.push(
        {
          name: 'Nilai Agama dan Budi Pekerti (RA)',
          category: 'Rumpun PAI & Bahasa Arab (KMA)',
          track: 'madrasah',
          regulation: currKind === 'K13' ? 'KMA No. 792 Tahun 2018 (RA)' : 'KMA No. 450 Tahun 2024 (RA)',
          scopeSummary: 'Pengenalan keimanan, akhlak mulia, doa harian, praktik ibadah dasar, dan pembiasaan islami anak usia dini RA.',
        },
        {
          name: 'PAI dan Bahasa Arab Dasar RA',
          category: 'Rumpun PAI & Bahasa Arab (KMA)',
          track: 'madrasah',
          regulation: currKind === 'K13' ? 'KMA No. 792 Tahun 2018 (RA)' : 'KMA No. 450 Tahun 2024 (RA)',
          scopeSummary: 'Pengenalan huruf hijaiyah, kosakata Arab sederhana, surah pendek, hadis pendek, dan kisah teladan nabi untuk anak RA.',
        }
      );
    } else {
      list.push({
        name: 'Nilai Agama dan Budi Pekerti',
        category: 'Wajib / Umum',
        track: 'umum',
        regulation: regUmum,
        scopeSummary: 'Mengenal Tuhan YME, mempraktikkan ibadah sederhana, akhlak terpuji, menyayangi sesama, dan menjaga kelestarian alam.',
      });
    }
    list.push(
      {
        name: 'Jati Diri',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: track === 'madrasah' ? 'KMA No. 450 Tahun 2024 (RA)' : regUmum,
        scopeSummary: 'Pengenalan emosi, kemandirian, perilaku prososial, identitas diri & budaya, serta keterampilan motorik kasar/halus.',
      },
      {
        name: 'Dasar-Dasar Literasi, Matematika, Sains, Teknologi, Rekayasa, dan Seni',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: track === 'madrasah' ? 'KMA No. 450 Tahun 2024 (RA)' : regUmum,
        scopeSummary: 'Kemampuan menyimak, pra-membaca, pra-menulis, konsep bilangan/pola awal, eksplorasi alam/STEAM, dan ekspresi seni anak usia dini.',
      }
    );
    return list;
  }

  // Helper to append KMA PAI & Bahasa Arab core
  const pushKmaCore = (gradeNum: number, stageLabel: 'MI' | 'MTs' | 'MA/MAK') => {
    list.push(
      {
        name: "Al-Qur'an Hadis",
        category: 'Rumpun PAI & Bahasa Arab (KMA)',
        track: 'madrasah',
        regulation: regKma,
        scopeSummary:
          stageLabel === 'MI'
            ? "Ilmu Tajwid dasar, hafalan & pemahaman surah pendek Juz 'Amma, serta hadis tentang keutamaan belajar, berbakti kepada orang tua, dan akhlak terpuji."
            : stageLabel === 'MTs'
            ? "Hukum bacaan Tajwid (Mad, Qalqalah, Waqaf), kajian ayat Al-Qur'an & hadis tematik tentang iman, toleransi, amanah, dan kepedulian sosial."
            : "Sejarah & kedudukan Al-Qur'an dan Hadis, ilmu tafsir/hadis dasar, serta kajian ayat & hadis tentang manusia, demokrasi, iptek, dan moderasi beragama.",
      },
      {
        name: 'Akidah Akhlak',
        category: 'Rumpun PAI & Bahasa Arab (KMA)',
        track: 'madrasah',
        regulation: regKma,
        scopeSummary:
          stageLabel === 'MI'
            ? 'Rukun Iman, Asmaul Husna, kalimat thayyibah, akhlak terpuji, adab sehari-hari, serta menghindari akhlak tercela dan kisah keteladanan.'
            : stageLabel === 'MTs'
            ? "Penguatan akidah Islam, mukjizat/karamah, akhlak terpuji kepada Allah, diri sendiri, dan sesama, adab bermedia & pergaulan, serta keteladanan sahabat."
            : 'Ilmu kalam/akidah Ahlussunnah wal Jamaah, tasawuf dan penyucian jiwa, etika profesi & sosial, serta menghindari perilaku menyimpang remaja.',
      },
      {
        name: 'Fikih',
        category: 'Rumpun PAI & Bahasa Arab (KMA)',
        track: 'madrasah',
        regulation: regKma,
        scopeSummary:
          stageLabel === 'MI'
            ? 'Thaharah (wudhu/tayamum), salat fardu & sunnah, puasa Ramadan, zakat fitrah, serta makanan/minuman halal dan haram.'
            : stageLabel === 'MTs'
            ? 'Fikih ibadah lengkap (salat jamak/qashar, zakat, puasa, haji/umrah, kurban & akikah) serta pengantar muamalah (jual beli, riba, pinjam-meminjam).'
            : 'Fikih jinayah, munakahat (hukum keluarga), mawaris (waris), muamalah kontemporer, siyasah syar’iyyah, serta kaidah dasar ushul fikih.',
      }
    );

    if (stageLabel !== 'MI' || gradeNum === 0 || gradeNum >= 3) {
      list.push({
        name: 'Sejarah Kebudayaan Islam (SKI)',
        category: 'Rumpun PAI & Bahasa Arab (KMA)',
        track: 'madrasah',
        regulation: regKma,
        scopeSummary:
          stageLabel === 'MI'
            ? 'Keteladanan Nabi Muhammad saw. (periode Makkah & Madinah), Khulafaurasyidin, dan dakwah Walisongo di Nusantara.'
            : stageLabel === 'MTs'
            ? 'Peradaban Islam masa Dinasti Umayyah, Abbasiyah, Ayyubiyah, serta perkembangan kerajaan Islam dan ulama di Nusantara.'
            : 'Sejarah peradaban Islam klasik, pertengahan, modern, pembaruan pemikiran Islam dunia, serta dakwah Islam di Asia Tenggara dan global.',
      });
    }

    list.push({
      name: 'Bahasa Arab',
      category: 'Rumpun PAI & Bahasa Arab (KMA)',
      track: 'madrasah',
      regulation: regKma,
      scopeSummary:
        stageLabel === 'MI'
          ? 'Keterampilan menyimak (istima’), berbicara (kalam), membaca (qira’ah), dan menulis (kitabah) mufrodat & hiwar sederhana tema lingkungan madrasah/keluarga.'
          : stageLabel === 'MTs'
          ? 'Komunikasi Bahasa Arab fungsional (istima’, kalam, qira’ah, kitabah) dengan tarkib/kaidah dasar (isim, fi’il, jumlah ismiyah/fi’liyah, mubtada-khabar).'
          : 'Penguasaan wacana lisan & tulis Bahasa Arab tingkat menengah-lanjut, struktur nahwu & sharaf fungsional, serta penulisan teks deskriptif, naratif, dan eksposisi Arab.',
    });
  };

  // 2. SD / MI
  if (levelKind === 'SD') {
    const gradeNum = g || 4;
    if (track === 'madrasah') {
      pushKmaCore(gradeNum, 'MI');
    } else {
      list.push(
        {
          name: 'Pendidikan Agama Islam dan Budi Pekerti',
          category: 'Wajib / Umum',
          track: 'umum',
          regulation: regUmum,
          scopeSummary: "Lima elemen CP PAI SD: Al-Qur'an Hadis, Akidah, Akhlak, Fikih, dan Sejarah Peradaban Islam terpadu.",
        },
        {
          name: 'Pendidikan Agama Kristen dan Budi Pekerti',
          category: 'Wajib / Umum',
          track: 'umum',
          regulation: regUmum,
          scopeSummary: 'Nilai iman Kristen, Allah berkarya, gereja & masyarakat, serta alam dan lingkungan hidup untuk jenjang SD.',
        },
        {
          name: 'Pendidikan Agama Katolik dan Budi Pekerti',
          category: 'Wajib / Umum',
          track: 'umum',
          regulation: regUmum,
          scopeSummary: 'Pribadi peserta didik, Yesus Kristus, Gereja, dan hidup bermasyarakat sesuai ajaran Katolik untuk SD.',
        },
        {
          name: 'Pendidikan Agama Hindu dan Budi Pekerti',
          category: 'Wajib / Umum',
          track: 'umum',
          regulation: regUmum,
          scopeSummary: 'Kitab Suci Weda, Sraddha & Bhakti, Susila, Acara, dan Sejarah Agama Hindu jenjang SD.',
        },
        {
          name: 'Pendidikan Agama Buddha dan Budi Pekerti',
          category: 'Wajib / Umum',
          track: 'umum',
          regulation: regUmum,
          scopeSummary: 'Sejarah Buddha, Dharma, Sila, Samadhi, dan nilai kebajikan Buddhis jenjang SD.',
        }
      );
    }

    list.push(
      {
        name: currKind === 'K13' ? 'PPKn' : 'Pendidikan Pancasila',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Elemen Pancasila, UUD NRI 1945, Bhinneka Tunggal Ika, dan NKRI kontekstual lingkungan keluarga, sekolah, dan masyarakat.',
      },
      {
        name: 'Bahasa Indonesia',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Elemen Menyimak, Membaca dan Memirsa, Berbicara dan Mempresentasikan, serta Menulis teks fiksi maupun informasional anak.',
      },
      {
        name: 'Matematika',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Bilangan cacah/pecahan, Aljabar pola bilangan, Pengukuran panjang/berat/waktu/luas/volume, Geometri bangun datar/ruang, serta Analisis Data dan Peluang.',
      }
    );

    if (currKind === 'K13') {
      if (gradeNum >= 4) {
        list.push(
          {
            name: 'Ilmu Pengetahuan Alam (IPA)',
            category: 'IPA / IPS / IPAS',
            track: 'keduanya',
            regulation: regUmum,
            scopeSummary: 'Struktur & fungsi makhluk hidup, gaya & energi, daur hidup, sifat wujud benda, serta tata surya (K-13 SD/MI Kelas IV–VI).',
          },
          {
            name: 'Ilmu Pengetahuan Sosial (IPS)',
            category: 'IPA / IPS / IPAS',
            track: 'keduanya',
            regulation: regUmum,
            scopeSummary: 'Keragaman budaya, kegiatan ekonomi masyarakat, kenampakan alam Indonesia, dan sejarah perjuangan bangsa (K-13 SD/MI Kelas IV–VI).',
          }
        );
      }
    } else if (gradeNum === 0 || gradeNum >= 3) {
      list.push({
        name: 'Ilmu Pengetahuan Alam dan Sosial (IPAS)',
        category: 'IPA / IPS / IPAS',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Pemahaman IPAS terpadu (makhluk hidup & ekosistem, energi, zat & perubahannya, bumi, peta wilayah, keragaman budaya, ekonomi & sejarah lokal) dan Keterampilan Proses.',
      });
    }

    list.push(
      {
        name: 'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Terampil bergerak (gerak dasar lokomotor/non-lokomotor/manipulatif, permainan, kebugaran), belajar melalui gerak, bergaya hidup aktif, dan pola hidup sehat.',
      },
      {
        name: currKind === 'K13' ? 'Seni Budaya dan Prakarya (SBdP)' : 'Seni dan Budaya',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Seni Rupa, Seni Musik, Seni Tari, atau Seni Teater (mengalami, merefleksikan, berpikir artistik, menciptakan, dan berdampak).',
      },
      {
        name: 'Bahasa Inggris',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Menyimak–Berbicara, Membaca–Memirsa, dan Menulis–Mempresentasikan ungkapan bahasa Inggris sederhana sehari-hari (wajib mulai Kelas III sesuai Permendikbudristek 12/2024).',
      }
    );

    if (currKind === 'KM' && (gradeNum === 0 || gradeNum >= 5)) {
      list.push({
        name: 'Koding dan Kecerdasan Artifisial',
        category: 'Pilihan / Tingkat Lanjut (Fase F)',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Berpikir komputasional dasar, algoritma sederhana, pemrograman blok visual, etika digital, dan pengenalan konsep kecerdasan artifisial untuk Kelas V–VI.',
      });
    }

    list.push({
      name: 'Muatan Lokal',
      category: 'Muatan Lokal',
      track: 'keduanya',
      regulation: regUmum,
      scopeSummary: 'Bahasa daerah, seni budaya lokal, BTQ/tahfiz (bila diprogramkan sekolah/madrasah), atau keterampilan khas daerah setempat.',
    });
    return list;
  }

  // 3. SMP / MTs
  if (levelKind === 'SMP') {
    if (track === 'madrasah') {
      pushKmaCore(g || 7, 'MTs');
    } else {
      list.push(
        {
          name: 'Pendidikan Agama Islam dan Budi Pekerti',
          category: 'Wajib / Umum',
          track: 'umum',
          regulation: regUmum,
          scopeSummary: "Lima elemen CP PAI SMP: Al-Qur'an Hadis, Akidah, Akhlak, Fikih ibadah/muamalah, dan Sejarah Peradaban Islam.",
        },
        {
          name: 'Pendidikan Agama Kristen dan Budi Pekerti',
          category: 'Wajib / Umum',
          track: 'umum',
          regulation: regUmum,
          scopeSummary: 'Allah Pemelihara, Yesus Juruselamat, gereja & masyarakat majemuk, serta etika Kristen remaja SMP.',
        },
        {
          name: 'Pendidikan Agama Katolik dan Budi Pekerti',
          category: 'Wajib / Umum',
          track: 'umum',
          regulation: regUmum,
          scopeSummary: 'Panggilan pribadi remaja Katolik, Yesus mewartakan Kerajaan Allah, Gereja, dan keterlibatan sosial.',
        }
      );
    }

    list.push(
      {
        name: currKind === 'K13' ? 'PPKn' : 'Pendidikan Pancasila',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Pancasila sebagai dasar negara & pandangan hidup, norma dan UUD NRI 1945, keberagaman Bhinneka Tunggal Ika, serta wilayah dan wawasan NKRI.',
      },
      {
        name: 'Bahasa Indonesia',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Teks deskripsi, narasi/fantasi, prosedur, laporan observasi, berita, iklan/poster, persuasi, pidato, tanggapan, diskusi, dan sastra SMP.',
      },
      {
        name: 'Matematika',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Bilangan bulat/rasional/berpangkat, Aljabar (SPLDV, fungsi linear), Pengukuran (bangun ruang sisi datar/lengkung), Geometri (Pythagoras, kesebangunan), dan Statistika/Peluang.',
      },
      {
        name: 'Ilmu Pengetahuan Alam (IPA)',
        category: 'IPA / IPS / IPAS',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Pengukuran & metode ilmiah, zat & kalor, gerak & gaya, klasifikasi makhluk hidup, ekosistem, sistem organ manusia, listrik-magnet, getaran/gelombang, dan pewarisan sifat.',
      },
      {
        name: 'Ilmu Pengetahuan Sosial (IPS)',
        category: 'IPA / IPS / IPAS',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Interaksi keruangan & konektivitas wilayah, perubahan sosial budaya, kegiatan ekonomi & perdagangan, sejarah Nusantara hingga kemerdekaan, dan pemberdayaan masyarakat.',
      },
      {
        name: 'Bahasa Inggris',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Komunikasi lisan & tulis jenis teks descriptive, recount, procedure, narrative, dan report tingkat SMP (Fase D).',
      },
      {
        name: 'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Permainan bola besar/kecil, atletik, bela diri, senam lantai, aktivitas gerak berirama, kebugaran jasmani, dan kesehatan remaja.',
      },
      {
        name: 'Informatika',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Berpikir komputasional, TIK & aplikasi perkantoran, sistem komputer, jaringan komputer & internet, analisis data, algoritma pemrograman visual/teks, dan dampak sosial informatika.',
      },
      {
        name: 'Seni, Budaya, dan Prakarya',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Pilihan satuan pendidikan: Seni Musik, Seni Rupa, Seni Tari, Seni Teater, atau Prakarya (Kerajinan, Rekayasa, Budidaya, Pengolahan).',
      },
      {
        name: 'Muatan Lokal',
        category: 'Muatan Lokal',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Bahasa daerah, seni tradisi, atau muatan khas satuan pendidikan/madrasah.',
      }
    );
    return list;
  }

  // 4. SMK / MAK
  if (levelKind === 'SMK') {
    const gradeNum = g || 10;
    if (track === 'madrasah') {
      pushKmaCore(gradeNum, 'MA/MAK');
    } else {
      list.push({
        name: 'Pendidikan Agama dan Budi Pekerti',
        category: 'Wajib / Umum',
        track: 'umum',
        regulation: regUmum,
        scopeSummary: 'Etika kerja, keimanan, ibadah, akhlak bermasyarakat, dan toleransi sesuai agama peserta didik SMK.',
      });
    }

    list.push(
      {
        name: currKind === 'K13' ? 'PPKn' : 'Pendidikan Pancasila',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Implementasi Pancasila, demokrasi konstitusional, hak dan kewajiban warga negara, serta wawasan kebangsaan.',
      },
      {
        name: 'Bahasa Indonesia',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Teks laporan hasil observasi, negosiasi, prosedur kejuruan, surat lamaran kerja, teks eksplanasi, dan karya ilmiah.',
      },
      {
        name: 'Matematika',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Eksponen & logaritma, barisan/deret, vektor/trigonometri, matriks, transformasi geometri, statistika, dan peluang terapan kejuruan.',
      },
      {
        name: 'Bahasa Inggris',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Bahasa Inggris komunikatif & konteks vokasi (ESP), manual prosedur, korespondensi kerja, dan presentasi.',
      },
      {
        name: 'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Kebugaran jasmani menunjang keselamatan kerja, olahraga permainan, dan pola hidup sehat.',
      },
      {
        name: 'Sejarah',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Perkembangan sejarah nasional Indonesia, pergerakan kemerdekaan, dan transformasi sosial-ekonomi.',
      },
      {
        name: 'Seni dan Budaya',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Apresiasi dan penciptaan karya seni rupa/musik/tari/teater yang relevan dengan kreativitas vokasi.',
      }
    );

    if (gradeNum === 0 || gradeNum === 10) {
      list.push(
        {
          name: 'Informatika',
          category: 'Kejuruan (SMK/MAK)',
          track: 'keduanya',
          regulation: regUmum,
          scopeSummary: 'Berpikir komputasional, analisis data, algoritma, keamanan siber, dan etika digital dunia kerja.',
        },
        {
          name: 'Projek IPAS',
          category: 'Kejuruan (SMK/MAK)',
          track: 'keduanya',
          regulation: regUmum,
          scopeSummary: 'Makhluk hidup & lingkungan, zat & perubahannya, energi, bumi & antariksa, keruangan/konektivitas, interaksi sosial, dan perilaku ekonomi terintegrasi projek.',
        },
        {
          name: 'Dasar-Dasar Program Keahlian',
          category: 'Kejuruan (SMK/MAK)',
          track: 'keduanya',
          regulation: regUmum,
          scopeSummary: 'Proses bisnis, perkembangan teknologi industri, profesi & kewirausahaan, K3LH, dan teknik dasar program keahlian Kelas X.',
        }
      );
    }

    if (gradeNum === 0 || gradeNum >= 11) {
      list.push(
        {
          name: 'Konsentrasi Keahlian',
          category: 'Kejuruan (SMK/MAK)',
          track: 'keduanya',
          regulation: regUmum,
          scopeSummary: 'Kompetensi teknis mendalam sesuai bidang keahlian dan standar SKKNI dunia industri/dunia kerja (Fase F).',
        },
        {
          name: 'Projek Kreatif dan Kewirausahaan',
          category: 'Kejuruan (SMK/MAK)',
          track: 'keduanya',
          regulation: regUmum,
          scopeSummary: 'Perencanaan usaha, desain prototipe produk/jasa, pemasaran digital, HAKI, dan laporan keuangan usaha.',
        },
        {
          name: 'Mata Pelajaran Pilihan',
          category: 'Kejuruan (SMK/MAK)',
          track: 'keduanya',
          regulation: regUmum,
          scopeSummary: 'Pendalaman kompetensi lintas konsentrasi keahlian, bahasa asing vokasi, atau kewirausahaan lanjutan.',
        }
      );
    }

    list.push({
      name: 'Muatan Lokal',
      category: 'Muatan Lokal',
      track: 'keduanya',
      regulation: regUmum,
      scopeSummary: 'Bahasa daerah atau keterampilan khas daerah pendukung industri lokal.',
    });
    return list;
  }

  // 5. SLB
  if (levelKind === 'SLB') {
    list.push(
      {
        name: 'Program Kebutuhan Khusus',
        category: 'Program Khusus (SLB)',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Pengembangan orientasi & mobilitas, bina komunikasi persepsi bunyi/irama, bina diri & bina gerak, atau pengembangan interaksi sosial sesuai ketunaan.',
      },
      {
        name: 'Keterampilan SLB',
        category: 'Program Khusus (SLB)',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Keterampilan vokasional adaptif (tata boga, tata busana, kriya, desain grafis, pertukangan, atau budidaya) sesuai minat dan kemampuan peserta didik.',
      },
      {
        name: 'Pendidikan Agama dan Budi Pekerti',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Pembentukan karakter religius, pembiasaan ibadah harian sederhana, dan akhlak mulia secara adaptif.',
      },
      {
        name: 'Pendidikan Pancasila',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Nilai Pancasila, aturan sederhana di rumah/sekolah, kebersamaan dalam keberagaman secara kontekstual adaptif.',
      },
      {
        name: 'Bahasa Indonesia',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Komunikasi fungsional, literasi dasar, membaca pemahaman sederhana, dan menulis fungsional.',
      },
      {
        name: 'Matematika',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Berhitung fungsional sehari-hari, pengenalan uang, waktu, ukuran dasar, dan bentuk geometri sederhana.',
      },
      {
        name: 'Ilmu Pengetahuan Alam dan Sosial (IPAS)',
        category: 'IPA / IPS / IPAS',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Pengenalan lingkungan sekitar, kebersihan & kesehatan diri, tumbuhan/hewan, dan kehidupan sosial bermasyarakat.',
      },
      {
        name: 'PJOK',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Gerak dasar adaptif, koordinasi motorik, permainan sederhana, dan kebersihan diri.',
      },
      {
        name: 'Seni dan Budaya',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Ekspresi seni rupa, musik, tari, atau teater secara adaptif dan terapeutik.',
      }
    );
    return list;
  }

  // 6. SMA / MA
  const gradeNum = g || 10;
  if (track === 'madrasah') {
    pushKmaCore(gradeNum, 'MA/MAK');
  } else {
    list.push({
      name: 'Pendidikan Agama Islam dan Budi Pekerti',
      category: 'Wajib / Umum',
      track: 'umum',
      regulation: regUmum,
      scopeSummary: "Kajian ayat Al-Qur'an & hadis tematik remaja, akidah Islam, akhlak & etika pergaulan/digital, fikih muamalah & munakahat/mawaris, serta sejarah peradaban Islam.",
    });
  }

  list.push(
    {
      name: currKind === 'K13' ? 'PPKn' : 'Pendidikan Pancasila',
      category: 'Wajib / Umum',
      track: 'keduanya',
      regulation: regUmum,
      scopeSummary: 'Ideologi Pancasila, konstitusi & hak asasi manusia, demokrasi, harmoni dalam keberagaman, dan geopolitik NKRI.',
    },
    {
      name: 'Bahasa Indonesia',
      category: 'Wajib / Umum',
      track: 'keduanya',
      regulation: regUmum,
      scopeSummary: 'Teks LHO, anekdot, hikayat, negosiasi, biografi, puisi, argumentasi, berita, drama, karya ilmiah, dan resensi.',
    },
    {
      name: 'Matematika',
      category: 'Wajib / Umum',
      track: 'keduanya',
      regulation: regUmum,
      scopeSummary: 'Eksponen, logaritma, barisan & deret, sistem persamaan/pertidaksamaan linear, fungsi kuadrat, trigonometri dasar, statistika, peluang, dan lingkaran/matriks.',
    },
    {
      name: 'Bahasa Inggris',
      category: 'Wajib / Umum',
      track: 'keduanya',
      regulation: regUmum,
      scopeSummary: 'Descriptive, recount, narrative, exposition, analytical/hortatory exposition, discussion, dan literary texts tingkat SMA/MA.',
    },
    {
      name: 'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
      category: 'Wajib / Umum',
      track: 'keduanya',
      regulation: regUmum,
      scopeSummary: 'Strategi permainan olahraga, kebugaran jasmani, senam, kesehatan reproduksi/NAPZA, dan budaya hidup aktif.',
    },
    {
      name: 'Sejarah',
      category: 'Wajib / Umum',
      track: 'keduanya',
      regulation: regUmum,
      scopeSummary: 'Pengantar ilmu sejarah, jalur rempah & kerajaan Nusantara, kolonialisme & pergerakan nasional, Proklamasi hingga Reformasi.',
    },
    {
      name: 'Seni dan Budaya',
      category: 'Wajib / Umum',
      track: 'keduanya',
      regulation: regUmum,
      scopeSummary: 'Seni Rupa, Seni Musik, Seni Tari, atau Seni Teater (apresiasi dan kreasi karya seni berbasis budaya dan kontemporer).',
    },
    {
      name: 'Prakarya dan Kewirausahaan',
      category: 'Wajib / Umum',
      track: 'keduanya',
      regulation: regUmum,
      scopeSummary: 'Desain produksi, kewirausahaan kreatif bidang kerajinan, rekayasa, budidaya, atau pengolahan.',
    }
  );

  // Kelas X (Fase E) vs Kelas XI-XII (Fase F) specifics
  if (gradeNum === 0 || gradeNum === 10) {
    list.push(
      {
        name: 'Ilmu Pengetahuan Alam (IPA)',
        category: 'IPA / IPS / IPAS',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'IPA Terpadu Kelas X: pengukuran, energi terbarukan, kimia hijau & struktur atom, keanekaragaman hayati, virus, dan perubahan iklim.',
      },
      {
        name: 'Ilmu Pengetahuan Sosial (IPS)',
        category: 'IPA / IPS / IPAS',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'IPS Terpadu Kelas X: konsep dasar ekonomi & kelangkaan, interaksi sosial & sosiologi, geografi & litosfer/hidrosfer, serta sejarah Indonesia.',
      },
      {
        name: 'Informatika',
        category: 'Wajib / Umum',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Wajib Kelas X: berpikir komputasional, algoritma pemrograman dasar, jaringan komputer & internet, analisis data, dan dampak sosial informatika.',
      }
    );
  }

  // Science & Social subjects (used both as Kelas X components or Fase F Pilihan)
  list.push(
    {
      name: 'Fisika',
      category: gradeNum === 10 ? 'IPA / IPS / IPAS' : 'Pilihan / Tingkat Lanjut (Fase F)',
      track: 'keduanya',
      regulation: regUmum,
      scopeSummary: gradeNum === 10
        ? 'Pengukuran, besaran & satuan, hukum gerak, usaha & energi terbarukan, serta pemanasan global (Kelas X).'
        : 'Vektor, kinematika & dinamika, fluida, termodinamika, gelombang bunyi/cahaya, listrik-magnet, dan fisika modern (Fase F).',
    },
    {
      name: 'Kimia',
      category: gradeNum === 10 ? 'IPA / IPS / IPAS' : 'Pilihan / Tingkat Lanjut (Fase F)',
      track: 'keduanya',
      regulation: regUmum,
      scopeSummary: gradeNum === 10
        ? 'Hakikat ilmu kimia, kimia hijau, struktur atom, sistem periodik unsur, dan hukum dasar kimia sederhana (Kelas X).'
        : 'Ikatan kimia, stoikiometri, termokimia, laju reaksi, kesetimbangan, larutan asam-basa, redoks-elektrokimia, dan kimia organik (Fase F).',
    },
    {
      name: 'Biologi',
      category: gradeNum === 10 ? 'IPA / IPS / IPAS' : 'Pilihan / Tingkat Lanjut (Fase F)',
      track: 'keduanya',
      regulation: regUmum,
      scopeSummary: gradeNum === 10
        ? 'Keanekaragaman hayati, klasifikasi makhluk hidup, virus & bakteri, ekosistem, dan perubahan lingkungan (Kelas X).'
        : 'Sel & transpor membran, metabolisme, sistem organ manusia, pembelahan sel, genetika & mutasi, evolusi, dan bioteknologi (Fase F).',
    },
    {
      name: 'Ekonomi',
      category: gradeNum === 10 ? 'IPA / IPS / IPAS' : 'Pilihan / Tingkat Lanjut (Fase F)',
      track: 'keduanya',
      regulation: regUmum,
      scopeSummary: gradeNum === 10
        ? 'Kebutuhan & kelangkaan, sistem ekonomi, perilaku produsen-konsumen, pasar, dan lembaga jasa keuangan (Kelas X).'
        : 'Pendapatan nasional, pertumbuhan ekonomi, ketenagakerjaan, inflasi & kebijakan moneter-fiskal, perdagangan internasional, dan akuntansi dasar (Fase F).',
    },
    {
      name: 'Sosiologi',
      category: gradeNum === 10 ? 'IPA / IPS / IPAS' : 'Pilihan / Tingkat Lanjut (Fase F)',
      track: 'keduanya',
      regulation: regUmum,
      scopeSummary: gradeNum === 10
        ? 'Fungsi sosiologi, gejala sosial, nilai & norma, sosialisasi, interaksi sosial, dan lembaga sosial (Kelas X).'
        : 'Kelompok sosial, permasalahan & konflik sosial, kesetaraan & harmoni sosial, perubahan sosial, dan globalisasi/ketimpangan (Fase F).',
    },
    {
      name: 'Geografi',
      category: gradeNum === 10 ? 'IPA / IPS / IPAS' : 'Pilihan / Tingkat Lanjut (Fase F)',
      track: 'keduanya',
      regulation: regUmum,
      scopeSummary: gradeNum === 10
        ? 'Konsep & pendekatan geografi, peta & SIG dasar, dinamika litosfer, atmosfer, dan hidrosfer (Kelas X).'
        : 'Posisi strategis Indonesia & poros maritim, keanekaragaman flora-fauna, ketahanan pangan-energi, kependudukan, mitigasi bencana, dan kewilayahan (Fase F).',
    }
  );

  if (gradeNum === 0 || gradeNum >= 11) {
    list.push(
      {
        name: 'Matematika Tingkat Lanjut',
        category: 'Pilihan / Tingkat Lanjut (Fase F)',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Bilangan kompleks, polinomial, matriks lanjutan, transformasi geometri, fungsi & pemodelan, vektor, serta irisan kerucut dan kalkulus dasar.',
      },
      {
        name: 'Bahasa Indonesia Tingkat Lanjut',
        category: 'Pilihan / Tingkat Lanjut (Fase F)',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Analisis teks sastra dan non-sastra mendalam, penulisan esai/kritik sastra, dan keterampilan berbahasa akademik.',
      },
      {
        name: 'Bahasa Inggris Tingkat Lanjut',
        category: 'Pilihan / Tingkat Lanjut (Fase F)',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Critical reading, narrative/hortatory/discussion writing, dan komunikasi akademik bahasa Inggris tingkat B1–B2.',
      },
      {
        name: 'Informatika (Fase F)',
        category: 'Pilihan / Tingkat Lanjut (Fase F)',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Strategi algoritmik & pemrograman lanjutan (Python/C++), struktur data, jaringan & keamanan siber, dan analisis data terapan.',
      },
      {
        name: 'Antropologi',
        category: 'Pilihan / Tingkat Lanjut (Fase F)',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Etnografi, kebudayaan lokal & global, sistem kekerabatan, bahasa, dan perubahan kebudayaan masyarakat.',
      },
      {
        name: 'Koding dan Kecerdasan Artifisial',
        category: 'Pilihan / Tingkat Lanjut (Fase F)',
        track: 'keduanya',
        regulation: regUmum,
        scopeSummary: 'Pemrograman lanjutan, pemrosesan data, konsep machine learning/AI generatif, rekayasa prompt, serta etika & keamanan AI.',
      }
    );

    if (track === 'madrasah') {
      list.push(
        {
          name: 'Bahasa Arab Tingkat Lanjut',
          category: 'Peminatan Keagamaan (MA)',
          track: 'madrasah',
          regulation: regKma,
          scopeSummary: 'Pendalaman balaghah, nahwu-sharaf lanjutan, qira’ah kitab/teks klasik-kontemporer, dan insya’/menulis akademik Arab.',
        },
        {
          name: 'Ilmu Tafsir',
          category: 'Peminatan Keagamaan (MA)',
          track: 'madrasah',
          regulation: regKma,
          scopeSummary: 'Ulumul Qur’an, metode tafsir (tahlili, ijmali, muqaran, maudhu’i), asbabun nuzul, nasikh-mansukh, dan tafsir ayat tematik.',
        },
        {
          name: 'Ilmu Hadis',
          category: 'Peminatan Keagamaan (MA)',
          track: 'madrasah',
          regulation: regKma,
          scopeSummary: 'Musthalah hadis, sanad & matan, klasifikasi hadis (shahih, hasan, dhaif), takhrij hadis, dan biografi perawi.',
        },
        {
          name: 'Ushul Fikih',
          category: 'Peminatan Keagamaan (MA)',
          track: 'madrasah',
          regulation: regKma,
          scopeSummary: 'Sumber hukum Islam (Al-Qur’an, Sunnah, Ijma’, Qiyas, Istihsan, Maslahah Mursalah), kaidah fikih, dan ijtihad.',
        },
        {
          name: 'Ilmu Kalam',
          category: 'Peminatan Keagamaan (MA)',
          track: 'madrasah',
          regulation: regKma,
          scopeSummary: 'Aliran-aliran teologi Islam klasik dan modern serta argumentasi rasional-naqli penguatan akidah moderat.',
        },
        {
          name: 'Akhlak Tasawuf',
          category: 'Peminatan Keagamaan (MA)',
          track: 'madrasah',
          regulation: regKma,
          scopeSummary: 'Konsep tasawuf akhlaki & amali, maqamat & ahwal, tazkiyatun nafs, dan etika spiritualitas kehidupan modern.',
        }
      );
    }
  }

  list.push({
    name: 'Muatan Lokal',
    category: 'Muatan Lokal',
    track: 'keduanya',
    regulation: regUmum,
    scopeSummary: 'Bahasa daerah, seni tradisi, tahfiz/tilawah (jika ditetapkan satuan pendidikan), atau keunggulan lokal daerah.',
  });

  return list;
}

export function normalizeSubjectForComparison(val: string): string {
  return (val || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function findMatchingOfficialSubject(
  subjectInput: string,
  candidates: OfficialSubjectEntry[]
): OfficialSubjectEntry | undefined {
  const norm = normalizeSubjectForComparison(subjectInput);
  if (!norm) return undefined;

  // 1. Exact or normalized match
  const exact = candidates.find((c) => normalizeSubjectForComparison(c.name) === norm);
  if (exact) return exact;

  // 2. Alias / partial match
  if (norm.includes('fiqih') || norm.includes('fikih')) {
    if (norm.includes('ushul')) return candidates.find((c) => c.name === 'Ushul Fikih');
    return candidates.find((c) => c.name === 'Fikih');
  }
  if (norm.includes('quran') || norm.includes('hadis') || norm.includes('hadits')) {
    if (norm.includes('ilmu hadis')) return candidates.find((c) => c.name === 'Ilmu Hadis');
    return candidates.find((c) => c.name === "Al-Qur'an Hadis");
  }
  if (norm.includes('akidah') || norm.includes('aqidah')) {
    return candidates.find((c) => c.name === 'Akidah Akhlak');
  }
  if (norm === 'ski' || norm.includes('kebudayaan islam')) {
    return candidates.find((c) => c.name.includes('Sejarah Kebudayaan Islam'));
  }
  if (norm.includes('bahasa arab') || norm === 'arab') {
    if (norm.includes('lanjut')) return candidates.find((c) => c.name.includes('Bahasa Arab Tingkat Lanjut'));
    return candidates.find((c) => c.name === 'Bahasa Arab' || c.name.includes('Bahasa Arab'));
  }
  if (norm.includes('ipas')) {
    return candidates.find((c) => c.name.includes('IPAS'));
  }
  if (norm === 'ipa' || norm.includes('ilmu pengetahuan alam')) {
    return candidates.find((c) => c.name.includes('Ilmu Pengetahuan Alam (IPA)'));
  }
  if (norm === 'ips' || norm.includes('ilmu pengetahuan sosial')) {
    return candidates.find((c) => c.name.includes('Ilmu Pengetahuan Sosial (IPS)'));
  }
  if (norm.includes('pancasila') || norm === 'ppkn' || norm === 'pkn') {
    return candidates.find((c) => c.name === 'Pendidikan Pancasila' || c.name === 'PPKn');
  }
  if (norm.includes('pjok') || norm.includes('penjas') || norm.includes('olahraga')) {
    return candidates.find((c) => c.name.includes('PJOK'));
  }
  if (norm.includes('seni') || norm.includes('sbdp')) {
    return candidates.find((c) => c.name.includes('Seni'));
  }
  if (norm.includes('pai') || norm.includes('agama islam')) {
    return (
      candidates.find((c) => c.name.includes('Pendidikan Agama Islam')) ||
      candidates.find((c) => c.name === "Al-Qur'an Hadis")
    );
  }
  if (norm === 'mtk' || norm === 'matematika') {
    return candidates.find((c) => c.name === 'Matematika');
  }

  return candidates.find(
    (c) =>
      normalizeSubjectForComparison(c.name).includes(norm) ||
      norm.includes(normalizeSubjectForComparison(c.name))
  );
}

/**
 * Picks a valid official subject automatically when changing Jenjang, Kelas, Kurikulum, or Satuan Pendidikan (Umum vs Madrasah).
 * Preserves currentSubject if it still applies in the new context.
 */
export function pickAutoSubjectForContext(params: {
  currentSubject?: string;
  level?: string;
  grade?: string;
  curriculum?: string;
  track: InstitutionTrack;
  schoolName?: string;
}): string {
  const candidates = getOfficialSubjectsForContext({
    level: params.level,
    grade: params.grade,
    curriculum: params.curriculum,
    track: params.track,
    schoolName: params.schoolName,
  });
  if (candidates.length === 0) return params.currentSubject || 'Bahasa Indonesia';

  const curr = (params.currentSubject || '').trim();
  if (curr) {
    const matched = findMatchingOfficialSubject(curr, candidates);
    if (matched) {
      // If user explicitly switched to Madrasah and had generic PAI, map or keep appropriately; if switched to Umum and had KMA subject, switch to PAI
      const isKma = isKmaReligiousSubject(curr);
      if (params.track === 'umum' && isKma) {
        return (
          candidates.find((c) => c.name.includes('Pendidikan Agama Islam'))?.name ||
          candidates[0].name
        );
      }
      if (params.track === 'madrasah' && curr.toLowerCase().includes('pendidikan agama islam')) {
        return "Al-Qur'an Hadis";
      }
      return matched.name;
    }
    // Check if Muatan Lokal / custom subject should be preserved on non-PAUD when user typed custom mulok
    if (curr.toLowerCase().includes('muatan lokal') || curr.toLowerCase().includes('daerah')) {
      return curr;
    }
  }

  return candidates[0].name;
}

export function resolveSubjectRegulationContext(params: {
  level?: string;
  grade?: string;
  curriculum?: string;
  subject?: string;
  schoolName?: string;
  institutionTrack?: InstitutionTrack;
}): SubjectRegulationContext {
  const track = detectInstitutionTrack({
    schoolName: params.schoolName,
    level: params.level,
    grade: params.grade,
    subject: params.subject,
    preferredTrack: params.institutionTrack,
  });
  const currKind = normalizeCurriculumKind(params.curriculum);
  const candidates = getOfficialSubjectsForContext({
    level: params.level,
    grade: params.grade,
    curriculum: params.curriculum,
    track,
    schoolName: params.schoolName,
  });

  const jpStandard = getOfficialJpStandard({
    level: params.level,
    grade: params.grade,
    subject: params.subject,
    curriculum: params.curriculum,
    schoolName: params.schoolName,
    institutionTrack: track,
  });

  const matched = findMatchingOfficialSubject(params.subject || '', candidates);

  if (matched) {
    return {
      track,
      regulationTitle: matched.regulation,
      curriculumKind: currKind,
      subjectName: matched.name,
      category: matched.category,
      scopeSummary: matched.scopeSummary,
      isOfficialMatch: true,
      jpStandard,
    };
  }

  return {
    track,
    regulationTitle: jpStandard.regulationRef,
    curriculumKind: currKind,
    subjectName: (params.subject || '').trim() || candidates[0]?.name || 'Mata Pelajaran',
    category: track === 'madrasah' ? 'Mata Pelajaran Madrasah' : 'Mata Pelajaran Umum / Pilihan',
    scopeSummary:
      track === 'madrasah'
        ? 'Sesuaikan ruang lingkup materi dengan KMA No. 450 Tahun 2024 (KM Madrasah) atau KMA No. 183 Tahun 2019 (K-13 Madrasah) serta karakteristik jenjang satuan pendidikan.'
        : 'Sesuaikan ruang lingkup materi dan Capaian Pembelajaran / Kompetensi Dasar dengan Permendikbudristek No. 12 Tahun 2024 (atau K-13) sesuai tingkat kelas dan fase.',
    isOfficialMatch: false,
    jpStandard,
  };
}
