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

export async function askPermissionAndSubscribe(installId: string) {
  const permission = await askPermission();

  if (permission !== 'granted') {
    return false;
  }

  await navigator.serviceWorker.ready;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    return false;
  }

  const keyResp = await fetch(`${import.meta.env.VITE_API_URL}/push/public-key`);
  const keyRespJson = await keyResp.json();
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(keyRespJson.publicKey),
  });

  await fetch(`${import.meta.env.VITE_API_URL}/push/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Install-Id': installId,
    },
    body: JSON.stringify(subscription),
  });

  return true;
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
