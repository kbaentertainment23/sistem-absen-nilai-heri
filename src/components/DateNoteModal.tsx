import React, { useState, useEffect } from 'react';
import {
  Tag,
  X,
  Info,
  Trash2,
  Check,
  Loader2,
  Users,
  Layers,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { AttendanceDateNote } from '../types';

export type DateNoteScope = 'current' | 'selected' | 'all';

interface DateNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: string;
  activeClassName: string;
  classes?: { id: number; name: string }[];
  existingNote?: AttendanceDateNote | null;
  initialReason?: string;
  onSave: (note: AttendanceDateNote, targetClasses?: string[]) => Promise<void> | void;
  onDelete?: (date: string, removeFromAll?: boolean) => Promise<void> | void;
  subtitle?: string;
  calendarHint?: string;
}

const QUICK_REASON_CHIPS = [
  'Kegiatan Khusus Kelas',
  'Jam Terpakai Acara / Upacara',
  'Classmeeting',
  'Lomba / Kegiatan Sekolah',
  'Tanggal Merah / Libur Nasional',
  'Rapat Guru / Dinas',
  'Libur Hari Raya',
  'Ujian PAS / PAT'
];

export default function DateNoteModal({
  isOpen,
  onClose,
  selectedDate,
  activeClassName,
  classes = [],
  existingNote,
  initialReason = '',
  onSave,
  onDelete,
  subtitle,
  calendarHint
}: DateNoteModalProps) {
  const [reason, setReason] = useState('');
  const [scope, setScope] = useState<DateNoteScope>('current');
  const [selectedClassNames, setSelectedClassNames] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const isExistingAll = Boolean(existingNote && (existingNote.kelas === 'all' || !existingNote.kelas));

  useEffect(() => {
    if (!isOpen) return;
    setReason(existingNote?.alasan || initialReason || '');
    setScope(isExistingAll ? 'all' : 'current');
    setSelectedClassNames(activeClassName ? [activeClassName] : []);
    setIsConfirmingDelete(false);
    setIsSaving(false);
  }, [isOpen, existingNote, initialReason, activeClassName, isExistingAll]);

  if (!isOpen) return null;

  const formattedDate = (() => {
    const d = new Date(selectedDate + 'T00:00:00');
    return isNaN(d.getTime())
      ? selectedDate
      : d.toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
  })();

  const toggleClassSelection = (className: string) => {
    setSelectedClassNames(prev =>
      prev.includes(className)
        ? prev.filter(c => c !== className)
        : [...prev, className]
    );
  };

  const handleSelectAllCheckboxes = () => {
    setSelectedClassNames(classes.map(c => c.name));
  };

  const handleClearCheckboxes = () => {
    setSelectedClassNames(activeClassName ? [activeClassName] : []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    if (scope === 'selected' && selectedClassNames.length === 0) return;

    setIsSaving(true);
    try {
      if (scope === 'all') {
        await onSave({
          tanggal: selectedDate,
          kelas: 'all',
          alasan: reason.trim(),
          excludedClasses: []
        });
      } else if (scope === 'selected') {
        await onSave(
          {
            tanggal: selectedDate,
            kelas: selectedClassNames[0] || activeClassName,
            alasan: reason.trim()
          },
          selectedClassNames
        );
      } else {
        await onSave({
          tanggal: selectedDate,
          kelas: activeClassName,
          alasan: reason.trim()
        });
      }
      onClose();
    } catch (err) {
      console.error('Gagal menyimpan penanda tanggal:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAction = async (removeFromAll = false) => {
    if (!onDelete) return;
    setIsSaving(true);
    try {
      await onDelete(selectedDate, removeFromAll);
      onClose();
    } catch (err) {
      console.error('Gagal menghapus penanda tanggal:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-5 sm:p-6 space-y-4 animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-amber-100 text-amber-700 rounded-2xl shrink-0">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-sm sm:text-base">
                {isConfirmingDelete
                  ? 'Hapus Penanda Libur / Kegiatan?'
                  : existingNote
                  ? 'Edit Penanda Tanggal Libur / Kegiatan'
                  : 'Tandai Tanggal Libur / Kegiatan'}
              </h3>
              <p className="text-[11px] text-slate-500 font-bold">
                {formattedDate} {subtitle ? `• ${subtitle}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isConfirmingDelete ? (
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-amber-900 font-extrabold text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Konfirmasi Penghapusan Penanda</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                Penanda saat ini: <strong className="text-amber-900">"{existingNote?.alasan}"</strong>
              </p>
              <div className="pt-1">
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                  isExistingAll
                    ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                }`}>
                  {isExistingAll ? '🌐 Cakupan: Semua Kelas' : `🎯 Khusus Kelas: ${activeClassName}`}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed pt-1">
                {isExistingAll
                  ? `Menghapus untuk ${activeClassName} hanya akan mengecualikan kelas ini dan mengembalikannya ke hari KBM normal. Kelas lain tetap ditandai libur/kegiatan.`
                  : `Menghapus penanda ini hanya mengembalikan ${activeClassName} ke hari KBM normal tanpa memengaruhi kelas lain.`}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(false)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Kembali
              </button>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                {isExistingAll && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => handleDeleteAction(true)}
                    className="px-3.5 py-2 bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 font-extrabold text-xs rounded-xl transition cursor-pointer disabled:opacity-50"
                  >
                    Hapus untuk Semua Kelas
                  </button>
                )}
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => handleDeleteAction(false)}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shadow-rose-200 disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  <span>Hapus untuk {activeClassName}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Scope Selection */}
            <div className="space-y-2">
              <label className="block text-xs font-extrabold text-slate-700">
                Berlaku Untuk Kelas Mana?
              </label>

              <div className="grid grid-cols-1 gap-2">
                {/* Option 1: Hanya Kelas Ini */}
                <button
                  type="button"
                  onClick={() => setScope('current')}
                  className={`text-left p-3 rounded-2xl border transition cursor-pointer flex items-start gap-2.5 ${
                    scope === 'current'
                      ? 'bg-emerald-50/80 border-emerald-400 ring-2 ring-emerald-500/20'
                      : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70'
                  }`}
                >
                  <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    scope === 'current' ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 bg-white'
                  }`}>
                    {scope === 'current' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-black text-slate-900">
                        Hanya Kelas Ini ({activeClassName})
                      </span>
                      <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                        Aman • Default
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                      Hanya {activeClassName} yang ditandai tidak belajar. Kelas lain di hari yang sama tetap normal mengisi absen &amp; jurnal.
                    </p>
                  </div>
                </button>

                {/* Option 2: Pilih Beberapa Kelas */}
                {classes.length > 1 && (
                  <div
                    className={`rounded-2xl border transition ${
                      scope === 'selected'
                        ? 'bg-indigo-50/70 border-indigo-400 ring-2 ring-indigo-500/20'
                        : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setScope('selected');
                        if (selectedClassNames.length === 0 && activeClassName) {
                          setSelectedClassNames([activeClassName]);
                        }
                      }}
                      className="w-full text-left p-3 cursor-pointer flex items-start gap-2.5"
                    >
                      <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        scope === 'selected' ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 bg-white'
                      }`}>
                        {scope === 'selected' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span className="text-xs font-black text-slate-900">
                            Pilih Beberapa Kelas Tertentu
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                          Centang kelas mana saja yang ikut kegiatan/libur (kelas yang tidak dicentang tetap normal).
                        </p>
                      </div>
                    </button>

                    {scope === 'selected' && (
                      <div className="px-3 pb-3 pt-1 border-t border-indigo-200/60 space-y-2">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-bold text-indigo-900">
                            Terpilih: {selectedClassNames.length} dari {classes.length} kelas
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleSelectAllCheckboxes}
                              className="font-extrabold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                            >
                              Pilih Semua
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                              type="button"
                              onClick={handleClearCheckboxes}
                              className="font-extrabold text-slate-500 hover:text-slate-700 cursor-pointer"
                            >
                              Reset
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto pr-1">
                          {classes.map(c => {
                            const checked = selectedClassNames.includes(c.name);
                            const isActive = c.name === activeClassName;
                            return (
                              <label
                                key={c.id}
                                className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-bold cursor-pointer transition ${
                                  checked
                                    ? 'bg-white border-indigo-400 text-indigo-950 shadow-2xs'
                                    : 'bg-white/60 border-slate-200 text-slate-600 hover:bg-white'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleClassSelection(c.name)}
                                  className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                />
                                <span className="truncate">{c.name}</span>
                                {isActive && (
                                  <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-1 rounded shrink-0">
                                    Aktif
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                        {selectedClassNames.length === 0 && (
                          <p className="text-[10px] font-bold text-rose-600">
                            Pilih minimal 1 kelas untuk ditandai.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Option 3: Semua Kelas */}
                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className={`text-left p-3 rounded-2xl border transition cursor-pointer flex items-start gap-2.5 ${
                    scope === 'all'
                      ? 'bg-amber-50/90 border-amber-400 ring-2 ring-amber-500/20'
                      : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70'
                  }`}
                >
                  <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    scope === 'all' ? 'border-amber-600 bg-amber-600' : 'border-slate-300 bg-white'
                  }`}>
                    {scope === 'all' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <span className="text-xs font-black text-slate-900">
                        Semua Kelas
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                      Untuk libur nasional, tanggal merah, atau kegiatan serentak seluruh kelas di sekolah.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Reason Textarea */}
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                Alasan Tidak Belajar / Tidak Absen: <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={2}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Contoh: Kelas ini mengikuti kegiatan lomba, Classmeeting, Tanggal Merah..."
                className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-medium"
                required
              />
            </div>

            {/* Quick Suggestion Chips */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block">
                Pilihan Cepat (Klik untuk memilih):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REASON_CHIPS.map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setReason(preset)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer border ${
                      reason === preset
                        ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                        : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                    }`}
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-[11px] text-slate-700 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p>
                {calendarHint ||
                  'Tanggal ini akan dikecualikan dari pengingat Absensi dan peringatan Jurnal Belum Diisi hanya untuk kelas yang dipilih di atas.'}
              </p>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2 flex-wrap">
              {existingNote && onDelete ? (
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  disabled={isSaving}
                  className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Penanda</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={
                    isSaving ||
                    !reason.trim() ||
                    (scope === 'selected' && selectedClassNames.length === 0)
                  }
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm shadow-amber-200"
                >
                  {isSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Simpan Penanda</span>
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
