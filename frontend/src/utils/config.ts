export interface AppConfig {
  emergencyNumber: string;
  pushPublicKey: string | null;
  /** Categories where workers need a verified ID to make offers */
  idRequiredCategories: string[];
}

const FALLBACK: AppConfig = { emergencyNumber: '112', pushPublicKey: null, idRequiredCategories: ['babysitting', 'care_taking'] };
let cached: Promise<AppConfig> | null = null;

/** Public server settings (fetched once per page load) */
export const getAppConfig = (): Promise<AppConfig> => {
  if (!cached) {
    cached = fetch('/api/config')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('config unavailable'))))
      .catch(() => {
        cached = null; // retry next time
        return FALLBACK;
      });
  }
  return cached;
};
