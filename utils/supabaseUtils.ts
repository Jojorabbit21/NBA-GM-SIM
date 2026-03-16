/** Supabase 응답의 error 필드를 확인하고, 에러 시 throw */
export function throwIfSupabaseError(
    result: { error: any },
    context: string
): void {
    if (result.error) {
        console.error(`❌ [Supabase] ${context}:`, result.error);
        throw result.error;
    }
}
