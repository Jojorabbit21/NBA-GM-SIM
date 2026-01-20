
import { createClient } from '@supabase/supabase-js';

// 1. .env 파일 로드가 안 될 경우를 대비해 직접 값을 입력했습니다.
// (터미널 재시작 없이도 즉시 적용됩니다)
const MANUAL_URL = "https://buummihpewiaeltywdff.supabase.co";
const MANUAL_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1dW1taWhwZXdpYWVsdHl3ZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4ODcxNzgsImV4cCI6MjA4NDQ2MzE3OH0.evU-Zs8GecMUSMVwedkhnXihFxtNssuADR5wGvcUYOw";

const envUrl = process.env.REACT_APP_SUPABASE_URL || MANUAL_URL;
const envKey = process.env.REACT_APP_SUPABASE_ANON_KEY || MANUAL_KEY;

// 디버깅을 위한 로그
console.log('[Supabase Config Check]');
console.log('- Using URL:', envUrl);
console.log('- Connection Mode:', process.env.REACT_APP_SUPABASE_URL ? 'Env Variable' : 'Manual Fallback (Hardcoded)');

// 유효성 검사
const hasValidEnv = envUrl && envUrl.startsWith('http') && envKey;

// 내보내기: 앱의 다른 곳에서 Supabase 연결 상태를 확인할 수 있도록 함
export const isSupabaseConfigured = !!hasValidEnv;

if (!hasValidEnv) {
    console.warn('⚠️ Supabase 연결 정보가 없습니다. supabaseClient.ts 파일을 확인해주세요.');
}

const validUrl = hasValidEnv ? envUrl! : 'https://placeholder-project.supabase.co';
const validKey = hasValidEnv ? envKey! : 'placeholder-key';

export const supabase = createClient(validUrl, validKey);
