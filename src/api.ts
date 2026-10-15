export async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch(path, {
    method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Liaoye-Action': '1' },
    body: data === undefined ? undefined : JSON.stringify(data)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '请求未完成，请稍后重试');
  return result;
}
export function monthLabel(period: string) { const [year,month] = period.split('-'); return `${year} 年 ${Number(month)} 月`; }
export function weekLabel(period: string) {
  const end = new Date(`${period}T12:00:00Z`); end.setUTCDate(end.getUTCDate()+6);
  return `${period.slice(5).replace('-','.')} — ${end.toISOString().slice(5,10).replace('-','.')}`;
}
export function monday(date: string) { const d = new Date(`${date}T12:00:00Z`); if (Number.isNaN(d.getTime())) return ''; d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7)); return d.toISOString().slice(0,10); }
