import type { NotificationPrefs } from '@netnet/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  NOTIFICATIONS_KEY,
  isPushUndecided,
  pushPermission,
  storedEndpointId,
  supportsPush,
  turnPushOff,
  turnPushOn,
  useNotificationsPrefs,
  useRemoveDevice,
  useUpdateNotificationPrefs,
} from '../../api/push';
import { trackClient } from '../../api/events';
import { Waiting } from '../../app/guards';
import { Button, Card, ErrorState, FormProblem, Switch, since } from '../../components';
import { failureSentence } from '../../components/auth-copy';
import styles from './Notifications.module.css';

/**
 * Notifications (Account → Notifications, PRD J12): Reminders, this device's switch where the
 * browser can receive push, Email reminders, the other devices with Remove each, and the security
 * email listed as Always. Changes apply at once. Permission is requested only inside the tap that
 * turns push on; Denied leaves the switch off with a pointer and never re-asks on its own.
 */
export function Notifications() {
  const prefs = useNotificationsPrefs();
  if (prefs.isPending) return <Waiting />;
  if (prefs.isError || prefs.data === undefined) {
    return <ErrorState error={prefs.error} onRetry={() => void prefs.refetch()} />;
  }
  return <NotificationsLoaded prefs={prefs.data} />;
}

function NotificationsLoaded({ prefs }: { prefs: NotificationPrefs }) {
  const client = useQueryClient();
  const update = useUpdateNotificationPrefs();
  const remove = useRemoveDevice();
  const [problem, setProblem] = useState<string>();
  // Decided once, when the screen lands.
  const [capable] = useState(() => supportsPush());
  const [denied] = useState(() => supportsPush() && pushPermission() === 'denied');
  const [storedId, setStoredId] = useState<string | null>(() => storedEndpointId());
  const [turning, setTurning] = useState(false);
  const [deviceNote, setDeviceNote] = useState<'denied' | 'error' | null>(null);
  const shown = useRef(false);

  useEffect(() => {
    if (!shown.current && isPushUndecided()) {
      shown.current = true;
      void trackClient('push_prompt_shown', { entry: 'settings' });
    }
  }, []);

  const thisDeviceOn = storedId !== null && prefs.devices.some((d) => d.id === storedId);
  const others = prefs.devices.filter((device) => device.id !== storedId);
  const refresh = () => void client.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });

  const flipSwitch = (patch: { reminders?: boolean; email?: boolean }) => {
    if (update.isPending) return;
    setProblem(undefined);
    update.mutate(patch, { onError: (error) => setProblem(failureSentence(error)) });
  };

  const flipDevice = async (on: boolean) => {
    if (turning || update.isPending) return;
    setProblem(undefined);
    setDeviceNote(null);
    if (!on) {
      setTurning(true);
      try {
        await turnPushOff('user');
        setStoredId(null);
        refresh();
      } catch (error) {
        setProblem(failureSentence(error));
      } finally {
        setTurning(false);
      }
      return;
    }
    setTurning(true);
    const result = await turnPushOn();
    setTurning(false);
    if (result === 'on') {
      setStoredId(storedEndpointId());
      refresh();
      void trackClient('push_prompt_result', { entry: 'settings', result: 'granted' });
    } else if (result === 'denied') {
      setDeviceNote('denied');
      void trackClient('push_prompt_result', { entry: 'settings', result: 'denied' });
    } else {
      setDeviceNote('error');
    }
  };

  const removeDevice = (id: string) => {
    if (remove.isPending) return;
    setProblem(undefined);
    remove.mutate(id, { onError: (error) => setProblem(failureSentence(error)) });
  };

  return (
    <>
      <div className={styles.topbar}>
        <Link to="/account" className={styles.iconButton} aria-label="Back to Account">
          <span aria-hidden="true">‹</span>
        </Link>
        <h1 className={styles.title}>Notifications</h1>
        <span className={styles.spacer} />
      </div>

      <div className={styles.body}>
        <Card>
          <div className={styles.rows}>
            <div className={styles.row}>
              <div className={styles.text}>
                <span className={styles.label}>Reminders</span>
                <span className={styles.hint}>Off means no reminder by any channel.</span>
              </div>
              <Switch
                aria-label="Reminders"
                checked={prefs.reminders}
                onChange={(on) => flipSwitch({ reminders: on })}
                aria-disabled={update.isPending || undefined}
              />
            </div>
            {capable ? (
              <div className={styles.row}>
                <div className={styles.text}>
                  <span className={styles.label}>Notifications on this device</span>
                  {denied || deviceNote === 'denied' ? (
                    <span className={styles.pointer}>
                      Notifications are blocked. Allow them in your browser or phone settings to
                      turn them on.
                    </span>
                  ) : deviceNote === 'error' ? (
                    <span className={styles.pointer}>
                      That didn’t work. Check your connection and try again.
                    </span>
                  ) : null}
                </div>
                <Switch
                  aria-label="Notifications on this device"
                  checked={thisDeviceOn}
                  onChange={(on) => void flipDevice(on)}
                  aria-disabled={turning || update.isPending || undefined}
                />
              </div>
            ) : null}
            <div className={styles.row}>
              <div className={styles.text}>
                <span className={styles.label}>Email reminders</span>
                <span className={styles.hint}>
                  Email is only used when no device has notifications on.
                </span>
              </div>
              <Switch
                aria-label="Email reminders"
                checked={prefs.email}
                onChange={(on) => flipSwitch({ email: on })}
                aria-disabled={update.isPending || undefined}
              />
            </div>
            {others.length > 0 ? (
              <div className={styles.devices}>
                <span className={styles.label}>Other devices</span>
                <ul className={styles.deviceList}>
                  {others.map((device) => (
                    <li key={device.id} className={styles.device}>
                      <span className={styles.text}>
                        <span className={styles.deviceLabel}>{device.label}</span>
                        <span className={styles.hint}>Last used {since(device.lastSeenAt)}</span>
                      </span>
                      <Button
                        variant="quiet"
                        aria-label={`Remove ${device.label}`}
                        aria-disabled={remove.isPending || undefined}
                        onClick={() => removeDevice(device.id)}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className={styles.row}>
              <div className={styles.text}>
                <span className={styles.label}>Security emails</span>
                <span className={styles.hint}>
                  Sent every time an agent is connected. They can’t be turned off.
                </span>
              </div>
              <span className={styles.always}>Always</span>
            </div>
          </div>
        </Card>
        {problem ? <FormProblem>{problem}</FormProblem> : null}
      </div>
    </>
  );
}
