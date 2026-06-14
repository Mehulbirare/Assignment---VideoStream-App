import {useCallback, useEffect, useState} from 'react';
import {Platform, PermissionsAndroid, Linking} from 'react-native';
import {PermissionStatus} from '@/types';

/**
 * Manages the CAMERA runtime permission with full lifecycle handling:
 * granted / denied / blocked (never-ask-again).
 *
 * On iOS the native camera APIs request permission on first use, so this
 * hook reports "granted" optimistically there and defers to the native
 * onError event for the denied case (documented in the README).
 */
export function useCameraPermission() {
  const [status, setStatus] = useState<PermissionStatus>('unknown');

  const check = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setStatus('granted');
      return;
    }
    const has = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.CAMERA,
    );
    setStatus(has ? 'granted' : 'denied');
  }, []);

  const request = useCallback(async (): Promise<PermissionStatus> => {
    if (Platform.OS !== 'android') {
      setStatus('granted');
      return 'granted';
    }

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: 'Camera permission',
        message:
          'EdgeVision needs the camera to capture and process the live video stream.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      },
    );

    let next: PermissionStatus;
    switch (result) {
      case PermissionsAndroid.RESULTS.GRANTED:
        next = 'granted';
        break;
      case PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN:
        next = 'blocked';
        break;
      default:
        next = 'denied';
    }
    setStatus(next);
    return next;
  }, []);

  /** Opens the OS app settings so the user can lift a "blocked" permission. */
  const openSettings = useCallback(() => {
    Linking.openSettings();
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  return {status, request, check, openSettings};
}
