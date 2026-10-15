export type Kind = 'book' | 'note' | 'activity';
export type Page = 'shelf' | 'notes' | 'activities' | 'agents' | 'about' | 'community' | 'admin';
export type CommunityContact={name:string;role:'owner'|'operator';wechat:string};
export type ContentData = {
  title: string; author?: string; description?: string; category?: string;
  cover?: string; cadence?: 'monthly' | 'weekly'; period?: string;
  bookTitle?: string; body?: string; location?: string; proposer?: string;
};
export type Entry = {
  id: string; kind: Kind; status: string; data: ContentData; source: string;
  sourceLabel: string; demo: boolean; createdAt: string; updatedAt: string;
  votes?: number; voted?: boolean; canPlan?: boolean;
};
export type State = {
  content: Entry[]; member: { id: string; nickname: string;joined:boolean } | null; admin: boolean; adminRole: 'super_admin' | 'operator' | null;
  date: string; month: string; week: string;
  community: { groupSize: number | null; firstMeetingHeld: boolean; members: number; firstMeetingThreshold: number; proposalThreshold: number };
  periods: { monthly: string[]; weekly: string[] };
};
export type AgentKey = { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null };
export type AdminState = { role: 'super_admin' | 'operator'; pending: Entry[]; rejected: Entry[]; keys: AgentKey[]; groupSize: number | null; firstMeetingHeld: boolean };
export type EditorState = { kind: Kind; entry?: Entry; bookTitle?: string };
export const kindNames: Record<Kind,string> = { book: '书单', note: '心得', activity: '活动提议' };
