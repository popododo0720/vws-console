export const isInstanceId = (id: unknown): id is string => typeof id === "string" && /^i-[0-9a-f]{8,17}$/.test(id);
