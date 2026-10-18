// Electron loads file://; only hosted production builds register an offline worker.
export async function registerOffline(onWaiting) {
  if (!import.meta.env.PROD || !['https:', 'http:'].includes(location.protocol) || !('serviceWorker' in navigator) || !window.isSecureContext) return null;
  try {
    const registration = await navigator.serviceWorker.register(new URL('sw.js', document.baseURI));
    if (registration.waiting) onWaiting(registration);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) onWaiting(registration);
      });
    });
    return registration;
  } catch (error) {
    console.warn('Offline mode is unavailable:', error.message);
    return null;
  }
}
