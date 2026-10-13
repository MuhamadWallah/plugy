import { notifyUser } from '../sockets/socket.js';
import { sendPush } from './push.service.js';

/**
 * Notifies one user: a live socket event for open tabs, plus a push notification for their
 * devices (the service worker skips it when Plugy is already on screen).
 */
export const notify = (
  userId: string,
  event: string,
  data: { jobId: string } & Record<string, unknown>,
  push?: { title: string; body: string }
) => {
  notifyUser(userId, event, data);
  if (push) {
    void sendPush(userId, {
      title: push.title,
      body: push.body,
      url: `/?job=${data.jobId}`,
      tag: `${event}:${data.jobId}`,
    });
  }
};
