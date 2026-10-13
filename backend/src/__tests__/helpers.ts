import request from 'supertest';
import type { Express } from 'express';

/**
 * Hires a worker the way the app does: the worker sends an offer at the posted price
 * (or `price`), then the poster accepts it. Returns the accept response.
 */
export const hireWorker = async (
  app: Express,
  jobId: string,
  posterCookie: string,
  workerCookie: string,
  price = 50
) => {
  const offerRes = await request(app)
    .post(`/api/jobs/${jobId}/offers`)
    .set('Cookie', workerCookie)
    .send({ price });
  if (offerRes.status !== 201 && offerRes.status !== 200) {
    throw new Error(`Offer failed (${offerRes.status}): ${JSON.stringify(offerRes.body)}`);
  }

  return request(app)
    .post(`/api/jobs/${jobId}/offers/${offerRes.body.offer.id}/accept`)
    .set('Cookie', posterCookie);
};
