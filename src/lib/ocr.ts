import type { Lesson, LessonType } from '@/types';
import { detectLessonType } from './lessonUtils';
import { uid } from './storage';

export interface ParsedLesson {
  number: number;
  startTime: string;
  endTime: string;
  type: LessonType;
  subject: string;
  subgroup: string;
  teacher: string;
  room: string;
}

const TIME_RE = /(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})/;
const PAIR_NUM_RE = /(\d+)\s*[-−–]?\s*[яЯ]\s*пара/i;
// OCR sometimes recognises icons / stray glyphs as 1-2 character lines (e.g. "歯")
const JUNK_LINE_RE = /^.{1,2}$/u;

const TEACHER_RANKS = ['доц', 'проф', 'ст\\.?преп', 'ст\\.? преп', 'преп', 'асс', 'старший преподаватель'];
const TEACHER_RE = new RegExp(
  `(?:${TEACHER_RANKS.join('|')})\\.?\\s*([А-ЯЁA-Z][а-яёa-z]+(?:\\s+[А-ЯЁA-Z]\\.?\\s*[А-ЯЁA-Z]?\\.?)?)`,
  'i'
);
const INITIALS_RE = /([А-ЯЁA-Z]\.\s*[А-ЯЁA-Z]\.?\s+[А-ЯЁA-Z][а-яёa-z]+)/;
const NAME_LAST_RE = /([А-ЯЁA-Z][а-яёa-z]+\s+[А-ЯЁA-Z]\.?\s*[А-ЯЁA-Z]?\.?)/;

const ROOM_PATTERNS = [
  /ауд\.?\s*([0-9]+[а-яa-z]*)/i,
  /спортзал/i,
  /дист/i,
  /(\d+-\d+[а-яa-z]*)/,
  /(\d{2,}[а-яa-z]?)/,
];

const TYPE_PATTERNS: { type: LessonType; re: RegExp }[] = [
  { type: 'lecture', re: /^лек/i },
  { type: 'lab', re: /^лаб/i },
  { type: 'exam', re: /^экз/i },
  { type: 'credit', re: /^зач/i },
  { type: 'practice', re: /^пр/i },
  { type: 'practice', re: /^сем/i },
];

function normTime(t: string): string {
  let s = t.replace('.', ':').trim();
  if (s.length === 4) s = '0' + s;
  return s;
}

function detectType(text: string): { type: LessonType; rest: string } {
  const trimmed = text.trim();
  for (const { type, re } of TYPE_PATTERNS) {
    const m = trimmed.match(re);
    if (m) {
      const rest = trimmed.slice(m[0].length).replace(/^[\s.,:-]+/, '').trim();
      return { type, rest };
    }
  }
  return { type: detectLessonType(trimmed), rest: trimmed };
}

function extractTeacher(text: string): { teacher: string; rest: string } {
  const rankMatch = text.match(TEACHER_RE);
  if (rankMatch) {
    const full = rankMatch[0].trim();
    const name = rankMatch[1].trim();
    // keep rank + name for display
    const teacher = `${full.replace(name, '').trim()} ${name}`.replace(/\s+/g, ' ').trim();
    return { teacher, rest: text.replace(rankMatch[0], ' ').replace(/\s+/g, ' ').trim() };
  }
  const initials = text.match(INITIALS_RE);
  if (initials) {
    return {
      teacher: initials[1].trim(),
      rest: text.replace(initials[1], ' ').replace(/\s+/g, ' ').trim(),
    };
  }
  const nameLast = text.match(NAME_LAST_RE);
  if (nameLast && /[А-ЯЁ]\./.test(nameLast[1])) {
    return {
      teacher: nameLast[1].trim(),
      rest: text.replace(nameLast[1], ' ').replace(/\s+/g, ' ').trim(),
    };
  }
  return { teacher: '', rest: text };
}

function extractRoom(text: string): { room: string; rest: string } {
  for (const re of ROOM_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const room = (m[1] ?? m[0]).trim();
      return { room, rest: text.replace(m[0], ' ').replace(/\s+/g, ' ').trim() };
    }
  }
  return { room: '', rest: text };
}

function extractSubgroup(subject: string): { subject: string; subgroup: string } {
  const m = subject.match(/п\/г\s*([0-9]+)/i);
  if (m) {
    return {
      subgroup: `п/г ${m[1]}`,
      subject: subject.replace(m[0], '').replace(/[,\s]+$/, '').replace(/\s+/g, ' ').trim(),
    };
  }
  return { subject, subgroup: '' };
}

interface Block {
  number: number;
  startTime: string;
  endTime: string;
  lines: string[];
}

function splitIntoBlocks(lines: string[]): Block[] {
  const timeIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (TIME_RE.test(lines[i])) timeIndices.push(i);
  }
  if (timeIndices.length === 0) return [];

  const blocks: Block[] = [];
  for (let bi = 0; bi < timeIndices.length; bi++) {
    const start = timeIndices[bi] + 1;
    const end = bi + 1 < timeIndices.length ? timeIndices[bi + 1] : lines.length;
    const bodyLines = lines
      .slice(start, end)
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !JUNK_LINE_RE.test(l));

    const tm = lines[timeIndices[bi]].match(TIME_RE);
    if (!tm) continue;

    // pair number ("1-я пара") is the last line of the block, right before
    // the next time line — search from the end and drop it from the body
    let number = bi + 1;
    const numIdx = bodyLines.findIndex((l) => PAIR_NUM_RE.test(l));
    if (numIdx >= 0) {
      number = parseInt(bodyLines[numIdx].match(PAIR_NUM_RE)![1], 10);
      bodyLines.splice(numIdx, 1);
    }

    blocks.push({
      number,
      startTime: normTime(tm[1]),
      endTime: normTime(tm[2]),
      lines: bodyLines,
    });
  }
  return blocks;
}

function isRoomLine(line: string): boolean {
  return (
    /^ауд\.?/i.test(line) ||
    /^спортзал/i.test(line) ||
    /^дист/i.test(line) ||
    /^\d+-\d+[а-яa-z]*$/i.test(line) ||
    /^\d{2,}[а-яa-z]?$/i.test(line)
  );
}

// expected block layout after the time line:
//   1. type + subject ("пр Высшая математика, п/г 1")
//   2. teacher ("доц. Лановая А.В.")
//   3. room ("10-506")
//   4. pair number ("1-я пара") — already stripped in splitIntoBlocks
function parseBlock(block: Block): ParsedLesson {
  const lines = [...block.lines];

  const firstLine = lines.shift() ?? '';
  const { type, rest: subjectRaw } = detectType(firstLine);

  let teacher = '';
  const teacherIdx = lines.findIndex((l) => TEACHER_RE.test(l) || INITIALS_RE.test(l));
  if (teacherIdx >= 0) {
    teacher = extractTeacher(lines[teacherIdx]).teacher;
    lines.splice(teacherIdx, 1);
  }

  let room = '';
  const roomIdx = lines.findIndex(isRoomLine);
  if (roomIdx >= 0) {
    room = extractRoom(lines[roomIdx]).room;
    lines.splice(roomIdx, 1);
  }

  const joined = [subjectRaw, ...lines].join(' ').replace(/\s+/g, ' ').trim();
  if (!teacher) teacher = extractTeacher(joined).teacher;
  if (!room) room = extractRoom(joined).room;

  const sg = extractSubgroup(joined.replace(/[,\s]+$/, '').replace(/\s+/g, ' '));

  return {
    number: block.number,
    startTime: block.startTime,
    endTime: block.endTime,
    type,
    subject: sg.subject.trim() || 'Предмет',
    subgroup: sg.subgroup,
    teacher: teacher.trim(),
    room: room.trim(),
  };
}

export function parseOcrText(text: string): ParsedLesson[] {
  const rawLines = text
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  // drop everything before the first time occurrence (day/date headers etc.)
  const firstTimeIdx = rawLines.findIndex((l) => TIME_RE.test(l));
  if (firstTimeIdx < 0) return [];

  return splitIntoBlocks(rawLines.slice(firstTimeIdx)).map(parseBlock);
}

export function parsedToLesson(p: ParsedLesson, date: string): Lesson {
  return {
    id: uid(),
    date,
    startTime: p.startTime,
    endTime: p.endTime,
    number: p.number,
    subject: p.subject,
    subgroup: p.subgroup || undefined,
    type: p.type,
    teacher: p.teacher,
    room: p.room,
    homework: null,
  };
}
