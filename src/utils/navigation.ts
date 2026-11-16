import { Router } from 'expo-router';

/**
 * Safely navigates back if there is a screen in history to pop;
 * otherwise navigates to the fallback route (default '/(main)/home').
 * Prevents the warning: "The action 'GO_BACK' was not handled by any navigator."
 */
export function safeBack(
  router: { canGoBack?: () => boolean; back?: () => void; replace?: (href: any) => void } | any,
  fallback: string = '/(main)/home'
) {
  try {
    if (router && typeof router.canGoBack === 'function' && router.canGoBack()) {
      router.back();
    } else if (router && typeof router.replace === 'function') {
      router.replace(fallback as any);
    }
  } catch {
    if (router && typeof router.replace === 'function') {
      router.replace(fallback as any);
    }
  }
}
