// Address of the Supabase Edge Function that talks to Notion and the chat tables.
// Leave it empty to run the app in demo mode with made-up people and data.
export const API_URL = 'https://zohiurezsbstkztxklbs.supabase.co/functions/v1/go';

// "Open Home Base in Notion" link for leaders.
export const NOTION_URL = 'https://app.notion.com/p/3f180be0bac48162bc75c0e48f4a2b23';

// Shown on the Home screen. Update when a new season or event starts.
export const SEASON_LABEL = 'Season 3 · Fall Push';
export const EVENT = { name: 'Downtown Blitz', when: 'Sat 9am–1pm' }; // set to null for none
