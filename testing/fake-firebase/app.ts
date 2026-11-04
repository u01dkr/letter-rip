// Test stand-in for "firebase/app" (only used when FAKE_FIREBASE=1)
const apps: object[] = [];
export function initializeApp(config: object) {
  const app = { options: config };
  apps.push(app);
  return app;
}
export const getApps = () => apps;
export type FirebaseApp = object;
export const getApp = () => apps[0] ?? { options: {} };
