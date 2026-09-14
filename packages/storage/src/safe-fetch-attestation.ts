import { isS3ConditionalQuarantineSink, S3ConditionalQuarantineSink } from "./s3-conditional-quarantine-sink.js";

export { isS3ConditionalQuarantineSink };

export function createS3ConditionalQuarantineSink(
  options: ConstructorParameters<typeof S3ConditionalQuarantineSink>[0],
): S3ConditionalQuarantineSink {
  return new S3ConditionalQuarantineSink(options);
}
