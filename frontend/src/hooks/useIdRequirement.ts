import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getAppConfig } from '../utils/config';

/**
 * Whether the signed-in user still needs ID verification to offer on a category
 * (babysitting and care work by default).
 */
export const useIdRequirement = () => {
  const { user } = useAuth();
  const [required, setRequired] = useState<string[]>([]);

  useEffect(() => {
    getAppConfig().then((c) => setRequired(c.idRequiredCategories ?? []));
  }, []);

  return (categorySlug: string) => !!user && !user.id_verified && required.includes(categorySlug);
};

/** Opens the profile page (where ID verification lives) from anywhere in the app */
export const goToProfile = () => window.dispatchEvent(new CustomEvent('plugy:navigate', { detail: 'dashboard' }));
