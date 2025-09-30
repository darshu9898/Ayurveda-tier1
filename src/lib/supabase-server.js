// lib/supabase-server.js - Fixed version
import { createServerClient } from '@supabase/ssr'

export function createSupabaseServerClient(req, res) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          // Check multiple cookie sources
          const cookieValue = req?.cookies?.[name] || 
                            req?.headers?.cookie?.split(';')
                              ?.find(c => c.trim().startsWith(`${name}=`))
                              ?.split('=')[1];
          
          console.log('🍪 Getting cookie:', name, cookieValue ? '✅ found' : '❌ missing');
          return cookieValue;
        },
        set(name, value, options) {
          console.log('🍪 Setting cookie:', name);
          
          if (!res?.setHeader) {
            console.warn('⚠️ No response object for cookie:', name);
            return;
          }
          
          const cookieOptions = {
            httpOnly: name.includes('refresh'),
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: options?.maxAge || (name.includes('refresh') ? 60 * 60 * 24 * 7 : 60 * 60),
            ...options
          };
          
          let cookieString = `${name}=${value}`;
          if (cookieOptions.maxAge) cookieString += `; Max-Age=${cookieOptions.maxAge}`;
          if (cookieOptions.path) cookieString += `; Path=${cookieOptions.path}`;
          if (cookieOptions.httpOnly) cookieString += `; HttpOnly`;
          if (cookieOptions.secure) cookieString += `; Secure`;
          if (cookieOptions.sameSite) cookieString += `; SameSite=${cookieOptions.sameSite}`;
          
          const existingCookies = res.getHeader('Set-Cookie') || [];
          const cookies = Array.isArray(existingCookies) ? existingCookies : [existingCookies].filter(Boolean);
          cookies.push(cookieString);
          res.setHeader('Set-Cookie', cookies);
          
          console.log('✅ Cookie set:', name);
        },
        remove(name, options) {
          console.log('🗑️ Removing cookie:', name);
          
          if (!res?.setHeader) {
            console.warn('⚠️ No response object for removing cookie:', name);
            return;
          }
          
          const expiredCookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; Secure; SameSite=lax`;
          const existingCookies = res.getHeader('Set-Cookie') || [];
          const cookies = Array.isArray(existingCookies) ? existingCookies : [existingCookies].filter(Boolean);
          cookies.push(expiredCookie);
          res.setHeader('Set-Cookie', cookies);
          
          console.log('✅ Cookie removed:', name);
        }
      }
    }
  )
}

// Enhanced cache with longer TTL for better performance
const userCache = new Map()
const CACHE_TTL = 15 * 60 * 1000 // 15 minutes

export async function getContext(req, res) {
  const startTime = Date.now()
  
  try {
    // 1. Always get session ID first (this is fast)
    const sessionId = getOrSetSessionId(req, res)

    // 2. Create Supabase client (always create it to check auth)
    const supabase = createSupabaseServerClient(req, res)
    
    // 3. Check authentication
    let supabaseUser = null
    let accessToken = null
    
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (session && !error && session.user) {
        supabaseUser = session.user
        accessToken = session.access_token
        console.log('✅ User authenticated:', supabaseUser.id)
      } else {
        console.log('ℹ️ No valid session found')
      }
    } catch (authError) {
      console.error('Auth error:', authError.message)
    }

    // 4. Handle authenticated user
    if (supabaseUser) {
      const userId = await getUserIdUltraFast(supabaseUser)
      
      console.log(`✅ Auth context completed: ${Date.now() - startTime}ms`)
      
      return {
        user: supabaseUser,
        userId,
        sessionId,
        accessToken,
        supabase,
        isAuthenticated: true
      }
    }

    // 5. Return guest context
    console.log(`ℹ️ Guest context: ${Date.now() - startTime}ms`)
    return {
      user: null,
      userId: null,
      sessionId,
      accessToken: null,
      supabase,
      isAuthenticated: false
    }
    
  } catch (error) {
    console.error(`❌ Context error (${Date.now() - startTime}ms):`, error.message)
    
    // Fallback
    const sessionId = getOrSetSessionId(req, res)
    return {
      user: null,
      userId: null,
      sessionId,
      accessToken: null,
      supabase: null,
      isAuthenticated: false
    }
  }
}

/**
 * Ultra-fast user ID lookup with aggressive caching
 */
async function getUserIdUltraFast(supabaseUser) {
  const cacheKey = supabaseUser.id
  const cached = userCache.get(cacheKey)
  
  // Return cached if exists
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('📦 Using cached user ID')
    return cached.userId
  }
  
  const dbStart = Date.now()
  
  try {
    // Single optimized query
    const user = await prisma.users.upsert({
      where: { supabaseId: supabaseUser.id },
      create: {
        supabaseId: supabaseUser.id,
        userEmail: supabaseUser.email || '',
        userName: supabaseUser.email?.split('@')[0] || 'User',
      },
      update: {}, // Don't update anything, just get the user
      select: { userId: true }
    })
    
    console.log(`💾 User lookup: ${Date.now() - dbStart}ms`)
    
    // Cache the result
    userCache.set(cacheKey, {
      userId: user.userId,
      timestamp: Date.now()
    })
    
    // Async cache cleanup (don't block)
    if (userCache.size > 50) {
      setImmediate(cleanupCache)
    }
    
    return user.userId
    
  } catch (error) {
    console.error('❌ User lookup failed:', error.message)
    
    // Return cached even if expired on error
    return cached?.userId || null
  }
}

/**
 * Async cache cleanup
 */
function cleanupCache() {
  const now = Date.now()
  let cleaned = 0
  
  for (const [key, value] of userCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      userCache.delete(key)
      cleaned++
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} expired cache entries`)
  }
}