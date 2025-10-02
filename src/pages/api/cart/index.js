// src/pages/api/cart/index.js - FIXED: Corrected unique constraint names
import { getContext } from '@/lib/getContext'
import prisma, { ensureConnected } from '@/lib/prisma'

export default async function handler(req, res) {
  const startTime = Date.now()
  console.log(`📥 Cart API: ${req.method} ${req.url}`)
  
  try {
    // Ensure Prisma is connected
    const isConnected = await ensureConnected();
    if (!isConnected) {
      console.error('❌ Database connection failed')
      return res.status(503).json({ 
        error: 'Database unavailable',
        cart: []
      })
    }
    
    // Get context
    const context = await getContext(req, res)
    console.log('📦 Context received:', {
      isAuthenticated: context.isAuthenticated,
      userId: context.userId,
      sessionId: context.sessionId
    })

    const { userId, sessionId, isAuthenticated } = context

    // Ensure we have an identifier
    if (!sessionId) {
      console.error('❌ No sessionId available')
      return res.status(400).json({ 
        error: 'Session unavailable',
        cart: []
      })
    }

    // ============== GET: Fetch Cart ==============
    if (req.method === 'GET') {
      try {
        let cart = []

        if (isAuthenticated && userId) {
          // Authenticated user - fetch by userId
          console.log('👤 Fetching cart for authenticated user:', userId)
          cart = await prisma.cart.findMany({
            where: { 
              userId: parseInt(userId)
            },
            include: {
              product: {
                select: {
                  productId: true,
                  productName: true,
                  productDescription: true,
                  productPrice: true,
                  productImage: true,
                  productStock: true
                }
              }
            }
          })
        } else {
          // Guest user - fetch by sessionId
          console.log('👻 Fetching cart for guest session:', sessionId)
          cart = await prisma.cart.findMany({
            where: { 
              sessionId: sessionId,
              userId: null
            },
            include: {
              product: {
                select: {
                  productId: true,
                  productName: true,
                  productDescription: true,
                  productPrice: true,
                  productImage: true,
                  productStock: true
                }
              }
            }
          })
        }

        console.log(`✅ Cart fetched: ${cart.length} items (${Date.now() - startTime}ms)`)

        return res.status(200).json({
          success: true,
          cart: cart.map(item => ({
            cartId: item.cartId,
            productId: item.productId,
            quantity: item.quantity,
            itemTotal: item.quantity * item.product.productPrice,
            product: item.product
          }))
        })

      } catch (dbError) {
        console.error('💥 Database error fetching cart:', dbError)
        return res.status(500).json({ 
          error: 'Failed to fetch cart',
          details: process.env.NODE_ENV === 'development' ? dbError.message : undefined,
          cart: []
        })
      }
    }

    // ============== POST: Add to Cart ==============
    if (req.method === 'POST') {
      const { productId, quantity = 1 } = req.body

      if (!productId) {
        return res.status(400).json({ error: 'Product ID is required' })
      }

      try {
        // Check if product exists and has stock
        const product = await prisma.products.findUnique({
          where: { productId: parseInt(productId) },
          select: { productId: true, productStock: true, productName: true }
        })

        if (!product) {
          return res.status(404).json({ error: 'Product not found' })
        }

        if (product.productStock < quantity) {
          return res.status(400).json({ 
            error: `Insufficient stock. Only ${product.productStock} available.` 
          })
        }

        // Use upsert with CORRECT constraint names
        let cartItem

        if (isAuthenticated && userId) {
          // Authenticated user - use userId_productId constraint
          console.log('➕ Adding to cart for user:', userId)
          
          // Check existing quantity using CORRECT constraint name
          const existing = await prisma.cart.findUnique({
            where: {
              userId_productId: {  // ✅ CORRECTED: was unique_user_cart_item
                userId: parseInt(userId),
                productId: parseInt(productId)
              }
            }
          })

          const newQuantity = existing ? existing.quantity + quantity : quantity

          if (newQuantity > product.productStock) {
            return res.status(400).json({ 
              error: `Cannot add more. Maximum available: ${product.productStock}` 
            })
          }

          cartItem = await prisma.cart.upsert({
            where: {
              userId_productId: {  // ✅ CORRECTED: was unique_user_cart_item
                userId: parseInt(userId),
                productId: parseInt(productId)
              }
            },
            create: {
              userId: parseInt(userId),
              productId: parseInt(productId),
              quantity: parseInt(quantity),
              sessionId: sessionId
            },
            update: {
              quantity: newQuantity
            },
            include: {
              product: {
                select: {
                  productId: true,
                  productName: true,
                  productDescription: true,
                  productPrice: true,
                  productImage: true,
                  productStock: true
                }
              }
            }
          })
        } else {
          // Guest user - use sessionId_productId constraint
          console.log('➕ Adding to cart for guest:', sessionId)
          
          // Check existing quantity using CORRECT constraint name
          const existing = await prisma.cart.findUnique({
            where: {
              sessionId_productId: {  // ✅ CORRECTED: was unique_guest_cart_item
                sessionId: sessionId,
                productId: parseInt(productId)
              }
            }
          })

          const newQuantity = existing ? existing.quantity + quantity : quantity

          if (newQuantity > product.productStock) {
            return res.status(400).json({ 
              error: `Cannot add more. Maximum available: ${product.productStock}` 
            })
          }

          cartItem = await prisma.cart.upsert({
            where: {
              sessionId_productId: {  // ✅ CORRECTED: was unique_guest_cart_item
                sessionId: sessionId,
                productId: parseInt(productId)
              }
            },
            create: {
              sessionId: sessionId,
              productId: parseInt(productId),
              quantity: parseInt(quantity),
              userId: null
            },
            update: {
              quantity: newQuantity
            },
            include: {
              product: {
                select: {
                  productId: true,
                  productName: true,
                  productDescription: true,
                  productPrice: true,
                  productImage: true,
                  productStock: true
                }
              }
            }
          })
        }

        console.log(`✅ Cart item saved: ${cartItem.cartId}`)

        return res.status(200).json({
          success: true,
          message: 'Cart updated',
          cartItem: {
            cartId: cartItem.cartId,
            productId: cartItem.productId,
            quantity: cartItem.quantity,
            product: cartItem.product
          }
        })

      } catch (dbError) {
        console.error('💥 Database error adding to cart:', dbError)
        
        // Handle unique constraint violation
        if (dbError.code === 'P2002') {
          return res.status(409).json({ 
            error: 'Item already in cart. Please refresh and try again.' 
          })
        }
        
        return res.status(500).json({ 
          error: 'Failed to add to cart',
          details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
        })
      }
    }

    // ============== DELETE: Clear Cart ==============
    if (req.method === 'DELETE') {
      try {
        const whereClause = isAuthenticated && userId
          ? { userId: parseInt(userId) }
          : { sessionId: sessionId, userId: null }

        const result = await prisma.cart.deleteMany({
          where: whereClause
        })

        console.log(`✅ Cart cleared: ${result.count} items removed`)

        return res.status(200).json({
          success: true,
          message: 'Cart cleared',
          deletedCount: result.count
        })

      } catch (dbError) {
        console.error('💥 Database error clearing cart:', dbError)
        return res.status(500).json({ 
          error: 'Failed to clear cart',
          details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
        })
      }
    }

    return res.status(405).json({ error: 'Method not allowed' })

  } catch (error) {
    console.error('💥 Cart API Error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      cart: []
    })
  }
}