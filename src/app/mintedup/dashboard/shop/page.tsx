import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, slugify } from "@/mintedup/auth";
import { CATEGORIES } from "@/mintedup/categories";
import { ensureSeeded } from "@/mintedup/seed";
import { mutate } from "@/mintedup/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shop settings" };

async function saveShop(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/mintedup/signin");

  const name = String(formData.get("name") ?? "").trim();
  const requested = slugify(String(formData.get("slug") ?? "")) || user.shop.slug;
  const specialties = CATEGORIES.map((c) => c.id).filter((id) => formData.get(`spec-${id}`) === "on");

  await mutate((db) => {
    const record = db.users.find((u) => u.id === user.id);
    if (!record) return;
    // A slug is a public URL; refuse a collision rather than silently renaming.
    const taken = db.users.some((u) => u.id !== user.id && u.shop.slug === requested);
    record.shop = {
      ...record.shop,
      name: name || record.shop.name,
      slug: taken ? record.shop.slug : requested,
      tagline: String(formData.get("tagline") ?? "").slice(0, 200),
      about: String(formData.get("about") ?? "").slice(0, 2000),
      location: String(formData.get("location") ?? "").slice(0, 120),
      returnsPolicy: String(formData.get("returnsPolicy") ?? "").slice(0, 600),
      shippingPolicy: String(formData.get("shippingPolicy") ?? "").slice(0, 600),
      specialties,
    };
  });

  revalidatePath("/mintedup/dashboard/shop");
  redirect("/mintedup/dashboard");
}

export default async function ShopSettingsPage() {
  await ensureSeeded();
  const user = await currentUser();
  if (!user) redirect("/mintedup/signin");
  const { shop } = user;

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-6 lg:px-8">
      <Link className="mu-sans text-sm text-[var(--mu-muted)]" href="/mintedup/dashboard">
        ← Dashboard
      </Link>
      <h1 className="mu-display mt-4 text-4xl">Shop settings</h1>
      <p className="mu-sans mt-2 text-[var(--mu-muted)]">
        Your shopfront is at <code className="text-[var(--mu-brass)]">/mintedup/shop/{shop.slug}</code>.
      </p>

      <form action={saveShop} className="mu-sans mt-8 space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="mu-label" htmlFor="name">
              Shop name
            </label>
            <input className="mu-input" id="name" name="name" defaultValue={shop.name} />
          </div>
          <div>
            <label className="mu-label" htmlFor="slug">
              Shop address
            </label>
            <input className="mu-input" id="slug" name="slug" defaultValue={shop.slug} />
            <p className="mt-1 text-xs text-[var(--mu-muted)]">
              Letters, numbers and hyphens. If it is taken, the current one is kept.
            </p>
          </div>
        </div>

        <div>
          <label className="mu-label" htmlFor="tagline">
            Tagline
          </label>
          <input className="mu-input" id="tagline" name="tagline" defaultValue={shop.tagline} />
        </div>

        <div>
          <label className="mu-label" htmlFor="about">
            About the shop
          </label>
          <textarea
            className="mu-input min-h-32"
            id="about"
            name="about"
            defaultValue={shop.about}
          />
        </div>

        <div>
          <label className="mu-label" htmlFor="location">
            Location
          </label>
          <input className="mu-input" id="location" name="location" defaultValue={shop.location} />
        </div>

        <fieldset>
          <legend className="mu-label">Specialisms</legend>
          <p className="mb-3 text-xs text-[var(--mu-muted)]">
            Shown on your shopfront and used in your shop&rsquo;s search metadata.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {CATEGORIES.map((category) => (
              <label key={category.id} className="flex items-center gap-2 text-sm text-[var(--mu-muted)]">
                <input
                  type="checkbox"
                  name={`spec-${category.id}`}
                  defaultChecked={shop.specialties.includes(category.id)}
                />
                {category.name}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label className="mu-label" htmlFor="returnsPolicy">
            Returns policy
          </label>
          <textarea
            className="mu-input min-h-20"
            id="returnsPolicy"
            name="returnsPolicy"
            defaultValue={shop.returnsPolicy}
          />
        </div>

        <div>
          <label className="mu-label" htmlFor="shippingPolicy">
            Shipping policy
          </label>
          <textarea
            className="mu-input min-h-20"
            id="shippingPolicy"
            name="shippingPolicy"
            defaultValue={shop.shippingPolicy}
          />
        </div>

        <button className="mu-btn mu-btn-primary" type="submit">
          Save shop
        </button>
      </form>
    </div>
  );
}
