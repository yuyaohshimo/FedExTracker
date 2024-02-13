import * as fs from 'fs';

import axios from 'axios';
import chunk from 'lodash.chunk';
import 'dotenv/config';
import { z } from 'zod';

const TrackingSchema = z.object({
  trackingNumber: z.string(),
  trackResults: z.array(
    z.object({
      latestStatusDetail: z.object({
        code: z.string(),
        derivedCode: z.string(),
        statusByLocale: z.string(),
        description: z.string(),
      }),
      dateAndTimes: z.array(
        z.object({
          type: z.string(),
          dateTime: z.string(),
        }),
      ),
      scanEvents: z.array(
        z.object({
          date: z.string(),
          eventType: z.string(),
          derivedStatusCode: z.string(),
        }),
      ),
      standardTransitTimeWindow: z.object({
        window: z.object({
          ends: z.string(),
        }),
      }),
      error: z
        .object({
          code: z.string(),
          message: z.string(),
        })
        .optional(),
    }),
  ),
});

type Tracking = z.infer<typeof TrackingSchema>;

export async function getTrackings(trackingNumbers: string[]) {
  const getAuth = await axios<{
    access_token: string;
  }>({
    url: 'https://apis.fedex.com/oauth/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    data: {
      grant_type: 'client_credentials',
      client_id: process.env.FEDEX_CLIENT_ID,
      client_secret: process.env.FEDEX_CLIENT_SECRET,
    },
  });

  async function getTracking(trackingNumbers: string[]) {
    const res = await axios<{
      output: {
        completeTrackResults: Tracking[];
      };
    }>({
      url: 'https://apis.fedex.com/track/v1/trackingnumbers',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getAuth.data.access_token}`,
        'Content-Type': 'application/json',
      },
      data: {
        trackingInfo: trackingNumbers.map((trackingNumber) => {
          return {
            trackingNumberInfo: {
              trackingNumber,
            },
          };
        }),
        includeDetailedScans: true,
      },
    });

    return res.data.output.completeTrackResults.map((trackResult) => {
      return TrackingSchema.parse(trackResult);
    });
  }

  let trackings: { [trackingNumber: string]: Tracking } = {};
  for (const chunkedTrackingNumbers of chunk(trackingNumbers, 30)) {
    const chunkedTrackings = await getTracking(chunkedTrackingNumbers);
    trackings = {
      ...trackings,
      ...chunkedTrackings.reduce(
        (acc: { [trackingNumber: string]: Tracking }, tracking) => {
          acc[tracking.trackingNumber] = tracking;
          return acc;
        },
        {},
      ),
    };
  }

  return trackings;
}

async function main() {
  const trackingNumbers = fs.readFileSync('input.csv', 'utf8').split('\n');

  const trackings = await getTrackings(trackingNumbers);

  for (const trackingNumber of Object.keys(trackings)) {
    const tracking = trackings[trackingNumber];

    console.log(
      `${trackingNumber},${tracking.trackResults[0].latestStatusDetail.statusByLocale}`,
    );
  }
}

main()
  .then(() => console.log('done'))
  .catch(console.error);
