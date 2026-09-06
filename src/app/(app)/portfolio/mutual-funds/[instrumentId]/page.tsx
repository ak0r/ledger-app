import { notFound } from "next/navigation";
import { db } from "@/server/persistence/client";
import { requireActiveProfile } from "@/server/authz";
import { getInstrument } from "@/server/services/instruments";
import { PortfolioSecurityDetail } from "@/components/portfolio-security-detail";

export const dynamic = "force-dynamic";

export default async function MutualFundDetailPage(
  props: PageProps<"/portfolio/mutual-funds/[instrumentId]">,
) {
  const { profile } = await requireActiveProfile();
  const { instrumentId } = await props.params;
  const instrument = getInstrument(db, instrumentId);
  if (!instrument || instrument.type !== "MUTUAL_FUND") notFound();

  return (
    <PortfolioSecurityDetail
      profileId={profile.id}
      instrumentId={instrument.id}
      instrumentName={instrument.name}
      type="MUTUAL_FUND"
    />
  );
}
