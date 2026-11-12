/** The names console-api takes in X-Vws-Region. */
export const REGION_NAME = /^[a-z0-9-]{1,63}$/;

export const isRegionName = (value: string): boolean => REGION_NAME.test(value);
