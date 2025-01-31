import { PrismaClient, UserPlan } from "@prisma/client";

import { HOSTED_CAL_FEATURES } from "@calcom/lib/constants";
import { isTeamAdmin } from "@calcom/lib/server/queries/teams";
import { TRPCError } from "@calcom/trpc/server";

export const samlDatabaseUrl = process.env.SAML_DATABASE_URL || "";
export const isSAMLLoginEnabled = samlDatabaseUrl.length > 0;

export const samlTenantID = "Cal.com";
export const samlProductID = "Cal.com";
export const samlAudience = "https://saml.cal.com";
export const samlPath = "/api/auth/saml/callback";

export const hostedCal = Boolean(HOSTED_CAL_FEATURES);
export const tenantPrefix = "team-";

const samlAdmins = (process.env.SAML_ADMINS || "").split(",");

export const isSAMLAdmin = (email: string) => {
  for (const admin of samlAdmins) {
    if (admin.toLowerCase() === email.toLowerCase() && admin.toUpperCase() === email.toUpperCase()) {
      return true;
    }
  }

  return false;
};

export const samlTenantProduct = async (prisma: PrismaClient, email: string) => {
  const user = await prisma.user.findUnique({
    where: {
      email,
    },
    select: {
      id: true,
      invitedTo: true,
    },
  });

  if (!user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Unauthorized Request",
    });
  }

  if (!user.invitedTo) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Could not find a SAML Identity Provider for your email. Please contact your admin to ensure you have been given access to Cal",
    });
  }

  return {
    tenant: tenantPrefix + user.invitedTo,
    product: samlProductID,
  };
};

export const canAccess = async (
  user: { id: number; plan: UserPlan; email: string },
  teamId: number | null
) => {
  const { id: userId, plan, email } = user;

  if (!isSAMLLoginEnabled) {
    return {
      message: "To enable this feature, add value for `SAML_DATABASE_URL` and `SAML_ADMINS` to your `.env`",
      access: false,
    };
  }

  // Hosted
  if (HOSTED_CAL_FEATURES) {
    if (teamId === null || !(await isTeamAdmin(userId, teamId))) {
      return {
        message: "dont_have_permission",
        access: false,
      };
    }

    if (plan != UserPlan.PRO) {
      return {
        message: "app_upgrade_description",
        access: false,
      };
    }
  }

  // Self-hosted
  if (!HOSTED_CAL_FEATURES) {
    if (!isSAMLAdmin(email)) {
      return {
        message: "dont_have_permission",
        access: false,
      };
    }
  }

  return {
    message: "success",
    access: true,
  };
};
