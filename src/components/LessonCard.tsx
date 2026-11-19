import { Check, Pencil, Trash2, User, MapPin, BookOpen } from 'lucide-react';
import type { Lesson } from '@/types';
import { typeLabel, typeColor } from '@/lib/lessonUtils';

interface Props {
  lesson: Lesson;
  onToggleHw: (id: string) => void;
  onEdit: (lesson: Lesson) => void;
  onDelete: (id: string) => void;
}

export default function LessonCard({ lesson, onToggleHw, onEdit, onDelete }: Props) {
  return (
    <div className="group relative rounded-2xl border border-neutral-800 bg-neutral-900/80 p-4 transition-colors hover:border-neutral-700">
      {/* top row: time + pair number */}
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-sm font-medium text-sky-300 tabular-nums">
          {lesson.startTime} – {lesson.endTime}
        </span>
        <span className="text-xs text-neutral-500">{lesson.number}-я пара</span>
      </div>

      {/* title row */}
      <div className="flex items-start gap-2 mb-3">
        <BookOpen className="shrink-0 mt-0.5 text-neutral-500" size={16} />
        <h3 className="flex-1 text-[15px] font-semibold leading-snug text-white">
          {lesson.subject}
          {lesson.subgroup ? (
            <span className="text-neutral-400 font-normal">, {lesson.subgroup}</span>
          ) : null}
        </h3>
        <span
          className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full border ${typeColor(lesson.type)}`}
        >
          {typeLabel(lesson.type)}
        </span>
      </div>

      {/* details */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-neutral-400 mb-1">
        {lesson.teacher && (
          <span className="inline-flex items-center gap-1.5">
            <User size={14} className="text-neutral-500" />
            {lesson.teacher}
          </span>
        )}
        {lesson.room && (
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={14} className="text-neutral-500" />
            {lesson.room}
          </span>
        )}
      </div>

      {/* homework block */}
      {lesson.homework && lesson.homework.text && (
        <button
          onClick={() => onToggleHw(lesson.id)}
          className="mt-3 w-full text-left rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 transition-colors hover:border-neutral-700"
        >
          <div className="flex items-start gap-2.5">
            <span
              className={`mt-0.5 shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                lesson.homework.done
                  ? 'bg-sky-500 border-sky-500 text-white'
                  : 'border-neutral-600 text-transparent'
              }`}
            >
              <Check size={13} strokeWidth={3} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-sky-400/70 font-medium mb-0.5">
                Домашнее задание
              </p>
              <p
                className={`text-[13px] leading-relaxed ${
                  lesson.homework.done ? 'text-neutral-500 line-through' : 'text-neutral-200'
                }`}
              >
                {lesson.homework.text}
              </p>
            </div>
          </div>
        </button>
      )}

      {/* hover actions */}
      <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(lesson)}
          className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          aria-label="Редактировать"
        >
          <Pencil size={15} />
        </button>
        <button
          onClick={() => onDelete(lesson.id)}
          className="p-1.5 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-neutral-800 transition-colors"
          aria-label="Удалить"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
