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
export const wechatSchema=z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_-]{5,63}$/,'微信号需为6–64位字母、数字、下划线或连字符，且以字母开头').transform(v=>v.toLowerCase());
export const registerSchema=z.object({nickname:short(24).refine(v=>!/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(v),'昵称请勿使用控制字符'),wechat:wechatSchema,password:z.string().min(12,'密码至少12位').max(128,'密码最多128位').refine(v=>v.trim().length>0,'密码不能全部为空白'),turnstileToken:z.string().max(2048).optional()}).strict();
export const memberLoginSchema=z.object({wechat:wechatSchema,password:z.string().min(1).max(128)}).strict();
export const contactsSchema=z.object({contacts:z.array(z.object({name:short(30),role:z.enum(['owner','operator']),wechat:wechatSchema}).strict()).min(1).max(10)}).strict().superRefine((v,ctx)=>{if(new Set(v.contacts.map(c=>c.wechat)).size!==v.contacts.length)ctx.addIssue({code:'custom',path:['contacts'],message:'联系方式中的微信号不能重复'});});
export const joinSchema = z.object({
  recommendedBook: short(100), value: short(300),
  aiExperience: z.enum(['经常使用', '偶尔试过', '还没用过']), agreed: z.literal(true)
}).strict();
