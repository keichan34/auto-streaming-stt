function askPermission() {
  return new Promise<NotificationPermission>(function (resolve, reject) {
    const permissionResult = Notification.requestPermission(function (result) {
      resolve(result);
    });

    if (permissionResult) {
      permissionResult.then(resolve, reject);
    }
  });
}

export async function askPermissionAndSubscribe() {
  const permission = await askPermission();

  if (permission === 'granted') {
    await navigator.serviceWorker.ready;
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      const keyResp = await fetch('/api/push/public-key');
      const keyRespJson = await keyResp.json();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyRespJson.publicKey),
      });
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({subscription}),
      });
    }
    return true;
  }

  return false;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
