import { requireUser } from "@/mintedup/auth";
import { isValidCategory } from "@/mintedup/categories";
import { fail, num, ok, str, strArray } from "@/mintedup/http";
import { ListingError, updateListing } from "@/mintedup/listings";
import { mutate, read } from "@/mintedup/store";
import type { ConditionGrade, ListingAttributes } from "@/mintedup/types";

type Params = { params: Promise<{ id: string }> };

const GRADES: ConditionGrade[] = [
  "mint", "excellent", "very-good", "good", "fair", "restoration-project",
];

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const listing = await read((db) => db.listings.find((l) => l.id === id) ?? null);
    if (!listing) throw new ListingError("Listing not found.", 404);
    return ok({ listing });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const body = await request.json();

    if (body.categoryId !== undefined && !isValidCategory(str(body.categoryId))) {
      throw new ListingError("Choose a category from the Minted Up taxonomy.", 400);
    }

    const attributes: Partial<ListingAttributes> | undefined = body.attributes
      ? {
          maker: str(body.attributes.maker),
          period: str(body.attributes.period),
          origin: str(body.attributes.origin),
          materials: strArray(body.attributes.materials),
          marks: str(body.attributes.marks),
          condition: str(body.attributes.condition),
          conditionGrade: GRADES.includes(body.attributes.conditionGrade)
            ? (body.attributes.conditionGrade as ConditionGrade)
            : "very-good",
          provenance: str(body.attributes.provenance),
          dimensions: str(body.attributes.dimensions),
          signed: Boolean(body.attributes.signed),
          restored: Boolean(body.attributes.restored),
        }
      : undefined;

    const listing = await updateListing(id, user.id, {
      ...(body.title !== undefined && { title: str(body.title).slice(0, 140) }),
      ...(body.subtitle !== undefined && { subtitle: str(body.subtitle).slice(0, 160) }),
      ...(body.description !== undefined && { description: str(body.description).slice(0, 8000) }),
      ...(body.categoryId !== undefined && { categoryId: str(body.categoryId) }),
      ...(body.format !== undefined && { format: body.format === "bid" ? "bid" : "buy" }),
      ...(body.price !== undefined && { price: Math.max(0, Math.round(num(body.price))) }),
      ...(body.startingBid !== undefined && {
        startingBid: Math.max(0, Math.round(num(body.startingBid))),
      }),
      ...(body.reserve !== undefined && { reserve: Math.max(0, Math.round(num(body.reserve))) }),
      ...(body.endsAt !== undefined && { endsAt: body.endsAt ? str(body.endsAt) : null }),
      ...(body.researchSessionId !== undefined && {
        researchSessionId: body.researchSessionId ? str(body.researchSessionId) : null,
      }),
      ...(body.autofilledFrom !== undefined && {
        autofilledFrom: body.autofilledFrom ? str(body.autofilledFrom) : null,
      }),
      ...(attributes && { attributes: attributes as ListingAttributes }),
      ...(body.seo && {
        seo: {
          metaTitle: str(body.seo.metaTitle).slice(0, 120),
          metaDescription: str(body.seo.metaDescription).slice(0, 400),
          keywords: strArray(body.seo.keywords).slice(0, 20),
          aiAssistedFields: strArray(body.seo.aiAssistedFields).slice(0, 20),
        },
      }),
      ...(body.shipping && {
        shipping: {
          domestic: Math.max(0, Math.round(num(body.shipping.domestic))),
          international: Math.max(0, Math.round(num(body.shipping.international))),
          collectionOnly: Boolean(body.shipping.collectionOnly),
        },
      }),
    });

    return ok({ listing });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUser();
    await mutate((db) => {
      const listing = db.listings.find((l) => l.id === id);
      if (!listing) throw new ListingError("Listing not found.", 404);
      if (listing.sellerId !== user.id && user.role !== "admin") {
        throw new ListingError("That is not your listing.", 403);
      }
      // Soft delete: sold listings are the market record the research engine learns from.
      listing.status = "removed";
      listing.updatedAt = new Date().toISOString();
    });
    return ok({ removed: true });
  } catch (error) {
    return fail(error);
  }
}
