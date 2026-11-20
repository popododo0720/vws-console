declare const routeBrand: unique symbol;

/**
 * A console-api path and the literal template it was built from. Only route() and withQuery() make one,
 * so the template (the span name, `url.template` and the `route` metric label) never holds an ID, a key
 * or a query: those enter only through params, which land on `path`.
 */
export type ApiRoute = {
  readonly [routeBrand]: true;
  readonly template: string;
  readonly path: string;
};

type ParamNames<T extends string> = T extends `${string}{${infer P}}${infer Rest}` ? P | ParamNames<Rest> : never;

type RouteParams<T extends string> = [ParamNames<T>] extends [never] ? [] : [params: Record<ParamNames<T>, string>];

/** A template built at runtime from a variable (`/vpcs/${id}`) is a type error: it could carry an ID. */
type Literal<T extends string> = Record<never, never> extends Record<T, 1> ? never : T;

const TEMPLATE = /^(?:\/(?:[a-z0-9-]+|\{[a-zA-Z]+\}))+$/;

/**
 * route("/vpcs/{id}/delete", { id }) has template "/vpcs/{id}/delete" and path "/vpcs/vpc-1/delete".
 * A string param is encodeURIComponent-ed, so it can never add a segment.
 */
export function route<const T extends `/${string}`>(template: T & Literal<T>, ...params: RouteParams<T>): ApiRoute {
  const literal: string = template;
  if (!TEMPLATE.test(literal)) throw new Error("A console-api route template is lowercase segments and {params}.");
  const values: Record<string, string> = params[0] ?? {};
  const path = literal.replace(/\{([a-zA-Z]+)\}/g, (_, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`The console-api route is missing {${name}}.`);
    return encodeURIComponent(value);
  });
  return { template: literal, path } as ApiRoute;
}

/** The same route with a query on the path only; the template is unchanged. Undefined and empty values are skipped. */
export function withQuery(base: ApiRoute, query: Record<string, string | number | undefined>): ApiRoute {
  const pairs = Object.entries(query)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== "")
    .map(([name, value]) => `${name}=${encodeURIComponent(String(value))}`);
  if (pairs.length === 0) return base;
  return { template: base.template, path: `${base.path}?${pairs.join("&")}` } as ApiRoute;
}
