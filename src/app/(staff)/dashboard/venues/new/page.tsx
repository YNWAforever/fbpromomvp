import { requireStaff } from "@/lib/auth/require-staff";
import VenueOnboarding from "./venue-onboarding";

export default async function NewVenuePage() {
  await requireStaff();
  return <VenueOnboarding />;
}