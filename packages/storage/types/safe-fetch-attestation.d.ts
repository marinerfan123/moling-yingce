import type { S3Client } from "@aws-sdk/client-s3";

export type ProductionSafeFetchOperationContext = Readonly<{ signal: AbortSignal; deadlineAt: number }>;
export type ProductionSafeFetchQuarantineReceipt = Readonly<{
  quarantineKey: string;
  bytes: number;
  sha256: string;
}>;
export interface ProductionS3ConditionalQuarantineSink {
  readonly capability: "conditional-quarantine-v1";
  open(expectedQuarantineKey: string, context: ProductionSafeFetchOperationContext): Promise<void>;
  write(expectedQuarantineKey: string, chunk: Uint8Array, context: ProductionSafeFetchOperationContext): Promise<void>;
  complete(
    expectedQuarantineKey: string,
    accepted: {
      url: string;
      pinnedIp: string;
      tlsServerName: string;
      bytes: number;
      sha256: string;
    },
    context: ProductionSafeFetchOperationContext,
  ): Promise<ProductionSafeFetchQuarantineReceipt>;
  abort(expectedQuarantineKey: string, reason: string, context: ProductionSafeFetchOperationContext): Promise<void>;
}
export declare function createS3ConditionalQuarantineSink(
  options: Readonly<{
    client: S3Client;
    bucket: string;
    expectedBucketOwner?: string;
    partSize?: number;
    now?: () => number;
  }>,
): ProductionS3ConditionalQuarantineSink;
export declare function isS3ConditionalQuarantineSink(value: unknown): value is ProductionS3ConditionalQuarantineSink;
