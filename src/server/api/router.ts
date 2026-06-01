/**
 * /api/* 라우터 (auth 제외).
 *
 * Returns a Response if the URL matches an api route, else null
 * (caller should fall through to TanStack Start).
 */
import type { Env } from "../auth/env";
import { handleAiFood } from "./ai-food";
import { handleFavorites } from "./favorites";
import { handleFoodLogs } from "./food-logs";
import { handleFoods } from "./foods";
import { handleFeedback } from "./feedback";
import { handleLegalDocuments } from "./legal";
import { handleSubscriptionStatus } from "./subscription-status";
import { handleUserGoals, handleUserGoalsMonth } from "./user-goals";
import { handleUserNotifications } from "./user-notifications";
import { handleUserProfile } from "./user-profile";

export async function handleApi(
  req: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(req.url);
  switch (url.pathname) {
    case "/api/foods":
      return handleFoods(req, env);
    case "/api/food-logs":
      return handleFoodLogs(req, env);
    case "/api/user-goals":
      return handleUserGoals(req, env);
    case "/api/user-goals/month":
      return handleUserGoalsMonth(req, env);
    case "/api/favorites":
      return handleFavorites(req, env);
    case "/api/subscription-status":
      return handleSubscriptionStatus(req, env);
    case "/api/user-profile":
      return handleUserProfile(req, env);
    case "/api/user-notifications":
      return handleUserNotifications(req, env);
    case "/api/ai-food/analyze":
      return handleAiFood(req, env);
    case "/api/feedback":
      return handleFeedback(req, env);
    case "/api/legal/documents":
      return handleLegalDocuments(req, env);
    default:
      return null;
  }
}
