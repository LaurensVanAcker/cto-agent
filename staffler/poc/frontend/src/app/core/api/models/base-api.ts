export class BaseApi {
  protected mapParamsToString(obj: Record<string, any>): Record<string, string> {
    return Object.entries(obj).reduce(
      (params, [key, value]) =>
        value
          ? {
              ...params,
              [key]: value.toString(),
            }
          : params,
      {}
    );
  }

  protected mapBodyEmptyStringToNull(obj: Record<string, any>): Record<string, any> {
    return Object.keys(obj).reduce((mappedObj, key) => {
      const value = obj[key];

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return {
          ...mappedObj,
          [key]: { ...this.mapBodyEmptyStringToNull(value) },
        };
      }

      return {
        ...mappedObj,
        [key]: typeof value === 'string' && !value.trim().length ? null : value,
      };
    }, {});
  }
}
