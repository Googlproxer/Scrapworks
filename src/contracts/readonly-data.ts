/** Deeply readonly plain presentation data. Editable captures use their own mutable types. */
export type ReadonlyData<T> = T extends readonly (infer U)[]
  ? readonly ReadonlyData<U>[]
  : T extends object
    ? { readonly [K in keyof T]: ReadonlyData<T[K]> }
    : T;

/** Detached captures are editable data, unlike published presentation views. */
export type EditableData<T> = T extends object
  ? { -readonly [K in keyof T]: EditableData<T[K]> }
  : T;
