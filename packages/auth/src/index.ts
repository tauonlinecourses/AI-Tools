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
  getMyAccountStatus,
  updatePlatformPassword,
  resetPlatformPasswordForEmail,
  verifyPlatformPassword,
  assertToolAccess,
  ToolAccessDeniedError,
  isToolAccessDeniedError,
  authFetch,
  hubOrigin,
  hubHomeUrl,
  hubLoginUrl,
  startToolHandoff,
  exchangeHandoffCode,
  ADMIN_GROUP_SLUG,
  ADMIN_GROUP_SLUG_LEGACY,
  ADMIN_GROUP_SLUGS,
  PLATFORM_TOOL_IDS,
  isAdminFromGroups,
  isAdminGroupSlug,
  isPlatformToolId,
} from "./client.js";

export type { AccountStatus, PlatformGroup, PlatformToolId } from "./client.js";

export {
  AuthError,
  createPlatformAnonServerClient,
  createPlatformServiceClient,
  extractBearerToken,
  verifyPlatformAccessToken,
  verifyPlatformRequest,
  listAllowedToolIdsForUser,
  assertUserHasToolAccess,
  assertUserIsApproved,
  requireToolAccessFromRequest,
  createHandoffCode,
  redeemHandoffCode,
} from "./server.js";

export type { VerifiedPlatformUser } from "./server.js";

export {
  withToolAuth,
  requireToolAuthFromWebRequest,
} from "./protectApi.js";
