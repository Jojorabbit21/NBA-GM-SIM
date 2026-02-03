
export const getDeviceId = (): string => {
    const key = 'nbagm_device_id';
    let deviceId = localStorage.getItem(key);
    if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem(key, deviceId);
    }
    return deviceId;
};
