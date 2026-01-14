/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as addresses from "../addresses.js";
import type * as auth from "../auth.js";
import type * as connections from "../connections.js";
import type * as domains from "../domains.js";
import type * as google_gmail from "../google/gmail.js";
import type * as google_oauth from "../google/oauth.js";
import type * as google_sheets from "../google/sheets.js";
import type * as sheets from "../sheets.js";
import type * as sync from "../sync.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  addresses: typeof addresses;
  auth: typeof auth;
  connections: typeof connections;
  domains: typeof domains;
  "google/gmail": typeof google_gmail;
  "google/oauth": typeof google_oauth;
  "google/sheets": typeof google_sheets;
  sheets: typeof sheets;
  sync: typeof sync;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
