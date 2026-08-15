import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// 去掉尾部斜杠，避免拼接 API 路径时出现 // 导致 "Invalid path"
const url = rawUrl?.replace(/\/+$/, '') || ''

/** 当前站点地址（用于 Auth 回调跳转，部署后自动取 origin） */
const siteUrl = typeof window !== 'undefined' ? window.location.origin : ''

/**
 * 若提供了 Supabase 配置则创建客户端（云端实时同步模式）；
 * 否则为 null，数据层自动降级为本地存储（单机演示模式）。
 */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      redirectTo: siteUrl,          // 注册/登录后的回调地址
    }
  }) : null

export const HAS_SUPABASE = !!supabase

/** 本地模式使用的虚拟用户 id（无需登录） */
export const LOCAL_USER = 'local-demo-user'
