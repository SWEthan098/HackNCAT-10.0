"use client";

import { useState } from "react";

/**
 * Field state with "validate on blur once touched, then on every input" behaviour.
 * `validate` returns an error message or null.
 */
export function useFormField(validate: (value: string) => string | null, initial = "") {
  const [value, setValue] = useState(initial);
  const [touched, setTouched] = useState(false);
  const error = touched ? validate(value) : null;
  return {
    value,
    error,
    setValue,
    /** Mark as touched and return the current error (use on submit). */
    check: () => {
      setTouched(true);
      return validate(value);
    },
    reset: () => {
      setValue(initial);
      setTouched(false);
    },
    inputProps: {
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value),
      onBlur: () => setTouched(true),
    },
  };
}
