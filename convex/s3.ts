import { S3Client } from "@aws-sdk/client-s3";

export const BUCKET_NAME = process.env.RAILWAY_BUCKET_NAME || "videos";

function getBasePublicUrl(): string {
  const baseUrl = process.env.RAILWAY_PUBLIC_URL || process.env.RAILWAY_ENDPOINT;
  if (!baseUrl) {
    throw new Error("Missing RAILWAY_PUBLIC_URL or RAILWAY_ENDPOINT for bucket URLs");
  }
  return baseUrl;
}

export function buildPublicUrl(key: string): string {
  const includeBucket = process.env.RAILWAY_PUBLIC_URL_INCLUDE_BUCKET !== "false";
  const url = new URL(getBasePublicUrl());
  const basePath = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
  const objectPath = includeBucket ? `${BUCKET_NAME}/${key}` : key;
  url.pathname = `${basePath}/${objectPath}`;
  return url.toString();
}

let _s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (_s3Client) {
    return _s3Client;
  }

  const accessKeyId = process.env.RAILWAY_ACCESS_KEY_ID;
  const secretAccessKey = process.env.RAILWAY_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Missing S3 credentials");
  }

  _s3Client = new S3Client({
    region: process.env.RAILWAY_REGION || "us-east-1",
    endpoint: process.env.RAILWAY_ENDPOINT,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true,
    // Presigned uploads do not know the browser body when signing.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return _s3Client;
}
