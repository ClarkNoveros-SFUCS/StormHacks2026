import { socialRoute } from "@/lib/social/http";
import { myProfile, updateProfile } from "@/lib/social/profile";

/** The signed-in Player's own Profile, with the editable fields. → { profile: MyProfile } */
export async function GET() {
  return socialRoute(async (playerId) => ({ profile: await myProfile(playerId) }));
}

/**
 * Body: ProfilePatch ({ username?, displayName?, avatar?, usePhoto?, bio?, banner? }).
 * → { profile: MyProfile }; 400 on a bad field, 409 if the username is taken.
 */
export async function PATCH(req: Request) {
  const body: unknown = await req.json().catch(() => undefined);
  return socialRoute(async (playerId) => ({ profile: await updateProfile(playerId, body) }));
}
