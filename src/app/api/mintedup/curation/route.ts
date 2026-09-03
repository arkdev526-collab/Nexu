import { requireRole } from "@/mintedup/auth";
import {
  approveListing,
  createAuction,
  curationQueue,
  rejectListing,
  requestChanges,
} from "@/mintedup/curation";
import { fail, ok, str, strArray } from "@/mintedup/http";

export async function GET() {
  try {
    await requireRole("curator");
    return ok({ queue: await curationQueue() });
  } catch (error) {
    return fail(error);
  }
}

/** Curator decisions and sale scheduling, behind the curator role. */
export async function POST(request: Request) {
  try {
    const curator = await requireRole("curator");
    const body = await request.json();
    const action = str(body.action);

    switch (action) {
      case "approve":
        return ok({
          listing: await approveListing({
            listingId: str(body.listingId),
            curatorId: curator.id,
            notes: str(body.notes),
            auctionId: body.auctionId ? str(body.auctionId) : null,
          }),
        });
      case "changes":
        return ok({
          listing: await requestChanges({
            listingId: str(body.listingId),
            curatorId: curator.id,
            notes: str(body.notes),
            changes: strArray(body.changes),
          }),
        });
      case "reject":
        return ok({
          listing: await rejectListing({
            listingId: str(body.listingId),
            curatorId: curator.id,
            notes: str(body.notes),
          }),
        });
      case "create-auction":
        return ok(
          {
            auction: await createAuction({
              title: str(body.title),
              strapline: str(body.strapline),
              description: str(body.description),
              categoryIds: strArray(body.categoryIds),
              opensAt: str(body.opensAt),
              closesAt: str(body.closesAt),
              curatorId: curator.id,
            }),
          },
          201,
        );
      default:
        return ok({ error: "Unknown curation action." }, 400);
    }
  } catch (error) {
    return fail(error);
  }
}
