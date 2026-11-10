'use client'
import { useEffect } from 'react'

export default function EnterAsTab() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Only intercept Enter on input fields (not textareas, buttons, selects, or submit)
      if (e.key !== 'Enter') return
      const target = e.target as HTMLElement
      if (!target) return

      // Only apply to input and select elements, not buttons or textareas
      const tagName = target.tagName.toLowerCase()
      if (tagName !== 'input' && tagName !== 'select') return

      // Don't intercept if it's a submit button type input
      if (tagName === 'input' && (target as HTMLInputElement).type === 'submit') return

      // Don't intercept if Ctrl/Cmd/Alt is held (allow form submissions etc)
      if (e.ctrlKey || e.metaKey || e.altKey) return

      e.preventDefault()

      // Find all focusable elements in the current form or modal or page
      const container = target.closest('.modal') || target.closest('.duka-card') || target.closest('form') || document.body
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]):not([type="submit"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
      )).filter(el => {
        // Only visible elements
        const style = window.getComputedStyle(el)
        return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null
      })

      const currentIndex = focusable.indexOf(target)
      if (currentIndex >= 0 && currentIndex < focusable.length - 1) {
        focusable[currentIndex + 1].focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return null
}
