export const emptyEnumerableValuesToUndefined = (obj: Record<string, any>): Record<string, any> => {
  for (const key in obj) {
    const value = obj[key];

    if ((typeof value === 'string' || Array.isArray(value)) && !value.length) {
      obj[key] = undefined;
    }
  }

  return obj;
};
