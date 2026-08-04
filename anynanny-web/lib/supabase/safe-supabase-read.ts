type SupabaseResult<T = unknown> = {
  data: T | null;
  error: unknown;
};

type SupabaseThenable<T = unknown> = {
  then<TResult1 = SupabaseResult<T>, TResult2 = never>(
    onfulfilled?:
      | ((value: SupabaseResult<T>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
  ): PromiseLike<TResult1 | TResult2>;
};

type SupabaseAsyncLike<T = unknown> =
  | SupabaseThenable<T>
  | (() => SupabaseThenable<T>);

export function safeSupabaseRead<T = unknown>(
  result: SupabaseResult<T> | null | undefined,
  label: string
): { data: T | null; error: string | null; schemaDrift: boolean } {
  if (!result) {
    return {
      data: null,
      error: `[${label}] No response returned`,
      schemaDrift: false
    };
  }

  const error = result.error;

  if (error) {
    const errorMsg =
      typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error);

    const schemaDrift =
      /column|schema cache|could not find|relation|does not exist/i.test(
        errorMsg
      );

    return {
      data: result.data ?? null,
      error: errorMsg,
      schemaDrift
    };
  }

  return {
    data: result.data ?? null,
    error: null,
    schemaDrift: false
  };
}

export async function safeSupabaseReadAsync<T = unknown>(
  source: SupabaseAsyncLike<T>,
  label: string
): Promise<{
  data: T | null;
  error: string | null;
  schemaDrift: boolean;
}> {
  try {
    const result =
      typeof source === "function"
        ? await source()
        : await source;

    return safeSupabaseRead(result, label);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    return {
      data: null,
      error: message,
      schemaDrift: false
    };
  }
}