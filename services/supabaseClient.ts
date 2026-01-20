
import { createClient } from '@supabase/supabase-js';

// 1. 환경 변수를 먼저 확인하고, 없으면 하드코딩된 값을 사용합니다.
// 이를 통해 .env 로드 문제가 발생해도 앱이 정상 작동하도록 보장합니다.
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://buummihpewiaeltywdff.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1dW1taWhwZXdpYWVsdHl3ZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4ODcxNzgsImV4cCI6MjA4NDQ2MzE3OH0.evU-Zs8GecMUSMVwedkhnXihFxtNssuADR5wGvcUYOw';

// 유효성 검사
const hasValidEnv = supabaseUrl && supabaseUrl.startsWith('http') && supabaseAnonKey && supabaseAnonKey !== 'placeholder-key';

// 내보내기: 앱의 다른 곳에서 Supabase 연결 상태를 확인할 수 있도록 함
export const isSupabaseConfigured = !!hasValidEnv;

if (!hasValidEnv) {
    console.warn('⚠️ Supabase 연결 정보가 유효하지 않습니다.');
    console.warn('Using Placeholder Mode. Cloud features will be disabled.');
}

// 연결 정보가 없더라도 앱이 크래시되지 않도록 빈 클라이언트를 생성하거나, 
// 유효한 경우 정상적인 클라이언트를 생성합니다.
const validUrl = hasValidEnv ? supabaseUrl : 'https://placeholder-project.supabase.co';
const validKey = hasValidEnv ? supabaseAnonKey : 'placeholder-key';

export const supabase = createClient(validUrl, validKey);
