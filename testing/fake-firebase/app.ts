// Test stand-in for "firebase/app" (only used when FAKE_FIREBASE=1)
const apps: object[] = [];
export function initializeApp(config: object) {
  apps.push(config);
  return config;
}
export const getApps = () => apps;
export type FirebaseApp = object;
