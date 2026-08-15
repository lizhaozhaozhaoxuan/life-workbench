// ============================================================================
// 资产图片上传
//  - 云端模式 (Supabase)：上传到 asset-images 桶，返回公开 URL
//  - 本地模式 (localStorage)：压缩后转为 Base64 内嵌，限制尺寸与数量
// ============================================================================
import { supabase, HAS_SUPABASE } from './supabase'
import { getCurrentUser } from './db'

const MAX_DIMENSION = 1024 // 本地压缩最长边
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 单图上限 5MB

/** 把图片文件画到 canvas 并压缩为 JPEG dataURL（用于本地模式 / 通用预缩放） */
function fileToCompressedDataURL(file: File, maxDim = MAX_DIMENSION, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('图片解析失败'))
      img.onload = () => {
        let { width, height } = img
        if (width > maxDim || height > maxDim) {
          const scale = Math.min(maxDim / width, maxDim / height)
          width = Math.round(width * scale)
          height = Math.round(height * scale)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('无法创建画布'))
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

/**
 * 上传单个图片，返回存储用的字符串（URL 或 Base64）。
 * 云端优先；任何异常均回退到本地 Base64，保证功能可用。
 */
export async function uploadAssetImage(file: File): Promise<string> {
  if (file.size > MAX_FILE_SIZE) throw new Error('图片过大（单个上限 5MB）')
  if (HAS_SUPABASE && supabase) {
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
      const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg'
      const path = `${getCurrentUser()}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`
      const { error } = await supabase.storage.from('asset-images').upload(path, file, {
        cacheControl: '3600',
        upsert: false
      })
      if (!error) {
        const { data } = supabase.storage.from('asset-images').getPublicUrl(path)
        if (data?.publicUrl) return data.publicUrl
      }
      // 上传失败 -> 回退本地
    } catch {
      /* 回退 */
    }
  }
  return await fileToCompressedDataURL(file)
}

/** 删除云端图片（本地 Base64 无需删除） */
export async function deleteAssetImage(url?: string | null) {
  if (!url || !HAS_SUPABASE || !supabase) return
  // 仅处理桶内的公开 URL
  try {
    const prefix = `${supabase.storage.from('asset-images').getPublicUrl('').data.publicUrl}`
    if (url.startsWith(prefix)) {
      const path = url.slice(prefix.length)
      await supabase.storage.from('asset-images').remove([path])
    }
  } catch {
    /* 忽略 */
  }
}

/** 判断字符串是否为 Base64（本地模式标志） */
export function isBase64Image(s?: string | null): boolean {
  return !!s && s.startsWith('data:image/')
}
