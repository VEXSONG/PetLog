import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Supabase 프로젝트 설정 > API Keys에서 값을 복사하세요.
const url = "https://avtvhlnofrakqvxjwipk.supabase.co/";
const publishableKey = "sb_publishable_ARlsDeZRS6J7ixLpii7odw_d5kcSNEc";
export const supabase = createClient(url, publishableKey);
