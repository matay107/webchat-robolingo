import { z } from "zod";

/** LINE user IDs are `U` followed by 32 lowercase hex characters. */
export const lineUserIdSchema = z.string().regex(/^U[0-9a-f]{32}$/);
