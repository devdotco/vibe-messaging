import { z, ZodSchema } from 'zod';
import { NextResponse } from 'next/server';

export function validate<T>(
  schema: ZodSchema<T>,
  data: unknown,
): { success: true; data: T } | { success: false; response: NextResponse } {
  const result = schema.safeParse(data);
  if (!result.success) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Validation error', details: result.error.flatten() },
        { status: 400 },
      ),
    };
  }
  return { success: true, data: result.data };
}

export { z };
