// Minimal declarations for the external libraries used by acme-shop.
declare namespace JSX {
  type Element = any;
  interface IntrinsicElements {
    [tag: string]: any;
  }
  interface ElementChildrenAttribute {
    children: {};
  }
}
declare module "react" {
  export function useState<S>(initial?: S): [S, (value: S) => void];
}
declare module "react-router" {
  export function useParams(): Record<string, string>;
}
declare module "@tanstack/react-query" {
  export function useQuery(key: unknown[], fn: () => Promise<any>): any;
}
declare module "fastify" {
  export interface FastifyRequest {
    params: any;
    body: any;
    headers: Record<string, string>;
    user?: { id: string };
  }
  export interface FastifyInstance {
    get(path: string, ...args: any[]): void;
    post(path: string, ...args: any[]): void;
  }
}
declare module "stripe-sdk" {
  export const stripe: { charges: { create(args: any): Promise<any> } };
}
declare module "drizzle-orm" {
  export function eq(column: any, value: unknown): any;
}
declare module "drizzle-orm/node-postgres" {
  export const db: any;
}
declare module "drizzle-orm/pg-core" {
  export function pgTable(name: string, columns: Record<string, any>): any;
  export function text(name: string): any;
  export function integer(name: string): any;
  export function timestamp(name: string): any;
}
declare module "vitest" {
  export const describe: any;
  export const it: any;
  export const expect: any;
}
