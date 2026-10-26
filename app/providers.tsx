'use client';
// Client-side providers for the whole app.
// MotionConfig reducedMotion="user": when the OS asks for reduced motion,
// motion skips transform animations (movement) and keeps opacity (fades).
import { MotionConfig } from 'motion/react';
import { Backdrop } from '@/components/backdrop';
import { AuthProvider } from '@/components/auth-provider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <Backdrop />
      <AuthProvider>
        <TooltipProvider delay={300}>
          {children}
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </MotionConfig>
  );
}
