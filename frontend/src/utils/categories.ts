import { Sparkles, Shirt, Leaf, Car, HeartHandshake, Baby, LucideIcon } from 'lucide-react';

export interface Category {
  slug: string;
  name: string;
  icon: LucideIcon;
}

/** Service categories (mirrors the seeded `categories` table) */
export const CATEGORIES: Category[] = [
  { slug: 'cleaning', name: 'Cleaning', icon: Sparkles },
  { slug: 'ironing', name: 'Ironing', icon: Shirt },
  { slug: 'gardening', name: 'Gardening', icon: Leaf },
  { slug: 'car_wash', name: 'Car Wash', icon: Car },
  { slug: 'care_taking', name: 'Care Taking', icon: HeartHandshake },
  { slug: 'babysitting', name: 'Babysitting', icon: Baby },
];

export const categoryName = (slug: string): string => CATEGORIES.find((c) => c.slug === slug)?.name ?? slug;
