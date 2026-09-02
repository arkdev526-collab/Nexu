import { requireUser } from "@/mintedup/auth";
import { consumeQuota } from "@/mintedup/quota";
import { generateSeo, type SeoField } from "@/mintedup/ai";
import { isValidCategory } from "@/mintedup/categories";
import { fail, num, ok, str, strArray } from "@/mintedup/http";
import { ListingError } from "@/mintedup/listings";

const FIELDS: SeoField[] = [
  "title", "subtitle", "description", "metaTitle", "metaDescription", "keywords",
];

/**
 * Behind the AI SEO button that sits beside each text field in the composer.
 * The client posts the live form state rather than a listing id, so the button
 * works on an unsaved draft.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    // Metered on the free tier, unlimited for shop members.
    const quota = await consumeQuota(user, "aiSeo");
    const body = await request.json();
    const field = str(body.field) as SeoField;
    if (!FIELDS.includes(field)) throw new ListingError("Unknown field.");
    const categoryId = str(body.categoryId);
    if (!isValidCategory(categoryId)) throw new ListingError("Choose a category first.");

    const result = await generateSeo({
      field,
      current: str(body.current).slice(0, 8000),
      title: str(body.title).slice(0, 200),
      categoryId,
      format: body.format === "bid" ? "bid" : "buy",
      price: num(body.price),
      currency: str(body.currency, "GBP"),
      attributes: {
        maker: str(body.attributes?.maker),
        period: str(body.attributes?.period),
        origin: str(body.attributes?.origin),
        materials: strArray(body.attributes?.materials),
        marks: str(body.attributes?.marks),
        condition: str(body.attributes?.condition),
        conditionGrade: body.attributes?.conditionGrade,
        provenance: str(body.attributes?.provenance),
        dimensions: str(body.attributes?.dimensions),
      },
    });

    return ok({ ...result, quota });
  } catch (error) {
    return fail(error);
  }
}
