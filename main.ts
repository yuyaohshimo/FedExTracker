import * as fs from 'fs';

import axios from 'axios';
import chunk from 'lodash.chunk';
import 'dotenv/config';
import { z } from 'zod';

const TrackingSchema = z.object({
  trackingNumber: z.string(),
  trackResults: z.array(
    z.object({
      latestStatusDetail: z
        .object({
          code: z.string(),
          derivedCode: z.string(),
          statusByLocale: z.string(),
          description: z.string(),
        })
        .optional(),
      dateAndTimes: z
        .array(
          z.object({
            type: z.string(),
            dateTime: z.string(),
          }),
        )
        .optional(),
      scanEvents: z
        .array(
          z.object({
            date: z.string(),
            eventType: z.string(),
            derivedStatusCode: z.string(),
          }),
        )
        .optional(),
      standardTransitTimeWindow: z
        .object({
          window: z.object({
            ends: z.string().optional(),
          }),
        })
        .optional(),
      serviceDetail: z
        .object({
          type: z.string(),
          description: z.string(),
          shortDescription: z.string(),
        })
        .optional(),
      packageDetails: z
        .object({
          packagingDescription: z.object({
            type: z.string(),
            description: z.string(),
          }),
          physicalPackagingType: z.string(),
          sequenceNumber: z.string(),
          count: z.string(),
          weightAndDimensions: z.object({
            weight: z.array(
              z.object({
                value: z.string(),
                unit: z.string(),
              }),
            ),
            dimensions: z
              .array(
                z.object({
                  length: z.number(),
                  width: z.number(),
                  height: z.number(),
                  units: z.string(),
                }),
              )
              .optional(),
          }),
        })
        .optional(),
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

const outputSchema = z.object({
  trackingNumber: z.string(),
  trackingStatus: z.string(),
  shipDate: z.string(),
  standardTransitDate: z.string(),
  actualDeliveryDate: z.string(),
  delayInDays: z.number(),
  serviceType: z.string(),
  weightValue: z.string(),
  weightUnit: z.string(),
  dimensionLength: z.number(),
  dimensionWidth: z.number(),
  dimensionHeight: z.number(),
  dimensionUnit: z.string(),
});

type Output = z.infer<typeof outputSchema>;

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
      try {
        return TrackingSchema.parse(trackResult);
      } catch (e) {
        console.log('error parsing tracking', trackResult);
        console.error(e);
        throw e;
      }
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

  let output: { [trackingNumber: string]: Output } = {};

  for (const trackingNumber of Object.keys(trackings)) {
    const tracking = trackings[trackingNumber].trackResults[0];

    const trackingStatus = tracking.latestStatusDetail?.statusByLocale;
    const standardTransitDate = tracking.standardTransitTimeWindow?.window.ends;
    let shipDate = '';
    let actualDeliveryDate = '';
    if (tracking.dateAndTimes) {
      for (const dateAndTime of tracking.dateAndTimes) {
        if (dateAndTime.type === 'ACTUAL_DELIVERY') {
          actualDeliveryDate = dateAndTime.dateTime;
        } else if (dateAndTime.type === 'SHIP') {
          shipDate = dateAndTime.dateTime;
        }
      }
    }
    let delayInDays: number = 0;
    if (actualDeliveryDate && standardTransitDate) {
      delayInDays =
        (new Date(actualDeliveryDate).getTime() -
          new Date(standardTransitDate).getTime()) /
        (24 * 60 * 60 * 1000);
    }
    const serviceType = tracking.serviceDetail?.description;
    const weightValue =
      tracking.packageDetails?.weightAndDimensions.weight[0].value;
    const weightUnit =
      tracking.packageDetails?.weightAndDimensions.weight[0].unit;
    const dimensionLength =
      tracking.packageDetails?.weightAndDimensions.dimensions?.[0].length;
    const dimensionWidth =
      tracking.packageDetails?.weightAndDimensions.dimensions?.[0].width;
    const dimensionHeight =
      tracking.packageDetails?.weightAndDimensions.dimensions?.[0].height;
    const dimensionUnit =
      tracking.packageDetails?.weightAndDimensions.dimensions?.[0].units;

    output[trackingNumber] = {
      trackingNumber,
      trackingStatus: trackingStatus || '',
      shipDate: shipDate || '',
      standardTransitDate: standardTransitDate || '',
      actualDeliveryDate,
      delayInDays,
      serviceType: serviceType || '',
      weightValue: weightValue || '',
      weightUnit: weightUnit || '',
      dimensionLength: dimensionLength || 0,
      dimensionWidth: dimensionWidth || 0,
      dimensionHeight: dimensionHeight || 0,
      dimensionUnit: dimensionUnit || '',
    };
  }

  const header = Object.keys(outputSchema.shape).join(',');
  const outputCSV = trackingNumbers
    .map((trackingNumber) => Object.values(output[trackingNumber]))
    .join('\n');

  fs.writeFileSync('output.csv', `${header}\n${outputCSV}`, 'utf8');
}

main()
  .then(() => console.log('done'))
  .catch(console.error);
