import React, { useCallback } from "react";
import { askPermissionAndSubscribe } from "../lib/webpush";
import { useAtomValue } from "jotai";
import { installIdAtom } from "../atoms";
import { jsonFetcher } from "../lib/data";
import useSWR from "swr";

const NotificationButton: React.FC = () => {
  const installId = useAtomValue(installIdAtom);
  const { data, mutate } = useSWR<{subscribed: boolean}>([
    `${import.meta.env.VITE_API_URL}/push/status`, {
      headers: {
        "x-install-id": installId,
      }
    }], jsonFetcher);

  const subscribeHandler = useCallback<React.MouseEventHandler>(async (event) => {
    event.preventDefault();
    await askPermissionAndSubscribe(installId);
    mutate({subscribed: true}, false);
    window.gtag('event', 'subscribe');
  }, [installId, mutate]);

  if (!("Notification" in window)) {
    return null;
  }
  if (data && !data.subscribed) {
    return (
      <div className="d-grid gap-2">
        <button type="button" className="btn btn-primary mb-4" onClick={subscribeHandler}>
          通知を受け取る
        </button>
      </div>
    );
  }
  return null;
}

export default NotificationButton;
