import { z } from 'zod';
import { weekStart } from './dates.mjs';
const short = (max = 120) => z.string().trim().min(1, '请填写此项').max(max);
const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;
export const bookSchema = z.object({
  title: short(100), author: short(100), description: short(1200), category: short(24),
  cover: z.enum(['clay', 'sage', 'sand', 'ink']).default('sage'),
  cadence: z.enum(['monthly', 'weekly']), period: short(10)
}).strict().superRefine((book, ctx) => {
  const valid = book.cadence === 'monthly' ? /^\d{4}-(0[1-9]|1[0-2])$/.test(book.period) : validDate(book.period) && weekStart(book.period) === book.period;
  if (!valid) ctx.addIssue({ code: 'custom', path: ['period'], message: '月度使用 YYYY-MM；周度使用当周周一 YYYY-MM-DD' });
});
export const noteSchema = z.object({ title: short(100), bookTitle: short(100), author: short(60), body: z.string().trim().min(20, '心得至少 20 个字').max(12000) }).strict();
export const activitySchema = z.object({ title: short(100), description: z.string().trim().min(20, '提议至少 20 个字').max(2000), location: short(120), proposer: short(60) }).strict();
export const submissionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('book'), data: bookSchema }).strict(),
  z.object({ kind: z.literal('note'), data: noteSchema }).strict(),
  z.object({ kind: z.literal('activity'), data: activitySchema }).strict()
]);
export const joinSchema = z.object({
  nickname: short(24), recommendedBook: short(100), value: short(300),
  aiExperience: z.enum(['经常使用', '偶尔试过', '还没用过']), agreed: z.literal(true)
}).strict();
