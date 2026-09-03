import { requireUser } from "@/mintedup/auth";
import { submitForCuration } from "@/mintedup/curation";
import { fail, ok } from "@/mintedup/http";
import { ListingError, validateForSubmission } from "@/mintedup/listings";
import { read } from "@/mintedup/store";

/**
 * Send a lot to the curation desk. Nothing on Minted Up publishes itself — a
 * curator reads every lot before it reaches the catalogue.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();

    const listing = await read((db) => db.listings.find((l) => l.id === id) ?? null);
    if (!listing) throw new ListingError("Listing not found.", 404);
    const problems = validateForSubmission(listing);
    if (problems.length) throw new ListingError(problems.join(" "), 422);

    const submitted = await submitForCuration(id, user);
    return ok({ listing: submitted });
  } catch (error) {
    return fail(error);
  }
}
