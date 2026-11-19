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
const PAIR_NUM_RE = /(\d+)\s*[-−–]?\s*[яЯ]\s*(?:пара)?/;

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
      subject: subject.replace(m[0], '').replace(/\s+/g, ' ').trim(),
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
    const start = timeIndices[bi];
    const end = bi + 1 < timeIndices.length ? timeIndices[bi + 1] : lines.length;
    const slice = lines.slice(start, end).map((l) => l.trim()).filter(Boolean);
    if (slice.length === 0) continue;

    const timeLine = slice[0];
    const tm = timeLine.match(TIME_RE);
    if (!tm) continue;

    // look for pair number in the time line or nearby lines
    let number = bi + 1;
    const numSearch = slice.slice(0, 2).join(' ');
    const numMatch = numSearch.match(PAIR_NUM_RE);
    if (numMatch) number = parseInt(numMatch[1], 10);

    // remaining lines (excluding the time line itself's time portion)
    const restLines = slice.slice(1);
    // also append the non-time part of the time line
    const timeLineRest = timeLine.replace(tm[0], ' ').replace(PAIR_NUM_RE, ' ').replace(/\s+/g, ' ').trim();
    const allLines = [timeLineRest, ...restLines].filter(Boolean);

    blocks.push({
      number,
      startTime: normTime(tm[1]),
      endTime: normTime(tm[2]),
      lines: allLines,
    });
  }
  return blocks;
}

function parseBlock(block: Block): ParsedLesson {
  const joined = block.lines.join(' ').replace(/\s+/g, ' ').trim();

  // subject + type: first meaningful line (or joined)
  const firstLine = block.lines[0] || '';
  const { type, rest: afterType } = detectType(firstLine);
  let subjectRaw = afterType || 'Предмет';

  // teacher
  const { teacher, rest: afterTeacher } = extractTeacher(subjectRaw);
  // room
  const { room, rest: afterRoom } = extractRoom(afterTeacher);
  let subject = afterRoom || 'Предмет';

  // subgroup
  const sg = extractSubgroup(subject);
  subject = sg.subject || 'Предмет';

  return {
    number: block.number,
    startTime: block.startTime,
    endTime: block.endTime,
    type,
    subject: subject.trim(),
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

  // If lines look collapsed (no newlines between pairs), split by time occurrences
  const blocks = splitIntoBlocks(rawLines);
  if (blocks.length > 0) {
    return blocks.map(parseBlock);
  }

  // Fallback: treat whole text as single block, try to find a time
  const tm = text.match(TIME_RE);
  if (tm) {
    return [
      parseBlock({
        number: 1,
        startTime: normTime(tm[1]),
        endTime: normTime(tm[2]),
        lines: [text.replace(tm[0], ' ').trim()],
      }),
    ];
  }

  return [];
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
