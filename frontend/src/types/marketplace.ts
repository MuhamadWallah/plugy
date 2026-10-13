export type JobStatus = 'open' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
export type PaymentMethod = 'cash' | 'mobile_money' | 'bank_transfer';
export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'not_selected' | 'withdrawn';

export interface PersonSummary {
  id: string;
  name: string;
  avatar_url: string | null;
  rating_avg: string | number;
  rating_count: number;
  phone_verified?: boolean;
  id_verified?: boolean;
  /** Only present for the other party once a worker is hired */
  phone?: string | null;
}

export interface MyOfferSummary {
  id: string;
  price: string | number;
  status: OfferStatus;
  eta_minutes: number | null;
  message?: string | null;
}

export interface JobRating {
  id: string;
  rater_id: string;
  ratee_id: string;
  score: number;
  comment: string | null;
  created_at: string;
  rater?: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
}

export interface Job {
  id: string;
  poster_id: string;
  worker_id: string | null;
  category_slug: string;
  category_name: string;
  category_icon?: string;
  title: string;
  description: string;
  location_text: string;
  latitude: number | null;
  longitude: number | null;
  location_precision?: 'exact' | 'approximate';
  budget: string | number | null;
  agreed_price?: string | number | null;
  /** Requested time; null = as soon as possible */
  scheduled_for?: string | null;
  payment_method?: PaymentMethod;
  status: JobStatus;
  created_at: string;
  accepted_at?: string | null;
  en_route_at?: string | null;
  arrived_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  updated_at?: string;
  poster: PersonSummary;
  worker: PersonSummary | null;
  /** Poster only: number of pending offers */
  offer_count?: number;
  /** Feed only, when the viewer shared a location */
  distance_km?: number | null;
  /** Signed-in worker's own offer on this job */
  my_offer?: MyOfferSummary | null;
  ratings?: JobRating[];
  photos?: JobPhoto[];
}

export interface JobPhoto {
  id: string;
  url: string;
  width: number;
  height: number;
}

export interface OfferWorker {
  id: string;
  name: string;
  avatar_url: string | null;
  rating_avg: string | number;
  rating_count: number;
  phone_verified: boolean;
  id_verified?: boolean;
  member_since: string;
  jobs_completed: number;
}

export interface Offer {
  id: string;
  job_id: string;
  worker_id: string;
  price: string | number;
  message: string | null;
  eta_minutes: number | null;
  status: OfferStatus;
  created_at: string;
  updated_at: string;
  worker: OfferWorker;
}
