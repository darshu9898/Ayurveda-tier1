// src/contexts/CartContext.js - Fixed version
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'

const CartContext = createContext()

export function CartProvider({ children }) {
  const [cart, setCart] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { user, loading: authLoading } = useAuth()

  // Fetch cart from API
  const fetchCart = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      console.log('🛒 Fetching cart...')
      
      const response = await fetch('/api/cart', {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      console.log('🛒 Cart response status:', response.status)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('❌ Cart fetch failed:', response.status, errorData)
        
        // Don't throw error, just set empty cart for 401/403
        if (response.status === 401 || response.status === 403) {
          console.log('ℹ️ Not authenticated, setting empty cart')
          setCart([])
          return
        }
        
        throw new Error(errorData.error || `Cart fetch failed: ${response.status}`)
      }

      const data = await response.json()
      console.log('✅ Cart fetched:', data.cart?.length || 0, 'items')
      
      setCart(data.cart || [])
    } catch (err) {
      console.error('❌ CartContext: Cart fetch error:', err)
      setError(err.message)
      // Set empty cart on error instead of keeping stale data
      setCart([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch cart when auth state changes
  useEffect(() => {
    if (!authLoading) {
      console.log('🔄 Auth state changed, fetching cart. User:', user ? 'authenticated' : 'guest')
      fetchCart()
    }
  }, [user, authLoading, fetchCart])

  // Add item to cart
  const addToCart = async (productId, quantity = 1) => {
    try {
      console.log('➕ Adding to cart:', productId, 'qty:', quantity)
      
      const response = await fetch('/api/cart', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, quantity })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to add to cart')
      }

      const data = await response.json()
      console.log('✅ Added to cart:', data)
      
      // Refresh cart
      await fetchCart()
      
      return data
    } catch (err) {
      console.error('❌ CartContext: Add to cart error:', err)
      throw err
    }
  }

  // Update cart item quantity
  const updateCartItem = async (cartId, quantity) => {
    try {
      console.log('📝 Updating cart item:', cartId, 'qty:', quantity)
      
      const response = await fetch(`/api/cart/${cartId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update cart')
      }

      const data = await response.json()
      console.log('✅ Cart item updated:', data)
      
      // Refresh cart
      await fetchCart()
      
      return data
    } catch (err) {
      console.error('❌ CartContext: Update cart error:', err)
      throw err
    }
  }

  // Remove item from cart
  const removeFromCart = async (cartId) => {
    try {
      console.log('🗑️ Removing from cart:', cartId)
      
      const response = await fetch(`/api/cart/${cartId}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to remove from cart')
      }

      const data = await response.json()
      console.log('✅ Removed from cart:', data)
      
      // Refresh cart
      await fetchCart()
      
      return data
    } catch (err) {
      console.error('❌ CartContext: Remove from cart error:', err)
      throw err
    }
  }

  // Clear entire cart
  const clearCart = async () => {
    try {
      console.log('🗑️ Clearing cart...')
      
      const response = await fetch('/api/cart', {
        method: 'DELETE',
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to clear cart')
      }

      const data = await response.json()
      console.log('✅ Cart cleared:', data)
      
      setCart([])
      
      return data
    } catch (err) {
      console.error('❌ CartContext: Clear cart error:', err)
      throw err
    }
  }

  // Calculate cart totals
  const cartTotal = cart.reduce((total, item) => {
    return total + (item.product?.productPrice || 0) * item.quantity
  }, 0)

  const cartItemCount = cart.reduce((count, item) => count + item.quantity, 0)

  const value = {
    cart,
    loading,
    error,
    cartTotal,
    cartItemCount,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    refreshCart: fetchCart
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const context = useContext(CartContext)
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}

// Separate hook for cart count only (optimized for navbar)
export function useCartCount() {
  const context = useContext(CartContext)
  if (context === undefined) {
    throw new Error('useCartCount must be used within a CartProvider')
  }
  return context.cartItemCount
}