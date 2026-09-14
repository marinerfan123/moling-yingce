import { z } from "zod";

export const MoneyMicrosSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/, "money micros must be a non-negative base-10 integer string");

export type MoneyMicros = z.infer<typeof MoneyMicrosSchema>;
