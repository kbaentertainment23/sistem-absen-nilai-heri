import React, { useState, useMemo, useEffect } from 'react';
import { stripClockFromJamString } from '../utils/textHelper';
import { motion } from 'motion/react';
import { 
  BookOpen, 
  Clock, 
  UserX, 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  AlertCircle, 
  Calendar, 
  Copy, 
  FileText, 
  Sparkles, 
  ThumbsUp, 
  MessageSquare,
  HelpCircle,
  Share2,
  CalendarDays,
  ListRestart,
  CalendarCheck,
  CalendarX,
  CalendarOff,
  Bell,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Info,
  ArrowRight,
  BookMarked
} from 'lucide-react';
import { Student, AttendanceRecord, JurnalHarianRecord, StudentNote, ClassSchedule, AttendanceDateNote, WeeklyMaterialTemplate } from '../types';
import { getDayOfWeekFromDate, isClassScheduledOnDate, getClassScheduleForDate, parseLessonHoursFromString } from '../utils/scheduleHelper';
import { WeeklyTemplateModal, DEFAULT_WEEKLY_TEMPLATES, TemplateEditInfo } from './WeeklyTemplateModal';
import DateNoteModal from './DateNoteModal';
import { getWeeklyTemplatesFromFirestore, saveWeeklyTemplatesToFirestore, syncJournalsWithUpdatedWeeklyTemplate } from '../lib/firestoreService';

interface JurnalHarianTabProps {
  students: Student[];
  attendance: AttendanceRecord[];
  notes?: StudentNote[];
  studentNotes?: StudentNote[];
  dateNotes?: AttendanceDateNote[];
  journals: JurnalHarianRecord[];
  allJournals?: JurnalHarianRecord[];
  selectedDate?: string;
  onDateChange?: (date: string) => void;
  activeClassName: string;
  classSchedule?: ClassSchedule;
  onSaveJournal: (record: Omit<JurnalHarianRecord, 'id'> & { id?: string }) => void;
  onDeleteJournal: (idOrJournal: string | JurnalHarianRecord) => void;
  onBulkUpdateJournals?: (journals: JurnalHarianRecord[]) => void;
  isSyncing?: boolean;
  classes?: { id: number; name: string }[];
  selectedClassId?: number;
  onClassChange?: (classId: number) => void;
  selectedSemester?: 1 | 2;
  onSaveDateNote?: (note: AttendanceDateNote, targetClasses?: string[]) => void | Promise<void>;
  onDeleteDateNote?: (date: string, removeFromAll?: boolean) => void | Promise<void>;
}

const LESSON_HOURS = [1, 2, 3, 4, 5, 6, 7];

export default function JurnalHarianTab({
  students,
  attendance,
  notes,
  studentNotes,
  dateNotes = [],
  journals,
  allJournals,
  selectedDate,
  onDateChange,
  activeClassName,
  classSchedule,
  onSaveJournal,
  onDeleteJournal,
  onBulkUpdateJournals,
  isSyncing = false,
  classes,
  selectedClassId,
  onClassChange,
  selectedSemester = 1,
  onSaveDateNote,
  onDeleteDateNote
}: JurnalHarianTabProps) {
  const activeNotes = notes || studentNotes || [];
  // Form States
  const [selectedHours, setSelectedHours] = useState<number[]>([]);
  const [materi, setMateri] = useState('');
  const [catatan, setCatatan] = useState('');
  const [hambatan, setHambatan] = useState('');
  const [solusi, setSolusi] = useState('');
  const [keaktifan, setKeaktifan] = useState<number>(4); // default 4 stars
  const [adaTugas, setAdaTugas] = useState(false);
  const [deskripsiTugas, setDeskripsiTugas] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(null);
  const [appliedMingguKe, setAppliedMingguKe] = useState<number | null>(null);
  const [appliedTP, setAppliedTP] = useState<string>('');
  const [journalToDeleteId, setJournalToDeleteId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [showToast, setShowToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [showAllMissingDates, setShowAllMissingDates] = useState(false);

  // Date Note Modal state (for marking class-specific / multi-class / all-class holiday or activity)
  const [isDateNoteModalOpen, setIsDateNoteModalOpen] = useState(false);
  const [dateNoteModalTargetDate, setDateNoteModalTargetDate] = useState<string>('');
  const [dateNoteModalInitialReason, setDateNoteModalInitialReason] = useState<string>('');

  const openDateNoteModal = (targetDate: string, initialReason = '') => {
    setDateNoteModalTargetDate(targetDate);
    setDateNoteModalInitialReason(initialReason);
    setIsDateNoteModalOpen(true);
  };

  // Bank Template Materi Mingguan State
  const [weeklyTemplates, setWeeklyTemplates] = useState<WeeklyMaterialTemplate[]>(() => {
    try {
      const cached = localStorage.getItem('cache_weekly_templates');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Error reading cached weekly templates:', e);
    }
    return DEFAULT_WEEKLY_TEMPLATES;
  });
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

  // Hydrate weekly templates from Firestore on mount (sorted by mingguKe)
  useEffect(() => {
    getWeeklyTemplatesFromFirestore()
      .then((res) => {
        if (res && res.length > 0) {
          const sorted = [...res].sort((a, b) => (a.mingguKe || 0) - (b.mingguKe || 0));
          setWeeklyTemplates(sorted);
          localStorage.setItem('cache_weekly_templates', JSON.stringify(sorted));
        }
      })
      .catch((err) => console.warn('Could not fetch weekly templates:', err));
  }, []);

  const sortedWeeklyTemplates = useMemo(() => {
    return [...weeklyTemplates].sort((a, b) => (a.mingguKe || 0) - (b.mingguKe || 0));
  }, [weeklyTemplates]);

  const weeklyTemplateById = useMemo(() => {
    const map = new Map<string, WeeklyMaterialTemplate>();
    sortedWeeklyTemplates.forEach(t => {
      if (t.id) map.set(t.id, t);
    });
    return map;
  }, [sortedWeeklyTemplates]);

  // Compute chronological sequential week numbers (Minggu 1, 2, 3, ...) and template reuse tracking for active class
  const classJournalTimeline = useMemo(() => {
    const classList = journals
      .filter(j => j.kelas === activeClassName)
      .slice()
      .sort((a, b) => {
        const dateDiff = (a.tanggal || '').localeCompare(b.tanggal || '');
        if (dateDiff !== 0) return dateDiff;
        const minHourA = Array.isArray(a.jamPelajaran) && a.jamPelajaran.length > 0 ? Math.min(...a.jamPelajaran) : 0;
        const minHourB = Array.isArray(b.jamPelajaran) && b.jamPelajaran.length > 0 ? Math.min(...b.jamPelajaran) : 0;
        if (minHourA !== minHourB) return minHourA - minHourB;
        return (a.id || '').localeCompare(b.id || '');
      });

    const getTemplateKey = (j: JurnalHarianRecord): string | null => {
      if (j.templateId) return `tpl:${j.templateId}`;
      const matchedTpl = sortedWeeklyTemplates.find(
        t =>
          (t.topikMateri || '').trim().toLowerCase() === (j.materi || '').trim().toLowerCase() ||
          (j.mingguKe !== undefined && t.mingguKe === j.mingguKe)
      );
      if (matchedTpl) return `tpl:${matchedTpl.id}`;
      if (j.mingguKe !== undefined) return `wk:${j.mingguKe}`;
      return null;
    };

    const totalUsesByKey = new Map<string, number>();
    classList.forEach(j => {
      const key = getTemplateKey(j);
      if (key) {
        totalUsesByKey.set(key, (totalUsesByKey.get(key) || 0) + 1);
      }
    });

    const runningUsesByKey = new Map<string, number>();
    const metaByJournalKey = new Map<
      string,
      {
        sequentialWeek: number;
        sourceTemplateWeek?: number;
        sourceTemplateLabel?: string;
        templateUseIndex: number;
        totalTemplateUses: number;
      }
    >();

    classList.forEach((j, idx) => {
      const sequentialWeek = idx + 1;
      const key = getTemplateKey(j);
      let templateUseIndex = 1;
      let totalTemplateUses = 1;
      if (key) {
        templateUseIndex = (runningUsesByKey.get(key) || 0) + 1;
        runningUsesByKey.set(key, templateUseIndex);
        totalTemplateUses = totalUsesByKey.get(key) || 1;
      }

      const tpl = j.templateId
        ? weeklyTemplateById.get(j.templateId)
        : sortedWeeklyTemplates.find(
            t => (t.topikMateri || '').trim().toLowerCase() === (j.materi || '').trim().toLowerCase()
          );

      const sourceTemplateWeek = tpl?.mingguKe ?? j.mingguKe;
      const sourceTemplateLabel =
        tpl?.labelMinggu || (sourceTemplateWeek !== undefined ? `Minggu ${sourceTemplateWeek}` : undefined);

      const mapKey = j.id || `${j.tanggal}__${j.kelas}__${idx}`;
      metaByJournalKey.set(mapKey, {
        sequentialWeek,
        sourceTemplateWeek,
        sourceTemplateLabel,
        templateUseIndex,
        totalTemplateUses
      });
    });

    return { classList, metaByJournalKey };
  }, [journals, activeClassName, sortedWeeklyTemplates, weeklyTemplateById]);

  const handleSaveWeeklyTemplates = async (
    newTemplates: WeeklyMaterialTemplate[],
    editInfo?: TemplateEditInfo
  ) => {
    const sortedNew = [...newTemplates].sort((a, b) => (a.mingguKe || 0) - (b.mingguKe || 0));
    setWeeklyTemplates(sortedNew);
    localStorage.setItem('cache_weekly_templates', JSON.stringify(sortedNew));
    await saveWeeklyTemplatesToFirestore(sortedNew);

    if (editInfo && editInfo.oldTemplate && editInfo.newTemplate) {
      const sourceJournals = allJournals && allJournals.length > 0 ? allJournals : journals;
      const { updatedJournals, updatedCount } = await syncJournalsWithUpdatedWeeklyTemplate(
        editInfo.oldTemplate,
        editInfo.newTemplate,
        sourceJournals
      );

      if (updatedCount > 0) {
        if (onBulkUpdateJournals) {
          onBulkUpdateJournals(updatedJournals);
        }

        // If the current journal displayed is one of the updated ones, refresh current form fields
        const currentUpdated = updatedJournals.find(j => j.tanggal === currentDate && j.kelas === activeClassName);
        if (currentUpdated) {
          setMateri(currentUpdated.materi);
          if (currentUpdated.catatan) setCatatan(currentUpdated.catatan);
          if (currentUpdated.adaTugas !== undefined) {
            setAdaTugas(Boolean(currentUpdated.adaTugas));
            setDeskripsiTugas(currentUpdated.deskripsiTugas || '');
          }
        }

        return { updatedJournalsCount: updatedCount };
      }
    }
  };

  // Quick templates for materi
  const quickMateriTemplates = [
    'Pengenalan Sistem Operasi & Folder',
    'Praktik Formula Excel dasar (SUM, AVERAGE)',
    'Logika Pemrograman Dasar & Algoritma',
    'Desain Grafis Canva Sederhana',
    'Pengenalan HTML & CSS Dasar',
    'Evaluasi Pembelajaran & Penugasan Mandiri'
  ];

  // Helper trigger local toast
  const triggerToast = (message: string, type: 'success' | 'info' = 'success') => {
    setShowToast({ message, type });
    setTimeout(() => setShowToast(null), 3500);
  };

  // Calculate local today string (YYYY-MM-DD)
  const todayStr = useMemo(() => {
    const d = new Date();
    const offset = d.getTimezoneOffset();
    const localDate = new Date(d.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  }, []);

  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const offset = d.getTimezoneOffset();
    const localDate = new Date(d.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  }, []);

  const twoDaysAgoStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    const offset = d.getTimezoneOffset();
    const localDate = new Date(d.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  }, []);

  // Internal Date State so user can freely change date even if parent didn't pass onDateChange
  const [currentDate, setCurrentDate] = useState<string>(selectedDate || todayStr);

  useEffect(() => {
    if (selectedDate && selectedDate !== currentDate) {
      setCurrentDate(selectedDate);
    }
  }, [selectedDate]);

  const handleDateChange = (newDate: string) => {
    if (!newDate) return;
    setCurrentDate(newDate);
    if (onDateChange) {
      onDateChange(newDate);
    }
  };

  // Map for date notes (dates that are marked as holiday/activity/non-learning)
  const dateNotesMap = useMemo(() => {
    const map = new Map<string, string>();
    (dateNotes || []).forEach(n => {
      if (n.tanggal && (n.alasan || (n as any).catatan)) {
        map.set(n.tanggal, n.alasan || (n as any).catatan || 'Ditandai');
      }
    });
    return map;
  }, [dateNotes]);

  const currentDateNote = useMemo(() => {
    return (dateNotes || []).find(n => n.tanggal === currentDate) || null;
  }, [dateNotes, currentDate]);

  const todayDateNote = useMemo(() => {
    return (dateNotes || []).find(n => n.tanggal === todayStr) || null;
  }, [dateNotes, todayStr]);

  const targetModalNote = useMemo(() => {
    if (!dateNoteModalTargetDate) return null;
    return (dateNotes || []).find(n => n.tanggal === dateNoteModalTargetDate) || null;
  }, [dateNotes, dateNoteModalTargetDate]);

  // Is today marked with a date note?
  const isTodayMarked = useMemo(() => {
    return dateNotesMap.has(todayStr);
  }, [dateNotesMap, todayStr]);

  // Determine if today is scheduled for this class within the semester date range & historical roster versions
  const isTodayScheduled = useMemo(() => {
    return isClassScheduledOnDate(classSchedule, todayStr);
  }, [classSchedule, todayStr]);

  const isCurrentDateScheduled = useMemo(() => {
    return isClassScheduledOnDate(classSchedule, currentDate);
  }, [classSchedule, currentDate]);

  // Current date schedule details resolved from version history
  const currentDateScheduleInfo = useMemo(() => {
    return getClassScheduleForDate(classSchedule, currentDate);
  }, [classSchedule, currentDate]);

  // Suggested sequential week for the currently selected date in active class
  const suggestedSequentialWeekForCurrentDate = useMemo(() => {
    const classList = classJournalTimeline.classList;
    const existingIdx = classList.findIndex(j => j.tanggal === currentDate);
    if (existingIdx !== -1) {
      return existingIdx + 1;
    }
    const priorCount = classList.filter(j => (j.tanggal || '') < currentDate).length;
    return priorCount + 1;
  }, [classJournalTimeline.classList, currentDate]);

  const handleApplyTemplate = (tpl: WeeklyMaterialTemplate) => {
    setMateri(tpl.topikMateri);
    setCatatan(tpl.catatanKegiatan);
    setAppliedTemplateId(tpl.id);
    // Gunakan urutan minggu kelas yang berurutan (1, 2, 3, ...) agar tidak dobel jika template dipakai berkali-kali
    const nextSequentialWeek = suggestedSequentialWeekForCurrentDate;
    setAppliedMingguKe(nextSequentialWeek);
    setAppliedTP(tpl.tujuanPembelajaran || '');

    // Pertahankan jam pelajaran sesuai jadwal kelas aktif yang telah di-setting
    const scheduledHours = currentDateScheduleInfo?.jamPelajaran 
      ? parseLessonHoursFromString(currentDateScheduleInfo.jamPelajaran)
      : [];

    if (scheduledHours.length > 0) {
      // Prioritas 1: Selalu gunakan jam pelajaran dari jadwal yang aktif untuk kelas & tanggal ini
      setSelectedHours(scheduledHours);
    } else if (selectedHours.length > 0) {
      // Prioritas 2: Jika guru sudah memilih jam di form sebelum membuka template, pertahankan pilihan guru
    } else if (tpl.jamPelajaranDefault && tpl.jamPelajaranDefault.length > 0) {
      // Prioritas 3 (Fallback): Hanya gunakan default template jika jadwal kelas belum di-setting
      setSelectedHours(tpl.jamPelajaranDefault);
    }

    if (tpl.keaktifanDefault) {
      setKeaktifan(tpl.keaktifanDefault);
    }
    if (tpl.adaTugas !== undefined) {
      setAdaTugas(Boolean(tpl.adaTugas));
      setDeskripsiTugas(tpl.deskripsiTugas || '');
    }

    const previousUsesInClass = classJournalTimeline.classList.filter(
      j =>
        j.tanggal !== currentDate &&
        (j.templateId === tpl.id ||
          (j.materi || '').trim().toLowerCase() === (tpl.topikMateri || '').trim().toLowerCase())
    ).length;

    if (previousUsesInClass > 0) {
      triggerToast(
        `✨ Template "${tpl.labelMinggu || `Minggu ${tpl.mingguKe}`}" diterapkan ke Minggu ke-${nextSequentialWeek} (penggunaan ke-${previousUsesInClass + 1} di ${activeClassName})!`,
        'success'
      );
    } else if (nextSequentialWeek !== tpl.mingguKe) {
      triggerToast(
        `✨ Template "${tpl.labelMinggu || `Minggu ${tpl.mingguKe}`}" diterapkan berurutan sebagai Minggu ke-${nextSequentialWeek} untuk ${activeClassName}!`,
        'success'
      );
    } else {
      triggerToast(
        `✨ Template "${tpl.labelMinggu || `Minggu ${tpl.mingguKe}`}" berhasil diterapkan! Jam pelajaran tetap sesuai jadwal.`,
        'success'
      );
    }
  };

  // Determine if today's journal has been filled for this active class
  const isTodayJournalFilled = useMemo(() => {
    return journals.some(j => j.tanggal === todayStr && j.kelas === activeClassName);
  }, [journals, todayStr, activeClassName]);

  // Proactive toast notification reminder: ONLY if today is scheduled, NOT marked, and NOT filled
  useEffect(() => {
    if (isTodayScheduled && !isTodayMarked && !isTodayJournalFilled) {
      const formattedTodayStr = new Date(todayStr).toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      triggerToast(
        `Jadwal Pelajaran Hari Ini: Jurnal harian untuk (${formattedTodayStr}) di ${activeClassName} belum tercatat.`,
        'info'
      );
    }
  }, [activeClassName, isTodayJournalFilled, todayStr, isTodayScheduled, isTodayMarked]);

  // Calculate missing/forgotten journal dates for scheduled lessons or dates with attendance
  // EXCLUDES any dates that are marked in dateNotes ("karena jika ditandai biasanya memang tidak belajar")
  // RESPECTS historical schedule versions (riwayat jadwal berlaku)
  const missingJournalDates = useMemo(() => {
    if (!activeClassName) return [];

    const journalDatesSet = new Set<string>();
    journals.forEach(j => {
      if (j.kelas === activeClassName && j.tanggal) {
        journalDatesSet.add(j.tanggal);
      }
    });

    const semStartDate = classSchedule?.tanggalMulaiSemester;
    const semEndDate = classSchedule?.tanggalSelesaiSemester;
    const candidateDates = new Set<string>();

    // 1. Include all past dates that have attendance recorded for this class within semester range
    attendance.forEach(a => {
      if (a.tanggal && a.tanggal <= todayStr) {
        if (semStartDate && a.tanggal < semStartDate) return;
        if (semEndDate && a.tanggal > semEndDate) return;
        candidateDates.add(a.tanggal);
      }
    });

    // 2. Include scheduled days within the semester range using version-aware lookup
    if (semStartDate) {
      const start = new Date(semStartDate + 'T00:00:00');
      const endTargetStr = semEndDate && semEndDate < todayStr ? semEndDate : todayStr;
      const end = new Date(endTargetStr + 'T00:00:00');

      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
        const curr = new Date(start);
        while (curr <= end) {
          const yyyy = curr.getFullYear();
          const mm = String(curr.getMonth() + 1).padStart(2, '0');
          const dd = String(curr.getDate()).padStart(2, '0');
          const dateStr = `${yyyy}-${mm}-${dd}`;
          if (isClassScheduledOnDate(classSchedule, dateStr)) {
            candidateDates.add(dateStr);
          }
          curr.setDate(curr.getDate() + 1);
        }
      }
    } else {
      const today = new Date();
      for (let i = 0; i <= 90; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        if (semEndDate && dateStr > semEndDate) continue;
        if (isClassScheduledOnDate(classSchedule, dateStr)) {
          candidateDates.add(dateStr);
        }
      }
    }

    const result: {
      tanggal: string;
      dayName: string;
      isScheduled: boolean;
      hasAttendance: boolean;
      isToday: boolean;
      formattedDate: string;
      versionName?: string;
    }[] = [];

    // Check active roster start date
    const activeVer = Array.isArray(classSchedule?.riwayatJadwal)
      ? (classSchedule.activeVersionId
          ? classSchedule.riwayatJadwal.find(v => v.id === classSchedule.activeVersionId)
          : classSchedule.riwayatJadwal.find(v => v.isActive) || classSchedule.riwayatJadwal[classSchedule.riwayatJadwal.length - 1])
      : undefined;
    const activeVerStartDate = activeVer?.tanggalMulai;

    const sortedDates = Array.from(candidateDates).sort().reverse();

    for (const dateStr of sortedDates) {
      if (dateStr > todayStr) continue;
      if (semStartDate && dateStr < semStartDate) continue;
      if (semEndDate && dateStr > semEndDate) continue;
      // Skip if already filled (Proteksi Jurnal Lama: jurnal lama yang sudah diisi TIDAK PERNAH dianggap belum isi)
      if (journalDatesSet.has(dateStr)) continue;
      // Skip if marked with a date note ("ditandai" -> tidak belajar / libur / rapat)
      if (dateNotesMap.has(dateStr)) continue;

      const hasAttendance = attendance.some(a => a.tanggal === dateStr);

      // If a new active roster version is configured with a specific start date (e.g. Roster 2 starting 7 September),
      // dates before that start date should NOT trigger missing journal alerts unless attendance was actually recorded!
      if (activeVerStartDate && dateStr < activeVerStartDate && !hasAttendance) {
        continue;
      }

      const dayName = getDayOfWeekFromDate(dateStr);
      const isScheduled = isClassScheduledOnDate(classSchedule, dateStr);
      const schedInfo = isScheduled ? getClassScheduleForDate(classSchedule, dateStr) : null;

      if (!isScheduled && !hasAttendance) continue;

      const dObj = new Date(dateStr + 'T00:00:00');
      const formattedDate = isNaN(dObj.getTime())
        ? dateStr
        : dObj.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

      result.push({
        tanggal: dateStr,
        dayName,
        isScheduled,
        hasAttendance,
        isToday: dateStr === todayStr,
        formattedDate,
        versionName: schedInfo?.isVersioned ? schedInfo.versionName : undefined
      });
    }

    return result;
  }, [activeClassName, classSchedule, dateNotesMap, journals, attendance, todayStr]);

  // Determine absent students for this date and class from Daily Attendance database
  const absentStudents = useMemo(() => {
    const studentNisSet = new Set(students.map(s => s.nis));
    // Filter attendance record matching class and date
    return attendance.filter(r => 
      r.tanggal === currentDate && 
      r.kelas === activeClassName && 
      studentNisSet.has(r.nis) && 
      r.status !== 'Hadir'
    ).map(r => ({
      nis: r.nis,
      nama: r.nama,
      status: r.status as 'Sakit' | 'Izin' | 'Alfa'
    }));
  }, [attendance, students, currentDate, activeClassName]);

  // Determine student notes for this date and class from Catatan Siswa database
  const dayNotes = useMemo(() => {
    const activeNotes = notes || studentNotes || [];
    const studentNisSet = new Set(students.map(s => s.nis));
    return activeNotes.filter(n => 
      n.tanggal === currentDate && 
      n.kelas === activeClassName && 
      studentNisSet.has(n.nis)
    );
  }, [notes, studentNotes, students, currentDate, activeClassName]);

  // Load existing journal for editing or initialize from current date/class
  const existingJournal = useMemo(() => {
    return journals.find(j => j.tanggal === currentDate && j.kelas === activeClassName);
  }, [journals, currentDate, activeClassName]);

  // Handle loading existing journal for this date or filling defaults
  useEffect(() => {
    if (existingJournal && !editingId) {
      setSelectedHours(existingJournal.jamPelajaran || []);
      setMateri(existingJournal.materi || '');
      setCatatan(existingJournal.catatan || '');
      setHambatan(existingJournal.hambatan || '');
      setSolusi(existingJournal.solusi || '');
      setKeaktifan(existingJournal.keaktifan || 4);
      setAdaTugas(!!existingJournal.adaTugas);
      setDeskripsiTugas(existingJournal.deskripsiTugas || '');
      setAppliedTemplateId(existingJournal.templateId || null);
      setAppliedMingguKe(existingJournal.mingguKe !== undefined ? existingJournal.mingguKe : null);
      setAppliedTP(existingJournal.tujuanPembelajaran || '');
      setEditingId(existingJournal.id);
    } else if (!existingJournal) {
      // Auto-synchronize jam pelajaran from schedule settings for the active date & class
      const scheduledLessonHours = currentDateScheduleInfo?.jamPelajaran 
        ? parseLessonHoursFromString(currentDateScheduleInfo.jamPelajaran)
        : [];

      // Clear form for new entry on date/class change, initializing scheduled lesson hours if available
      setSelectedHours(scheduledLessonHours);
      setMateri('');
      setCatatan('');
      setHambatan('');
      setSolusi('');
      setKeaktifan(4);
      setAdaTugas(false);
      setDeskripsiTugas('');
      setAppliedTemplateId(null);
      setAppliedMingguKe(null);
      setAppliedTP('');
      setEditingId(null);
    }
  }, [existingJournal, currentDate, activeClassName, currentDateScheduleInfo]);

  // Toggle lesson hours selection
  const handleToggleHour = (hour: number) => {
    setSelectedHours(prev => 
      prev.includes(hour) 
        ? prev.filter(h => h !== hour) 
        : [...prev, hour].sort((a, b) => a - b)
    );
  };

  // Form submit handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedHours.length === 0) {
      triggerToast('Pilih minimal satu jam pelajaran!', 'info');
      return;
    }
    if (!materi.trim()) {
      triggerToast('Materi pelajaran wajib diisi!', 'info');
      return;
    }

    const payload: Omit<JurnalHarianRecord, 'id'> & { id?: string } = {
      tanggal: currentDate,
      kelas: activeClassName,
      jamPelajaran: selectedHours,
      materi: materi.trim(),
      catatan: catatan.trim(),
      hambatan: hambatan.trim(),
      solusi: solusi.trim(),
      keaktifan,
      adaTugas,
      deskripsiTugas: adaTugas ? deskripsiTugas.trim() : '',
      tidakHadirSnapshot: absentStudents,
      catatanSiswaSnapshot: dayNotes.map(n => ({
        nis: n.nis,
        nama: n.nama,
        tipe: n.tipe,
        catatan: n.catatan,
        jamPembelajaran: n.jamPembelajaran
      })),
      templateId: appliedTemplateId || existingJournal?.templateId || undefined,
      mingguKe: appliedMingguKe !== null ? appliedMingguKe : (existingJournal?.mingguKe !== undefined ? existingJournal.mingguKe : undefined),
      tujuanPembelajaran: appliedTP || existingJournal?.tujuanPembelajaran || undefined,
      id: editingId || undefined
    };

    onSaveJournal(payload);
    triggerToast(
      editingId 
        ? 'Jurnal harian berhasil diperbarui!' 
        : 'Jurnal harian baru berhasil ditambahkan!', 
      'success'
    );

    // Reset form & editing state after submit
    setEditingId(null);
    setMateri('');
    setCatatan('');
    setHambatan('');
    setSolusi('');
    setKeaktifan(4);
    setAdaTugas(false);
    setDeskripsiTugas('');
  };

  // Copy Journal as Structured WhatsApp/Share Text
  const handleCopyShareText = (j: JurnalHarianRecord) => {
    const formattedDate = new Date(j.tanggal).toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const jamStr = j.jamPelajaran.join(', ');
    const absentListStr = j.tidakHadirSnapshot && j.tidakHadirSnapshot.length > 0
      ? j.tidakHadirSnapshot.map(s => `${s.nama} (${s.status})`).join(', ')
      : 'Nihil / Semua Hadir';

    const noteSnapshot = j.catatanSiswaSnapshot || (notes ? notes.filter(n => n.tanggal === j.tanggal && n.kelas === j.kelas) : []);
    const notesListStr = noteSnapshot && noteSnapshot.length > 0
      ? noteSnapshot.map(n => `• ${n.nama} (${n.tipe === 'aktif' ? '🌟 Aktif' : '⚠️ Bermasalah'}): "${n.catatan}" [${stripClockFromJamString(n.jamPembelajaran)}]`).join('\n')
      : 'Nihil / Tidak ada catatan khusus';

    const keaktifanStars = '⭐'.repeat(j.keaktifan || 4);

    const shareText = `*JURNAL HARIAN GURU*
-----------------------------
📅 *Tanggal:* ${formattedDate}
🏫 *Kelas:* ${j.kelas}
⏰ *Jam Pelajaran ke:* [ ${jamStr} ]
📚 *Materi Pembelajaran:* ${j.materi}

📝 *Catatan Kelas:*
"${j.catatan || 'Kondusif dan lancar.'}"

⚠️ *Hambatan / Kendala:* ${j.hambatan || '-'}
💡 *Solusi / Tindak Lanjut:* ${j.solusi || '-'}
📊 *Keaktifan Kelas:* ${keaktifanStars}

👥 *Siswa Tidak Hadir (Sakit/Izin/Alfa):*
👉 ${absentListStr}

🏷️ *Catatan Khusus Siswa (Prestasi / Kendala):*
${notesListStr}
${j.adaTugas ? `\n📌 *Tugas Rumah (PR):* ${j.deskripsiTugas}` : ''}
-----------------------------
_Di-generate otomatis dari Sistem Absensi & Jurnal Guru_`;

    navigator.clipboard.writeText(shareText);
    triggerToast('Jurnal berhasil disalin dalam format WA!', 'success');
  };

  // Filter journals list with deterministic chronological tie-breaking
  const filteredJournalsList = useMemo(() => {
    return journals
      .filter(j => j.kelas === activeClassName)
      .filter(j => {
        if (!searchTerm) return true;
        const q = searchTerm.toLowerCase();
        const meta = classJournalTimeline.metaByJournalKey.get(j.id || '');
        const weekMatch = meta ? `minggu ${meta.sequentialWeek}`.includes(q) : false;
        return (
          j.materi.toLowerCase().includes(q) ||
          (j.catatan && j.catatan.toLowerCase().includes(q)) ||
          j.tanggal.includes(searchTerm) ||
          weekMatch
        );
      })
      .sort((a, b) => {
        const dateDiff = (a.tanggal || '').localeCompare(b.tanggal || '');
        if (dateDiff !== 0) {
          return sortOrder === 'desc' ? -dateDiff : dateDiff;
        }
        const minHourA = Array.isArray(a.jamPelajaran) && a.jamPelajaran.length > 0 ? Math.min(...a.jamPelajaran) : 0;
        const minHourB = Array.isArray(b.jamPelajaran) && b.jamPelajaran.length > 0 ? Math.min(...b.jamPelajaran) : 0;
        if (minHourA !== minHourB) {
          return sortOrder === 'desc' ? minHourB - minHourA : minHourA - minHourB;
        }
        const idDiff = (a.id || '').localeCompare(b.id || '');
        return sortOrder === 'desc' ? -idDiff : idDiff;
      });
  }, [journals, activeClassName, searchTerm, sortOrder, classJournalTimeline.metaByJournalKey]);

  return (
    <div className="space-y-6" id="journal-tab-section">
      {/* Heading block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-600" />
            Jurnal Harian Guru
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Catat materi pembelajaran, jam tatap muka, dan sinkronkan dengan database absen harian.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Bank Template Materi Mingguan Trigger Button */}
          <button
            type="button"
            id="btn-bank-materi-mingguan"
            onClick={() => setIsTemplateModalOpen(true)}
            className="group relative inline-flex items-center gap-2.5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-indigo-800 hover:from-indigo-700 hover:to-indigo-900 active:scale-[0.98] text-white px-4 py-2.5 rounded-2xl text-xs font-black shadow-md shadow-indigo-200 hover:shadow-lg hover:shadow-indigo-300 transition-all duration-200 border border-indigo-400/30 cursor-pointer"
          >
            <div className="p-1 bg-white/15 rounded-lg group-hover:rotate-12 transition-transform duration-200">
              <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
            </div>
            <div className="flex items-center gap-1.5">
              <span>📚 Bank Materi Mingguan</span>
              <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full shadow-2xs">
                {weeklyTemplates.length} Modul
              </span>
            </div>
          </button>

          {/* Syncing/Status Indicator */}
          {isSyncing && (
            <div className="bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-xl px-3 py-1.5 flex items-center gap-2 text-xs font-bold animate-pulse">
              <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
              Menyinkronkan ke Sheets...
            </div>
          )}
        </div>
      </div>

      {/* Floating local toast */}
      {showToast && (
        <div className={`fixed bottom-20 md:bottom-5 left-3 right-3 sm:left-auto sm:right-5 z-50 px-4 py-3 rounded-xl shadow-lg border text-xs font-bold transition flex items-center gap-2 ${
          showToast.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-100' 
            : 'bg-indigo-50 text-indigo-800 border-indigo-100'
        }`}>
          {showToast.type === 'success' ? <Check className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-indigo-600 shrink-0" />}
          <span>{showToast.message}</span>
        </div>
      )}

      {/* Missing / Unfilled Past & Today Scheduled Journal Warning */}
      {missingJournalDates.length > 0 ? (
        <div className="border border-amber-300/80 bg-gradient-to-r from-amber-50/90 via-orange-50/70 to-amber-50/90 rounded-2xl p-4 sm:p-5 shadow-xs animate-in fade-in slide-in-from-top-3 duration-300">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-amber-100/90 text-amber-800 rounded-xl shrink-0 mt-0.5 shadow-2xs">
              <AlertTriangle className="w-5 h-5 text-amber-700 animate-pulse" />
            </div>
            <div className="space-y-3 flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-amber-950 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping shrink-0" />
                    Peringatan: Terdapat {missingJournalDates.length} Tanggal Jadwal Belajar Belum Memiliki Jurnal
                  </h4>
                  <p className="text-xs text-amber-900/90 leading-relaxed font-medium mt-1">
                    Berdasarkan jadwal belajar kelas <span className="font-extrabold text-amber-950">{activeClassName}</span>
                    {classSchedule?.tanggalMulaiSemester || classSchedule?.tanggalSelesaiSemester ? (
                      <span className="ml-1 text-[11px] font-bold text-amber-800 bg-amber-200/60 px-2 py-0.5 rounded-md border border-amber-300/60">
                        Rentang Semester: {classSchedule.tanggalMulaiSemester || 'Awal'} s.d. {classSchedule.tanggalSelesaiSemester || 'Akhir'}
                      </span>
                    ) : null}
                    , tanggal-tanggal berikut tidak ditandai libur/kegiatan tetapi belum memiliki catatan jurnal harian:
                  </p>
                </div>
                <span className="text-[10px] sm:text-[11px] font-black text-amber-900 bg-amber-200/80 border border-amber-300 px-2.5 py-1 rounded-lg shrink-0 self-start sm:self-auto shadow-2xs">
                  {missingJournalDates.length} Tanggal Belum Diisi
                </span>
              </div>

              {/* List of Missing Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5 pt-1">
                {(showAllMissingDates ? missingJournalDates : missingJournalDates.slice(0, 3)).map((item) => (
                  <div
                    key={`missing_${item.tanggal}`}
                    className={`p-3 rounded-xl border transition-all flex flex-col justify-between gap-2.5 shadow-2xs ${
                      currentDate === item.tanggal
                        ? 'bg-amber-100/90 border-amber-400 ring-2 ring-amber-400/50'
                        : 'bg-white/95 border-amber-200/90 hover:border-amber-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1.5 mb-1">
                        <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          {item.formattedDate}
                        </span>
                        {item.isToday && (
                          <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200 shrink-0">
                            Hari Ini
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        {item.isScheduled && (
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-150 px-1.5 py-0.5 rounded">
                            Jadwal {item.dayName}
                          </span>
                        )}
                        {item.hasAttendance && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-150 px-1.5 py-0.5 rounded">
                            Ada Presensi Siswa
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 w-full mt-1">
                      <button
                        type="button"
                        onClick={() => {
                          handleDateChange(item.tanggal);
                          triggerToast(`Beralih ke tanggal ${item.formattedDate}. Silakan lengkapi materi jurnal.`, 'info');
                          const targetEl = document.querySelector('input[placeholder*="Misal: Penerapan Formula Lanjutan Excel"]');
                          if (targetEl) {
                            (targetEl as HTMLInputElement).focus();
                            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }}
                        className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition shadow-2xs ${
                          currentDate === item.tanggal
                            ? 'bg-amber-600 text-white'
                            : 'bg-amber-500 hover:bg-amber-600 text-white'
                        }`}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        {currentDate === item.tanggal ? 'Sedang Dipilih' : 'Isi Jurnal'}
                      </button>

                      {onSaveDateNote && (
                        <button
                          type="button"
                          onClick={() => openDateNoteModal(item.tanggal, 'Kegiatan Khusus Kelas / Bukan KBM')}
                          title="Tandai tanggal ini libur/kegiatan khusus kelas agar tidak muncul di daftar peringatan"
                          className="py-1.5 px-2.5 rounded-lg text-xs font-bold border border-amber-300 bg-white hover:bg-amber-100 text-amber-900 transition flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs"
                        >
                          <CalendarX className="w-3.5 h-3.5 text-amber-700" />
                          <span>Bukan KBM</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Show more toggle if > 3 */}
              {missingJournalDates.length > 3 && (
                <div className="flex justify-between items-center pt-1 border-t border-amber-200/60">
                  <button
                    type="button"
                    onClick={() => setShowAllMissingDates(prev => !prev)}
                    className="text-xs font-extrabold text-amber-800 hover:text-amber-950 flex items-center gap-1 cursor-pointer transition"
                  >
                    {showAllMissingDates ? (
                      <>
                        <ChevronUp className="w-4 h-4" /> Ciutkan Tampilan
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" /> Tampilkan Semua ({missingJournalDates.length} Tanggal)
                      </>
                    )}
                  </button>
                  <span className="text-[11px] text-amber-800/80 italic font-medium">
                    Menampilkan {showAllMissingDates ? missingJournalDates.length : Math.min(3, missingJournalDates.length)} dari {missingJournalDates.length} tanggal
                  </span>
                </div>
              )}

              {/* Helpful Tip about Date Notes */}
              <div className="flex items-start gap-2 bg-amber-100/60 border border-amber-200/70 p-2.5 rounded-xl text-[11px] text-amber-900 leading-normal font-medium">
                <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-extrabold">Catatan Petunjuk:</span> Jika hanya kelas <span className="font-extrabold">{activeClassName}</span> atau beberapa kelas tertentu yang sedang tidak belajar (misal: kegiatan khusus, upacara, atau libur), klik tombol <span className="font-bold underline">Bukan KBM</span> atau <span className="font-bold underline">Tandai Libur / Kegiatan</span>. Penanda hanya berlaku untuk kelas yang dipilih tanpa mengganggu kelas lain di hari yang sama.
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : isTodayScheduled && !isTodayMarked && isTodayJournalFilled ? (
        <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3.5 shadow-xs animate-in fade-in slide-in-from-top-3 duration-300">
          <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl shrink-0 mt-0.5">
            <Check className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="space-y-1 flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h4 className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                Disiplin Administrasi Terpenuhi
              </h4>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-200 uppercase tracking-wider shrink-0">
                Lengkap &amp; Tertib
              </span>
            </div>
            <p className="text-[11px] text-emerald-800 leading-relaxed font-medium font-sans">
              Luar biasa! Jurnal harian untuk hari ini (<span className="font-extrabold">{new Date(todayStr + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>) di kelas <span className="font-extrabold">{activeClassName}</span> telah berhasil dicatat dengan rapi dan disinkronkan ke database.
            </p>
          </div>
        </div>
      ) : isTodayScheduled && isTodayMarked && !isTodayJournalFilled ? (
        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 shadow-xs animate-in fade-in slide-in-from-top-3 duration-300">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl shrink-0 mt-0.5">
              <CalendarOff className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-xs font-black text-amber-950">
                  Hari Ini Ditandai Tidak Belajar / Kegiatan ({activeClassName})
                </h4>
                {todayDateNote && (!todayDateNote.kelas || todayDateNote.kelas === 'all') ? (
                  <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 border border-indigo-200 px-2 py-0.5 rounded-md">
                    🌐 Semua Kelas
                  </span>
                ) : (
                  <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-md">
                    🎯 Khusus Kelas: {activeClassName}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-amber-900 leading-relaxed font-medium">
                Alasan: <span className="font-extrabold">"{todayDateNote?.alasan || dateNotesMap.get(todayStr)}"</span>. Peringatan absen &amp; jurnal belum diisi untuk {activeClassName} hari ini dinonaktifkan, sedangkan kelas lain di hari yang sama tetap berjalan normal.
              </p>
            </div>
          </div>
          {onSaveDateNote && (
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <button
                type="button"
                onClick={() => openDateNoteModal(todayStr)}
                className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Penanda</span>
              </button>
              {onDeleteDateNote && (
                <button
                  type="button"
                  onClick={() => onDeleteDateNote(todayStr, false)}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Kembalikan KBM</span>
                </button>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* Main Grid: Form Entry on left/top, absent list + summary on right/bottom */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Columns: Input Form */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800">
                    {editingId ? 'Edit Jurnal Pembelajaran' : 'Buat Jurnal Pembelajaran Baru'}
                  </h3>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 font-bold">Pilih Tanggal:</span>
                      <input
                        type="date"
                        value={currentDate}
                        onChange={(e) => handleDateChange(e.target.value)}
                        className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 text-indigo-900 font-extrabold text-[11px] rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer transition shadow-2xs"
                      />
                      {isCurrentDateScheduled && (
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 bg-blue-100 text-blue-800 border border-blue-200 rounded-md flex items-center gap-1">
                          <CalendarCheck className="w-3 h-3 text-blue-600" />
                          Jadwal Belajar
                        </span>
                      )}
                    </div>
                    {classes && onClassChange && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400 font-bold">Pilih Kelas:</span>
                        <select
                          value={selectedClassId}
                          onChange={(e) => onClassChange?.(Number(e.target.value))}
                          className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 text-indigo-900 font-extrabold text-[11px] rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer transition shadow-2xs"
                        >
                          {classes.map((c) => (
                            <option key={`cls_top_${c.id}`} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setSelectedHours([]);
                    setMateri('');
                    setCatatan('');
                    setHambatan('');
                    setSolusi('');
                    setKeaktifan(4);
                    setAdaTugas(false);
                    setDeskripsiTugas('');
                    triggerToast('Formulir di-reset ke jurnal baru.', 'info');
                  }}
                  className="text-xs text-rose-500 hover:text-rose-600 font-bold flex items-center gap-1 cursor-pointer transition"
                >
                  <ListRestart className="w-3.5 h-3.5" />
                  Reset ke Jurnal Baru
                </button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Dedicated Date Selector Section with Quick Shortcuts */}
              <div className="space-y-3 bg-indigo-50/50 border border-indigo-100/80 p-4 rounded-2xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-xs font-extrabold text-indigo-950 flex items-center gap-1.5">
                    <CalendarDays className="w-4 h-4 text-indigo-600" />
                    Tanggal Pelaksanaan KBM / Jurnal <span className="text-rose-500">*</span>
                  </label>
                  
                  {/* Status Badge for Date */}
                  <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border shadow-2xs ${
                    currentDate === todayStr
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : currentDate < todayStr
                      ? 'bg-amber-100 text-amber-900 border-amber-200'
                      : 'bg-blue-100 text-blue-800 border-blue-200'
                  }`}>
                    {currentDate === todayStr 
                      ? '📅 Hari Ini' 
                      : currentDate < todayStr 
                      ? '⏳ Jurnal Susulan / Tanggal Lampau' 
                      : '🔮 Jurnal Tanggal Mendatang'}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  {/* Native Date Input */}
                  <div className="relative flex-1">
                    <input
                      type="date"
                      value={currentDate}
                      onChange={(e) => handleDateChange(e.target.value)}
                      className="w-full bg-white hover:bg-slate-50 border border-indigo-200 text-indigo-950 font-black text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer transition shadow-xs"
                      required
                    />
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleDateChange(todayStr)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold cursor-pointer transition border ${
                        currentDate === todayStr
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                          : 'bg-white hover:bg-indigo-50 text-indigo-800 border-indigo-200'
                      }`}
                    >
                      Hari Ini
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDateChange(yesterdayStr)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold cursor-pointer transition border ${
                        currentDate === yesterdayStr
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                          : 'bg-white hover:bg-indigo-50 text-indigo-800 border-indigo-200'
                      }`}
                    >
                      Kemarin
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDateChange(twoDaysAgoStr)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold cursor-pointer transition border ${
                        currentDate === twoDaysAgoStr
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                          : 'bg-white hover:bg-indigo-50 text-indigo-800 border-indigo-200'
                      }`}
                    >
                      2 Hari Lalu
                    </button>

                    {onSaveDateNote && (
                      <button
                        type="button"
                        onClick={() => openDateNoteModal(currentDate)}
                        className={`px-3 py-2 rounded-xl text-xs font-extrabold cursor-pointer transition border flex items-center gap-1.5 shadow-2xs ${
                          currentDateNote
                            ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600'
                            : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                        }`}
                        title={`Tandai tanggal ${currentDate} libur / kegiatan khusus untuk kelas ${activeClassName}`}
                      >
                        <CalendarX className="w-3.5 h-3.5 shrink-0" />
                        <span>{currentDateNote ? 'Edit Penanda Libur' : 'Tandai Libur / Kegiatan'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Backdated Banner if currentDate < todayStr */}
                {currentDate < todayStr && (
                  <div className="text-[11px] font-medium text-amber-900 bg-amber-50/90 border border-amber-200/80 rounded-xl p-2.5 flex items-start gap-2">
                    <Calendar className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Pengisian Jurnal Susulan:</p>
                      <p className="text-[10px] text-amber-900/80">
                        Anda sedang mencatat jurnal harian untuk tanggal <span className="font-extrabold">{new Date(currentDate + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>. Absensi &amp; catatan siswa pada tanggal tersebut akan otomatis dimasukkan.
                      </p>
                    </div>
                  </div>
                )}

                {/* Active Roster / Schedule Info for Selected Date */}
                {isCurrentDateScheduled && currentDateScheduleInfo && (
                  <div className="text-[11px] font-medium text-blue-900 bg-blue-50/90 border border-blue-200/80 rounded-xl p-2.5 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <CalendarCheck className="w-4 h-4 text-blue-600 shrink-0" />
                      <div>
                        <span className="font-extrabold">Jadwal Belajar Aktif Tanggal Ini:</span> Hari {getDayOfWeekFromDate(currentDate)}
                        {currentDateScheduleInfo.jamPelajaran ? ` • Jam ${currentDateScheduleInfo.jamPelajaran}` : ''}
                        {currentDateScheduleInfo.ruang ? ` • Ruang ${currentDateScheduleInfo.ruang}` : ''}
                      </div>
                    </div>
                    {currentDateScheduleInfo.isVersioned && (
                      <span className="text-[10px] font-extrabold bg-blue-200/80 text-blue-900 border border-blue-300 px-2.5 py-0.5 rounded-md shadow-2xs">
                        🎯 {currentDateScheduleInfo.versionName}
                      </span>
                    )}
                  </div>
                )}

                {/* Existing Journal Protection Badge */}
                {existingJournal && (
                  <div className="text-[11px] font-medium text-emerald-900 bg-emerald-50/90 border border-emerald-200/90 rounded-xl p-2.5 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <span className="font-extrabold text-emerald-950">Jurnal Sah &amp; Tersimpan:</span> Tanggal ini memiliki catatan jurnal pembelajaran yang aktif dan terlindungi dari perubahan jadwal baru.
                      </div>
                    </div>
                    <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-md">
                      ✅ Terverifikasi
                    </span>
                  </div>
                )}

                {/* Date Note / Marked Reason Indicator */}
                {currentDateNote && (
                  <div className="text-[11px] font-medium text-amber-950 bg-amber-100/80 border border-amber-300 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <CalendarOff className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-black text-amber-950">
                            Kelas {activeClassName} Ditandai Tidak Belajar / Kegiatan
                          </p>
                          {(!currentDateNote.kelas || currentDateNote.kelas === 'all') ? (
                            <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 border border-indigo-200 px-2 py-0.5 rounded-md">
                              🌐 Semua Kelas
                            </span>
                          ) : (
                            <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-md">
                              🎯 Khusus Kelas: {activeClassName}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-amber-900 leading-snug">
                          Alasan: <strong className="font-extrabold">"{currentDateNote.alasan}"</strong>.{' '}
                          {(!currentDateNote.kelas || currentDateNote.kelas === 'all')
                            ? 'Tanggal ini ditandai untuk semua kelas dan dikecualikan dari peringatan jurnal belum diisi. Anda tetap dapat mengisi jurnal jika ada KBM pengganti.'
                            : `Hanya ${activeClassName} yang dikecualikan dari peringatan jurnal & absensi. Kelas lain di hari yang sama tetap normal.`}
                        </p>
                      </div>
                    </div>

                    {onSaveDateNote && (
                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => openDateNoteModal(currentDate)}
                          className="px-2.5 py-1.5 bg-white hover:bg-amber-50 text-amber-900 border border-amber-300 rounded-lg text-[11px] font-extrabold transition flex items-center gap-1 cursor-pointer shadow-2xs"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit Penanda</span>
                        </button>
                        {onDeleteDateNote && (
                          <button
                            type="button"
                            onClick={() => onDeleteDateNote(currentDate, false)}
                            className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white border border-rose-600 rounded-lg text-[11px] font-extrabold transition flex items-center gap-1 cursor-pointer shadow-2xs"
                            title={`Kembalikan ${activeClassName} ke hari KBM normal`}
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Kembalikan ke KBM Normal</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* Jam Pelajaran Multi-selector */}
              <div className="space-y-3 bg-slate-50/50 border border-slate-100 p-4 rounded-2xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <label className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-500" />
                    Jam Pelajaran Ke- <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {currentDateScheduleInfo?.jamPelajaran && (
                      <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-indigo-600" />
                        <span>Jadwal Terdaftar: {currentDateScheduleInfo.jamPelajaran}</span>
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 font-medium italic">
                      (Pilih kombinasi beberapa jam pelajaran secara bebas)
                    </span>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Pilihan Kombinasi Cepat:</span>
                    {currentDateScheduleInfo?.jamPelajaran && parseLessonHoursFromString(currentDateScheduleInfo.jamPelajaran).length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const hours = parseLessonHoursFromString(currentDateScheduleInfo.jamPelajaran);
                          if (hours.length > 0) {
                            setSelectedHours(hours);
                            triggerToast(`Jam pelajaran disinkronkan ke jadwal: ${currentDateScheduleInfo.jamPelajaran}`, 'success');
                          }
                        }}
                        className="text-[10px] font-extrabold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer transition hover:underline"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Sinkronkan Ulang dari Jadwal ({currentDateScheduleInfo.jamPelajaran})</span>
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {/* If schedule has a specific preset that isn't standard, offer a 1-click button for it */}
                    {currentDateScheduleInfo?.jamPelajaran && (() => {
                      const schedHours = parseLessonHoursFromString(currentDateScheduleInfo.jamPelajaran);
                      if (schedHours.length === 0) return null;
                      const isSchedSelected = schedHours.every(h => selectedHours.includes(h)) && schedHours.length === selectedHours.length;
                      return (
                        <button
                          type="button"
                          onClick={() => setSelectedHours(schedHours)}
                          className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black cursor-pointer transition border flex items-center gap-1.5 ${
                            isSchedSelected
                              ? 'bg-indigo-600 border-indigo-700 text-white shadow-xs'
                              : 'bg-indigo-50 hover:bg-indigo-100 border-indigo-300 text-indigo-800'
                          }`}
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Sesuai Jadwal ({currentDateScheduleInfo.jamPelajaran})</span>
                        </button>
                      );
                    })()}
                    {[
                      { label: 'Jam 1 - 2', hours: [1, 2] },
                      { label: 'Jam 2 - 3', hours: [2, 3] },
                      { label: 'Jam 3 - 4', hours: [3, 4] },
                      { label: 'Jam 4 - 5', hours: [4, 5] },
                      { label: 'Jam 5 - 6', hours: [5, 6] },
                      { label: 'Jam 6 - 7', hours: [6, 7] },
                    ].map((preset) => {
                      const isPresetSelected = preset.hours.every(h => selectedHours.includes(h)) && preset.hours.length === selectedHours.length;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            setSelectedHours(preset.hours);
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold cursor-pointer transition border ${
                            isPresetSelected
                              ? 'bg-indigo-600 border-indigo-700 text-white shadow-xs'
                              : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                    {selectedHours.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedHours([])}
                        className="px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold cursor-pointer transition border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600"
                      >
                        Hapus Pilihan
                      </button>
                    )}
                  </div>
                </div>

                {/* Individual Toggle Toggles */}
                <div className="space-y-1.5">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Pilih Satu per Satu (Dapat Pilih Bebas):</span>
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                    {LESSON_HOURS.map(hour => {
                      const isSelected = selectedHours.includes(hour);
                      return (
                        <button
                          key={hour}
                          type="button"
                          onClick={() => handleToggleHour(hour)}
                          className={`py-1.5 rounded-xl text-xs font-black cursor-pointer transition border flex flex-col items-center justify-center gap-0.5 ${
                            isSelected
                              ? 'bg-indigo-600 border-indigo-700 text-white shadow-xs'
                              : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-600 shadow-2xs'
                          }`}
                        >
                          <span className="text-[8px] opacity-75 font-extrabold uppercase">Jam</span>
                          <span className="text-xs font-black">{hour}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Summary of Selected Hours */}
                {selectedHours.length > 0 && (
                  <div className="text-[10px] font-bold text-indigo-700 bg-indigo-50/70 border border-indigo-100/60 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse shrink-0" />
                      <span>Kombinasi Terpilih:</span>
                    </div>
                    <span className="font-extrabold bg-white px-2 py-0.5 rounded-md border border-indigo-150 text-indigo-800">
                      {selectedHours.map(h => `Jam ${h}`).join(', ')}
                    </span>
                  </div>
                )}
              </div>

              {/* Materi Pelajaran with Quick Template Bank Integration */}
              <div className="space-y-2">
                {/* Quick Template Selector Banner */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-indigo-50/80 border border-indigo-200/80 p-2.5 rounded-2xl">
                  <div className="flex items-center gap-2">
                    <div className="p-1 bg-indigo-600 text-amber-300 rounded-lg shrink-0">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-[11px] font-extrabold text-indigo-950">
                      ⚡ Pilih Cepat dari Bank Template:
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-1 sm:justify-end">
                    <select
                      onChange={(e) => {
                        const selectedTpl = sortedWeeklyTemplates.find(t => t.id === e.target.value);
                        if (selectedTpl) {
                          handleApplyTemplate(selectedTpl);
                          e.target.value = '';
                        }
                      }}
                      defaultValue=""
                      className="bg-white border border-indigo-200 text-indigo-900 text-xs font-bold rounded-xl px-2.5 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none flex-1 max-w-full sm:max-w-xs truncate cursor-pointer shadow-2xs"
                    >
                      <option value="" disabled>-- Pilih Minggu / Materi --</option>
                      {sortedWeeklyTemplates.map((t) => {
                        const usedCount = classJournalTimeline.classList.filter(
                          j =>
                            j.templateId === t.id ||
                            (j.materi || '').trim().toLowerCase() === (t.topikMateri || '').trim().toLowerCase()
                        ).length;
                        return (
                          <option key={t.id} value={t.id}>
                            {t.labelMinggu || `Minggu ${t.mingguKe}`}: {t.topikMateri}
                            {usedCount > 0 ? ` (Sudah dipakai ${usedCount}x)` : ''}
                          </option>
                        );
                      })}
                    </select>

                    <button
                      type="button"
                      onClick={() => setIsTemplateModalOpen(true)}
                      className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black shrink-0 flex items-center gap-1 shadow-2xs cursor-pointer transition"
                      title="Buka Bank Template Lengkap"
                    >
                      <BookMarked className="w-3 h-3 text-amber-300" />
                      <span className="hidden sm:inline">Bank Lengkap</span>
                    </button>
                  </div>
                </div>

                {/* Active Sequential Week & Template Info Pill */}
                {(appliedTemplateId || appliedMingguKe !== null) && (() => {
                  const activeTpl = appliedTemplateId ? weeklyTemplateById.get(appliedTemplateId) : undefined;
                  const displayWeek = appliedMingguKe ?? suggestedSequentialWeekForCurrentDate;
                  const priorUses = activeTpl
                    ? classJournalTimeline.classList.filter(
                        j =>
                          j.tanggal !== currentDate &&
                          (j.templateId === activeTpl.id ||
                            (j.materi || '').trim().toLowerCase() === (activeTpl.topikMateri || '').trim().toLowerCase())
                      ).length
                    : 0;
                  return (
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-indigo-50/40 border border-indigo-200/70 rounded-xl px-3 py-2 text-[11px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-indigo-900 bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-md">
                          Urutan Jurnal Kelas: Minggu ke-{displayWeek}
                        </span>
                        {activeTpl && (
                          <span className="text-indigo-800 font-semibold">
                            📚 Sumber: <strong>{activeTpl.labelMinggu || `Minggu ${activeTpl.mingguKe}`}</strong>
                            {priorUses > 0 && (
                              <span className="ml-1.5 text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-200 px-1.5 py-0.5 rounded">
                                Penggunaan ke-{priorUses + 1} di {activeClassName}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 font-medium">
                        Otomatis diurutkan Minggu 1 → seterusnya
                      </span>
                    </div>
                  );
                })()}

                <label className="text-xs font-extrabold text-slate-700 flex items-center justify-between pt-1">
                  <span>Materi Pembelajaran <span className="text-rose-500">*</span></span>
                  <span className="text-[10px] text-slate-400 font-normal italic">Isi materi pokok atau topik yang diajarkan</span>
                </label>
                <input
                  type="text"
                  placeholder="Misal: Penerapan Formula Lanjutan Excel HLOOKUP & VLOOKUP"
                  value={materi}
                  onChange={(e) => setMateri(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 transition"
                  required
                />
              </div>

              {/* Catatan Kegiatan Pembelajaran */}
              <div className="space-y-2">
                <label className="text-xs font-extrabold text-slate-700">
                  Catatan Pembelajaran / Perkembangan Kelas
                </label>
                <textarea
                  rows={3}
                  placeholder="Ceritakan proses KBM. Misal: Pembelajaran berjalan kondusif, 90% murid memahami konsep dasar, kelompok 3 sangat aktif saat sesi tanya jawab."
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 transition resize-none leading-relaxed"
                />
              </div>

              {/* Rating Keaktifan Kelas (Teacher Assistive Star Meter) */}
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                    <ThumbsUp className="w-3.5 h-3.5 text-amber-500" />
                    Tingkat Keaktifan Kelas
                  </span>
                  <p className="text-[10px] text-slate-400">Seberapa interaktif dan responsif kelas dalam menyerap materi hari ini?</p>
                </div>

                <div className="flex gap-1.5 items-center">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setKeaktifan(star)}
                      className="cursor-pointer transition duration-150 transform hover:scale-115 text-lg p-1"
                    >
                      {star <= keaktifan ? '⭐' : '☆'}
                    </button>
                  ))}
                  <span className="text-[10px] font-black text-indigo-700 ml-1">
                    {keaktifan === 5 ? 'Sangat Aktif 🚀' : keaktifan === 4 ? 'Aktif 👍' : keaktifan === 3 ? 'Cukup 🆗' : keaktifan === 2 ? 'Pasif 💤' : 'Sangat Pasif 🔇'}
                  </span>
                </div>
              </div>

              {/* Homework/Tugas Panel */}
              <div className="p-4 bg-indigo-50/40 border border-indigo-100/60 rounded-2xl space-y-3.5">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={adaTugas}
                    onChange={(e) => setAdaTugas(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="space-y-0.5">
                    <span className="text-xs font-extrabold text-indigo-950 block">Berikan Tugas Mandiri / Pekerjaan Rumah (PR)</span>
                    <span className="text-[10px] text-indigo-600/80 block leading-relaxed">Aktifkan jika ada tugas evaluasi yang diberikan kepada murid hari ini.</span>
                  </div>
                </label>

                {adaTugas && (
                  <div className="animate-in fade-in slide-in-from-top-1.5 duration-200">
                    <input
                      type="text"
                      placeholder="Contoh: Membuat rancangan diagram folder komputer di halaman 24 buku TIK"
                      value={deskripsiTugas}
                      onChange={(e) => setDeskripsiTugas(e.target.value)}
                      className="w-full bg-white border border-indigo-100 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 transition"
                      required
                    />
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <div className="flex justify-end pt-3">
                <button
                  type="submit"
                  className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs px-5 py-3 rounded-xl transition duration-150 flex items-center justify-center gap-2 cursor-pointer shadow-sm shadow-indigo-100"
                >
                  <Check className="w-4 h-4" />
                  {editingId ? 'Simpan Perubahan Jurnal' : 'Simpan Jurnal Harian'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: Attendance Synced Box + Share Section */}
        <div className="space-y-6">
          
          {/* Box 1: Absent Students List (PULLED FROM DATABASE AUTOMATICALLY) */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="space-y-1">
              <h3 className="text-xs font-black text-slate-800 flex items-center gap-2">
                <UserX className="w-4 h-4 text-rose-500" />
                Data Absensi Sinkronis
              </h3>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Menghubungkan otomatis dari database Absensi Harian kelas <span className="font-extrabold text-indigo-700">{activeClassName}</span>.
              </p>
            </div>

            {/* List of absent students */}
            <div className="space-y-2">
              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">
                Siswa Tidak Hadir Hari Ini:
              </span>

              {absentStudents.length > 0 ? (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {absentStudents.map((s, idx) => (
                    <div 
                      key={s.nis ? `absent_${s.nis}_${s.status}` : `absent_${idx}`} 
                      className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/40 transition-all duration-200 hover:bg-white hover:border-slate-300 hover:shadow-xs hover:-translate-y-0.5"
                    >
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-slate-800 block truncate max-w-[130px] sm:max-w-[180px]">
                          {s.nama}
                        </span>
                        <span className="text-[9px] text-slate-400 block">NIS: {s.nis}</span>
                      </div>

                      <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black tracking-wider ${
                        s.status === 'Alfa' 
                          ? 'bg-rose-50 border border-rose-100 text-rose-700' 
                          : s.status === 'Izin'
                            ? 'bg-amber-50 border border-amber-100 text-amber-700'
                            : 'bg-indigo-50 border border-indigo-100 text-indigo-700'
                      }`}>
                        {s.status.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-2xl border border-dashed border-slate-100 bg-slate-50/50 flex flex-col items-center justify-center text-center space-y-1.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm">
                    ✨
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-xs font-extrabold text-emerald-700 block">Semua Siswa Hadir!</span>
                    <span className="text-[9px] text-slate-400 block leading-relaxed">Nihil ketidakhadiran di database absensi harian kelas ini.</span>
                  </div>
                </div>
              )}
            </div>

            {/* Hint Box */}
            <div className="p-3 bg-indigo-50/30 border border-indigo-100/40 rounded-2xl text-[10px] text-indigo-700 leading-relaxed flex gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                Jika ada kekeliruan data ketidakhadiran, harap perbarui status di menu <strong>Absensi Harian</strong> terlebih dahulu agar otomatis tersinkron ke sini.
              </span>
            </div>
          </div>

          {/* Box 1.5: Student Notes List (PULLED FROM DATABASE AUTOMATICALLY) */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="space-y-1">
              <h3 className="text-xs font-black text-slate-800 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-amber-500" />
                Data Catatan Siswa Sinkronis
              </h3>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Menghubungkan otomatis dari database Catatan Siswa kelas <span className="font-extrabold text-indigo-700">{activeClassName}</span>.
              </p>
            </div>

            {/* List of student notes */}
            <div className="space-y-2">
              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">
                Catatan Siswa Hari Ini:
              </span>

              {dayNotes.length > 0 ? (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {dayNotes.map((n, idx) => (
                    <div 
                      key={n.id ? n.id : `daynote_${n.nis}_${idx}`} 
                      className="p-3 rounded-xl border border-slate-100 bg-slate-50/40 space-y-1.5 transition-all duration-200 hover:bg-white hover:border-slate-300 hover:shadow-xs hover:-translate-y-0.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-800 block truncate">
                          {n.nama}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black tracking-wider shrink-0 ${
                          n.tipe === 'bermasalah' 
                            ? 'bg-rose-50 border border-rose-100 text-rose-700' 
                            : 'bg-emerald-50 border border-emerald-100 text-emerald-700'
                        }`}>
                          {n.tipe === 'bermasalah' ? '⚠️ BERMASALAH' : '🌟 AKTIF / PRESTASI'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-600 leading-relaxed font-medium">
                        {n.catatan}
                      </p>
                      <div className="flex items-center justify-between text-[9px] text-slate-400 font-semibold pt-0.5 border-t border-slate-100/80">
                        <span>NIS: {n.nis}</span>
                        <span>{stripClockFromJamString(n.jamPembelajaran)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-2xl border border-dashed border-slate-100 bg-slate-50/50 flex flex-col items-center justify-center text-center space-y-1.5">
                  <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-sm">
                    📝
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-xs font-extrabold text-slate-600 block">Belum Ada Catatan Siswa</span>
                    <span className="text-[9px] text-slate-400 block leading-relaxed">Nihil catatan keaktifan atau kendala siswa untuk tanggal dan kelas ini.</span>
                  </div>
                </div>
              )}
            </div>

            {/* Hint Box */}
            <div className="p-3 bg-amber-50/30 border border-amber-100/40 rounded-2xl text-[10px] text-amber-800 leading-relaxed flex gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
              <span>
                Jika ada catatan perilaku atau keaktifan siswa, harap input di menu <strong>Catatan Siswa</strong> terlebih dahulu agar otomatis tersinkron ke sini.
              </span>
            </div>
          </div>

          {/* Box 2: Quick Recap and Copy format */}
          {journals.some(j => j.kelas === activeClassName) && (
            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="space-y-1">
                <h3 className="text-xs font-black text-slate-800 flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-emerald-500" />
                  Bagikan Laporan Harian
                </h3>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Salin rekapan materi pembelajaran dan ketidakhadiran secara instan ke grup chat atau koordinator kelas.
                </p>
              </div>

              {existingJournal ? (
                <div className="space-y-3">
                  <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 text-[10px] font-medium text-slate-600 leading-relaxed font-mono max-h-36 overflow-y-auto whitespace-pre-wrap select-all">
                    {`📅 Tanggal: ${new Date(existingJournal.tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })}
🏫 Kelas: ${existingJournal.kelas}
⏰ Jam: [ ${existingJournal.jamPelajaran.join(', ')} ]
📚 Materi: ${existingJournal.materi}
👥 Absen: ${absentStudents.length > 0 ? absentStudents.map(s => `${s.nama} (${s.status})`).join(', ') : 'Semua Hadir'}
🏷️ Catatan Siswa: ${dayNotes.length > 0 ? dayNotes.map(n => `${n.nama} (${n.tipe}): ${n.catatan}`).join(' | ') : 'Nihil'}`}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCopyShareText(existingJournal)}
                    className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-100/80 rounded-xl px-4 py-2.5 text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer transition"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Salin Format WhatsApp Laporan
                  </button>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 text-amber-700 border border-amber-100 text-[10px] leading-relaxed rounded-xl italic">
                  Isi dan simpan jurnal harian hari ini terlebih dahulu untuk menyalin ringkasan laporan grup chat.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Section: Timeline of Past Journals for this class */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="space-y-0.5">
            <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-indigo-500" />
              Riwayat Jurnal Pembelajaran
            </h3>
            <p className="text-[10px] text-slate-400">
              Daftar kegiatan tatap muka guru kelas {activeClassName} yang telah dicatat.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {classes && onClassChange && (
              <select
                value={selectedClassId}
                onChange={(e) => onClassChange?.(Number(e.target.value))}
                className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-1.5 text-xs font-extrabold text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-3xs"
              >
                {classes.map((c) => (
                  <option key={`cls_filter_${c.id}`} value={c.id}>
                    Kelas: {c.name}
                  </option>
                ))}
              </select>
            )}
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-extrabold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-3xs"
            >
              <option value="desc">Urutan: Terbaru (Minggu Akhir → 1)</option>
              <option value="asc">Urutan: Berurutan (Minggu 1 → Seterusnya)</option>
            </select>
            <input
              type="text"
              placeholder="Cari materi / tanggal..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 cursor-pointer w-full sm:w-48"
            />
          </div>
        </div>

        {filteredJournalsList.length > 0 ? (
          <div className="space-y-4">
            {filteredJournalsList.map((j, idx) => {
              const dateObj = new Date(j.tanggal);
              const formattedDate = isNaN(dateObj.getTime())
                ? j.tanggal
                : dateObj.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
              
              const isToday = j.tanggal === selectedDate;
              const timelineMeta = j.id
                ? classJournalTimeline.metaByJournalKey.get(j.id)
                : Array.from(classJournalTimeline.metaByJournalKey.entries()).find(([k]) =>
                    k.startsWith(`${j.tanggal}__${j.kelas}__`)
                  )?.[1];
              const displayWeek = timelineMeta?.sequentialWeek ?? j.mingguKe;
              const sourceTemplateWeek = timelineMeta?.sourceTemplateWeek;
              const isRepeatedTemplate = Boolean(timelineMeta && timelineMeta.totalTemplateUses > 1);
              const isShiftedFromTemplateWeek = Boolean(
                sourceTemplateWeek !== undefined &&
                displayWeek !== undefined &&
                sourceTemplateWeek !== displayWeek
              );

              return (
                <motion.div 
                  key={j.id || `journal_${j.tanggal}_${j.kelas}_${idx}`} 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ 
                    scale: 1.008, 
                    y: -4,
                    transition: { duration: 0.2, ease: "easeOut" }
                  }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className={`p-5 rounded-2xl border transition-all duration-300 ease-out relative group flex flex-col md:flex-row gap-4 justify-between items-start cursor-pointer ${
                    isToday 
                      ? 'bg-indigo-50/25 border-indigo-200 shadow-sm hover:shadow-md hover:border-indigo-300 hover:bg-indigo-50/40' 
                      : 'bg-white hover:bg-slate-50/80 border-slate-100 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-500/5'
                  }`}
                >
                  {/* Journal Detail */}
                  <div className="space-y-3.5 max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-[10px] font-extrabold flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formattedDate}
                      </span>
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-extrabold flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Jam ke: {j.jamPelajaran.join(', ')}
                      </span>
                      
                      {j.keaktifan && (
                        <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-100/50 rounded-lg text-[10px] font-extrabold">
                          Keaktifan: {'⭐'.repeat(j.keaktifan)}
                        </span>
                      )}

                      {displayWeek !== undefined && (
                        <span className="px-2.5 py-1 bg-indigo-100/80 text-indigo-800 rounded-lg text-[10px] font-black flex items-center gap-1 border border-indigo-200/50">
                          <Sparkles className="w-3 h-3 text-indigo-600" />
                          Minggu ke-{displayWeek}
                        </span>
                      )}

                      {(isRepeatedTemplate || isShiftedFromTemplateWeek) && sourceTemplateWeek !== undefined && (
                        <span
                          className="px-2.5 py-1 bg-amber-50 text-amber-900 rounded-lg text-[10px] font-bold flex items-center gap-1 border border-amber-200/80"
                          title={`Menggunakan ${timelineMeta?.sourceTemplateLabel || `Template Minggu ${sourceTemplateWeek}`}`}
                        >
                          <BookMarked className="w-3 h-3 text-amber-600" />
                          {isRepeatedTemplate
                            ? `Template Minggu ${sourceTemplateWeek} (${timelineMeta?.templateUseIndex}/${timelineMeta?.totalTemplateUses})`
                            : `Dari Template Minggu ${sourceTemplateWeek}`}
                        </span>
                      )}

                      {j.adaTugas && (
                        <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-100/50 text-emerald-700 rounded-lg text-[10px] font-extrabold">
                          Ada Tugas/PR
                        </span>
                      )}

                      {isToday && (
                        <span className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-[10px] font-black">
                          AKTIF HARI INI
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <h4 className="text-xs font-black text-slate-800 group-hover:text-indigo-950 leading-relaxed flex items-center gap-2 transition-colors duration-200">
                        <BookOpen className="w-3.5 h-3.5 text-indigo-500 shrink-0 group-hover:scale-110 transition-transform duration-200" />
                        {j.materi}
                      </h4>

                      {j.tujuanPembelajaran && (
                        <div className="text-[11px] text-indigo-800 bg-indigo-50/60 border border-indigo-100/70 rounded-xl px-3 py-1.5 font-medium flex items-start gap-1.5">
                          <span className="font-bold shrink-0 text-indigo-900">🎯 TP:</span>
                          <span className="leading-relaxed">{j.tujuanPembelajaran}</span>
                        </div>
                      )}

                      {j.catatan && (
                        <p className="text-[11px] text-slate-500 leading-relaxed pl-5 font-medium whitespace-pre-wrap">
                          {j.catatan}
                        </p>
                      )}
                    </div>

                    {/* Hambatan & Solusi if available */}
                    {(j.hambatan || j.solusi) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-5">
                        {j.hambatan && (
                          <div className="p-2.5 bg-amber-50/50 border border-amber-100/40 rounded-xl text-[10px] text-slate-600 leading-relaxed">
                            <strong className="text-amber-800 block mb-0.5 font-bold">⚠️ Kendala:</strong>
                            {j.hambatan}
                          </div>
                        )}
                        {j.solusi && (
                          <div className="p-2.5 bg-emerald-50/50 border border-emerald-100/40 rounded-xl text-[10px] text-slate-600 leading-relaxed">
                            <strong className="text-emerald-800 block mb-0.5 font-bold">💡 Solusi:</strong>
                            {j.solusi}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Absent Students reference list */}
                    {j.tidakHadirSnapshot && j.tidakHadirSnapshot.length > 0 && (
                      <div className="pl-5 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[9px] font-extrabold text-rose-500 uppercase tracking-wider">Ketidakhadiran:</span>
                        <div className="flex flex-wrap gap-1">
                          {j.tidakHadirSnapshot.map((s, idx) => (
                            <span 
                              key={s.nis ? `snap_${j.id}_${s.nis}` : `snap_${j.id}_${idx}`} 
                              className={`px-2 py-0.5 rounded text-[9px] font-bold border ${
                                s.status === 'Alfa' 
                                  ? 'bg-rose-50 border-rose-200 text-rose-700' 
                                  : s.status === 'Izin' 
                                    ? 'bg-amber-50 border-amber-200 text-amber-700' 
                                    : 'bg-blue-50 border-blue-200 text-blue-700'
                              }`}
                            >
                              {s.nama} ({s.status})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Student Notes reference list */}
                    {(() => {
                      const journalNotes = j.catatanSiswaSnapshot || (notes ? notes.filter(n => n.tanggal === j.tanggal && n.kelas === j.kelas) : []);
                      if (!journalNotes || journalNotes.length === 0) return null;

                      return (
                        <div className="pl-5 flex items-start gap-1.5 flex-wrap mt-1">
                          <span className="text-[9px] font-extrabold text-amber-600 uppercase tracking-wider pt-0.5">Catatan Siswa:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {journalNotes.map((n, idx) => (
                              <div 
                                key={`jnote_${j.id}_${n.nis}_${idx}`} 
                                className={`px-2.5 py-1 rounded-xl text-[10px] font-semibold border flex items-center gap-1.5 ${
                                  n.tipe === 'bermasalah' 
                                    ? 'bg-rose-50/70 border-rose-100 text-rose-800' 
                                    : 'bg-emerald-50/70 border-emerald-100 text-emerald-800'
                                }`}
                              >
                                <span className="font-extrabold">{n.nama}:</span>
                                <span>"{n.catatan}"</span>
                                <span className="text-[8px] opacity-75 font-mono">({stripClockFromJamString(n.jamPembelajaran)})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Attendance Statistics Summary */}
                    {(() => {
                      const dayAttendance = attendance.filter(r => r.tanggal === j.tanggal);
                      if (dayAttendance.length === 0) {
                        return (
                          <div className="pl-5 flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                            <AlertCircle className="w-3.5 h-3.5 text-slate-300" />
                            <span>Tidak ada data absensi untuk tanggal ini</span>
                          </div>
                        );
                      }

                      const total = dayAttendance.length;
                      const present = dayAttendance.filter(r => r.status === 'Hadir').length;
                      const sick = dayAttendance.filter(r => r.status === 'Sakit').length;
                      const excused = dayAttendance.filter(r => r.status === 'Izin').length;
                      const absent = dayAttendance.filter(r => r.status === 'Alfa').length;
                      const attendanceRate = total > 0 ? Math.round((present / total) * 100) : 0;

                      return (
                        <div className="pl-5 pt-2 border-t border-slate-100/60 mt-3 flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Kehadiran Kelas:</span>
                            <span className={`px-2 py-0.5 rounded-lg text-xs font-black ${
                              attendanceRate >= 90 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                : attendanceRate >= 75 
                                  ? 'bg-amber-50 text-amber-700 border border-amber-100' 
                                  : 'bg-rose-50 text-rose-700 border border-rose-100'
                            }`}>
                              {attendanceRate}% Hadir
                            </span>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 font-semibold">
                            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-50 rounded text-slate-600">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              {present} Masuk
                            </span>
                            {sick > 0 && (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-50/50 rounded text-blue-600">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                {sick} Sakit
                              </span>
                            )}
                            {excused > 0 && (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-50/50 rounded text-amber-600">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                {excused} Izin
                              </span>
                            )}
                            {absent > 0 && (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-rose-50/50 rounded text-rose-600">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                {absent} Alfa
                              </span>
                            )}
                            <span className="text-slate-400 font-medium">dari {total} siswa</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Actions buttons */}
                  <div className="flex md:flex-col items-center gap-2 self-stretch md:self-auto justify-end md:justify-center shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyShareText(j)}
                      className="p-2 bg-slate-50 group-hover:bg-white hover:bg-emerald-50 text-slate-500 hover:text-emerald-700 border border-slate-200/60 group-hover:border-slate-300 hover:border-emerald-300 rounded-xl transition-all duration-200 cursor-pointer shadow-3xs hover:shadow-sm hover:scale-105"
                      title="Salin Jurnal (Format WA)"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedHours(j.jamPelajaran || []);
                        setMateri(j.materi || '');
                        setCatatan(j.catatan || '');
                        setHambatan(j.hambatan || '');
                        setSolusi(j.solusi || '');
                        setKeaktifan(j.keaktifan || 4);
                        setAdaTugas(!!j.adaTugas);
                        setDeskripsiTugas(j.deskripsiTugas || '');
                        setEditingId(j.id);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        triggerToast('Data dimuat ke formulir edit!', 'info');
                      }}
                      className="p-2 bg-slate-50 group-hover:bg-white hover:bg-indigo-50 text-slate-500 hover:text-indigo-700 border border-slate-200/60 group-hover:border-slate-300 hover:border-indigo-300 rounded-xl transition-all duration-200 cursor-pointer shadow-3xs hover:shadow-sm hover:scale-105"
                      title="Edit Jurnal"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setJournalToDeleteId(j.id)}
                      className="p-2 bg-slate-50 group-hover:bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-700 border border-slate-200/60 group-hover:border-slate-300 hover:border-rose-300 rounded-xl transition-all duration-200 cursor-pointer shadow-3xs hover:shadow-sm hover:scale-105"
                      title="Hapus Jurnal"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 rounded-3xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center text-sm">
              📂
            </div>
            <div className="space-y-1">
              <span className="text-xs font-extrabold text-slate-800 block">Belum Ada Riwayat Jurnal</span>
              <span className="text-[10px] text-slate-400 block leading-relaxed">
                Belum ada data jurnal tatap muka yang dicatat untuk kelas {activeClassName}.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Delete Journal Confirmation Modal */}
      {journalToDeleteId && (() => {
        const targetJournal = journals.find(j => j.id === journalToDeleteId);
        if (!targetJournal) return null;
        return (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-start gap-3">
                <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl shrink-0">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-extrabold text-slate-950">
                    Hapus Jurnal Harian?
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Tanggal: {targetJournal.tanggal} • Kelas: {targetJournal.kelas}
                  </p>
                </div>
              </div>

              <div className="text-xs text-slate-600 leading-relaxed bg-rose-50/30 border border-rose-100 rounded-xl p-3.5 space-y-2">
                <p>
                  Apakah Anda yakin ingin menghapus jurnal harian ini? Tindakan ini akan menghapus data dari sistem dan disinkronkan ke Google Sheets.
                </p>
                {targetJournal.materi && (
                  <p className="text-[10px] text-slate-700 bg-white/80 p-2 rounded-lg border border-slate-100 italic">
                    " {targetJournal.materi} "
                  </p>
                )}
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setJournalToDeleteId(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (targetJournal) {
                      onDeleteJournal(targetJournal);
                      triggerToast('Jurnal harian berhasil dihapus.', 'info');
                    } else if (journalToDeleteId) {
                      onDeleteJournal(journalToDeleteId);
                      triggerToast('Jurnal harian berhasil dihapus.', 'info');
                    }
                    if (editingId === targetJournal?.id || editingId === journalToDeleteId) {
                      setEditingId(null);
                      setSelectedHours([]);
                      setMateri('');
                      setCatatan('');
                      setHambatan('');
                      setSolusi('');
                      setKeaktifan(4);
                      setAdaTugas(false);
                      setDeskripsiTugas('');
                    }
                    setJournalToDeleteId(null);
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  Hapus Jurnal
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Weekly Material Template Bank Modal */}
      <WeeklyTemplateModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        templates={weeklyTemplates}
        onSaveTemplates={handleSaveWeeklyTemplates}
        onApplyTemplate={handleApplyTemplate}
        activeClassName={activeClassName}
      />

      {/* Date Note Modal (Terisolasi Per Kelas / Multi-Kelas / Semua Kelas) */}
      {onSaveDateNote && (
        <DateNoteModal
          isOpen={isDateNoteModalOpen}
          onClose={() => setIsDateNoteModalOpen(false)}
          selectedDate={dateNoteModalTargetDate || currentDate}
          activeClassName={activeClassName}
          classes={classes || []}
          existingNote={targetModalNote}
          initialReason={dateNoteModalInitialReason}
          onSave={async (note, targetClasses) => {
            await onSaveDateNote(note, targetClasses);
          }}
          onDelete={onDeleteDateNote ? async (date, removeFromAll) => {
            await onDeleteDateNote(date, removeFromAll);
          } : undefined}
          subtitle={`Jurnal Harian • ${activeClassName}`}
          calendarHint="Tanggal yang ditandai otomatis dikecualikan dari daftar peringatan jurnal belum diisi dan pengingat absensi hanya untuk kelas yang dipilih."
        />
      )}
    </div>
  );
}
