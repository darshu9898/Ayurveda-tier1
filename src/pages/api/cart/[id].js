// src/pages/api/cart/[id].js - Optimized for your schema
import { getContext } from '@/lib/getContext'
import prisma from '@/lib/prisma'

export default async function handler(req, res) {
  console.log(`📥 Cart [id] API: ${req.method} ${req.url}`)
  
  try {
    const context = await getContext(req, res)
    const { userId, sessionId, isAuthenticated } = context
    const cartId = parseInt(req.query.id, 10)

    if (!cartId || isNaN(cartId)) {
      return res.status(400).json({ error: 'Valid cart ID required' })
    }

    if (!sessionId) {
      return res.status(400).json({ error: 'Session unavailable' })
    }

    // Check if cart item exists and belongs to user/session
    const existingCartItem = await prisma.cart.findUnique({
      where: { cartId },
      include: {
        product: {
          select: {
            productId: true,
            productStock: true,
            productName: true
          }
        }
      }
    })

    if (!existingCartItem) {
      return res.status(404).json({ error: 'Cart item not found' })
    }

    // Verify ownership
    if (isAuthenticated && userId) {
      // For authenticated users, check userId matches
      if (existingCartItem.userId !== parseInt(userId)) {
        return res.status(403).json({ error: 'Not authorized to modify this cart item' })
      }
    } else {
      // For guests, check sessionId matches and userId is null
      if (existingCartItem.sessionId !== sessionId || existingCartItem.userId !== null) {
        return res.status(403).json({ error: 'Not authorized to modify this cart item' })
      }
    }

    // ============== PUT: Update Cart Item Quantity ==============
    if (req.method === 'PUT') {
      const { quantity } = req.body

      if (!quantity || quantity < 1) {
        return res.status(400).json({ error: 'Valid quantity required (minimum 1)' })
      }

      // Check stock availability
      if (quantity > existingCartItem.product.productStock) {
        return res.status(400).json({ 
          error: `Insufficient stock. Only ${existingCartItem.product.productStock} available.` 
        })
      }

      try {
        const updatedCartItem = await prisma.cart.update({
          where: { cartId },
          data: { quantity: parseInt(quantity) },
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

        console.log(`✅ Cart item updated: ${cartId} to quantity ${quantity}`)

        return res.status(200).json({
          success: true,
          message: 'Cart item updated',
          cartItem: {
            cartId: updatedCartItem.cartId,
            productId: updatedCartItem.productId,
            quantity: updatedCartItem.quantity,
            product: updatedCartItem.product
          }
        })

      } catch (dbError) {
        console.error('💥 Database error updating cart item:', dbError)
        
        if (dbError.code === 'P2025') {
          return res.status(404).json({ error: 'Cart item not found' })
        }
        
        return res.status(500).json({ 
          error: 'Failed to update cart item',
          details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
        })
      }
    }

    // ============== DELETE: Remove Cart Item ==============
    if (req.method === 'DELETE') {
      try {
        await prisma.cart.delete({
          where: { cartId }
        })

        console.log(`✅ Cart item deleted: ${cartId}`)

        return res.status(200).json({
          success: true,
          message: 'Item removed from cart'
        })

      } catch (dbError) {
        console.error('💥 Database error deleting cart item:', dbError)
        
        if (dbError.code === 'P2025') {
          return res.status(404).json({ error: 'Cart item not found' })
        }
        
        return res.status(500).json({ 
          error: 'Failed to remove item from cart',
          details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
        })
      }
    }

    return res.status(405).json({ error: 'Method not allowed' })

  } catch (error) {
    console.error('💥 Cart [id] API Error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
}