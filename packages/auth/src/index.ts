export {
  getPlatformPublicConfig,
  requirePlatformPublicConfig,
  getPlatformServiceRoleKey,
} from "./env.js";

export {
  isPlatformConfigured,
  getPlatformClient,
  getPlatformSession,
  ensureFreshPlatformSession,
  getPlatformAccessToken,
  getPlatformUser,
  signInWithPassword,
  signOut,
  setPlatformSession,
  listAllowedToolIds,
  listUserGroups,
  assertToolAccess,
  authFetch,
  hubLoginUrl,
  startToolHandoff,
  exchangeHandoffCode,
  ADMIN_GROUP_SLUG,
  PLATFORM_TOOL_IDS,
  isAdminFromGroups,
  isPlatformToolId,
} from "./client.js";

export type { PlatformGroup, PlatformToolId } from "./client.js";

export {
  AuthError,
  createPlatformAnonServerClient,
  createPlatformServiceClient,
  extractBearerToken,
  verifyPlatformAccessToken,
  verifyPlatformRequest,
  listAllowedToolIdsForUser,
  assertUserHasToolAccess,
  requireToolAccessFromRequest,
  createHandoffCode,
  redeemHandoffCode,
} from "./server.js";

export type { VerifiedPlatformUser } from "./server.js";

export {
  withToolAuth,
  requireToolAuthFromWebRequest,
} from "./protectApi.js";
