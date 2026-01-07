import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  KYG_API_BASE_URL: z.string().pipe(z.url()),
  OPENAI_API_KEY: z.string().min(1),
  ENCRYPTION_KEY: z.string().refine(
    (val) => Buffer.byteLength(val, "utf8") >= 32,
    { message: "ENCRYPTION_KEY must be at least 32 bytes long" }
  ),
  API_BASE_URL: z.string().pipe(z.url()).optional(),
  BEARER_TOKEN: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment variables: ${parsed.error.message}`);
}

export const ENV = parsed.data;
