/** Verify the finite shell cache through its controlling service worker. */
export async function registerServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !isSecureContext) return false;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    const installing = registration.installing ?? registration.waiting;
    if (installing && installing.state !== 'activated') await new Promise<void>(resolve => {
      const done = () => { clearTimeout(timer); installing.removeEventListener('statechange', changed); resolve(); };
      const changed = () => { if (installing.state === 'activated' || installing.state === 'redundant') done(); };
      const timer = window.setTimeout(done, 5000); installing.addEventListener('statechange', changed);
    });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => {
      const done = () => { clearTimeout(timer); navigator.serviceWorker.removeEventListener('controllerchange', done); resolve(); };
      const timer = window.setTimeout(done, 5000); navigator.serviceWorker.addEventListener('controllerchange', done, { once: true });
    });
    const controller = navigator.serviceWorker.controller; if (!controller) return false;
    const paths = [...document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src],link[rel="stylesheet"]')].map(asset => new URL(asset instanceof HTMLScriptElement ? asset.src : asset.href).pathname);
    return await new Promise<boolean>(resolve => {
      const channel = new MessageChannel(); const timer = window.setTimeout(() => { channel.port1.close(); resolve(false); }, 5000);
      channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data?.ready === true); };
      controller.postMessage({ type: 'VERIFY_SHELL', paths }, [channel.port2]);
    });
  } catch { return false; }
}
