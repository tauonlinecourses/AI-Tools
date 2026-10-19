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
  PLATFORM_TOOL_IDS,
  isAdminFromGroups,
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
  assertUserIsAdmin,
  assertUserIsApproved,
  requireToolAccessFromRequest,
  withPlatformAuth,
  createHandoffCode,
  redeemHandoffCode,
} from "./server.js";

export type { VerifiedPlatformUser } from "./server.js";
