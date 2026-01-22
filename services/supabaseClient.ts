
import { createClient } from '@supabase/supabase-js';

// 1. 환경 변수를 가져옵니다.
// 하드코딩된 데모 프로젝트 키를 제거하여, 사용자가 본인의 프로젝트에 연결하지 않았을 때
// 엉뚱한 곳(데모 DB)에 데이터가 저장되는 혼동을 방지합니다.
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || '';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

// 유효성 검사: URL과 Key가 모두 존재하고, placeholder가 아니어야 함
const hasValidEnv = 
    supabaseUrl && 
    supabaseUrl.startsWith('http') && 
    supabaseAnonKey && 
    supabaseAnonKey !== 'placeholder-key' &&
    supabaseAnonKey.length > 20;

// 내보내기: 앱의 다른 곳에서 Supabase 연결 상태를 확인할 수 있도록 함
export const isSupabaseConfigured = !!hasValidEnv;

if (!hasValidEnv) {
    console.warn('⚠️ Supabase 연결 정보가 유효하지 않습니다. .env 파일을 확인해주세요.');
}

// 연결 정보가 없더라도 앱이 크래시되지 않도록 빈 클라이언트를 생성하거나, 
// 유효한 경우 정상적인 클라이언트를 생성합니다.
// 유효하지 않을 경우 기능을 제한하기 위해 더미 URL 사용
const validUrl = hasValidEnv ? supabaseUrl : 'https://placeholder-project.supabase.co';
const validKey = hasValidEnv ? supabaseAnonKey : 'placeholder-key';

export const supabase = createClient(validUrl, validKey);
